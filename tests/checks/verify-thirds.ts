/**
 * Numeric verification for the Split Thirds mold (moldmaker-split-thirds-plan.md).
 * Solids are probed with RAYS, not vertex positions (a feature can exist in the
 * mesh and not in the solid).
 *  A. every solid closed + outward, on several vases;
 *  B. (master + plate are one print since 2026-10-17) the two WATER CAVITIES
 *     open only at the bed: rays from inside find solid along x, y and up,
 *     and wall all across toward the gap;
 *  C. the HINGE gap open from the bed into the shell with ~2 mm of master over
 *     it; C2 no plate solid across the gap anywhere end to end (2026-10-18:
 *     slits and end roofs removed; control 0.3 mm outside the gap);
 *  N. end lips clip-thin past the end legs (control: legs reach the bed);
 *     N2 the hollow plug band opens into the master (control: its end cap);
 *  D. natches: a dome on face A and a pocket on face B at the same (z, ρ),
 *     measured by rays square to each face;
 *  E. no interference between master, plate, well wall and base wall, by rays
 *     along all three axes — including over the V's apex at both ends, where the
 *     flange grooves and plate ridges bend (the fold must not misalign them);
 *     and each ridge really sits IN its groove there (ray finds the gap above it);
 *  F. one kit vs three: round → one; twisted rectangle and teardrop → three;
 *  G2. twisted rods: folds the helix hides from a normal test are flagged;
 *  G. the headline: deep flutes (~34° sides) LOCK Split Halves, release from
 *     Split Thirds with seams on the ridges, and lock it with seams in the grooves;
 *  H. the well-end cap closes the hollow (rays along x);
 *  I. plaster volume: the per-piece numbers sum to an independent whole-mold figure;
 *  M. plaster plug (2026-10-17): cup solids closed; the plug Fit Clearance
 *     inside the pieces' bore all round, through the ring too (control: the
 *     ring is in both solids); the disk slides in and sits on the ledge; cup
 *     parts clear, flange ridges reach the grooves; pieces' bottom face flat
 *     (controls: band + ring found); natches clear and even; plaster vs an
 *     independent figure; per-kit base walls; −0.3 control;
 *  J. negative control: Fit Clearance −0.3 IS caught by B and E.
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-thirds.ts
 */
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { DEFAULT_MOLD_PARAMETERS, type MoldParameters } from '@/engine/mold/mold-types';
import { generateSplitThirdsMold, type SplitThirdsMoldMeshes } from '@/engine/mold/split-thirds-generator';
import { generateSplitHalvesMold } from '@/engine/mold/split-halves-generator';
import { signedVolume, type P2 } from '@/engine/handle/mesh3';
import { computeNormals } from '@/engine/normals';
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
      for (let x = Math.floor(a0 / cell); x <= Math.floor(a1 / cell); x++) for (let y = Math.floor(b0 / cell); y <= Math.floor(b1 / cell); y++) {
        const key = `${x},${y}`;
        let arr = this.cells.get(key);
        if (!arr) { arr = []; this.cells.set(key, arr); }
        arr.push(f);
      }
    }
  }
  private others(): [number, number] { return this.axis === 0 ? [1, 2] : this.axis === 1 ? [0, 2] : [0, 1]; }
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
    return out.filter((v, i) => i === 0 || v - out[i - 1] > 1e-5);
  }
  intervals(a: number, b: number): [number, number][] | null {
    const h = this.hits(a, b);
    if (h.length % 2) return null;
    const out: [number, number][] = [];
    for (let i = 0; i < h.length; i += 2) out.push([h[i], h[i + 1]]);
    return out;
  }
}
const cache = new WeakMap<VaseMesh, Rays[]>();
const raysOf = (m: VaseMesh, axis: 0 | 1 | 2): Rays => {
  let arr = cache.get(m);
  if (!arr) { arr = []; cache.set(m, arr); }
  return (arr[axis] ??= new Rays(m, axis, 1));
};
function overlap(A: [number, number][], B: [number, number][]): number {
  let worst = 0;
  for (const [a0, a1] of A) for (const [b0, b1] of B) worst = Math.max(worst, Math.min(a1, b1) - Math.max(a0, b0));
  return worst;
}
/** Worst overlap between groups of solids along `axis` over a grid. */
function interference(groups: VaseMesh[][], axis: 0 | 1 | 2, a0: number, a1: number, b0: number, b1: number, step: number): { worst: number; at: P2; pair: string } {
  let worst = 0, at: P2 = [0, 0], pair = '';
  for (let a = a0; a <= a1; a += step) for (let b = b0; b <= b1; b += step) {
    const sets = groups.map((g) => g.flatMap((m) => raysOf(m, axis).intervals(a + 1.3e-4, b + 2.1e-4) ?? []));
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
      const o = overlap(sets[i], sets[j]);
      if (o > worst) { worst = o; at = [a, b]; pair = `${i}/${j}`; }
    }
  }
  return { worst, at, pair };
}
function bounds(m: VaseMesh) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.positions[i + k]); hi[k] = Math.max(hi[k], m.positions[i + k]); }
  return { lo, hi };
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
/** Shortest distance from native (z, s, t) to the master's outer surface, the
 *  quads between consecutive outer arcs (each split in two triangles). */
function distToOuter(outer: [number, number, number][][], z: number, s: number, t: number): number {
  const P = [z, s, t];
  const sub3 = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const triDist = (A: number[], B: number[], C: number[]) => {
    // Ericson, closest point on triangle.
    const ab = sub3(B, A), ac = sub3(C, A), ap = sub3(P, A);
    const d1 = dot3(ab, ap), d2 = dot3(ac, ap);
    let q: number[];
    if (d1 <= 0 && d2 <= 0) q = A;
    else {
      const bp = sub3(P, B), d3 = dot3(ab, bp), d4 = dot3(ac, bp);
      const cp = sub3(P, C), d5 = dot3(ab, cp), d6 = dot3(ac, cp);
      const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
      if (d3 >= 0 && d4 <= d3) q = B;
      else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q = [A[0] + v * ab[0], A[1] + v * ab[1], A[2] + v * ab[2]]; }
      else if (d6 >= 0 && d5 <= d6) q = C;
      else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q = [A[0] + w * ac[0], A[1] + w * ac[1], A[2] + w * ac[2]]; }
      else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); q = [B[0] + w * (C[0] - B[0]), B[1] + w * (C[1] - B[1]), B[2] + w * (C[2] - B[2])]; }
      else { const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; q = [A[0] + ab[0] * v + ac[0] * w, A[1] + ab[1] * v + ac[1] * w, A[2] + ab[2] * v + ac[2] * w]; }
    }
    return Math.hypot(P[0] - q[0], P[1] - q[1], P[2] - q[2]);
  };
  let best = Infinity;
  for (let i = 0; i + 1 < outer.length; i++) {
    if (Math.abs(outer[i][0][0] - z) > 8) continue;
    for (let j = 0; j + 1 < outer[i].length; j++) {
      const a = outer[i][j], b = outer[i][j + 1], c = outer[i + 1][j + 1], d = outer[i + 1][j];
      if (Math.abs(a[1] - s) > 10) continue;
      best = Math.min(best, triDist(a, b, c), triDist(a, c, d));
    }
  }
  return best;
}

