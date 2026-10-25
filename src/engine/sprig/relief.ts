/**
 * SVG image → sprig height field. Pure math (no DOM): the browser rasterizes
 * the SVG (svg-rasterizer.ts) and hands the grayscale pixels in, so everything
 * here also runs under Node for the verify script — and a PNG/JPG (phase 2)
 * can enter at the same point.
 *
 * All lengths are FINISHED mm. The generator scales the result up by Shrink.
 */

import { backingOn, type SprigParameters } from './sprig-types';

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
 * Infinity everywhere if there is no feature at all. With `nearest`, also
 * returns which feature cell that is.
 */
export function distanceTransform(feature: Uint8Array, nx: number, ny: number): Float32Array;
export function distanceTransform(feature: Uint8Array, nx: number, ny: number, nearest: true): { dist: Float32Array; nearest: Int32Array };
export function distanceTransform(feature: Uint8Array, nx: number, ny: number, nearest = false): Float32Array | { dist: Float32Array; nearest: Int32Array } {
  const INF = 1e20;
  const f = new Float64Array(nx * ny);
  for (let i = 0; i < f.length; i++) f[i] = feature[i] ? 0 : INF;
  // Row of the nearest feature found by the column pass, per cell.
  const srcRow = new Int32Array(nx * ny);
  const near = new Int32Array(nx * ny).fill(-1);
  const n = Math.max(nx, ny);
  const col = new Float64Array(n), d = new Float64Array(n), arg = new Int32Array(n);
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
      arg[q] = v[k];
    }
  };
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) col[y] = f[y * nx + x];
    pass(ny);
    for (let y = 0; y < ny; y++) { f[y * nx + x] = d[y]; srcRow[y * nx + x] = arg[y]; }
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) col[x] = f[y * nx + x];
    pass(nx);
    for (let x = 0; x < nx; x++) {
      f[y * nx + x] = d[x];
      if (nearest && d[x] < INF / 2) near[y * nx + x] = srcRow[y * nx + arg[x]] * nx + arg[x];
    }
  }
  const out = new Float32Array(nx * ny);
  for (let i = 0; i < out.length; i++) out[i] = f[i] >= INF / 2 ? Infinity : Math.sqrt(f[i]);
  return nearest ? { dist: out, nearest: near } : out;
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
  /** Separate pieces the cast comes out in (edge-connected; a corner touch is no bridge). */
  pieces: number;
  /** Pieces smaller than Min Feature Width squared — slivers likely to stick in the mold. */
  smallPieces: number;
  /** Outline backing: the widest gap the sheet crosses to join the pieces, finished mm. 0 = none needed. */
  bridgedGap: number;
  maxHeight: number;
  /** Relief volume above the plate, finished mm³. */
  volume: number;
}

/** Empty cells kept round the shape so the grid border is always plate-flat. */
const BORDER = 2;
/** The edge distance is measured on a grid this many times finer (odd, so
 *  every coarse cell centre is also a fine cell centre). */
