/**
 * Numeric verification for the Split Halves mold (moldmaker-split2pc-plan.md,
 * Phase 4). Solids are probed with RAYS, not vertex positions
 * (feedback: a feature can exist in the mesh and not in the solid).
 *  A. every part closed + outward on several vases, with and without a handle;
 *  B. the master SEATS: no master/plate interference anywhere (vertical rays
 *     over the whole plate), and the master's skirt bottom rests on the pocket
 *     floor at −seat;
 *  C. pocket clearance: every skirt vertex is inside the pocket outline, at
 *     least Fit Clearance from it, and outside the finger island;
 *  D. natches mate: where plate L moulds a plaster BUMP (pocket), plate R
 *     moulds a DIMPLE (dome) at the same world point, and vice versa;
 *  E. walls: wall 1 + wall 2 (placed at the far end) do not interfere with each
 *     other, the plate, or the master; the collar does not bite the master;
 *  F. one kit vs two: round vase → one kit; handle or twist → two;
 *  G. the file's own mug builds with its handle and reports no undercuts;
 *  H. the well-end CAP closes the hollow: rays along x across the end section
 *     find master solid at the cap and void just behind it (the control);
 *  I. the handle is HOLLOW with ribs: vertical rays up a line along the strap
 *     find the channel open to the cut face except at the ribs (control: the
 *     solid sweep reads closed everywhere) and the skin top is unchanged. With
 *     Rib Slot on (2026-11-01) the centreline is open the whole way (the slot)
 *     and a line 1 mm into a rib half finds the 3 ribs; at Rib Slot 0 the
 *     centreline finds them (the control, file mug only).
 *  J. natches are placed automatically: every one at least NATCH_EDGE (4 mm)
 *     clear of the block edge, the pocket and the other natches, no bigger than
 *     Natch Diameter, at least one bump and one dimple; count 3/4 honoured,
 *     and forced to 4 (with a note) when one plate pours both halves;
 *  K. each pull-rib is split by Rib Slot (2026-11-01; it replaced the water
 *     tunnel): two solids per rib, and across each rib's middle the channel
 *     is open to the cut face over the slot's width and closed by rib either
 *     side of it;
 *  L. the handle-to-rim plaster gap warns on Gary's poured mug (it chipped)
 *     and stops warning once the handle is lowered.
 *  M. FOOT PIECE (Gary, 2026-10-14), when on: every disc/foot solid closed;
 *     the step fits INSIDE the counterbore with 0.15–1 mm all round (rays
 *     across both at several depths and heights, both halves); the step top =
 *     the vase-bottom plane on both pieces; the foot recess floor and centre
 *     sit at the right depths; the halves' bottom face is FLAT where the foot
 *     sits (rays along x through master ∪ base-end wall start at the
 *     counterbore mouth — a plaster bump here would hold the foot off), with a
 *     control that the same rays DO find the disc inside the counterbore; and
 *     the swapped wall's bore clears the disc. Three natches (count 3) are two
 *     at opposite ends of one side and one on the other.
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-halves.ts [mold.json]
 */
import { readFileSync } from 'fs';
import { privateDesign } from '../lib/designs';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { applyPreset } from '@/presets';
import { DEFAULT_MOLD_PARAMETERS, mergeMoldParameters, type MoldParameters } from '@/engine/mold/mold-types';
import { DEFAULT_HANDLE_PARAMETERS, mergeHandleParameters, type HandleParameters } from '@/engine/handle/handle-types';
import { generateSplitHalvesMold, type SplitHalvesMoldMeshes } from '@/engine/mold/split-halves-generator';
import { signedVolume, type P2 } from '@/engine/handle/mesh3';
import { mergeMeshes } from '@/engine/mold/ring-mesh';
import type { VaseMesh, VaseParameters } from '@/engine/types';

let ok = true;
const fail = (msg: string) => { ok = false; console.log(`FAIL  ${msg}`); };
const pass = (msg: string) => console.log(`PASS  ${msg}`);

function closed(mesh: VaseMesh): string | null {
  const map = new Map<string, number>();
  const remap = new Array<number>(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const k = `${mesh.positions[i * 3].toFixed(4)},${mesh.positions[i * 3 + 1].toFixed(4)},${mesh.positions[i * 3 + 2].toFixed(4)}`;
    const seen = map.get(k);
    if (seen === undefined) { map.set(k, i); remap[i] = i; } else remap[i] = seen;
  }
  const edges = new Map<string, number>();
  let degenerate = 0;
  for (let f = 0; f < mesh.triangleCount; f++) {
    const a = remap[mesh.indices[f * 3]], b = remap[mesh.indices[f * 3 + 1]], c = remap[mesh.indices[f * 3 + 2]];
    if (a === b || b === c || a === c) { degenerate++; continue; }
    for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.set(`${p},${q}`, (edges.get(`${p},${q}`) ?? 0) + 1);
  }
  let multi = 0, unmatched = 0;
  for (const [k, n] of edges) {
    if (n !== 1) multi++;
    const [p, q] = k.split(',');
    if (!edges.has(`${q},${p}`)) unmatched++;
  }
  const vol = signedVolume(mesh);
  if (multi === 0 && unmatched === 0 && degenerate === 0 && vol > 0) return null;
  return `tris=${mesh.triangleCount} degen=${degenerate} multi=${multi} unmatched=${unmatched} vol=${vol.toFixed(1)}`;
}

/** Ray grid: triangles binned by their footprint on the plane ⟂ `axis`. */
class Rays {
  private cells = new Map<string, number[]>();
  constructor(private mesh: VaseMesh, private axis: 0 | 1 | 2, private cell = 2) {
    const P = mesh.positions, I = mesh.indices;
    const [i1, i2] = this.others();
    for (let f = 0; f < mesh.triangleCount; f++) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        const v = I[f * 3 + k] * 3;
        a0 = Math.min(a0, P[v + i1]); a1 = Math.max(a1, P[v + i1]);
        b0 = Math.min(b0, P[v + i2]); b1 = Math.max(b1, P[v + i2]);
      }
      for (let x = Math.floor(a0 / cell); x <= Math.floor(a1 / cell); x++) {
        for (let y = Math.floor(b0 / cell); y <= Math.floor(b1 / cell); y++) {
          const key = `${x},${y}`;
          let arr = this.cells.get(key);
          if (!arr) { arr = []; this.cells.set(key, arr); }
          arr.push(f);
        }
      }
    }
  }
  private others(): [number, number] { return this.axis === 0 ? [1, 2] : this.axis === 1 ? [0, 2] : [0, 1]; }
  /** Sorted hit coordinates along the axis at (a, b). */
  hits(a: number, b: number): number[] {
    const P = this.mesh.positions, I = this.mesh.indices;
    const [i1, i2] = this.others(), ax = this.axis;
    const fs = this.cells.get(`${Math.floor(a / this.cell)},${Math.floor(b / this.cell)}`) ?? [];
    const out: number[] = [];
    for (const f of fs) {
      const p = I[f * 3] * 3, q = I[f * 3 + 1] * 3, r = I[f * 3 + 2] * 3;
      const x0 = P[p + i1], y0 = P[p + i2], x1 = P[q + i1], y1 = P[q + i2], x2 = P[r + i1], y2 = P[r + i2];
      const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(d) < 1e-12) continue;
      const w0 = ((y1 - y2) * (a - x2) + (x2 - x1) * (b - y2)) / d;
      const w1 = ((y2 - y0) * (a - x2) + (x0 - x2) * (b - y2)) / d;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      out.push(w0 * P[p + ax] + w1 * P[q + ax] + w2 * P[r + ax]);
    }
    out.sort((x, y) => x - y);
    // Rays through a shared edge hit twice — drop near-duplicates.
    return out.filter((v, i) => i === 0 || v - out[i - 1] > 1e-5);
  }
  /** Inside intervals along the ray. Null if the parity is odd (ray grazed an edge). */
  intervals(a: number, b: number): [number, number][] | null {
    const h = this.hits(a, b);
    if (h.length % 2) return null;
    const out: [number, number][] = [];
    for (let i = 0; i < h.length; i += 2) out.push([h[i], h[i + 1]]);
    return out;
  }
}

