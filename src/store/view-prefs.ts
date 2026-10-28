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

/**
 * Sprig / Mark preview colours (Sher, 2026-10-28): the clay one colour, the
 * plate behind it another, so a spot with no clay shows at a glance. Shared by
 * both tabs, remembered in this browser, never in a design file; the Display
 * Reset puts them back.
 */
export const DEFAULT_SPRIG_COLOR = '#d98a4a';
export const DEFAULT_SPRIG_BACKGROUND = '#7d8794';
const COLORS_KEY = 'vasemaker-sprig-colors';

interface SprigColors { sprig: string; background: string }
export const useSprigColorStore = create<SprigColors>(() => ({ sprig: DEFAULT_SPRIG_COLOR, background: DEFAULT_SPRIG_BACKGROUND }));

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export function setSprigColors(update: Partial<SprigColors>): void {
  useSprigColorStore.setState(update);
  const c = useSprigColorStore.getState();
  try {
    if (c.sprig === DEFAULT_SPRIG_COLOR && c.background === DEFAULT_SPRIG_BACKGROUND) window.localStorage.removeItem(COLORS_KEY);
    else window.localStorage.setItem(COLORS_KEY, JSON.stringify({ sprig: c.sprig, background: c.background }));
  } catch { /* this session only */ }
}

function readColors(raw: string | null): SprigColors {
  const c: SprigColors = { sprig: DEFAULT_SPRIG_COLOR, background: DEFAULT_SPRIG_BACKGROUND };
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && isHex(v.sprig)) c.sprig = v.sprig;
    if (v && isHex(v.background)) c.background = v.background;
  } catch { /* defaults */ }
  return c;
}

let colorsHydrated = false;
function hydrateColors(): void {
  if (colorsHydrated || typeof window === 'undefined') return;
  colorsHydrated = true;
  try { useSprigColorStore.setState(readColors(window.localStorage.getItem(COLORS_KEY))); } catch { /* defaults */ }
  window.addEventListener('storage', (e) => {
    if (e.key === COLORS_KEY) useSprigColorStore.setState(readColors(e.newValue));
  });
}

/** The two preview colours, from any component (hydrates on first use). */
export function useSprigColors(): SprigColors {
  useEffect(hydrateColors, []);
  const sprig = useSprigColorStore((s) => s.sprig);
  const background = useSprigColorStore((s) => s.background);
  return { sprig, background };
}
