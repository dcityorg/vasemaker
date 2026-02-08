/**
 * Modulation functions that alter the vase surface.
 * Ported from VaseMaker13 A.scad.
 *
 * All functions work in degrees to match OpenSCAD conventions.
 */

import { sinD, cosD } from '@/lib/math-utils';

/**
 * Sine wave twist — alternating twist applied to ripples.
 * Returns rotation in degrees at vertical position v (0–1).
 *
 * OpenSCAD: function twist(v) = sineTwistMax * sin(sineTwistCycles * 0.25 * 360 * v)
 */
export function sineTwist(
  v: number,
  cycles: number,
  maxDegrees: number
): number {
  return maxDegrees * sinD(cycles * 0.25 * 360 * v);
}

/**
 * Radial ripple — sine wave modulation around the circumference.
 * Returns offset in mm at vertical position v and angle t.
 *
 * OpenSCAD: function radialRipple(v, t) = radialRippleDepth * sin((t + twist(v)) * radialRippleCount)
 */
export function radialRipple(
  v: number,
  t: number,
  depth: number,
  count: number,
  twistValue: number
): number {
  return depth * sinD((t + twistValue) * count);
}

/**
 * Vertical ripple — sine wave modulation along the height.
 * Returns offset in mm at vertical position v.
 *
 * OpenSCAD: function verticalRipple(v, t) = verticalRippleDepth * cos(v * 360 * verticalRippleCount)
 */
export function verticalRipple(
  v: number,
  depth: number,
  count: number
): number {
  return depth * cosD(v * 360 * count);
}

/**
 * Vertical smoothing — cosine fade of ripple depth over height.
 * Returns a factor 0–1 (0 = ripples suppressed, 1 = full depth).
 *
 * OpenSCAD: function verticalSmoothing(v) = 0.5 + (0.5 * cos(verticalSmoothingCycles * 0.5 * 360 * (v + startPercent/100)))
 */
export function verticalSmoothing(
  v: number,
  cycles: number,
  startPercent: number
): number {
  return 0.5 + 0.5 * cosD(cycles * 0.5 * 360 * (v + startPercent / 100));
}

/**
 * Radial smoothing — cosine fade of ripple depth around the circumference.
 * Returns a factor 0–1.
 *
 * OpenSCAD: function radialSmoothing(t) = (cos(t * cycles + offsetAngle * cycles) + 1) / 2
 */
export function radialSmoothing(
  t: number,
  cycles: number,
  offsetAngle: number
): number {
  return (cosD(t * cycles + offsetAngle * cycles) + 1) / 2;
}
