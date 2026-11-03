/**
 * Locate + RENDER the paper-thin surfaces on the master, in RAW (uncentered)
 * master coordinates so they can be named against the geometry that made them.
 *
 * Metric is the one from verify-handle-fins.ts: a surface triangle counts as a
 * fin when it is EXPOSED (not buried inside another solid) and the ray inward
 * leaves the UNION within THIN mm.
 *
 * Usage: npx tsx --tsconfig tsconfig.json finmap.ts <params.json> <out.ppm> [az el zoom cx cy cz]
 */
import { readFileSync, writeFileSync } from 'fs';
import { DEFAULT_HANDLE_PARAMETERS, mergeHandleParameters, type HandleParameters } from '@/engine/handle/handle-types';
import { sampleSpine } from '@/engine/handle/spine';
import { buildMasterParts, setSectionSegments, type HandleBodyDims } from '@/engine/handle/handle-mesh';
import { mergeMeshes } from '@/engine/mold/ring-mesh';
import type { VaseMesh } from '@/engine/types';

const THIN = 0.25, MAXT = 4, CELL = 3;
type V3 = [number, number, number];

const file = process.argv[2];
const out = process.argv[3] ?? '';
const az = Number(process.argv[4] ?? 230) * Math.PI / 180;
const el = Number(process.argv[5] ?? -25) * Math.PI / 180;
const zoom = Number(process.argv[6] ?? 26);
const focus = process.argv[7] ? process.argv.slice(7, 10).map(Number) : null;

let p: HandleParameters = DEFAULT_HANDLE_PARAMETERS;
if (file && file !== '-') {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  p = mergeHandleParameters(raw.settings ?? raw.params ?? raw);  // as Load Settings does: old files get every new default
}
const S = 1 + p.shrinkPercent / 100;
const dims: HandleBodyDims = {
  hw: (p.width * S) / 2, ht: (p.thickness * S) / 2,
  openR: p.openingDiameter / 2, cylLen: p.cylinderLength, coneLen: p.coneLength,
};
const shellT = Math.max(1, Math.min(p.masterShellThickness, Math.min(dims.hw, dims.ht) - 0.55));
setSectionSegments(p.sectionSegments);
const stations = sampleSpine(p.spinePoints, p.spineTypes, Math.round(p.spineSamples), S);
const parts = buildMasterParts(stations, dims, { seat: p.seatDepth, hollow: true, shellT, ribWidth: p.ribWidth, ribCount: p.ribCount, ribSlot: p.ribSlot });
const master: VaseMesh = mergeMeshes([parts.body, parts.wellA, parts.wellB]);

// ── fin detection (verify-handle-fins metric) ──
const n = master.indices.length / 3;
const parent = new Int32Array(master.vertexCount);
for (let i = 0; i < parent.length; i++) parent[i] = i;
const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
const uni = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) parent[x] = y; };
for (let t = 0; t < master.indices.length; t += 3) { uni(master.indices[t], master.indices[t + 1]); uni(master.indices[t + 1], master.indices[t + 2]); }
const label = new Map<number, number>();
const solid = new Int32Array(n);
for (let t = 0; t < n; t++) {
  const r = find(master.indices[t * 3]);
  let l = label.get(r);
  if (l === undefined) { l = label.size; label.set(r, l); }
  solid[t] = l;
}
const count = label.size;

