/**
 * Zustand store for MoldMaker settings. Independent of vase-store — MoldMaker
 * reads the live vase design from vase-store and layers these mold settings on top.
 * Deliberately simple: no undo/dirty (mold settings are lightweight relative to
 * the vase design, which owns its own persistence).
 *
 * Each STYLE keeps its own settings (Gary, 2026-10-16): `params` is the tab
 * you're on, `styleParams` holds every style's latest settings (kept in step
 * with `params` by the subscription below), and switching tabs swaps them.
 * Reset, Revert and Load Settings touch only the one style.
 *
 * Persistence: params + settingsName auto-save to localStorage on every change
 * and are restored once per session via hydrateMoldSettingsFromStorage() —
 * called from MoldEditor after mount (not at module init) so server-rendered
 * HTML matches the client's first render. View toggles are ephemeral and are
 * not persisted. Save/Load Settings files (MoldSidebar) are for named profiles
 * on top of this.
 */

import { create } from 'zustand';
import type { MoldParameters, MoldStyle } from '@/engine/mold/mold-types';
import { DEFAULT_MOLD_PARAMETERS, mergeMoldParameters, retireMoldStyle, retiredSuccessor, ACTIVE_MOLD_STYLES } from '@/engine/mold/mold-types';

/** One settings block per mold style. */
export type StyleParams = Partial<Record<MoldStyle, MoldParameters>>;

const RETIRED_LABELS: Partial<Record<MoldStyle, string>> = {
  twoPart: 'Press 2-Pc', onePiece: 'Pour 1-Pc', pourTwoPiece: 'Pour 2-Pc', splitTwoPiece: 'Split 2-Pc',
};
const SUCCESSOR_LABELS: Partial<Record<MoldStyle, string>> = { pourThreePiece: 'Pour 3-Pc', splitHalves: 'Split Halves' };
/** The one-line notice for settings moved off a hidden style. */
export function retiredStyleNotice(style: MoldStyle): string {
  const to = retiredSuccessor(style);
  return `These settings were for ${RETIRED_LABELS[style] ?? style}, which is no longer offered — switched to ${SUCCESSOR_LABELS[to] ?? to}.`;
}
import { createHistory } from './history';

export const DEFAULT_SETTINGS_NAME = 'mold settings';
const STORAGE_KEY = 'vasemaker-mold-settings';

/** Which parts are visible in the mold viewport. */
export interface MoldView {
  showMaster: boolean;
  showCottle: boolean;
  /** Pour 3-Pc only: the second shell half, so one can be hidden to inspect flange edges. */
  showCottleB: boolean;
  /** Per-face normals — the V apexes read as creases instead of smooth tubes. */
  flatShading: boolean;
  /** Draw the shell translucent, to see how the whole assembly fits together. */
  ghostShell: boolean;
  showPlaster: boolean;
  crossSection: boolean;
  showUndercuts: boolean;
}

const DEFAULT_VIEW: MoldView = {
  showMaster: true,
  showCottle: true,
  showCottleB: true,
  flatShading: false,
  ghostShell: false,
  showPlaster: false,
  crossSection: false,
  showUndercuts: true,
};

/** Preview colour of the main part (master / center / mold / trays). A view
 *  preference like the vase's Color: remembered per browser, never in a
 *  settings file, untouched by Reset. */
export const DEFAULT_PART_COLOR = '#d9d2c5';
const COLOR_KEY = 'vasemaker-mold-color';

interface MoldStore {
  params: MoldParameters;
  view: MoldView;
  partColor: string;
  setPartColor: (color: string) => void;
  /** Shown once when saved settings named a mold style that is now hidden and
   *  were moved onto Pour 3-Pc. Not persisted. */
  styleNotice: string | null;
  setStyleNotice: (notice: string | null) => void;
  /** User-facing settings profile name — shown in the header, used as the Save Settings filename. */
  settingsName: string;
  setParam: <K extends keyof MoldParameters>(key: K, value: MoldParameters[K]) => void;
  /** Every style's latest settings; `params` is the current style's entry. */
  styleParams: StyleParams;
  /** Switch tabs: the new style's own settings (defaults the first time). One undoable step. */
  setStyle: (style: MoldStyle) => void;
  /** Per style: the settings as of its last Save/Load — what Revert returns to. */
  savedByStyle: StyleParams;
  setView: (update: Partial<MoldView>) => void;
  setSettingsName: (name: string) => void;
  reset: () => void;
  undo: () => void;
  redo: () => void;
  /** The CURRENT style's settings as of its last Save/Load Settings — the
   *  baseline Revert returns to. Derived from savedByStyle. */
  savedParams: MoldParameters | null;
  markSaved: (params: MoldParameters, name: string) => void;
  revertToSaved: () => void;
}

