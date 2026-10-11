/**
 * Zustand store for MoldMaker settings. Independent of vase-store — MoldMaker
 * reads the live vase design from vase-store and layers these mold settings on top.
 * Deliberately simple: no undo/dirty (mold settings are lightweight relative to
 * the vase design, which owns its own persistence).
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
import { DEFAULT_MOLD_PARAMETERS, mergeMoldParameters, retireMoldStyle } from '@/engine/mold/mold-types';

const RETIRED_LABELS: Partial<Record<MoldStyle, string>> = {
  twoPart: 'Press 2-Pc', onePiece: 'Pour 1-Pc', pourTwoPiece: 'Pour 2-Pc',
};
/** The one-line notice for settings moved off a hidden style. */
export function retiredStyleNotice(style: MoldStyle): string {
  return `These settings were for ${RETIRED_LABELS[style] ?? style}, which is no longer offered — switched to Pour 3-Pc.`;
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
  setView: (update: Partial<MoldView>) => void;
  setSettingsName: (name: string) => void;
  reset: () => void;
  undo: () => void;
  redo: () => void;
  /** Params as of the last Save/Load Settings — the baseline Revert returns to. */
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

export const useMoldStore = create<MoldStore>((set, get) => ({
  params: { ...DEFAULT_MOLD_PARAMETERS },
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
  setParam: (key, value) =>
    set((state) => ({ params: { ...state.params, [key]: value } })),
  setView: (update) =>
    set((state) => ({ view: { ...state.view, ...update } })),
  setSettingsName: (name) =>
    set({ settingsName: name.trim() || DEFAULT_SETTINGS_NAME }),
  // Keep the current style: Reset means "default settings for THIS mold", not
  // "back to Press 2-Pc" (Gary, 2026-07-30 — being thrown to another tab mid-work
  // was the annoyance, and moldStyle is a mode, not really a setting).
  reset: () => set((state) => ({
    params: { ...DEFAULT_MOLD_PARAMETERS, moldStyle: state.params.moldStyle },
    settingsName: DEFAULT_SETTINGS_NAME,
  })),

  undo: () => {
    const restored = moldHistory.undo(get().params);
    if (restored) { moldHistory.skipNextRecord(); set({ params: restored }); }
  },
  redo: () => {
    const restored = moldHistory.redo(get().params);
    if (restored) { moldHistory.skipNextRecord(); set({ params: restored }); }
  },

  savedParams: null,
  markSaved: (params, name) => set({ savedParams: params, settingsName: name }),
  revertToSaved: () => set((state) => (state.savedParams ? { params: state.savedParams } : {})),
}));

// ── localStorage persistence ──

let hydrated = false;

/**
 * Restore persisted params + settingsName (once per session). Call from a
 * client effect after mount — calling during render would make the first
 * client render differ from the server-rendered HTML.
 */
export function hydrateMoldSettingsFromStorage(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const c = window.localStorage.getItem(COLOR_KEY);
    if (c && /^#[0-9a-f]{6}$/i.test(c)) useMoldStore.setState({ partColor: c });
  } catch { /* keep the default colour */ }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { settingsName?: unknown; params?: unknown; savedParams?: unknown };
    // Restoring is not an edit — skip and clear, or the first undo would step
    // back to the bare defaults.
    moldHistory.skipNextRecord();
    useMoldHistory.getState().clear();
    const { params, retired } = retireMoldStyle(mergeMoldParameters(data.params));
    const saved = data.savedParams && typeof data.savedParams === 'object'
      ? retireMoldStyle(mergeMoldParameters(data.savedParams)).params
      : null;
    useMoldStore.setState({
      params,
      styleNotice: retired ? retiredStyleNotice(retired) : null,
      settingsName:
        typeof data.settingsName === 'string' && data.settingsName.trim()
          ? data.settingsName
          : DEFAULT_SETTINGS_NAME,
      savedParams: saved,
    });
  } catch {
    // Corrupted entry — keep defaults; the next change overwrites it.
  }
}

// Auto-save on every params/name change (view changes don't trigger a write).
let prevParams = useMoldStore.getState().params;
let prevName = useMoldStore.getState().settingsName;
let prevSaved = useMoldStore.getState().savedParams;
useMoldStore.subscribe((state) => {
  if (state.params !== prevParams) moldHistory.recordChange(state.params);
  if (state.params === prevParams && state.settingsName === prevName && state.savedParams === prevSaved) return;
  prevParams = state.params;
  prevName = state.settingsName;
  prevSaved = state.savedParams;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ settingsName: state.settingsName, params: state.params, savedParams: state.savedParams })
    );
  } catch {
    // Storage full/blocked — settings just won't persist this session.
  }
});
