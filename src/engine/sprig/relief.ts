/**
 * SVG image → sprig height field. Pure math (no DOM): the browser rasterizes
 * the SVG (svg-rasterizer.ts) and hands the grayscale pixels in, so everything
 * here also runs under Node for the verify script — and a PNG/JPG (phase 2)
 * can enter at the same point.
 *
 * All lengths are FINISHED mm. The generator scales the result up by Shrink.
 */

import type { SprigParameters } from './sprig-types';

/** Grayscale image, 0 = black … 255 = white, row-major, row 0 at the TOP. */
export interface SprigSource {
  pixels: Uint8Array;
  width: number;
  height: number;
}

/** Lighter than this counts as paper when cropping (antialiasing fringes). */
const PAPER = 250;

/**
 * Crop to the inked area, so Width and Length mean the size of the drawing and
 * not of whatever whitespace its viewBox happened to carry. Null if blank.
 */
export function cropToContent(src: SprigSource): { source: SprigSource; aspect: number } | null {
  const { pixels, width: w, height: h } = src;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[y * w + x] < PAPER) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) out.set(pixels.subarray((y + y0) * w + x0, (y + y0) * w + x0 + cw), y * cw);
  return { source: { pixels: out, width: cw, height: ch }, aspect: cw / ch };
}

/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher): for every
 * cell, the distance in CELLS to the nearest cell where `feature` is set.
 * Infinity everywhere if there is no feature at all.
 */
