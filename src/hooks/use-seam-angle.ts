/**
 * The Seam Angle a split mold style was last given on the Mold page, for the
 * seam lines and snap buttons on the Vase and Sprig pages (Gary, 2026-11-09).
 *
 * Each style keeps its own settings (mold-store `styleParams`), so this reads
 * that style's entry, not the tab the Mold page happens to be on. In this
 * browser tab the store is live. A Mold page open in ANOTHER tab writes only
 * localStorage, which this tab's store never re-reads after hydrating, so the
 * storage event is followed here — into a separate store, never back into the
 * mold store, whose next write would then save this tab's copy over the other
 * tab's settings.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { useMoldStore } from '@/store/mold-store';
import { DEFAULT_MOLD_PARAMETERS, type MoldStyle } from '@/engine/mold/mold-types';
import type { SeamMold } from '@/engine/mold/seams';

const STORAGE_KEY = 'vasemaker-mold-settings';
const STYLE: Record<SeamMold, MoldStyle> = { halves: 'splitHalves', thirds: 'splitThirds' };

/** Seam Angles another tab saved since this tab last changed them; null = none. */
const useOtherTab = create<Record<SeamMold, number | null>>(() => ({ halves: null, thirds: null }));

function storedAngle(raw: string | null, style: MoldStyle): number | null {
  try {
    const d = raw ? JSON.parse(raw) : null;
    const v = d?.styleParams?.[style]?.seamAngle ?? (d?.params?.moldStyle === style ? d.params.seamAngle : undefined);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

let listening = false;
function listen(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    useOtherTab.setState({ halves: storedAngle(e.newValue, STYLE.halves), thirds: storedAngle(e.newValue, STYLE.thirds) });
  });
  // A change made in this tab is the newest again.
  let prev = useMoldStore.getState().styleParams;
  useMoldStore.subscribe((s) => {
    if (s.styleParams === prev) return;
    const was = prev;
    prev = s.styleParams;
    for (const m of ['halves', 'thirds'] as const) {
      if (s.styleParams[STYLE[m]]?.seamAngle !== was[STYLE[m]]?.seamAngle) useOtherTab.setState({ [m]: null });
    }
  });
}

export function useSeamAngle(mold: SeamMold): number {
  useEffect(listen, []);
  const local = useMoldStore((s) => s.styleParams[STYLE[mold]]?.seamAngle ?? DEFAULT_MOLD_PARAMETERS.seamAngle);
  const other = useOtherTab((s) => s[mold]);
  return other ?? local;
}