/** Rotate a mesh about the X axis by `ang` (radians) — a proper rotation. */
function rotX(m: VaseMesh, ang: number): VaseMesh {
  const c = Math.cos(ang), s = Math.sin(ang);
  const positions = new Float32Array(m.positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const y = m.positions[i + 1], z = m.positions[i + 2];
    positions[i] = m.positions[i]; positions[i + 1] = c * y - s * z; positions[i + 2] = s * y + c * z;
  }
  const out = { ...m, positions, normals: new Float32Array(m.normals.length) };
  computeNormals(out.positions, out.indices, out.normals);
  return out;
}

const mold: MoldParameters = { ...DEFAULT_MOLD_PARAMETERS, moldStyle: 'splitThirds' as MoldParameters['moldStyle'], plasterThickness: 21, wellWidth: 0, wellHeight: 10, wellDraftAngle: 18 };
const vaseOf = (over: Partial<VaseParameters>): VaseParameters => ({ ...DEFAULT_PARAMETERS, ...over, resolution: { vertical: 80, radial: 120 } });
const flutes = (depth: number, count = 12): Partial<VaseParameters> => ({ textures: { ...DEFAULT_PARAMETERS.textures, enabled: true, fluting: { enabled: true, count, depth, duty: 0 } } } as Partial<VaseParameters>);

