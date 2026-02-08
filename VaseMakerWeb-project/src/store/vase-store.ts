/**
 * Zustand store for all vase parameters.
 * Single source of truth — UI reads from here, engine consumes this.
 */

import { create } from 'zustand';
import type { VaseParameters, ShapeType, ShapeParams, BezierPoint } from '@/engine/types';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import type { Preset } from '@/presets';
import { applyPreset } from '@/presets';

interface VaseStore {
  // The full parameter state
  params: VaseParameters;

  // Actions — dimension
  setRadius: (radius: number) => void;
  setHeight: (height: number) => void;

  // Actions — profile
  setProfileEnabled: (enabled: boolean) => void;
  setProfilePoint: (index: number, point: BezierPoint) => void;
  addProfilePoint: (point: BezierPoint) => void;
  removeProfilePoint: (index: number) => void;

  // Actions — shapes
  setBottomShape: (shape: ShapeType) => void;
  setTopShape: (shape: ShapeType) => void;
  setMorphEnabled: (enabled: boolean) => void;
  setBottomShapeParam: (shape: ShapeType, key: keyof ShapeParams, value: number) => void;
  setTopShapeParam: (shape: ShapeType, key: keyof ShapeParams, value: number) => void;

  // Actions — radial ripple
  setRadialRipple: (update: Partial<VaseParameters['radialRipple']>) => void;

  // Actions — vertical ripple
  setVerticalRipple: (update: Partial<VaseParameters['verticalRipple']>) => void;

  // Actions — bezier twist
  setBezierTwist: (update: Partial<VaseParameters['bezierTwist']>) => void;
  setBezierTwistPoint: (index: number, value: number) => void;
  addBezierTwistPoint: (value: number, afterIndex: number) => void;
  removeBezierTwistPoint: (index: number) => void;

  // Actions — sine twist
  setSineTwist: (update: Partial<VaseParameters['sineTwist']>) => void;

  // Actions — smoothing
  setVerticalSmoothing: (update: Partial<VaseParameters['verticalSmoothing']>) => void;
  setRadialSmoothing: (update: Partial<VaseParameters['radialSmoothing']>) => void;

  // Actions — offset
  setFixedOffset: (update: Partial<VaseParameters['fixedOffset']>) => void;
  setBezierOffset: (update: Partial<VaseParameters['bezierOffset']>) => void;
  setBezierOffsetPointX: (index: number, value: number) => void;
  setBezierOffsetPointY: (index: number, value: number) => void;
  addBezierOffsetPoint: (afterIndex: number) => void;
  removeBezierOffsetPoint: (index: number) => void;

  // Actions — resolution
  setPreviewResolution: (update: Partial<VaseParameters['previewResolution']>) => void;

  // Actions — presets
  loadPreset: (preset: Preset) => void;
  resetToDefaults: () => void;

  // Actions — get full params (for export)
  getParams: () => VaseParameters;
}