/** Overlap length of two interval sets — interference along a ray. */
function overlap(A: [number, number][], B: [number, number][]): number {
  let worst = 0;
  for (const [a0, a1] of A) for (const [b0, b1] of B) worst = Math.max(worst, Math.min(a1, b1) - Math.max(a0, b0));
  return worst;
}

/** Interference between parts, sampled with rays along `axis` over a box. Returns worst overlap, mm. */
function interference(parts: VaseMesh[][], axis: 0 | 1 | 2, a0: number, a1: number, b0: number, b1: number, step: number): { worst: number; at: P2 } {
  const grids = parts.map((solids) => solids.map((s) => new Rays(s, axis)));
  let worst = 0, at: P2 = [0, 0];
  for (let a = a0; a <= a1; a += step) {
    for (let b = b0; b <= b1; b += step) {
      const sets = grids.map((gs) => gs.flatMap((g) => g.intervals(a + 1e-4, b + 2e-4) ?? []));
      for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
        const o = overlap(sets[i], sets[j]);
        if (o > worst) { worst = o; at = [a, b]; }
      }
    }
  }
  return { worst, at };
}

function inPoly(poly: P2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distPoly(poly: P2[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(ax + dx * t - x, ay + dy * t - y));
  }
  return best;
}

/** Interval runs along a ray through several solids, merged. */
const rayCache = new WeakMap<VaseMesh, Rays[]>();
function raysOf(m: VaseMesh, axis: 0 | 1 | 2): Rays {
  let arr = rayCache.get(m);
  if (!arr) { arr = []; rayCache.set(m, arr); }
  return (arr[axis] ??= new Rays(m, axis, 1));
}
function merged(parts: VaseMesh[], axis: 0 | 1 | 2, a: number, b: number): [number, number][] {
  const iv = parts.flatMap((p) => raysOf(p, axis).intervals(a + 1e-4, b + 2e-4) ?? []).sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const [x0, x1] of iv) {
    const last = out[out.length - 1];
    if (last && x0 <= last[1] + 1e-6) last[1] = Math.max(last[1], x1); else out.push([x0, x1]);
  }
  return out;
}