const FINE = 3;
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
  const backed = backingOn(p);
  const bb = backed ? Math.max(0, p.backingBorder) : 0;
  // Room for the backing border, plus the always-flat border ring.
  const pad = BORDER + (bb > 0 ? Math.ceil(bb / step) + 1 : 0);
  const nx = Math.max(1, Math.ceil(W / step)) + 2 * pad;
  const ny = Math.max(1, Math.ceil(L / step)) + 2 * pad;
  const x0 = -((nx - 1) * step) / 2, y0 = -((ny - 1) * step) / 2;
  const sample = sampler(src, p);
  const gray = p.heightMode === 'gray' || p.heightMode === 'inflateGray';
  const threshold = gray ? GRAY_INK : 0.5;
  const N = nx * ny;

  // Sample on a grid FINE times finer (the edge distance below needs it).
  // Fine cell (i·FINE + c) sits exactly on coarse cell i's centre.
  const fx = nx * FINE, fy = ny * FINE, fs = step / FINE;
  const fInk = new Float32Array(fx * fy);
  const fOut = new Uint8Array(fx * fy).fill(1);
  const fIn = new Uint8Array(fx * fy);   // inside the drawing's area
  const ix0 = x0 - (step * (FINE - 1)) / (2 * FINE), iy0 = y0 - (step * (FINE - 1)) / (2 * FINE);
  for (let j = 0; j < fy; j++) {
    for (let i = 0; i < fx; i++) {
      const u = (ix0 + i * fs + W / 2) / W, v = (iy0 + j * fs + L / 2) / L;
      let s = sample(u, v);
      if (s < 0) continue;              // outside the drawing: always plate
      if (p.invert) s = 1 - s;          // invert only INSIDE the drawing's area
      fIn[j * fx + i] = 1;
      fInk[j * fx + i] = s;
      if (s > threshold) fOut[j * fx + i] = 0;
    }
  }
  cleanUp(fOut, fInk, fIn, fx, fy, fs, p);

  const c = (FINE - 1) / 2;
  const centre = (i: number, j: number) => (j * FINE + c) * fx + i * FINE + c;
  const ink = new Float32Array(N);
  const mask = new Uint8Array(N);
  for (let j = BORDER; j < ny - BORDER; j++) {
    for (let i = BORDER; i < nx - BORDER; i++) {
      const fk = centre(i, j);
      ink[j * nx + i] = fInk[fk];
      if (!fOut[fk]) mask[j * nx + i] = 1;
    }
  }

  // Whole-cell distances (the thin-part check works in these).
  const outside = new Uint8Array(N);
  for (let i = 0; i < N; i++) outside[i] = mask[i] ? 0 : 1;
  const dCells = distanceTransform(outside, nx, ny);

  // Distance to the edge, mm, for the profile — measured on a grid FINE times
  // finer, with the sub-cell correction below. On a steep profile any error in
  // the distance is multiplied by the slope, and whole-cell distances showed as
  // ribbing round every edge (0.1 mm at 0.2 mm cells, measured on a disc).
  const edt = distanceTransform(fOut, fx, fy, true);
  // Sub-cell edge position: the nearest outside cell's own ink says where the
  // outline crosses — at ink ≈ threshold it runs through that cell's centre, at
  // ink 0 about half a cell back toward the inside.
  const dist = new Float32Array(N);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!mask[k]) continue;
      const fk = centre(i, j);
      const o = edt.nearest[fk];
      const sub = o >= 0 ? 0.5 * Math.min(1, fInk[o] / threshold) : 0;
      dist[k] = Math.max(0.5 / FINE, edt.dist[fk] - 0.5 + sub) * fs;
    }
  }

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
    // Smooth the crease, but not within reach of the edge: a masked blur
    // averages only inside cells, so near the edge it lifts the profile (a
    // rounded edge turns into a step) and copies the grid's stair-steps into
    // the slope as ribbing. Two box passes reach 2·r, so blend in beyond that.
    const rMm = BLUR * p.roundness;
    const raw = f.slice();
    maskedBlur(f, mask, nx, ny, Math.round(rMm / step));
    for (let i = 0; i < N; i++) {
      if (mask[i]) f[i] = raw[i] + (f[i] - raw[i]) * smoothstep(Math.min(1, Math.max(0, (dist[i] - 2 * rMm) / (2 * rMm))));
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

  // Antialias the outline. The mask is all-or-nothing per cell, so the edge
  // wall would follow the grid in 0.2 mm stairs; a cell just OUTSIDE that is
  // partly inked instead rises in proportion to its ink, to at most the height
  // of the inside cell beside it. Moves the outline by under a cell, never adds
  // anything where there is no ink.
  const fringe = new Float32Array(N);
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (mask[k] || ink[k] <= 0) continue;
      const nb = Math.max(
        mask[k - 1] ? heights[k - 1] : 0, mask[k + 1] ? heights[k + 1] : 0,
        mask[k - nx] ? heights[k - nx] : 0, mask[k + nx] ? heights[k + nx] : 0,
      );
      if (nb > 0) fringe[k] = nb * Math.min(1, ink[k] / threshold);
    }
  }
  for (let k = 0; k < N; k++) if (fringe[k] > 0) { heights[k] = fringe[k]; volume += fringe[k] * step * step; }

  // Backing: a sheet the drawing sits on, so separate pieces cast as one.
  // Max Height stays the drawing's own height, on top of the sheet.
  let bridgedGap = 0;
  const whole = mask.slice();           // what the cast is made of
  if (backed) {
    let sd: (i: number, j: number) => number;
    if (p.backing === 'plaque') {
      const hw = W / 2 + bb, hl = L / 2 + bb;
      const rc = Math.min(Math.max(0, p.backingCorner), hw, hl);
      sd = (i, j) => {
        const qx = Math.abs(x0 + i * step) - (hw - rc), qy = Math.abs(y0 + j * step) - (hl - rc);
        return -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc);
      };
    } else {
      // The coarse search and the fine sheet can disagree by a cell on a
      // slender bridge, so check the sheet actually built and grow if needed.
      let R = autoBridge(mask, nx, ny, step, bb);
      for (let tries = 0; ; tries++) {
        sd = outlineDistance(fOut, fx, fy, fs, R, bb, centre);
        if (R <= bb || tries >= 4) break;
        const sheet = mask.slice();
        for (let j = BORDER; j < ny - BORDER; j++) for (let i = BORDER; i < nx - BORDER; i++) if (sd(i, j) > 0) sheet[j * nx + i] = 1;
        if (countPieces(sheet, nx, ny, 0).pieces <= 1) break;
        R *= 1.25;
      }
      bridgedGap = R > bb ? widestGap(mask, nx, ny, step) : 0;
    }
    const T = p.backingThickness, minB = Math.min(p.minEdgeThickness, T);
    for (let j = BORDER; j < ny - BORDER; j++) {
      for (let i = BORDER; i < nx - BORDER; i++) {
        const d = sd(i, j);
        if (d <= -step / 2) continue;
        // Within half a cell of the edge, rise in proportion (antialiased outline).
        const cover = Math.min(1, d / step + 0.5);
        const t = p.backingEdge > 0 ? smoothstep(Math.min(1, Math.max(0, d) / p.backingEdge)) : 1;
        const k = j * nx + i;
        heights[k] += (minB + (T - minB) * t) * cover;
        if (d > 0) whole[k] = 1;
      }
    }
    maxH = 0; volume = 0;
    for (let k = 0; k < N; k++) { if (heights[k] > maxH) maxH = heights[k]; volume += heights[k] * step * step; }
  }

  const thin = thinParts(mask, dCells, nx, ny, step, p.minFeatureWidth);
  const parts = countPieces(whole, nx, ny, (p.minFeatureWidth * p.minFeatureWidth) / (step * step));
  return { nx, ny, step, x0, y0, heights, mask, ...thin, ...parts, bridgedGap, maxHeight: maxH, volume };
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
/**
 * Clean-up options, on the fine grid before anything is measured:
 *  roundThin  — morphological opening with a Min Feature disc: everything
 *               narrower is shaved off (sharp tips round, hairlines go).
 *  removeTiny — pieces smaller than Min Feature² are dropped.
 *  wholeShapesOnly — pieces touching the edge of the drawing are dropped.
 * Removed cells lose their ink too, so nothing is antialiased back in.
 */
