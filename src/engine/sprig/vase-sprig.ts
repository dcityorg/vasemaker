/**
 * The Sprig texture (Sher, 2026-10-28): a sprig designed on the Sprig page,
 * raised out of or pressed into the vase wall — mostly for test prints.
 *
 * It is On Vase's wrap run backwards (on-vase.ts `wrapSprig`): there every
 * sprig cell is placed on the vase; here every vase point asks where it falls
 * in the sprig. Across = arc length round the vase at that height (the
 * cross-section's own perimeter), up = arc length up the surface along the
 * copy's centre line, then the Tilt undone. So the texture and the On Vase
 * preview put the sprig in the same place. The relief is added RADIALLY like
 * every other texture, so on a steep slope it stands a little proud of the
 * preview (by 1/cos of the slope); fine for a test print.
 *
 * The relief comes in through `setVaseSprigField` (the hook builds it from the
 * vase's own copy of the design, as the bottom mark does). The layout along
 * the vase is built once per design and cached; while it is built the sprig
 * itself contributes nothing, so its centre line follows the textured wall.
 *
 * The molds keep it: prepareVaseParams grows Size and Depth by the shrink
 * scale with the rest of the vase (Gary, 2026-10-28). Pour 3-Pc warns, since a
 * mold that lifts straight off is always locked by a sprig on the side.
 */

import type { VaseParameters, VaseSprigSettings } from '../types';
import type { ReliefField } from './relief';
import { computeRowContexts, computeVertex, precomputeTextureTables, type RowContext } from '../surfaces';

let field: ReliefField | null = null;
export function setVaseSprigField(f: ReliefField | null): void { field = f; }
export function getVaseSprigField(): ReliefField | null { return field; }

/** Rows and points round of the layout table (finer than any mesh needs). */
const TABLE_ROWS = 400;
const TABLE_AROUND = 720;

interface Layout {
  params: VaseParameters;
  field: ReliefField;
  /** Table row heights, mm (ascending for any vase that rises). */
  z: Float64Array;
  /** Per copy, per table row: the centre line's arc fraction round (unwrapped). */
  uc: Float64Array[];
  /** Per copy, per table row: arc length up the centre line, minus the centre's. */
  up: Float64Array[];
  /** mm of relief per mm of the field's own height. */
  gain: number;
  /** 1 / Size. */
  inv: number;
  ct: number;
  st: number;
  sign: number;
  notes: string[];
}

let cache: Layout | null = null;
let building = false;

/** The settings when the texture is on and has something to show. */
function active(params: VaseParameters): VaseSprigSettings | null {
  const s = params.textures.sprig;
  return s?.enabled && s.sprig && params.textures.enabled !== false && field && field.maxHeight > 0 && s.depth > 0 ? s : null;
}