export function distanceTransform(feature: Uint8Array, nx: number, ny: number): Float32Array {
  const INF = 1e20;
  const f = new Float64Array(nx * ny);
  for (let i = 0; i < f.length; i++) f[i] = feature[i] ? 0 : INF;
  const n = Math.max(nx, ny);
  const col = new Float64Array(n), d = new Float64Array(n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  const pass = (len: number) => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((col[q] + q * q) - (col[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = ((col[q] + q * q) - (col[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + col[v[k]];
    }
  };
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) col[y] = f[y * nx + x];
    pass(ny);
    for (let y = 0; y < ny; y++) f[y * nx + x] = d[y];
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) col[x] = f[y * nx + x];
    pass(nx);
    for (let x = 0; x < nx; x++) f[y * nx + x] = d[x];
  }
  const out = new Float32Array(nx * ny);
  for (let i = 0; i < out.length; i++) out[i] = f[i] >= INF / 2 ? Infinity : Math.sqrt(f[i]);
  return out;
}

/** The relief on a regular grid, cell CENTRES at x0 + i·step, y0 + j·step. */
export interface ReliefField {
  nx: number;
  ny: number;
  /** Grid spacing, finished mm. */
  step: number;
  /** Centre of cell (0, 0), finished mm, shape centred on the origin. */
  x0: number;
  y0: number;
  /** Height above the plate, finished mm. 0 outside the shape; the border ring is always 0. */
  heights: Float32Array;
  /** 1 inside the shape. */
  mask: Uint8Array;
  /** 1 where the shape is narrower than Min Feature Width. */
  thin: Uint8Array;
  /** Separate thin areas found (each a red patch). */
  thinSpots: number;
  /** Width of the thinnest one, finished mm (≈ 2 × its widest inscribed radius). */
  thinnestWidth: number;
  maxHeight: number;
  /** Relief volume above the plate, finished mm³. */
  volume: number;
}

/** Empty cells kept round the shape so the grid border is always plate-flat. */
const BORDER = 2;
/** Crease-smoothing radius as a fraction of Roundness. */
const BLUR = 0.15;
/** Gray modes count anything darker than nearly-white as part of the shape. */
const GRAY_INK = 0.02;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Profile of an inflated shape: 0 at the edge, 1 at `x` ≥ 1 (one Roundness in). */
export function inflateProfile(x: number, profile: SprigParameters['profile']): number {
  if (x >= 1) return 1;
  if (x <= 0) return 0;
  const u = 1 - x;
  if (profile === 'round') return Math.sqrt(1 - u * u);
  if (profile === 'pillow') return Math.pow(1 - u * u * u * u, 0.25);
  return x;
}

/**
 * Masked, normalised box blur (separable, run twice ≈ a tent). Cells outside
 * the mask neither contribute nor change, so smoothing the inside never drags
 * the edge down. Used on the inflate profile: a raw distance field has a sharp
 * crease along every limb's centre line, like a roof ridge.
 */
function maskedBlur(val: Float32Array, mask: Uint8Array, nx: number, ny: number, r: number): void {
  if (r < 1) return;
  const num = new Float32Array(nx * ny), den = new Float32Array(nx * ny);
  for (let i = 0; i < num.length; i++) { num[i] = mask[i] ? val[i] : 0; den[i] = mask[i]; }
  const tmpN = new Float32Array(nx * ny), tmpD = new Float32Array(nx * ny);
  const run = (srcN: Float32Array, srcD: Float32Array, dstN: Float32Array, dstD: Float32Array, horiz: boolean) => {
    const len = horiz ? nx : ny, lines = horiz ? ny : nx;
    for (let l = 0; l < lines; l++) {
      const at = (k: number) => (horiz ? l * nx + k : k * nx + l);
      let sN = 0, sD = 0;
      for (let k = -r; k <= r; k++) if (k >= 0 && k < len) { sN += srcN[at(k)]; sD += srcD[at(k)]; }
      for (let k = 0; k < len; k++) {
        dstN[at(k)] = sN; dstD[at(k)] = sD;
        const out = k - r, inn = k + r + 1;
        if (out >= 0) { sN -= srcN[at(out)]; sD -= srcD[at(out)]; }
        if (inn < len) { sN += srcN[at(inn)]; sD += srcD[at(inn)]; }
      }
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    run(num, den, tmpN, tmpD, true);
    run(tmpN, tmpD, num, den, false);
  }
  for (let i = 0; i < val.length; i++) if (mask[i] && den[i] > 0) val[i] = num[i] / den[i];
}

/**
 * Sample the source at an oriented position (u, v) ∈ [0,1]² — u along x, v
 * along y with v = 1 at the TOP of the drawing — undoing flip then rotation.
 * Returns ink 0..1 (1 = black), or −1 outside the drawing.
 */
function sampler(src: SprigSource, p: Pick<SprigParameters, 'rotation' | 'flipX' | 'flipY'>) {
  const { pixels, width: w, height: h } = src;
  return (u: number, v: number): number => {
    if (p.flipX) u = 1 - u;
    if (p.flipY) v = 1 - v;
    // Oriented = source turned CLOCKWISE by `rotation` (as seen from above).
    let s: number, t: number;
    if (p.rotation === 90) { s = 1 - v; t = u; }
    else if (p.rotation === 180) { s = 1 - u; t = 1 - v; }
    else if (p.rotation === 270) { s = v; t = 1 - u; }
    else { s = u; t = v; }
    if (s < 0 || s > 1 || t < 0 || t > 1) return -1;
    // Pixel centres; row 0 is the top of the drawing, i.e. t = 1.
    const fx = Math.min(w - 1, Math.max(0, s * w - 0.5));
    const fy = Math.min(h - 1, Math.max(0, (1 - t) * h - 0.5));
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const ax = fx - ix, ay = fy - iy;
    const jx = Math.min(w - 1, ix + 1), jy = Math.min(h - 1, iy + 1);
    const lum =
      (pixels[iy * w + ix] * (1 - ax) + pixels[iy * w + jx] * ax) * (1 - ay) +
      (pixels[jy * w + ix] * (1 - ax) + pixels[jy * w + jx] * ax) * ay;
    return 1 - lum / 255;
  };
}

/**
 * Build the height field. `step` is the finished-mm grid spacing (Resolution ÷
 * the shrink factor, so the PRINTED grid is Resolution).
 */
export function buildRelief(src: SprigSource, p: SprigParameters, step: number): ReliefField {
  const W = p.width, L = p.length;
  const nx = Math.max(1, Math.ceil(W / step)) + 2 * BORDER;
  const ny = Math.max(1, Math.ceil(L / step)) + 2 * BORDER;
  const x0 = -((nx - 1) * step) / 2, y0 = -((ny - 1) * step) / 2;
  const sample = sampler(src, p);
  const gray = p.heightMode === 'gray' || p.heightMode === 'inflateGray';
  const threshold = gray ? GRAY_INK : 0.5;

  const N = nx * ny;
  const ink = new Float32Array(N);
  const mask = new Uint8Array(N);
  for (let j = BORDER; j < ny - BORDER; j++) {
    for (let i = BORDER; i < nx - BORDER; i++) {
      const u = (x0 + i * step + W / 2) / W, v = (y0 + j * step + L / 2) / L;
      let s = sample(u, v);
      if (s < 0) continue;              // outside the drawing: always plate
      if (p.invert) s = 1 - s;          // invert only INSIDE the drawing's area
      ink[j * nx + i] = s;
      if (s > threshold) mask[j * nx + i] = 1;
    }
  }

  // Distance to the edge, mm, measured from each cell's centre to the boundary
  // half a cell beyond the last inside cell.
  const outside = new Uint8Array(N);
  for (let i = 0; i < N; i++) outside[i] = mask[i] ? 0 : 1;
  const dCells = distanceTransform(outside, nx, ny);
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = mask[i] ? Math.max(0, dCells[i] - 0.5) * step : 0;

  // Shape value 0..1.
  const f = new Float32Array(N);
  const inflate = p.heightMode === 'inflate' || p.heightMode === 'inflateGray';
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue;
    if (inflate) f[i] = p.roundness > 0 ? inflateProfile(dist[i] / p.roundness, p.profile) : 1;
    else if (p.heightMode === 'gray') f[i] = ink[i];
    else f[i] = 1;
  }
  if (inflate && p.roundness > 0) {
    // Smooth the crease, but fade the smoothing out toward the edge: a masked
    // blur averages only inside cells, so right at the edge it would lift the
    // profile and turn a rounded edge into a step.
    const rMm = BLUR * p.roundness;
    const raw = f.slice();
    maskedBlur(f, mask, nx, ny, Math.round(rMm / step));
    for (let i = 0; i < N; i++) {
      if (mask[i]) f[i] = raw[i] + (f[i] - raw[i]) * smoothstep(Math.min(1, dist[i] / (2 * rMm)));
    }
  }

  const H = p.maxHeight, minE = Math.min(p.minEdgeThickness, H);
  const heights = new Float32Array(N);
  let maxH = 0, volume = 0;
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue;
    let hs = H * f[i];
    // Lighter marks inside the shape cut in; black is untouched.
    if (p.heightMode === 'inflateGray') hs -= p.detailDepth * (1 - ink[i]);
    const t = p.edgeSoftness > 0 ? smoothstep(Math.min(1, dist[i] / p.edgeSoftness)) : 1;
    const h = Math.min(H, Math.max(minE, minE + (hs - minE) * t));
    heights[i] = h;
    if (h > maxH) maxH = h;
    volume += h * step * step;
  }

  const thin = thinParts(mask, dCells, nx, ny, step, p.minFeatureWidth);
  return { nx, ny, step, x0, y0, heights, mask, ...thin, maxHeight: maxH, volume };
}

/**
 * Parts narrower than `minWidth`, by MORPHOLOGICAL OPENING: roll a disc of that
 * diameter round inside the shape; whatever it cannot reach is too thin. Every
 * step is a distance transform:
 *   erode  = cells at least r from the edge (where the disc's centre can go),
 *   opened = cells within r of the eroded set (what the disc sweeps),
 *   thin   = inside the shape but not swept.
 * A square corner is never swept either — the disc is round — so leftovers
 * closer than CORNER·r (+ a cell) to the swept area are dropped: a 90° corner's
 * sliver reaches at most (√2 − 1)·r ≈ 0.41·r from it. Thin legs and tails sit
 * far from it and stay; the short stub where a leg joins the body is lost.
 */
const CORNER = 0.42;
/** Patches smaller than this many cells are noise, not a feature. */
const MIN_SPOT = 4;

function thinParts(mask: Uint8Array, dCells: Float32Array, nx: number, ny: number, step: number, minWidth: number) {
  const N = nx * ny;
  const thin = new Uint8Array(N);
  if (!(minWidth > 0)) return { thin, thinSpots: 0, thinnestWidth: Infinity };
  const rc = minWidth / 2 / step;
  const eroded = new Uint8Array(N);
  for (let i = 0; i < N; i++) eroded[i] = mask[i] && dCells[i] - 0.5 >= rc ? 1 : 0;
  const toEroded = distanceTransform(eroded, nx, ny);
  const opened = new Uint8Array(N);
  for (let i = 0; i < N; i++) opened[i] = mask[i] && toEroded[i] <= rc ? 1 : 0;
  const toOpened = distanceTransform(opened, nx, ny);
  const keep = CORNER * rc + 1;
  for (let i = 0; i < N; i++) if (mask[i] && !opened[i] && toOpened[i] > keep) thin[i] = 1;

  // Connected patches (8-way); each patch's width ≈ 2 × its largest edge distance.
  const seen = new Uint8Array(N);
  const stack: number[] = [];
  let spots = 0, thinnest = Infinity;
  for (let s = 0; s < N; s++) {
    if (!thin[s] || seen[s]) continue;
    let count = 0, maxD = 0;
    stack.push(s); seen[s] = 1;
    const members: number[] = [];
    while (stack.length) {
      const c = stack.pop()!;
      members.push(c);
      count++;
      const d = Math.max(0, dCells[c] - 0.5) * step;
      if (d > maxD) maxD = d;
      const cx = c % nx, cy = (c - cx) / nx;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
          const k = y * nx + x;
          if (thin[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
    }
    if (count < MIN_SPOT) { for (const m of members) thin[m] = 0; continue; }
    spots++;
    // + one cell: the distance is measured from cell centres, and a 1-cell-wide
    // strip would otherwise read as zero width.
    thinnest = Math.min(thinnest, 2 * maxD + step);
  }
  return { thin, thinSpots: spots, thinnestWidth: thinnest };
}