/** First hits along a general ray (Möller–Trumbore, brute force), sorted. */
function rayHits(m: VaseMesh, o: [number, number, number], d: [number, number, number]): number[] {
  const P = m.positions, I = m.indices, out: number[] = [];
  for (let f = 0; f < m.triangleCount; f++) {
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const t0 = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]];
    const u = (t0[0] * p[0] + t0[1] * p[1] + t0[2] * p[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [t0[1] * e1[2] - t0[2] * e1[1], t0[2] * e1[0] - t0[0] * e1[2], t0[0] * e1[1] - t0[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    out.push((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det);
  }
  return out.sort((x, y) => x - y);
}

function checkFoot(label: string, r: SplitHalvesMoldMeshes, mold: MoldParameters) {
  const f = r.debug.foot!;
  const P = f.plugH, clr = mold.halvesFitClearance, seat = mold.halvesSeatDepth;
  const cup = f.cup;
  // The band's end cap, inside the base wall's boss (CAP_RECESS 0.2, Master Wall thick).
  const xCap = r.layout.cavX1 - 0.2 - mold.masterWallThickness / 2;
  // M1 — the band and ring are in the SOLID: rays across u (print y) through
  // the band parts at several x and h. Off the ring the band spans its
  // outline exactly; at the ring's centre it spans the crest (the control:
  // the same probe sees 1.5 mm more there).
  let bad = '', nBand = 0, nRing = 0;
  for (const side of ['L', 'R'] as const) {
    const disc = side === 'L' ? f.discL : f.discR;
    const band = side === 'L' ? f.bandL : f.bandR, crest = side === 'L' ? f.crestL : f.crestR;
    const sgn = side === 'L' ? -1 : 1;   // print y = sgn·u
    // The outline's u extent at height h (both crossings), from the (u, h) arc.
    const span = (q: P2[], h: number): [number, number] | null => {
      const us: number[] = [];
      for (let k = 0; k + 1 < q.length; k++) {
        const [u0, h0] = q[k], [u1, h1] = q[k + 1];
        if ((h0 - h) * (h1 - h) <= 0 && h0 !== h1) us.push(u0 + ((h - h0) / (h1 - h0)) * (u1 - u0));
      }
      return us.length >= 2 ? [Math.min(...us), Math.max(...us)] : null;
    };
    for (const h of [1, 5, 10, 20]) {
      // x = cavX1 − 1 is inside the base wall's boss: the band runs straight in,
      // no filler disc or flange (2026-10-18, per-half walls).
      for (const [x, q, ring] of [[P / 2 + 3.5, band, false], [2.5, band, false], [r.layout.cavX1 - 1, band, false], [P / 2, crest, true]] as const) {
        const want = span(q, h);
        const iv = merged(disc, 1, x, h);
        if (!want || !iv.length) continue;
        const us = iv.flatMap(([a, b]) => [sgn * a, sgn * b]);
        const got: [number, number] = [Math.min(...us), Math.max(...us)];
        const err = Math.max(Math.abs(got[0] - want[0]), Math.abs(got[1] - want[1]));
        if (ring) nRing++; else nBand++;
        if (err > 0.05) bad ||= `${side} x ${x.toFixed(1)} h ${h}: band spans ${got[0].toFixed(2)}…${got[1].toFixed(2)}, ${ring ? 'crest' : 'outline'} ${want[0].toFixed(2)}…${want[1].toFixed(2)}`;
      }
    }
  }
  if (nBand < 8 || nRing < 4) fail(`${label}: band probe blind (${nBand} band, ${nRing} ring)`);
  else if (bad) fail(`${label}: band/ring — ${bad}`);
  else pass(`${label}: band = the bottom outline (${nBand} probes) and the ring crest at its middle (${nRing}), in the solid`);

  // M2 — the plug fits the halves' bore with Fit Clearance all round. Radial
  // rays in WORLD from the vase axis: the plug side = the first cup-wall face
  // (cup coords: plan (X − c0x, −(Y − c0y)), z_cup = −z), the bore = the
  // master band's outer face (half L where u < 0 … mapped through each half's
  // print frame). Through the ring as well. Control: the plug's ridge sits
  // RING_H + clr inside the band's plain outline.
  const toCup = (m: VaseMesh) => m;   // cup meshes are already in cup coords
  const cupWalls = mergeMeshes(cup.walls.flat().map(toCup));
  const sa = Math.sin((mold.seamAngle * Math.PI) / 180), ca = Math.cos((mold.seamAngle * Math.PI) / 180);
  // Cup plan centre = the vase axis at the bottom; the base outline's
  // centroid is close enough to start the rays from inside.
  let ccx = 0, ccy = 0;
  for (const [x, y] of cup.base) { ccx += x; ccy += y; }
  ccx /= cup.base.length; ccy /= cup.base.length;
  let worst = Infinity, worstHi = -Infinity, nFit = 0, ctl = 0, ctlN = 0;
  const bandOf = (side: 'L' | 'R') => mergeMeshes(side === 'L' ? f.discL : f.discR);
  const bandL = bandOf('L'), bandR = bandOf('R');
  for (let k = 0; k < 24; k++) {
    const th = (k + 0.37) * (2 * Math.PI) / 24;
    // Direction in cup plan, and the same in world (cup y = −world dy).
    const dxC = Math.cos(th), dyC = Math.sin(th);
    const dX = dxC, dY = -dyC;
    // World (u, h) direction (frame A: u along the split, h = A's normal).
    const du = dX * ca + dY * sa, dh = -dX * sa + dY * ca;
    // The half this ray crosses: h > 0 is half A (L), h < 0 half B (R; its h is −).
    const side: 'L' | 'R' = dh > 0 ? 'L' : 'R';
    if (Math.abs(dh) < 0.05) continue;   // along the split plane: the seam itself
    for (const zW of [-P * 0.2, -P / 2, -P * 0.8]) {
      const zc = -zW;
      const plug = rayHits(cupWalls, [ccx, ccy, zc], [dxC, dyC, 0]).filter((t) => t > 0);
      if (!plug.length) continue;
      // Half print frame: x = −z, y = −sgn_h·u … for L y = −u, for R y = u; z = |h|.
      const hs = side === 'L' ? 1 : -1;
      const o: [number, number, number] = [-zW, -hs * (ccx * ca + -ccy * sa), hs * (-ccx * sa + -ccy * ca)];
      const d: [number, number, number] = [0, -hs * du, hs * dh];
      const bh = rayHits(side === 'L' ? bandL : bandR, o, d).filter((t) => t > 0);
      if (!bh.length) continue;
      const gap = bh[bh.length - 1] - plug[0];
      nFit++;
      if (Math.abs(zW + P / 2) < 1e-6) {
        // Control at the ring: the band's plain outline sits RING_H further in.
        ctlN++;
        const plain = rayHits(side === 'L' ? bandL : bandR, [-(-P / 2 + 3.5), o[1], o[2]], d).filter((t) => t > 0);
        if (plain.length && Math.abs(bh[bh.length - 1] - plain[plain.length - 1] - 1.5) < 0.1) ctl++;
      }
      worst = Math.min(worst, gap); worstHi = Math.max(worstHi, gap);
    }
  }
  if (nFit < 40) fail(`${label}: plug fit — only ${nFit} probes`);
  else if (ctl < ctlN * 0.9) fail(`${label}: plug fit control — ring crest 1.5 mm proud at only ${ctl}/${ctlN}`);
  else if (worst < clr * 0.9 || worstHi > clr * 1.6 + 0.05) fail(`${label}: plug-to-bore gap ${worst.toFixed(3)}…${worstHi.toFixed(3)} mm, Fit Clearance ${clr}`);
  else pass(`${label}: plug clears the halves' bore by ${worst.toFixed(3)}…${worstHi.toFixed(3)} mm (radial rays, ${nFit} probes incl. the ring; ring crest found 1.5 mm proud at ${ctl}/${ctlN}, control)`);

  // M2b — the plate pocket hugs the band AND the ring's rounded ends: every
  // pocket point along the band lies Fit Clearance (± 0.05) from the master's
  // skirt, measured on a horizontal slice through the skirt. (2026-10-18: the
  // pocket was a box round the ring, open by up to ~1.6 mm at its corners.)
  for (const side of ['L', 'R'] as const) {
    const master = side === 'L' ? r.masterL : r.masterR, pocket = side === 'L' ? r.debug.pocketL : r.debug.pocketR;
    const zc = -seat / 2, segs: [P2, P2][] = [];
    const Pm = master.positions, Im = master.indices;
    for (let t = 0; t < master.triangleCount; t++) {
      const v = [0, 1, 2].map((k) => Im[t * 3 + k] * 3).map((o) => [Pm[o], Pm[o + 1], Pm[o + 2]]);
      const pts: P2[] = [];
      for (let k = 0; k < 3; k++) {
        const A = v[k], B = v[(k + 1) % 3];
        if ((A[2] - zc) * (B[2] - zc) < 0) { const f = (zc - A[2]) / (B[2] - A[2]); pts.push([A[0] + f * (B[0] - A[0]), A[1] + f * (B[1] - A[1])]); }
      }
      if (pts.length === 2 && pts.some(([x]) => x > 0.3 && x < P - 1.3)) segs.push([pts[0], pts[1]]);
    }
    const dSeg = (x: number, y: number) => {
      let best = Infinity;
      for (const [A, B] of segs) {
        const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (y - A[1]) * dy) / l2));
        best = Math.min(best, Math.hypot(A[0] + t * dx - x, A[1] + t * dy - y));
      }
      return best;
    };
    let lo = Infinity, hi = -Infinity, n = 0, nRing = 0;
    for (let i = 0; i < pocket.length; i++) {
      // Walk each pocket edge in 0.05 mm steps along the band (x from 0.5 to P − 1.5).
      const A = pocket[i], B = pocket[(i + 1) % pocket.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      for (let k = 0; k <= Math.ceil(L / 0.05); k++) {
        const f = L ? k / Math.ceil(L / 0.05) : 0, x = A[0] + f * (B[0] - A[0]), y = A[1] + f * (B[1] - A[1]);
        if (x < 0.5 || x > P - 1.5) continue;
        const dd = dSeg(x, y);
        n++; if (Math.abs(x - P / 2) < 2.3) nRing++;
        lo = Math.min(lo, dd); hi = Math.max(hi, dd);
      }
    }
    if (n < 100 || nRing < 20) fail(`${label} ${side}: pocket-vs-band probe blind (${n}, ${nRing} at the ring)`);
    else if (lo < clr - 0.02 || hi > clr + 0.05) fail(`${label} ${side}: plate pocket ${lo.toFixed(3)}…${hi.toFixed(3)} mm from the band/ring, Fit Clearance ${clr}`);
    else pass(`${label} ${side}: plate pocket follows the band and the ring's rounded ends at ${lo.toFixed(3)}…${hi.toFixed(3)} mm (${n} points, ${nRing} at the ring)`);
  }

  // M3 — the band is HOLLOW and open on the cut face: vertical rays up from
  // the bed at the band's centre line find no solid until its shell (well
  // above the bed); control: inside the flange (x = P − 0.5) it is solid
  // from the bed.
  for (const side of ['L', 'R'] as const) {
    const disc = side === 'L' ? f.discL : f.discR;
    const band = side === 'L' ? f.bandL : f.bandR;
    const sgn = side === 'L' ? -1 : 1;
    let mid = 0;
    for (const [u] of band) mid += u;
    mid = sgn * (mid / band.length);
    let open = 0, n = 0, solidCtl = 0;
    for (const x of [1.5, P / 4, P / 2, 3 * P / 4]) {
      for (const dy of [-3, 0, 3]) {
        const iv = merged(disc, 2, x, mid + dy);
        if (!iv.length) continue;
        n++;
        if (iv[0][0] > -seat + 2) open++;
      }
    }
    for (const dy of [-3, 0, 3]) { const iv = merged(disc, 2, xCap, mid + dy); if (iv.length && iv[0][0] < -seat + 0.15) solidCtl++; }
    // The master's floor is open into the band (2026-10-18): along x through
    // the relief + band at the hollow's centre, no solid from x −3 to +3 (the
    // vase bottom is x = 0); control: the same ray finds the flange at x P − 0.5.
    const parts = [side === 'L' ? r.debug.partsL.relief : r.debug.partsR.relief, ...disc];
    let through = 0, nT = 0, flangeCtl = 0;
    for (const dy of [-6, -3, 0, 3, 6]) for (const h of [1, 4, 8]) {
      const iv = merged(parts, 0, mid + dy, h);
      if (!iv.some(([a, b]) => a <= xCap && b >= xCap)) continue;
      flangeCtl++; nT++;
      if (!iv.some(([a, b]) => a < 3 && b > -3)) through++;
    }
    if (nT < 6) fail(`${label} ${side}: open floor — only ${nT} rays met the end cap (control)`);
    else if (through !== nT) fail(`${label} ${side}: master floor closed at ${nT - through}/${nT} rays — the band's hollow is walled off`);
    else pass(`${label} ${side}: master's hollow open into the band (${through}/${nT} rays clear across the vase bottom, end cap found on each, control)`);
    if (n < 8) fail(`${label} ${side}: hollow band — only ${n} probes`);
    else if (open !== n) fail(`${label} ${side}: band closed at ${n - open}/${n} probes — not open on the cut face`);
    else if (solidCtl < 3) fail(`${label} ${side}: hollow band control — the end cap reads open (${solidCtl}/3); probe blind`);
    else pass(`${label} ${side}: band hollow and open on the cut face (${open}/${n}), closed by its end cap in the base wall (control)`);
  }

  // M4 — flat bottom: through master ∪ base-end wall, along x, the first solid
  // beyond the vase is at the halves' bottom face x = P (or the flange's 1 mm
  // recess) — except over the band, which runs on through it (the control).
  const L = r.layout;
  for (const [side, master, wB, y0, y1] of [
    ['L', [r.debug.partsL.relief, ...f.discL], r.baseWallL, L.cavY0, L.cavY1],
    ['R', [r.debug.partsR.relief, ...f.discR], r.baseWallR, -L.cavY1, -L.cavY0],
  ] as const) {
    let flat = 0, inside = 0, ringHit = 0, bump = '';
    for (let y = y0 + 0.7; y < y1 - 0.7; y += 1.9) for (let h = 0.4; h < L.wallH - 0.5; h += 1.9) {
      const iv = merged([...master, wB], 0, y, h).filter(([, b]) => b > 0.05);
      if (!iv.length) continue;
      const start = Math.max(0, iv[0][0]);
      if (Math.abs(start - P) < 0.02) flat++;
      // Inside the hollow band: its end cap, in the base wall's boss.
      else if (Math.abs(start - (r.layout.cavX1 - 0.2 - mold.masterWallThickness)) < 0.02) inside++;
      // The ring: a rounded bump 4 mm wide round the band's middle.
      else if (start >= P / 2 - 2.2 && iv[0][1] <= P / 2 + 2.2) ringHit++;
      // The band runs on into the wall.
      else if (start < P - 1 && iv[0][1] > P - 1 + 0.01) inside++;
      else bump ||= `(y ${y.toFixed(1)}, h ${h.toFixed(1)}) first solid at x ${start.toFixed(3)}`;
    }
    if (bump) fail(`${label} ${side}: halves' bottom face not flat — ${bump}`);
    else if (inside < 10) fail(`${label} ${side}: flat-face control — the rays found the band at only ${inside} points; probe blind`);
    else pass(`${label} ${side}: bottom face flat at x ${P} (${flat} rays, ${ringHit} on the ring), band found running through (${inside}, control)`);
  }
  // M6 — the cup: one part per wall, wall count + same-ness reported.
  const fo = r.foot!;
  console.log(`      plug ${P} mm, cup ${fo.walls.length} walls${fo.wallsSame ? ' (same)' : ''}, disk ${fo.plateStats.sizeX.toFixed(0)} × ${fo.plateStats.sizeY.toFixed(0)} mm, plug plaster ${(fo.plasterVolumeMm3 / 1000).toFixed(0)} cm³${fo.plugNote ? ` — ${fo.plugNote}` : ''}`);
}

/** Vertical rays along the strap, `off` mm to one side of its centreline:
 *  closed runs (ribs) with each run's middle station, and the controls. */
function strapProbe(d: SplitHalvesMoldMeshes['debug']['partsL'], off: number) {
  const gH = new Rays(d.handle!, 2, 1), gS = new Rays(d.handleSolid!, 2, 1);
  let runs = 0, prevClosed = false, solidOpen = 0, skinDiff = 0, n = 0, start = 0;
  const runMids: number[] = [];
  const P = d.strapLine;
  for (let k = 0; k < P.length; k++) {
    const [x0, y0] = P[Math.max(0, k - 1)], [x1, y1] = P[Math.min(P.length - 1, k + 1)];
    const L = Math.hypot(x1 - x0, y1 - y0) || 1;
    const x = P[k][0] - ((y1 - y0) / L) * off, y = P[k][1] + ((x1 - x0) / L) * off;
    const h = gH.hits(x + 1e-4, y + 2e-4), hs = gS.hits(x + 1e-4, y + 2e-4);
    if (!h.length || !hs.length) continue;
    n++;
    const isOpen = h[0] > 0.05;
    if (!isOpen && !prevClosed) { runs++; start = k; }
    if (isOpen && prevClosed) runMids.push(Math.round((start + k - 1) / 2));
    prevClosed = !isOpen;
    if (hs[0] > 0.05) solidOpen++;
    skinDiff = Math.max(skinDiff, Math.abs(h[h.length - 1] - hs[hs.length - 1]));
  }
  if (prevClosed) runMids.push(Math.round((start + P.length - 1) / 2));
  return { runs, runMids, solidOpen, skinDiff, n };
}

function checkKit(label: string, r: SplitHalvesMoldMeshes, mold: MoldParameters, deep: boolean) {
  if (r.error) { fail(`${label}: error ${r.error}`); return; }
  // A — closed solids
  const solids: [string, VaseMesh | null][] = [
    ['relief L', r.debug.partsL.relief], ['relief R', r.debug.partsR.relief],
    ['cap L', r.debug.partsL.cap], ['cap R', r.debug.partsR.cap],
    ['handle L', r.debug.partsL.handle], ['handle R', r.debug.partsR.handle],
    ...r.debug.partsL.plate.map((m, i) => [`plate L part ${i}`, m] as [string, VaseMesh]),
    ...r.debug.partsR.plate.map((m, i) => [`plate R part ${i}`, m] as [string, VaseMesh]),
    ['well wall L', r.wellWallL], ['base wall L', r.baseWallL], ['well wall R', r.wellWallR], ['base wall R', r.baseWallR],
    ...(r.debug.foot ? [
      ...r.debug.foot.discL.map((m, i) => [`disc L part ${i}`, m] as [string, VaseMesh]),
      ...r.debug.foot.discR.map((m, i) => [`disc R part ${i}`, m] as [string, VaseMesh]),
      ...r.debug.foot.cup.disk.map((m, i) => [`plug disk part ${i}`, m] as [string, VaseMesh]),
      ...r.debug.foot.cup.walls.flatMap((ps, w) => ps.map((m, i) => [`plug wall ${w} part ${i}`, m] as [string, VaseMesh])),
    ] : []),
  ];
  let bad = 0;
  for (const [n, m] of solids) {
    if (!m) continue;
    const e = closed(m);
    if (e) { bad++; fail(`${label}: ${n} not closed: ${e}`); }
  }
  if (!bad) pass(`${label}: ${solids.filter(([, m]) => m).length} solids closed + outward`);

  const seat = mold.halvesSeatDepth, clr = mold.halvesFitClearance;
  for (const side of ['L', 'R'] as const) {
    const master = side === 'L' ? r.masterL : r.masterR;
    const plateParts = side === 'L' ? r.debug.partsL.plate : r.debug.partsR.plate;
    const pocket = side === 'L' ? r.debug.pocketL : r.debug.pocketR;
    const island = side === 'L' ? r.debug.islandL : r.debug.islandR;
    // C — skirt vertices inside the pocket by ≥ clearance, outside the island.
    let worstIn = Infinity, outside = 0, onIsland = 0, skirtBottom = 0, nSkirt = 0;
    for (let i = 0; i < master.vertexCount; i++) {
      const x = master.positions[i * 3], y = master.positions[i * 3 + 1], z = master.positions[i * 3 + 2];
      if (z > -0.01) continue;
      nSkirt++;
      if (Math.abs(z + seat) < 1e-3) skirtBottom++;
      if (x < r.layout.cavX0 + 1e-3) continue; // the end face sits on the wall plane
      if (r.foot && x > r.layout.cavX1 - 1e-3) continue; // so does the band's
      // The flange's back face presses on the wall boss's face, by design.
      if (r.foot && Math.abs(x - r.debug.foot!.plugH) < 1e-3) continue;
      if (!inPoly(pocket, x, y)) { outside++; if (process.env.DBG) console.log(`      outside ${side}: ${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}`); continue; }
      worstIn = Math.min(worstIn, distPoly(pocket, x, y));
      if (island && inPoly(island, x, y)) onIsland++;
    }
    if (outside || onIsland) fail(`${label} ${side}: ${outside} skirt vertices outside the pocket, ${onIsland} on the finger island`);
    else if (worstIn < clr - 0.02) fail(`${label} ${side}: pocket clearance ${worstIn.toFixed(3)} < Fit Clearance ${clr}`);
    else pass(`${label} ${side}: ${nSkirt} skirt vertices inside the pocket, min clearance ${worstIn.toFixed(3)} mm${island ? ', clear of the finger island' : ''}`);
    let zMin = Infinity;
    for (let i = 0; i < master.vertexCount; i++) zMin = Math.min(zMin, master.positions[i * 3 + 2]);
    if (zMin < -seat - 1e-3) fail(`${label} ${side}: master reaches below −seat (${zMin.toFixed(3)})`);

    if (!deep) continue;
    // B — no master/plate interference over the master's footprint.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < master.vertexCount; i++) {
      x0 = Math.min(x0, master.positions[i * 3]); x1 = Math.max(x1, master.positions[i * 3]);
      y0 = Math.min(y0, master.positions[i * 3 + 1]); y1 = Math.max(y1, master.positions[i * 3 + 1]);
    }
    const intf = interference([[master], plateParts], 2, x0 - 1, x1 + 1, y0 - 1, y1 + 1, 0.7);
    if (intf.worst > 0.01) fail(`${label} ${side}: master/plate interference ${intf.worst.toFixed(3)} mm at (${intf.at[0].toFixed(1)}, ${intf.at[1].toFixed(1)})`);
    else pass(`${label} ${side}: no master/plate interference (vertical rays, 0.7 mm grid)`);
    // Seating: under the skirt rails the plate's top must be at −seat.
    const plateRays = plateParts.map((p) => new Rays(p, 2));
    let seated = 0, notSeated = 0;
    for (let i = 0; i < master.vertexCount; i += 7) {
      const z = master.positions[i * 3 + 2];
      if (Math.abs(z + seat) > 1e-3) continue;
      const x = master.positions[i * 3], y = master.positions[i * 3 + 1];
      if (x < r.layout.cavX0 + 0.5) continue;
      const tops = plateRays.flatMap((g) => g.intervals(x + 1e-4, y + 2e-4) ?? []).map(([, t]) => t);
      const top = Math.max(-Infinity, ...tops.filter((t) => t < -seat + 0.5));
      if (Math.abs(top + seat) < 0.01) seated++; else notSeated++;
    }
    if (notSeated > seated * 0.02) fail(`${label} ${side}: skirt seated on the pocket floor at ${seated}, NOT at ${notSeated}`);
    else pass(`${label} ${side}: skirt rests on the pocket floor (${seated} probes${notSeated ? `, ${notSeated} edge misses` : ''})`);
  }

  if (!deep) return;
  // D — natches. World (z,u) → print L (−z, −u), R (−z, u).
  const topAt = (parts: VaseMesh[], x: number, y: number) => {
    const ts = parts.flatMap((p) => new Rays(p, 2).intervals(x + 1e-4, y + 2e-4) ?? []).map(([, t]) => t);
    return Math.max(...ts);
  };
  let natchOk = true;
  for (const [z, u] of r.debug.bumpsL) {
    const tl = topAt(r.debug.partsL.plate, -z, -u), tr = topAt(r.debug.partsR.plate, -z, u);
    if (!(tl < -0.3 && tr > 0.3)) { natchOk = false; fail(`${label}: bump L at (${z.toFixed(1)},${u.toFixed(1)}): plate L top ${tl.toFixed(2)}, plate R ${tr.toFixed(2)}`); }
  }
  for (const [z, u] of r.debug.dimplesL) {
    const tl = topAt(r.debug.partsL.plate, -z, -u), tr = topAt(r.debug.partsR.plate, -z, u);
    if (!(tl > 0.3 && tr < -0.3)) { natchOk = false; fail(`${label}: dimple L at (${z.toFixed(1)},${u.toFixed(1)}): plate L top ${tl.toFixed(2)}, plate R ${tr.toFixed(2)}`); }
  }
  if (natchOk) pass(`${label}: natches pair up — every plaster-L bump meets a plaster-R dimple and vice versa`);

  // H — the cap closes the well end.
  for (const [side, master, d] of [['L', r.masterL, r.debug.partsL], ['R', r.masterR, r.debug.partsR]] as const) {
    // The relief + cap only: the foot's well-end collar overlaps them, and
    // overlapping solids in one mesh pair their hits wrongly along a ray.
    void master;
    const g = new Rays(mergeMeshes([d.relief, d.cap]), 0, 1);
    const xCap = r.layout.cavX0 + 0.2 + mold.masterWallThickness / 2;
    const xHollow = r.layout.cavX0 + 0.2 + mold.masterWallThickness + 1.5;
    let y0 = Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const [y, z] of d.capPoly) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); z1 = Math.max(z1, z); }
    let probes = 0, sealed = 0, hollow = 0;
    for (let y = y0 + 0.5; y < y1 - 0.5; y += 1.3) for (let z = -r.layout.seat + 0.5; z < z1 - 0.5; z += 1.3) {
      // Only inside the HOLLOW: in the shell band the shell and the cap overlap,
      // and pairing hits from two overlapping solids in order gives false gaps.
      if (!inPoly(d.capPoly, y, z) || distPoly(d.capPoly, y, z) < mold.masterWallThickness + 0.3) continue;
      const iv = g.intervals(y + 1e-4, z + 2e-4);
      if (!iv) continue;
      probes++;
      if (iv.some(([a, b]) => a <= xCap && b >= xCap)) sealed++;
      if (!iv.some(([a, b]) => a <= xHollow && b >= xHollow)) hollow++;
    }
    if (probes < 20) fail(`${label} ${side}: cap — only ${probes} probes`);
    else if (sealed !== probes) fail(`${label} ${side}: cap leaves ${probes - sealed} of ${probes} probes open`);
    else if (hollow < probes * 0.5) fail(`${label} ${side}: cap probe control — behind the cap is solid at ${probes - hollow}/${probes}; the probe can't tell cap from shell`);
    else pass(`${label} ${side}: cap closes the well end (${sealed}/${probes} probes solid at the cap, ${hollow} hollow behind it)`);
  }

  // I — hollow handle + ribs.
  if (r.debug.partsL.handle && r.debug.partsL.handleSolid) {
    const d = r.debug.partsL;
    if (r.debug.handleShell <= 0) fail(`${label}: handle built solid (section too small?)`);
    const slot = mold.halvesRibSlot >= 0.2 ? mold.halvesRibSlot : 0;
    const centre = strapProbe(d, 0), side = strapProbe(d, slot ? slot / 2 + 1 : 0);
    if (centre.solidOpen) fail(`${label}: channel control — the SOLID sweep reads open at ${centre.solidOpen} stations; the probe is blind`);
    else if (r.debug.handleRibs !== 3) fail(`${label}: ${r.debug.handleRibs} ribs placed, expected 3`);
    else if (side.runs !== 3) fail(`${label}: ${side.runs} closed runs along the strap${slot ? ' 1 mm into the rib halves' : ''}, expected 3 ribs`);
    else if (slot && centre.runs !== 0) fail(`${label}: Rib Slot ${slot} — the centreline is closed in ${centre.runs} places; the slot is not open`);
    else if (Math.max(centre.skinDiff, side.skinDiff) > 1e-3) fail(`${label}: hollow handle's top skin differs from the solid by ${Math.max(centre.skinDiff, side.skinDiff).toFixed(4)} mm`);
    else pass(`${label}: handle hollow (shell ${r.debug.handleShell.toFixed(2)} mm) — ${side.runs} rib runs${slot ? `, centreline open at all ${centre.n} stations (Rib Slot ${slot})` : ' on the centreline'}, skin unchanged`);
  }

  // J — automatic natches.
  {
    const want = r.oneKit ? 4 : Math.round(mold.halvesNatchCount) === 3 ? 3 : 4;
    const N = r.natches;
    let bad = '';
    const L = r.layout;
    for (const [i, n] of N.entries()) {
      const [x, y] = [-n.z, -n.u];
      const edge = Math.min(x - L.cavX0, L.cavX1 - x, y - L.cavY0, L.cavY1 - y);
      const pk = inPoly(r.debug.pocketL, x, y) ? -distPoly(r.debug.pocketL, x, y) : distPoly(r.debug.pocketL, x, y);
      if (edge < n.r + 4 - 0.05) bad ||= `natch ${i} only ${(edge - n.r).toFixed(2)} mm from the block edge`;
      if (pk < n.r + 4 - 0.05) bad ||= `natch ${i} only ${(pk - n.r).toFixed(2)} mm from the pocket`;
      if (n.r > mold.natchDiameter / 2 + 1e-9) bad ||= `natch ${i} r ${n.r} > Natch Diameter / 2`;
      for (const m of N.slice(i + 1)) if (Math.hypot(n.z - m.z, n.u - m.u) < n.r + m.r + 4 - 0.05) bad ||= `natches ${i} and another closer than 4 mm`;
    }
    if (!N.some((n) => n.bump) || !N.some((n) => !n.bump)) bad ||= 'no bump/dimple pair';
    if (N.length !== want) bad ||= `${N.length} natches, expected ${want}`;
    if (r.oneKit && Math.round(mold.halvesNatchCount) === 3 && !r.natchInfo) bad ||= 'count 3 forced to 4 with no note';
    if (bad) fail(`${label}: natches — ${bad}`);
    else pass(`${label}: ${N.length} natches, ${N.map((n) => (2 * n.r).toFixed(1)).join(' / ')} mm, all ≥ 4 mm clear of edge, pocket and each other${r.natchNote ?? r.natchInfo ? ` (note: ${r.natchNote ?? r.natchInfo})` : ''}`);
    // Corner natches sit evenly (Gary, 2026-10-16): the same distance from their
    // end (base end / counterbore mouth, or the well), the block side and the
    // vase. With 3, the lone one opposite the pair is placed differently — skip it.
    const F = r.debug.natchFrame;
    if (F && N.length) {
      const sd = (z: number, u: number, a: P2, b: P2) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((z - a[0]) * dx + (u - a[1]) * dy) / l2));
        return Math.hypot(z - a[0] - t * dx, u - a[1] - t * dy);
      };
      const lone = N.length === 3 ? N.find((n) => N.filter((m) => Math.sign(m.u) === Math.sign(n.u)).length === 1) : undefined;
      let worst = 0, at = '';
      for (const n of N) {
        if (n === lone) continue;
        const lo = n.z < F.hTop / 2;
        let end = lo ? n.z - F.zB0 : F.zB1 - n.z, vase = Infinity;
        // The split is a definition (Gary's "the main part of the cup"): a segment
        // wholly below the rim is cup, anything reaching the rim is well.
        for (let i = 0; i < F.obstacle.length; i++) {
          const a = F.obstacle[i], b = F.obstacle[(i + 1) % F.obstacle.length];
          const d = sd(n.z, n.u, a, b);
          if (!lo && (a[0] >= F.hTop - 1e-6 || b[0] >= F.hTop - 1e-6)) end = Math.min(end, d); else vase = Math.min(vase, d);
        }
        const side = Math.min(n.u - F.uB0, F.uB1 - n.u);
        const ds = [end, side, vase], spread = Math.max(...ds) - Math.min(...ds);
        if (spread > worst) { worst = spread; at = `z ${n.z.toFixed(1)} u ${n.u.toFixed(1)}: end ${end.toFixed(2)} side ${side.toFixed(2)} vase ${vase.toFixed(2)}`; }
      }
      if (worst > 0.3) fail(`${label}: corner natch not even — ${at}`);
      else pass(`${label}: corner natches even within ${worst.toFixed(2)} mm (end / side / vase)`);
    }
  }

  // K — the rib slot.
  if (r.debug.partsL.handle && r.debug.handleRibs && mold.halvesRibSlot >= 0.2) {
    const d = r.debug.partsL, slot = mold.halvesRibSlot;
    const all = new Rays(d.handle!, 2, 1);
    let bad = d.ribs.length === 2 * r.debug.handleRibs ? '' : `${d.ribs.length} rib solids for ${r.debug.handleRibs} ribs (expected 2 each)`;
    const widths: number[] = [];
    for (const k of strapProbe(d, slot / 2 + 1).runMids) {
      const [x, y] = d.strapLine[k], [x0, y0] = d.strapLine[Math.max(0, k - 1)], [x1, y1] = d.strapLine[Math.min(d.strapLine.length - 1, k + 1)];
      const L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
      const isOpen = (o: number) => { const h = all.hits(x + nx * o + 1e-4, y + ny * o + 2e-4); return h.length > 0 && h[0] > 0.05; };
      let a = 0, b = 0;
      if (!isOpen(0)) { bad ||= 'channel closed at the middle of a rib'; continue; }
      while (a > -(slot + 3) && isOpen(a - 0.02)) a -= 0.02;
      while (b < slot + 3 && isOpen(b + 0.02)) b += 0.02;
      if (b - a > slot + 2.5) { bad ||= 'no rib either side of the slot'; continue; }
      widths.push(b - a);
    }
    if (!bad && widths.length !== r.debug.handleRibs) bad = `${widths.length} slots measured for ${r.debug.handleRibs} ribs`;
    if (!bad && widths.some((w) => Math.abs(w - slot) > 0.15)) bad = `slot widths ${widths.map((w) => w.toFixed(2)).join(', ')} mm, wanted ${slot}`;
    if (bad) fail(`${label}: rib slots — ${bad}`);
    else pass(`${label}: ${widths.length} ribs split, slots ${widths.map((w) => w.toFixed(2)).join(' / ')} mm (Rib Slot ${slot}), rib solid both sides`);
  }

  // M — foot piece.
  if (r.foot && r.debug.foot) checkFoot(label, r, mold);

  // J+ — three natches: two at opposite ends of one side, one on the other.
  if (r.natches.length === 3) {
    const sides = r.natches.map((n) => Math.sign(n.u));
    const pairSide = sides.filter((v) => v > 0).length === 2 ? 1 : -1;
    const pair = r.natches.filter((n) => Math.sign(n.u) === pairSide);
    const zMid = (pair[0].z + pair[1].z) / 2;
    if (pair.length !== 2) fail(`${label}: 3 natches not split two and one across the axis`);
    else if (Math.abs(pair[0].z - pair[1].z) < 0.4 * (-r.layout.cavX0 - -r.layout.cavX1)) fail(`${label}: the pair of 3 natches is only ${Math.abs(pair[0].z - pair[1].z).toFixed(0)} mm apart`);
    else pass(`${label}: 3 natches spread — pair ${Math.abs(pair[0].z - pair[1].z).toFixed(0)} mm apart, lone one ${Math.abs(r.natches.find((n) => Math.sign(n.u) !== pairSide)!.z - zMid).toFixed(0)} mm off their middle`);
  }

  // E — walls vs each other, plate, master (vertical rays over the whole plate).
  const L = r.layout;
  for (const [side, wA, wB, master, plate] of [
    ['L', r.wellWallL, r.baseWallL, r.masterL, r.debug.partsL.plate],
    ['R', r.wellWallR, r.baseWallR, r.masterR, r.debug.partsR.plate],
  ] as const) {
    const yr = side === 'L' ? [L.cavY0, L.cavY1] : [-L.cavY1, -L.cavY0];
    const pad = 20;
    const v = interference([[wA], [wB], [master], [...plate]], 2, L.cavX0 - pad, L.cavX1 + pad, yr[0] - pad, yr[1] + pad, 1.0);
    // Wall-on-plate ridges/grooves leave clearance; the walls' flanges sit ON
    // the plate top (touching, overlap 0) — anything over 0.05 is a real clash.
    if (v.worst > 0.05) fail(`${label} ${side}: wall/plate/master interference ${v.worst.toFixed(3)} mm at (${v.at[0].toFixed(1)}, ${v.at[1].toFixed(1)})`);
    else pass(`${label} ${side}: walls, plate and master do not interfere (vertical rays)`);
    // Collar vs master: rays along x through the collar region.
    const c = interference([[wA], [master]], 0, yr[0], yr[1], 0.05, L.wallH, 0.5);
    if (c.worst > 0.01) fail(`${label} ${side}: collar bites the master by ${c.worst.toFixed(3)} mm at (y ${c.at[0].toFixed(1)}, z ${c.at[1].toFixed(1)})`);
    else pass(`${label} ${side}: collar clears the master (rays along x)`);
    // Pour end flat, side wall to side wall (2026-10-18: the collar was a 4 mm
    // band, leaving a plaster step each side that could chip). Along x from the
    // plaster side, the last solid is the boss face at cavX0 + Well Seal —
    // except where the master's own well runs on (the control).
    {
      const d = side === 'L' ? r.debug.partsL : r.debug.partsR;
      const sd = L.cavX0 + mold.halvesWellSeal;
      let flat = 0, well = 0, step = '';
      for (let y = yr[0] + 0.7; y < yr[1] - 0.7; y += 1.9) for (let h = 0.4; h < L.wallH - 0.5; h += 1.9) {
        // Inside the well's end outline (or within its fit gap + a margin) is
        // the well itself, not the plaster face.
        if (inPoly(d.capPoly, y, h) || distPoly(d.capPoly, y, h) < 0.6) { well++; continue; }
        const iv = merged([d.relief, d.cap, wA], 0, y, h);
        if (!iv.some(([a]) => a < L.cavX0)) { step ||= `(y ${y.toFixed(1)}, h ${h.toFixed(1)}) no wall at all`; continue; }
        const top = Math.max(...iv.map(([, b]) => b).filter((b) => b <= sd + 0.5));
        if (Math.abs(top - sd) < 0.02) flat++;
        else step ||= `(y ${y.toFixed(1)}, h ${h.toFixed(1)}) plaster reaches x ${top.toFixed(2)}, boss face ${sd.toFixed(2)}`;
      }
      if (step) fail(`${label} ${side}: pour end not flat — ${step}`);
      else if (well < 10) fail(`${label} ${side}: pour-end control — the well found at only ${well} rays; probe blind`);
      else pass(`${label} ${side}: pour end flat to the side walls (${flat} rays at the boss face, well found at ${well}, control)`);
    }
    if (r.foot) {
      const cb = interference([[wB], [master]], 0, yr[0], yr[1], 0.05, L.wallH, 0.5);
      if (cb.worst > 0.01) fail(`${label} ${side}: base-end wall bites the plug band by ${cb.worst.toFixed(3)} mm at (y ${cb.at[0].toFixed(1)}, z ${cb.at[1].toFixed(1)})`);
      else pass(`${label} ${side}: base-end wall's bore clears the plug band (rays along x)`);
    }
  }
}