/** Arc fraction (0..1) of `row` at local angle `deg` — anglesForSteps inverted. */
export function arcFracAt(row: RowContext, na: number, deg: number): number {
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

function buildLayout(params: VaseParameters, s: VaseSprigSettings, f: ReliefField): Layout {
  building = true;
  try {
    const R = TABLE_ROWS + 1, na = TABLE_AROUND;
    const rows = computeRowContexts(params, TABLE_ROWS, na);
    const tex = params.textures.enabled !== false;
    const { simplexPerm, woodGrainPerm } = precomputeTextureTables(params, tex);
    const z = new Float64Array(R);
    for (let r = 0; r < R; r++) z[r] = rows[r].height;

    // The centre's table row (fractional), from Height %.
    const zc = (Math.max(0, Math.min(100, s.heightPct)) / 100) * params.height;
    let rc = 0;
    while (rc + 1 < R && z[rc + 1] <= zc) rc++;
    const rcF = rc + 1 < R && z[rc + 1] > z[rc] ? rc + Math.min(1, (zc - z[rc]) / (z[rc + 1] - z[rc])) : rc;

    const n = Math.max(1, Math.round(s.copies));
    const ucs: Float64Array[] = [], ups: Float64Array[] = [];
    const pos = (r: number, u: number): [number, number, number] => {
      const ua = (((u % 1) + 1) % 1) * na;
      const a0 = Math.floor(ua) % na, a1 = (a0 + 1) % na, fa = ua - Math.floor(ua);
      const p = computeVertex(rows[r], a0, 0, undefined, params, na, tex, simplexPerm, woodGrainPerm);
      const q = computeVertex(rows[r], a1, 0, undefined, params, na, tex, simplexPerm, woodGrainPerm);
      return [p[0] + (q[0] - p[0]) * fa, p[1] + (q[1] - p[1]) * fa, p[2] + (q[2] - p[2]) * fa];
    };
    let offVase = false;
    const k = Math.max(0.01, s.size / 100);
    const halfL = (f.footL * k) / 2 + 0.5 * f.step * k;
    for (let c = 0; c < n; c++) {
      const theta = s.angle + (c * 360) / n;
      // Twist turns the whole cross-section; the sprig stays upright.
      const uc = new Float64Array(R);
      for (let r = 0; r < R; r++) uc[r] = arcFracAt(rows[r], na, theta - rows[r].twistAngle);
      for (let r = 1; r < R; r++) {
        while (uc[r] - uc[r - 1] > 0.5) uc[r] -= 1;
        while (uc[r] - uc[r - 1] < -0.5) uc[r] += 1;
      }
      const up = new Float64Array(R);
      let prev = pos(0, uc[0]);
      for (let r = 1; r < R; r++) {
        const p = pos(r, uc[r]);
        up[r] = up[r - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
        prev = p;
      }
      const r0 = Math.min(R - 2, Math.floor(rcF));
      const sC = up[r0] + (up[r0 + 1] - up[r0]) * (rcF - r0);
      for (let r = 0; r < R; r++) up[r] -= sC;
      if (up[0] > -halfL + 0.01 || up[R - 1] < halfL - 0.01) offVase = true;
      ucs.push(uc); ups.push(up);
    }

    const notes: string[] = [];
    if (offVase) notes.push('Part of the sprig hangs past the top or bottom of the vase and is cut off there. Move it with Height, or make it smaller.');
    const rowC = rows[Math.round(rcF)];
    if (n > 1 && rowC && n * f.footW * k > rowC.perimeter) {
      notes.push(`${n} copies ${Math.round(f.footW * k)} mm wide need more than the ${Math.round(rowC.perimeter)} mm round the vase at that height, so they overlap. Use fewer, or make them smaller.`);
    }
    const t = (s.tilt * Math.PI) / 180;
    return {
      params, field: f, z, uc: ucs, up: ups,
      gain: s.depth / f.maxHeight, inv: 1 / k, ct: Math.cos(t), st: Math.sin(t),
      sign: s.style === 'pressed' ? -1 : 1, notes,
    };
  } finally {
    building = false;
  }
}

function layoutFor(params: VaseParameters): Layout | null {
  if (building) return null;
  const s = active(params);
  if (!s) return null;
  if (!cache || cache.params !== params || cache.field !== field) cache = buildLayout(params, s, field!);
  return cache;
}

/** Bilinear height of the relief at (x, y), finished mm in its own frame; 0 off it. */
function heightAt(f: ReliefField, x: number, y: number): number {
  const fi = (x - f.x0) / f.step, fj = (y - f.y0) / f.step;
  if (fi < 0 || fj < 0 || fi > f.nx - 1 || fj > f.ny - 1) return 0;
  const i0 = Math.min(f.nx - 2, Math.floor(fi)), j0 = Math.min(f.ny - 2, Math.floor(fj));
  const ai = fi - i0, aj = fj - j0, h = f.heights, nx = f.nx;
  return (h[j0 * nx + i0] * (1 - ai) + h[j0 * nx + i0 + 1] * ai) * (1 - aj)
    + (h[(j0 + 1) * nx + i0] * (1 - ai) + h[(j0 + 1) * nx + i0 + 1] * ai) * aj;
}

/**
 * Radial offset (mm, + out) of the vase surface at height `z` and arc fraction
 * `arcU` round a row `perimeter` long. Copies never overlap in practice; where
 * they do the taller wins.
 */
export function vaseSprigOffset(params: VaseParameters, z: number, arcU: number, perimeter: number): number {
  const L = layoutFor(params);
  if (!L) return 0;
  const Z = L.z, R = Z.length;
  if (z < Z[0] - 1e-6 || z > Z[R - 1] + 1e-6) return 0;
  let lo = 0, hi = R - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (Z[mid] <= z) lo = mid; else hi = mid; }
  const fr = Z[hi] > Z[lo] ? Math.max(0, Math.min(1, (z - Z[lo]) / (Z[hi] - Z[lo]))) : 0;
  let best = 0;
  for (let c = 0; c < L.uc.length; c++) {
    const uc = L.uc[c], up = L.up[c];
    const u0 = uc[lo] + (uc[hi] - uc[lo]) * fr;
    let du = arcU - u0;
    du -= Math.round(du);
    const x = du * perimeter, y = up[lo] + (up[hi] - up[lo]) * fr;
    // Undo the tilt (On Vase: x = x0·ct + y0·st, y = −x0·st + y0·ct).
    const x0 = (x * L.ct - y * L.st) * L.inv, y0 = (x * L.st + y * L.ct) * L.inv;
    const h = heightAt(L.field, x0, y0);
    if (h > best) best = h;
  }
  return L.sign * best * L.gain;
}

/** Warnings for the current design (empty when the texture is off). */
export function vaseSprigNotes(params: VaseParameters): string[] {
  const s = params.textures.sprig;
  if (!s?.enabled || !s.sprig) return [];
  const notes: string[] = [];
  if (params.textures.enabled === false) notes.push('The Sprig texture is on, but Textures is switched off at the top of this section.');
  const L = layoutFor(params);
  if (L) notes.push(...L.notes);
  if (s.style === 'pressed' && params.wallThickness > 0) {
    const wt = params.wallThickness;
    if (params.smoothInner) {
      const minW = params.minWallThickness ?? 0.4;
      if (wt - s.depth < minW) notes.push(`Pressed in ${s.depth} mm into a ${wt} mm wall: Min Wall keeps ${minW} mm behind it, so the inside bulges in there. Thicken the wall (Shell) or press it in less.`);
      else if (wt - s.depth < 1) notes.push(`Only ${(wt - s.depth).toFixed(1)} mm of wall is left behind the sprig. Thicken the wall (Shell) or press it in less.`);
    }
    // Smooth Inner off: the inside follows the sprig and the wall keeps its
    // thickness, so there is nothing to warn about (the help says so).
  }
  return notes;
}