const A = new Float64Array(n * 3), B = new Float64Array(n * 3), C = new Float64Array(n * 3);
const N = new Float64Array(n * 3), cen = new Float64Array(n * 3), area = new Float64Array(n);
const lo3 = new Float64Array(n * 3), hi3 = new Float64Array(n * 3);
{
  const P = master.positions;
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const i = master.indices[t * 3 + k] * 3;
      const dst = k === 0 ? A : k === 1 ? B : C;
      dst[t * 3] = P[i]; dst[t * 3 + 1] = P[i + 1]; dst[t * 3 + 2] = P[i + 2];
    }
    const e1 = [B[t * 3] - A[t * 3], B[t * 3 + 1] - A[t * 3 + 1], B[t * 3 + 2] - A[t * 3 + 2]];
    const e2 = [C[t * 3] - A[t * 3], C[t * 3 + 1] - A[t * 3 + 1], C[t * 3 + 2] - A[t * 3 + 2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const L = Math.hypot(cr[0], cr[1], cr[2]) || 1e-15;
    for (let c = 0; c < 3; c++) {
      N[t * 3 + c] = cr[c] / L;
      cen[t * 3 + c] = (A[t * 3 + c] + B[t * 3 + c] + C[t * 3 + c]) / 3;
      lo3[t * 3 + c] = Math.min(A[t * 3 + c], B[t * 3 + c], C[t * 3 + c]);
      hi3[t * 3 + c] = Math.max(A[t * 3 + c], B[t * 3 + c], C[t * 3 + c]);
    }
    area[t] = L / 2;
  }
}
// uniform grid
const gLo: V3 = [1e9, 1e9, 1e9], gHi: V3 = [-1e9, -1e9, -1e9];
for (let t = 0; t < n; t++) for (let c = 0; c < 3; c++) { gLo[c] = Math.min(gLo[c], lo3[t * 3 + c]); gHi[c] = Math.max(gHi[c], hi3[t * 3 + c]); }
for (let c = 0; c < 3; c++) { gLo[c] -= 1; gHi[c] += 1; }
const dim: [number, number, number] = [
  Math.max(1, Math.ceil((gHi[0] - gLo[0]) / CELL)),
  Math.max(1, Math.ceil((gHi[1] - gLo[1]) / CELL)),
  Math.max(1, Math.ceil((gHi[2] - gLo[2]) / CELL)),
];
const nCells = dim[0] * dim[1] * dim[2];
const start = new Int32Array(nCells + 1);
const range = (t: number) => {
  const r: number[] = [];
  for (let c = 0; c < 3; c++) r.push(
    Math.max(0, Math.floor((lo3[t * 3 + c] - gLo[c]) / CELL)),
    Math.min(dim[c] - 1, Math.floor((hi3[t * 3 + c] - gLo[c]) / CELL)));
  return r;
};
for (let t = 0; t < n; t++) { const [x0, x1, y0, y1, z0, z1] = range(t); for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) start[(z * dim[1] + y) * dim[0] + x + 1]++; }
for (let i = 0; i < nCells; i++) start[i + 1] += start[i];
const items = new Int32Array(start[nCells]);
const cursor = start.slice(0, nCells);
for (let t = 0; t < n; t++) { const [x0, x1, y0, y1, z0, z1] = range(t); for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) items[cursor[(z * dim[1] + y) * dim[0] + x]++] = t; }
const stampArr = new Int32Array(n); let gen = 0;
function candidates(o: V3, d: V3, maxT: number, outArr: number[]): void {
  outArr.length = 0; gen++;
  const cell: number[] = [], step: number[] = [], tMax: number[] = [], tDel: number[] = [];
  for (let c = 0; c < 3; c++) {
    const ci = Math.max(0, Math.min(dim[c] - 1, Math.floor((o[c] - gLo[c]) / CELL)));
    cell.push(ci);
    if (Math.abs(d[c]) < 1e-12) { step.push(0); tMax.push(Infinity); tDel.push(Infinity); continue; }
    const s = d[c] > 0 ? 1 : -1;
    step.push(s);
    tMax.push((gLo[c] + (ci + (s > 0 ? 1 : 0)) * CELL - o[c]) / d[c]);
    tDel.push(CELL / Math.abs(d[c]));
  }
  for (;;) {
    const idx = (cell[2] * dim[1] + cell[1]) * dim[0] + cell[0];
    for (let i = start[idx]; i < start[idx + 1]; i++) { const t = items[i]; if (stampArr[t] !== gen) { stampArr[t] = gen; outArr.push(t); } }
    let ax = 0;
    if (tMax[1] < tMax[ax]) ax = 1;
    if (tMax[2] < tMax[ax]) ax = 2;
    if (tMax[ax] > maxT || step[ax] === 0) break;
    cell[ax] += step[ax];
    if (cell[ax] < 0 || cell[ax] >= dim[ax]) break;
    tMax[ax] += tDel[ax];
  }
}
function rayTri(t: number, o: V3, d: V3): number | null {
  const i = t * 3;
  const e1x = B[i] - A[i], e1y = B[i + 1] - A[i + 1], e1z = B[i + 2] - A[i + 2];
  const e2x = C[i] - A[i], e2y = C[i + 1] - A[i + 1], e2z = C[i + 2] - A[i + 2];
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-13) return null;
  const inv = 1 / det;
  const tvx = o[0] - A[i], tvy = o[1] - A[i + 1], tvz = o[2] - A[i + 2];
  const u = (tvx * px + tvy * py + tvz * pz) * inv;
  if (u < -1e-9 || u > 1 + 1e-9) return null;
  const qx = tvy * e1z - tvz * e1y, qy = tvz * e1x - tvx * e1z, qz = tvx * e1y - tvy * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < -1e-9 || u + v > 1 + 1e-9) return null;
  const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return tt > 1e-6 ? tt : null;
}