// ── Cases ─────────────────────────────────────────────────────────────────────

const mold: MoldParameters = { ...DEFAULT_MOLD_PARAMETERS, moldStyle: 'splitHalves', plasterThickness: 21, wellWidth: 0, wellHeight: 10, wellDraftAngle: 18 };
const vaseOf = (over: Partial<VaseParameters>): VaseParameters => ({ ...DEFAULT_PARAMETERS, ...over, resolution: { vertical: 80, radial: 120 } });

// A real handled mug: the one that was poured and chipped (private design),
// or any mold file given on the command line. Its sections are SKIPPED, not
// passed, when it is absent.
const file = process.argv[2] ?? privateDesign('molds/mug-b.mold.json', 'G, L, J, M: the poured handled mug');
const raw = file ? JSON.parse(readFileSync(file, 'utf8')) : null;
const fileVase = raw ? applyPreset({ parameters: raw.vase }) : vaseOf({});
const fileMold = { ...(raw ? mergeMoldParameters(raw.settings) : mold), moldStyle: 'splitHalves' as const };
const fileHandle = mergeHandleParameters(raw?.handle);

// G — Gary's mug with its handle.
if (raw) {
  const r = generateSplitHalvesMold(fileVase, fileMold, fileHandle);
  if (r.handleError) fail(`file mug: handle error ${r.handleError}`);
  if (!r.handle) fail('file mug: no handle built');
  if (r.oneKit) fail('file mug: one kit reported WITH a handle');
  else pass('file mug: two kits (L/R) with the handle');
  if (r.hasUndercuts) fail('file mug: undercuts reported'); else pass('file mug: no undercuts');
  console.log(`      plate ${r.layout.plateW.toFixed(0)} × ${r.layout.plateD.toFixed(0)} mm, wall ${r.layout.wallH.toFixed(0)} mm tall, master ${(r.masterStats.volumeMm3 / 1000).toFixed(1)} cm³, plate ${(r.plateStats.volumeMm3 / 1000).toFixed(1)} cm³, wall ${(r.wallStats.volumeMm3 / 1000).toFixed(1)} cm³, plaster ${(r.plasterVolumeMm3 / 1000).toFixed(0)} cm³`);
  checkKit('file mug', r, fileMold, true);
  // Control for I/K: Rib Slot 0 gives the old solid ribs, found on the centreline.
  const solidRibs = { ...fileMold, halvesRibSlot: 0 };
  const r0 = generateSplitHalvesMold(fileVase, solidRibs, fileHandle);
  const c0 = strapProbe(r0.debug.partsL, 0);
  if (c0.runs !== 3 || r0.debug.partsL.ribs.length !== 3) fail(`file mug, Rib Slot 0: ${c0.runs} centreline runs, ${r0.debug.partsL.ribs.length} rib solids (expected 3, 3)`);
  else pass('file mug, Rib Slot 0 (control): 3 solid ribs, closed on the centreline');
}

