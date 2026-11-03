/**
 * Numeric verification for SprigMaker (local-docs/sprigmaker-plan.md). Solids
 * are probed with RAYS, not vertex positions (feedback: a feature can exist in
 * the mesh and not in the solid). Synthetic grayscale images stand in for the
 * browser's SVG rasterizer, which needs a DOM.
 *  A. plate and walls are closed and outward; the relief plate is ONE solid, the
 *     wall the four solids buildWall makes; every height mode, size, rotation;
 *  B. plate ↔ walls ↔ walls do not interfere (vertical rays over the flange
 *     band, horizontal rays across both seams); CONTROL: the same layout at
 *     V clearance −0.3 must interfere;
 *  C. the standard-size promise — the wall STL is byte-identical for two
 *     different sprigs (and different Max Height / Shrink / margin) at the same
 *     size; CONTROL: a Custom wall height changes it;
 *  D. heights: ray-cast the plate top and compare to the formula for Flat, Gray
 *     (a ramp) and Inflate (a disc, three profiles); CONTROL: off the shape the
 *     ray finds the bare plate top;
 *  E. orientation: ink in the drawing's top-left lands at −x,+y on the plate
 *     (no mirror), and turns to +x,+y at Rotate 90 (clockwise);
 *  F. thin parts: a 1.0 mm bar is flagged, a 3 mm bar is not, at the default
 *     1.5 mm; the reported width is ≈ 1.0;
 *  G. edges: Min Edge Thickness is the height of the first cell in (0 allowed),
 *     and Edge Softness ramps from it;
 *  H. settings round-trip every field (embedded SVG included); a wrong-typed
 *     or out-of-list value falls back to the default;
 *  I. fit: auto-pick chooses the smallest size that fits, and the fit test
 *     agrees with the generator's warning;
 *  J. the vase SVG texture path is untouched: rasterizeSvg and gaussianBlur are
 *     textually identical to the last commit before SprigMaker.
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-sprig.ts
 */
import { generateSprigMold, smallestFit, sprigLayout, fitsBox } from '@/engine/sprig/sprig-generator';
import { DEFAULT_SPRIG_PARAMETERS, mergeSprigParameters, sprigBox, sprigPlacement, type SprigParameters } from '@/engine/sprig/sprig-types';
import { buildRelief, cropToContent, inflateProfile, type SprigSource, type TextLayer } from '@/engine/sprig/relief';
import { buildWall, buildPlateRidges } from '@/engine/handle/mold-parts';
import { rotate180Z, signedVolume } from '@/engine/handle/mesh3';
import { generateSTL } from '@/engine/stl-export';
import type { VaseMesh } from '@/engine/types';

let ok = true;
let passes = 0;
const fail = (msg: string) => { ok = false; console.log(`FAIL  ${msg}`); };
const pass = (msg: string) => { passes++; console.log(`PASS  ${msg}`); };
const check = (cond: boolean, msg: string) => (cond ? pass(msg) : fail(msg));

// ── Mesh helpers (same as verify-halves) ─────────────────────────────────────

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

/** Split a merged mesh into its separate solids. Welds by position first:
 *  extrudeSolid emits its caps as fresh vertices, so by index alone one solid
 *  reads as three (the trap verify-handle-seal's comps() fell into). */
