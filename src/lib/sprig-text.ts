/**
 * Sprig text → a grayscale picture the relief reads as its text layer (browser
 * only: canvas). Drawn at a fixed capital height in pixels, so Letter Height
 * only rescales it and never re-draws. Cached by text + font.
 */

import { cropToContent, type SprigSource, type TextLayer } from '@/engine/sprig/relief';
import type { SprigParameters } from '@/engine/sprig/sprig-types';
import { SPRIG_FONTS } from '@/lib/sprig-fonts';

export interface RenderedText {
  source: SprigSource;
  /** Height of a capital letter, in the source's pixels. */
  capPx: number;
}

/** Capital height drawn at: 0.04 mm a pixel for 8 mm letters. */
const CAP_PX = 200;
/** Longest canvas side allowed (the cap height shrinks to fit long lines). */
const MAX_SIDE = 6000;

const cache = new Map<string, Promise<RenderedText | null>>();

/** The CSS font and weight for the text's font choice. */
export function textFont(p: Pick<SprigParameters, 'textFont' | 'textFontName'>): { css: string; weight: number } {
  if (p.textFont === 'system') {
    const name = p.textFontName.trim().replace(/["\\]/g, '');
    // Bold: regular weights of most fonts are too thin to cast at sprig sizes
    // (Futura Medium at 8 mm was red all over). The browser picks the font's
    // bold face, or thickens it if there is none.
    return { css: name ? `"${name}", sans-serif` : 'sans-serif', weight: 700 };
  }
  const f = SPRIG_FONTS[p.textFont];
  return { css: f.font.style.fontFamily, weight: f.weight };
}

/**
 * Is this font installed? Canvas silently falls back to another font, so draw
 * a test string with the font in front of two different generic fonts: if both
 * come out the same width as the generic font alone, the name was not found.
 */
export function systemFontFound(name: string): boolean {
  const n = name.trim().replace(/["\\]/g, '');
  if (!n || typeof document === 'undefined') return false;
  const ctx = document.createElement('canvas').getContext('2d')!;
  const probe = 'mmmmmmmmmmlli WQ@#';
  return ['monospace', 'serif'].some((g) => {
    ctx.font = `72px ${g}`;
    const base = ctx.measureText(probe).width;
    ctx.font = `72px "${n}", ${g}`;
    return ctx.measureText(probe).width !== base;
  });
}

export function renderText(p: Pick<SprigParameters, 'text' | 'textFont' | 'textFontName' | 'textRotation'>): Promise<RenderedText | null> {
  const lines = p.text.split('\n').slice(0, 2).map((l) => l.trimEnd());
  if (!lines.some((l) => l.trim())) return Promise.resolve(null);
  const { css, weight } = textFont(p);
  // Turned on the canvas itself, clockwise (canvas y runs down, and the picture
  // is read as seen from above). The crop then gives the turned text's own box,
  // so placement and the mold-size fit follow; the cap height is unchanged, so
  // Letter Height still means the same thing.
  const turn = (((p.textRotation % 360) + 540) % 360) - 180;
  const rad = (turn * Math.PI) / 180, cs = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
  const key = `${css}|${weight}|${turn}|${lines.join('\n')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const job = (async () => {
    // Built-in fonts load on demand; drawing before they arrive uses a fallback.
    if (p.textFont !== 'system') await document.fonts.load(`${weight} 100px ${css}`, lines.join(''));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const fontAt = (px: number) => `${weight} ${px}px ${css}`;
    ctx.font = fontAt(100);
    const capAt100 = ctx.measureText('H').actualBoundingBoxAscent || 70;
    let capPx = CAP_PX;
    let size = 0, lineStep = 0, margin = 0, widest = 0;
    for (let tries = 0; tries < 3; tries++) {
      size = (100 * capPx) / capAt100;
      ctx.font = fontAt(size);
      lineStep = size * 1.3;
      margin = size * 0.6;   // scripts swing well past their advance width
      widest = Math.max(...lines.map((l) => {
        const m = ctx.measureText(l);
        return Math.max(m.width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
      }));
      const w0 = widest + 2 * margin, h0 = lines.length * lineStep + 2 * margin;
      const side = Math.max(w0 * cs + h0 * sn, w0 * sn + h0 * cs);
      if (side <= MAX_SIDE) break;
      capPx *= MAX_SIDE / side;
    }
    const w0 = widest + 2 * margin, h0 = lines.length * lineStep + 2 * margin;
    canvas.width = Math.ceil(w0 * cs + h0 * sn);
    canvas.height = Math.ceil(w0 * sn + h0 * cs);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = fontAt(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    lines.forEach((l, i) => ctx.fillText(l, 0, margin + size + i * lineStep - h0 / 2));
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const pixels = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < pixels.length; i++) pixels[i] = rgba[i * 4];
    const cropped = cropToContent({ pixels, width: canvas.width, height: canvas.height });
    return cropped ? { source: cropped.source, capPx } : null;
  })();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  while (cache.size > 6) cache.delete(cache.keys().next().value as string);
  return job;
}

/** The rendered text at its Letter Height, as the relief's text layer. */
export function textLayerAt(r: RenderedText, letterHeight: number): TextLayer {
  const mmPerPx = letterHeight / r.capPx;
  return { ...r.source, mmW: r.source.width * mmPerPx, mmH: r.source.height * mmPerPx };
}