// L — handle-to-rim plaster gap. The poured mug chipped there.
if (raw) {
  const r = generateSplitHalvesMold(fileVase, fileMold, fileHandle);
  const lo = generateSplitHalvesMold(fileVase, { ...fileMold, handleTopDrop: 35 }, fileHandle);
  const g = r.plasterGap ?? NaN, gl = lo.plasterGap ?? NaN;
  if (fileMold.handleTopDrop === 15 && !(g < 10 && r.gapWarning)) fail(`gap: poured mug reads ${g.toFixed(1)} mm with no warning — it chipped`);
  else if (!(gl > g + 5 && !lo.gapWarning)) fail(`gap: lowering the handle 20 mm gives ${gl.toFixed(1)} mm (from ${g.toFixed(1)}), warning ${!!lo.gapWarning}`);
  else pass(`gap: ${g.toFixed(1)} mm at Top Below Rim ${fileMold.handleTopDrop}${r.gapWarning ? ' — warns' : ''}; ${gl.toFixed(1)} mm and no warning at 35`);
}

// J — three natches on the handle mug; three asked of a one-kit vase gives four.
if (raw) {
  const m3 = { ...fileMold, halvesNatchCount: 3 };
  checkKit('file mug, 3 natches', generateSplitHalvesMold(fileVase, m3, fileHandle), m3, true);
  const m3r = { ...mold, halvesNatchCount: 3 };
  checkKit('round, 3 asked', generateSplitHalvesMold(vaseOf({}), m3r, null), m3r, true);
}

