/**
 * A relief someone else made (an STL: a plaque with the shape standing on it,
 * e.g. MakerWorld's Relief Sculpture Maker, Gary 2026-10-29) → a height map the
 * sprig engine reads like a picture. Pure math (no DOM), so Node tests run it.
 *
 * The plaque's thinnest axis is "up". Its two faces are rasterized at once —
 * the highest point seen from each side — and the side whose heights vary is
 * the relief; the other is the flat back. The flat plaque round the relief is
 * the floor (median of the map's outer ring): the relief is what stands above
 * it, and everything at the floor becomes background. The plaque's own
 * thickness is dropped — the sprig gets our plate.
 */

import { SPRIG_PARAMS } from '@/config/sprig-params';
import { smallestFit } from './sprig-generator';
import { RELIEF_SETTINGS, type SprigParameters } from './sprig-types';

export interface StlReliefMap {
  /** Height above the plaque, mm, row-major, row 0 at the TOP; 0 = background. */
  heights: Float32Array;
  width: number;
  height: number;
  /** mm per pixel. */
  pixelMm: number;
  /** Tallest point above the plaque, mm. */
  maxHeight: number;
}

/** Below this, mm, a point counts as the plaque, not the relief. */
const FLOOR_TOL = 0.02;
/** Transparent pixels kept round the relief, so the picture's edge is background. */
const PAD = 2;

/** Triangles as a flat list of 9 floats each. Binary or ASCII STL. */
export function parseStl(buf: ArrayBuffer): Float32Array {
  const dv = new DataView(buf);
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + 50 * n === buf.byteLength) {
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        const o = 84 + 50 * i + 12;
        for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + 4 * k, true);
      }
      return out;
    }
  }
  const text = new TextDecoder().decode(buf);
  if (!/^\s*solid/.test(text)) throw new Error('not an STL file');
  const nums: number[] = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) nums.push(+m[1], +m[2], +m[3]);
  if (nums.length < 9 || nums.length % 9) throw new Error('no triangles in the STL');
  return Float32Array.from(nums);
}

/**
 * The relief's height map, at most `maxPx` pixels on its longer side, cropped
 * to the relief plus PAD. Null when nothing stands above the plaque.
 */
export function stlToReliefMap(tris: Float32Array, maxPx = 1024): StlReliefMap | null {
  const nv = tris.length / 3;
  if (nv < 3) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nv; v++) for (let a = 0; a < 3; a++) {
    const c = tris[v * 3 + a];
    if (c < lo[a]) lo[a] = c;
    if (c > hi[a]) hi[a] = c;
  }
  const ext = [0, 1, 2].map((a) => hi[a] - lo[a]);
  const up = ext.indexOf(Math.min(...ext));
  // Right and top axes, columns running +ra. Seen from +up, right = (−up) × top:
  // +x for a plaque lying flat (y top), +y when it stands across x — but −x
  // when it stands across y, so that view is mirrored (z top in both).
  const [ra, ta] = up === 2 ? [0, 1] : up === 1 ? [0, 2] : [1, 2];
  const span = Math.max(ext[ra], ext[ta]);
  if (!(span > 0)) return null;
  const px = span / Math.max(16, maxPx);
  const W = Math.max(1, Math.ceil(ext[ra] / px)), H = Math.max(1, Math.ceil(ext[ta] / px));
  const N = W * H;
  // Highest point seen from +up (top) and from −up (bottom), per pixel.
  const top = new Float32Array(N).fill(-Infinity), bot = new Float32Array(N).fill(Infinity);
  const put = (k: number, h: number) => { if (h > top[k]) top[k] = h; if (h < bot[k]) bot[k] = h; };
  // Pixel coordinates: x right, y DOWN from the top edge (row 0 = top).
  const X = (v: number) => (tris[v * 3 + ra] - lo[ra]) / px - 0.5;
  const Y = (v: number) => (hi[ta] - tris[v * 3 + ta]) / px - 0.5;
  const Z = (v: number) => tris[v * 3 + up];
  for (let t = 0; t < nv; t += 3) {
    const x0 = X(t), y0 = Y(t), x1 = X(t + 1), y1 = Y(t + 1), x2 = X(t + 2), y2 = Y(t + 2);
    const z0 = Z(t), z1 = Z(t + 1), z2 = Z(t + 2);
    // Corners always land, so a triangle smaller than a pixel still counts.
    for (const [x, y, z] of [[x0, y0, z0], [x1, y1, z1], [x2, y2, z2]]) {
      const i = Math.min(W - 1, Math.max(0, Math.round(x))), j = Math.min(H - 1, Math.max(0, Math.round(y)));
      put(j * W + i, z);
    }
    const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(den) < 1e-12) continue;      // edge-on (a side wall)
    const i0 = Math.max(0, Math.ceil(Math.min(x0, x1, x2))), i1 = Math.min(W - 1, Math.floor(Math.max(x0, x1, x2)));
    const j0 = Math.max(0, Math.ceil(Math.min(y0, y1, y2))), j1 = Math.min(H - 1, Math.floor(Math.max(y0, y1, y2)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = ((y1 - y2) * (i - x2) + (x2 - x1) * (j - y2)) / den;
      const b = ((y2 - y0) * (i - x2) + (x0 - x2) * (j - y2)) / den;
      const c = 1 - a - b;
      if (a < -1e-6 || b < -1e-6 || c < -1e-6) continue;
      put(j * W + i, a * z0 + b * z1 + c * z2);
    }
  }
  // Pixels no triangle reached take their neighbours' value (a few passes).
  for (const buf of [top, bot]) {
    const hiSide = buf === top;
    for (let pass = 0; pass < 3; pass++) {
      let filled = 0;
      const prev = buf.slice();
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (Number.isFinite(prev[k])) continue;
        let best = hiSide ? -Infinity : Infinity;
        for (const q of [i > 0 ? k - 1 : -1, i < W - 1 ? k + 1 : -1, j > 0 ? k - W : -1, j < H - 1 ? k + W : -1]) {
          if (q >= 0 && Number.isFinite(prev[q])) best = hiSide ? Math.max(best, prev[q]) : Math.min(best, prev[q]);
        }
        if (Number.isFinite(best)) { buf[k] = best; filled++; }
      }
      if (!filled) break;
    }
  }

  // Each side's heights above its own floor (the median of the outer ring).
  const side = (sign: 1 | -1) => {
    const buf = sign > 0 ? top : bot;
    const ring: number[] = [];
    const bw = Math.max(1, Math.round(Math.min(W, H) * 0.02));
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (i >= bw && i < W - bw && j >= bw && j < H - bw) continue;
      const v = buf[j * W + i];
      if (Number.isFinite(v)) ring.push(v);
    }
    ring.sort((p, q) => p - q);
    const floor = ring.length ? ring[ring.length >> 1] : 0;
    const h = new Float32Array(N);
    let max = 0;
    for (let k = 0; k < N; k++) {
      const v = Number.isFinite(buf[k]) ? sign * (buf[k] - floor) : 0;
      if (v > FLOOR_TOL) { h[k] = v; if (v > max) max = v; }
    }
    return { h, max };
  };
  const a = side(1), b = side(-1);
  // Seen from −up the picture is mirrored left to right; a plaque standing
  // across y is mirrored seen from +up instead.
  const useB = b.max > a.max;
  const mirror = up === 1 ? !useB : useB;
  const h = useB ? b.h : a.h;
  const maxH = useB ? b.max : a.max;
  if (!(maxH > 0)) return null;
  if (mirror) for (let j = 0; j < H; j++) h.subarray(j * W, j * W + W).reverse();

  let cx0 = W, cx1 = -1, cy0 = H, cy1 = -1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (h[j * W + i] <= 0) continue;
    if (i < cx0) cx0 = i; if (i > cx1) cx1 = i;
    if (j < cy0) cy0 = j; if (j > cy1) cy1 = j;
  }
  const cw = cx1 - cx0 + 1 + 2 * PAD, ch = cy1 - cy0 + 1 + 2 * PAD;
  const out = new Float32Array(cw * ch);
  for (let j = cy0; j <= cy1; j++) for (let i = cx0; i <= cx1; i++) out[(j - cy0 + PAD) * cw + i - cx0 + PAD] = h[j * W + i];
  return { heights: out, width: cw, height: ch, pixelMm: px, maxHeight: maxH };
}