const isFin = new Uint8Array(n);
const cand: number[] = [];
const firstT = new Float64Array(count), firstEnter = new Uint8Array(count);
let finArea = 0;
const bySolid = new Float64Array(count);
for (let t = 0; t < n; t++) {
  if (area[t] < 1e-10) continue;
  const nn: V3 = [N[t * 3], N[t * 3 + 1], N[t * 3 + 2]];
  const o: V3 = [cen[t * 3] + nn[0] * 1e-4, cen[t * 3 + 1] + nn[1] * 1e-4, cen[t * 3 + 2] + nn[2] * 1e-4];
  firstT.fill(Infinity);
  candidates(o, nn, 1e9, cand);
  for (const q of cand) {
    if (solid[q] === solid[t]) continue;
    const tt = rayTri(q, o, nn);
    if (tt === null || tt >= firstT[solid[q]]) continue;
    firstT[solid[q]] = tt;
    firstEnter[solid[q]] = (N[q * 3] * nn[0] + N[q * 3 + 1] * nn[1] + N[q * 3 + 2] * nn[2]) < 0 ? 1 : 0;
  }
  let buried = false;
  for (let s = 0; s < count; s++) if (s !== solid[t] && firstT[s] < Infinity && !firstEnter[s]) { buried = true; break; }
  if (buried) continue;
  const din: V3 = [-nn[0], -nn[1], -nn[2]];
  candidates(o, din, MAXT, cand);
  const ev: { t: number; e: number }[] = [];
  for (const q of cand) {
    const tt = rayTri(q, o, din);
    if (tt === null || tt > MAXT) continue;
    ev.push({ t: tt, e: (N[q * 3] * din[0] + N[q * 3 + 1] * din[1] + N[q * 3 + 2] * din[2]) < 0 ? 1 : -1 });
  }
  ev.sort((a, b) => a.t - b.t);
  let depth = 1;
  for (const e of ev) {
    depth += e.e;
    if (depth > 0) continue;
    if (e.t < THIN) { isFin[t] = 1; finArea += area[t]; bySolid[solid[t]] += area[t]; }
    break;
  }
}

// ── report, clustered by x plane ──
const solidNames = ['?', '?', '?', '?', '?', '?'];
{
  // name solids by their x extent: body spans the widest x, wells sit at low x
  for (let s = 0; s < count; s++) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let t = 0; t < n; t++) if (solid[t] === s) { x0 = Math.min(x0, lo3[t * 3]); x1 = Math.max(x1, hi3[t * 3]); y0 = Math.min(y0, lo3[t * 3 + 1]); y1 = Math.max(y1, hi3[t * 3 + 1]); }
    solidNames[s] = `solid${s} x[${x0.toFixed(1)},${x1.toFixed(1)}] y[${y0.toFixed(1)},${y1.toFixed(1)}]`;
  }
}
console.log(`fin area ${finArea.toFixed(3)} mm2 over ${count} solids`);
for (let s = 0; s < count; s++) if (bySolid[s] > 1e-9) console.log(`  ${bySolid[s].toFixed(3)} mm2  ${solidNames[s]}`);
const buckets = new Map<string, { a: number; z0: number; z1: number; y0: number; y1: number }>();
for (let t = 0; t < n; t++) {
  if (!isFin[t]) continue;
  const k = (Math.round(cen[t * 3] * 4) / 4).toFixed(2);
  const b = buckets.get(k) ?? { a: 0, z0: 1e9, z1: -1e9, y0: 1e9, y1: -1e9 };
  b.a += area[t];
  b.z0 = Math.min(b.z0, cen[t * 3 + 2]); b.z1 = Math.max(b.z1, cen[t * 3 + 2]);
  b.y0 = Math.min(b.y0, cen[t * 3 + 1]); b.y1 = Math.max(b.y1, cen[t * 3 + 1]);
  buckets.set(k, b);
}
console.log('fin area by RAW x plane (x=0 is the vase wall):');
[...buckets.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([k, b]) =>
  console.log(`  x=${k.padStart(7)}  ${b.a.toFixed(3).padStart(7)} mm2  y[${b.y0.toFixed(1)},${b.y1.toFixed(1)}] z[${b.z0.toFixed(2)},${b.z1.toFixed(2)}]`));

