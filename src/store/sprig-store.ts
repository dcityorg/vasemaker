/**
 * Zustand stores for SprigMaker. Self-contained like HandleMaker's: the sprig
 * (its SVG embedded) and its mold settings live here and auto-save to
 * localStorage, restored once per session from a mount effect. View toggles
 * are ephemeral.
 *
 * TWO designs, made by one factory (2026-10-26, Gary): the SPRIG, and the
 * MARK — the maker's mark for the bottom of a piece (`local-docs/bottom-mark-plan.md`).
 * Same engine, same controls; each has its own params, name, saved baseline,
 * undo history and storage key, so working on one never touches the other.
 * The Sprig page's `Sprig | Mark` tabs pick which one the sidebar edits
 * (`SprigTabContext` in `components/sprig/`). Everything OUTSIDE the Sprig page
 * (On Vase) reads `useSprigStore`, which is always the sprig.
 *
 * Persistence is DEBOUNCED (the params carry a whole SVG, and a slider drag
 * fires dozens of changes) and never runs before hydrate has read storage —
 * the mold store once wrote defaults over Gary's saved settings on page load.
 */

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import {
  DEFAULT_SPRIG_PARAMETERS,
  DEFAULT_MARK_PARAMETERS,
  mergeSprigParameters,
  orientedAspect,
  drawingDefaults,
  DRAWING_SETTINGS,
  type DrawingSetting,
  type SprigParameters,
  type SprigRotation,
} from '@/engine/sprig/sprig-types';
import { smallestFit } from '@/engine/sprig/sprig-generator';
import { withRelief } from '@/engine/sprig/stl-relief';
import { createHistory, type History } from './history';

export { DEFAULT_MARK_PARAMETERS };

export const DEFAULT_SPRIG_SETTINGS_NAME = 'sprig design';
export const DEFAULT_MARK_SETTINGS_NAME = 'mark design';
/** Still the default name (shown in yellow; Save asks for one first)? */
export const isSprigUnnamed = (name: string) => !name.trim() || name === DEFAULT_SPRIG_SETTINGS_NAME;
export const isMarkUnnamed = (name: string) => !name.trim() || name === DEFAULT_MARK_SETTINGS_NAME;


/** A mark has no backing and no cut-in letters (Impressed / Raised is the
 *  vase's choice, phase 2). Applied whenever params enter the mark store from
 *  outside — a file, a sprig loaded as a mark. */
export function asMark(p: SprigParameters): SprigParameters {
  return { ...p, backing: 'none', textStyle: 'raised' };
}

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
  /** The On Vase preview instead of the mold parts. */
  onVase: boolean;
}

export const DEFAULT_VIEW: SprigView = {
  showPlate: true,
  showWallA: false,
  showWallB: false,
  showPlaster: false,
  showThin: true,
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
    loadedAs: p.loadedAs, loadedMaxHeight: p.loadedMaxHeight, loadedMoldSize: p.loadedMoldSize,
  };
}

