'use client';

import { useVaseStore } from '@/store/vase-store';
import { useMeshStatsStore } from '@/store/mesh-stats-store';
import { APPEARANCE, RESOLUTION, PRINT_CHECK } from '@/config/shape-params';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { GROUP_COLORS, UI_MUTED } from '@/config/colors';
import type { FilamentType } from '@/engine/types';
import { SliderRow, Section, GroupHeader, Toggle } from './ui';

/** Right-aligned label/value row for the Print Check stats */
function StatRow({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-sm text-[var(--text-secondary)]" title={tooltip}>{label}</span>
      <span className="text-sm text-[var(--text-primary)] tabular-nums">{value}</span>
    </div>
  );
}

export function SettingsControls() {
  const params = useVaseStore((s) => s.params);
  const { setColor, setShowRulers, setResolution, setFlatShading, setPrintCheck } = useVaseStore();
  const stats = useMeshStatsStore((s) => s.stats);

  const printCheck = params.printCheck ?? DEFAULT_PARAMETERS.printCheck;
  const filament = PRINT_CHECK.filaments[printCheck.material] ?? PRINT_CHECK.filaments.pla;
  const hasShell = params.wallThickness > 0;
  const volumeCm3 = stats ? stats.volumeMm3 / 1000 : 0;
  const weightG = volumeCm3 * filament.density;
  // spool length of 1.75mm filament holding the same volume of plastic
  const filamentAreaMm2 = Math.PI * (PRINT_CHECK.filamentDiameter / 2) ** 2;
  const filamentM = stats ? stats.volumeMm3 / filamentAreaMm2 / 1000 : 0;

  const printCheckActive =
    printCheck.showOverhangs !== DEFAULT_PARAMETERS.printCheck.showOverhangs ||
    printCheck.overhangAngle !== DEFAULT_PARAMETERS.printCheck.overhangAngle ||
    printCheck.material !== DEFAULT_PARAMETERS.printCheck.material;

  return (
    <>
      <GroupHeader label="Settings" color={GROUP_COLORS.settings} />

      <Section title="Appearance" active={params.color !== APPEARANCE.defaultColor || params.showRulers || params.flatShading} tooltip="Visual settings for the 3D preview" titleColor={GROUP_COLORS.settings}>
        {(params.color !== APPEARANCE.defaultColor || params.showRulers || params.flatShading) && (
          <div className="flex justify-end mb-1">
            <button onClick={() => { setColor(APPEARANCE.defaultColor); setShowRulers(false); setFlatShading(false); }} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
          </div>
        )}
        <div className="flex items-center gap-3 mb-2">
          <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title="Preview color for the 3D model">Color</label>
          <input
            type="color"
            value={params.color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-[var(--border-color)] bg-transparent p-0"
          />
        </div>
        <Toggle label="Show Rulers" checked={params.showRulers ?? false} onChange={setShowRulers} tooltip="Display axis lines and dimension markers (mm) in the 3D view" />
        {/* Was "Show Facets" in Resolution until 2026-07-30. Same param — it
            reads as an appearance choice and matches the Mold/Handle tabs,
            where it lives with the other view toggles. */}
        <Toggle label="Flat Shading" checked={params.flatShading} onChange={setFlatShading} tooltip="Per-face normals instead of smoothed ones — shows the actual polygon facets the STL will contain, and gives sharp edges a crease instead of a rounded highlight" />
      </Section>

      <Section title="Print Check" defaultOpen={false} active={printCheckActive} tooltip="Material estimates and overhang warnings for 3D printing" titleColor={GROUP_COLORS.settings}>
        {printCheckActive && (
          <div className="flex justify-end mb-1">
            <button onClick={() => setPrintCheck({ ...DEFAULT_PARAMETERS.printCheck })} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
          </div>
        )}
        {stats && (
          <StatRow
            label="Size"
            value={`${stats.sizeX.toFixed(1)} × ${stats.sizeY.toFixed(1)} × ${stats.sizeZ.toFixed(1)} mm`}
            tooltip="Bounding box of the mesh (width × depth × height)"
          />
        )}
        {stats && hasShell ? (
          <>
            <StatRow label="Plastic" value={`${volumeCm3.toFixed(1)} cm³`} tooltip="Solid volume of the printed part (walls + base), from the mesh" />
            <StatRow label="Weight" value={`≈ ${weightG.toFixed(weightG < 10 ? 1 : 0)} g`} tooltip={`Volume × ${filament.label} density (${filament.density} g/cm³). Slicer settings will vary the real number slightly.`} />
            <StatRow label="Filament" value={`≈ ${filamentM.toFixed(2)} m`} tooltip="Length of 1.75 mm filament containing this much plastic" />
            <div className="flex items-center gap-3 mb-2 mt-1">
              <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title="Filament material — sets the density used for the weight estimate">Material</label>
              <select
                value={printCheck.material}
                onChange={(e) => setPrintCheck({ material: e.target.value as FilamentType })}
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-sm min-w-0"
                style={{ color: UI_MUTED }}
              >
                {(Object.keys(PRINT_CHECK.filaments) as FilamentType[]).map((key) => (
                  <option key={key} value={key}>
                    {PRINT_CHECK.filaments[key].label} ({PRINT_CHECK.filaments[key].density} g/cm³)
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="text-xs text-[var(--text-secondary)] mb-2 opacity-60">
            Set Wall &gt; 0 in the Shell section to get plastic volume and weight estimates.
          </div>
        )}
        <Toggle
          label="Overhangs"
          checked={printCheck.showOverhangs}
          onChange={(v) => setPrintCheck({ showOverhangs: v })}
          tooltip="Highlight surfaces that lean out past the angle below in red — these may droop or need support when printed"
        />
        {printCheck.showOverhangs && (
          <>
            <SliderRow
              label="Max Angle"
              value={printCheck.overhangAngle}
              {...PRINT_CHECK.overhangAngle}
              suffix="°"
              onChange={(v) => setPrintCheck({ overhangAngle: v })}
              tooltip="Overhang angle from vertical your printer can handle — 45° is a common limit, well-tuned printers manage 60°+"
            />
            <div className="text-xs text-[var(--text-secondary)] mb-2 opacity-60">
              Red areas lean out more than {printCheck.overhangAngle}° from vertical and may droop or need
              support. The bottom layer sits on the build plate and is not flagged.
            </div>
          </>
        )}
      </Section>

      <Section title="Resolution" defaultOpen={false} tooltip="Mesh density — higher values show finer detail but create larger files" titleColor={GROUP_COLORS.settings} active={
        params.resolution.vertical !== RESOLUTION.defaults.vertical ||
        params.resolution.radial !== RESOLUTION.defaults.radial
      }>
        <div className="flex justify-end mb-1">
          <button onClick={() => setResolution({ ...RESOLUTION.defaults })} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Vertical" value={params.resolution.vertical} {...RESOLUTION.vertical} onChange={(v) => setResolution({ vertical: v })} tooltip="Number of rows from bottom to top" />
        <SliderRow label="Radial" value={params.resolution.radial} {...RESOLUTION.radial} onChange={(v) => setResolution({ radial: v })} tooltip="Number of segments around circumference" />
        <div className="text-xs text-[var(--text-secondary)] mt-2 opacity-60">
          Dense or detailed textures require higher resolution. Higher values produce larger STL files.
        </div>
      </Section>
    </>
  );
}
