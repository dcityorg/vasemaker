/**
 * SVG image → sprig height field. Pure math (no DOM): the browser rasterizes
 * the SVG (svg-rasterizer.ts) and hands the grayscale pixels in, so everything
 * here also runs under Node for the verify script — and a PNG/JPG (phase 2)
 * can enter at the same point.
 *
 * All lengths are FINISHED mm. The generator scales the result up by Shrink.
 */

import { backingOn, hasText, sprigPlacement, type SprigParameters } from './sprig-types';

/** Grayscale image, 0 = black … 255 = white, row-major, row 0 at the TOP. */
export interface SprigSource {
  pixels: Uint8Array;
  width: number;
  height: number;
  /** A picture's outline (image-prep.ts), same layout: 0 = shape, 255 =
   *  background. When present it decides what is shape, and `pixels` is
   *  normalised tone only — so a light area inside the outline still counts. */
  mask?: Uint8Array;
  /** `pixels` are Photo depth heights (image-prep.ts with a depth map), not tones. */
  photoDepth?: boolean;
  /** The slits Close Gaps filled (image-prep.ts), same layout: 0 = slit. */
  gap?: Uint8Array;
}

/**
 * The settings the layers are built with. Photo depth is Gray read as made
 * once the depth has come back; without it (still running, or the model could
 * not run) the shape is inflated, so there is always something to see.
 */
function effectiveParams(src: SprigSource, p: SprigParameters): SprigParameters {
  if (p.heightMode !== 'photoDepth') return p;
  return src.photoDepth ? { ...p, heightMode: 'gray', imageLightest: 0 } : { ...p, heightMode: 'inflate' };
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
  /** Spots with no clay (height ≤ BARE) walled in by the cast on every side —
   *  a vein or a hole the plate shows through. A gap open to the outside is
   *  background, not counted. */
  bareHoles: number;
  maxHeight: number;
  /** Relief volume above the plate, finished mm³. */
  volume: number;
  /** Finished footprint: drawing ∪ text plus any backing border, mm. */
  footW: number;
  footL: number;
}

/** Empty cells kept round the shape so the grid border is always plate-flat. */
const BORDER = 2;
/** The edge distance is measured on a grid this many times finer (odd, so
 *  every coarse cell centre is also a fine cell centre). */