// M — the foot piece on Gary's mug (two kits) and a round vase (one kit).
{
  const mf = { ...fileMold, halvesFootPiece: true };
  if (raw) checkKit('file mug + foot', generateSplitHalvesMold(fileVase, mf, fileHandle), mf, true);
  const mr = { ...mold, halvesFootPiece: true };
  const rr = generateSplitHalvesMold(vaseOf({}), mr, null);
  if (!rr.oneKit) fail('round + foot: lost the one kit');
  checkKit('round + foot', rr, mr, true);
  // A mug that LEANS (XY Sway, 20 mm over its height): the well end sits off
  // the base axis, so the swapped walls must still take each half's well and
  // the other half's disc. Leaning both ways across the plate (Gary's worry)
  // and both ways in X/Y so it crosses the split at an angle.
  if (raw) for (const [nm, sx, sy] of [['leans +', 2, 0], ['leans −', -2, 0], ['leans diagonal', 1.4, 1.4]] as const) {
    const lean = applyPreset({ parameters: { ...raw.vase, bezierOffset: {
      enabled: true, scaleX: 10, scaleY: 10,
      pointsX: [[0, 0], [sx / 2, 0.5], [sx, 1]], pointsY: [[0, 0], [sy / 2, 0.5], [sy, 1]],
      pointTypesX: ['fixed', 'handle', 'fixed'], pointTypesY: ['fixed', 'handle', 'fixed'],
    } } });
    const rl = generateSplitHalvesMold(lean, mf, fileHandle);
    // Leaning one way tips the rim over the handle's top: the app refuses that
    // handle (correctly), and the kit is checked without it.
    if (rl.handleError) console.log(`      file mug ${nm}: handle refused — ${rl.handleError}`);
    checkKit(`file mug ${nm} + foot`, rl, mf, true);
  }
  // Much narrower at the top than the bottom (Gary, 2026-10-14): the foot disc
  // is bigger than the well, so it sets the walls' opening at BOTH ends.
  const narrow = applyPreset({ parameters: { ...DEFAULT_PARAMETERS, profilePoints: [[1.4, 0], [1.4, 0.3], [0.5, 1]], profilePointTypes: ['fixed', 'handle', 'fixed'], resolution: { vertical: 80, radial: 120 } } });
  const mn = { ...mold, halvesFootPiece: true, wellWidth: 12 };
  checkKit('narrow top + foot', generateSplitHalvesMold(narrow, mn, null), mn, true);
  const ms = { ...mold, halvesFootPiece: true, footSmoothInner: true, footHeight: 0 };
  checkKit('round + flat foot', generateSplitHalvesMold(vaseOf({}), ms, null), ms, true);
}

