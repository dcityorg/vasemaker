'use client';

/**
 * Photo depth's yes/no box and its status line (Gary, 2026-10-29): the size
 * warning lives in the box, so the sidebar carries no extra text. Asked when
 * a photo is loaded, or when Photo depth is pressed, until the first yes;
 * after that photos get Photo depth on their own.
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { allowPhotoDepth, initPhotoDepth, usePhotoDepth, PHOTO_DEPTH_MB } from '@/lib/photo-depth';

interface Ask { photo: boolean; resolve: (yes: boolean) => void }
const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }));

/** "Not now" on a loaded photo holds until the page is reloaded, so each
 *  photo does not ask again. Pressing Photo depth always asks. */
let declinedThisVisit = false;

/**
 * Resolves true once Photo depth is allowed (already, or by this yes).
 * `photo`: asked because a photo was just loaded (the box says so, and a
 * "Not now" earlier in this visit answers for it).
 */
export function askPhotoDepth(photo: boolean): Promise<boolean> {
  if (usePhotoDepth.getState().allowed) return Promise.resolve(true);
  if (photo && declinedThisVisit) return Promise.resolve(false);
  return new Promise((resolve) => {
    useAsk.getState().ask?.resolve(false);   // only one box at a time
    useAsk.setState({ ask: { photo, resolve } });
  });
}

/** Mount once on the Sprig page. Also reads the remembered yes. */
export function PhotoDepthHost() {
  useEffect(() => { initPhotoDepth(); }, []);
  const ask = useAsk((s) => s.ask);
  if (!ask) return null;
  const close = (yes: boolean) => {
    useAsk.setState({ ask: null });
    if (yes) allowPhotoDepth();
    else if (ask.photo) declinedThisVisit = true;
    ask.resolve(yes);
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center" onMouseDown={() => close(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') close(false); }}>
      <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg p-4 w-80 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
          {ask.photo ? 'This looks like a photo' : 'Photo depth'}
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-2">
          Photo depth shapes a photo in 3D — petals, shells, faces — from how near each part looks.
        </p>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          The first time, it downloads about {PHOTO_DEPTH_MB} MB, once; after that it starts straight away.
          It runs on your computer: your picture is never uploaded.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => close(false)} className="text-xs px-3 py-1 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]">Not now</button>
          <button autoFocus onClick={() => close(true)} className="text-xs px-3 py-1 rounded bg-[var(--accent)] text-white">Use Photo depth</button>
        </div>
      </div>
    </div>
  );
}

/** One line under the Shaping buttons while Photo depth is on: downloading,
 *  shaping, or not turned on in this browser (a design file loaded here). */
export function PhotoDepthStatusLine({ onTurnOn }: { onTurnOn: () => void }) {
  const { status, allowed } = usePhotoDepth();
  const cls = 'text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 mb-1';
  if (!allowed) {
    return (
      <p className={cls}>
        Photo depth is not turned on in this browser, so the shape is inflated for now.{' '}
        <button onClick={onTurnOn} className="underline hover:text-[var(--text-primary)]">Turn it on</button>
      </p>
    );
  }
  if (status.state === 'loading') {
    const mb = (b: number) => (b / 1e6).toFixed(0);
    return (
      <div className={cls}>
        <p>Downloading Photo depth{status.total > 0 ? ` — ${mb(status.loaded)} of ${mb(status.total)} MB` : '…'} (once). Inflated until it is ready.</p>
        <div className="h-1 mt-0.5 rounded bg-[var(--bg-secondary)] overflow-hidden">
          <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${status.total > 0 ? Math.round((100 * status.loaded) / status.total) : 3}%` }} />
        </div>
      </div>
    );
  }
  if (status.state === 'running') return <p className={cls}>Photo depth: shaping…</p>;
  return null;
}