/** A..E, H on one result. */
function checkKit(name: string, r: SplitThirdsMoldMeshes, m: MoldParameters, deep: boolean) {
  if (r.error) { fail(`${name}: ${r.error}`); return; }
  const a = r.debug.alpha, sa = Math.sin(a), ca = Math.cos(a);
  // A — closed solids.
  let bad = 0;
  r.debug.parts.forEach((p, k) => {
    const all: [string, VaseMesh][] = [['relief', p.relief], ['cap', p.cap], ...p.disc.map((x, i) => [`disc#${i}`, x] as [string, VaseMesh]), ...p.cavWalls.map((x, i) => [`cavWall#${i}`, x] as [string, VaseMesh]), ...p.plate.map((x, i) => [`plate#${i}`, x] as [string, VaseMesh]), ...p.wellWall.map((x, i) => [`wellWall#${i}`, x] as [string, VaseMesh]), ...p.baseWall.map((x, i) => [`baseWall#${i}`, x] as [string, VaseMesh])];
    for (const [nm, mesh] of all) { const e = closed(mesh); if (e) { bad++; fail(`${name} kit ${k}: ${nm} not closed: ${e}`); } }
  });
  if (!bad) pass(`${name}: every solid closed + outward (${r.kits.length} kit${r.kits.length > 1 ? 's' : ''})`);

  r.kits.forEach((kit, k) => {
    const P = r.debug.parts[k];
    const tag = `${name} kit ${k}`;
    const all = [P.relief, P.cap, ...P.disc, ...P.cavWalls, ...P.plate];
    const D = r.debug, g = D.gap, cot = ca / sa;
    const Vt = (y: number) => Math.abs(y) * cot;
    const ivs = (axis: 0 | 1 | 2, u: number, v: number) => all.flatMap((x) => raysOf(x, axis).intervals(u + 1.3e-4, v + 2.1e-4) ?? []);
    const inSolid = (iv: [number, number][], w: number) => iv.some(([p, q]) => p <= w && w <= q);
    // B — the WATER CAVITIES (one print with the plate, 2026-10-17): each one is
    // open straight down to the bed and closed every other way. From points
    // inside it: a vertical ray finds nothing from the bed up to the master's
    // ceiling; rays along X and Y find solid on both sides; and toward the gap
    // there is wall all the way across [g, g + CAV_WALL].
    let cavPts = 0, cavBad = 0, cavWhy = '';
    for (const cav of D.cavities[k]) {
      const zs = cav.map((q) => q[0]), ssA = cav.map((q) => q[1]);
      const z0 = Math.min(...zs), z1 = Math.max(...zs);
      const sgn = Math.sign(ssA.reduce((x, y) => x + y, 0));
      for (let z = z0 + 2; z < z1 - 2; z += (z1 - z0) / 9) {
        // the cavity's s range at this z: from its wall edge to the skirt line
        // (cav = wall edge at z0, at z1, then the skirt line back from z1 to z0)
        const sIn = Math.min(...ssA.map(Math.abs));
        const skirt = cav.slice(2).reverse();
        let sOut = Math.abs(skirt[0][1]);
        for (let i = 0; i + 1 < skirt.length; i++) {
          const [za, sa2] = skirt[i], [zb, sb2] = skirt[i + 1];
          if (za <= z && z <= zb) { sOut = Math.min(Math.abs(sa2), Math.abs(sb2)); break; }
        }
        for (const f of [0.25, 0.6]) {
          const Y = sgn * (sIn + (sOut - sIn) * f), X = -z;
          const vz = ivs(2, X, Y);
          const ceil = vz.length ? Math.min(...vz.map((q) => q[0])) : Infinity;
          cavPts++;
          // The ceiling is the master: its hollow, or (where a narrow vase made
          // the cavity reach under the master's edge) its bed, `seat` under the face.
          if (!(ceil > Vt(Y) - D.seat - 0.05) || !Number.isFinite(ceil)) { cavBad++; cavWhy = `z ${z.toFixed(1)} s ${Y.toFixed(1)}: column blocked at t ${ceil.toFixed(2)}`; continue; }
          for (const tq of [D.tBed + 0.5, (D.tBed + ceil) / 2, ceil - 0.3]) {
            const vy = ivs(1, X, tq), vx = ivs(0, Y, tq);
            const sideY = vy.some(([, q]) => q < Y) && vy.some(([p]) => p > Y) && !inSolid(vy, Y);
            const sideX = vx.some(([, q]) => q < X) && vx.some(([p]) => p > X);
            // Toward the gap: solid somewhere between the probe and the gap's
            // edge (the cavity wall low down; up near a non-round ceiling it can
            // be the master's own shell instead).
            const lo2 = Math.min(sgn * g, Y), hi2 = Math.max(sgn * g, Y);
            const wall = vy.some(([p, q]) => q > lo2 && p < hi2);
            if (!sideY || !sideX || !wall) { cavBad++; cavWhy = `z ${z.toFixed(1)} s ${Y.toFixed(1)} t ${tq.toFixed(1)}: ${!sideY ? 'open across' : !sideX ? 'open along' : 'no wall to the gap'}`; }
          }
        }
      }
    }
    if (cavBad || cavPts < 20) fail(`${tag}: water cavities: ${cavBad} leaks of ${cavPts} probes (${cavWhy})`);
    else pass(`${tag}: both water cavities open only at the bed — ${cavPts} probes, walled to the gap`);
    // C — the HINGE and the SLITS. Straight up the middle (s = 0) under the
    // master: empty from the bed past the hollow's ceiling, then HINGE_SKIN of
    // shell. Up each slit: empty from the bed to SLIT_SKIN (or more) under the
    // face. CONTROL: 1 mm beside a slit is solid from the bed.
    const outerK = r.debug.outer[k];
    const cz = D.cavities[k][0].map((q) => q[0]);
    const zA = Math.min(...cz) + 3, zB = Math.max(...cz) - 3;
    let hMin = Infinity, hMax = -Infinity, hBlocked = 0, nH = 0;
    for (let z = zA; z <= zB; z += (zB - zA) / 12) {
      const vz = ivs(2, -z, 0);
      if (!vz.length) { hBlocked++; continue; }
      const lo = Math.min(...vz.map((q) => q[0]));
      const top = vz.find((q) => q[0] === lo)!;
      nH++;
      if (lo < 1) { hBlocked++; continue; }
      // Under the hollow plug band the outer face is the band's (2026-10-18).
      const skin = Math.min(distToOuter(outerK, z, 0, top[0]), r.debug.band[k].length ? distToOuter(r.debug.band[k], z, 0, top[0]) : Infinity);
      // Where the master's own wall is thinner than 2 mm (a radial shell on a
      // non-round section), the slot is a token 0.05 and the skin is that wall:
      // judge against the wall measured at the nearest hollow arc's crown.
      let wallHere = Infinity, dz = Infinity;
      for (const arc of r.debug.inner[k]) {
        let best: number[] | null = null;
        for (let j = 0; j + 1 < arc.length; j++) if ((arc[j][1] + 0) * (arc[j + 1][1] + 0) <= 0) { const f = arc[j][1] / (arc[j][1] - arc[j + 1][1]); best = [arc[j][0] + (arc[j + 1][0] - arc[j][0]) * f, 0, arc[j][2] + (arc[j + 1][2] - arc[j][2]) * f]; }
        if (best && Math.abs(best[0] - z) < dz) { dz = Math.abs(best[0] - z); wallHere = Math.min(distToOuter(outerK, best[0], 0, best[2]), r.debug.band[k].length ? distToOuter(r.debug.band[k], best[0], 0, best[2]) : Infinity); }
      }
      const rel = Math.min(skin - Math.min(2, wallHere - 0.15), skin);
      hMin = Math.min(hMin, skin < 1.9 && rel >= -0.1 ? 1.9 : skin); hMax = Math.max(hMax, skin);
    }
    if (!D.hinge) fail(`${tag}: no hinge slot`);
    else if (hBlocked || hMin < 1.9 || hMax > 3.0) fail(`${tag}: hinge: ${hBlocked} blocked of ${nH}, skin ${hMin.toFixed(2)}–${hMax.toFixed(2)} mm (want ~2)`);
    else pass(`${tag}: hinge gap open from the bed up into the shell, ${hMin.toFixed(2)}–${hMax.toFixed(2)} mm of master left over it, square to the surface (${nH} rays)`);
    // C2 (2026-10-18) — NOTHING of the plate crosses the gap, end to end: the
    // halves swing about the master's crown skin, so a bridge low in the V
    // (the old end roofs, the ridges) would be a strut holding it shut. Rays
    // up s = 0 meet no plate solid anywhere; CONTROL: 0.3 mm outside the gap
    // they do.
    {
      let xMax = -Infinity, xMin = Infinity;
      for (const x of P.plate) for (let i = 0; i < x.positions.length; i += 3) { xMax = Math.max(xMax, x.positions[i]); xMin = Math.min(xMin, x.positions[i]); }
      let n0 = 0, hit0 = 0, ctl0 = 0, why0 = '';
      for (let X = xMin + 0.3; X < xMax - 0.3; X += 0.5) {
        n0++;
        const iv = P.plate.flatMap((x) => raysOf(x, 2).intervals(X + 1.3e-4, 2.1e-4) ?? []);
        if (iv.length) { hit0++; why0 = `z ${(-X).toFixed(1)}: t ${iv.map(([a, b]) => `${a.toFixed(2)}…${b.toFixed(2)}`).join(' ')}`; }
        const c = P.plate.flatMap((x) => raysOf(x, 2).intervals(X + 1.3e-4, D.gap + 0.3 + 2.1e-4) ?? []);
        if (c.length) ctl0++;
      }
      if (hit0 || ctl0 < n0 - 2) fail(`${tag}: plate across the gap at ${hit0} of ${n0} stations (${why0}); control ${ctl0}/${n0}`);
      else pass(`${tag}: no plate across the hinge gap anywhere (${n0} rays up s = 0, end to end); control: plate 0.3 mm outside it ${ctl0}/${n0}`);
    }
    // N (2026-10-18) — the END LIPS: past each end leg the plate is only the
    // clip lip (its underside Plate Floor + Seat under the face, like the side
    // flange), so a binder clip reaches round it. CONTROL: inside the leg the
    // strip runs down to the bed.
    {
      let xMax = -Infinity, xMin = Infinity;
      for (const x of P.plate) for (let i = 0; i < x.positions.length; i += 3) { xMax = Math.max(xMax, x.positions[i]); xMin = Math.min(xMin, x.positions[i]); }
      const zP0 = -xMax, zP1 = -xMin, [zLa, zLb] = D.zLeg;
      const floorV = m.thirdsPlateFloor / sa, lipBot = (Y: number) => Vt(Y) - D.seat - floorV;
      let nL = 0, badL = 0, ctlL = 0, nC = 0, whyL = '';
      for (const Y of [-30, -18, -9, -4, 4, 9, 18, 30]) {
        for (const z of [zP0 + 1, (zP0 + zLa) / 2, zLa - 0.5, zLb + 0.5, (zLb + zP1) / 2, zP1 - 1]) {
          const vz = ivs(2, -z, Y);
          if (!vz.length) continue;
          nL++;
          const lo = Math.min(...vz.map((q) => q[0]));
          if (Math.abs(lo - lipBot(Y)) > 0.05) { badL++; whyL = `z ${z.toFixed(1)} Y ${Y}: underside ${lo.toFixed(2)}, want ${lipBot(Y).toFixed(2)}`; }
        }
        for (const z of [zLa + 1.5, zLb - 1.5]) {
          const vz = ivs(2, -z, Y);
          nC++;
          if (vz.length && Math.abs(Math.min(...vz.map((q) => q[0])) - D.tBed) < 0.01) ctlL++;
        }
      }
      if (nL < 20 || badL || ctlL !== nC) fail(`${tag}: end lips: ${badL} wrong of ${nL} (${whyL}); legs reach the bed ${ctlL}/${nC}`);
      else pass(`${tag}: end lips clip-thin past both end legs (${nL} rays); control: the legs reach the bed (${ctlL}/${nC})`);
    }
    // N2 — with the plug the HOLLOW BAND opens into the master's hollow: a ray
    // along z through the cavities, 1 mm under the face, meets nothing from the band's
    // half cap to well up the vase; CONTROL: it does meet that cap.
    if (D.band[k].length) {
      const zLo = D.zB0 - D.sealDepth, shell = m.masterWallThickness;
      let thru = 0, capped = 0, nT = 0;
      // Two depths: 1 mm under the face inside the hollow (where the hollow is
      // wider than the cavity wall), and under the master's bed through the
      // cavity's hole in the plate (always).
      const a0 = D.inner[k][0], probes: P2[] = [];
      for (const sg of [-1, 1]) {
        const endS = Math.abs((sg > 0 ? a0[a0.length - 1] : a0[0])[1]);
        if (endS >= 4.3) { const Y = sg * (3.3 + endS - 0.5) / 2; probes.push([Y, Vt(Y) - 1]); }
        probes.push([sg * 3.2, Vt(3.2) - D.seat - 0.5]);
      }
      for (const [Y, Z] of probes) {
        const vx = ivs(0, Y, Z);
        nT++;
        if (!vx.some(([x0, x1]) => x1 > -10 && x0 < -(zLo + shell + 0.5))) thru++;
        if (vx.some(([x0, x1]) => x0 <= -(zLo + shell) + 0.05 && x1 >= -(zLo + shell) - 0.05)) capped++;
      }
      if (thru !== nT || capped !== nT) fail(`${tag}: band hollow: open into the master ${thru}/${nT}, capped at its end ${capped}/${nT}`);
      else pass(`${tag}: plug band hollow, open into the master's hollow (${nT} rays, z ${(zLo + shell + 0.5).toFixed(1)} → 10 clear); control: its end cap found`);
    }
    // H — the cap: along X across the well end, master solid at the cap.
    const Xc = -(r.debug.zEnd - 0.2 - m.masterWallThickness / 2);
    const capHit = raysOf(P.cap, 1).intervals(Xc + 1.3e-4, 5 + 2.1e-4);
    if (!capHit || !capHit.length) fail(`${tag}: no cap across the well end`);
    else pass(`${tag}: cap closes the well end`);

    if (!deep) return;
    // E — all four parts, rays along all three axes over the whole assembly.
    const groups = [[P.relief, P.cap, ...P.disc, ...P.cavWalls, ...P.plate], P.wellWall, P.baseWall];
    const ab = bounds(kit.plate);
    const ez = interference(groups, 2, ab.lo[0], ab.hi[0], ab.lo[1], ab.hi[1], 0.9);
    const ex = interference(groups, 0, ab.lo[1], ab.hi[1], ab.lo[2], r.layout.H + 3, 0.9);
    const ey = interference(groups, 1, ab.lo[0], ab.hi[0], ab.lo[2], r.layout.H + 3, 0.9);
    const w = Math.max(ez.worst, ex.worst, ey.worst);
    if (w > 0.01) fail(`${tag}: part and walls interfere ${w.toFixed(3)} mm (z ${ez.worst.toFixed(3)} @${ez.at.map((v) => v.toFixed(1))} ${ez.pair}, x ${ex.worst.toFixed(3)} @${ex.at.map((v) => v.toFixed(1))} ${ex.pair}, y ${ey.worst.toFixed(3)} @${ey.at.map((v) => v.toFixed(1))} ${ey.pair})`);
    else pass(`${tag}: the master + plate part and both walls clear each other on all three axes (worst ${w.toFixed(3)} mm)`);
    // E (apex) — dense rays over the V's apex at both ends, where the flange
    // bends and the ridges stop at the gap: no interference, and a ridge
    // sitting in each groove just outside the gap (Yp).
    for (const [lbl, X0, X1] of [['well end', ab.lo[0], ab.lo[0] + 18], ['base end', ab.hi[0] - 18, ab.hi[0]]] as const) {
      const ap = interference([P.plate, lbl === 'well end' ? P.wellWall : P.baseWall], 2, X0, X1, -4, 4, 0.15);
      if (ap.worst > 0.01) fail(`${tag}: ${lbl} apex: plate and wall interfere ${ap.worst.toFixed(3)} mm at (${ap.at.map((v) => v.toFixed(2))})`);
      else pass(`${tag}: ${lbl} apex: ridges and grooves clear over the bend (worst ${ap.worst.toFixed(3)} mm)`);
      // Engagement, the positive half: along the apex just outside the gap, the
      // plate must rise into a ridge at each band and the wall must sit in a
      // groove above it, 0.1–0.5 mm clear. A misfolded groove would read as a
      // wall flat on the face (clear ≈ ridge height) or no ridge at all.
      const wall = lbl === 'well end' ? P.wellWall : P.baseWall;
      let peaks = 0, worstGap = 0;
      const Yp = 2.5;
      let prevTop = 0;
      const tops: { X: number; top: number; gap: number }[] = [];
      for (let X = X0; X <= X1; X += 0.05) {
        const pt = Math.max(-99, ...P.plate.flatMap((x) => raysOf(x, 2).intervals(X + 1.3e-4, Yp + 2.1e-4) ?? []).map((iv) => iv[1]));
        const wl = wall.flatMap((x) => raysOf(x, 2).intervals(X + 1.3e-4, Yp + 2.1e-4) ?? []);
        const wLo = wl.length ? Math.min(...wl.map((iv) => iv[0])) : NaN;
        tops.push({ X, top: pt, gap: wLo - pt });
      }
      for (let i = 1; i + 1 < tops.length; i++) {
        const q = tops[i];
        if (q.top > Vt(Yp) + 0.8 && q.top >= tops[i - 1].top && q.top >= tops[i + 1].top && q.top > prevTop - 1) {
          if (!Number.isNaN(q.gap)) { peaks++; worstGap = Math.max(worstGap, q.gap); }
          prevTop = q.top;
          i += 20;
        }
      }
      if (peaks !== 3 || worstGap > 0.5) fail(`${tag}: ${lbl} apex: ${peaks} ridges under the wall (want 3), widest gap above a crest ${worstGap.toFixed(2)} mm`);
      else pass(`${tag}: ${lbl} apex: 3 ridges each seated in a groove (gap above crest ≤ ${worstGap.toFixed(2)} mm)`);
    }
    // D — natches, rays square to each face (rotate the plate so the face is level).
    const pl = P.plate;
    for (const q of r.natches) {
      for (const sgn of [1, -1]) {
        // Face A (s > 0) rises at (90° − α); rotate it down to level.
        const ang = sgn * -(Math.PI / 2 - a);
        const parts = pl.map((x) => rotX(x, ang));
        // Natch centre on the face, then rotated: (Y, Z) = ρ(sgn sa, ca) → (ρ sgn, 0)-ish.
        const Y = sgn * q.rho * sa, Zf = q.rho * ca;
        const yr = Math.cos(ang) * Y - Math.sin(ang) * Zf, zr = Math.sin(ang) * Y + Math.cos(ang) * Zf;
        const top = Math.max(...parts.flatMap((x) => raysOf(x, 2).intervals(-q.z + 1.3e-4, yr + 2.1e-4) ?? []).map((iv) => iv[1]));
        const rel = top - zr;
        const want = sgn > 0 ? 1 : -1;
        if (Math.sign(rel) !== want || Math.abs(rel) < 0.4) fail(`${tag}: natch at z ${q.z.toFixed(1)} ρ ${q.rho.toFixed(1)} face ${sgn > 0 ? 'A' : 'B'}: plate top ${rel.toFixed(2)} mm from the face — expected a ${sgn > 0 ? 'dome' : 'pocket'}`);
        else pass(`${tag}: natch z ${q.z.toFixed(1)} ρ ${q.rho.toFixed(1)} r ${q.r.toFixed(1)}: face ${sgn > 0 ? 'A dome +' : 'B pocket '}${rel.toFixed(2)} mm`);
      }
    }
  });
}

