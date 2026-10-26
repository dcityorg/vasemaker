/**
 * Preset registry — logic for loading and applying presets.
 * Preset data lives in @/config/presets.ts for easy editing.
 */

import type { VaseParameters, CurvePointType, BezierPoint } from '@/engine/types';
import { DEFAULT_PARAMETERS } from './defaults';
import { mergeSprigParameters, DEFAULT_MARK_PARAMETERS } from '@/engine/sprig/sprig-types';

// Re-export preset data and types from config
export type { Preset } from '@/config/presets';
export { BUILT_IN_PRESETS } from '@/config/presets';
import { BUILT_IN_PRESETS as PRESET_LIST } from '@/config/presets';
/** No name yet: none, 'Untitled', or just the name of the preset it started
 *  from (saving under that would give every vase from it the same file name). */
export const isVaseUnnamed = (name: string | null) =>
  !name || !name.trim() || name === 'Untitled' || PRESET_LIST.some((p) => p.name === name);

/**
 * Deep merge a partial parameter set with defaults.
 */
export function applyPreset(preset: { parameters: Partial<VaseParameters> }): VaseParameters {
  const merged = deepMerge(DEFAULT_PARAMETERS, preset.parameters);
  return normalizeCurves(merged);
}

/**
 * Migrate old save shapes and ensure type arrays match point arrays.
 * - bezierTwist.points: number[] (old) → BezierPoint[] with implicit heights
 * - bezierOffset.points: [number, number][] (old) → pointsX/pointsY split with implicit heights
 */
function normalizeCurves(params: VaseParameters): VaseParameters {
  const profileTypes = matchTypeLength(params.profilePoints.length, params.profilePointTypes);

  // Twist: migrate number[] → BezierPoint[]
  const rawTwist = params.bezierTwist.points as unknown as Array<number | BezierPoint>;
  let twistPoints: BezierPoint[];
  if (rawTwist.length > 0 && typeof rawTwist[0] === 'number') {
    const N = rawTwist.length;
    twistPoints = (rawTwist as number[]).map((v, i) => [v, N > 1 ? i / (N - 1) : 0]);
  } else {
    twistPoints = rawTwist as BezierPoint[];
  }
  const twistTypes = matchTypeLength(twistPoints.length, params.bezierTwist.pointTypes);

  // Offset: migrate legacy { points: [x,y][] } → split { pointsX, pointsY }
  const rawOffset = params.bezierOffset as unknown as VaseParameters['bezierOffset'] & {
    points?: [number, number][];
  };
  let pointsX: BezierPoint[];
  let pointsY: BezierPoint[];
  if (rawOffset.points && (!rawOffset.pointsX || !rawOffset.pointsY)) {
    const N = rawOffset.points.length;
    pointsX = rawOffset.points.map((p, i) => [p[0], N > 1 ? i / (N - 1) : 0]);
    pointsY = rawOffset.points.map((p, i) => [p[1], N > 1 ? i / (N - 1) : 0]);
  } else {
    pointsX = rawOffset.pointsX;
    pointsY = rawOffset.pointsY;
  }
  const offsetXTypes = matchTypeLength(pointsX.length, rawOffset.pointTypesX);
  const offsetYTypes = matchTypeLength(pointsY.length, rawOffset.pointTypesY);

  // A stored mark is a sprig design: fill in anything an older copy lacks.
  // `recessPrint` (2026-10-26, never released; replaced by `footOn`) is dropped.
  const { recessPrint: _gone, ...rest } = params.bottom as VaseParameters['bottom'] & { recessPrint?: boolean };
  void _gone;
  const bottom: VaseParameters['bottom'] = {
    ...rest,
    mark: rest.mark ? { ...mergeSprigParameters(rest.mark, DEFAULT_MARK_PARAMETERS), backing: 'none', textStyle: 'raised' } : null,
  };

  return {
    ...params,
    bottom,
    profilePointTypes: profileTypes,
    bezierTwist: { ...params.bezierTwist, points: twistPoints, pointTypes: twistTypes },
    bezierOffset: {
      enabled: rawOffset.enabled,
      scaleX: rawOffset.scaleX,
      scaleY: rawOffset.scaleY,
      pointsX,
      pointsY,
      pointTypesX: offsetXTypes,
      pointTypesY: offsetYTypes,
    },
  };
}

function matchTypeLength(targetLength: number, types?: CurvePointType[]): CurvePointType[] {
  if (types && types.length === targetLength) {
    const out = types.slice();
    if (targetLength > 0) out[0] = 'fixed';
    if (targetLength > 1) out[targetLength - 1] = 'fixed';
    return out;
  }
  const out: CurvePointType[] = new Array(targetLength);
  for (let i = 0; i < targetLength; i++) out[i] = 'handle';
  if (targetLength > 0) out[0] = 'fixed';
  if (targetLength > 1) out[targetLength - 1] = 'fixed';
  return out;
}

/** Simple deep merge (source overrides target) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
      targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}