function components(mesh: VaseMesh): VaseMesh[] {
  const parent = Array.from({ length: mesh.vertexCount }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const weld = new Map<string, number>();
  for (let i = 0; i < mesh.vertexCount; i++) {
    const k = `${mesh.positions[i * 3].toFixed(4)},${mesh.positions[i * 3 + 1].toFixed(4)},${mesh.positions[i * 3 + 2].toFixed(4)}`;
    const w = weld.get(k);
    if (w === undefined) weld.set(k, i); else parent[find(i)] = find(w);
  }
  for (let f = 0; f < mesh.triangleCount; f++) {
    const a = find(mesh.indices[f * 3]), b = find(mesh.indices[f * 3 + 1]), c = find(mesh.indices[f * 3 + 2]);
    parent[b] = a; parent[find(c)] = find(a);
  }
  const groups = new Map<number, number[]>();
  for (let f = 0; f < mesh.triangleCount; f++) {
    const r = find(mesh.indices[f * 3]);
    let g = groups.get(r);
    if (!g) { g = []; groups.set(r, g); }
    g.push(f);
  }
  return [...groups.values()].map((faces) => {
    const idx = new Uint32Array(faces.length * 3);
    faces.forEach((f, k) => { idx[k * 3] = mesh.indices[f * 3]; idx[k * 3 + 1] = mesh.indices[f * 3 + 1]; idx[k * 3 + 2] = mesh.indices[f * 3 + 2]; });
    return { ...mesh, indices: idx, triangleCount: faces.length };
  });
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

function overlap(A: [number, number][], B: [number, number][]): number {
  let worst = 0;
  for (const [a0, a1] of A) for (const [b0, b1] of B) worst = Math.max(worst, Math.min(a1, b1) - Math.max(a0, b0));
  return worst;
}

/** Worst overlap between PARTS (each a list of solids) along rays over a box. */
function interference(parts: VaseMesh[][], axis: 0 | 1 | 2, a0: number, a1: number, b0: number, b1: number, step: number): number {
  const grids = parts.map((solids) => solids.map((s) => new Rays(s, axis)));
  let worst = 0;
  for (let a = a0; a <= a1; a += step) {
    for (let b = b0; b <= b1; b += step) {
      const sets = grids.map((gs) => gs.flatMap((g) => g.intervals(a + 1e-4, b + 2e-4) ?? []));
      for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) worst = Math.max(worst, overlap(sets[i], sets[j]));
    }
  }
  return worst;
}

/** Top of the plate's relief solid at (x, y): its highest ray hit. */
function topAt(rays: Rays, x: number, y: number): number {
  const h = rays.hits(x + 1e-4, y + 2e-4);
  return h.length ? h[h.length - 1] : NaN;
}

// ── Synthetic images (0 = black … 255 = white, row 0 at the top) ─────────────

function image(w: number, h: number, ink: (x: number, y: number) => number): SprigSource {
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = Math.round(255 * (1 - ink(x + 0.5, y + 0.5)));
  return { pixels: px, width: w, height: h };
}
const disc = image(400, 400, (x, y) => (Math.hypot(x - 200, y - 200) < 199 ? 1 : 0));
const ellipse = image(300, 200, (x, y) => (((x - 150) / 148) ** 2 + ((y - 100) / 98) ** 2 < 1 ? 1 : 0));
/** Gray ramp across a full square: black at the left, near-white at the right. */
const ramp = image(400, 400, (x) => 1 - 0.9 * (x / 400));
/** Ink only in the top-left quadrant, the rest a faint gray frame so the crop keeps the whole square. */
const corner = image(200, 200, (x, y) => (x < 100 && y < 100 ? 1 : (x < 1 || y < 1 || x > 199 || y > 199 ? 0.05 : 0)));

const base: SprigParameters = { ...DEFAULT_SPRIG_PARAMETERS };
const S = 1 + base.shrinkPercent / 100;

// ── A. closed solids ─────────────────────────────────────────────────────────
console.log('\nA. closed solids');
{
  const cases: [string, SprigParameters, SprigSource][] = [];
  for (const mode of ['flat', 'gray', 'inflate', 'inflateGray'] as const) {
    cases.push([`mode ${mode}`, { ...base, heightMode: mode, width: 38, length: 25 }, ellipse]);
  }
  for (const size of ['s60', 's100', 'long', 'custom'] as const) {
    cases.push([`size ${size}`, { ...base, moldSize: size, width: 30, length: 20 }, ellipse]);
  }
  cases.push(['size s20 (smallest)', { ...base, moldSize: 's20', width: 3, length: 3 }, ellipse]);
  cases.push(['size s140 (largest)', { ...base, moldSize: 's140', width: 100, length: 90 }, ellipse]);
  for (const rot of [90, 180, 270] as const) {
    cases.push([`rotate ${rot} + flips`, { ...base, rotation: rot, flipX: true, flipY: rot === 180, width: 20, length: 30 }, ellipse]);
  }
  cases.push(['min edge 0, softness 0', { ...base, minEdgeThickness: 0, edgeSoftness: 0, width: 30, length: 20 }, ellipse]);
  cases.push(['invert', { ...base, invert: true, heightMode: 'flat', width: 30, length: 30 }, corner]);
  for (const [name, p, src] of cases) {
    const m = generateSprigMold(p, src);
    const parts = components(m.plate);
    const ridges = buildPlateRidges(m.layout).length;
    const bad = parts.map(closed).filter((r) => r !== null);
    check(bad.length === 0 && parts.length === 1 + ridges, `${name}: plate = ${parts.length} closed solids (relief plate + ${ridges} ridges)${bad.length ? ' — ' + bad[0] : ''}`);
  }
  const m = generateSprigMold(base, ellipse);
  const wallParts = components(m.wall);
  const bad = wallParts.map(closed).filter((r) => r !== null);
  check(bad.length === 0 && wallParts.length === 4, `wall = ${wallParts.length} closed solids (body, flange, 2 seam blocks)${bad.length ? ' — ' + bad[0] : ''}`);
}

// ── B. plate ↔ walls ↔ walls ─────────────────────────────────────────────────
console.log('\nB. no interference (control: V clearance −0.3)');
{
  for (const size of ['s20', 's60', 'long'] as const) {
    const m = generateSprigMold({ ...base, moldSize: size, width: size === 's20' ? 3 : 30, length: size === 's20' ? 3 : 20 }, ellipse);
    const L = m.layout;
    const plate = components(m.plate), wA = components(m.wall), wB = components(m.wallB);
    // Vertical rays over the flange band, both the x and y sides.
    const band = L.wt + L.flangeW + 1;
    const v1 = interference([plate, wA, wB], 2, L.px0, L.px1, L.py0, L.py0 + band, 0.25);
    const v2 = interference([plate, wA, wB], 2, L.px0, L.px0 + band, L.py0, L.py1, 0.25);
    check(Math.max(v1, v2) < 0.01, `${size}: plate vs walls, vertical rays over the flange: worst overlap ${Math.max(v1, v2).toFixed(3)} mm`);
    // Horizontal rays (along x) across both seams at x = 0, every height.
    const s1 = interference([wA, wB], 0, L.py0, L.cavY0, 0.05, L.wallH - 0.05, 0.2);
    const s2 = interference([wA, wB], 0, L.cavY1, L.py1, 0.05, L.wallH - 0.05, 0.2);
    check(Math.max(s1, s2) < 0.01, `${size}: wall A vs wall B across the seams: worst overlap ${Math.max(s1, s2).toFixed(3)} mm`);

    // CONTROL — grooves smaller than the ridges they receive.
    const tight = { ...L, vclr: -0.3 };
    const wallT = buildWall(tight, { collars: false });
    const cV = interference([buildPlateRidges(tight), components(wallT)], 2, L.px0, L.px1, L.py0, L.py0 + band, 0.25);
    const cS = interference([components(wallT), components(rotate180Z(wallT, 0, 0))], 0, L.py0, L.cavY0, 0.05, L.wallH - 0.05, 0.2);
    check(cV > 0.1 && cS > 0.1, `${size}: CONTROL at V clearance −0.3 interferes (flange ${cV.toFixed(2)} mm, seam ${cS.toFixed(2)} mm)`);
  }
}

// ── C. the standard-size promise ─────────────────────────────────────────────
console.log('\nC. walls do not depend on the sprig');
{
  const bytes = (m: VaseMesh) => Buffer.from(generateSTL(m));
  for (const size of ['s60', 's100', 'long'] as const) {
    const a = generateSprigMold({ ...base, moldSize: size, width: 30, length: 20 }, ellipse);
    const b = generateSprigMold({ ...base, moldSize: size, width: 25, length: 25, heightMode: 'gray', maxHeight: 6, shrinkPercent: 8, plasterMargin: 5, resolution: 0.3 }, disc);
    check(bytes(a.wall).equals(bytes(b.wall)), `${size}: wall STL byte-identical for two different sprigs (${a.wallStats.triangleCount} tris)`);
  }
  const s = generateSprigMold({ ...base, moldSize: 'custom', customCavW: 60, customCavL: 60, width: 30, length: 20 }, ellipse);
  const small = generateSprigMold({ ...base, moldSize: 's60', width: 30, length: 20 }, ellipse);
  check(bytes(s.wall).equals(bytes(small.wall)), 'Custom 60×60 at the standard box numbers = the 60×60 size, byte for byte');
  const t = generateSprigMold({ ...base, moldSize: 'custom', customCavW: 60, customCavL: 60, customWallH: 30, width: 30, length: 20 }, ellipse);
  check(!bytes(t.wall).equals(bytes(small.wall)), 'CONTROL: Custom wall height 30 changes the wall');
  // Plate Thickness applies to every size (Gary 2026-10-25) — it must never touch the wall.
  const zMin = (m: VaseMesh) => { let z = Infinity; for (let i = 2; i < m.positions.length; i += 3) z = Math.min(z, m.positions[i]); return z; };
  for (const size of ['s60', 'long'] as const) {
    const thick = generateSprigMold({ ...base, moldSize: size, width: 30, length: 20, plateThickness: 5 }, ellipse);
    const thin = generateSprigMold({ ...base, moldSize: size, width: 30, length: 20, plateThickness: 1 }, ellipse);
    check(bytes(thin.wall).equals(bytes(thick.wall)), `${size}: wall STL byte-identical at plate 1 mm and 5 mm`);
    check(Math.abs(zMin(thin.plate) + 1) < 1e-6 && Math.abs(zMin(thick.plate) + 5) < 1e-6,
      `${size}: plate bottom at z = ${zMin(thin.plate).toFixed(2)} / ${zMin(thick.plate).toFixed(2)} (want −1 / −5)`);
    const why = closed(thin.plate);
    check(why === null, `${size}: 1 mm plate is a closed solid${why ? ' — ' + why : ''}`);
  }
  // Old files: a custom design's customPlateFloor carries over; a standard one gets the default.
  const oldCustom = mergeSprigParameters({ moldSize: 'custom', customPlateFloor: 3.4 });
  const oldSmall = mergeSprigParameters({ moldSize: 's60', customPlateFloor: 3.4 });
  check(oldCustom.plateThickness === 3.4 && oldSmall.plateThickness === DEFAULT_SPRIG_PARAMETERS.plateThickness,
    `old file: custom keeps its 3.4 mm plate (${oldCustom.plateThickness}), small gets the default (${oldSmall.plateThickness})`);
}

// ── D. heights ───────────────────────────────────────────────────────────────
console.log('\nD. heights match the formula');
{
  const p0: SprigParameters = { ...base, width: 30, length: 30, edgeSoftness: 0, minEdgeThickness: 0, maxHeight: 4, resolution: 0.1 };
  // Flat disc
  {
    const m = generateSprigMold({ ...p0, heightMode: 'flat' }, disc);
    const r = new Rays(components(m.plate)[0], 2, 1);
    const errs = [[0, 0], [5, 3], [-8, 6], [10, -9]].map(([x, y]) => Math.abs(topAt(r, x * S, y * S) - 4 * S));
    check(Math.max(...errs) < 0.01, `Flat: top = Max Height × Shrink at 4 points (worst ${Math.max(...errs).toFixed(4)} mm)`);
    const off = topAt(r, 15.5 * S, 15.5 * S);
    check(Math.abs(off) < 1e-4, `CONTROL: off the disc the ray finds the plate top (z = ${off.toFixed(4)})`);
  }
  // Gray ramp: height = H × ink, ink = 1 − 0.9·s
  {
    const m = generateSprigMold({ ...p0, heightMode: 'gray' }, ramp);
    const r = new Rays(components(m.plate)[0], 2, 1);
    let worst = 0;
    for (const s of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const x = (s - 0.5) * 30;
      const want = 4 * (1 - 0.9 * s) * S;
      worst = Math.max(worst, Math.abs(topAt(r, x * S, 2 * S) - want));
    }
    check(worst < 0.03, `Gray ramp: top = H × ink × Shrink at 5 points (worst ${worst.toFixed(3)} mm)`);
  }
  // Inflate disc (radius 15 finished): height = H × profile(d / roundness)
  for (const profile of ['round', 'pillow', 'angular'] as const) {
    const roundness = 6;
    const m = generateSprigMold({ ...p0, heightMode: 'inflate', profile, roundness }, disc);
    const r = new Rays(components(m.plate)[0], 2, 1);
    let worst = 0;
    // Away from the very edge (the blur and the grid both act there) and from
    // the plateau shoulder, where the smoothing deliberately rounds the corner.
    for (const d of [1.5, 3, 4.5, 10, 14]) {
      const x = 15 - d;
      const want = 4 * inflateProfile(d / roundness, profile) * S;
      worst = Math.max(worst, Math.abs(topAt(r, x * S, 0.05) - want));
    }
    check(worst < 0.15, `Inflate ${profile}: top follows the profile at 5 depths (worst ${worst.toFixed(3)} mm of ${(4 * S).toFixed(2)})`);
  }
}

// ── E. orientation ───────────────────────────────────────────────────────────
console.log('\nE. orientation — no mirror, Rotate 90 is clockwise');
{
  const p: SprigParameters = { ...base, heightMode: 'flat', width: 30, length: 30, edgeSoftness: 0, minEdgeThickness: 0 };
  const probe = (m: ReturnType<typeof generateSprigMold>, sx: number, sy: number) => {
    const r = new Rays(components(m.plate)[0], 2, 1);
    return topAt(r, sx * 7 * S, sy * 7 * S);
  };
  const m0 = generateSprigMold(p, corner);
  check(probe(m0, -1, 1) > 1 && probe(m0, 1, 1) < 0.5 && probe(m0, -1, -1) < 0.5,
    `drawing's top-left → plate −x,+y (−x+y ${probe(m0, -1, 1).toFixed(2)}, +x+y ${probe(m0, 1, 1).toFixed(2)}, −x−y ${probe(m0, -1, -1).toFixed(2)})`);
  const m90 = generateSprigMold({ ...p, rotation: 90 }, corner);
  check(probe(m90, 1, 1) > 1 && probe(m90, -1, 1) < 0.5,
    `Rotate 90 → +x,+y (+x+y ${probe(m90, 1, 1).toFixed(2)}, −x+y ${probe(m90, -1, 1).toFixed(2)})`);
  const mfx = generateSprigMold({ ...p, flipX: true }, corner);
  check(probe(mfx, 1, 1) > 1 && probe(mfx, -1, 1) < 0.5, 'Flip H → +x,+y');
}

// ── F. thin parts ────────────────────────────────────────────────────────────
console.log('\nF. thin-part check (Min Feature Width 1.5)');
{
  // 0.05 mm/px: a 1.0 mm bar = 20 px, a 3.0 mm bar = 60 px, 15 mm tall, 10 mm apart.
  const px = 0.05;
  const src = image(300, 300, (x, y) => (y >= 0 && y < 300 && ((x >= 0 && x < 20) || (x >= 240 && x < 300)) ? 1 : 0));
  const crop = cropToContent(src)!;
  const p: SprigParameters = { ...base, heightMode: 'flat', width: crop.source.width * px, length: crop.source.height * px, resolution: 0.1 };
  const rel = buildRelief(crop.source, p, p.resolution / S);
  let thinA = 0, inA = 0, thinB = 0, inB = 0;
  for (let j = 0; j < rel.ny; j++) for (let i = 0; i < rel.nx; i++) {
    const k = j * rel.nx + i;
    if (!rel.mask[k]) continue;
    const x = rel.x0 + i * rel.step;
    if (x < -p.width / 2 + 1.0) { inA++; thinA += rel.thin[k]; } else if (x > p.width / 2 - 3.0) { inB++; thinB += rel.thin[k]; }
  }
  check(thinA / inA > 0.8, `1.0 mm bar flagged: ${(100 * thinA / inA).toFixed(0)}% of its cells`);
  check(thinB === 0, `3.0 mm bar not flagged: ${thinB} of ${inB} cells`);
  check(rel.thinSpots === 1 && Math.abs(rel.thinnestWidth - 1.0) < 0.2, `one thin spot, width ≈ ${rel.thinnestWidth.toFixed(2)} mm (want 1.0)`);
  // A 1.0 mm leg on a big body must still read ~1.0, not the body's width.
  const leg = image(300, 300, (x, y) => ((x < 160 && y < 160) || (x >= 70 && x < 90) ? 1 : 0));
  const legP: SprigParameters = { ...p, width: 15, length: 15 };
  const relLeg = buildRelief(leg, legP, p.resolution / S);
  check(relLeg.thinSpots === 1 && Math.abs(relLeg.thinnestWidth - 1.0) < 0.2, `1.0 mm leg on an 8 mm body: one spot, width ≈ ${relLeg.thinnestWidth.toFixed(2)} mm`);
  const rel2 = buildRelief(crop.source, { ...p, minFeatureWidth: 0.8 }, p.resolution / S);
  check(rel2.thinSpots === 0, `CONTROL: at Min Feature Width 0.8 nothing is flagged (${rel2.thinSpots} spots)`);

  // Thicken Thin Parts (2026-10-28): the leg grows to ~Min Feature, the body does not.
  console.log('\nF2. Thicken Thin Parts');
  const rows = (r: ReturnType<typeof buildRelief>) => {
    const w: number[] = [];
    for (let j = 0; j < r.ny; j++) { let n = 0; for (let i = 0; i < r.nx; i++) n += r.mask[j * r.nx + i]; if (n) w.push(n * r.step); }
    return w;
  };
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
  const thick = buildRelief(leg, { ...legP, thickenThin: 1.5 }, p.resolution / S);
  const legOff = rows(relLeg).filter((w) => w < 4), legOn = rows(thick).filter((w) => w < 4);
  check(thick.thinSpots === 0, `Thicken 1.5: no thin spots left (${thick.thinSpots})`);
  check(median(legOff) < 1.25 && median(legOn) >= 1.5 && median(legOn) <= 2.1,
    `leg ${median(legOff).toFixed(2)} → ${median(legOn).toFixed(2)} mm wide (want 1.5–2.1)`);
  const bodyOff = rows(relLeg).filter((w) => w > 6), bodyOn = rows(thick).filter((w) => w > 6);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  check(bodyOff.length === bodyOn.length && Math.abs(sum(bodyOn) - sum(bodyOff)) < 0.01 * sum(bodyOff),
    `8 mm body unchanged: ${sum(bodyOff).toFixed(1)} → ${sum(bodyOn).toFixed(1)} (row widths summed)`);
  // Square corners are not thin parts: a plain square must not grow at all.
  const sq = image(200, 200, () => 1);
  const sqP: SprigParameters = { ...legP, width: 10, length: 10 };
  const sqOff = buildRelief(sq, sqP, p.resolution / S), sqOn = buildRelief(sq, { ...sqP, thickenThin: 1.5 }, p.resolution / S);
  check(sum(rows(sqOn)) === sum(rows(sqOff)), `CONTROL: a 10 mm square is left alone (${sum(rows(sqOff)).toFixed(1)} → ${sum(rows(sqOn)).toFixed(1)})`);
  // A toothed edge (a serrated leaf): the teeth are too small for the red
  // check, so Thicken must leave them alone too — and still grow the leg.
  const teeth = image(400, 400, (x, y) => {
    const dx = x - 200, dy = y - 190, r = Math.hypot(dx, dy);
    const ph = ((Math.atan2(dy, dx) / (2 * Math.PI)) * 48 + 48) % 1;
    const tooth = 8 * Math.max(0, 1 - Math.abs(ph - 0.5) / 0.07);
    return r < 150 + tooth || (x >= 190 && x < 210 && y > 300) ? 1 : 0;
  });
  const tP: SprigParameters = { ...legP, width: 20, length: 20 };
  const tOff = buildRelief(teeth, tP, p.resolution / S), tOn = buildRelief(teeth, { ...tP, thickenThin: 1.5 }, p.resolution / S);
  const grown = (a: ReturnType<typeof buildRelief>, b: ReturnType<typeof buildRelief>) => {
    let rim = 0, leg = 0;
    const ox = (b.nx - a.nx) / 2, oy = (b.ny - a.ny) / 2;
    for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) {
      if (!b.mask[j * b.nx + i]) continue;
      const ia = i - ox, ja = j - oy;
      if (ia >= 0 && ja >= 0 && ia < a.nx && ja < a.ny && a.mask[ja * a.nx + ia]) continue;
      const x = b.x0 + i * b.step, y = b.y0 + j * b.step;
      if (Math.abs(x) < 1.5 && y < -6.5) leg++; else rim++;
    }
    return { rim, leg };
  };
  const g = grown(tOff, tOn);
  check(tOff.thinSpots >= 1 && g.leg > 0 && g.rim === 0,
    `serrated edge left alone, leg grown: ${g.rim} cells added round the rim, ${g.leg} on the leg (thin spots ${tOff.thinSpots} → ${tOn.thinSpots})`);
  // Off = exactly as before, including an old design with no such field.
  const old = { ...legP } as Partial<SprigParameters>; delete old.thickenThin;
  const relOld = buildRelief(leg, old as SprigParameters, p.resolution / S);
  check(relOld.nx === relLeg.nx && relOld.heights.every((h, k) => h === relLeg.heights[k]) && relLeg.thinSpots === 1,
    'CONTROL: Thicken 0 and a design without the field give the same heights, leg still flagged');
}