const FINE = 3;
/** Crease-smoothing radius as a fraction of Roundness. */
const BLUR = 0.15;
/** Gray modes count anything darker than nearly-white as part of the shape. */
export const GRAY_INK = 0.02;

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
function sampler(src: SprigSource, p: Pick<SprigParameters, 'rotation' | 'flipX' | 'flipY'>, pixels = src.pixels) {
  const { width: w, height: h } = src;
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

/** Text drawn by the browser (lib/sprig-text.ts): a SprigSource (0 = ink)
 *  plus the size its inked box stands for, finished mm. */
export interface TextLayer extends SprigSource {
  mmW: number;
  mmH: number;
}

/** Raised and cut letters: width of the slope at the letter edge, mm — enough
 *  draft to release, little enough that a 1.5 mm stroke still reaches height. */
const TEXT_EDGE = 0.3;
/** A cut never goes closer than this to the bottom of the sheet, mm. */
export const CUT_FLOOR = 0.4;

/** The grid every layer is built on: coarse cells plus the FINE-times-finer grid. */
interface Grid {
  nx: number; ny: number; step: number; x0: number; y0: number;
  fx: number; fy: number; fs: number; ix0: number; iy0: number;
}

/** Fine cell sitting on coarse cell (i, j)'s centre. */
const centreOf = (g: Grid) => {
  const c = (FINE - 1) / 2;
  return (i: number, j: number) => (j * FINE + c) * g.fx + i * FINE + c;
};

/**
 * One layer's heights on the grid: sample `inkAt` (mm → ink 0..1, −1 outside
 * the layer's area) on the fine grid, clean up, measure the edge distance, and
 * apply p's height settings with an antialiased outline. `maskAt` = a
 * picture's outline (see SprigSource.mask). Shared by the drawing and the text.
 */
function buildLayer(
  g: Grid, p: SprigParameters,
  inkAt: (x: number, y: number) => number, maskAt: ((x: number, y: number) => number) | null,
  gapAt: ((x: number, y: number) => number) | null = null,
) {
  const { nx, ny, step, x0, y0, fx, fy, fs, ix0, iy0 } = g;
  // A picture's lightest tone: this fraction of the darkest's height.
  const lightest = Math.min(1, Math.max(0, p.imageLightest / 100));
  const gray = p.heightMode === 'gray' || p.heightMode === 'inflateGray';
  const threshold = gray ? GRAY_INK : 0.5;
  const N = nx * ny;

  // Sample on a grid FINE times finer (the edge distance below needs it).
  // Fine cell (i·FINE + c) sits exactly on coarse cell i's centre.
  const fInk = new Float32Array(fx * fy);
  // How far toward the outline each cell is, 0..1 (1 = at or inside it): the
  // sub-cell edge position and the antialiased fringe both read this.
  const fCov = new Float32Array(fx * fy);
  const fOut = new Uint8Array(fx * fy).fill(1);
  const fIn = new Uint8Array(fx * fy);   // inside the layer's area
  // Trim Below (Gary 2026-10-29): in Gray, a part whose height would be under
  // this is cut away — the near-flat leftovers of legs and antennae round a
  // relief STL. It moves the outline, so the edge, Thin Parts and the piece
  // count all follow. Coverage below it fades with the height, so the new
  // outline is antialiased like any other.
  const trim = gray && p.heightMode === 'gray' ? Math.max(0, p.trimBelow) : 0;
  const trimFrac = trim > 0 ? trim / p.maxHeight : 0;
  for (let j = 0; j < fy; j++) {
    for (let i = 0; i < fx; i++) {
      const x = ix0 + i * fs, y = iy0 + j * fs;
      let s = inkAt(x, y);
      if (s < 0) continue;              // outside the layer: always plate
      if (p.invert) s = 1 - s;          // invert only INSIDE the drawing's area
      const fk = j * fx + i;
      fIn[fk] = 1;
      if (maskAt) {
        // A picture: the mask is the outline; Invert swaps tones, not the outline.
        const m = maskAt(x, y);
        fCov[fk] = Math.min(1, m / 0.5);
        if (m >= 0.5) {
          fInk[fk] = lightest + (1 - lightest) * s;
          if (fInk[fk] < trimFrac) fCov[fk] = Math.min(fCov[fk], fInk[fk] / trimFrac);
          else fOut[fk] = 0;
        }
      } else {
        fInk[fk] = s;
        fCov[fk] = s > 0 ? Math.min(1, s / threshold) : 0;
        if (s > threshold && s < trimFrac) fCov[fk] = Math.min(fCov[fk], s / trimFrac);
        else if (s > threshold) fOut[fk] = 0;
      }
    }
  }
  cleanUp(fOut, fInk, fCov, fIn, fx, fy, fs, p);

  const centre = centreOf(g);
  const ink = new Float32Array(N);
  const mask = new Uint8Array(N);
  for (let j = BORDER; j < ny - BORDER; j++) {
    for (let i = BORDER; i < nx - BORDER; i++) {
      const fk = centre(i, j);
      ink[j * nx + i] = fInk[fk];
      if (!fOut[fk]) mask[j * nx + i] = 1;
    }
  }
  // A hairline joined up on the fine grid can still break into crumbs on this
  // one (an antenna 0.1 mm wide on a 0.2 mm grid), so drop tiny pieces here too.
  if (p.removeTiny) countPieces(mask, nx, ny, (p.minFeatureWidth * p.minFeatureWidth) / (step * step), true);

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
      const sub = o >= 0 ? 0.5 * fCov[o] : 0;
      dist[k] = Math.max(0.5 / FINE, edt.dist[fk] - 0.5 + sub) * fs;
    }
  }
  // The same from outside, for the antialiased outline below: distance to the
  // nearest inside fine cell, less where this cell's own ink says the outline
  // is nearer (ink ≈ threshold: the outline runs through its centre).
  const fInside = new Uint8Array(fx * fy);
  for (let k = 0; k < fInside.length; k++) fInside[k] = fOut[k] ? 0 : 1;
  const edtIn = distanceTransform(fInside, fx, fy);
  const distOut = (k: number) => {
    const fk = centre(k % nx, Math.floor(k / nx));
    return Math.max(0, edtIn[fk] - 0.5 - 0.5 * fCov[fk]) * fs;
  };

  // The signed distance (outside negative), averaged over the 3 × 3 cells round
  // each cell, twice, within reach of the edge slope. Near an outline the true
  // distance changes almost linearly, which the mean keeps, while the error the
  // fine grid leaves in it (16 µm rms, 56 worst on a crisp disc) averages out.
  // That error, times the slope, was the faint stripes across Edge Softness
  // (Gary 2026-10-29): 32 → 17 µm rms on a flat disc's slope, worst 207 → 92.
  // At a part only a few cells wide the mean would lower its middle, so the
  // change is capped at one fine cell.
  const sd = new Float32Array(N);
  for (let k = 0; k < N; k++) sd[k] = mask[k] ? dist[k] : -distOut(k);
  {
    const band = Math.max(0, p.edgeSoftness) + 2 * step;
    let cur = sd;
    for (let pass = 0; pass < 2; pass++) {
      const next = cur.slice();
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const k = j * nx + i;
          if (sd[k] > band || sd[k] < -2 * step) continue;
          next[k] = (cur[k - nx - 1] + cur[k - nx] + cur[k - nx + 1] + cur[k - 1] + cur[k] + cur[k + 1]
            + cur[k + nx - 1] + cur[k + nx] + cur[k + nx + 1]) / 9;
        }
      }
      cur = next;
    }
    // Never more than one fine cell either way: enough to remove the grid's
    // error, too little to pull down the middle of a narrow part.
    for (let k = 0; k < N; k++) sd[k] += Math.max(-fs, Math.min(fs, cur[k] - sd[k]));
    for (let k = 0; k < N; k++) if (mask[k]) dist[k] = Math.max((0.5 / FINE) * fs, sd[k]);
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

  const H = p.maxHeight, minE = Math.min(p.minEdgeThickness, H), minT = Math.max(0, p.minThickness);
  // The shape's own height at each inside cell, before its edge is shaped.
  const hs = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue;
    let v = H * f[i];
    // Lighter marks inside the shape cut in; black is untouched.
    if (p.heightMode === 'inflateGray') v -= p.detailDepth * (1 - ink[i]);
    hs[i] = Math.min(H, Math.max(minE, v));
  }

  // The edge, antialiased. Every cell within reach of the outline takes the
  // edge profile — nothing outside, Edge Lip at the outline, rising over Edge
  // Softness to the shape's height — AVERAGED OVER THE CELL, from the cell's own
  // signed distance to the true outline (sub-cell, above). So a cell straddling
  // the outline gets the share of it that lies inside, and the result depends
  // on the distance alone, not on which grid cells happen to be in or out.
  // (Until 2026-10-29 inside cells took the profile at their centre times
  // their coverage, and outside cells a share of their TALLEST inside
  // neighbour — which follows the grid's stairs: Gary saw teeth along a wing.
  // A crisp disc's lowest contour wandered 40–63 µm; now 19–24 µm.)
  const es = p.edgeSoftness;
  /** ∫ smoothstep(u) du from 0 to u (1/2 at u = 1, then rising 1 per unit). */
  const rampArea = (u: number) => (u <= 0 ? 0 : u <= 1 ? u * u * u - (u * u * u * u) / 2 : u - 0.5);
  /** The edge profile up to height `h`, averaged over a cell centred `sd` mm
   *  inside the outline (negative = outside). */
  const edgeAt = (sd: number, h: number) => {
    const a = Math.max(0, sd - step / 2), b = sd + step / 2;
    if (b <= 0) return 0;
    const ramp = es > 0 ? es * (rampArea(b / es) - rampArea(a / es)) : b - a;
    return Math.min(h, (minE * (b - a) + (h - minE) * ramp) / step);
  };
  // Min Thickness (Gary 2026-10-29): a floor over the finished slope, with its
  // own taper at the outline — rising over half its height (about 63°), so a
  // joint as narrow as twice Min Thickness still reaches it (a 45° taper left a
  // 1.2 mm joint at 0.6 mm). ∫ of the taper, averaged over the cell. A narrow
  // joint is low because the edge slope reaches it from both sides; the floor
  // lifts it there, and the edge still slopes into the plate.
  const T = Math.min(minT, H), run = T / 2;
  const floorArea = (x: number) => (x <= 0 ? 0 : x <= run ? (T * x * x) / (2 * run) : (T * run) / 2 + T * (x - run));
  const floorAt = (sd: number) => {
    if (T <= 0 || sd + step / 2 <= 0) return 0;
    return (floorArea(sd + step / 2) - floorArea(Math.max(0, sd - step / 2))) / step;
  };
  // Gap Fill (Gary 2026-10-29): the slits Close Gaps filled are lowered to
  // gapFill % of the height round them, over a groove as wide as Edge Softness
  // each side — what an open slit's two edges would do, but the cast stays one
  // piece. 100 % = no groove (and nothing is computed).
  const fill = Math.min(1, Math.max(0, p.gapFill / 100));
  let grooveAt = (_k: number) => 1;
  if (gapAt && fill < 1) {
    const fGap = new Uint8Array(fx * fy);
    let any = false;
    for (let jj = 0; jj < fy; jj++) for (let ii = 0; ii < fx; ii++) {
      if (gapAt(ix0 + ii * fs, iy0 + jj * fs) >= 0.5) { fGap[jj * fx + ii] = 1; any = true; }
    }
    if (any) {
      const dGap = distanceTransform(fGap, fx, fy);
      const reach = Math.max(p.edgeSoftness, step);
      grooveAt = (k: number) => {
        const d = Math.max(0, dGap[centre(k % nx, Math.floor(k / nx))] - 0.5) * fs;
        return 1 - (1 - fill) * (1 - smoothstep(Math.min(1, d / reach)));
      };
    }
  }
  const heights = new Float32Array(N);
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (mask[k]) { heights[k] = Math.max(edgeAt(dist[k], hs[k]) * grooveAt(k), floorAt(dist[k])); continue; }
      if (sd[k] <= -step / 2) continue;
      // Outside, the shape's height is its inside neighbours'.
      let sum = 0, cnt = 0;
      for (const q of [k - 1, k + 1, k - nx, k + nx]) if (mask[q]) { sum += hs[q]; cnt++; }
      if (cnt) heights[k] = Math.max(edgeAt(sd[k], sum / cnt) * grooveAt(k), floorAt(sd[k]));
    }
  }
  return { heights, mask, fOut };
}

