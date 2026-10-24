/**
 * SVG markup → the cropped grayscale image the sprig engine reads. Browser
 * only (canvas). Cached by markup: the sidebar measures an SVG's aspect when it
 * is loaded and the mesh hook needs the same pixels a moment later, and undo
 * steps back and forth between the same few SVGs.
 */

import { rasterizeSvgForSprig } from '@/engine/svg-rasterizer';
import { cropToContent, type SprigSource } from '@/engine/sprig/relief';

export interface LoadedSprigSource {
  source: SprigSource;
  /** Width / height of the inked content. */
  aspect: number;
}

const CACHE_SIZE = 4;
const cache = new Map<string, Promise<LoadedSprigSource | null>>();

/** Null when the SVG draws nothing darker than paper. Rejects if it cannot be rendered. */
export function loadSprigSource(svg: string): Promise<LoadedSprigSource | null> {
  const hit = cache.get(svg);
  if (hit) return hit;
  const job = rasterizeSvgForSprig(svg).then((px) => cropToContent(px));
  cache.set(svg, job);
  job.catch(() => cache.delete(svg));
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return job;
}
