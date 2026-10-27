/**
 * View preferences shared by all four pages and remembered in this browser
 * (Gary, 2026-10-26). Not in any design file: they describe how you like to
 * look at a design, not the design.
 *
 * Show Facets: on = every flat triangle shows (flat shading), the way to judge
 * Resolution before printing; off = crease shading (curves smooth, edges
 * sharper than 30° kept sharp — components/viewport/crease.ts). New visitors
 * start with it on; turning it off sticks until it is turned back on (the
 * switch is its own reset: the Vase page's Appearance section, whose Reset
 * also did it, became the View group on 2026-10-26).
 */

import { create } from 'zustand';
import { useEffect } from 'react';

const KEY = 'vasemaker-show-facets';

export const useViewPrefs = create<{ showFacets: boolean }>(() => ({ showFacets: true }));

export function setShowFacets(v: boolean): void {
  useViewPrefs.setState({ showFacets: v });
  try { window.localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* storage blocked: this session only */ }
}

let hydrated = false;
/** Read the stored choice once, after mount (never during render: SSR mismatch),
 *  and follow other open tabs. */
function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v !== null) useViewPrefs.setState({ showFacets: v === '1' });
  } catch { /* keep the default */ }
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue !== null) useViewPrefs.setState({ showFacets: e.newValue === '1' });
  });
}

/** Show Facets, from any component (hydrates on first use). */
export function useShowFacets(): boolean {
  useEffect(hydrate, []);
  return useViewPrefs((s) => s.showFacets);
}
