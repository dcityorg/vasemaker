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
import type { MoldParameters } from '@/engine/mold/mold-types';
import { DEFAULT_MOLD_PARAMETERS, mergeMoldParameters } from '@/engine/mold/mold-types';

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

interface MoldStore {
  params: MoldParameters;
  view: MoldView;
  /** User-facing settings profile name — shown in the header, used as the Save Settings filename. */
  settingsName: string;
  setParam: <K extends keyof MoldParameters>(key: K, value: MoldParameters[K]) => void;
  setView: (update: Partial<MoldView>) => void;
  setSettingsName: (name: string) => void;
  reset: () => void;
}

export const useMoldStore = create<MoldStore>((set) => ({
  params: { ...DEFAULT_MOLD_PARAMETERS },
  view: { ...DEFAULT_VIEW },
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { settingsName?: unknown; params?: unknown };
    useMoldStore.setState({
      params: mergeMoldParameters(data.params),
      settingsName:
        typeof data.settingsName === 'string' && data.settingsName.trim()
          ? data.settingsName
          : DEFAULT_SETTINGS_NAME,
    });
  } catch {
    // Corrupted entry — keep defaults; the next change overwrites it.
  }
}

// Auto-save on every params/name change (view changes don't trigger a write).
let prevParams = useMoldStore.getState().params;
let prevName = useMoldStore.getState().settingsName;
useMoldStore.subscribe((state) => {
  if (state.params === prevParams && state.settingsName === prevName) return;
  prevParams = state.params;
  prevName = state.settingsName;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ settingsName: state.settingsName, params: state.params })
    );
  } catch {
    // Storage full/blocked — settings just won't persist this session.
  }
});
