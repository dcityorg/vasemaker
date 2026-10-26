/**
 * Zustand store for SprigMaker. Self-contained like HandleMaker's: the sprig
 * (its SVG embedded) and its mold settings live here and auto-save to
 * localStorage, restored once per session from a mount effect. View toggles
 * are ephemeral.
 *
 * Persistence is DEBOUNCED (the params carry a whole SVG, and a slider drag
 * fires dozens of changes) and never runs before hydrate has read storage —
 * the mold store once wrote defaults over Gary's saved settings on page load.
 */

import { create } from 'zustand';
import {
  DEFAULT_SPRIG_PARAMETERS,
  mergeSprigParameters,
  orientedAspect,
  type SprigParameters,
  type SprigRotation,
} from '@/engine/sprig/sprig-types';
import { smallestFit } from '@/engine/sprig/sprig-generator';
import { createHistory } from './history';

export const DEFAULT_SPRIG_SETTINGS_NAME = 'sprig design';
/** Still the default name (shown in yellow; Save asks for one first)? */
export const isSprigUnnamed = (name: string) => !name.trim() || name === DEFAULT_SPRIG_SETTINGS_NAME;
const STORAGE_KEY = 'vasemaker-sprig-settings';
const SAVE_DEBOUNCE_MS = 500;
/** Width/Length snap, mm. */
const SIZE_STEP = 0.5;
const MIN_SIZE = 3;

export interface SprigView {
  showPlate: boolean;
  showWallA: boolean;
  showWallB: boolean;
  showPlaster: boolean;
  /** Red tint over parts narrower than Min Feature Width. */
  showThin: boolean;
  flatShading: boolean;
  /** The On Vase preview instead of the mold parts. */
  onVase: boolean;
}

const DEFAULT_VIEW: SprigView = {
  showPlate: true,
  showWallA: false,
  showWallB: false,
  showPlaster: false,
  showThin: true,
  flatShading: false,
  onVase: false,
};

const snap = (v: number) => Math.max(MIN_SIZE, Math.round(v / SIZE_STEP) * SIZE_STEP);

/**
 * The SPRIG itself — what Reset leaves alone, the way HandleMaker's Reset keeps
 * the handle shape: the drawing, its size and which way it faces.
 */
function keepSprig(p: SprigParameters): Partial<SprigParameters> {
  return {
    svg: p.svg, svgName: p.svgName, svgAspect: p.svgAspect,
    width: p.width, length: p.length, lockAspect: p.lockAspect,
    rotation: p.rotation, flipX: p.flipX, flipY: p.flipY,
  };
}

export const sprigHistory = createHistory<SprigParameters>(() => ({ ...DEFAULT_SPRIG_PARAMETERS }));
export const useSprigHistory = sprigHistory.useHistoryStore;

interface SprigStore {
  params: SprigParameters;
  view: SprigView;
  settingsName: string;
  setParam: <K extends keyof SprigParameters>(key: K, value: SprigParameters[K]) => void;
  setView: (update: Partial<SprigView>) => void;
  setSettingsName: (name: string) => void;
  /** Width/Length, keeping the drawing's proportions when the 🔗 lock is on. */
  setWidth: (w: number) => void;
  setLength: (l: number) => void;
  /** Turn a quarter clockwise; Width and Length swap so the drawing keeps its size. */
  rotateCW: () => void;
  /** A new drawing: keeps the current longer side, takes the drawing's own
   *  proportions, and picks the smallest standard mold it fits. One undo step. */
  loadSvg: (svg: string, name: string, aspect: number) => void;
  /** Restore default SETTINGS; the sprig (drawing, size, orientation) is kept. */
  reset: () => void;
  /** One section's Reset button: these fields back to their defaults. One undo step. */
  resetFields: (keys: (keyof SprigParameters)[]) => void;
  /** Size's Reset: the drawing as it was loaded — unturned, unflipped, own
   *  proportions, longer side kept. One undo step. */
  resetOrientation: () => void;
  undo: () => void;
  redo: () => void;
  savedParams: SprigParameters | null;
  markSaved: (params: SprigParameters, name: string) => void;
  revertToSaved: () => void;
}

