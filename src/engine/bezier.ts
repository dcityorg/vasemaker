/**
 * Bezier curve evaluation using de Casteljau's algorithm.
 * Replaces the BezierScad.scad library from the OpenSCAD version.
 *
 * Supports 2–8 control points, matching the OpenSCAD version's capability.
 */

import type { BezierPoint, CurvePointType } from './types';

/**
 * Evaluate a point along a Bezier curve at parameter t (0–1).
 * Control points are [value, heightFraction] pairs.
 * Returns [value, heightFraction] at parameter t.
 *
 * This is equivalent to PointAlongBez() in BezierScad.scad.
 */
export function evaluateBezier(t: number, controlPoints: BezierPoint[]): BezierPoint {
  const n = controlPoints.length;
  if (n === 0) return [0, 0];
  if (n === 1) return controlPoints[0];

  // De Casteljau's algorithm
  // Copy control points so we don't mutate the original
  let points: BezierPoint[] = controlPoints.map(p => [p[0], p[1]]);

  for (let level = 1; level < n; level++) {
    for (let i = 0; i < n - level; i++) {
      points[i] = [
        (1 - t) * points[i][0] + t * points[i + 1][0],
        (1 - t) * points[i][1] + t * points[i + 1][1],
      ];
    }
  }

  return points[0];
}

/**
 * Evaluate a Bezier curve where control points are evenly spaced
 * and only the "value" dimension matters (used for twist, offset).
 * Takes an array of scalar values, returns the interpolated value at t.
 *
 * This matches how the OpenSCAD version uses Bezier for twist and offset:
 * control points are [value, 0] with even vertical spacing assumed.
 */
export function evaluateBezierScalar(t: number, values: number[]): number {
  const points: BezierPoint[] = values.map(v => [v, 0]);
  return evaluateBezier(t, points)[0];
}

/**
 * Synthesize default types if missing or wrong length.
 * Endpoints are always 'fixed'; everything else defaults to 'handle'.
 */
function normalizeTypes(length: number, types?: CurvePointType[]): CurvePointType[] {
  if (types && types.length === length) {
    const normalized = types.slice();
    if (length > 0) normalized[0] = 'fixed';
    if (length > 1) normalized[length - 1] = 'fixed';
    return normalized;
  }
  const out: CurvePointType[] = new Array(length);
  for (let i = 0; i < length; i++) out[i] = 'handle';
  if (length > 0) out[0] = 'fixed';
  if (length > 1) out[length - 1] = 'fixed';
  return out;
}

/**
 * Evaluate a piecewise Bezier where each control point is either 'fixed' (curve passes through it)
 * or 'handle' (curve is pulled toward it but doesn't touch it). The curve is split into sub-Beziers
 * at each fixed point. A pair of adjacent fixed points with no handles between them gives a straight line.
 *
 * Sub-segments are mapped onto the parametric t range using each fixed point's y-value (heightFraction).
 * Outside the range of fixed-point y-values, the result is clamped to the first/last segment.
 */
export function evaluatePiecewiseBezier(
  t: number,
  controlPoints: BezierPoint[],
  pointTypes?: CurvePointType[]
): BezierPoint {
  const n = controlPoints.length;
  if (n === 0) return [0, 0];
  if (n === 1) return controlPoints[0];

  const types = normalizeTypes(n, pointTypes);

  // Collect indices of fixed points (always includes 0 and n-1)
  const fixedIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (types[i] === 'fixed') fixedIdx.push(i);
  }
  if (fixedIdx.length < 2) return evaluateBezier(t, controlPoints);

  // Find the segment containing t based on the y-values of the fixed points
  let s = 0;
  for (let k = 0; k < fixedIdx.length - 1; k++) {
    const yLo = controlPoints[fixedIdx[k]][1];
    const yHi = controlPoints[fixedIdx[k + 1]][1];
    if (t <= yHi || k === fixedIdx.length - 2) {
      s = k;
      if (t <= yHi) break;
    }
  }

  const iLo = fixedIdx[s];
  const iHi = fixedIdx[s + 1];
  const yLo = controlPoints[iLo][1];
  const yHi = controlPoints[iHi][1];
  const span = yHi - yLo;
  const subT = span > 1e-9 ? Math.max(0, Math.min(1, (t - yLo) / span)) : 0;

  const slice = controlPoints.slice(iLo, iHi + 1);
  return evaluateBezier(subT, slice);
}

/**
 * Scalar version of evaluatePiecewiseBezier. Parametric heights are implicit:
 * the i-th value sits at i / (N-1).
 */
export function evaluatePiecewiseBezierScalar(
  t: number,
  values: number[],
  pointTypes?: CurvePointType[]
): number {
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return values[0];

  const types = normalizeTypes(n, pointTypes);

  const fixedIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (types[i] === 'fixed') fixedIdx.push(i);
  }
  if (fixedIdx.length < 2) return evaluateBezierScalar(t, values);

  // For scalar curves, fixed point i sits at parametric height i / (n-1)
  const denom = n - 1;
  let s = 0;
  for (let k = 0; k < fixedIdx.length - 1; k++) {
    const yHi = fixedIdx[k + 1] / denom;
    if (t <= yHi || k === fixedIdx.length - 2) {
      s = k;
      if (t <= yHi) break;
    }
  }

  const iLo = fixedIdx[s];
  const iHi = fixedIdx[s + 1];
  const yLo = iLo / denom;
  const yHi = iHi / denom;
  const span = yHi - yLo;
  const subT = span > 1e-9 ? Math.max(0, Math.min(1, (t - yLo) / span)) : 0;

  const sliceValues = values.slice(iLo, iHi + 1);
  return evaluateBezierScalar(subT, sliceValues);
}