// ── A–E, H on the plain vase. ──
const round = generateSplitThirdsMold(vaseOf({}), mold);
checkKit('round', round, mold, true);
if (round.oneKit) pass('round: one kit'); else fail('round: expected one kit');
console.log(`      round: ${round.natches.length} natches/seam; plaster ${(round.plasterVolumeMm3 / 1000).toFixed(0)} cm³ for 3 pieces; plate ${round.layout.plateL.toFixed(0)} × ${round.layout.plateW.toFixed(0)} × ${round.layout.plateH.toFixed(0)} mm`);

// ── F — kits. ──
for (const [nm, v, one] of [
  ['twisted rectangle', vaseOf({ bottomShape: 'Rectangle1', sineTwist: { enabled: true, cycles: 1, maxDegrees: 25 } } as Partial<VaseParameters>), false],
  ['teardrop', vaseOf({ bottomShape: 'Teardrop1' } as Partial<VaseParameters>), false],
  ['12 flutes', vaseOf(flutes(2)), true],
] as const) {
  const r = generateSplitThirdsMold(v, mold);
  if (r.error) { fail(`${nm}: ${r.error}`); continue; }
  if (r.oneKit !== one) fail(`${nm}: oneKit = ${r.oneKit}, expected ${one}`);
  else pass(`${nm}: ${r.oneKit ? 'one kit' : `${r.kits.length} kits`} as expected`);
  checkKit(nm, r, mold, nm === 'twisted rectangle');
}

