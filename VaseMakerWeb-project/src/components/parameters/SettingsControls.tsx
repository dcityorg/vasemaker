'use client';

import { useVaseStore } from '@/store/vase-store';
import { APPEARANCE, RESOLUTION } from '@/config/shape-params';
import { GROUP_COLORS } from '@/config/colors';
import { SliderRow, Section, GroupHeader, Toggle } from './ui';

export function SettingsControls() {
  const params = useVaseStore((s) => s.params);
  const { setColor, setShowRulers, setResolution, setFlatShading } = useVaseStore();

  return (
    <>
      <GroupHeader label="Settings" color={GROUP_COLORS.settings} />

      <Section title="Appearance" active={params.color !== APPEARANCE.defaultColor || params.showRulers} tooltip="Visual settings for the 3D preview" titleColor={GROUP_COLORS.settings}>
        {(params.color !== APPEARANCE.defaultColor || params.showRulers) && (
          <div className="flex justify-end mb-1">
            <button onClick={() => { setColor(APPEARANCE.defaultColor); setShowRulers(false); }} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
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
      </Section>

      <Section title="Resolution" defaultOpen={false} tooltip="Mesh density — higher values show finer detail but create larger files" titleColor={GROUP_COLORS.settings} active={
        params.resolution.vertical !== RESOLUTION.defaults.vertical ||
        params.resolution.radial !== RESOLUTION.defaults.radial ||
        params.flatShading
      }>
        <div className="flex justify-end mb-1">
          <button onClick={() => { setResolution({ ...RESOLUTION.defaults }); setFlatShading(false); }} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Vertical" value={params.resolution.vertical} {...RESOLUTION.vertical} onChange={(v) => setResolution({ vertical: v })} tooltip="Number of rows from bottom to top" />
        <SliderRow label="Radial" value={params.resolution.radial} {...RESOLUTION.radial} onChange={(v) => setResolution({ radial: v })} tooltip="Number of segments around circumference" />
        <Toggle label="Show Facets" checked={params.flatShading} onChange={setFlatShading} tooltip="Show flat-shaded triangles instead of smooth surface" />
        <div className="text-xs text-[var(--text-secondary)] mt-2 opacity-60">
          Dense or detailed textures require higher resolution. Higher values produce larger STL files.
        </div>
      </Section>
    </>
  );
}