/** Settings for the text layer: flat letters of the given height with a small
 *  edge slope, none of the drawing's clean-up (it would eat the i's dot). */
function textParams(p: SprigParameters, height: number): SprigParameters {
  return {
    ...p, heightMode: 'flat', maxHeight: height, edgeSoftness: TEXT_EDGE,
    minEdgeThickness: Math.min(p.minEdgeThickness, height), invert: false,
    removeTiny: false, wholeShapesOnly: false, roundThin: false, thickenThin: 0,
  };
}

/**
 * Build the height field. `step` is the finished-mm grid spacing (Resolution ÷
 * the shrink factor, so the PRINTED grid is Resolution). `text` = the rendered
 * text, if any (positioned by sprigPlacement); with none, and the drawing on,
 * the grid and heights are exactly the drawing-only ones.
 */
export function buildRelief(src: SprigSource, pIn: SprigParameters, step: number, text: TextLayer | null = null): ReliefField {
  const p = effectiveParams(src, pIn);
  const textOn = !!text && hasText(p);
  const place = sprigPlacement(p, textOn ? { w: text!.mmW, h: text!.mmH } : null);
  const W = p.width, L = p.length;
  const backed = backingOn(p);
  const bb = backed ? Math.max(0, p.backingBorder) : 0;
  // Room for the backing border, or for a thin part at the drawing's edge to
  // grow when thickened, plus the always-flat border ring.
  const room = Math.max(bb, p.drawingOn && p.thickenThin > 0 ? p.thickenThin / 2 + 0.3 : 0);
  const pad = BORDER + (room > 0 ? Math.ceil(room / step) + 1 : 0);
  const nx = Math.max(1, Math.ceil(place.w / step)) + 2 * pad;
  const ny = Math.max(1, Math.ceil(place.l / step)) + 2 * pad;
  const x0 = -((nx - 1) * step) / 2, y0 = -((ny - 1) * step) / 2;
  const fx = nx * FINE, fy = ny * FINE, fs = step / FINE;
  const g: Grid = {
    nx, ny, step, x0, y0, fx, fy, fs,
    ix0: x0 - (step * (FINE - 1)) / (2 * FINE), iy0: y0 - (step * (FINE - 1)) / (2 * FINE),
  };
  const N = nx * ny;
  const centre = centreOf(g);

  // ── The drawing ──
  let heights = new Float32Array(N);
  let mask = new Uint8Array(N);
  let fOut = new Uint8Array(fx * fy).fill(1);
  if (p.drawingOn) {
    const sample = sampler(src, p);
    const sampleMask = src.mask ? sampler(src, p, src.mask) : null;
    const sampleGap = src.gap && p.gapFill < 100 ? sampler(src, p, src.gap) : null;
    const u = (x: number) => (x - place.dx + W / 2) / W, v = (y: number) => (y - place.dy + L / 2) / L;
    ({ heights, mask, fOut } = buildLayer(g, p,
      (x, y) => sample(u(x), v(y)),
      sampleMask ? (x, y) => sampleMask(u(x), v(y)) : null,
      sampleGap ? (x, y) => sampleGap(u(x), v(y)) : null));
  }

  // The drawing alone (+ any backing, below): what the bare-spot check reads, so
  // the inside of a raised "o" or a Cut In letter is never reported.
  const drawH = heights.slice();

  // ── Text: its own layer, never rotated or flipped with the drawing ──
  let cutLayer: Float32Array | null = null;
  if (textOn) {
    const t = text!;
    const sample = sampler(t, { rotation: 0, flipX: false, flipY: false });
    const inkAt = (x: number, y: number) => sample((x - place.tx + t.mmW / 2) / t.mmW, (y - place.ty + t.mmH / 2) / t.mmH);
    if (p.textStyle === 'raised') {
      // Stands on whatever is under it — plate, drawing, or (below) the sheet —
      // and counts as shape for the backing, the piece count and Thin Parts.
      const lay = buildLayer(g, textParams(p, p.textDepth), inkAt, null);
      for (let k = 0; k < N; k++) {
        heights[k] += lay.heights[k];
        if (lay.mask[k]) mask[k] = 1;
      }
      for (let k = 0; k < fOut.length; k++) if (!lay.fOut[k]) fOut[k] = 0;
    } else {
      // Cut in AFTER the backing is added, never closer than CUT_FLOOR to the
      // bottom of the sheet. Not shape: a hole in what is there.
      const depth = backed ? Math.min(p.textDepth, Math.max(0, p.backingThickness - CUT_FLOOR)) : p.textDepth;
      if (depth > 0) cutLayer = buildLayer(g, textParams(p, depth), inkAt, null).heights;
    }
  }

  // Whole-cell distances (the thin-part check works in these).
  const outside = new Uint8Array(N);
  for (let i = 0; i < N; i++) outside[i] = mask[i] ? 0 : 1;
  const dCells = distanceTransform(outside, nx, ny);

  // Backing: a sheet the drawing sits on, so separate pieces cast as one.
  // Max Height stays the drawing's own height, on top of the sheet.
  let bridgedGap = 0;
  const whole = mask.slice();           // what the cast is made of
  if (backed) {
    let sd: (i: number, j: number) => number;
    if (p.backing === 'plaque') {
      const hw = place.w / 2 + bb, hl = place.l / 2 + bb;
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
        const add = (minB + (T - minB) * t) * cover;
        heights[k] += add;
        drawH[k] += add;
        if (d > 0) whole[k] = 1;
      }
    }
  }
  if (cutLayer) for (let k = 0; k < N; k++) heights[k] = Math.max(0, heights[k] - cutLayer[k]);

  let maxH = 0, volume = 0;
  for (let k = 0; k < N; k++) { if (heights[k] > maxH) maxH = heights[k]; volume += heights[k] * step * step; }

  const thin = thinParts(mask, dCells, nx, ny, step, p.minFeatureWidth);
  const parts = countPieces(whole, nx, ny, (p.minFeatureWidth * p.minFeatureWidth) / (step * step));
  return {
    nx, ny, step, x0, y0, heights, mask, ...thin, ...parts, bridgedGap, bareHoles: p.drawingOn ? countBareHoles(drawH, nx, ny) : 0, maxHeight: maxH, volume,
    footW: place.w + 2 * bb, footL: place.l + 2 * bb,
  };
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
 * Thicken Thin Parts (Gary, 2026-10-28): every part narrower than `width` mm
 * is widened to about `width`, the rest of the shape left alone. The thin
 * parts are found the way thinParts finds them (what a disc of that width
 * cannot sweep, square-corner slivers excepted), their centre line is taken as
 * the ridge of the edge distance, and a disc of that width is swept along it.
 * A tip gains a round end up to width/2 long. Thin parts closer together than
 * `width` (two legs) can merge. New cells take the ink of the nearest cell of
 * the drawing, so gray detail carries on into them.
 */
