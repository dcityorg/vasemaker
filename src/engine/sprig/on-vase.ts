/**
 * SprigMaker's On Vase preview: the sprig's relief laid onto the current vase,
 * and the HandleMaker handle placed on it (Gary, 2026-10-25).
 *
 * DRAPE: the sprig's back follows the vase's TEXTURED outer surface and its
 * relief stands on top, so a texture bulges the sprig out or in and can never
 * poke through it. That is what a soft sprig pressed onto fluting mostly does;
 * real clay smooths some of it, so the preview shows the most that can show.
 *
 * Wrap: across the sprig = arc length around the vase at that height (the
 * cross-section's own perimeter, so oval and square vases measure right); up =
 * arc length up the surface from the chosen spot, so a sloping wall is not
 * squashed. No stretching is modelled: on a bellied vase real clay stretches a
 * little, so size and placement are right, exact shape is close.
 *
 * Finished mm throughout (the vase design and the relief are both finished size).
 */

import type { VaseParameters, VaseMesh } from '../types';
import { computeRowContexts, computeVertex, precomputeTextureTables, type RowContext } from '../surfaces';
import type { ReliefField } from './relief';
import type { HandleParameters } from '../handle/handle-types';
import { sampleSpine } from '../handle/spine';
import { vaseOutlineForHandle, placeHandle, sweepHandle, resweep, meshSweep, outlineAt } from '../mold/split-handle';
import type { P2 } from '../handle/mesh3';

/** Sprig skin stands this far off the vase so a zero-height edge doesn't flicker into it. */
const LIFT = 0.05;
/** The sampled surface is capped: a preview does not need a 500-row vase. */
const MAX_ROWS = 400;
const MAX_AROUND = 720;
/** Longest side of the sprig grid drawn (cells are skipped past this). */
const MAX_SPRIG_CELLS = 700;

export interface VaseSurface {
  rows: RowContext[];
  nr: number;
  na: number;
  /** Outer surface, textured: [row][around] → xyz. */
  P: Float32Array;
  /** Outward unit normals at the same points. */
  N: Float32Array;
  height: number;
  /** A Voronoi or SVG texture cuts holes through the wall. */
  hasCutout: boolean;
}

