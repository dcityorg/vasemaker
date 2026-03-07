/**
 * SVG Pattern sampling — pixel data set externally by use-vase-mesh.ts.
 * Module-level mutable state for cross-component communication.
 *
 * This isolates the async SVG rasterization from the synchronous mesh generation.
 */

/** Cached SVG pattern pixel data (module-level, set externally) */
let svgPatternData: { pixels: Uint8Array; width: number; height: number } | null = null;

/** Set the rasterized SVG pixel data for sampling. Called from use-vase-mesh.ts. */
export function setSvgPatternData(data: { pixels: Uint8Array; width: number; height: number } | null): void {
  svgPatternData = data;
}

/** Get the current SVG pattern data (for internal use) */
export function getSvgPatternData(): { pixels: Uint8Array; width: number; height: number } | null {
  return svgPatternData;
}

/**
 * Sample the SVG pattern with bilinear interpolation.
 * @param u - horizontal tile coordinate (0–1 within one tile)
 * @param v - vertical tile coordinate (0–1 within one tile)
 * @param rotation - 0, 90, 180, or 270 degrees clockwise
 * @param flipX - flip horizontally
 * @param flipY - flip vertically
 * @returns brightness 0–1 (0 = black, 1 = white)
 */
export function sampleSvgPattern(u: number, v: number, rotation?: number, flipX?: boolean, flipY?: boolean): number {
  if (!svgPatternData) return 0;
  const { pixels, width, height } = svgPatternData;

  // Apply transforms: flip first, then rotate
  if (flipX) u = 1 - u;
  if (flipY) v = 1 - v;
  const rot = (rotation ?? 0) % 360;
  if (rot === 90) { const tmp = u; u = 1 - v; v = tmp; }
  else if (rot === 180) { u = 1 - u; v = 1 - v; }
  else if (rot === 270) { const tmp = u; u = v; v = 1 - tmp; }

  // Map to pixel coordinates (tile wraps via modulo already applied by caller)
  const px = u * (width - 1);
  const py = v * (height - 1);

  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);

  const fx = px - x0;
  const fy = py - y0;

  const p00 = pixels[y0 * width + x0];
  const p10 = pixels[y0 * width + x1];
  const p01 = pixels[y1 * width + x0];
  const p11 = pixels[y1 * width + x1];

  const top = p00 + (p10 - p00) * fx;
  const bottom = p01 + (p11 - p01) * fx;
  return (top + (bottom - top) * fy) / 255;
}