/** Undo/redo for the mold settings. Params only — the view toggles and the
 *  settings-file name are not part of the design, same rule as the handle. The
 *  VASE is deliberately out of scope: it has its own history, and two histories
 *  that can both restore vase params would disagree about the past the moment
 *  you switch tabs. */
export const moldHistory = createHistory<MoldParameters>(() => ({ ...DEFAULT_MOLD_PARAMETERS }));
export const useMoldHistory = moldHistory.useHistoryStore;

const INITIAL_PARAMS: MoldParameters = { ...DEFAULT_MOLD_PARAMETERS };

export const useMoldStore = create<MoldStore>((set, get) => ({
  params: INITIAL_PARAMS,
  view: { ...DEFAULT_VIEW },
  partColor: DEFAULT_PART_COLOR,
  styleNotice: null,
  setStyleNotice: (notice) => set({ styleNotice: notice }),
  setPartColor: (color) => {
    set({ partColor: color });
    try {
      if (color === DEFAULT_PART_COLOR) window.localStorage.removeItem(COLOR_KEY);
      else window.localStorage.setItem(COLOR_KEY, color);
    } catch { /* not remembered */ }
  },
  settingsName: DEFAULT_SETTINGS_NAME,
  setParam: (key, value) => {
    // Changing the style is a tab switch, never a relabel of these settings.
    if (key === 'moldStyle') { get().setStyle(value as MoldStyle); return; }
    set((state) => ({ params: { ...state.params, [key]: value } }));
  },
  // Starts in step with params, so an unrelated first change (the colour,
  // restored before the settings) doesn't look like a settings edit.
  styleParams: { [INITIAL_PARAMS.moldStyle]: INITIAL_PARAMS },
  setStyle: (style) => set((state) => (state.params.moldStyle === style ? {} : {
    params: state.styleParams[style] ?? { ...DEFAULT_MOLD_PARAMETERS, moldStyle: style },
  })),
  savedByStyle: {},
  setView: (update) =>
    set((state) => ({ view: { ...state.view, ...update } })),
  setSettingsName: (name) =>
    set({ settingsName: name.trim() || DEFAULT_SETTINGS_NAME }),
  // Keep the current style: Reset means "default settings for THIS mold", not
  // "back to Press 2-Pc" (Gary, 2026-07-30 — being thrown to another tab mid-work
  // was the annoyance, and moldStyle is a mode, not really a setting). Since
  // 2026-10-16 the other styles keep their own settings, so it resets this tab only.
  // The foot on/off switches are kept too (Gary, 2026-10-16): Reset restores the
  // foot's SETTINGS but leaves a foot that was on, on.
  reset: () => set((state) => {
    const p = state.params;
    return {
      params: {
        ...DEFAULT_MOLD_PARAMETERS,
        moldStyle: p.moldStyle,
        footEnabled: p.footEnabled,
        halvesFootPiece: p.halvesFootPiece,
        thirdsFootPiece: p.thirdsFootPiece,
      },
      settingsName: DEFAULT_SETTINGS_NAME,
    };
  }),

  undo: () => {
    const restored = moldHistory.undo(get().params);
    if (restored) { moldHistory.skipNextRecord(); set({ params: restored }); }
  },
  redo: () => {
    const restored = moldHistory.redo(get().params);
    if (restored) { moldHistory.skipNextRecord(); set({ params: restored }); }
  },

  savedParams: null,
  markSaved: (params, name) => set((state) => ({
    savedByStyle: { ...state.savedByStyle, [params.moldStyle]: params },
    savedParams: params.moldStyle === state.params.moldStyle ? params : state.savedParams,
    settingsName: name,
  })),
  revertToSaved: () => set((state) => (state.savedParams ? { params: state.savedParams } : {})),
}));

// ── localStorage persistence ──

