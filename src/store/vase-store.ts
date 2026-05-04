/**
 * Zustand store for all vase parameters.
 * Single source of truth — UI reads from here, engine consumes this.
 */

import { create } from 'zustand';
import type { VaseParameters, ShapeType, ShapeParams, BezierPoint, CurvePointType } from '@/engine/types';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import type { Preset } from '@/presets';
import { applyPreset } from '@/presets';
import { BUILT_IN_PRESETS } from '@/config/presets';
import { recordChange, skipNextHistoryRecord, undo, redo, useHistoryStore } from './history';

interface VaseStore {
  // The full parameter state
  params: VaseParameters;

  // Dirty flag — true when params changed since last load/save/preset
  isDirty: boolean;
  markClean: () => void;

  // Actions — dimension
  setRadius: (radius: number) => void;
  setHeight: (height: number) => void;

  // Actions — profile
  setProfileEnabled: (enabled: boolean) => void;
  setProfilePoint: (index: number, point: BezierPoint) => void;
  addProfilePoint: (point: BezierPoint) => void;
  removeProfilePoint: (index: number) => void;
  setProfilePointType: (index: number, type: CurvePointType) => void;

  // Actions — shapes
  setBottomShape: (shape: ShapeType) => void;
  setTopShape: (shape: ShapeType) => void;
  setMorphEnabled: (enabled: boolean) => void;
  setBottomShapeParam: (shape: ShapeType, key: keyof ShapeParams, value: number) => void;
  setTopShapeParam: (shape: ShapeType, key: keyof ShapeParams, value: number) => void;

  // Actions — bezier twist
  setBezierTwist: (update: Partial<VaseParameters['bezierTwist']>) => void;
  setBezierTwistPoint: (index: number, point: BezierPoint) => void;
  addBezierTwistPoint: (point: BezierPoint) => void;
  removeBezierTwistPoint: (index: number) => void;
  setBezierTwistPointType: (index: number, type: CurvePointType) => void;

  // Actions — sine twist
  setSineTwist: (update: Partial<VaseParameters['sineTwist']>) => void;

  // Actions — smoothing
  setVerticalSmoothing: (update: Partial<VaseParameters['verticalSmoothing']>) => void;
  setRadialSmoothing: (update: Partial<VaseParameters['radialSmoothing']>) => void;

  // Actions — offset
  setFixedOffset: (update: Partial<VaseParameters['fixedOffset']>) => void;
  setBezierOffset: (update: Partial<VaseParameters['bezierOffset']>) => void;
  setBezierOffsetPointX: (index: number, point: BezierPoint) => void;
  setBezierOffsetPointY: (index: number, point: BezierPoint) => void;
  addBezierOffsetPointX: (point: BezierPoint) => void;
  addBezierOffsetPointY: (point: BezierPoint) => void;
  removeBezierOffsetPointX: (index: number) => void;
  removeBezierOffsetPointY: (index: number) => void;
  setBezierOffsetPointTypeX: (index: number, type: CurvePointType) => void;
  setBezierOffsetPointTypeY: (index: number, type: CurvePointType) => void;

  // Actions — textures
  setTexturesEnabled: (enabled: boolean) => void;
  setFluting: (update: Partial<VaseParameters['textures']['fluting']>) => void;
  setBasketWeave: (update: Partial<VaseParameters['textures']['basketWeave']>) => void;
  setVoronoi: (update: Partial<VaseParameters['textures']['voronoi']>) => void;
  setSimplex: (update: Partial<VaseParameters['textures']['simplex']>) => void;
  setWoodGrain: (update: Partial<VaseParameters['textures']['woodGrain']>) => void;
  setSvgPattern: (update: Partial<VaseParameters['textures']['svgPattern']>) => void;
  setSquareFlute: (update: Partial<VaseParameters['textures']['squareFlute']>) => void;
  setWaves: (update: Partial<VaseParameters['textures']['waves']>) => void;
  setRods: (update: Partial<VaseParameters['textures']['rods']>) => void;
  setVerticalFluting: (update: Partial<VaseParameters['textures']['verticalFluting']>) => void;
  setVerticalSquareFlute: (update: Partial<VaseParameters['textures']['verticalSquareFlute']>) => void;
  setVerticalWaves: (update: Partial<VaseParameters['textures']['verticalWaves']>) => void;
  setVerticalRods: (update: Partial<VaseParameters['textures']['verticalRods']>) => void;

