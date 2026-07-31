/**
 * Zustand store for HandleMaker. Self-contained (the handle design lives here,
 * unlike MoldMaker which reads the vase design). Same persistence model as the
 * mold store: params + settingsName auto-save to localStorage on every change,
 * restored once per session from a mount effect; view toggles are ephemeral.
 */

import { create } from 'zustand';
import type { BezierPoint } from '@/engine/types';
import type { HandleParameters, WindowExtents } from '@/engine/handle/handle-types';
import {
  DEFAULT_HANDLE_PARAMETERS,
  mergeHandleParameters,
  controlBounds,
  fitWindowTo,
  growWindowFor,
} from '@/engine/handle/handle-types';
import { measureSpine } from '@/engine/handle/spine';
import type { HandlePreset } from '@/config/handle-presets';

export const DEFAULT_HANDLE_SETTINGS_NAME = 'handle design';
const STORAGE_KEY = 'vasemaker-handle-settings';
const MAX_SPINE_POINTS = 8;
const MIN_SPINE_POINTS = 3;
/** Smallest drawing area a window edge may be dragged down to, mm. */
const MIN_WINDOW_SEP = 10;

export interface HandleView {
  showHandle: boolean;
  showWells: boolean;
  showPlate: boolean;
  /** The two wall copies toggle separately (the Pour 3-Pc Shell A/B pattern) so
   *  one can be hidden to inspect the wall-to-plate joint. */
  showWallA: boolean;
  showWallB: boolean;
  showPlaster: boolean;
  /** Per-face normals — creases the V ridges instead of rounding them off. */
  flatShading: boolean;
}

const DEFAULT_VIEW: HandleView = {
  showHandle: true,
  showWells: true,
  showPlate: true,
  showWallA: false,
  showWallB: false,
  showPlaster: false,
  flatShading: false,
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
  /** Scale the spine vertically until the two ends are `span` mm apart. */
  setSpineSpan: (span: number) => void;
  /** Scale the spine horizontally until it reaches `maxX` mm from the wall. */
  setSpineDepth: (maxX: number) => void;
  /** Move a drawing-area edge, refusing to hide a control point. */
  setWindowEdge: (edge: keyof WindowExtents, value: number) => void;
  /** Shrink the drawing area back onto the control points. */
  fitWindow: () => void;
  /** Slide the whole design so the lower attachment end sits at y = 0. */
  reOriginSpine: () => void;
  applyPreset: (preset: HandlePreset) => void;
  reset: () => void;
}

/** Rescale the spine about an anchor and re-open the window if it grew past it. */
function scaledParams(
  params: HandleParameters,
  factor: number,
  axis: 'x' | 'y',
  anchor: number
): HandleParameters {
  if (!Number.isFinite(factor) || factor <= 0) return params;
  const pts = params.spinePoints.map(([x, y]) =>
    axis === 'y'
      ? ([x, anchor + (y - anchor) * factor] as BezierPoint)
      : ([Math.max(0, x * factor), y] as BezierPoint)
  );
  return { ...params, spinePoints: pts, ...growWindowFor(pts, params) };
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
      const { winRight, winTop, winBottom } = state.params;
      const x = Math.max(0, Math.min(winRight, point[0]));
      const y = Math.max(winBottom, Math.min(winTop, point[1]));
      const isEnd = index === 0 || index === pts.length - 1;
      // Endpoints stay anchored to the vase-wall plane (x=0); their height is
      // free (hook shapes) within the drawing area.
      pts[index] = isEnd ? [0, y] : [x, y];
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

  setSpineSpan: (span) =>
    set((state) => {
      const p = state.params;
      const pts = p.spinePoints;
      const m = measureSpine(pts, p.spineTypes);
      // Both ends at the same height leaves no span to scale by (a handle that
      // leaves and returns to the same spot) — fall back to the overall extent
      // so the slider still does something sensible instead of dividing by 0.
      const current = m.span > 1e-6 ? m.span : m.overallHeight;
      if (current <= 1e-6 || span <= 0) return state;
      // The lower attachment end stays put; the handle grows upward.
      const anchor = Math.min(pts[0][1], pts[pts.length - 1][1]);
      return { params: scaledParams(p, span / current, 'y', anchor) };
    }),

  setSpineDepth: (maxX) =>
    set((state) => {
      const p = state.params;
      const m = measureSpine(p.spinePoints, p.spineTypes);
      if (m.maxX <= 1e-6 || maxX <= 0) return state;
      return { params: scaledParams(p, maxX / m.maxX, 'x', 0) };
    }),

  setWindowEdge: (edge, value) =>
    set((state) => {
      const p = state.params;
      const b = controlBounds(p.spinePoints);
      // Never hide a control point — an off-window point can't be grabbed back.
      let next: number;
      if (edge === 'winRight') next = Math.max(value, b.maxX, MIN_WINDOW_SEP);
      else if (edge === 'winTop') next = Math.max(value, b.maxY, p.winBottom + MIN_WINDOW_SEP);
      else next = Math.min(value, b.minY, p.winTop - MIN_WINDOW_SEP);
      return { params: { ...p, [edge]: Math.round(next * 10) / 10 } };
    }),

  fitWindow: () =>
    set((state) => ({ params: { ...state.params, ...fitWindowTo(state.params.spinePoints) } })),

  reOriginSpine: () =>
    set((state) => {
      const p = state.params;
      const pts = p.spinePoints;
      const dy = -Math.min(pts[0][1], pts[pts.length - 1][1]);
      if (Math.abs(dy) < 1e-9) return state;
      return {
        params: {
          ...p,
          spinePoints: pts.map(([x, y]) => [x, y + dy] as BezierPoint),
          // The window slides with it, so the drawing doesn't move at all —
          // only the numbers on the axis change, which is the whole point.
          winTop: p.winTop + dy,
          winBottom: p.winBottom + dy,
        },
      };
    }),

  applyPreset: (preset) =>
    set((state) => {
      const spinePoints = (preset.params.spinePoints ?? state.params.spinePoints).map(
        (p) => [...p] as BezierPoint
      );
      return {
        params: {
          ...state.params,
          ...preset.params,
          spinePoints,
          spineTypes: [...(preset.params.spineTypes ?? state.params.spineTypes)],
          // Presets carry a shape, not a viewport — frame it on arrival.
          ...fitWindowTo(spinePoints),
        },
      };
    }),

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