function thicken(fOut: Uint8Array, fInk: Float32Array, fCov: Float32Array, fx: number, fy: number, fs: number, width: number) {
  const N = fx * fy;
  // Two fine cells over, both to find the thin parts and to grow them: the
  // swept width comes out a little under 2r on the grid, and Min Feature
  // measures on the coarser grid, where a part just wide enough here can read
  // just too thin.
  const r = width / 2 / fs + 2;
  const grow = r;
  const dIn = distanceTransform(fOut, fx, fy);
  const eroded = new Uint8Array(N);
  for (let k = 0; k < N; k++) eroded[k] = !fOut[k] && dIn[k] - 0.5 >= r ? 1 : 0;
  const toEroded = distanceTransform(eroded, fx, fy);
  const opened = new Uint8Array(N);
  for (let k = 0; k < N; k++) opened[k] = !fOut[k] && toEroded[k] <= r ? 1 : 0;
  const toOpened = distanceTransform(opened, fx, fy);
  const keep = CORNER * r + 1;
  // A thin part: the unswept cells lying further than `keep` from the swept
  // area, plus the unswept cells within a few steps of them. That takes in a
  // part's neck, which sits within `keep` of the body (else a tapering point
  // grew a knob on a thin stalk). The reach is limited because a picture's
  // ragged outline leaves a chain of unswept cells all round every edge, and
  // a flood along it turned the whole rim into "thin" (a bristly fringe).
  // Only patches the red check would show count (MIN_SPOT coarse cells, here
  // FINE² finer): a serrated leaf has a tiny tooth every millimetre round its
  // edge, and growing each one gave the same bristly fringe.
  const part = new Uint8Array(N);
  let front: number[] = [];
  const seen = new Uint8Array(N);
  const patch: number[] = [];
  const minCells = MIN_SPOT * FINE * FINE;
  const seed = (k: number) => !fOut[k] && !opened[k] && toOpened[k] > keep;
  for (let s0 = 0; s0 < N; s0++) {
    if (seen[s0] || !seed(s0)) continue;
    patch.length = 0;
    const st = [s0]; seen[s0] = 1;
    while (st.length) {
      const c = st.pop()!;
      patch.push(c);
      const ci = c % fx, cj = (c - ci) / fx;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const x = ci + di, y = cj + dj;
          if (x < 0 || y < 0 || x >= fx || y >= fy) continue;
          const q = y * fx + x;
          if (!seen[q] && seed(q)) { seen[q] = 1; st.push(q); }
        }
      }
    }
    if (patch.length >= minCells) for (const c of patch) { part[c] = 1; front.push(c); }
  }
  for (let step = 0; step < Math.ceil(keep) + 2 && front.length; step++) {
    const next: number[] = [];
    for (const c of front) {
      const ci = c % fx, cj = (c - ci) / fx;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const x = ci + di, y = cj + dj;
          if (x < 0 || y < 0 || x >= fx || y >= fy) continue;
          const q = y * fx + x;
          if (!fOut[q] && !opened[q] && !part[q]) { part[q] = 1; next.push(q); }
        }
      }
    }
    front = next;
  }
  // Their centre line: cells no nearer the edge than both neighbours across
  // some direction, and further than one of them. (Along a straight leg the
  // neighbours tie, and without that second test every cell of it counted.)
  const ridge = new Uint8Array(N);
  const top = (d: number, a: number, b: number) => d >= a && d >= b && (d > a || d > b);
  let any = false;
  for (let j = 1; j < fy - 1; j++) {
    for (let i = 1; i < fx - 1; i++) {
      const k = j * fx + i;
      if (!part[k]) continue;
      const d = dIn[k];
      if (top(d, dIn[k - 1], dIn[k + 1]) || top(d, dIn[k - fx], dIn[k + fx])
        || top(d, dIn[k - fx - 1], dIn[k + fx + 1]) || top(d, dIn[k - fx + 1], dIn[k + fx - 1])) {
        ridge[k] = 1; any = true;
      }
    }
  }
  if (!any) return;
  const toRidge = distanceTransform(ridge, fx, fy);
  const inside = new Uint8Array(N);
  for (let k = 0; k < N; k++) inside[k] = fOut[k] ? 0 : 1;
  const near = distanceTransform(inside, fx, fy, true).nearest;
  for (let k = 0; k < N; k++) {
    if (!fOut[k] || !(toRidge[k] <= grow)) continue;
    fOut[k] = 0; fCov[k] = 1;
    const o = near[k];
    if (o >= 0) fInk[k] = fInk[o];
  }
}