if (!out) process.exit(0);

// ── render: fins bright red, everything else per-solid ──
const W = 1100, H = 900;
const zbuf = new Float64Array(W * H).fill(Infinity);
const img = new Uint8Array(W * H * 3);
const dirv = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
const crossV = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normV = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const right = normV(crossV(dirv, [0, 0, 1]));
const up = normV(crossV(right, dirv));
let cx = 0, cy = 0, cz = 0;
if (focus) [cx, cy, cz] = focus;
else { for (let t = 0; t < n; t++) { cx += cen[t * 3]; cy += cen[t * 3 + 1]; cz += cen[t * 3 + 2]; } cx /= n; cy /= n; cz /= n; }
const light = normV([-0.4, -0.5, 0.75]);
const palette: [number, number, number][] = [[90, 120, 200], [220, 130, 60], [60, 190, 130], [200, 200, 90], [150, 90, 200], [90, 200, 200]];
const proj = (x: number, y: number, z: number): [number, number, number] => {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  return [W / 2 + (dx * right[0] + dy * right[1] + dz * right[2]) * zoom,
    H / 2 - (dx * up[0] + dy * up[1] + dz * up[2]) * zoom,
    dx * dirv[0] + dy * dirv[1] + dz * dirv[2]];
};
for (let t = 0; t < n; t++) {
  const P0 = proj(A[t * 3], A[t * 3 + 1], A[t * 3 + 2]);
  const P1 = proj(B[t * 3], B[t * 3 + 1], B[t * 3 + 2]);
  const P2 = proj(C[t * 3], C[t * 3 + 1], C[t * 3 + 2]);
  let lam = Math.abs(N[t * 3] * light[0] + N[t * 3 + 1] * light[1] + N[t * 3 + 2] * light[2]);
  lam = 0.35 + 0.65 * lam;
  const base = isFin[t] ? ([255, 40, 40] as [number, number, number]) : palette[solid[t] % palette.length];
  const x0 = Math.max(0, Math.floor(Math.min(P0[0], P1[0], P2[0])));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(P0[0], P1[0], P2[0])));
  const y0 = Math.max(0, Math.floor(Math.min(P0[1], P1[1], P2[1])));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(P0[1], P1[1], P2[1])));
  const den = (P1[1] - P2[1]) * (P0[0] - P2[0]) + (P2[0] - P1[0]) * (P0[1] - P2[1]);
  if (Math.abs(den) < 1e-12) continue;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const l1 = ((P1[1] - P2[1]) * (px + 0.5 - P2[0]) + (P2[0] - P1[0]) * (py + 0.5 - P2[1])) / den;
    const l2 = ((P2[1] - P0[1]) * (px + 0.5 - P2[0]) + (P0[0] - P2[0]) * (py + 0.5 - P2[1])) / den;
    const l3 = 1 - l1 - l2;
    if (l1 < 0 || l2 < 0 || l3 < 0) continue;
    const d = l1 * P0[2] + l2 * P1[2] + l3 * P2[2];
    const k = py * W + px;
    // fins win ties so a coincident sheet is never hidden by its host
    if (d >= zbuf[k] - (isFin[t] ? 0.02 : 0)) continue;
    zbuf[k] = d;
    img[k * 3] = Math.min(255, base[0] * lam);
    img[k * 3 + 1] = Math.min(255, base[1] * lam);
    img[k * 3 + 2] = Math.min(255, base[2] * lam);
  }
}
writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), Buffer.from(img)]));
console.log(`wrote ${out}`);
