/** Convert degrees to radians */
export function rad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Convert radians to degrees */
export function deg(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Linear interpolation between a and b */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sine in degrees (matching OpenSCAD convention) */
export function sinD(degrees: number): number {
  return Math.sin(rad(degrees));
}

/** Cosine in degrees (matching OpenSCAD convention) */
export function cosD(degrees: number): number {
  return Math.cos(rad(degrees));
}

/** Tangent in degrees */
export function tanD(degrees: number): number {
  return Math.tan(rad(degrees));
}