// ── G. edges ─────────────────────────────────────────────────────────────────
console.log('\nG. Min Edge Thickness and Edge Softness');
{
  const p: SprigParameters = { ...base, heightMode: 'flat', width: 30, length: 30, maxHeight: 3, resolution: 0.1 };
  const edgeH = (q: SprigParameters) => {
    const rel = buildRelief(disc, q, q.resolution / S);
    // Cells along the +x radius, in from the edge.
    const j = Math.floor(rel.ny / 2);
    const row: number[] = [];
    for (let i = rel.nx - 1; i >= 0; i--) if (rel.mask[j * rel.nx + i]) row.push(rel.heights[j * rel.nx + i]);
    return { first: row[0], at: (mm: number) => row[Math.round(mm / rel.step)] };
  };
  const a = edgeH({ ...p, minEdgeThickness: 0.4, edgeSoftness: 1 });
  check(Math.abs(a.first - 0.4) < 0.05, `edge cell = Min Edge Thickness 0.4 (got ${a.first.toFixed(3)})`);
  check(a.at(0.5) > 0.6 && a.at(0.5) < 2.9 && Math.abs(a.at(1.5) - 3) < 1e-3, `softness 1 mm ramps: ${a.at(0.5).toFixed(2)} at 0.5 mm, ${a.at(1.5).toFixed(2)} at 1.5 mm`);
  const z = edgeH({ ...p, minEdgeThickness: 0, edgeSoftness: 1 });
  check(z.first < 0.1, `Min Edge 0 tapers to ~0 (edge cell ${z.first.toFixed(3)})`);
  const hard = edgeH({ ...p, minEdgeThickness: 0, edgeSoftness: 0 });
  check(Math.abs(hard.first - 3) < 1e-3, `Softness 0 = full height at the first cell (${hard.first.toFixed(3)})`);
}