export const useSprigStore = create<SprigStore>((set, get) => ({
  params: { ...DEFAULT_SPRIG_PARAMETERS },
  view: { ...DEFAULT_VIEW },
  settingsName: DEFAULT_SPRIG_SETTINGS_NAME,

  setParam: (key, value) => set((state) => ({ params: { ...state.params, [key]: value } })),
  setView: (update) => set((state) => ({ view: { ...state.view, ...update } })),
  setSettingsName: (name) => set({ settingsName: name.trim() || DEFAULT_SPRIG_SETTINGS_NAME }),

  setWidth: (w) =>
    set((state) => {
      const p = state.params;
      const width = snap(w);
      return { params: { ...p, width, length: p.lockAspect ? snap(width / orientedAspect(p)) : p.length } };
    }),
  setLength: (l) =>
    set((state) => {
      const p = state.params;
      const length = snap(l);
      return { params: { ...p, length, width: p.lockAspect ? snap(length * orientedAspect(p)) : p.width } };
    }),

  rotateCW: () =>
    set((state) => {
      const p = state.params;
      return { params: { ...p, rotation: (((p.rotation + 90) % 360) as SprigRotation), width: p.length, length: p.width } };
    }),

  loadSvg: (svg, name, aspect) =>
    set((state) => {
      const p = state.params;
      const long = Math.max(p.width, p.length);
      const a = aspect > 0 ? aspect : 1;
      // Fresh drawing, fresh orientation: rotation and flips reset with it.
      const fresh: SprigParameters = { ...p, svg, svgName: name, svgAspect: a, rotation: 0, flipX: false, flipY: false };
      const width = a >= 1 ? snap(long) : snap(long * a);
      const length = a >= 1 ? snap(long / a) : snap(long);
      const next = { ...fresh, width, length };
      const fit = smallestFit(next);
      return { params: { ...next, moldSize: next.moldSize === 'custom' ? 'custom' : fit ?? next.moldSize } };
    }),

  reset: () => set((state) => ({ params: { ...DEFAULT_SPRIG_PARAMETERS, ...keepSprig(state.params) } })),

  resetFields: (keys) =>
    set((state) => {
      const next = { ...state.params };
      for (const k of keys) (next as Record<string, unknown>)[k] = DEFAULT_SPRIG_PARAMETERS[k];
      return { params: next };
    }),

  resetOrientation: () =>
    set((state) => {
      const p = state.params;
      const long = Math.max(p.width, p.length);
      const a = p.svgAspect > 0 ? p.svgAspect : 1;
      return {
        params: {
          ...p, rotation: 0, flipX: false, flipY: false, lockAspect: true,
          width: a >= 1 ? snap(long) : snap(long * a),
          length: a >= 1 ? snap(long / a) : snap(long),
        },
      };
    }),

  undo: () => {
    const restored = sprigHistory.undo(get().params);
    if (restored) { sprigHistory.skipNextRecord(); set({ params: restored }); }
  },
  redo: () => {
    const restored = sprigHistory.redo(get().params);
    if (restored) { sprigHistory.skipNextRecord(); set({ params: restored }); }
  },

  savedParams: null,
  markSaved: (params, name) => set({ savedParams: params, settingsName: name }),
  revertToSaved: () => set((state) => (state.savedParams ? { params: state.savedParams } : {})),
}));

// ── localStorage persistence ──

let hydrated = false;
/** True once the stored settings have been read back (or found absent). */
let restored = false;

/** Restore persisted params + name + saved baseline (once per session, from a
 *  client mount effect). Not an edit: history is skipped and cleared. */
export function hydrateSprigSettingsFromStorage(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { settingsName?: unknown; params?: unknown; savedParams?: unknown };
    sprigHistory.skipNextRecord();
    useSprigHistory.getState().clear();
    useSprigStore.setState({
      params: mergeSprigParameters(data.params),
      settingsName:
        typeof data.settingsName === 'string' && data.settingsName.trim() ? data.settingsName : DEFAULT_SPRIG_SETTINGS_NAME,
      savedParams: data.savedParams && typeof data.savedParams === 'object' ? mergeSprigParameters(data.savedParams) : null,
    });
  } catch {
    // Corrupted entry — keep defaults; the next change overwrites it.
  } finally {
    restored = true;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon(): void {
  // Never write before the stored settings have been read back.
  if (typeof window === 'undefined' || !restored) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const s = useSprigStore.getState();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ settingsName: s.settingsName, params: s.params, savedParams: s.savedParams }));
    } catch {
      // Storage full/blocked — settings just won't persist this session.
    }
  }, SAVE_DEBOUNCE_MS);
}

let prevParams = useSprigStore.getState().params;
let prevName = useSprigStore.getState().settingsName;
let prevSaved = useSprigStore.getState().savedParams;
useSprigStore.subscribe((state) => {
  if (state.params !== prevParams) sprigHistory.recordChange(state.params);
  if (state.params === prevParams && state.settingsName === prevName && state.savedParams === prevSaved) return;
  prevParams = state.params;
  prevName = state.settingsName;
  prevSaved = state.savedParams;
  persistSoon();
});