  // Actions — smooth zones
  setSmoothZones: (update: Partial<VaseParameters['smoothZones']>) => void;

  // Actions — shell
  setWallThickness: (value: number) => void;
  setBottomThickness: (value: number) => void;
  setRimShape: (shape: 'flat' | 'rounded') => void;
  setSmoothInner: (value: boolean) => void;
  setMinWallThickness: (value: number) => void;

  // Actions — appearance
  setColor: (color: string) => void;
  setShowRulers: (show: boolean) => void;

  // Actions — resolution
  setResolution: (update: Partial<VaseParameters['resolution']>) => void;
  setFlatShading: (flat: boolean) => void;

  // Actions — presets
  loadPreset: (preset: Preset) => void;
  resetToDefaults: () => void;

  // Actions — undo/redo
  undo: () => void;
  redo: () => void;

  // Actions — get full params (for export)
  getParams: () => VaseParameters;
}

export const useVaseStore = create<VaseStore>((set, get) => ({
  params: { ...applyPreset(BUILT_IN_PRESETS[0]), color: '#0000ff' },
  isDirty: false,
  markClean: () => set({ isDirty: false }),

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
      const types = [...state.params.profilePointTypes];
      if (points.length >= 8) return state; // max 8 control points
      // Insert sorted by height fraction (index 1)
      const insertIdx = points.findIndex(p => p[1] > point[1]);
      if (insertIdx === -1) {
        points.push(point);
        types.push('handle');
      } else {
        points.splice(insertIdx, 0, point);
        types.splice(insertIdx, 0, 'handle');
      }
      return { params: { ...state.params, profilePoints: points, profilePointTypes: types } };
    }),
  removeProfilePoint: (index) =>
    set((state) => {
      const points = [...state.params.profilePoints];
      const types = [...state.params.profilePointTypes];
      if (points.length <= 2) return state; // min 2 control points
      if (index === 0 || index === points.length - 1) return state; // keep endpoints
      points.splice(index, 1);
      types.splice(index, 1);
      return { params: { ...state.params, profilePoints: points, profilePointTypes: types } };
    }),
  setProfilePointType: (index, type) =>
    set((state) => {
      const types = [...state.params.profilePointTypes];
      if (index <= 0 || index >= types.length - 1) return state; // endpoints stay fixed
      types[index] = type;
      return { params: { ...state.params, profilePointTypes: types } };
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

  // Bezier twist
  setBezierTwist: (update) =>
    set((state) => ({
      params: { ...state.params, bezierTwist: { ...state.params.bezierTwist, ...update } },
    })),
  setBezierTwistPoint: (index, point) =>
    set((state) => {
      const points = state.params.bezierTwist.points.map(p => [...p] as BezierPoint);
      points[index] = point;
      return {
        params: { ...state.params, bezierTwist: { ...state.params.bezierTwist, points } },
      };
    }),
  addBezierTwistPoint: (point) =>
    set((state) => {
      const points = state.params.bezierTwist.points.map(p => [...p] as BezierPoint);
      const types = [...state.params.bezierTwist.pointTypes];
      if (points.length >= 8) return state;
      const insertIdx = points.findIndex(p => p[1] > point[1]);
      const idx = insertIdx === -1 ? points.length : insertIdx;
      points.splice(idx, 0, point);
      types.splice(idx, 0, 'handle');
      return {
        params: { ...state.params, bezierTwist: { ...state.params.bezierTwist, points, pointTypes: types } },
      };
    }),
  removeBezierTwistPoint: (index) =>
    set((state) => {
      const points = state.params.bezierTwist.points.map(p => [...p] as BezierPoint);
      const types = [...state.params.bezierTwist.pointTypes];
      if (points.length <= 2) return state;
      if (index === 0 || index === points.length - 1) return state;
      points.splice(index, 1);
      types.splice(index, 1);
      return {
        params: { ...state.params, bezierTwist: { ...state.params.bezierTwist, points, pointTypes: types } },
      };
    }),
  setBezierTwistPointType: (index, type) =>
    set((state) => {
      const types = [...state.params.bezierTwist.pointTypes];
      if (index <= 0 || index >= types.length - 1) return state;
      types[index] = type;
      return {
        params: { ...state.params, bezierTwist: { ...state.params.bezierTwist, pointTypes: types } },
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
  setBezierOffsetPointX: (index, point) =>
    set((state) => {
      const pointsX = state.params.bezierOffset.pointsX.map(p => [...p] as BezierPoint);
      pointsX[index] = point;
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, pointsX } },
      };
    }),
  setBezierOffsetPointY: (index, point) =>
    set((state) => {
      const pointsY = state.params.bezierOffset.pointsY.map(p => [...p] as BezierPoint);
      pointsY[index] = point;
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, pointsY } },
      };
    }),
  addBezierOffsetPointX: (point) =>
    set((state) => {
      const pointsX = state.params.bezierOffset.pointsX.map(p => [...p] as BezierPoint);
      const typesX = [...state.params.bezierOffset.pointTypesX];
      if (pointsX.length >= 8) return state;
      const insertIdx = pointsX.findIndex(p => p[1] > point[1]);
      const idx = insertIdx === -1 ? pointsX.length : insertIdx;
      pointsX.splice(idx, 0, point);
      typesX.splice(idx, 0, 'handle');
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, pointsX, pointTypesX: typesX } },
      };
    }),
  addBezierOffsetPointY: (point) =>
    set((state) => {
      const pointsY = state.params.bezierOffset.pointsY.map(p => [...p] as BezierPoint);
      const typesY = [...state.params.bezierOffset.pointTypesY];
      if (pointsY.length >= 8) return state;
      const insertIdx = pointsY.findIndex(p => p[1] > point[1]);
      const idx = insertIdx === -1 ? pointsY.length : insertIdx;
      pointsY.splice(idx, 0, point);
      typesY.splice(idx, 0, 'handle');
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, pointsY, pointTypesY: typesY } },
      };
    }),
  removeBezierOffsetPointX: (index) =>
    set((state) => {
      const pointsX = state.params.bezierOffset.pointsX.map(p => [...p] as BezierPoint);
      const typesX = [...state.params.bezierOffset.pointTypesX];
      if (pointsX.length <= 2) return state;
      if (index === 0 || index === pointsX.length - 1) return state;
      pointsX.splice(index, 1);
      typesX.splice(index, 1);
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, pointsX, pointTypesX: typesX } },
      };
    }),
  removeBezierOffsetPointY: (index) =>
    set((state) => {
      const pointsY = state.params.bezierOffset.pointsY.map(p => [...p] as BezierPoint);
      const typesY = [...state.params.bezierOffset.pointTypesY];
      if (pointsY.length <= 2) return state;
      if (index === 0 || index === pointsY.length - 1) return state;
      pointsY.splice(index, 1);
      typesY.splice(index, 1);
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, pointsY, pointTypesY: typesY } },
      };
    }),
  setBezierOffsetPointTypeX: (index, type) =>
    set((state) => {
      const types = [...state.params.bezierOffset.pointTypesX];
      if (index <= 0 || index >= types.length - 1) return state;
      types[index] = type;
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, pointTypesX: types } },
      };
    }),
  setBezierOffsetPointTypeY: (index, type) =>
    set((state) => {
      const types = [...state.params.bezierOffset.pointTypesY];
      if (index <= 0 || index >= types.length - 1) return state;
      types[index] = type;
      return {
        params: { ...state.params, bezierOffset: { ...state.params.bezierOffset, pointTypesY: types } },
      };
    }),

  // Textures
  setTexturesEnabled: (enabled) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: { ...state.params.textures, enabled },
      },
    })),
  setFluting: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          fluting: { ...state.params.textures.fluting, ...update },
        },
      },
    })),
  setBasketWeave: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          basketWeave: { ...state.params.textures.basketWeave, ...update },
        },
      },
    })),
  setVoronoi: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          voronoi: { ...state.params.textures.voronoi, ...update },
        },
      },
    })),
  setSimplex: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          simplex: { ...state.params.textures.simplex, ...update },
        },
      },
    })),
  setWoodGrain: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          woodGrain: { ...state.params.textures.woodGrain, ...update },
        },
      },
    })),
  setSvgPattern: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          svgPattern: { ...state.params.textures.svgPattern, ...update },
        },
      },
    })),
  setSquareFlute: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          squareFlute: { ...state.params.textures.squareFlute, ...update },
        },
      },
    })),
  setWaves: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          waves: { ...state.params.textures.waves, ...update },
        },
      },
    })),
  setRods: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          rods: { ...state.params.textures.rods, ...update },
        },
      },
    })),
  setVerticalFluting: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          verticalFluting: { ...state.params.textures.verticalFluting, ...update },
        },
      },
    })),
  setVerticalSquareFlute: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          verticalSquareFlute: { ...state.params.textures.verticalSquareFlute, ...update },
        },
      },
    })),
  setVerticalWaves: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          verticalWaves: { ...state.params.textures.verticalWaves, ...update },
        },
      },
    })),
  setVerticalRods: (update) =>
    set((state) => ({
      params: {
        ...state.params,
        textures: {
          ...state.params.textures,
          verticalRods: { ...state.params.textures.verticalRods, ...update },
        },
      },
    })),

  // Smooth zones
  setSmoothZones: (update) =>
    set((state) => ({
      params: { ...state.params, smoothZones: { ...state.params.smoothZones, ...update } },
    })),

  // Shell
  setWallThickness: (value) =>
    set((state) => ({ params: { ...state.params, wallThickness: value } })),
  setBottomThickness: (value) =>
    set((state) => ({ params: { ...state.params, bottomThickness: value } })),
  setRimShape: (shape) =>
    set((state) => ({ params: { ...state.params, rimShape: shape } })),
  setSmoothInner: (value) =>
    set((state) => ({ params: { ...state.params, smoothInner: value } })),
  setMinWallThickness: (value) =>
    set((state) => ({ params: { ...state.params, minWallThickness: value } })),

  // Appearance
  setColor: (color) =>
    set((state) => ({ params: { ...state.params, color } })),
  setShowRulers: (show) =>
    set((state) => ({ params: { ...state.params, showRulers: show } })),

  // Resolution
  setResolution: (update) =>
    set((state) => ({
      params: { ...state.params, resolution: { ...state.params.resolution, ...update } },
    })),
  setFlatShading: (flat) =>
    set((state) => ({ params: { ...state.params, flatShading: flat } })),

  // Presets
  loadPreset: (preset) => {
    skipNextHistoryRecord();
    _skipNextDirty = true;
    useHistoryStore.getState().clear();
    set({ params: applyPreset(preset), isDirty: false });
  },
  resetToDefaults: () => {
    skipNextHistoryRecord();
    _skipNextDirty = true;
    useHistoryStore.getState().clear();
    set({ params: { ...DEFAULT_PARAMETERS }, isDirty: false });
  },

  // Undo/Redo
  undo: () => {
    const restored = undo(get().params);
    if (restored) {
      skipNextHistoryRecord();
      set({ params: restored });
    }
  },
  redo: () => {
    const restored = redo(get().params);
    if (restored) {
      skipNextHistoryRecord();
      set({ params: restored });
    }
  },

  // Export
  getParams: () => get().params,
}));

// Skip flag — set before load/preset/save/reset to prevent subscriber from marking dirty
let _skipNextDirty = false;
export function skipNextDirtyMark() { _skipNextDirty = true; }

// Subscribe to params changes for undo history + dirty flag
useVaseStore.subscribe(
  (state, prevState) => {
    recordChange(state.params);
    if (state.params !== prevState.params) {
      if (_skipNextDirty) {
        _skipNextDirty = false;
      } else {
        useVaseStore.setState({ isDirty: true });
      }
    }
  },
);