// ── H. settings round-trip ───────────────────────────────────────────────────
console.log('\nH. settings round-trip');
{
  const every: SprigParameters = {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
    svgName: 'round thing', svgAspect: 0.77,
    width: 41.5, length: 33, lockAspect: false, rotation: 270, flipX: true, flipY: true,
    heightMode: 'inflateGray', maxHeight: 4.2, profile: 'pillow', roundness: 5.5, detailDepth: 0.9, invert: true,
    edgeSoftness: 1.7, minEdgeThickness: 0.35, minFeatureWidth: 2.2,
    backing: 'outline', backingThickness: 2.3, backingBorder: 4.5, backingCorner: 7, backingEdge: 0.8,
    removeTiny: true, wholeShapesOnly: true, roundThin: true, thickenThin: 1.7, widen: 2.2, minThickness: 0.8, gapFill: 40, trimBelow: 0.3, loadedAs: 'relief', loadedMaxHeight: 4.5, loadedMoldSize: 's100',
    imageBackground: 35, imageCloseGaps: 2.5, imageSmooth: 3, imageTones: 4, imageLightest: 55, fillHeight: 35, svgCloseGaps: 2.5, svgTones: 4,
    text: 'Hello\nthere', textFont: 'system', textFontName: 'Futura', textHeight: 11.5, textStyle: 'cut', textDepth: 0.7,
    textPosition: 'left', textGap: 4.5, textOffsetX: -3, textOffsetY: 2.5, textRotation: 35, drawingOn: false,
    onVaseHeight: 62, onVaseAngle: -40, onVaseTilt: 15, onVaseCopies: 3, onVaseHandle: true,
    moldSize: 'custom', plasterMargin: 11, shrinkPercent: 9, resolution: 0.15, material: 'hydrostone',
    customCavW: 130, customCavL: 70, customWallH: 28, customWallThickness: 3.5, customFlangeWidth: 12, plateThickness: 4.4,
  };
  const keys = Object.keys(DEFAULT_SPRIG_PARAMETERS);
  const differs = keys.filter((k) => (every as unknown as Record<string, unknown>)[k] !== (DEFAULT_SPRIG_PARAMETERS as unknown as Record<string, unknown>)[k]);
  check(differs.length === keys.length, `test object differs from the defaults in all ${keys.length} fields (${differs.length})`);
  const file = JSON.stringify({ app: 'VaseMaker', type: 'sprig-settings', settings: every });
  const back = mergeSprigParameters(JSON.parse(file).settings);
  const lost = keys.filter((k) => (back as unknown as Record<string, unknown>)[k] !== (every as unknown as Record<string, unknown>)[k]);
  check(lost.length === 0, `every field survives Save → JSON → Load${lost.length ? ' — lost: ' + lost.join(', ') : ''}`);
  const junk = mergeSprigParameters({ ...every, maxHeight: 'tall', heightMode: 'wobbly', rotation: 45, svg: 12 });
  check(junk.maxHeight === DEFAULT_SPRIG_PARAMETERS.maxHeight && junk.heightMode === DEFAULT_SPRIG_PARAMETERS.heightMode
    && junk.rotation === DEFAULT_SPRIG_PARAMETERS.rotation && junk.svg === DEFAULT_SPRIG_PARAMETERS.svg && junk.width === 41.5,
    'wrong-typed / out-of-list values fall back to the default, the rest load');
}

