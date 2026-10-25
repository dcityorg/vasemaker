/**
 * A picture (PNG/JPG) → the SprigSource the relief reads. Pure math (no DOM):
 * the browser decodes the file to RGBA (lib/sprig-source.ts) and hands it in,
 * so this also runs under Node for tests.
 *
 * Unlike an SVG, a picture has no "paper" colour to threshold against — its
 * background is whatever colour surrounds the drawing, often off-white with
 * JPEG speckle. So the outline comes from a FLOOD FILL from the picture's edge
 * through colours close to the background, and travels to the engine as an
 * explicit mask. Light areas the fill cannot reach (wings inside an outline)
 * stay part of the shape — which is also what turns closed line art into a
 * solid shape with its lines on top.
 *
 * The tone channel is normalised: 0 = the darkest level (Max Height in Gray),
 * 255 = the lightest. Tone Steps groups it into a few flat levels, because web
 * pictures are mostly flat fills plus speckle, and flat steps also release
 * cleanly from plaster.
 */

import { distanceTransform, type SprigSource } from './relief';

export interface RgbaImage {
  /** RGBA bytes, row-major, row 0 at the top. */
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ImagePrepOptions {
  /** How far a colour may be from the background's and still count as background, 0–100. */
  background: number;
  /** Gaps in an outline up to about twice this many pixels are closed before the fill. */
  closeGaps: number;
  /** Blur radius inside the shape, pixels (kills JPEG speckle). */
  smooth: number;
  /** 0 = smooth tones; 2–5 = that many flat levels. */
  tones: number;
}

/** Full background slider = this RGB distance (black to white is 441). */
const BG_SCALE = 2.2;
/** Shape specks smaller than this fraction of the picture are dropped. */
const SPECK = 0.0002;

export function prepareImage(img: RgbaImage, o: ImagePrepOptions): { source: SprigSource; aspect: number } | null {
  const { data, width: w, height: h } = img;
  const N = w * h;

  // ── Background colour: median of the opaque edge pixels ──
  const edge: number[][] = [[], [], []];
  const addEdge = (k: number) => {
    if (data[k * 4 + 3] < 128) return;
    for (let c = 0; c < 3; c++) edge[c].push(data[k * 4 + c]);
  };
  for (let x = 0; x < w; x++) { addEdge(x); addEdge((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { addEdge(y * w); addEdge(y * w + w - 1); }
  const perimeter = 2 * (w + h) - 4;
  const bg = edge[0].length > perimeter * 0.1
    ? edge.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; })
    : null;

  // ── Background-like pixels: transparent, or near the background colour ──
  const tol = o.background * BG_SCALE;
  const cand = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    if (data[k * 4 + 3] < 128) { cand[k] = 1; continue; }
    if (!bg) continue;
    const dr = data[k * 4] - bg[0], dg = data[k * 4 + 1] - bg[1], db = data[k * 4 + 2] - bg[2];
    if (dr * dr + dg * dg + db * db <= tol * tol) cand[k] = 1;
  }

  // ── Flood fill from the edge, optionally through gaps closed by r ──
  // Closing gaps = fill only where the background is wider than 2r (shrink the
  // candidates by r), then let the filled area grow back by r into candidates.
  const r = Math.max(0, o.closeGaps);
  let seedable = cand;
  if (r > 0) {
    const notCand = new Uint8Array(N);
    for (let k = 0; k < N; k++) notCand[k] = cand[k] ? 0 : 1;
    const d = distanceTransform(notCand, w, h);
    seedable = new Uint8Array(N);
    for (let k = 0; k < N; k++) seedable[k] = cand[k] && d[k] > r ? 1 : 0;
  }
  const filled = new Uint8Array(N);
  const stack: number[] = [];
  const seed = (k: number) => { if (seedable[k] && !filled[k]) { filled[k] = 1; stack.push(k); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % w;
    if (x > 0) seed(k - 1);
    if (x < w - 1) seed(k + 1);
    if (k >= w) seed(k - w);
    if (k < N - w) seed(k + w);
  }
  let back = filled;
  if (r > 0) {
    const d = distanceTransform(filled, w, h);
    back = new Uint8Array(N);
    for (let k = 0; k < N; k++) back[k] = filled[k] || (cand[k] && d[k] <= r + 0.5) ? 1 : 0;
  }

  // ── Shape = not background, minus specks (they would also wreck the crop) ──
  const shape = new Uint8Array(N);
  for (let k = 0; k < N; k++) shape[k] = back[k] ? 0 : 1;
  dropSpecks(shape, w, h, Math.max(16, SPECK * N));

  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!shape[y * w + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, M = cw * ch;

  // ── Cropped luminance + mask ──
  const lum = new Float32Array(M);
  const inside = new Uint8Array(M);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const k = (y + y0) * w + x + x0, c = y * cw + x;
    inside[c] = shape[k];
    lum[c] = 0.299 * data[k * 4] + 0.587 * data[k * 4 + 1] + 0.114 * data[k * 4 + 2];
  }
  if (o.smooth > 0) maskedBoxBlur(lum, inside, cw, ch, Math.round(o.smooth));

  // ── Tone 0..1, 1 = darkest ──
  const tone = toneMap(lum, inside, o.tones);

  // Background pixels take the nearest shape pixel's tone, so sampling between
  // pixels at the outline never mixes in a light background.
  const near = distanceTransform(inside, cw, ch, true).nearest;
  const pixels = new Uint8Array(M);
  const mask = new Uint8Array(M);
  for (let c = 0; c < M; c++) {
    const t = inside[c] ? tone[c] : near[c] >= 0 ? tone[near[c]] : 0;
    pixels[c] = Math.round(255 * (1 - t));
    mask[c] = inside[c] ? 0 : 255;
  }
  return { source: { pixels, width: cw, height: ch, mask }, aspect: cw / ch };
}

/** Drop 4-connected shape components smaller than `minPx`. */
function dropSpecks(shape: Uint8Array, w: number, h: number, minPx: number) {
  const N = w * h;
  const seen = new Uint8Array(N);
  const stack: number[] = [];
  const members: number[] = [];
  for (let s = 0; s < N; s++) {
    if (!shape[s] || seen[s]) continue;
    members.length = 0;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const k = stack.pop()!;
      members.push(k);
      const x = k % w;
      const nb = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k >= w ? k - w : -1, k < N - w ? k + w : -1];
      for (const q of nb) if (q >= 0 && shape[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
    }
    if (members.length < minPx) for (const k of members) shape[k] = 0;
  }
}

/** Two box passes of radius r, averaging only shape pixels. */
function maskedBoxBlur(val: Float32Array, mask: Uint8Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(val.length);
  const pass = (src: Float32Array, dst: Float32Array, horiz: boolean) => {
    const n = horiz ? w : h, lines = horiz ? h : w;
    for (let l = 0; l < lines; l++) {
      const at = (i: number) => (horiz ? l * w + i : i * w + l);
      let sum = 0, cnt = 0;
      for (let i = 0; i < Math.min(r, n - 1) + 1; i++) if (mask[at(i)]) { sum += src[at(i)]; cnt++; }
      for (let i = 0; i < n; i++) {
        const k = at(i);
        dst[k] = mask[k] && cnt > 0 ? sum / cnt : src[k];
        const add = i + r + 1, sub = i - r;
        if (add < n && mask[at(add)]) { sum += src[at(add)]; cnt++; }
        if (sub >= 0 && mask[at(sub)]) { sum -= src[at(sub)]; cnt--; }
      }
    }
  };
  for (let rep = 0; rep < 2; rep++) { pass(val, tmp, true); pass(tmp, val, false); }
}

/**
 * Luminance → tone (1 = darkest). Smooth: stretched between the 2nd and 98th
 * percentile of the shape. Steps: 1-D k-means on the histogram, levels evenly
 * spaced by rank — so 3 steps always means three equal height steps, whatever
 * greys the picture happened to use.
 */
export function toneMap(lum: Float32Array, inside: Uint8Array, tones: number): Float32Array {
  const hist = new Float64Array(256);
  let total = 0;
  for (let c = 0; c < lum.length; c++) if (inside[c]) { hist[Math.min(255, Math.max(0, Math.round(lum[c])))]++; total++; }
  const tone = new Float32Array(lum.length);
  if (total === 0) return tone;
  const pct = (q: number) => {
    let acc = 0;
    for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= q * total) return b; }
    return 255;
  };
  if (tones < 2) {
    const lo = pct(0.02), hi = pct(0.98);
    for (let c = 0; c < lum.length; c++) {
      tone[c] = hi - lo < 8 ? 1 : Math.min(1, Math.max(0, (hi - lum[c]) / (hi - lo)));
    }
    return tone;
  }
  const k = Math.min(5, Math.round(tones));
  const centre = Array.from({ length: k }, (_, i) => pct((i + 0.5) / k));
  const assign = new Int32Array(256);
  for (let iter = 0; iter < 30; iter++) {
    for (let b = 0; b < 256; b++) {
      let best = 0;
      for (let i = 1; i < k; i++) if (Math.abs(b - centre[i]) < Math.abs(b - centre[best])) best = i;
      assign[b] = best;
    }
    let moved = false;
    for (let i = 0; i < k; i++) {
      let s = 0, n = 0;
      for (let b = 0; b < 256; b++) if (assign[b] === i) { s += b * hist[b]; n += hist[b]; }
      if (n > 0 && Math.abs(s / n - centre[i]) > 0.01) { centre[i] = s / n; moved = true; }
    }
    if (!moved) break;
  }
  // Rank the clusters that hold pixels, darkest first; empty ones vanish.
  const used = new Set<number>();
  for (let b = 0; b < 256; b++) if (hist[b] > 0) used.add(assign[b]);
  const order = Array.from(used).sort((a, b) => centre[a] - centre[b]);
  const level = new Float32Array(k);
  order.forEach((ci, rank) => { level[ci] = order.length > 1 ? 1 - rank / (order.length - 1) : 1; });
  for (let c = 0; c < lum.length; c++) {
    tone[c] = level[assign[Math.min(255, Math.max(0, Math.round(lum[c])))]];
  }
  return tone;
}