// F + A on other vases.
const cases: [string, VaseParameters, HandleParameters | null, boolean][] = [
  ['round, no handle', vaseOf({}), null, true],
  ['tall round + default handle', vaseOf({ height: 150 }), DEFAULT_HANDLE_PARAMETERS, false],
  // A twisted rectangle is still symmetric under a half-turn, so ONE kit is right.
  ['twisted rectangle', vaseOf({ bottomShape: 'Rectangle1', sineTwist: { enabled: true, cycles: 1, maxDegrees: 25 } } as Partial<VaseParameters>), null, true],
  // A teardrop is not — its point is on one side only.
  ['teardrop, split along its axis', vaseOf({ bottomShape: 'Teardrop1' } as Partial<VaseParameters>), null, false],
];
for (const [name, v, h, expectOne] of cases) {
  const m2 = { ...mold, splitHandle: !!h };
  const r = generateSplitHalvesMold(v, m2, h);
  if (r.error) { fail(`${name}: ${r.error}`); continue; }
  if (h && !r.handle) { fail(`${name}: handle not built: ${r.handleError}`); continue; }
  if (r.oneKit !== expectOne) fail(`${name}: oneKit = ${r.oneKit}, expected ${expectOne}`);
  else pass(`${name}: ${r.oneKit ? 'one kit' : 'L/R kits'} as expected`);
  checkKit(name, r, m2, name === 'round, no handle');
}

