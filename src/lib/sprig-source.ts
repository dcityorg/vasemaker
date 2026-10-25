/**
 * The drawing → the cropped grayscale image the sprig engine reads. Browser
 * only (canvas). An SVG is rasterized; a picture (PNG/JPG data URL) is decoded
 * and run through image-prep.ts. Cached by drawing (+ picture settings): the
 * sidebar measures a drawing's aspect when it is loaded and the mesh hook needs
 * the same pixels a moment later, and undo steps back and forth between the
 * same few drawings.
 */

import { rasterizeSvgForSprig } from '@/engine/svg-rasterizer';
import { cropToContent, type SprigSource } from '@/engine/sprig/relief';
import { prepareImage, type ImagePrepOptions, type RgbaImage } from '@/engine/sprig/image-prep';
import { isPictureDrawing } from '@/engine/sprig/sprig-types';

export interface LoadedSprigSource {
  source: SprigSource;
  /** Width / height of the inked content. */
  aspect: number;
}

const CACHE_SIZE = 4;
const cache = new Map<string, Promise<LoadedSprigSource | null>>();
const decoded = new Map<string, Promise<RgbaImage>>();

/** Longer side a loaded picture is kept at: 0.08 mm a pixel on an 80 mm sprig,
 *  well under the 0.2 mm grid, and small enough to live in a settings file. */
const PICTURE_MAX = 1024;

function remember<T>(map: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  const hit = map.get(key);
  if (hit) return hit;
  const job = make();
  map.set(key, job);
  job.catch(() => map.delete(key));
  while (map.size > CACHE_SIZE) map.delete(map.keys().next().value as string);
  return job;
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('picture could not be decoded'));
    img.src = url;
  });
}

function decodePicture(url: string): Promise<RgbaImage> {
  return remember(decoded, url, async () => {
    const img = await loadImageElement(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data, width, height };
  });
}

/**
 * Null when there is no shape (an SVG drawing nothing darker than paper, or a
 * picture that is all background). Rejects if it cannot be drawn/decoded.
 * `picture` is required for a picture and ignored for an SVG.
 */
export function loadSprigSource(svg: string, picture?: ImagePrepOptions): Promise<LoadedSprigSource | null> {
  if (isPictureDrawing(svg)) {
    const o = picture ?? { background: 20, closeGaps: 0, smooth: 1, tones: 3 };
    const key = `${svg}#${o.background}|${o.closeGaps}|${o.smooth}|${o.tones}`;
    return remember(cache, key, () => decodePicture(svg).then((img) => prepareImage(img, o)));
  }
  return remember(cache, svg, () => rasterizeSvgForSprig(svg).then((px) => cropToContent(px)));
}

/**
 * A picture file → the data URL stored as the drawing: scaled down to
 * PICTURE_MAX on its longer side, PNG if it has any transparency (that IS the
 * background), else JPEG at high quality to keep settings files small.
 */
export async function pictureFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    const s = Math.min(1, PICTURE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    const a = ctx.getImageData(0, 0, w, h).data;
    let transparent = false;
    for (let i = 3; i < a.length; i += 4) if (a[i] < 250) { transparent = true; break; }
    return canvas.toDataURL(transparent ? 'image/png' : 'image/jpeg', 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}
