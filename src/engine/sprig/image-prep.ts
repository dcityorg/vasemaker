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
import { depthRelief, type DepthMap } from './photo-depth';

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
  /** 0 = smooth tones (stretched); 2–5 = that many flat levels; −1 = as drawn
   *  (tone = darkness, unstretched — an SVG's own greys). */
  tones: number;
  /** false = every non-background pixel is shape, reachable from the edge or
   *  not (an SVG's empty outline stays empty). Default true. */
  fill?: boolean;
  /** Photo depth: the depth model's output for this picture. When given, the
   *  tone channel IS the photo-depth height (photo-depth.ts) and `tones` and
   *  `smooth` are not used; the outline is found as usual. */
  depth?: DepthMap;
  /** With `depth` and fill: also keep the lines alone, for Fill Holes in
   *  Photo depth (an SVG's line drawing). Default false. */
  keepLines?: boolean;
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
  // The slits the closing filled: background reachable from the edge without
  // it, shape with it (Gap Fill sets their height in the relief).
  let reach: Uint8Array | null = null;
  if (r > 0 && o.fill !== false) {
    reach = new Uint8Array(N);
    const st: number[] = [];
    const sd = (k: number) => { if (cand[k] && !reach![k]) { reach![k] = 1; st.push(k); } };
    for (let x = 0; x < w; x++) { sd(x); sd((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { sd(y * w); sd(y * w + w - 1); }
    while (st.length) {
      const k = st.pop()!;
      const x = k % w;
      if (x > 0) sd(k - 1);
      if (x < w - 1) sd(k + 1);
      if (k >= w) sd(k - w);
      if (k < N - w) sd(k + w);
    }
  }
  let back = filled;
  if (o.fill === false) back = cand;
  else if (r > 0) {
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
  // ── Tone 0..1, 1 = darkest (or, with Photo depth, 1 = tallest) ──
  let tone: Float32Array;
  // Fill Holes in Photo depth (Gary, 2026-10-30): the holes are the enclosed
  // background-coloured spots the fill took in (not the slits Close Gaps
  // filled). The lines get their own depth relief, rounded down into each
  // hole; the solid version has each hole filled smoothly from the heights
  // round it. The relief takes the higher of the lines and Fill Holes × solid.
  let lineTone: Float32Array | null = null, lineInside: Uint8Array | null = null;
  const crop = { x0, y0, fullW: w, fullH: h };
  if (o.depth) {
    tone = depthRelief(o.depth, cw, ch, inside, edgeDistance(inside, cw, ch), crop);
    if (o.keepLines && o.fill !== false) {
      const hole = new Uint8Array(M);
      let any = false;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const k = (y + y0) * w + x + x0, c = y * cw + x;
        if (inside[c] && cand[k] && !(reach && reach[k])) { hole[c] = 1; any = true; }
      }
      if (any) {
        lineInside = new Uint8Array(M);
        for (let c = 0; c < M; c++) lineInside[c] = inside[c] && !hole[c] ? 1 : 0;
        lineTone = depthRelief(o.depth, cw, ch, lineInside, edgeDistance(lineInside, cw, ch), crop);
        // The solid version: the depth model sees a hole as far-off background
        // and its blur carries that dip a little way into the lines round it.
        // So the depth itself is filled — each hole and a band round it, from
        // the depth beyond the band — before it becomes heights.
        const dm = depthAtPixels(o.depth, cw, ch, crop);
        const halo = Math.ceil((4 * w) / o.depth.width);
        const notHole = new Uint8Array(M);
        for (let c = 0; c < M; c++) notHole[c] = hole[c] ? 0 : 1;
        const dHole = distanceTransform(notHole, cw, ch);
        const redo = new Uint8Array(M), keep = new Uint8Array(M);
        for (let c = 0; c < M; c++) {
          if (inside[c] && (hole[c] || dHole[c] <= halo)) redo[c] = 1;
          else if (inside[c]) keep[c] = 1;
        }
        fillFromAround(dm, keep, redo, cw, ch);
        tone = depthRelief({ data: dm, width: cw, height: ch }, cw, ch, inside, edgeDistance(inside, cw, ch));
      }
    }
  } else {
    if (o.smooth > 0) maskedBoxBlur(lum, inside, cw, ch, Math.round(o.smooth));
    tone = toneMap(lum, inside, o.tones);
  }

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
  // Filled slits, same layout (0 = slit); only when the closing filled any.
  let gap: Uint8Array | undefined;
  if (reach) {
    gap = new Uint8Array(M).fill(255);
    let any = false;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const k = (y + y0) * w + x + x0;
      if (reach[k] && shape[k]) { gap[y * cw + x] = 0; any = true; }
    }
    if (!any) gap = undefined;
  }
  let lines: { pixels: Uint8Array; mask: Uint8Array } | undefined;
  if (lineTone && lineInside) {
    const nearL = distanceTransform(lineInside, cw, ch, true).nearest;
    lines = { pixels: new Uint8Array(M), mask: new Uint8Array(M) };
    for (let c = 0; c < M; c++) {
      const t = lineInside[c] ? lineTone[c] : nearL[c] >= 0 ? lineTone[nearL[c]] : 0;
      lines.pixels[c] = Math.round(255 * (1 - t));
      lines.mask[c] = lineInside[c] ? 0 : 255;
    }
  }
  return { source: { pixels, width: cw, height: ch, mask, ...(gap ? { gap } : {}), ...(o.depth ? { photoDepth: true } : {}), ...(lines ? { lines } : {}) }, aspect: cw / ch };
}

/** The depth map resampled at this (cropped) picture's pixels, bilinear —
 *  as depthRelief samples it. */
function depthAtPixels(depth: DepthMap, w: number, h: number, crop: { x0: number; y0: number; fullW: number; fullH: number }): Float32Array {
  const d = new Float32Array(w * h);
  const sx = depth.width / crop.fullW, sy = depth.height / crop.fullH, D = depth.data, W = depth.width;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(depth.height - 1, Math.max(0, (y + crop.y0 + 0.5) * sy - 0.5));
    const j0 = Math.floor(fy), j1 = Math.min(depth.height - 1, j0 + 1), ty = fy - j0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(depth.width - 1, Math.max(0, (x + crop.x0 + 0.5) * sx - 0.5));
      const i0 = Math.floor(fx), i1 = Math.min(depth.width - 1, i0 + 1), tx = fx - i0;
      d[y * w + x] = (D[j0 * W + i0] * (1 - tx) + D[j0 * W + i1] * tx) * (1 - ty) + (D[j1 * W + i0] * (1 - tx) + D[j1 * W + i1] * tx) * ty;
    }
  }
  return d;
}