// ── I. fit ───────────────────────────────────────────────────────────────────
{
  const m = mergeSprigParameters({ onVaseAngle: 0, onVaseHandleAngle: 90 });
  check(m.onVaseAngle === -90, `old Handle At 90 + sprig at 0 → sprig at −90, beside the handle at 0 (got ${m.onVaseAngle})`);
  check(mergeSprigParameters({ onVaseAngle: 30 }).onVaseAngle === 30, 'CONTROL: without the old field the angle is left alone');
}
console.log('\nI. fit and auto-pick');
{
  const pick = (w: number, l: number) => smallestFit({ ...base, width: w, length: l });
  check(pick(30, 30) === 's60', `30×30 → ${pick(30, 30)}`);
  check(pick(100, 30) === 'long', `100×30 → ${pick(100, 30)} (Long before 140×140: smaller plate)`);
  check(pick(60, 60) === 's100', `60×60 → ${pick(60, 60)}`);
  check(pick(3, 3) === 's20' && pick(20, 20) === 's40' && pick(55, 55) === 's80', `3×3 → ${pick(3, 3)}, 20×20 → ${pick(20, 20)}, 55×55 → ${pick(55, 55)}`);
  check(pick(80, 60) === 's120', `80×60 dragonfly → ${pick(80, 60)} (the one no old size fitted)`);
  check(pick(115, 115) === null, `115×115 → ${pick(115, 115)} (140×140 holds 110 at 12% + 2×8)`);
  const legacy = [mergeSprigParameters({ moldSize: 'small' }).moldSize, mergeSprigParameters({ moldSize: 'medium' }).moldSize, mergeSprigParameters({ moldSize: 'long' }).moldSize];
  check(legacy.join() === 's60,s100,long', `old size names load as ${legacy.join(', ')}`);
  check(pick(30, 125) === null, `30×125 (tall) → ${pick(30, 125)}`);
  const m = generateSprigMold({ ...base, moldSize: 's60', width: 30, length: 125 }, ellipse);
  check(!m.fits && /Turned 90°.*Long/.test(m.warnings[0] ?? ''), `tall sprig warns and suggests turning it: "${(m.warnings[0] ?? '').slice(0, 90)}…"`);
  const box = sprigBox({ ...base, moldSize: 's60' });
  check(fitsBox(44, 44, box.cavW, box.cavL, 8) && !fitsBox(44.1, 44, box.cavW, box.cavL, 8), 'fit boundary exact at 44 + 2×8 = 60');
  void sprigLayout;
}

// ── K. antialiased outline ───────────────────────────────────────────────────
// Gary 2026-10-24: a crisp SVG showed its edge wall as stairs. The fringe read
// the ink at a cell's centre, which on a crisp edge is all or nothing. Now it
// comes from the sub-cell distance. Measure how far the half-height contour of a
// crisp disc wanders from a true circle; control = the same field without
// antialiasing (every cell all-in or all-out).
console.log('\nK. antialiased outline (control: all-or-nothing cells)');
{
  const n = 2000, R = 900;
  const px = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px[y * n + x] = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) <= R ? 0 : 255;
  const P = { ...DEFAULT_SPRIG_PARAMETERS, heightMode: 'flat' as const, maxHeight: 1, edgeSoftness: 0, minEdgeThickness: 0, width: 20, length: 20 };
  const r = buildRelief({ pixels: px, width: n, height: n }, P, 0.2);
  const rTrue = (R / n) * 20;
  const wander = (hAt: (k: number) => number) => {
    const at = (x: number, y: number) => {
      const fi = (x - r.x0) / r.step, fj = (y - r.y0) / r.step, i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j;
      const g = (ii: number, jj: number) => hAt(jj * r.nx + ii);
      return (g(i, j) * (1 - a) + g(i + 1, j) * a) * (1 - b) + (g(i, j + 1) * (1 - a) + g(i + 1, j + 1) * a) * b;
    };
    let ss = 0, cnt = 0;
    for (let d = 0; d < 360; d += 0.5) {
      const c = Math.cos((d * Math.PI) / 180), s = Math.sin((d * Math.PI) / 180);
      let prev = at(c * (rTrue - 1), s * (rTrue - 1)), rad = NaN;
      for (let q = rTrue - 1 + 0.002; q < rTrue + 1; q += 0.002) {
        const h = at(c * q, s * q);
        if (prev >= 0.5 && h < 0.5) { rad = q - 0.002 * (0.5 - h) / (prev - h); break; }
        prev = h;
      }
      ss += (rad - rTrue) ** 2; cnt++;
    }
    return Math.sqrt(ss / cnt);
  };
  const aa = wander((k) => r.heights[k]);
  const hard = wander((k) => (r.mask[k] ? 1 : 0));
  // Measured 2026-10-24: old fringe rms 0.042 = the same as no antialiasing.
  check(aa < 0.025, `antialiased edge: rms ${aa.toFixed(3)} mm off the true circle (grid 0.2)`);
  check(hard > 2 * aa, `control: all-or-nothing cells rms ${hard.toFixed(3)} mm (> 2× antialiased)`);
}

// ── K2. no teeth at the foot of a soft edge (2026-10-29) ─────────────────────
// Gary saw teeth along a wing's edge: outside cells took a share of their
// tallest inside neighbour, which follows the grid's stairs. Now every cell
// takes the edge profile averaged over the cell from its own signed distance.
// Measure how far the 0.02 mm contour of a crisp disc (Edge Softness 1)
// wanders round its mean radius. Measured: old 63 µm, new 24 µm.
console.log('\nK2. foot of a soft edge');
{
  const n = 2000, R = 900;
  const px = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px[y * n + x] = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) <= R ? 0 : 255;
  const rTrue = (R / n) * 20;
  const wanderAt = (r: ReturnType<typeof buildRelief>, level: number) => {
    const at = (x: number, y: number) => {
      const fi = (x - r.x0) / r.step, fj = (y - r.y0) / r.step, i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j;
      const g = (ii: number, jj: number) => r.heights[jj * r.nx + ii];
      return (g(i, j) * (1 - a) + g(i + 1, j) * a) * (1 - b) + (g(i, j + 1) * (1 - a) + g(i + 1, j + 1) * a) * b;
    };
    const rads: number[] = [];
    for (let d = 0; d < 360; d += 0.25) {
      const c = Math.cos((d * Math.PI) / 180), s = Math.sin((d * Math.PI) / 180);
      let prev = at(c * (rTrue - 3), s * (rTrue - 3));
      for (let q = rTrue - 3 + 0.002; q < rTrue + 1; q += 0.002) {
        const h = at(c * q, s * q);
        if (prev >= level && h < level) { rads.push(q - 0.002 * (level - h) / (prev - h)); break; }
        prev = h;
      }
    }
    const m = rads.reduce((a, b) => a + b, 0) / rads.length;
    return Math.sqrt(rads.reduce((a, b) => a + (b - m) ** 2, 0) / rads.length);
  };
  const P = { ...DEFAULT_SPRIG_PARAMETERS, heightMode: 'flat' as const, maxHeight: 3, edgeSoftness: 1, minEdgeThickness: 0, width: 20, length: 20 };
  const r = buildRelief({ pixels: px, width: n, height: n }, P, 0.2);
  const low = wanderAt(r, 0.02), high = wanderAt(r, 1);
  check(low < 0.035, `0.02 mm contour wanders ${(low * 1000).toFixed(0)} µm (was 63 before 2026-10-29)`);
  check(high < 0.015, `control: the 1 mm contour, well up the slope, ${(high * 1000).toFixed(0)} µm (unchanged, 9)`);
  check(Math.abs(r.maxHeight - 3) < 1e-6, 'Max Height still reached');

  // K3. stripes across the slope: height that is not a function of the
  // distance to the edge (median per 5 µm ring), 0–1.5 mm in. The signed
  // distance is averaged over 3 × 3 cells twice near the edge. Measured on
  // this 2000 px disc: before 2026-10-29 the distance error showed as stripes.
  const bins = new Map<number, number[]>(), cells: [number, number][] = [];
  for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) {
    const d = rTrue - Math.hypot(r.x0 + i * r.step, r.y0 + j * r.step);
    if (d < 0 || d > 1.5) continue;
    const b = Math.round(d / 0.005), h = r.heights[j * r.nx + i];
    (bins.get(b) ?? bins.set(b, []).get(b)!).push(h); cells.push([b, h]);
  }
  const med = new Map<number, number>();
  bins.forEach((v, b) => { v.sort((a, c) => a - c); med.set(b, v[v.length >> 1]); });
  let ss = 0;
  for (const [b, h] of cells) ss += (h - med.get(b)!) ** 2;
  const stripes = Math.sqrt(ss / cells.length);
  check(stripes < 0.014, `K3 stripes across the slope ${(stripes * 1000).toFixed(1)} µm rms (limit 14; 23.8 without the averaging)`);
}

