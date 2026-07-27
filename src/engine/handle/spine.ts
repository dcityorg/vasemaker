/**
 * Handle spine sampling — evaluates the piecewise-Bezier centerline into evenly
 * parameterized stations with tangents and in-plane normals.
 *
 * Handle-plane coordinates: x = stick-out depth from the vase wall (x=0 is the
 * wall plane), y = height along the wall. The parting plane is the x–y plane.
 */

import { evaluatePiecewiseBezier } from '../bezier';
import type { BezierPoint, CurvePointType } from '../types';

export interface SpineStation {
  x: number;
  y: number;
  /** Unit tangent (direction of increasing t: bottom attachment → top attachment). */
  tx: number;
  ty: number;
  /** Unit in-plane normal = tangent rotated +90°. */
  nx: number;
  ny: number;
}

/**
 * Sample the spine at n+1 stations in mm. depthMm/heightMm scale the normalized
 * [0–1]² control points.
 */
export function sampleSpine(
  points: BezierPoint[],
  types: CurvePointType[],
  depthMm: number,
  heightMm: number,
  n: number
): SpineStation[] {
  // The piecewise Bezier maps its parameter through the FIXED points' heights,
  // so the meaningful domain is [firstY, lastY], not [0, 1] — endpoints may sit
  // anywhere on the wall (hook shapes). Sampling outside that span would clamp
  // to the endpoints and collapse rings into degenerate geometry.
  const t0 = points[0][1];
  const t1 = points[points.length - 1][1];
  const raw: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * (i / n);
    const [xf, yf] = evaluatePiecewiseBezier(t, points, types);
    raw.push([Math.max(0, xf) * depthMm, yf * heightMm]);
  }

  const stations: SpineStation[] = [];
  for (let i = 0; i <= n; i++) {
    const prev = raw[Math.max(0, i - 1)];
    const next = raw[Math.min(n, i + 1)];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty);
    if (len > 1e-9) {
      tx /= len;
      ty /= len;
    } else {
      // Degenerate (coincident samples) — fall back to straight-out
      tx = 1;
      ty = 0;
    }
    stations.push({ x: raw[i][0], y: raw[i][1], tx, ty, nx: -ty, ny: tx });
  }
  return stations;
}