/**
 * Fill the `unknown` pixels of `val` smoothly from the `known` ones round them:
 * a coarse-to-fine first guess (each level averages the rim pixels under it,
 * smoothed at that level, where it is cheap), then a little relaxation toward the average of the four neighbours, the known
 * pixels held fixed. A filled hole meets the heights round it level.
 */
function fillFromAround(val: Float32Array, known: Uint8Array, unknown: Uint8Array, w: number, h: number) {
  // Pyramid of (sum, weight), halving each level.
  const levels: { s: Float32Array; n: Float32Array; w: number; h: number }[] = [];
  // Only the rim — known pixels touching a hole — seeds it: the far side of a
  // line (rounding down to the plate at the outline) must not pull a hole down.
  let s = new Float32Array(w * h), n = new Float32Array(w * h), lw = w, lh = h;
  for (let k = 0; k < w * h; k++) {
    if (!known[k]) continue;
    const x = k % w;
    if ((x > 0 && unknown[k - 1]) || (x < w - 1 && unknown[k + 1]) || (k >= w && unknown[k - w]) || (k < w * h - w && unknown[k + w])) { s[k] = val[k]; n[k] = 1; }
  }
  levels.push({ s, n, w: lw, h: lh });
  while (lw > 1 || lh > 1) {
    const nw = Math.max(1, Math.ceil(lw / 2)), nh = Math.max(1, Math.ceil(lh / 2));
    const s2 = new Float32Array(nw * nh), n2 = new Float32Array(nw * nh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const q = (y >> 1) * nw + (x >> 1);
      s2[q] += s[y * lw + x]; n2[q] += n[y * lw + x];
    }
    s = s2; n = n2; lw = nw; lh = nh;
    levels.push({ s, n, w: lw, h: lh });
  }
  // Each level's estimate where it has no data comes from the level above.
  let est = new Float32Array(1);
  { const top = levels[levels.length - 1]; est[0] = top.n[0] > 0 ? top.s[0] / top.n[0] : 0; }
  for (let L = levels.length - 2; L >= 0; L--) {
    const { s: ls, n: ln, w: cw, h: chh } = levels[L], up = levels[L + 1];
    const e = new Float32Array(cw * chh);
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      const k = y * cw + x;
      e[k] = ln[k] > 0 ? ls[k] / ln[k] : est[(y >> 1) * up.w + (x >> 1)];
    }
    // Smooth the cells with no data here, while it is cheap (coarse levels).
    if (L > 0) relax(e, cw, chh, (k) => ln[k] === 0, () => true, 30);
    est = e;
  }
  for (let k = 0; k < w * h; k++) if (unknown[k]) val[k] = est[k];
  // A few full-size passes smooth the last of the blockiness into the rim.
  relax(val, w, h, (k) => unknown[k] === 1, (k) => known[k] === 1 || unknown[k] === 1, 30);
}

/** Gauss–Seidel passes: each `free` cell becomes the average of its
 *  neighbours that `counts`; the rest are held fixed. */
function relax(val: Float32Array, w: number, h: number, free: (k: number) => boolean, counts: (k: number) => boolean, passes: number) {
  const idx: number[] = [];
  for (let k = 0; k < w * h; k++) if (free(k)) idx.push(k);
  for (let it = 0; it < passes; it++) {
    for (const k of idx) {
      const x = k % w;
      let sum = 0, cnt = 0;
      if (x > 0 && counts(k - 1)) { sum += val[k - 1]; cnt++; }
      if (x < w - 1 && counts(k + 1)) { sum += val[k + 1]; cnt++; }
      if (k >= w && counts(k - w)) { sum += val[k - w]; cnt++; }
      if (k < w * h - w && counts(k + w)) { sum += val[k + w]; cnt++; }
      if (cnt) val[k] = sum / cnt;
    }
  }
}

/** Each shape pixel's distance to the nearest background pixel, in pixels.
 *  Beyond the crop counts as background (the crop is the shape's bounding box,
 *  so a part touching it touches background). */
function edgeDistance(inside: Uint8Array, w: number, h: number): Float32Array {
  const pw = w + 2, ph = h + 2;
  const back = new Uint8Array(pw * ph).fill(1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) back[(y + 1) * pw + x + 1] = inside[y * w + x] ? 0 : 1;
  const d = distanceTransform(back, pw, ph);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = d[(y + 1) * pw + x + 1];
  return out;
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
  if (tones === -1) {
    for (let c = 0; c < lum.length; c++) tone[c] = Math.min(1, Math.max(0, 1 - lum[c] / 255));
    return tone;
  }
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
