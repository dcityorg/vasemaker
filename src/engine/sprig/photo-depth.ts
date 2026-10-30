/**
 * Photo depth (Gary, 2026-10-29): a depth model's output → sprig heights. Pure
 * math (no DOM); the browser runs the model (lib/photo-depth.ts) and hands the
 * raw depth in, so Node tests run all of this.
 *
 * Raw depth on its own is a poor relief: on a photo it is mostly one big tilt
 * (whatever leans toward the camera), and on flat artwork nearly nothing. So
 * the heights are a blend, tuned by eye on Gary's dragonflies and nature
 * pictures with Depth Anything V2 Small:
 *   - a dome from the outline, like Inflate, so every part rounds into the plate
 *   - the depth's mid-scale detail (depth minus a wide blur): petals, a shell's
 *     ridge, a head — only where the outline's dome has risen
 *   - a little of the depth's large-scale shape
 * Everything is relative to the shape's size in pixels, so the same picture
 * gives the same relief at any resolution.
 */

/** Model depth, row-major, row 0 at the top. Larger = nearer the camera. */
export interface DepthMap {
  data: Float32Array;
  width: number;
  height: number;
}

/** Blend weights (fractions of the shape's longer side for the lengths). */
const DOME_REACH = 0.06;   // distance in from the outline the dome takes to rise
const ROLL_REACH = 0.025;  // distance over which the detail fades in from the outline
const WIDE_BLUR = 0.04;    // what counts as "large scale"
const FLOOR = 0.12, DOME = 0.55, DETAIL = 0.13, LARGE = 0.2;
const MIN_H = 0.03;

/** Three box passes of radius r (≈ a Gaussian), over every pixel. */
function blur3(v: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = v.slice(), t = new Float32Array(v.length);
  if (r < 1) return a;
  const pass = (s: Float32Array, d: Float32Array, horiz: boolean) => {
    const n = horiz ? w : h, lines = horiz ? h : w;
    for (let l = 0; l < lines; l++) {
      const at = (i: number) => (horiz ? l * w + i : i * w + l);
      let sum = 0, c = 0;
      for (let i = 0; i <= Math.min(r, n - 1); i++) { sum += s[at(i)]; c++; }
      for (let i = 0; i < n; i++) {
        d[at(i)] = sum / c;
        const add = i + r + 1, sub = i - r;
        if (add < n) { sum += s[at(add)]; c++; }
        if (sub >= 0) { sum -= s[at(sub)]; c--; }
      }
    }
  };
  for (let k = 0; k < 3; k++) { pass(a, t, true); pass(t, a, false); }
  return a;
}

/**
 * Heights 0..1 (1 = Max Height) for the pixels inside the shape; 0 outside.
 * `depth` is sampled at this image's pixels (it may be at another size).
 * `inside` = 1 for shape pixels; `edgeDist` = each pixel's distance to the
 * nearest background pixel, in pixels.
 */
export function depthRelief(
  depth: DepthMap, w: number, h: number, inside: Uint8Array, edgeDist: Float32Array,
  crop = { x0: 0, y0: 0, fullW: w, fullH: h },
): Float32Array {
  const N = w * h;
  // Depth at each pixel of the (cropped) picture, bilinear from the model's grid.
  const d = new Float32Array(N);
  const sx = depth.width / crop.fullW, sy = depth.height / crop.fullH;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(depth.height - 1, Math.max(0, (y + crop.y0 + 0.5) * sy - 0.5));
    const j0 = Math.floor(fy), j1 = Math.min(depth.height - 1, j0 + 1), ty = fy - j0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(depth.width - 1, Math.max(0, (x + crop.x0 + 0.5) * sx - 0.5));
      const i0 = Math.floor(fx), i1 = Math.min(depth.width - 1, i0 + 1), tx = fx - i0;
      const D = depth.data, W = depth.width;
      d[y * w + x] = (D[j0 * W + i0] * (1 - tx) + D[j0 * W + i1] * tx) * (1 - ty)
        + (D[j1 * W + i0] * (1 - tx) + D[j1 * W + i1] * tx) * ty;
    }
  }
  // Normalise between the 1st and 99th percentile INSIDE the shape: the
  // background's depth (a table, a sky) must not squash the subject's range.
  const vals: number[] = [];
  for (let k = 0; k < N; k++) if (inside[k]) vals.push(d[k]);
  const out = new Float32Array(N);
  if (!vals.length) return out;
  vals.sort((a, b) => a - b);
  const lo = vals[Math.floor((vals.length - 1) * 0.01)], hi = vals[Math.floor((vals.length - 1) * 0.99)];
  const span = hi - lo > 1e-6 ? hi - lo : 1;
  const r01 = new Float32Array(N);
  for (let k = 0; k < N; k++) r01[k] = Math.min(1, Math.max(0, (d[k] - lo) / span));

  const size = Math.max(w, h);
  const wide = blur3(r01, w, h, Math.round(size * WIDE_BLUR));
  // Mid-scale detail, in units of its own spread inside the shape.
  let s2 = 0, n = 0;
  for (let k = 0; k < N; k++) if (inside[k]) { const v = r01[k] - wide[k]; s2 += v * v; n++; }
  const sd = Math.sqrt(s2 / n) || 1;
  const dome = size * DOME_REACH, roll = size * ROLL_REACH;
  for (let k = 0; k < N; k++) {
    if (!inside[k]) continue;
    const e = edgeDist[k];
    const det = Math.max(-2.5, Math.min(2.5, (r01[k] - wide[k]) / sd));
    const hh = FLOOR + DOME * Math.sqrt(Math.min(1, e / dome)) + DETAIL * det * Math.min(1, e / roll) + LARGE * wide[k];
    out[k] = Math.min(1, Math.max(MIN_H, hh));
  }
  return out;
}

/** Distinct colours (4 bits a channel) below which a picture is a drawing.
 *  Measured 2026-10-29 on Gary's 38 test pictures at 256 px: every drawing
 *  ≤ 76, every photo ≥ 120 (colour illustrations with shading land in
 *  between or above — offering them Photo depth costs nothing). */
const PHOTO_COLOURS = 100;
const PROBE = 256;

/** Does this picture look like a photo (shading everywhere) rather than a
 *  drawing (a few flat colours)? Counts the opaque pixels' colours on a grid
 *  of at most PROBE × PROBE samples. */
export function looksLikePhoto(img: { data: Uint8Array | Uint8ClampedArray; width: number; height: number }): boolean {
  const { data, width: w, height: h } = img;
  const step = Math.max(1, Math.max(w, h) / PROBE);
  const seen = new Set<number>();
  for (let fy = 0; fy < h; fy += step) {
    for (let fx = 0; fx < w; fx += step) {
      const k = (Math.floor(fy) * w + Math.floor(fx)) * 4;
      if (data[k + 3] < 128) continue;
      seen.add(((data[k] >> 4) << 8) | ((data[k + 1] >> 4) << 4) | (data[k + 2] >> 4));
      if (seen.size >= PHOTO_COLOURS) return true;
    }
  }
  return false;
}
