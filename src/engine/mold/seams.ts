/**
 * Where a split mold's seams fall on the vase — for the seam lines on the Vase
 * and Sprig pages and the sprig's snap buttons (Gary, 2026-11-09: a sprig on a
 * split mold releases centred on a piece or across a seam, red in between).
 *
 * Angles are the vase's own (degrees, + = counter-clockwise from above, as the
 * sprig's Around), round the base centre, as the generators cut:
 * Split Halves splits along its Split Angle (seams at a and a + 180,
 * split-two-piece-generator), Split Thirds at Seam Angle + 120k
 * (split-thirds-generator: wedges centred on a0 + (2k + 1)·60°).
 */

import type { VaseParameters } from '../types';
import { prepareVaseParams, buildOuterRings } from './mold-generator';
import { splitSilhouette } from './split-handle';

export type SeamMold = 'halves' | 'thirds';

const pieces = (mold: SeamMold) => (mold === 'halves' ? 2 : 3);

/** −180 < a ≤ 180, the range of the Around sliders. */
export function wrapAngle(a: number): number {
  const w = ((a % 360) + 360) % 360;
  return w > 180 ? w - 360 : w;
}

/** The seams' angles, degrees. */
export function seamAngles(mold: SeamMold, seamAngle: number): number[] {
  const n = pieces(mold);
  return Array.from({ length: n }, (_, k) => wrapAngle(seamAngle + (360 * k) / n));
}

/** Each piece's centre, halfway between its two seams. */
export function pieceCentreAngles(mold: SeamMold, seamAngle: number): number[] {
  return seamAngles(mold, seamAngle + 180 / pieces(mold));
}

/** The one of `targets` nearest `from` going round either way, in −180…180. */
export function nearestAngle(from: number, targets: number[]): number {
  let best = targets[0], gap = Infinity;
  for (const t of targets) {
    const d = Math.abs(wrapAngle(t - from));
    if (d < gap - 1e-9) { gap = d; best = t; }
  }
  return wrapAngle(Math.round(best * 10) / 10);
}

/**
 * Each angle's line up the outside of the finished vase (no shrink, textures
 * on, as the page shows it): xyz points bottom → top, where the vertical plane
 * through the base centre at that angle meets the wall. Resolution capped —
 * it is a guide line, rebuilt while the vase is edited. `out` mm lifts it off
 * the wall so the wall does not hide it.
 */
export function seamLinesOnVase(vase: VaseParameters, angles: number[], out = 0): [number, number, number][][] {
  if (!angles.length) return [];
  const v: VaseParameters = { ...vase, resolution: { ...vase.resolution, vertical: Math.min(vase.resolution.vertical, 160), radial: Math.min(vase.resolution.radial, 360) } };
  const p = prepareVaseParams(v, 1, true);
  const stack = buildOuterRings(p, p.textures.enabled !== false);
  const [cx, cy] = stack.centers[0];
  return angles.map((deg) => {
    const a = (deg * Math.PI) / 180, sx = Math.cos(a), sy = Math.sin(a);
    return splitSilhouette(stack.rings, p.resolution.radial, cx, cy, sx, sy)
      .map(([z, u]) => [cx + (u + out) * sx, cy + (u + out) * sy, z] as [number, number, number]);
  });
}

/**
 * The seam the Seam view button turns to, seen from `from` (the camera's
 * bearing): the nearest one, or, when already facing one (within 1°), the next
 * one counter-clockwise — so pressing it again steps round the vase.
 */
export function nextSeam(from: number, seams: number[]): number {
  const facing = seams.find((s) => Math.abs(wrapAngle(s - from)) < 1);
  if (facing === undefined) return nearestAngle(from, seams);
  const ccw = (s: number) => { const d = wrapAngle(s - facing); return d <= 0 ? d + 360 : d; };
  return wrapAngle(Math.round([...seams].sort((a, b) => ccw(a) - ccw(b))[0] * 10) / 10);
}
