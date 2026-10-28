'use client';

/**
 * Bottom — the foot ring and the maker's mark (local-docs/bottom-mark-plan.md).
 * The mark is DESIGNED on the Sprig page's Mark tab; the vase keeps a COPY of
 * it so the design file carries its own mark. "Use my Mark" refreshes the copy.
 */

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useVaseStore } from '@/store/vase-store';
import { useMeshStatsStore } from '@/store/mesh-stats-store';
import { useMarkStore, hydrateMarkSettingsFromStorage } from '@/store/sprig-store';
import { BOTTOM } from '@/config/shape-params';
import { GROUP_COLORS } from '@/config/colors';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { SliderRow, Section, Toggle, GroupHeader } from './ui';

/** The Sprig page opens on this tab (SprigEditor). */
const SPRIG_TAB_KEY = 'vasemaker-sprig-tab';

const sub = 'text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mt-2 mb-1';
const linkBtn = 'text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors';

export function BottomControls() {
  const b = useVaseStore((s) => s.params.bottom) ?? DEFAULT_PARAMETERS.bottom;
  const hasBase = useVaseStore((s) => s.params.wallThickness > 0 && s.params.bottomThickness > 0);
  const setBottom = useVaseStore((s) => s.setBottom);
  const notes = useMeshStatsStore((s) => s.bottomNotes);
  const floorZ = useMeshStatsStore((s) => s.bottomFloorZ);
  const baseMm = useVaseStore((s) => s.params.bottomThickness);
  const tabMark = useMarkStore((s) => s.params);
  const tabName = useMarkStore((s) => s.settingsName);

  useEffect(() => { hydrateMarkSettingsFromStorage(); }, []);

  const differs = useMemo(() => {
    if (!b.mark) return true;
    const tab: Record<string, unknown> = { ...tabMark, backing: 'none', textStyle: 'raised' };
    const mine = b.mark as unknown as Record<string, unknown>;
    const keys = Array.from(new Set(Object.keys(tab).concat(Object.keys(mine))));
    return keys.some((k) => JSON.stringify(tab[k]) !== JSON.stringify(mine[k]));
  }, [b.mark, tabMark]);
  // The first copy takes the mark's own height as Depth; a refresh keeps yours.
  const useTabMark = () => setBottom({
    mark: { ...tabMark, backing: 'none', textStyle: 'raised' }, markName: tabName,
    ...(b.mark ? {} : { markDepth: tabMark.maxHeight }),
  });

  const active = b.footOn || b.markOn;
  const resetFoot = () => setBottom({
    footWidth: DEFAULT_PARAMETERS.bottom.footWidth, footSlopeWidth: DEFAULT_PARAMETERS.bottom.footSlopeWidth,
    footHeight: DEFAULT_PARAMETERS.bottom.footHeight, footSmoothInner: DEFAULT_PARAMETERS.bottom.footSmoothInner,
  });
  const resetPlace = () => setBottom({ markSize: 100, markAngle: 0, markOffsetX: 0, markOffsetY: 0 });

  return (
    <>
    <GroupHeader label="Bottom" color={GROUP_COLORS.structure} />
    <Section title="Foot & Mark" defaultOpen={false} active={active} titleColor={GROUP_COLORS.structure}
      tooltip="The foot ring the piece stands on, and your maker's mark on the bottom">
      {!hasBase ? (
        <p className="text-xs text-[var(--text-secondary)] mb-2">A foot and a mark need a solid bottom: set Base and Wall above zero in Shell.</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className={sub}>Foot</div>
            {b.footOn && <button onClick={resetFoot} className={linkBtn} title="Foot back to its defaults">Reset</button>}
          </div>
          <Toggle label="Foot" checked={b.footOn} onChange={(v) => setBottom({ footOn: v })}
            tooltip="A foot ring with a recessed middle, on the plastic print AND on every mold. Off: a flat bottom everywhere" />
          {b.footOn && (
            <div className="ml-2 pl-3 border-l-2 border-[var(--border-color)]">
              <SliderRow label="Foot Width" value={b.footWidth} {...BOTTOM.footWidth} suffix="mm" onChange={(v) => setBottom({ footWidth: v })}
                tooltip="The flat ring at the outer edge of the bottom — what the piece stands on" />
              <SliderRow label="Slope Width" value={b.footSlopeWidth} {...BOTTOM.footSlopeWidth} suffix="mm" onChange={(v) => setBottom({ footSlopeWidth: v })}
                tooltip="Width of the slope from the foot ring up into the recessed middle" />
              <SliderRow label="Depth" value={b.footHeight} {...BOTTOM.footHeight} suffix="mm" onChange={(v) => setBottom({ footHeight: v })}
                tooltip="How far the middle is recessed. A raised mark must not be taller than this or the piece rocks" />
              <Toggle label="Smooth Inside" checked={b.footSmoothInner} onChange={(v) => setBottom({ footSmoothInner: v })}
                tooltip="Build the slope and recess from the smooth outline, so surface texture does not carry into the recess" />
            </div>
          )}
          <p className="text-xs text-[var(--text-secondary)] mb-2">A foot is usually for pieces cast from a mold. It applies to the plastic print and every mold style.</p>

          <div className="flex items-center justify-between">
            <div className={sub}>Mark</div>
            {b.markOn && <button onClick={resetPlace} className={linkBtn} title="Size, angle and position back to the defaults">Reset</button>}
          </div>
          <Toggle label="Mark" checked={b.markOn}
            onChange={(v) => { if (v && !b.mark) useTabMark(); setBottom({ markOn: v }); }}
            tooltip="Put your maker's mark (designed on the Sprig page, Mark tab) on the bottom: the plastic print, the Pour 3-Pc center and the Split Halves / Thirds plug disk" />
          {b.markOn && (
            <div className="ml-2 pl-3 border-l-2 border-[var(--border-color)]">
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-1.5">
                <span className="truncate" title="The vase keeps its own copy of the mark, saved in the design file">Using: <span className="text-[var(--text-primary)]">{b.markName || 'mark'}</span></span>
                <Link href="/sprig" onClick={() => { try { window.sessionStorage.setItem(SPRIG_TAB_KEY, 'mark'); } catch { /* not remembered */ } }}
                  className={linkBtn} title="Open the Mark tab on the Sprig page">Edit ▸</Link>
              </div>
              {differs && (
                <button onClick={useTabMark} className="w-full mb-2 text-xs px-2 py-1 rounded border border-amber-700 text-amber-200 hover:bg-amber-950/50"
                  title="Copy the mark from the Sprig page's Mark tab into this vase">
                  Use the Mark tab&apos;s {tabName ? `“${tabName}”` : 'mark'}
                </button>
              )}
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm text-[var(--text-secondary)] w-12 shrink-0" title="Impressed = pressed into the bottom. Raised = stands out of it, inside the recess">Style</label>
                <div className="flex gap-2.5">
                  {(['impressed', 'raised'] as const).map((st) => (
                    <label key={st} className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] cursor-pointer">
                      <input type="radio" name="markStyle" checked={b.markStyle === st} onChange={() => setBottom({ markStyle: st })} className="accent-[var(--accent)]" />
                      {st === 'impressed' ? 'Impressed' : 'Raised'}
                    </label>
                  ))}
                </div>
              </div>
              <SliderRow label={b.markStyle === 'impressed' ? 'Depth' : 'Height'} value={b.markDepth} {...BOTTOM.markDepth} suffix="mm"
                onChange={(v) => setBottom({ markDepth: v })} tooltip="How deep the mark is pressed in, or how far it stands out (its tallest part)" />
              <SliderRow label="Size" value={b.markSize} {...BOTTOM.markSize} suffix="%" onChange={(v) => setBottom({ markSize: v })}
                tooltip="Size of the mark, as a percentage of the size it was drawn at on the Mark tab" />
              <SliderRow label="Angle" value={b.markAngle} {...BOTTOM.markAngle} suffix="°" onChange={(v) => setBottom({ markAngle: v })}
                tooltip="Turn the mark, counter-clockwise as seen looking up at the bottom" />
              <SliderRow label="Move Right" value={b.markOffsetX} {...BOTTOM.markOffset} suffix="mm" onChange={(v) => setBottom({ markOffsetX: v })}
                tooltip="Move the mark off centre, to the right as seen looking up at the bottom" />
              <SliderRow label="Move Up" value={b.markOffsetY} {...BOTTOM.markOffset} suffix="mm" onChange={(v) => setBottom({ markOffsetY: v })}
                tooltip="Move the mark off centre, up as seen looking up at the bottom" />
              <p className="text-xs text-[var(--text-secondary)] mb-2">Placed as you read it when you turn the piece over. Look from below to check it.</p>
            </div>
          )}
          {notes.map((n, i) => (
            <div key={i} className="mb-1.5 px-2 py-1.5 rounded border border-amber-700 bg-amber-950/70 text-xs text-amber-200">{n}</div>
          ))}
          {active && floorZ !== null && floorZ > baseMm + 0.05 && (
            <p className="text-xs text-[var(--text-secondary)] mb-2"
              title="Base (Shell) is the plastic left over the deepest point, so the inside floor goes up by the foot's Depth and an impressed mark's Depth (to the next mesh row). The outside does not change, and molds use only the outside.">
              Inside floor: {floorZ.toFixed(1)} mm up (Base {baseMm} mm over the foot and mark)
            </p>
          )}
        </>
      )}
    </Section>
    </>
  );
}