/**
 * Clean-up options, on the fine grid before anything is measured:
 *  roundThin  — morphological opening with a Min Feature disc: everything
 *               narrower is shaved off (sharp tips round, hairlines go).
 *  removeTiny — pieces smaller than Min Feature² are dropped.
 *  wholeShapesOnly — pieces touching the edge of the drawing are dropped.
 * Removed cells lose their ink too, so nothing is antialiased back in.
 */
function cleanUp(
  fOut: Uint8Array, fInk: Float32Array, fCov: Float32Array, fIn: Uint8Array,
  fx: number, fy: number, fs: number, p: SprigParameters,
) {
  const N = fx * fy;
  const drop = (k: number) => { fOut[k] = 1; fInk[k] = 0; fCov[k] = 0; };
  if (p.thickenThin > 0) thicken(fOut, fInk, fCov, fx, fy, fs, p.thickenThin);
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
/** With `remove`, small pieces are also cleared from `mask`. */
function countPieces(mask: Uint8Array, nx: number, ny: number, smallCells: number, remove = false) {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const members: number[] = [];
  let pieces = 0, smallPieces = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    pieces++;
    let area = 0;
    members.length = 0;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const k = stack.pop()!;
      area++;
      if (remove) members.push(k);
      const i = k % nx;
      if (i > 0 && mask[k - 1] && !seen[k - 1]) { seen[k - 1] = 1; stack.push(k - 1); }
      if (i < nx - 1 && mask[k + 1] && !seen[k + 1]) { seen[k + 1] = 1; stack.push(k + 1); }
      if (k >= nx && mask[k - nx] && !seen[k - nx]) { seen[k - nx] = 1; stack.push(k - nx); }
      if (k < mask.length - nx && mask[k + nx] && !seen[k + nx]) { seen[k + nx] = 1; stack.push(k + nx); }
    }
    if (area < smallCells) {
      smallPieces++;
      if (remove) for (const k of members) mask[k] = 0;
    }
  }
  return { pieces, smallPieces };
}
/** Patches smaller than this many cells are noise, not a feature. */
const MIN_SPOT = 4;

/** Height at or below which a cell has no clay, finished mm (the preview's
 *  background colour shows there too). */
export const BARE = 0.02;

/**
 * Bare spots walled in by clay: bare cells the outside cannot reach. The
 * outside spreads 8-connected — the cast holds only edge to edge (countPieces),
 * so a corner-touch is a way through. Spots under MIN_SPOT cells are noise.
 */
function countBareHoles(heights: Float32Array, nx: number, ny: number): number {
  const N = nx * ny;
  const seen = new Uint8Array(N);
  const stack: number[] = [];
  const flood = (s: number) => {
    let area = 0;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const k = stack.pop()!;
      area++;
      const i = k % nx, j = (k - i) / nx;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
          const q = b * nx + a;
          if (!seen[q] && heights[q] <= BARE) { seen[q] = 1; stack.push(q); }
        }
      }
    }
    return area;
  };
  flood(0);                             // the border ring is always bare
  let holes = 0;
  for (let k = 0; k < N; k++) if (!seen[k] && heights[k] <= BARE && flood(k) >= MIN_SPOT) holes++;
  return holes;
}

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
