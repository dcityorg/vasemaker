/**
 * Bezier curve evaluation using de Casteljau's algorithm.
 * Replaces the BezierScad.scad library from the OpenSCAD version.
 *
 * Supports 2–8 control points, matching the OpenSCAD version's capability.
 */

import type { BezierPoint } from './types';

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