export interface SprigStore {
  params: SprigParameters;
  /** Settings a newly loaded drawing kept from the last one, for the note in
   *  Adjust. Only for that drawing (`svg`); not saved. */
  carried: { svg: string; keys: DrawingSetting[] } | null;
  dismissCarried: () => void;
  view: SprigView;
  settingsName: string;
  setParam: <K extends keyof SprigParameters>(key: K, value: SprigParameters[K]) => void;
  /** Several settings at once (a warning's Fix button). One undo step. */
  setParams: (update: Partial<SprigParameters>) => void;
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
  /** A relief STL's height map (lib/sprig-source reliefFromStlFile), at its own
   *  size and height, read as made (Gray, raw tones). One undo step. */
  loadRelief: (url: string, name: string, size: { width: number; length: number; maxHeight: number }) => void;
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

interface DesignKind {
  storageKey: string;
  defaultName: string;
  defaults: SprigParameters;
}

/** Everything one design (sprig or mark) needs, bound together. */
export interface SprigDesign {
  kind: 'sprig' | 'mark';
  useStore: UseBoundStore<StoreApi<SprigStore>>;
  history: History<SprigParameters>;
  useHistory: History<SprigParameters>['useHistoryStore'];
  hydrate: () => void;
  isUnnamed: (name: string) => boolean;
  defaultName: string;
  defaults: SprigParameters;
}

function makeDesign(kind: 'sprig' | 'mark', cfg: DesignKind): SprigDesign {
  const { defaults, defaultName } = cfg;
  const history = createHistory<SprigParameters>(() => ({ ...defaults }));
  /** The drawing settings a just-loaded drawing kept that are not its defaults. */
  const carriedOver = (p: SprigParameters) => {
    const base = drawingDefaults(defaults, p);
    return { svg: p.svg, keys: DRAWING_SETTINGS.filter((k) => p[k] !== base[k]) };
  };

  const useStore = create<SprigStore>((set, get) => ({
    params: { ...defaults },
    carried: null,
    view: { ...DEFAULT_VIEW },
    settingsName: defaultName,

    setParam: (key, value) => set((state) => ({ params: { ...state.params, [key]: value } })),
    setParams: (update) => set((state) => ({ params: { ...state.params, ...update } })),
    setView: (update) => set((state) => ({ view: { ...state.view, ...update } })),
    setSettingsName: (name) => set({ settingsName: name.trim() || defaultName }),

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
        const fresh: SprigParameters = { ...p, svg, svgName: name, svgAspect: a, rotation: 0, flipX: false, flipY: false, loadedAs: 'drawing' };
        const width = a >= 1 ? snap(long) : snap(long * a);
        const length = a >= 1 ? snap(long / a) : snap(long);
        const next = { ...fresh, width, length };
        const fit = smallestFit(next);
        const params: SprigParameters = { ...next, moldSize: next.moldSize === 'custom' ? 'custom' : fit ?? next.moldSize };
        return { params, carried: carriedOver(params) };
      }),

    loadRelief: (url, name, size) => set((state) => {
      const params = withRelief(state.params, url, name, size);
      return { params, carried: carriedOver(params) };
    }),
    dismissCarried: () => set({ carried: null }),

    reset: () => set((state) => ({ params: { ...drawingDefaults(defaults, state.params), ...keepSprig(state.params) }, carried: null })),

    resetFields: (keys) =>
      set((state) => {
        const next = { ...state.params };
        const base = drawingDefaults(defaults, state.params);
        for (const k of keys) (next as Record<string, unknown>)[k] = base[k];
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
      const restored = history.undo(get().params);
      if (restored) { history.skipNextRecord(); set({ params: restored }); }
    },
    redo: () => {
      const restored = history.redo(get().params);
      if (restored) { history.skipNextRecord(); set({ params: restored }); }
    },

    savedParams: null,
    markSaved: (params, name) => set({ savedParams: params, settingsName: name }),
    revertToSaved: () => set((state) => (state.savedParams ? { params: state.savedParams, carried: null } : {})),
  }));

  // ── localStorage persistence ──

  let hydrated = false;
  /** True once the stored settings have been read back (or found absent). */
  let restored = false;

  /** Restore persisted params + name + saved baseline (once per session, from a
   *  client mount effect). Not an edit: history is skipped and cleared. */
  function hydrate(): void {
    if (hydrated || typeof window === 'undefined') return;
    hydrated = true;
    try {
      const raw = window.localStorage.getItem(cfg.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw) as { settingsName?: unknown; params?: unknown; savedParams?: unknown };
      history.skipNextRecord();
      history.useHistoryStore.getState().clear();
      useStore.setState({
        params: mergeSprigParameters(data.params, defaults),
        settingsName:
          typeof data.settingsName === 'string' && data.settingsName.trim() ? data.settingsName : defaultName,
        savedParams: data.savedParams && typeof data.savedParams === 'object' ? mergeSprigParameters(data.savedParams, defaults) : null,
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
      const s = useStore.getState();
      try {
        window.localStorage.setItem(cfg.storageKey, JSON.stringify({ settingsName: s.settingsName, params: s.params, savedParams: s.savedParams }));
      } catch {
        // Storage full/blocked — settings just won't persist this session.
      }
    }, SAVE_DEBOUNCE_MS);
  }

  let prevParams = useStore.getState().params;
  let prevName = useStore.getState().settingsName;
  let prevSaved = useStore.getState().savedParams;
  useStore.subscribe((state) => {
    if (state.params !== prevParams) history.recordChange(state.params);
    if (state.params === prevParams && state.settingsName === prevName && state.savedParams === prevSaved) return;
    prevParams = state.params;
    prevName = state.settingsName;
    prevSaved = state.savedParams;
    persistSoon();
  });

  return {
    kind, useStore, history, useHistory: history.useHistoryStore, hydrate,
    isUnnamed: (name: string) => !name.trim() || name === defaultName,
    defaultName, defaults,
  };
}

export const sprigDesign = makeDesign('sprig', {
  storageKey: 'vasemaker-sprig-settings', defaultName: DEFAULT_SPRIG_SETTINGS_NAME, defaults: DEFAULT_SPRIG_PARAMETERS,
});
export const markDesign = makeDesign('mark', {
  storageKey: 'vasemaker-mark-settings', defaultName: DEFAULT_MARK_SETTINGS_NAME, defaults: DEFAULT_MARK_PARAMETERS,
});

// The original names, so nothing outside the Sprig page changes.
export const useSprigStore = sprigDesign.useStore;
export const sprigHistory = sprigDesign.history;
export const useSprigHistory = sprigDesign.useHistory;
export const hydrateSprigSettingsFromStorage = sprigDesign.hydrate;
export const useMarkStore = markDesign.useStore;
export const hydrateMarkSettingsFromStorage = markDesign.hydrate;