function cleanUp(fOut: Uint8Array, fInk: Float32Array, fIn: Uint8Array, fx: number, fy: number, fs: number, p: SprigParameters) {
  const N = fx * fy;
  const drop = (k: number) => { fOut[k] = 1; fInk[k] = 0; };
  if (p.roundThin && p.minFeatureWidth > 0) {
    const r = p.minFeatureWidth / 2 / fs;
    const dIn = distanceTransform(fOut, fx, fy);
    const eroded = new Uint8Array(N);
    for (let k = 0; k < N; k++) eroded[k] = !fOut[k] && dIn[k] - 0.5 >= r ? 1 : 0;
    const toEroded = distanceTransform(eroded, fx, fy);
    for (let k = 0; k < N; k++) if (!fOut[k] && !(toEroded[k] <= r)) drop(k);
  }
  if (!p.removeTiny && !p.wholeShapesOnly) return;
  const tinyCells = (p.minFeatureWidth * p.minFeatureWidth) / (fs * fs);
  const label = new Int32Array(N).fill(-1);
  const stack: number[] = [];
  const members: number[] = [];
  for (let s = 0; s < N; s++) {
    if (fOut[s] || label[s] >= 0) continue;
    members.length = 0;
    let edge = false;
    label[s] = s; stack.push(s);
    while (stack.length) {
      const k = stack.pop()!;
      members.push(k);
      const i = k % fx, j = (k - i) / fx;
      const nb = [i > 0 ? k - 1 : -1, i < fx - 1 ? k + 1 : -1, j > 0 ? k - fx : -1, j < fy - 1 ? k + fx : -1];
      for (const q of nb) {
        if (q < 0 || !fIn[q]) { edge = true; continue; }
        if (!fOut[q] && label[q] < 0) { label[q] = s; stack.push(q); }
      }
    }
    if ((p.removeTiny && members.length < tinyCells) || (p.wholeShapesOnly && edge)) for (const k of members) drop(k);
  }
}