export const useVaseStore = create<VaseStore>((set, get) => ({
  params: { ...DEFAULT_PARAMETERS },

  // Dimensions
  setRadius: (radius) =>
    set((state) => ({ params: { ...state.params, radius } })),
  setHeight: (height) =>
    set((state) => ({ params: { ...state.params, height } })),

  // Profile
  setProfileEnabled: (enabled) =>
    set((state) => ({ params: { ...state.params, profileEnabled: enabled } })),
  setProfilePoint: (index, point) =>
    set((state) => {
      const points = [...state.params.profilePoints];
      points[index] = point;
      return { params: { ...state.params, profilePoints: points } };
    }),
  addProfilePoint: (point) =>
    set((state) => {
      const points = [...state.params.profilePoints];
      if (points.length >= 8) return state; // max 8 control points
      // Insert sorted by height fraction (index 1)
      const insertIdx = points.findIndex(p => p[1] > point[1]);
      if (insertIdx === -1) {
        points.push(point);
      } else {
        points.splice(insertIdx, 0, point);
      }
      return { params: { ...state.params, profilePoints: points } };
    }),
  removeProfilePoint: (index) =>
    set((state) => {
      const points = [...state.params.profilePoints];
      if (points.length <= 2) return state; // min 2 control points
      if (index === 0 || index === points.length - 1) return state; // keep endpoints
      points.splice(index, 1);
      return { params: { ...state.params, profilePoints: points } };
    }),

  // Shapes
  setBottomShape: (shape) =>
    set((state) => ({ params: { ...state.params, bottomShape: shape } })),
  setTopShape: (shape) =>
    set((state) => ({ params: { ...state.params, topShape: shape } })),
  setMorphEnabled: (enabled) =>
    set((state) => ({ params: { ...state.params, morphEnabled: enabled } })),
  setBottomShapeParam: (shape, key, value) =>
    set((state) => ({
      params: {
        ...state.params,
        bottomShapeParams: {
          ...state.params.bottomShapeParams,
          [shape]: { ...state.params.bottomShapeParams[shape], [key]: value },
        },
      },
    })),
  setTopShapeParam: (shape, key, value) =>
    set((state) => ({
      params: {
        ...state.params,
        topShapeParams: {
          ...state.params.topShapeParams,
          [shape]: { ...state.params.topShapeParams[shape], [key]: value },
        },
      },
    })),

  // Radial ripple
  setRadialRipple: (update) =>
    set((state) => ({
      params: { ...state.params, radialRipple: { ...state.params.radialRipple, ...update } },
    })),

  // Vertical ripple
  setVerticalRipple: (update) =>
    set((state) => ({
      params: { ...state.params, verticalRipple: { ...state.params.verticalRipple, ...update } },
    })),

  // Bezier twist
  setBezierTwist: (update) =>
    set((state) => ({
      params: { ...state.params, bezierTwist: { ...state.params.bezierTwist, ...update } },
    })),
  setBezierTwistPoint: (index, value) =>
    set((state) => {
      const points = [...state.params.bezierTwist.points];
      points[index] = value;
      return {
        params: { ...state.params, bezierTwist: { ...state.params.bezierTwist, points } },
      };
    }),
  addBezierTwistPoint: (value, afterIndex) =>
    set((state) => {
      const points = [...state.params.bezierTwist.points];
      if (points.length >= 8) return state;
      points.splice(afterIndex + 1, 0, value);
      return {
        params: { ...state.params, bezierTwist: { ...state.params.bezierTwist, points } },
      };
    }),
  removeBezierTwistPoint: (index) =>
    set((state) => {
      const points = [...state.params.bezierTwist.points];
      if (points.length <= 2) return state;
      if (index === 0 || index === points.length - 1) return state;
      points.splice(index, 1);
      return {
        params: { ...state.params, bezierTwist: { ...state.params.bezierTwist, points } },
      };
    }),

  // Sine twist
  setSineTwist: (update) =>
    set((state) => ({
      params: { ...state.params, sineTwist: { ...state.params.sineTwist, ...update } },
    })),

  // Smoothing
  setVerticalSmoothing: (update) =>
    set((state) => ({
      params: { ...state.params, verticalSmoothing: { ...state.params.verticalSmoothing, ...update } },
    })),
  setRadialSmoothing: (update) =>
    set((state) => ({
      params: { ...state.params, radialSmoothing: { ...state.params.radialSmoothing, ...update } },
    })),

  // Offset
  setFixedOffset: (update) =>
    set((state) => ({
      params: { ...state.params, fixedOffset: { ...state.params.fixedOffset, ...update } },
    })),
  setBezierOffset: (update) =>
    set((state) => ({
      params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, ...update } },
    })),
  setBezierOffsetPointX: (index, value) =>
    set((state) => {
      const points = state.params.bezierOffset.points.map(p => [...p] as [number, number]);
      points[index][0] = value;
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, points } },
      };
    }),
  setBezierOffsetPointY: (index, value) =>
    set((state) => {
      const points = state.params.bezierOffset.points.map(p => [...p] as [number, number]);
      points[index][1] = value;
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, points } },
      };
    }),
  addBezierOffsetPoint: (afterIndex) =>
    set((state) => {
      const points = state.params.bezierOffset.points.map(p => [...p] as [number, number]);
      if (points.length >= 8) return state;
      points.splice(afterIndex + 1, 0, [0, 0]);
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, points } },
      };
    }),
  removeBezierOffsetPoint: (index) =>
    set((state) => {
      const points = state.params.bezierOffset.points.map(p => [...p] as [number, number]);
      if (points.length <= 2) return state;
      if (index === 0 || index === points.length - 1) return state;
      points.splice(index, 1);
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, points } },
      };
    }),

  // Resolution
  setPreviewResolution: (update) =>
    set((state) => ({
      params: { ...state.params, previewResolution: { ...state.params.previewResolution, ...update } },
    })),

  // Presets
  loadPreset: (preset) =>
    set({ params: applyPreset(preset) }),
  resetToDefaults: () =>
    set({ params: { ...DEFAULT_PARAMETERS } }),

  // Export
  getParams: () => get().params,
}));