// ── F3. Min Thickness (2026-10-29) ───────────────────────────────────────────
// Gary: a dragonfly tail's narrow joints sat almost on the plate. Two 8 mm
// blobs joined by a 1.2 mm neck, Inflate, 20 × 10 mm: the neck's middle rises
// with Min Thickness, the blobs' tops do not move, and 0 changes nothing.
console.log('\nF3. Min Thickness');
{
  const dumbbell = image(400, 200, (x, y) => (Math.hypot(x - 100, y - 100) < 80 || Math.hypot(x - 300, y - 100) < 80 || (x > 100 && x < 300 && Math.abs(y - 100) < 12) ? 1 : 0));
  const P = { ...DEFAULT_SPRIG_PARAMETERS, heightMode: 'inflate' as const, maxHeight: 3, roundness: 3, edgeSoftness: 1, width: 20, length: 10 };
  const at = (r: ReturnType<typeof buildRelief>, x: number, y: number) => r.heights[Math.round((y - r.y0) / r.step) * r.nx + Math.round((x - r.x0) / r.step)];
  const r0 = buildRelief(dumbbell, P, 0.2), r1 = buildRelief(dumbbell, { ...P, minThickness: 1 }, 0.2);
  const neck0 = at(r0, 0, 0), neck1 = at(r1, 0, 0);
  check(neck0 < 0.75, `without it the neck is low: ${neck0.toFixed(2)} mm`);
  check(neck1 > 0.8 && neck1 <= 1.0001 && neck1 - neck0 > 0.2, `Min Thickness 1: the neck rises to ${neck1.toFixed(2)} mm`);
  check(Math.abs(at(r1, -5, 0) - at(r0, -5, 0)) < 1e-6, `control: a blob's top is unchanged (${at(r0, -5, 0).toFixed(2)} mm)`);
  check(at(r1, 0, 3) === 0 && at(r0, 0, 3) === 0, 'control: off the shape stays plate');
  const rDef = buildRelief(dumbbell, { ...P, minThickness: 0 }, 0.2);
  check(rDef.heights.every((v, k) => v === r0.heights[k]), 'Min Thickness 0 = byte-identical');
}

// ── F4. Trim Below (2026-10-29) ──────────────────────────────────────────────
// Gary's MakerWorld relief kept near-flat ledges where legs met the body. In
// Gray, a part lower than Trim Below is cut away and the outline follows.
// A 2 mm-tall block (black) with a 0.2 mm-tall flat ledge (light grey) beside it.
console.log('\nF4. Trim Below');
{
  const img = image(400, 200, (x, y) => (x >= 60 && x < 240 && y >= 40 && y < 160 ? 1 : x >= 240 && x < 340 && y >= 70 && y < 130 ? 0.1 : 0));
  const P = { ...DEFAULT_SPRIG_PARAMETERS, heightMode: 'gray' as const, maxHeight: 2, edgeSoftness: 0, imageLightest: 0, width: 20, length: 10 };
  const at = (r: ReturnType<typeof buildRelief>, x: number, y: number) => r.heights[Math.round((y - r.y0) / r.step) * r.nx + Math.round((x - r.x0) / r.step)];
  const r0 = buildRelief(img, P, 0.2), r1 = buildRelief(img, { ...P, trimBelow: 0.3 }, 0.2), rLow = buildRelief(img, { ...P, trimBelow: 0.1 }, 0.2);
  check(at(r0, 4.5, 0) > 0.15, `without it the ledge is there: ${at(r0, 4.5, 0).toFixed(2)} mm`);
  check(at(r1, 4.5, 0) === 0, 'Trim Below 0.3: the 0.2 mm ledge is cut away');
  check(at(rLow, 4.5, 0) > 0.15, 'control: Trim Below 0.1 keeps it');
  check(Math.abs(at(r1, -2, 0) - at(r0, -2, 0)) < 1e-6, `control: the block is untouched (${at(r0, -2, 0).toFixed(2)} mm)`);
  const rInf = buildRelief(img, { ...P, heightMode: 'inflate' as const, trimBelow: 0.3 }, 0.2), rInf0 = buildRelief(img, { ...P, heightMode: 'inflate' as const }, 0.2);
  check(rInf.heights.every((v, k) => v === rInf0.heights[k]), 'control: Inflate ignores it');
  const rOff = buildRelief(img, { ...P, trimBelow: 0 }, 0.2);
  check(rOff.heights.every((v, k) => v === r0.heights[k]), 'Trim Below 0 = byte-identical');
}