let hydrated = false;
/** True once the stored settings have been read back (or found absent). */
let restored = false;

/**
 * Restore persisted params + settingsName (once per session). Call from a
 * client effect after mount — calling during render would make the first
 * client render differ from the server-rendered HTML.
 */
export function hydrateMoldSettingsFromStorage(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try { readStored(); } finally { restored = true; }
}

function readStored(): void {
  try {
    const c = window.localStorage.getItem(COLOR_KEY);
    if (c && /^#[0-9a-f]{6}$/i.test(c)) useMoldStore.setState({ partColor: c });
  } catch { /* keep the default colour */ }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { settingsName?: unknown; params?: unknown; savedParams?: unknown; styleParams?: unknown; savedByStyle?: unknown };
    // Restoring is not an edit — skip and clear, or the first undo would step
    // back to the bare defaults.
    moldHistory.skipNextRecord();
    useMoldHistory.getState().clear();
    const { params, retired } = retireMoldStyle(mergeMoldParameters(data.params));
    /** A stored per-style map, each entry pinned to its own key's style. */
    const readMap = (m: unknown): StyleParams | null => {
      if (!m || typeof m !== 'object') return null;
      const out: StyleParams = {};
      for (const st of ACTIVE_MOLD_STYLES) {
        const e = (m as Record<string, unknown>)[st];
        if (e && typeof e === 'object') out[st] = { ...mergeMoldParameters(e), moldStyle: st };
      }
      return out;
    };
    // Storage from before per-style settings: every style starts from the one
    // shared block, so nothing changes on first load.
    const styleParams: StyleParams = readMap(data.styleParams)
      ?? Object.fromEntries(ACTIVE_MOLD_STYLES.map((st) => [st, { ...params, moldStyle: st }]));
    styleParams[params.moldStyle] = params;
    let savedByStyle = readMap(data.savedByStyle);
    if (!savedByStyle) {
      savedByStyle = {};
      if (data.savedParams && typeof data.savedParams === 'object') {
        const sp = retireMoldStyle(mergeMoldParameters(data.savedParams)).params;
        savedByStyle[sp.moldStyle] = sp;
      }
    }
    useMoldStore.setState({
      params,
      styleParams,
      savedByStyle,
      styleNotice: retired ? retiredStyleNotice(retired) : null,
      settingsName:
        typeof data.settingsName === 'string' && data.settingsName.trim()
          ? data.settingsName
          : DEFAULT_SETTINGS_NAME,
      savedParams: savedByStyle[params.moldStyle] ?? null,
    });
  } catch {
    // Corrupted entry — keep defaults; the next change overwrites it.
  }
}

// Auto-save on every params/name change (view changes don't trigger a write).
let prevParams = useMoldStore.getState().params;
let prevName = useMoldStore.getState().settingsName;
let prevSaved = useMoldStore.getState().savedParams;
let prevStyleParams = useMoldStore.getState().styleParams;
useMoldStore.subscribe((state) => {
  // Keep this style's entry in step with params, whatever changed them (edit,
  // undo across a tab switch, reset, load), and the Revert baseline with the tab.
  const st = state.params.moldStyle;
  const savedNow = state.savedByStyle[st] ?? null;
  const mapStale = state.styleParams[st] !== state.params;
  if (mapStale || state.savedParams !== savedNow) {
    useMoldStore.setState({
      ...(mapStale ? { styleParams: { ...state.styleParams, [st]: state.params } } : {}),
      ...(state.savedParams !== savedNow ? { savedParams: savedNow } : {}),
    });
    return;   // the setState above re-enters with the synced state
  }
  if (state.params !== prevParams) moldHistory.recordChange(state.params);
  if (state.params === prevParams && state.settingsName === prevName && state.savedParams === prevSaved && state.styleParams === prevStyleParams) return;
  prevStyleParams = state.styleParams;
  prevParams = state.params;
  prevName = state.settingsName;
  prevSaved = state.savedParams;
  // Never write before the stored settings have been read back: a write
  // here would replace them with defaults (it did, 2026-10-16).
  if (typeof window === 'undefined' || !restored) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ settingsName: state.settingsName, params: state.params, styleParams: state.styleParams, savedByStyle: state.savedByStyle })
    );
  } catch {
    // Storage full/blocked — settings just won't persist this session.
  }
});