/**
 * The map as RGBA for a PNG: gray = height (black = tallest, as Gray mode
 * reads it), background transparent so the picture pipeline cuts it away.
 */
export function reliefMapToRgba(m: StlReliefMap): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(new ArrayBuffer(m.width * m.height * 4));
  for (let k = 0; k < m.heights.length; k++) {
    const v = m.heights[k];
    const g = v > 0 ? Math.round(255 * (1 - v / m.maxHeight)) : 255;
    rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = g;
    rgba[k * 4 + 3] = v > 0 ? 255 : 0;
  }
  return rgba;
}

/** Finished size of the relief as drawn, mm (without the transparent pad). */
export function reliefMapSize(m: StlReliefMap): { width: number; length: number } {
  return { width: (m.width - 2 * PAD) * m.pixelMm, length: (m.height - 2 * PAD) * m.pixelMm };
}

/**
 * `p` with a loaded relief as its drawing: its own size and height, read as
 * made — Gray, raw tones, nothing softened — and the smallest standard mold it
 * fits. The Sprig page's Load Relief STL (one undo step).
 */
export function withRelief(p: SprigParameters, url: string, name: string, size: { width: number; length: number; maxHeight: number }): SprigParameters {
  const lim = (v: number, k: 'width' | 'length' | 'maxHeight') => {
    const r = SPRIG_PARAMS[k];
    return Math.min(r.max, Math.max(r.min, Math.round(v / r.step) * r.step));
  };
  const next: SprigParameters = {
    ...p, svg: url, svgName: name, svgAspect: size.width / size.length,
    rotation: 0, flipX: false, flipY: false, lockAspect: true,
    width: lim(size.width, 'width'), length: lim(size.length, 'length'), maxHeight: lim(size.maxHeight, 'maxHeight'),
    // The gray IS the height, exactly as the relief maker made it.
    ...RELIEF_SETTINGS,
  };
  const fit = smallestFit(next);
  const moldSize = next.moldSize === 'custom' ? 'custom' : fit ?? next.moldSize;
  // Remembered, so Reset All comes back to these (drawingDefaults).
  return { ...next, moldSize, loadedAs: 'relief', loadedMaxHeight: next.maxHeight, loadedMoldSize: moldSize };
}
