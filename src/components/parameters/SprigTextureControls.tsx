'use client';

/**
 * Textures → Sprig (Sher, 2026-10-28): a sprig from the Sprig page raised out
 * of or pressed into the wall. The molds keep it, grown by Shrink (Gary,
 * 2026-10-28; prepareVaseParams). The vase keeps its own
 * COPY of the sprig (Gary: the Sprig tab may be busy with the next one), so
 * changes there reach the vase only when "Use the Sprig tab's …" is pressed.
 * Engine: engine/sprig/vase-sprig.ts.
 */

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useVaseStore } from '@/store/vase-store';
import { useMeshStatsStore } from '@/store/mesh-stats-store';
import { useSprigStore, hydrateSprigSettingsFromStorage } from '@/store/sprig-store';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { SliderRow, Toggle } from './ui';

/** The Sprig page opens on this tab (SprigEditor). */
const SPRIG_TAB_KEY = 'vasemaker-sprig-tab';
const linkBtn = 'text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors';

export function SprigTextureControls() {
  const s = useVaseStore((st) => st.params.textures.sprig) ?? DEFAULT_PARAMETERS.textures.sprig!;
  const set = useVaseStore((st) => st.setSprigTexture);
  const notes = useMeshStatsStore((st) => st.sprigNotes);
  const tab = useSprigStore((st) => st.params);
  const tabName = useSprigStore((st) => st.settingsName);

  useEffect(() => { hydrateSprigSettingsFromStorage(); }, []);

  const differs = useMemo(() => {
    if (!s.sprig) return true;
    const a = tab as unknown as Record<string, unknown>, b = s.sprig as unknown as Record<string, unknown>;
    const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
    return keys.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  }, [s.sprig, tab]);
  // The first copy takes its place and height from the Sprig page's On Vase
  // view; bringing it in again keeps the placement set here.
  const useTab = () => set({
    sprig: { ...tab }, sprigName: tabName,
    ...(s.sprig ? {} : {
      depth: tab.maxHeight, heightPct: tab.onVaseHeight, angle: tab.onVaseAngle,
      tilt: tab.onVaseTilt, copies: tab.onVaseCopies,
    }),
  });
  const reset = () => {
    const d = DEFAULT_PARAMETERS.textures.sprig!;
    set({ style: d.style, depth: s.sprig ? s.sprig.maxHeight : d.depth, size: d.size, heightPct: d.heightPct, angle: d.angle, tilt: d.tilt, copies: d.copies });
  };

  return (
    <>
      <Toggle label="Sprig" checked={s.enabled}
        onChange={(v) => { if (v && !s.sprig) useTab(); set({ enabled: v }); }}
        onReset={reset}
        tooltip="A sprig from the Sprig page, raised out of or pressed into the wall. The molds keep it when Keep Texture is on" />
      {s.enabled && (
        <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-1.5">
            <span className="truncate" title="The vase keeps its own copy of the sprig, saved in the design file">Using: <span className="text-[var(--text-primary)]">{s.sprigName || 'sprig'}</span></span>
            <Link href="/sprig" onClick={() => { try { window.sessionStorage.setItem(SPRIG_TAB_KEY, 'sprig'); } catch { /* not remembered */ } }}
              className={linkBtn} title="Open the Sprig tab on the Sprig page">Edit ▸</Link>
          </div>
          {differs && (
            <button onClick={useTab} className="w-full mb-2 text-xs px-2 py-1 rounded border border-amber-700 text-amber-200 hover:bg-amber-950/50"
              title="Copy the sprig from the Sprig page's Sprig tab into this vase. Until then, changes there do not reach the vase">
              Use the Sprig tab&apos;s {tabName ? `“${tabName}”` : 'sprig'}
            </button>
          )}
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm text-[var(--text-secondary)] w-12 shrink-0" title="Raised = stands out of the wall. Pressed In = sunk into it">Style</label>
            <div className="flex gap-2.5">
              {(['raised', 'pressed'] as const).map((st) => (
                <label key={st} className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] cursor-pointer">
                  <input type="radio" name="sprigStyle" checked={s.style === st} onChange={() => set({ style: st })} className="accent-[var(--accent)]" />
                  {st === 'raised' ? 'Raised' : 'Pressed In'}
                </label>
              ))}
            </div>
          </div>
          <SliderRow label={s.style === 'raised' ? 'Stands Out' : 'Depth'} value={s.depth} min={0.1} max={6} step={0.1} suffix="mm" onChange={(v) => set({ depth: v })}
            tooltip={s.style === 'raised' ? 'How far its tallest part stands out of the wall' : 'How deep its tallest part is pressed in. With Smooth Inner on (Shell) this thins the wall behind it; off, the inside follows it'} />
          <SliderRow label="Size" value={s.size} min={10} max={300} step={1} suffix="%" onChange={(v) => set({ size: v })}
            tooltip="Size as a percentage of the size it was drawn at on the Sprig page" />
          <SliderRow label="Height" value={s.heightPct} min={0} max={100} step={1} suffix="%" onChange={(v) => set({ heightPct: v })}
            tooltip="Where its centre sits, as a % of the vase's height" />
          <SliderRow label="Around" value={s.angle} min={-180} max={180} step={1} suffix="°" onChange={(v) => set({ angle: v })}
            tooltip="Where round the vase it sits (the same angle as the Sprig page's On Vase view)" />
          <SliderRow label="Tilt" value={s.tilt} min={-180} max={180} step={1} suffix="°" onChange={(v) => set({ tilt: v })}
            tooltip="Turn it, clockwise as seen from outside" />
          <SliderRow label="Copies" value={s.copies} min={1} max={12} step={1} onChange={(v) => set({ copies: v })}
            tooltip="Copies evenly spaced round the vase" />
          {notes.map((n, i) => (
            <div key={i} className="mb-2 px-2 py-1.5 rounded border border-amber-700 bg-amber-950/40 text-xs text-amber-200">{n}</div>
          ))}
          <div className="text-xs text-[var(--text-secondary)] mt-1 opacity-60">
            The molds keep it (grown by Shrink) when Keep Texture is on: check Undercuts on the Mold tab. Raise Resolution for crisp edges.
          </div>
        </div>
      )}
    </>
  );
}