// Plug walls on a ROUND bottom are one part at ANY Radial count (2026-10-18:
// an odd count, 609 on Gary's mug, compared vertex by vertex read "different";
// the outline test reads the shape). Control: a teardrop's walls differ.
for (const [nm, v, want] of [
  ['round at Radial 121', { ...vaseOf({}), resolution: { vertical: 80, radial: 121 } }, true],
  ['round at Radial 120', vaseOf({}), true],
  ['teardrop', vaseOf({ bottomShape: 'Teardrop1' } as Partial<VaseParameters>), false],
] as const) {
  const r = generateSplitHalvesMold(v as VaseParameters, { ...mold, halvesFootPiece: true }, null);
  if (!r.foot) fail(`plug walls, ${nm}: no plug built ${r.error ?? ''}`);
  else if (r.foot.wallsSame !== want) fail(`plug walls, ${nm}: wallsSame = ${r.foot.wallsSame}, expected ${want}`);
  else pass(`plug walls, ${nm}: ${r.foot.walls.length} walls, ${want ? 'one part' : 'each different'} as expected`);
}

// Negative control: a NEGATIVE fit clearance makes the pocket and the collar
// bore smaller than the master. The interference probes must see it, or their
// passes above mean nothing.
{
  const m2 = { ...mold, halvesFitClearance: -0.3 };
  const r = generateSplitHalvesMold(vaseOf({}), m2, null);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < r.masterL.vertexCount; i++) {
    x0 = Math.min(x0, r.masterL.positions[i * 3]); x1 = Math.max(x1, r.masterL.positions[i * 3]);
    y0 = Math.min(y0, r.masterL.positions[i * 3 + 1]); y1 = Math.max(y1, r.masterL.positions[i * 3 + 1]);
  }
  const pl = interference([[r.masterL], r.debug.partsL.plate], 2, x0 - 1, x1 + 1, y0 - 1, y1 + 1, 0.7);
  const co = interference([[r.wellWallL], [r.masterL]], 0, r.layout.cavY0, r.layout.cavY1, 0.05, r.layout.wallH, 0.5);
  if (pl.worst > 0.2 && co.worst > 0.2) pass(`control: −0.3 clearance IS caught (plate ${pl.worst.toFixed(2)} mm, collar ${co.worst.toFixed(2)} mm)`);
  else fail(`control: −0.3 clearance not caught (plate ${pl.worst.toFixed(2)}, collar ${co.worst.toFixed(2)}) — the probes are blind`);
}

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