/**
 * The outline backing as a signed distance (mm, + inside) at each coarse cell:
 * the drawing grown by R, then shrunk back by R − border — a morphological
 * closing (gaps narrower than ~2R fill in) plus the border. Worked on the fine
 * grid, padded by R so the grow is not cut short at the grid edge.
 */
function outlineDistance(
  fOut: Uint8Array, fx: number, fy: number, fs: number, R: number, b: number,
  centre: (i: number, j: number) => number,
) {
  const P = Math.ceil(R / fs) + 2;
  const W2 = fx + 2 * P, H2 = fy + 2 * P;
  const ink = new Uint8Array(W2 * H2);
  for (let j = 0; j < fy; j++) for (let i = 0; i < fx; i++) if (!fOut[j * fx + i]) ink[(j + P) * W2 + i + P] = 1;
  const e1 = distanceTransform(ink, W2, H2);
  const notGrown = new Uint8Array(W2 * H2);
  for (let k = 0; k < notGrown.length; k++) notGrown[k] = e1[k] * fs > R ? 1 : 0;
  const e2 = distanceTransform(notGrown, W2, H2);
  return (i: number, j: number) => {
    const fk = centre(i, j);
    const k = (Math.floor(fk / fx) + P) * W2 + (fk % fx) + P;
    return notGrown[k] ? b - e1[k] * fs : e2[k] * fs - (R - b);
  };
}

/** Pieces left after closing the coarse mask with radius R and border b (same rule as outlineDistance). */
function piecesClosed(mask: Uint8Array, nx: number, ny: number, step: number, R: number, b: number): number {
  const P = Math.ceil(R / step) + 2;
  const W2 = nx + 2 * P, H2 = ny + 2 * P;
  const ink = new Uint8Array(W2 * H2);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (mask[j * nx + i]) ink[(j + P) * W2 + i + P] = 1;
  const e1 = distanceTransform(ink, W2, H2);
  const notGrown = new Uint8Array(W2 * H2);
  for (let k = 0; k < notGrown.length; k++) notGrown[k] = e1[k] * step > R ? 1 : 0;
  const e2 = distanceTransform(notGrown, W2, H2);
  const sheet = new Uint8Array(W2 * H2);
  for (let k = 0; k < sheet.length; k++) sheet[k] = !notGrown[k] && e2[k] * step - (R - b) > 0 ? 1 : 0;
  return countPieces(sheet, W2, H2, 0).pieces;
}

/**
 * The widest gap the sheet has to cross, mm: twice the smallest grow radius at
 * which the pieces touch (growing is monotonic, so a plain bisection works).
 */