/** Sample the vase's outer (textured) surface once per vase design. */
export function buildVaseSurface(vase: VaseParameters): VaseSurface {
  const nr = Math.min(vase.resolution.vertical, MAX_ROWS);
  const na = Math.min(vase.resolution.radial, MAX_AROUND);
  const tex = vase.textures.enabled !== false;
  const { simplexPerm, woodGrainPerm } = precomputeTextureTables(vase, tex);
  const rows = computeRowContexts(vase, nr, na);
  const R = rows.length;
  const P = new Float32Array(R * na * 3);
  for (let r = 0; r < R; r++) {
    for (let a = 0; a < na; a++) {
      const [x, y, z] = computeVertex(rows[r], a, 0, undefined, vase, na, tex, simplexPerm, woodGrainPerm);
      const i = (r * na + a) * 3;
      P[i] = x; P[i + 1] = y; P[i + 2] = z;
    }
  }
  const N = new Float32Array(R * na * 3);
  const at = (r: number, a: number, k: number) => P[(r * na + ((a + na) % na)) * 3 + k];
  for (let r = 0; r < R; r++) {
    const r0 = Math.max(0, r - 1), r1 = Math.min(R - 1, r + 1);
    const row = rows[r];
    const tw = (row.twistAngle * Math.PI) / 180;
    const cx = row.centerX * Math.cos(tw) - row.centerY * Math.sin(tw);
    const cy = row.centerY * Math.cos(tw) + row.centerX * Math.sin(tw);
    for (let a = 0; a < na; a++) {
      const ux = at(r, a + 1, 0) - at(r, a - 1, 0), uy = at(r, a + 1, 1) - at(r, a - 1, 1), uz = at(r, a + 1, 2) - at(r, a - 1, 2);
      const vx = at(r1, a, 0) - at(r0, a, 0), vy = at(r1, a, 1) - at(r0, a, 1), vz = at(r1, a, 2) - at(r0, a, 2);
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const L = Math.hypot(nx, ny, nz) || 1;
      nx /= L; ny /= L; nz /= L;
      const i = (r * na + a) * 3;
      // Outward = away from this row's centre line.
      if (nx * (P[i] - cx) + ny * (P[i + 1] - cy) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      N[i] = nx; N[i + 1] = ny; N[i + 2] = nz;
    }
  }
  const t = vase.textures;
  const hasCutout = tex && ((t.voronoi?.enabled && t.voronoi.cutout) || (t.svgPattern?.enabled && t.svgPattern.cutout)) === true;
  return { rows, nr: R, na, P, N, height: vase.height, hasCutout };
}

export interface OnVasePlacement {
  /** Centre height, % of the vase's height. */
  heightPct: number;
  /** Degrees around, + = counter-clockwise from above (the vase's own angle). */
  angle: number;
  /** Degrees, + = clockwise as seen from outside. */
  tilt: number;
  copies: number;
}

export interface OnVaseResult {
  mesh: VaseMesh | null;
  /** Some of the sprig hangs past the top or bottom of the vase. */
  offVase: boolean;
  /** Copies (each Width wide) need more than the way round at their height. */
  overlap: boolean;
}

/** Arc fraction (0..1) of row `row` at local angle `deg` — anglesForSteps inverted. */
function arcFracAt(row: RowContext, na: number, deg: number): number {
  const A = row.anglesForSteps;
  const d = ((deg % 360) + 360) % 360;
  let lo = 0, hi = na; // hi = na stands for 360°
  const angAt = (k: number) => (k >= na ? 360 : A[k]);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (angAt(mid) <= d) lo = mid; else hi = mid;
  }
  const a0 = angAt(lo), a1 = angAt(hi);
  return (lo + (a1 > a0 ? (d - a0) / (a1 - a0) : 0)) / na;
}