// ── F5. Widen (2026-10-29) ───────────────────────────────────────────────────
// Gary: Thicken widened a relief's tail "only at the bottom". A round 8 mm
// body with a tail whose width wanders 1.4–2.0 mm, domed across in Gray
// (ink 1 on the centre line, 0.3 at the edge); 0.05 mm per pixel.
console.log('\nF5. Widen');
{
  const hw = (y: number) => 17 + 3 * Math.sin((2 * Math.PI * y) / 60);
  const tail = image(400, 500, (x, y) => {
    if (Math.hypot(x - 200, y - 100) < 80) return 1;
    const h = hw(y), u = Math.abs(x - 200) / h;
    return y > 150 && y < 470 && u < 1 ? 0.3 + 0.7 * (1 - u * u) : 0;
  });
  const P: SprigParameters = { ...base, heightMode: 'gray', imageLightest: 0, maxHeight: 2, edgeSoftness: 0, minFeatureWidth: 2.2, width: 20, length: 25, resolution: 0.1 };
  const st = P.resolution / S;
  const r0 = buildRelief(tail, P, st), r1 = buildRelief(tail, { ...P, widen: 2.5 }, st);
  const at = (r: ReturnType<typeof buildRelief>, x: number, y: number) => {
    const i = Math.round((x - r.x0) / r.step), j = Math.round((y - r.y0) / r.step);
    return i >= 0 && j >= 0 && i < r.nx && j < r.ny ? r.heights[j * r.nx + i] : 0;
  };
  // Image y (px, down) → relief y (mm, up): the drawing is centred, 25 mm tall.
  const Y = (py: number) => 12.5 - py * 0.05;
  const widths = (r: ReturnType<typeof buildRelief>) => {
    const w: number[] = [];
    for (let py = 200; py <= 440; py += 4) { let n = 0; for (let x = -3; x <= 3; x += r.step) if (at(r, x, Y(py)) > 0) n++; w.push(n * r.step); }
    return w;
  };
  const w0 = widths(r0), w1 = widths(r1);
  const span = (a: number[]) => `${Math.min(...a).toFixed(2)}–${Math.max(...a).toFixed(2)}`;
  check(Math.max(...w0) - Math.min(...w0) > 0.45, `without it the tail wanders: ${span(w0)} mm`);
  check(Math.min(...w1) >= 2.35 && Math.max(...w1) <= 2.85 && Math.max(...w1) - Math.min(...w1) <= 0.25, `Widen 2.5: one even width, ${span(w1)} mm`);
  // Domed, not a skirt: across each row the height falls off from the centre.
  let domed = true, worst = '';
  for (let py = 200; py <= 440; py += 8) {
    const c = at(r1, 0, Y(py)), m = at(r1, 0.6, Y(py)), m2 = at(r1, -0.6, Y(py)), e = at(r1, 1.05, Y(py));
    if (!(c > m + 0.1 && c > m2 + 0.1 && m > e)) { domed = false; worst = `row ${py}: ${c.toFixed(2)} ${m.toFixed(2)} ${e.toFixed(2)}`; }
  }
  check(domed, `the dome is stretched across, not a skirt added ${worst}`);
  let peak0 = 0, peak1 = 0;
  for (let py = 200; py <= 440; py += 4) { peak0 = Math.max(peak0, at(r0, 0, Y(py))); peak1 = Math.max(peak1, at(r1, 0, Y(py))); }
  check(Math.abs(peak1 - peak0) < 0.05, `the tail's top keeps its height: ${peak0.toFixed(2)} → ${peak1.toFixed(2)} mm`);
  // The body: every cell more than 1.5 mm from the tail's join is the same.
  let diff = 0, n = 0;
  for (let y = Y(30); y >= Y(150); y -= r0.step) for (let x = -4.5; x <= 4.5; x += r0.step) {
    if (Math.abs(x) < 2 && y < Y(150) + 2) continue;
    n++; diff = Math.max(diff, Math.abs(at(r1, x, y) - at(r0, x, y)));
  }
  check(diff < 1e-6, `control: the 8 mm body is untouched (${n} cells, max diff ${diff.toExponential(1)})`);
  check(r0.thinSpots >= 1 && r1.thinSpots === 0 && r1.pieces === 1, `thin spots ${r0.thinSpots} → ${r1.thinSpots}, one piece`);
  // The join: from the body down the tail, the width only narrows, then holds
  // (the thin-part check stops short of the body; a step was seen there).
  const join: number[] = [];
  for (let py = 160; py <= 230; py += 2) { let n = 0; for (let x = -4; x <= 4; x += r1.step) if (at(r1, x, Y(py)) > 0) n++; join.push(n * r1.step); }
  let rises = 0;
  for (let k = 1; k < join.length; k++) if (join[k] > join[k - 1] + 0.11) rises++;
  check(rises === 0 && Math.min(...join) >= 2.35, `no step at the join: ${join.filter((_, k) => k % 5 === 0).map((w) => w.toFixed(1)).join(' ')} mm`);
  // A serrated edge (teeth too small for the red check) is left alone; the leg still widens.
  const teeth = image(400, 400, (x, y) => {
    const dx = x - 200, dy = y - 190, r = Math.hypot(dx, dy);
    const ph = ((Math.atan2(dy, dx) / (2 * Math.PI)) * 48 + 48) % 1;
    const tooth = 8 * Math.max(0, 1 - Math.abs(ph - 0.5) / 0.07);
    return r < 150 + tooth || (x >= 190 && x < 210 && y > 300) ? 1 : 0;
  });
  const tP: SprigParameters = { ...base, heightMode: 'flat', width: 20, length: 20, resolution: 0.1 };
  const t0 = buildRelief(teeth, tP, st), t1 = buildRelief(teeth, { ...tP, widen: 1.5 }, st);
  let rim = 0, legN = 0;
  for (let y = -10; y <= 10; y += t0.step) for (let x = -10; x <= 10; x += t0.step) {
    if (!(at(t1, x, y) > 0) || at(t0, x, y) > 0) continue;
    if (Math.abs(x) < 1.5 && y < -6.5) legN++; else rim++;
  }
  check(rim === 0 && legN > 0, `serrated edge left alone, leg widened: ${rim} cells added round the rim, ${legN} on the leg`);
  // A part already wider than the target is left alone.
  const bar = image(200, 400, (x) => (x >= 40 && x < 100 ? 1 : 0));
  const bP: SprigParameters = { ...P, width: 10, length: 20 };
  const b0 = buildRelief(bar, bP, st), b1 = buildRelief(bar, { ...bP, widen: 2.5 }, st);
  let bd = 0;
  for (let y = -9; y <= 9; y += b0.step) for (let x = -5; x <= 5; x += b0.step) bd = Math.max(bd, Math.abs(at(b1, x, y) - at(b0, x, y)));
  check(bd < 1e-6, `control: a 3 mm bar is left alone at Widen 2.5 (max diff ${bd.toExponential(1)})`);
  const rOff = buildRelief(tail, { ...P, widen: 0 }, st);
  const old = { ...P } as SprigParameters; delete (old as Partial<SprigParameters>).widen;
  const rOld = buildRelief(tail, old, st);
  check(rOff.heights.every((v, k) => v === r0.heights[k]) && rOld.heights.every((v, k) => v === r0.heights[k]), 'Widen 0, and a design without it = byte-identical');
}
// ── L. text (2026-10-25) ─────────────────────────────────────────────────────
// A stand-in for rendered text: three solid bars "III", 30 × 10 mm. Fonts need a
// browser; everything after the picture is the same code.
console.log('\nL. text layer');
{
  const bars = (barPx: number): TextLayer => ({
    ...image(300, 100, (x) => ([60, 150, 240].some((c) => Math.abs(x - c) < barPx / 2) ? 1 : 0)), mmW: 30, mmH: 10,
  });
  const III = bars(40);   // 4 mm bars, 5 mm apart
  const at = (r: ReturnType<typeof buildRelief>, x: number, y: number) =>
    r.heights[Math.round((y - r.y0) / r.step) * r.nx + Math.round((x - r.x0) / r.step)];
  const P: SprigParameters = { ...base, width: 30, length: 20, heightMode: 'flat', maxHeight: 3, text: 'III', textDepth: 1.2, textGap: 3 };
  const st = 0.2;

  // Below, raised.
  {
    const r = buildRelief(ellipse, P, st, III), pl = sprigPlacement(P, { w: 30, h: 10 });
    check(Math.abs(r.footL - 33) < 1e-9 && Math.abs(r.footW - 30) < 1e-9, `footprint grows to hold the text: ${r.footW} × ${r.footL} (want 30 × 33)`);
    check(Math.abs(at(r, pl.tx - 9, pl.ty) - 1.2) < 0.01, `raised letter stands Raise high: ${at(r, pl.tx - 9, pl.ty).toFixed(3)} (want 1.2)`);
    check(at(r, pl.tx - 4.5, pl.ty) === 0, 'CONTROL: between letters is plate (0)');
    check(at(r, pl.tx, pl.dy - 10 - 1.5) === 0 && at(r, pl.dx, pl.dy) > 2.9, `gap between drawing and text is empty; drawing still ${at(r, pl.dx, pl.dy).toFixed(2)} high`);
    const top = pl.ty + 5, bottom = pl.dy - 10;
    check(Math.abs(bottom - top - 3) < 1e-9, `text top sits Gap (3 mm) below the drawing: ${(bottom - top).toFixed(3)}`);
  }
  // Positions land on the right side.
  {
    const side = (pos: SprigParameters['textPosition']) => { const q = sprigPlacement({ ...P, textPosition: pos }, { w: 30, h: 10 }); return [Math.sign(Math.round(q.tx - q.dx)), Math.sign(Math.round(q.ty - q.dy))].join(','); };
    const got = ['below', 'above', 'left', 'right', 'over'].map((k) => side(k as SprigParameters['textPosition']));
    check(got.join(' ') === '0,-1 0,1 -1,0 1,0 0,0', `below/above/left/right/on top: ${got.join(' ')}`);
  }
  // On top of the drawing: adds to it.
  {
    const q = { ...P, textPosition: 'over' as const };
    const r = buildRelief(ellipse, q, st, III), pl = sprigPlacement(q, { w: 30, h: 10 });
    check(Math.abs(at(r, pl.tx - 9, pl.ty) - 4.2) < 0.01, `on top: letter stands on the drawing, ${at(r, pl.tx - 9, pl.ty).toFixed(3)} (want 3 + 1.2)`);
  }
  // Cut into a plaque, with the depth clamped above the sheet's floor.
  {
    const q = { ...P, textStyle: 'cut' as const, backing: 'plaque' as const, backingThickness: 2, textDepth: 1 };
    const r = buildRelief(ellipse, q, st, III), pl = sprigPlacement(q, { w: 30, h: 10 });
    check(Math.abs(at(r, pl.tx - 9, pl.ty) - 1) < 0.01, `cut in: sheet 2 − depth 1 = ${at(r, pl.tx - 9, pl.ty).toFixed(3)}`);
    check(Math.abs(at(r, pl.tx - 4.5, pl.ty) - 2) < 0.01, `CONTROL: sheet between letters ${at(r, pl.tx - 4.5, pl.ty).toFixed(3)} (want 2)`);
    const deep = buildRelief(ellipse, { ...q, textDepth: 3 }, st, III);
    check(Math.abs(at(deep, pl.tx - 9, pl.ty) - 0.4) < 0.01, `depth 3 into a 2 mm sheet stops 0.4 mm above the bottom: ${at(deep, pl.tx - 9, pl.ty).toFixed(3)}`);
    check(r.pieces === 1, `cut letters are holes, not pieces: ${r.pieces} piece`);
    const m = generateSprigMold({ ...q, backing: 'none' }, ellipse, III);
    check(m.warnings.some((w) => /Cut In/.test(w)), 'cut with no backing warns');
  }
  // Text alone; not rotated with the drawing; letters joined by an Outline sheet.
  {
    const alone = { ...P, drawingOn: false };
    const r = buildRelief(ellipse, alone, st, III);
    check(Math.abs(r.footW - 30) < 1e-9 && Math.abs(r.footL - 10) < 1e-9 && Math.abs(r.maxHeight - 1.2) < 0.01, `text alone: ${r.footW} × ${r.footL}, max ${r.maxHeight.toFixed(2)} (want 30 × 10, 1.2)`);
    check(r.pieces === 3, `three loose letters = ${r.pieces} pieces`);
    const joined = buildRelief(ellipse, { ...alone, backing: 'outline', backingThickness: 1 }, st, III);
    check(joined.pieces === 1, `Outline backing joins them: ${joined.pieces} piece`);
    const turned = { ...P, rotation: 90 as const };
    const rt = buildRelief(ellipse, turned, st, III), pt = sprigPlacement(turned, { w: 30, h: 10 });
    check(Math.abs(at(rt, pt.tx - 9, pt.ty + 3) - 1.2) < 0.01 && Math.abs(at(rt, pt.tx - 9, pt.ty - 3) - 1.2) < 0.01 && at(rt, pt.tx - 4.5, pt.ty) === 0,
      'Rotate 90 turns the drawing, not the text (bars still upright)');
    const thin = buildRelief(ellipse, alone, st, bars(8));   // 0.8 mm strokes
    check(thin.thinSpots > 0, `0.8 mm letter strokes show as thin parts: ${thin.thinSpots} spots`);
    check(buildRelief(ellipse, alone, st, III).thinSpots === 0, 'CONTROL: 4 mm strokes are not thin');
  }
  // Mold fit counts the text.
  {
    const q = { ...base, width: 38, length: 38, text: 'III', textGap: 3 };
    const a = smallestFit(q), b = smallestFit(q, { w: 30, h: 10 });
    check(a === 's60' && b === 's80', `38 × 38 alone fits ${a}; with 10 mm of text below, ${b}`);
  }
}