// ── G — the headline. 12 flutes 5 mm deep on a 60 mm vase: ~45° sides. ──
{
  const v = vaseOf(flutes(5));
  const halves = generateSplitHalvesMold(v, { ...mold, moldStyle: 'splitHalves', seamAngle: 0 }, null);
  const onRidge = generateSplitThirdsMold(v, { ...mold, seamAngle: 0 });
  const inGroove = generateSplitThirdsMold(v, { ...mold, seamAngle: 15 });
  const msg = `halves ${halves.hasUndercuts ? 'locks' : 'releases'}, thirds on ridges ${onRidge.hasUndercuts ? 'locks' : 'releases'}, thirds in grooves ${inGroove.hasUndercuts ? 'locks' : 'releases'}`;
  if (halves.hasUndercuts && !onRidge.hasUndercuts && inGroove.hasUndercuts) pass(`deep flutes: ${msg}`);
  else fail(`deep flutes: ${msg} — expected locks / releases / locks`);
}

// ── G2 — twisted rods (Gary's ribbed tumbler, 2026-10-16): the helix hid a 15°
// plan lean from the 3-D normal test, so 0.26 mm folds at the seams painted
// nothing. The plan fold test must catch them; twist alone on a plain round
// vase must still release (the control). ──
{
  const twist = { bezierTwist: { enabled: true, points: [[0, 0], [81.3, 1]], pointTypes: ['fixed', 'fixed'] } };
  const rods = { textures: { ...DEFAULT_PARAMETERS.textures, enabled: true, rods: { enabled: true, count: 30, depth: 1.5, duty: 0.05 } } };
  // Gary's shape (radius 30, height 75, flared, smooth zones) — on the default
  // vase the normal test happens to catch it, which would prove nothing.
  const shape = {
    radius: 30, height: 75, bottomShape: 'Circle1', profileEnabled: true,
    profilePoints: [[1, 0], [1.05, 0.05], [1.17, 0.075], [1.25, 1]], profilePointTypes: ['fixed', 'handle', 'fixed', 'fixed'],
    smoothZones: { enabled: true, basePercent: 16, rimPercent: 20, baseFade: 79, rimFade: 100 },
  };
  const hi = { resolution: { vertical: 200, radial: 360 } };
  const ribbed = generateSplitThirdsMold({ ...vaseOf({ ...shape, ...twist, ...rods } as Partial<VaseParameters>), ...hi }, mold);
  const plain = generateSplitThirdsMold({ ...vaseOf({ ...shape, ...twist } as Partial<VaseParameters>), ...hi }, mold);
  const msg = `twisted rods ${ribbed.hasUndercuts ? 'locks' : 'releases'}, twisted plain ${plain.hasUndercuts ? 'locks' : 'releases'}`;
  if (ribbed.hasUndercuts && !plain.hasUndercuts) pass(msg); else fail(`${msg} — expected locks / releases`);
}

// ── I — plaster: per-piece sum vs the whole mold computed independently
// (N block sections × length − the whole vase + well section). ──
{
  const r = round;
  const N = r.pieceCount, a = r.debug.alpha, sa = Math.sin(a), ca = Math.cos(a);
  const { rW, H, zLo } = r.layout;
  const zPl = r.debug.zEnd - r.debug.sealDepth;
  // Block section per piece, from scratch: V from ρ = rW, lines square to the faces to t = H.
  const h = (H - rW * ca) / sa;
  const sec: P2[] = [[rW * sa - h * ca, H], [rW * sa, rW * ca], [0, 0], [-rW * sa, rW * ca], [-rW * sa + h * ca, H]];
  let A = 0;
  for (let i = 0; i < sec.length; i++) { const [x1, y1] = sec[i], [x2, y2] = sec[(i + 1) % sec.length]; A += x1 * y2 - x2 * y1; }
  A = Math.abs(A) / 2;
  // Whole vase section per ring: the union of the N arcs + apex, i.e. the sum.
  const outer = r.debug.outer[0];
  const ringArea = (i: number) => {
    let s = 0;
    const pts = outer[i].map(([, y, z]) => [y, z] as P2);
    pts.push([0, 0]);
    for (let k = 0; k < pts.length; k++) { const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length]; s += x1 * y2 - x2 * y1; }
    return (Math.abs(s) / 2) * N;   // round vase: every piece the same
  };
  let env = 0;
  for (let i = 0; i + 1 < outer.length; i++) env += ((outer[i + 1][0][0] - outer[i][0][0]) * (ringArea(i) + ringArea(i + 1))) / 2;
  env -= ringArea(outer.length - 1) * r.debug.sealDepth;
  const indep = N * A * (zPl - zLo) - env;
  const rel = Math.abs(indep - r.plasterVolumeMm3) / indep;
  if (rel > 0.005) fail(`plaster: ${(r.plasterVolumeMm3 / 1000).toFixed(1)} cm³ vs independent ${(indep / 1000).toFixed(1)} cm³`);
  else pass(`plaster: ${(r.plasterVolumeMm3 / 1000).toFixed(1)} cm³ matches the independent figure (${(rel * 100).toFixed(2)} %)`);
  // And against a true circle: the vase section should be close to πr² at mid-height.
}