/** Lay `copies` of the relief onto the surface. */
export function wrapSprig(s: VaseSurface, relief: ReliefField, pl: OnVasePlacement): OnVaseResult {
  const { rows, nr, na, P, N } = s;
  const R = nr;
  const sample = (rf: number, u: number, out: Float64Array, off: number) => {
    // u wraps. Normals blend bilinearly (they only set the offset direction).
    const r0 = Math.max(0, Math.min(R - 2, Math.floor(rf)));
    const fr = Math.max(0, Math.min(1, rf - r0));
    const ua = (((u % 1) + 1) % 1) * na;
    const a0 = Math.floor(ua) % na, a1 = (a0 + 1) % na, fa = ua - Math.floor(ua);
    for (let k = 0; k < 3; k++) {
      const p00 = P[(r0 * na + a0) * 3 + k], p01 = P[(r0 * na + a1) * 3 + k];
      const p10 = P[((r0 + 1) * na + a0) * 3 + k], p11 = P[((r0 + 1) * na + a1) * 3 + k];
      // Position on the SAME two triangles the vase mesh draws (each quad split
      // bottom-left → top-right, generateMesh). A smooth (bilinear) surface
      // differs from those flat triangles by more than LIFT on fluting, and the
      // vase then cut through the sprig's thin edge — a jagged outline.
      out[off + k] = fa >= fr
        ? p00 + fa * (p01 - p00) + fr * (p11 - p01)
        : p00 + fr * (p10 - p00) + fa * (p11 - p10);
      const n00 = N[(r0 * na + a0) * 3 + k], n01 = N[(r0 * na + a1) * 3 + k];
      const n10 = N[((r0 + 1) * na + a0) * 3 + k], n11 = N[((r0 + 1) * na + a1) * 3 + k];
      out[off + 3 + k] = (n00 * (1 - fa) + n01 * fa) * (1 - fr) + (n10 * (1 - fa) + n11 * fa) * fr;
    }
  };

  // Centre row: the first row reaching the chosen height.
  const zc = (Math.max(0, Math.min(100, pl.heightPct)) / 100) * s.height;
  let rc = 0;
  while (rc + 1 < R && rows[rc + 1].height <= zc) rc++;
  const rcF = rc + 1 < R && rows[rc + 1].height > rows[rc].height
    ? rc + Math.min(1, (zc - rows[rc].height) / (rows[rc + 1].height - rows[rc].height)) : rc;

  const tmp = new Float64Array(6);
  const totalCopies = Math.max(1, Math.round(pl.copies));
  let offVase = false;
  const positions: number[] = [];
  const indices: number[] = [];
  const stride = Math.max(1, Math.ceil(Math.max(relief.nx, relief.ny) / MAX_SPRIG_CELLS));
  const nxs = Math.floor((relief.nx - 1) / stride) + 1, nys = Math.floor((relief.ny - 1) / stride) + 1;
  const tilt = (pl.tilt * Math.PI) / 180, ct = Math.cos(tilt), st = Math.sin(tilt);
  const footW = relief.footW;

  for (let c = 0; c < totalCopies; c++) {
    const theta = pl.angle + (c * 360) / totalCopies;
    // Per row: where this copy's centre line crosses it. Twist turns the whole
    // cross-section, so the local angle is the world angle less the twist —
    // the sprig stays upright on a twisted vase.
    const uc = new Float64Array(R);
    for (let r = 0; r < R; r++) uc[r] = arcFracAt(rows[r], na, theta - rows[r].twistAngle);
    for (let r = 1; r < R; r++) { // unwrap so neighbours interpolate the short way
      while (uc[r] - uc[r - 1] > 0.5) uc[r] -= 1;
      while (uc[r] - uc[r - 1] < -0.5) uc[r] += 1;
    }
    // Arc length up that centre line.
    const cum = new Float64Array(R);
    const prev = new Float64Array(6);
    sample(0, uc[0], prev, 0);
    for (let r = 1; r < R; r++) {
      sample(r, uc[r], tmp, 0);
      cum[r] = cum[r - 1] + Math.hypot(tmp[0] - prev[0], tmp[1] - prev[1], tmp[2] - prev[2]);
      prev.set(tmp);
    }
    const lerp = (arr: Float64Array, rf: number) => {
      const r0 = Math.max(0, Math.min(R - 2, Math.floor(rf)));
      const f = Math.max(0, Math.min(1, rf - r0));
      return arr[r0] + (arr[r0 + 1] - arr[r0]) * f;
    };
    const sC = lerp(cum, rcF);
    const rowAtArc = (sArc: number): number => {
      if (sArc <= 0) { if (sArc < -0.01) offVase = true; return 0; }
      if (sArc >= cum[R - 1]) { if (sArc > cum[R - 1] + 0.01) offVase = true; return R - 1; }
      let lo = 0, hi = R - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= sArc) lo = mid; else hi = mid; }
      return lo + (cum[hi] > cum[lo] ? (sArc - cum[lo]) / (cum[hi] - cum[lo]) : 0);
    };
    const perimAt = (rf: number) => {
      const r0 = Math.max(0, Math.min(R - 2, Math.floor(rf)));
      const f = Math.max(0, Math.min(1, rf - r0));
      return rows[r0].perimeter + (rows[r0 + 1].perimeter - rows[r0].perimeter) * f;
    };

    const base = positions.length / 3;
    for (let j = 0; j < nys; j++) {
      for (let i = 0; i < nxs; i++) {
        const gi = Math.min(relief.nx - 1, i * stride), gj = Math.min(relief.ny - 1, j * stride);
        const x0 = relief.x0 + gi * relief.step, y0 = relief.y0 + gj * relief.step;
        // Tilt: clockwise as seen from outside (x right, y up).
        const x = x0 * ct + y0 * st, y = -x0 * st + y0 * ct;
        const rf = rowAtArc(sC + y);
        const perim = perimAt(rf) || 1;
        const u = lerp(uc, rf) + x / perim;
        sample(rf, u, tmp, 0);
        const h = relief.heights[gj * relief.nx + gi] + LIFT;
        positions.push(tmp[0] + tmp[3] * h, tmp[1] + tmp[4] * h, tmp[2] + tmp[5] * h);
      }
    }
    for (let j = 0; j + 1 < nys; j++) {
      for (let i = 0; i + 1 < nxs; i++) {
        const g = (ii: number, jj: number) => relief.heights[Math.min(relief.ny - 1, jj * stride) * relief.nx + Math.min(relief.nx - 1, ii * stride)];
        const ha = g(i, j), hb = g(i + 1, j), hd = g(i, j + 1), he = g(i + 1, j + 1);
        if (Math.max(ha, hb, hd, he) <= 0) continue;
        const a = base + j * nxs + i, b = a + 1, d = a + nxs, e = d + 1;
        // Split along the diagonal whose ends differ least (it follows the
        // outline), and skip a triangle with no height at all — it would lie
        // flat on the vase as an orange sliver and make the outline look stepped.
        const tris: [number, number, number, number, number, number][] = Math.abs(ha - he) <= Math.abs(hb - hd)
          ? [[a, b, e, ha, hb, he], [a, e, d, ha, he, hd]]
          : [[a, b, d, ha, hb, hd], [b, e, d, hb, he, hd]];
        for (const [p0, p1, p2, h0, h1, h2] of tris) if (h0 > 0 || h1 > 0 || h2 > 0) indices.push(p0, p1, p2);
      }
    }
  }

  const rowC = rows[Math.round(rcF)];
  const overlap = totalCopies > 1 && totalCopies * footW > (rowC?.perimeter ?? Infinity);
  if (!indices.length) return { mesh: null, offVase, overlap };
  // Only the vertices some triangle uses.
  const used = new Int32Array(positions.length / 3).fill(-1);
  const pos: number[] = [];
  const idx = new Uint32Array(indices.length);
  for (let k = 0; k < indices.length; k++) {
    const v = indices[k];
    if (used[v] < 0) { used[v] = pos.length / 3; pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); }
    idx[k] = used[v];
  }
  const P32 = new Float32Array(pos);
  return {
    mesh: { positions: P32, normals: new Float32Array(P32.length), indices: idx, vertexCount: P32.length / 3, triangleCount: idx.length / 3 },
    offVase, overlap,
  };
}

