'use client';

import { useVaseStore } from '@/store/vase-store';
import { useMeshStatsStore } from '@/store/mesh-stats-store';
import { RESOLUTION, PRINT_CHECK } from '@/config/shape-params';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { GROUP_COLORS, UI_MUTED } from '@/config/colors';
import type { FilamentType } from '@/engine/types';
import { SliderRow, Section, GroupHeader } from './ui';

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
  const { setResolution, setPrintCheck } = useVaseStore();
  const stats = useMeshStatsStore((s) => s.stats);

  const printCheck = params.printCheck ?? DEFAULT_PARAMETERS.printCheck;
  const filament = PRINT_CHECK.filaments[printCheck.material] ?? PRINT_CHECK.filaments.pla;
  const hasShell = params.wallThickness > 0;
  const volumeCm3 = stats ? stats.volumeMm3 / 1000 : 0;
  const weightG = volumeCm3 * filament.density;
  // spool length of 1.75mm filament holding the same volume of plastic
  const filamentAreaMm2 = Math.PI * (PRINT_CHECK.filamentDiameter / 2) ** 2;
  const filamentM = stats ? stats.volumeMm3 / filamentAreaMm2 / 1000 : 0;

  return (
    <>
      {/* Resolution: the same name on every page (Gary, 2026-10-26). */}
      <GroupHeader label="Settings" color={GROUP_COLORS.settings} />
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

      {/* Analysis: last, as on Mold / Handle / Sprig. Was "Print Check" in
          Settings; its Overhangs switch moved to View with the other red
          highlights. */}
      <GroupHeader label="Analysis" color={GROUP_COLORS.settings} />
      <Section title="Plastic Estimate" defaultOpen={false} active={printCheck.material !== DEFAULT_PARAMETERS.printCheck.material} tooltip="How much plastic the print takes" titleColor={GROUP_COLORS.settings}>
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
      </Section>

      <Section title="Printer Fit" defaultOpen={false} tooltip="Whether the print fits your printer" titleColor={GROUP_COLORS.settings}>
        {stats && (
          <StatRow
            label="Size"
            value={`${stats.sizeX.toFixed(1)} × ${stats.sizeY.toFixed(1)} × ${stats.sizeZ.toFixed(1)} mm`}
            tooltip="Bounding box of the mesh (width × depth × height)"
          />
        )}
      </Section>
    </>
  );
}