// ── M — the foot piece (Phase 3, 2026-10-16). ──
/** Horizontal ray (height z) from the origin along θ: every hit distance on `meshes`. */
function hRay(meshes: VaseMesh[], z: number, th: number): number[] {
  const dx = Math.cos(th), dy = Math.sin(th);
  const out: number[] = [];
  for (const m of meshes) {
    const P = m.positions, I = m.indices;
    for (let f = 0; f < m.triangleCount; f++) {
      const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
      const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const d = [dx, dy, 0];
      const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
      if (Math.abs(det) < 1e-12) continue;
      const tv = [-P[a], -P[a + 1], z - P[a + 2]];
      const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
      if (u < 0 || u > 1) continue;
      const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
      const v = (d[0] * qv[0] + d[1] * qv[1]) / det;
      if (v < 0 || u + v > 1) continue;
      const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
      if (t > 0) out.push(t);
    }
  }
  return out.sort((x, y) => x - y);
}
const mapPts = (m: VaseMesh, f: (x: number, y: number, z: number) => [number, number, number]): VaseMesh => {
  const positions = new Float32Array(m.positions.length);
  for (let i = 0; i < positions.length; i += 3) { const q = f(m.positions[i], m.positions[i + 1], m.positions[i + 2]); positions[i] = q[0]; positions[i + 1] = q[1]; positions[i + 2] = q[2]; }
  return { ...m, positions };
};
function checkFoot(name: string, r: SplitThirdsMoldMeshes, m: MoldParameters) {
  const F = r.debug.foot;
  if (!F || !r.foot) { fail(`${name}: no plug built`); return; }
  const clr = m.halvesFitClearance;
  // M1 — the plug cup's solids.
  let bad = 0;
  [...F.disk.map((x, i) => [`disk#${i}`, x] as const), ...F.walls.flatMap((w, k) => w.map((x, i) => [`wall ${'ABCD'[k]}#${i}`, x] as const))].forEach(([nm, mesh]) => { const e = closed(mesh); if (e) { bad++; fail(`${name}: plug cup ${nm} not closed: ${e}`); } });
  if (!bad) pass(`${name}: plug cup disk + ${F.walls.length} walls (${F.walls.map((w) => w.length).join('/')} solids) closed + outward`);

  // M2 — the plug fits the pieces' bore. Horizontal rays from the axis in the
  // cup's frame: the band (every piece's, turned into the cup frame) is what
  // moulds the bore; the cup walls' inside is what moulds the plug. Expect the
  // cup Fit Clearance smaller everywhere, INCLUDING through the ring (groove vs
  // ring, one profile). CONTROL: the ring really is in both solids — the bore
  // and the cup are ~RING_H wider at the ring's centre than a quarter way down.
  const a = r.debug.alpha, a0 = (m.seamAngle * Math.PI) / 180, N = r.pieceCount;
  // assembly (X, Y, Z) = (−z, s, t) → world plan (s q + t b) → cup (x, −y), z_cup = −z = X.
  const walls = F.walls.flat();
  let gMin = Infinity, gMax = -Infinity, nRay = 0;
  // Each piece's band also runs down to its V bed, below its parting faces —
  // master plastic in the plate pocket, not part of the bore. So a ray only
  // reads the band of the piece whose wedge it lies in (cup θ = −world θ).
  const bandFor = (th: number) => {
    const wth = -th;
    let k = Math.floor((((wth - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * a));
    k = Math.min(N - 1, Math.max(0, k));
    const P = r.debug.parts[r.oneKit ? 0 : k], phi = a0 + (2 * k + 1) * a;
    const qx = -Math.sin(phi), qy = Math.cos(phi), bx = Math.cos(phi), by = Math.sin(phi);
    return P.disc.map((d) => mapPts(d, (X, Y, Z) => [Y * qx + Z * bx, -(Y * qy + Z * by), X]));
  };
  const bandCache = new Map<number, VaseMesh[]>();
  const radAt = (z: number, th: number) => {
    const wth = -th;
    const k = Math.min(N - 1, Math.floor((((wth - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * a)));
    if (!bandCache.has(k)) bandCache.set(k, bandFor(th));
    const b = hRay(bandCache.get(k)!, z, th), w = hRay(walls, z, th);
    return b.length && w.length ? { band: b[b.length - 1], cup: w[0] } : null;
  };
  let ringBore = 0, ringCup = 0, nCtl = 0;
  for (const zq of [0.3, F.plugH * 0.25, F.zRing - 1, F.zRing, F.zRing + 1.3, F.plugH * 0.8, F.plugH - 0.3]) for (let i = 0; i < 72; i++) {
    const th = (i / 72) * Math.PI * 2 + 0.0123;
    const q = radAt(zq, th);
    if (!q) continue;
    const g = q.cup - q.band;
    gMin = Math.min(gMin, g); gMax = Math.max(gMax, g); nRay++;
    if (zq === F.zRing) { const q2 = radAt(F.plugH * 0.25, th); if (q2) { ringBore += q.band - q2.band; ringCup += q.cup - q2.cup; nCtl++; } }
  }
  if (nRay < 400 || gMin < -clr - 0.03 || gMax > -clr + 0.03) fail(`${name}: plug vs bore: ${nRay} rays, cup − band ${gMin.toFixed(3)}…${gMax.toFixed(3)} mm (want ${(-clr).toFixed(2)})`);
  else pass(`${name}: the plug is ${(-gMax).toFixed(3)}–${(-gMin).toFixed(3)} mm inside the pieces' bore all round, ring included (${nRay} rays)`);
  if (!nCtl || ringBore / nCtl < 1.3 || ringCup / nCtl < 1.3) fail(`${name}: ring control: bore ${(ringBore / Math.max(1, nCtl)).toFixed(2)}, cup ${(ringCup / Math.max(1, nCtl)).toFixed(2)} mm proud at the ring (want ~1.5)`);
  else pass(`${name}: control — the ring is in both solids: bore +${(ringBore / nCtl).toFixed(2)} mm, cup groove +${(ringCup / nCtl).toFixed(2)} mm at its centre`);

  // M3 — the disk slides in (clr all round, rays at mid-disk) and rests on the
  // ledge (a vertical ray 1 mm inside its edge meets the ledge top = the disk bottom).
  let dMin = Infinity, dMax = -Infinity, nD = 0, seated = 0, nS = 0;
  const zMidDisk = F.zDisk + 0.5;
  for (let i = 0; i < 72; i++) {
    const th = (i / 72) * Math.PI * 2 + 0.0123;
    const d = hRay(F.disk, zMidDisk, th), w = hRay(walls, zMidDisk, th);
    if (!d.length || !w.length) continue;
    const g = w[0] - d[d.length - 1];
    dMin = Math.min(dMin, g); dMax = Math.max(dMax, g); nD++;
    const rr = d[d.length - 1] - 1, X = rr * Math.cos(th), Y = rr * Math.sin(th);
    const tops = walls.flatMap((x) => raysOf(x, 2).intervals(X + 1.3e-4, Y + 2.1e-4) ?? []).map((iv) => iv[1]).filter((t) => t < F.zDisk + 0.05);
    nS++;
    if (tops.length && Math.abs(Math.max(...tops) - F.zDisk) < 0.02) seated++;
  }
  if (nD < 60 || dMin < clr - 0.03 || dMax > clr + 0.03 || seated < nS - 2) fail(`${name}: disk: gap to the walls ${dMin.toFixed(3)}…${dMax.toFixed(3)} (want ${clr}), seated on the ledge ${seated}/${nS}`);
  else pass(`${name}: the disk slides in with ${dMin.toFixed(3)}–${dMax.toFixed(3)} mm and rests on the ledge (${seated}/${nS})`);

  // M4 — the cup assembled: disk + every wall clear on all three axes, and at
  // every seam the wall CCW of it has 3 ridges reaching past the seam plane
  // into the wall CW of it, which has none (its grooves) — rays square to the
  // seam, in the seam's own frame.
  const allB = [F.disk.flat(), ...F.walls].flat().map(bounds);
  const R = Math.max(...allB.flatMap((b) => [-b.lo[0], b.hi[0], -b.lo[1], b.hi[1]])) + 1;
  const groups = [F.disk, ...F.walls];
  const z0 = F.zWall0, z1 = F.plugH;
  const ez = interference(groups, 2, -R, R, -R, R, 0.8);
  const ex = interference(groups, 0, -R, R, z0, z1, 0.6);
  const ey = interference(groups, 1, -R, R, z0, z1, 0.4);
  const w = Math.max(ez.worst, ex.worst, ey.worst);
  if (w > 0.01) fail(`${name}: plug cup parts interfere ${w.toFixed(3)} mm (z ${ez.worst.toFixed(3)} ${ez.pair} @${ez.at.map((v) => v.toFixed(1))}, x ${ex.worst.toFixed(3)} ${ex.pair}, y ${ey.worst.toFixed(3)} ${ey.pair} @${ey.at.map((v) => v.toFixed(1))})`);
  else pass(`${name}: plug cup disk and ${F.walls.length} walls clear each other on all three axes (worst ${w.toFixed(3)} mm)`);
  const nW = F.walls.length;
  let seamBad = '', deepMin = Infinity;
  for (let j = 0; j < nW; j++) {
    const aS = F.seams[j], c = Math.cos(-aS), sn = Math.sin(-aS);
    const local = (ms: VaseMesh[]) => ms.map((d) => mapPts(d, (X, Y, Z) => [X * c - Y * sn, X * sn + Y * c, Z]));
    const ccwW = local(F.walls[j]), cwW = local(F.walls[(j - 1 + nW) % nW]);
    let ridges = 0, wrong = 0;
    for (let X = 0; X <= R; X += 0.05) {
      const iv = ccwW.flatMap((x) => raysOf(x, 1).intervals(X + 1.3e-4, F.plugH / 2 + 2.1e-4) ?? []);
      if (iv.length) { const reach = -Math.min(...iv.map((q) => q[0])); if (reach > 1.0) { ridges++; deepMin = Math.min(deepMin, reach); X += 1.5; continue; } }
      const ov = cwW.flatMap((x) => raysOf(x, 1).intervals(X + 1.3e-4, F.plugH / 2 + 2.1e-4) ?? []);
      if (ov.length && Math.max(...ov.map((q) => q[1])) > 1.0) wrong++;
    }
    if (ridges !== 3 || wrong) seamBad += ` seam ${j}: ${ridges} ridges from the CCW wall, ${wrong} rays where the CW wall reaches over`;
  }
  if (seamBad) fail(`${name}: plug cup flanges:${seamBad}`);
  else pass(`${name}: plug cup: at each of ${nW} seams 3 ridges from one wall reach ${deepMin.toFixed(2)} mm into the other's grooves, and the other has none`);
  // M6 — one wall printed N times when the outline repeats with the walls:
  // round → same, teardrop → not (each is the other's control).
  const wantSame = name.startsWith('round');
  if (r.foot.wallsSame !== wantSame) fail(`${name}: plug walls ${r.foot.wallsSame ? 'reported the same' : 'reported different'}, want ${wantSame ? 'same' : 'different'}`);
  else pass(`${name}: ${nW} plug walls, ${wantSame ? 'the same part (one STL)' : 'each different'}`);

  // M5 — the pieces' bottom face is flat where the plug's back is: rays along X
  // through the band + base wall; outside the band the first solid is the boss
  // face at the mouth. CONTROL: the same rays find the band (entry at X ≈ 0) and its ring.
  const P0 = r.debug.parts[0];
  const mouth = -r.debug.zB0, sa = Math.sin(a), ca = Math.cos(a), cot = ca / sa;
  const { rW, H } = r.layout;
  const hh = (H - rW * ca) / sa;
  const sec: P2[] = [[rW * sa - hh * ca, H], [rW * sa, rW * ca], [0, 0], [-rW * sa, rW * ca], [-rW * sa + hh * ca, H]];
  // Since 2026-10-18 the band is HOLLOW: inside it a ray meets the band's
  // half caps (X = −(zLo + Master Wall)), or, in the hinge gap between them,
  // the base wall's end slab (X = −zLo).
  let flat = 0, band = 0, ring = 0, gapR = 0, wrong = 0, worst = '', hollow = 0;
  const zLoM = r.debug.zB0 - r.debug.sealDepth;
  const xr = F.plugH / 2;
  for (let Y = -rW; Y <= rW; Y += 0.7) for (let Z = 0; Z <= H; Z += 0.7) {
    if (!inPoly(sec, Y, Z) || Z < Math.abs(Y) * cot + 0.3 || distPoly(sec, Y, Z) < 0.3) continue;
    const iv = [...P0.disc, ...P0.baseWall].flatMap((x) => raysOf(x, 0).intervals(Y + 1.3e-4, Z + 2.1e-4) ?? []);
    if (!iv.length) { gapR++; continue; }
    const e = Math.min(...iv.map((q) => q[0]));
    if (Math.abs(e - mouth) <= 0.01) flat++;
    else if (e <= 0.6) band++;
    else if (Math.abs(e - xr) <= 2.2) ring++;
    else if (Math.abs(e + zLoM + m.masterWallThickness) <= 0.01 || (Math.abs(Y) <= 1.05 && Math.abs(e + zLoM) <= 0.01)) hollow++;
    else { wrong++; worst = `entry X ${e.toFixed(3)} at Y ${Y.toFixed(1)} Z ${Z.toFixed(1)}`; }
  }
  if (wrong || flat < 10 || band < 10 || ring < 1 || hollow < 10 || gapR > 6) fail(`${name}: bottom face: ${flat} flat, ${band} band, ${ring} ring, ${hollow} hollow, ${gapR} empty, ${wrong} wrong (${worst})`);
  else pass(`${name}: bottom face flat at the mouth (${flat} rays); band found by ${band}, ring by ${ring}, its hollow by ${hollow} (controls); ${gapR} rays in the fit gap`);

  // M6 — natches clear the counterbore, and the lower one sits evenly between
  // the mouth face, the side wall and the master (Gary, 2026-10-16).
  const pocket = r.debug.pockets[0];
  for (const q of r.natches) {
    let dm = Infinity;
    for (let i = 0; i < pocket.length; i++) {
      const [az, as] = pocket[i], [bz, bs] = pocket[(i + 1) % pocket.length];
      const A2: P2 = [az, Math.abs(as) / sa], B2: P2 = [bz, Math.abs(bs) / sa];
      const ux = B2[0] - A2[0], uy = B2[1] - A2[1], l2 = ux * ux + uy * uy || 1;
      const t = Math.max(0, Math.min(1, ((q.z - A2[0]) * ux + (q.rho - A2[1]) * uy) / l2));
      dm = Math.min(dm, Math.hypot(q.z - A2[0] - t * ux, q.rho - A2[1] - t * uy));
    }
    if (dm - q.r < 4 - 0.05) fail(`${name}: natch z ${q.z.toFixed(1)}: only ${(dm - q.r).toFixed(2)} mm of plaster to the pocket/counterbore`);
    else pass(`${name}: natch z ${q.z.toFixed(1)} ρ ${q.rho.toFixed(1)}: ${(dm - q.r).toFixed(1)} mm of plaster to the pocket/counterbore`);
    if (q.z < (r.debug.zB0 + r.debug.zEnd) / 2) {
      const ds = [q.z - r.debug.zB0, rW - q.rho, dm];
      const spread = Math.max(...ds) - Math.min(...ds);
      if (spread > 0.3) fail(`${name}: lower natch not even: mouth ${ds[0].toFixed(2)}, side ${ds[1].toFixed(2)}, master ${ds[2].toFixed(2)}`);
      else pass(`${name}: lower natch even: mouth ${ds[0].toFixed(2)}, side wall ${ds[1].toFixed(2)}, master ${ds[2].toFixed(2)} mm`);
    }
  }
}
{
  const mf = { ...mold, thirdsFootPiece: true };
  const rr = generateSplitThirdsMold(vaseOf({}), mf);
  checkKit('round + foot', rr, mf, true);
  checkFoot('round + foot', rr, mf);
  if (rr.oneKit && rr.sharedBaseWall) pass('round + foot: one kit, one base wall'); else fail(`round + foot: oneKit ${rr.oneKit}, shared base wall ${rr.sharedBaseWall}`);
  const off = generateSplitThirdsMold(vaseOf({}), mold);
  const lower = (x: SplitThirdsMoldMeshes) => Math.min(...x.natches.map((q) => q.z));
  console.log(`      round + foot: natches z ${rr.natches.map((q) => q.z.toFixed(1)).join(' / ')} (foot off: ${off.natches.map((q) => q.z.toFixed(1)).join(' / ')}); plug plaster ${((rr.foot?.plasterVolumeMm3 ?? 0) / 1000).toFixed(0)} cm³`);
  // (With the plug the pieces run plugH below the vase, so a natch may sit below z = 0; M6 checks its clearance.)
  void lower;
  // Plaster: independent figure with the counterbore (a circle on the round vase).
  {
    const r = rr, Nn = r.pieceCount, a = r.debug.alpha, sa = Math.sin(a), ca = Math.cos(a);
    const { rW, H } = r.layout;
    const zPl = r.debug.zEnd - r.debug.sealDepth;
    const h = (H - rW * ca) / sa;
    const sec: P2[] = [[rW * sa - h * ca, H], [rW * sa, rW * ca], [0, 0], [-rW * sa, rW * ca], [-rW * sa + h * ca, H]];
    let A = 0;
    for (let i = 0; i < sec.length; i++) { const [x1, y1] = sec[i], [x2, y2] = sec[(i + 1) % sec.length]; A += x1 * y2 - x2 * y1; }
    A = Math.abs(A) / 2;
    const outer = r.debug.outer[0];
    const ringArea = (i: number) => {
      let s2 = 0;
      const pts = outer[i].map(([, y, z]) => [y, z] as P2);
      pts.push([0, 0]);
      for (let k = 0; k < pts.length; k++) { const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length]; s2 += x1 * y2 - x2 * y1; }
      return (Math.abs(s2) / 2) * Nn;
    };
    let env = 0;
    for (let i = 0; i + 1 < outer.length; i++) env += ((outer[i + 1][0][0] - outer[i][0][0]) * (ringArea(i) + ringArea(i + 1))) / 2;
    env -= ringArea(outer.length - 1) * r.debug.sealDepth;
    const r0 = Math.hypot(outer[0][0][1], outer[0][0][2]);
    const F = r.debug.foot!;
    env += F.plugH * Math.PI * r0 * r0;
    const indep = Nn * A * (zPl - r.debug.zB0) - env;
    const rel = Math.abs(indep - r.plasterVolumeMm3) / indep;
    if (rel > 0.005) fail(`round + foot: plaster ${(r.plasterVolumeMm3 / 1000).toFixed(1)} cm³ vs independent ${(indep / 1000).toFixed(1)} cm³`);
    else pass(`round + foot: plaster ${(r.plasterVolumeMm3 / 1000).toFixed(1)} cm³ matches the independent figure (${(rel * 100).toFixed(2)} %)`);
  }

  const td = generateSplitThirdsMold(vaseOf({ bottomShape: 'Teardrop1' } as Partial<VaseParameters>), mf);
  checkKit('teardrop + foot', td, mf, true);
  checkFoot('teardrop + foot', td, mf);
  if (!td.oneKit && !td.sharedBaseWall && td.kits.length === 3) pass('teardrop + foot: three kits, each with its own base wall');
  else fail(`teardrop + foot: kits ${td.kits.length}, shared base wall ${td.sharedBaseWall}`);

  // NEGATIVE CONTROL: −0.3 clearance must show up between the band and the base wall's boss.
  const bad = generateSplitThirdsMold(vaseOf({}), { ...mf, halvesFitClearance: -0.3 });
  const Pb = bad.debug.parts[0];
  const db = Pb.disc.map(bounds);
  const xLo = Math.min(...db.map((b) => b.lo[0])), xHi = Math.max(...db.map((b) => b.hi[0]));
  const ib = interference([Pb.disc, Pb.baseWall], 2, xLo, xHi, -bad.layout.rW, bad.layout.rW, 0.5);
  if (ib.worst > 0.15) pass(`control: −0.3 clearance IS caught between the band and the base boss (${ib.worst.toFixed(2)} mm)`);
  else fail(`control: −0.3 clearance at the base boss not caught (${ib.worst.toFixed(3)} mm) — the probe is blind`);
}

// ── J — negative control. ──
{
  const m2 = { ...mold, halvesFitClearance: -0.3 };
  const r = generateSplitThirdsMold(vaseOf({}), m2);
  const P = r.debug.parts[0];
  const ab = bounds(r.kits[0].plate);
  const ex = interference([[P.relief, P.cap], P.wellWall], 0, ab.lo[1], ab.hi[1], ab.lo[2], r.layout.H, 0.5);
  if (ex.worst > 0.2) pass(`control: −0.3 clearance IS caught at the well boss (${ex.worst.toFixed(2)} mm)`);
  else fail(`control: −0.3 clearance not caught at the boss (${ex.worst.toFixed(2)}) — the probe is blind`);
}

// M7 (2026-10-18) — HOW MANY plug walls. A wall must pull straight off the
// plug along its own centre line; a textured bottom edge locks it where its
// ribs point along the pull. Independent of the generator's normal test: from
// every point of the plug's outline, a ray along that point's wall's pull must
// never meet the plug again. CONTROL: on the 30-wave edge the same rays DO
// meet it with 2 walls on the x axis. Also: one wall STL when the outline
// repeats with the walls (30 waves, 3 walls), not at 29 — and at Radial 360,
// where a sample lands on a seam and walls differ in point count (the first
// sameness check compared counts and said "differ").
{
  const lockedPts = (O: P2[], seams: number[]): number => {
    const span = 2 * Math.PI / seams.length;
    let hits = 0;
    for (const [px, py] of O) {
      const ang = Math.atan2(py, px);
      let k = 0;
      for (let j = 0; j < seams.length; j++) if ((((ang - seams[j]) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) < span) k = j;
      const pull = seams[k] + span / 2, dx = Math.cos(pull), dy = Math.sin(pull);
      for (let e = 0; e < O.length; e++) {
        const [ax, ay] = O[e], [bx, by] = O[(e + 1) % O.length];
        const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((ax - px) * ey - (ay - py) * ex) / den, u = ((ax - px) * dy - (ay - py) * dx) / den;
        if (t > 0.05 && u >= 0 && u < 1) { hits++; break; }
      }
    }
    return hits;
  };
  const mf = { ...mold, thirdsFootPiece: true, masterWallThickness: 2 };
  const cupV = (count: number, smooth: boolean) => ({ ...vaseOf({ bottomShape: 'Circle1', topShape: 'Circle1', radius: 30, height: 75,
    smoothZones: { enabled: smooth, basePercent: 10, rimPercent: 28, baseFade: 61, rimFade: 87 },
    textures: { ...DEFAULT_PARAMETERS.textures, enabled: true, waves: { enabled: true, count, depth: 1.5, duty: 0 } } } as Partial<VaseParameters>), resolution: { vertical: 200, radial: 360 } });
  for (const [label, count, smooth, wantN, wantSame] of [
    ['30 waves to the bottom edge', 30, false, 3, true],
    // 4, not 3: 29 lobes cannot put all three seams on crests, and the best
    // 3-wall layout still locks 7 of 360 outline points by this same ray test
    // (checked 2026-10-18, seams scanned in 0.1° steps).
    ['29 waves to the bottom edge', 29, false, 4, false],
    ['29 waves, base Smooth Zone', 29, true, 2, true],
  ] as const) {
    const r = generateSplitThirdsMold(cupV(count, smooth), mf);
    if (r.error || !r.foot || !r.debug.foot) { fail(`M7 ${label}: ${r.error}`); continue; }
    const F = r.debug.foot, n = r.foot.walls.length;
    const hits = lockedPts(F.plugOutline, F.seams), ctl = lockedPts(F.plugOutline, [0, Math.PI]);
    const ok7 = n === wantN && r.foot.wallsSame === wantSame && hits === 0 && !r.foot.plugNote && (smooth || ctl > 0);
    const msg = `${n} walls (${r.foot.wallsSame ? 'one STL' : 'each different'}), ${hits}/${F.plugOutline.length} outline points locked; control, 2 walls on x: ${ctl} locked`;
    if (!ok7) fail(`M7 ${label}: ${msg}; want ${wantN} walls, ${wantSame ? 'same' : 'different'}, 0 locked${smooth ? '' : ', control > 0'}`);
    else pass(`M7 ${label}: ${msg}`);
  }
}

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