/**
 * The HandleMaker handle on the vase, as one solid: placed on the vase's
 * outline at `angle` (degrees around, the vase's own angle) with its top
 * `topDrop` mm below the rim — the same placement the Split Halves mold uses.
 * Its ends run into the wall.
 */
export function handleOnVase(vase: VaseParameters, handle: HandleParameters, angle: number, topDrop: number): VaseMesh | string {
  const outline = vaseOutlineForHandle(vase, angle, true);
  const stations = sampleSpine(handle.spinePoints, handle.spineTypes, Math.round(handle.spineSamples) || 160, 1);
  const pl = placeHandle(outline.sil, stations, outline.rimZ - topDrop);
  if (typeof pl === 'string') return pl;
  // Stored width is IN the handle's plane (seen side-on), thickness across it.
  const hw = handle.width / 2, ht = handle.thickness / 2;
  const seg = 24;
  const sw = sweepHandle(stations, pl, hw, ht, 0, seg, (z, u) => outlineAt(outline.sil, z) - u, 0.6);
  if (typeof sw === 'string') return sw;
  const ring: P2[] = [];
  for (let k = 0; k < 2 * seg; k++) {
    const t = (k / (2 * seg)) * Math.PI * 2;
    ring.push([Math.cos(t) * hw, Math.sin(t) * ht]);
  }
  const full = resweep(sw, pl, ring, sw.frames.map((_, i) => i));
  const a = (angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const [cx, cy] = outline.center;
  return meshSweep(full, (z, u, h) => [cx + u * ca - h * sa, cy + u * sa + h * ca, z]);
}