function widestGap(mask: Uint8Array, nx: number, ny: number, step: number): number {
  const d = distanceTransform(mask, nx, ny);
  const grown = new Uint8Array(mask.length);
  const joined = (r: number) => {
    for (let k = 0; k < grown.length; k++) grown[k] = d[k] * step <= r ? 1 : 0;
    return countPieces(grown, nx, ny, 0).pieces <= 1;
  };
  let lo = 0, hi = Math.hypot(nx, ny) * step;
  for (let n = 0; n < 20 && hi - lo > step / 4; n++) { const mid = (lo + hi) / 2; if (joined(mid)) hi = mid; else lo = mid; }
  return 2 * hi;
}

let bridgeCache: { key: string; R: number } | null = null;

/**
 * Smallest grow radius R (≥ border) whose outline backing is ONE piece, on the
 * coarse grid. Not a plain bisection: just past the threshold a bridge between
 * far-apart pieces is a slender lens that the grid can break into crumbs, so a
 * bigger R can briefly count MORE pieces. Step up by 25 % until joined, then
 * narrow down only between a known failure and a known success. Cached on the
 * mask, since most slider moves (heights) don't change it.
 */
function autoBridge(mask: Uint8Array, nx: number, ny: number, step: number, b: number): number {
  let h = 0;
  for (let k = 0; k < mask.length; k++) if (mask[k]) h = (h * 31 + k) | 0;
  const key = `${nx}x${ny}:${step}:${b}:${h}`;
  if (bridgeCache?.key === key) return bridgeCache.R;
  let R = b;
  if (piecesClosed(mask, nx, ny, step, b, b) > 1) {
    const limit = 2 * Math.hypot(nx, ny) * step;
    let lo = b, hi = Math.max(b, step);
    while (hi < limit && piecesClosed(mask, nx, ny, step, hi, b) > 1) { lo = hi; hi = Math.max(hi * 1.25, hi + step); }
    for (let n = 0; n < 8 && hi - lo > step / 2; n++) {
      const mid = (lo + hi) / 2;
      if (piecesClosed(mask, nx, ny, step, mid, b) > 1) lo = mid; else hi = mid;
    }
    R = hi;
  }
  bridgeCache = { key, R };
  return R;
}

const CORNER = 0.42;

/**
 * Pieces the cast comes out in: 4-connected regions of the mask. Diagonal-only
 * contact is a zero-width bridge in clay, so it does not join two pieces.
 * `smallCells` = area below which a piece counts as a sliver.
 */
function countPieces(mask: Uint8Array, nx: number, ny: number, smallCells: number) {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  let pieces = 0, smallPieces = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    pieces++;
    let area = 0;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const k = stack.pop()!;
      area++;
      const i = k % nx;
      if (i > 0 && mask[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
      if (i < nx - 1 && mask[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
      if (k >= nx && mask[k - nx] && !seen[k - nx]) { seen[k - nx] = 1; stack.push(k - nx); }
      if (k < mask.length - nx && mask[k + nx] && !seen[k + nx]) { seen[k + nx] = 1; stack.push(k + nx); }
    }
    if (area < smallCells) smallPieces++;
  }
  return { pieces, smallPieces };
}
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
    // Widest point of the patch AND of the unswept shape around it: a patch can
    // be just the last few cells of a round tip, whose own cells all sit near
    // the edge although the part they belong to is nearly wide enough. Grown by
    // less than `keep`, the ring never reaches the swept (wide-enough) area —
    // patches are at least `keep` from it — so a thin leg on a big body still
    // reads its own width, not the body's.
    let ring = members;
    const near = new Set(members);
    for (let layer = 0; layer < Math.floor(keep) && ring.length; layer++) {
      const next: number[] = [];
      for (const c of ring) {
        const cx = c % nx, cy = (c - cx) / nx;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
          const k = y * nx + x;
          if (mask[k] && !near.has(k)) { near.add(k); next.push(k); }
        }
      }
      ring = next;
    }
    near.forEach((c) => { maxD = Math.max(maxD, Math.max(0, dCells[c] - 0.5) * step); });
    // + one cell: the distance is measured from cell centres, and a 1-cell-wide
    // strip would otherwise read as zero width. Never reported as wide enough.
    thinnest = Math.min(thinnest, Math.min(2 * maxD + step, minWidth - 0.1));
  }
  return { thin, thinSpots: spots, thinnestWidth: thinnest };
}
