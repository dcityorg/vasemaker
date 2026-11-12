'use client';

/**
 * The mug's handle, on the Vase tab (Gary, 2026-11-11; local-docs/
 * save-design-plan.md Part 2). It replaces View → Show Handle and the Mold
 * tab's Split Angle / Top Below Rim for the handle: WHERE the handle goes is
 * part of the mug; HOW it is cast stays on the Mold tab.
 *
 * Like the Sprig texture and the mark, the vase keeps its own COPY of the
 * Handle tab's design (Gary: "yes, a copy"), so the vase file carries its
 * handle. Changes on the Handle tab reach the vase when "Use the Handle tab's
 * …" is pressed.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useVaseStore } from '@/store/vase-store';
import { useHandleStore } from '@/store/handle-store';
import { MOLD_PARAMS } from '@/config/mold-params';
import { GROUP_COLORS } from '@/config/colors';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { vaseHandle } from '@/engine/mold/handle-on-vase';
import { SliderRow, Section, GroupHeader, resetDot, CHANGED_TIP } from './ui';

const linkBtn = 'text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors';

/** The Handle tab's design differs from the vase's copy. */
export function useHandleTabDiffers(): boolean {
  const copy = useVaseStore((s) => vaseHandle(s.params).handle);
  const tab = useHandleStore((s) => s.params);
  return useMemo(() => !copy || JSON.stringify(copy) !== JSON.stringify(tab), [copy, tab]);
}

/** Copy the Handle tab's design (and its name) onto the vase. */
export function useHandleTab(): () => void {
  const setHandle = useVaseStore((s) => s.setHandle);
  return () => {
    const { params, settingsName } = useHandleStore.getState();
    setHandle({ handle: params, handleName: settingsName });
  };
}

export function HandleControls() {
  const h = useVaseStore((s) => vaseHandle(s.params));
  const setHandle = useVaseStore((s) => s.setHandle);
  const tabName = useHandleStore((s) => s.settingsName);
  const differs = useHandleTabDiffers();
  const useTab = useHandleTab();
  const D = DEFAULT_PARAMETERS.handle!;

  return (
    <>
      <GroupHeader label="Handle" color={GROUP_COLORS.structure} />
      <Section title="Handle" defaultOpen={false} titleColor={GROUP_COLORS.structure}
        checked={h.enabled}
        onToggle={(v) => { if (v && !h.handle) useTab(); setHandle({ enabled: v }); }}
        offHint="Turn on Handle to put one on the mug"
        changed={h.enabled && (h.around !== D.around || h.topDrop !== D.topDrop)} changedTip={CHANGED_TIP}
        tooltip="A handle on the mug. Its shape is drawn on the Handle tab; here you say where it goes. The vase keeps its own copy, saved with the vase">
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-1.5">
          <span className="truncate" title="The vase keeps its own copy of the handle, saved in the design file">
            Using: <span className="text-[var(--text-primary)]">{h.handle ? (h.handleName || 'handle') : 'none yet'}</span>
          </span>
          <Link href="/handle" className={linkBtn} title="Open the Handle tab, where the handle is drawn">Edit ▸</Link>
        </div>
        {h.enabled && differs && (
          <button onClick={useTab} data-use-handle-tab
            className="w-full mb-2 text-xs px-2 py-1 rounded border border-amber-700 text-amber-200 hover:bg-amber-950/50"
            title="Copy the handle from the Handle tab onto this vase. Until then, changes there do not reach the vase or its mold">
            Use the Handle tab&apos;s “{tabName}”
          </button>
        )}
        <SliderRow label="Around" value={h.around} {...MOLD_PARAMS.seamAngle} suffix="°"
          after={resetDot(h.around !== D.around, () => setHandle({ around: D.around }), `${D.around}°`)}
          onChange={(v) => setHandle({ around: v })}
          tooltip="Where the handle goes round the mug. A Split Halves mold that casts the handle puts its seam here, through the handle" />
        <SliderRow label="Top Below Rim" value={h.topDrop} {...MOLD_PARAMS.handleTopDrop} suffix="mm"
          after={resetDot(h.topDrop !== D.topDrop, () => setHandle({ topDrop: D.topDrop }), `${D.topDrop}mm`)}
          onChange={(v) => setHandle({ topDrop: v })}
          tooltip="Where the top of the handle meets the mug, measured down from the rim (finished size). The bottom end lands wherever the handle's span reaches the mug below it" />
        <p data-handle-note className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
          The vase&apos;s STL does not include the handle. To cast it: Split Halves on the Mold tab can cast it with the mug; otherwise it is cast in its own mold on the Handle tab.
        </p>
      </Section>
    </>
  );
}
