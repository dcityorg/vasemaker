'use client';

/**
 * The Vase page's View group, at the top like Mold / Handle / Sprig (Gary,
 * 2026-10-26: people found things in different places on each page). Same
 * order on every page: what to show → Color → Show Facets → the red
 * highlights → viewing aids. Was Settings → Appearance + Print Check's
 * Overhangs, at the bottom of the panel.
 */

import { useVaseStore } from '@/store/vase-store';
import { APPEARANCE, PRINT_CHECK } from '@/config/shape-params';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { GROUP_COLORS } from '@/config/colors';
import { SliderRow, GroupHeader, Toggle } from './ui';
import { ShowFacetsToggle } from './ShowFacetsToggle';
import { useVaseExtras } from '@/components/viewport/OnVase';

export function ViewControls() {
  const params = useVaseStore((s) => s.params);
  const { setColor, setShowRulers, setPrintCheck } = useVaseStore();
  const extras = useVaseExtras();
  const printCheck = params.printCheck ?? DEFAULT_PARAMETERS.printCheck;

  return (
    <>
      <GroupHeader label="View" color={GROUP_COLORS.settings} />
      <Toggle label="Show Handle" checked={extras.showHandle} onChange={(v) => useVaseExtras.setState({ showHandle: v })}
        tooltip="The handle from HandleMaker on the vase, placed the way the mold puts it (its height is HandleMaker's Top Below Rim)" />
      <Toggle label="Show Sprig" checked={extras.showSprig} onChange={(v) => useVaseExtras.setState({ showSprig: v })}
        tooltip="The sprig from SprigMaker on the vase, where SprigMaker places it (View → On Vase there)" />
      <div className="flex items-center gap-3 mb-2">
        <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title="Preview colour of the vase. Saved with the design">Color</label>
        <input
          type="color"
          value={params.color}
          onChange={(e) => setColor(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-[var(--border-color)] bg-transparent p-0"
        />
        {params.color !== APPEARANCE.defaultColor && (
          <button onClick={() => setColor(APPEARANCE.defaultColor)} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Back to the default colour">Reset</button>
        )}
      </div>
      <ShowFacetsToggle />
      <Toggle
        label="Overhangs"
        checked={printCheck.showOverhangs}
        onChange={(v) => setPrintCheck({ showOverhangs: v })}
        tooltip="Highlight surfaces that lean out past Max Angle in red — these may droop or need support when printed"
      />
      {printCheck.showOverhangs && (
        <div className="ml-2 pl-3 border-l-2 border-[var(--border-color)]">
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
        </div>
      )}
      <Toggle label="Show Rulers" checked={params.showRulers ?? false} onChange={setShowRulers} tooltip="Display axis lines and dimension markers (mm) in the 3D view" />
    </>
  );
}