// ── N. No clay inside the drawing (a user, 2026-10-28) ───────────────────────
{
  const st = base.resolution / S;
  const p = { ...base, width: 40, length: 40, heightMode: 'flat' as const };
  const ring = (x: number, y: number) => { const r = Math.hypot(x - 200, y - 200); return r < 199 && r > 60 ? 1 : 0; };
  const donut = image(400, 400, ring);
  const slit = image(400, 400, (x, y) => (ring(x, y) && !(Math.abs(y - 200) < 10 && x > 200) ? 1 : 0));
  const two = image(400, 400, (x, y) => (Math.hypot(x - 200, y - 200) < 199 && Math.hypot(x - 120, y - 200) > 40 && Math.hypot(x - 280, y - 200) > 40 ? 1 : 0));
  check(buildRelief(donut, p, st).bareHoles === 1, 'a ring has 1 bare spot inside');
  check(buildRelief(two, p, st).bareHoles === 2, 'a disc with two holes has 2');
  check(buildRelief(disc, p, st).bareHoles === 0, 'CONTROL: a solid disc has none');
  check(buildRelief(slit, p, st).bareHoles === 0, 'CONTROL: a ring slit open to the outside has none (it is background)');
  check(buildRelief(donut, { ...p, backing: 'plaque', backingThickness: 1 }, st).bareHoles === 0, 'CONTROL: a Plaque under the ring fills it — none');
  const O = { ...donut, mmW: 10, mmH: 10 } as TextLayer;
  const withO = buildRelief(disc, { ...p, text: 'O' }, st, O);
  check(withO.pieces === 2 && withO.bareHoles === 0, `CONTROL: a raised O below the disc (${withO.pieces} pieces) — its inside is not counted`);
  const m = generateSprigMold(p, donut);
  check(m.warnings.some((w) => w.startsWith('1 spot inside the drawing has no clay')), 'the generator warns about it');
  const n = m.relief.nx * m.relief.ny;
  let clayIn = 0, clayOut = 0;
  for (let k = 0; k < m.plate.vertexCount; k++) if (m.clayFlags[k]) { if (k < n) clayIn++; else clayOut++; }
  check(clayIn > 0 && clayOut === 0, `clay colour: ${clayIn} relief vertices, none on the plate frame or seal ridges`);
}

console.log(`\n${ok ? 'ALL PASS' : 'SOME CHECKS FAILED'} (${passes} passed)`);
process.exit(ok ? 0 : 1);
