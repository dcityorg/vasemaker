/**
 * Zustand store for HandleMaker. Self-contained (the handle design lives here,
 * unlike MoldMaker which reads the vase design). Same persistence model as the
 * mold store: params + settingsName auto-save to localStorage on every change,
 * restored once per session from a mount effect; view toggles are ephemeral.
 */

import { create } from 'zustand';
import type { BezierPoint } from '@/engine/types';
import type { HandleParameters } from '@/engine/handle/handle-types';
import { DEFAULT_HANDLE_PARAMETERS, mergeHandleParameters } from '@/engine/handle/handle-types';
import type { HandlePreset } from '@/config/handle-presets';

export const DEFAULT_HANDLE_SETTINGS_NAME = 'handle design';
const STORAGE_KEY = 'vasemaker-handle-settings';
const MAX_SPINE_POINTS = 8;
const MIN_SPINE_POINTS = 3;

export interface HandleView {
  showHandle: boolean;
  showPlate: boolean;
  showWalls: boolean;
  showPlaster: boolean;
}

const DEFAULT_VIEW: HandleView = {
  showHandle: true,
  showPlate: true,
  showWalls: false,
  showPlaster: false,
};

function freshDefaults(): HandleParameters {
  return mergeHandleParameters(DEFAULT_HANDLE_PARAMETERS);
}

interface HandleStore {
  params: HandleParameters;
  view: HandleView;
  settingsName: string;
  setParam: <K extends keyof HandleParameters>(key: K, value: HandleParameters[K]) => void;
  setView: (update: Partial<HandleView>) => void;
  setSettingsName: (name: string) => void;
  setSpinePoint: (index: number, point: BezierPoint) => void;
  addSpinePoint: (point: BezierPoint) => void;
  removeSpinePoint: (index: number) => void;
  toggleSpineType: (index: number) => void;
  applyPreset: (preset: HandlePreset) => void;
  reset: () => void;
}

export const useHandleStore = create<HandleStore>((set) => ({
  params: freshDefaults(),
  view: { ...DEFAULT_VIEW },
  settingsName: DEFAULT_HANDLE_SETTINGS_NAME,

  setParam: (key, value) =>
    set((state) => ({ params: { ...state.params, [key]: value } })),

  setView: (update) => set((state) => ({ view: { ...state.view, ...update } })),

  setSettingsName: (name) =>
    set({ settingsName: name.trim() || DEFAULT_HANDLE_SETTINGS_NAME }),

  setSpinePoint: (index, point) =>
    set((state) => {
      const pts = state.params.spinePoints.map((p) => [...p] as BezierPoint);
      if (index < 0 || index >= pts.length) return state;
      const isEnd = index === 0 || index === pts.length - 1;
      // Endpoints stay anchored to the vase-wall plane (x=0); their y is
      // already locked by the editor (0 / 1).
      pts[index] = isEnd ? [0, index === 0 ? 0 : 1] : point;
      return { params: { ...state.params, spinePoints: pts } };
    }),

  addSpinePoint: (point) =>
    set((state) => {
      const { spinePoints, spineTypes } = state.params;
      if (spinePoints.length >= MAX_SPINE_POINTS) return state;
      // Insert sorted by height so the point order follows the curve
      let idx = spinePoints.length - 1;
      for (let i = 1; i < spinePoints.length; i++) {
        if (point[1] < spinePoints[i][1]) {
          idx = i;
          break;
        }
      }
      const pts = spinePoints.map((p) => [...p] as BezierPoint);
      const types = [...spineTypes];
      pts.splice(idx, 0, point);
      types.splice(idx, 0, 'handle');
      return { params: { ...state.params, spinePoints: pts, spineTypes: types } };
    }),

  removeSpinePoint: (index) =>
    set((state) => {
      const { spinePoints, spineTypes } = state.params;
      if (spinePoints.length <= MIN_SPINE_POINTS) return state;
      if (index <= 0 || index >= spinePoints.length - 1) return state;
      const pts = spinePoints.filter((_, i) => i !== index);
      const types = spineTypes.filter((_, i) => i !== index);
      return { params: { ...state.params, spinePoints: pts, spineTypes: types } };
    }),

  toggleSpineType: (index) =>
    set((state) => {
      const { spineTypes } = state.params;
      if (index <= 0 || index >= spineTypes.length - 1) return state;
      const types = [...spineTypes];
      types[index] = types[index] === 'fixed' ? 'handle' : 'fixed';
      return { params: { ...state.params, spineTypes: types } };
    }),

  applyPreset: (preset) =>
    set((state) => ({
      params: {
        ...state.params,
        ...preset.params,
        spinePoints: (preset.params.spinePoints ?? state.params.spinePoints).map(
          (p) => [...p] as BezierPoint
        ),
        spineTypes: [...(preset.params.spineTypes ?? state.params.spineTypes)],
      },
    })),

  reset: () => set({ params: freshDefaults(), settingsName: DEFAULT_HANDLE_SETTINGS_NAME }),
}));

// ── localStorage persistence (mirrors mold-store) ──

let hydrated = false;

/** Restore persisted params + name (once per session, from a client mount effect). */
export function hydrateHandleSettingsFromStorage(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { settingsName?: unknown; params?: unknown };
    useHandleStore.setState({
      params: mergeHandleParameters(data.params),
      settingsName:
        typeof data.settingsName === 'string' && data.settingsName.trim()
          ? data.settingsName
          : DEFAULT_HANDLE_SETTINGS_NAME,
    });
  } catch {
    // Corrupted entry — keep defaults; the next change overwrites it.
  }
}

let prevParams = useHandleStore.getState().params;
let prevName = useHandleStore.getState().settingsName;
useHandleStore.subscribe((state) => {
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
