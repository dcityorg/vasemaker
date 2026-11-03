/**
 * Bottom Mark phase 4 — the mark on Pour 3-Pc's master (the center piece).
 *   npx tsx --tsconfig tsconfig.json tests/checks/verify-bottom-3pc.ts
 * (No-mark byte-identity against the previous commit: hash-3pc.ts, run at both.)
 *
 * A  the center is closed + consistently wound with a mark, as it is without
 * S  with a mark, the shells and the plaster block are byte-identical
 * U  the undercut flags are unchanged (the mark is exempt like the foot)
 * C  the F test: turned upright, the master's bottom reads F from below — the
 *    cast piece's bottom is the master's — with two negative controls
 * D  an impressed mark takes plastic out of the master, about the F's volume
 * E  notes: a deep mark thickens the floor (says so), raised with Foot off, off the bottom
 * H  a 6 mm foot + 0.7 mm mark (Gary 2026-10-27): vertical ray probes find the
 *    full depth on the master's bottom and ≥ 0.6 mm of floor over it; Wall-sized
 *    foot + mark leaves the floor at Wall (no note)
 */
import { applyPreset } from '@/presets';
import { BUILT_IN_PRESETS } from '@/config/presets';
import { DEFAULT_MOLD_PARAMETERS, type MoldParameters } from '@/engine/mold/mold-types';
import { generatePourThreePieceMold } from '@/engine/mold/pour-three-piece-generator';
import { moldWithVaseFoot } from '@/engine/mold/vase-foot';
import { setBottomMarkField } from '@/engine/bottom';
import { buildRelief, type SprigSource } from '@/engine/sprig/relief';
import { DEFAULT_MARK_PARAMETERS } from '@/engine/sprig/sprig-types';
import { computeMeshStats } from '@/engine/mesh-stats';
import type { VaseParameters, VaseMesh, BottomSettings } from '@/engine/types';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

const F = ['#####', '#....', '#....', '####.', '#....', '#....', '#....'];
function fSource(sc = 12): SprigSource {
  const w = 5 * sc, h = 7 * sc;
  const pixels = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (F[Math.floor(y / sc)][Math.floor(x / sc)] === '#') pixels[y * w + x] = 0;
  return { pixels, width: w, height: h };
}
const markParams = { ...DEFAULT_MARK_PARAMETERS, width: 15, length: 21, svgAspect: 5 / 7, maxHeight: 0.8, edgeSoftness: 0.1 };
const relief = buildRelief(fSource(), markParams, 0.2);

const MOLD: MoldParameters = { ...DEFAULT_MOLD_PARAMETERS, moldStyle: 'pourThreePiece' };
const S = 1 + MOLD.shrinkPercent / 100;
function vase(base: VaseParameters, b: Partial<BottomSettings>): VaseParameters {
  return { ...base, bottom: { ...base.bottom, mark: markParams, markName: 'F', markOn: true, ...b } };
}
const gen = (v: VaseParameters) => generatePourThreePieceMold(v, moldWithVaseFoot(MOLD, v));
const same = (a: VaseMesh, b: VaseMesh) => a.positions.length === b.positions.length && a.indices.length === b.indices.length
  && Buffer.compare(Buffer.from(a.positions.buffer), Buffer.from(b.positions.buffer)) === 0
  && Buffer.compare(Buffer.from(a.indices.buffer), Buffer.from(b.indices.buffer)) === 0;

function closed(m: VaseMesh): { open: number; bad: number } {
  const key = (i: number) => `${Math.round(m.positions[i * 3] * 1e4)},${Math.round(m.positions[i * 3 + 1] * 1e4)},${Math.round(m.positions[i * 3 + 2] * 1e4)}`;
  const id = new Map<string, number>();
  const w = new Int32Array(m.positions.length / 3);
  for (let i = 0; i < w.length; i++) { const k = key(i); if (!id.has(k)) id.set(k, id.size); w[i] = id.get(k)!; }
  const dir = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [w[m.indices[t]], w[m.indices[t + 1]], w[m.indices[t + 2]]];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let e = 0; e < 3; e++) { const k = `${v[e]}>${v[(e + 1) % 3]}`; dir.set(k, (dir.get(k) ?? 0) + 1); }
  }
  let open = 0, bad = 0;
  for (const [k, c] of dir) { const [a, b] = k.split('>'); if (c !== 1) bad++; if (!dir.get(`${b}>${a}`)) open++; }
  return { open, bad };
}

const base = applyPreset({ parameters: {} });
const fluted = applyPreset(BUILT_IN_PRESETS.find((p) => p.name === 'Fluted Tray')!);
const stone = applyPreset(BUILT_IN_PRESETS.find((p) => p.name === 'Stone Box')!);

for (const [n, b0, on] of [['default', base, true], ['default', base, false], ['fluted', fluted, true], ['stone', stone, true]] as const) {
  setBottomMarkField(null);
  const plain = gen(vase(b0, { footOn: on, markSize: n === 'default' ? 100 : 60 }));
  setBottomMarkField(relief);
  const cases: [string, Partial<BottomSettings>][] = [
    ['impressed', {}],
    ['raised', { markStyle: 'raised', markDepth: 0.8 }],
    ['turned+moved', { markAngle: 37, markOffsetX: 3, markOffsetY: -2, markSize: 80 }],
  ];
  const c0 = closed(plain.center);
  for (const [cn, b] of cases) {
    if (!on && cn === 'raised') continue;
    const m = gen(vase(b0, { footOn: on, markSize: n === 'default' ? 100 : 60, ...b }));
    const c = closed(m.center);
    check(c.open === c0.open && c.bad === c0.bad, `A  ${n} foot ${on ? 'on' : 'off'} ${cn}: center open/bad edges ${c.open}/${c.bad} (no mark: ${c0.open}/${c0.bad}), ${m.center.triangleCount} tris`);
    check(same(m.shellA, plain.shellA) && same(m.shellB, plain.shellB) && same(m.plaster, plain.plaster), `S  ${n} foot ${on ? 'on' : 'off'} ${cn}: shells + plaster byte-identical`);
    const sum = (f: Float32Array) => f.reduce((a, x) => a + x, 0);
    check(Math.abs(sum(m.undercutFlags) - sum(plain.undercutFlags)) < 1e-6 && m.hasUndercuts === plain.hasUndercuts, `U  ${n} foot ${on ? 'on' : 'off'} ${cn}: undercut flags unchanged`);
  }
}

// ── C: read the master's bottom from below, turned upright ──
setBottomMarkField(relief);
function readsF(v: VaseParameters, mirror: boolean): boolean {
  const c = gen(v).center;
  let zBed = -Infinity;
  for (let i = 0; i < c.vertexCount; i++) zBed = Math.max(zBed, c.positions[i * 3 + 2]);
  const pts: [number, number][] = [];
  for (let i = 0; i < c.vertexCount; i++) {
    // print → upright: a 180° turn about x
    const x = c.positions[i * 3], y = -c.positions[i * 3 + 1], z = zBed - c.positions[i * 3 + 2];
    if (z > 0.4 && z < 1.5 && Math.hypot(x, y) < 20 * S) pts.push([((mirror ? 1 : -1) * x) / S, y / S]);
  }
  const has = (u0: number, u1: number, v0: number, v1: number) => pts.some(([u, w]) => u >= u0 && u <= u1 && w >= v0 && w <= v1);
  return has(-7, -5, 7, 9) && has(-7, -5, -9, -7) && has(5, 7, 8, 10) && !has(2, 7, -10, -4);
}
check(readsF(vase(base, { footOn: false }), false), 'C  the master\'s bottom reads F looking up at it (so does the cast piece)');
check(!readsF(vase(base, { footOn: false }), true), 'C  control: read from above it is NOT an F');
check(!readsF(vase(base, { footOn: false, markAngle: 180 }), false), 'C  control: turned 180° it is NOT an F');

// ── D: volume ──
{
  setBottomMarkField(null);
  const v0 = computeMeshStats(gen(vase(base, { footOn: true })).center).volumeMm3;
  setBottomMarkField(relief);
  const v1 = computeMeshStats(gen(vase(base, { footOn: true })).center).volumeMm3;
  const dv = v0 - v1;
  check(dv > 60 * S * S && dv < 120 * S * S, `D  impressed F takes ${dv.toFixed(1)} mm³ out of the master (expect ~100 × ${(S * S).toFixed(2)})`);
}

// ── E: notes ──
const notes = (b: Partial<BottomSettings>) => gen(vase(base, b)).markNotes;
check(notes({ footOn: true }).length === 0, 'E  a plain mark in the recess: no notes');
check(notes({ footOn: true, markDepth: 5 }).some((n) => n.includes('floor is')) && !notes({ footOn: true, markDepth: 5 }).some((n) => n.includes('limited to')), 'E  deeper than the master wall: the floor thickens and says so, not limited');
check(notes({ footOn: false, markStyle: 'raised' }).some((n) => n.includes('Foot is off')), 'E  raised with Foot off: warns');
check(notes({ footOn: true, markStyle: 'raised', markDepth: 1.5 }).some((n) => n.includes('rock')), 'E  raised taller than the recess: warns it will rock');
check(notes({ footOn: true, markSize: 300 }).some((n) => n.includes('foot ring')), 'E  too big for the recess: warns');
setBottomMarkField(null);
check(gen(vase(base, { footOn: true })).markNotes.length === 0, 'E  mark on but not built yet: no notes, plain bottom');

// ── H: a deep foot — vertical rays through the upright master's bottom ──
function probe(v: VaseParameters): { top: number; gap: number } {
  const c = gen(v).center;
  let zBed = -Infinity;
  for (let i = 0; i < c.vertexCount; i++) zBed = Math.max(zBed, c.positions[i * 3 + 2]);
  const X = (i: number) => c.positions[i * 3], Y = (i: number) => -c.positions[i * 3 + 1], Z = (i: number) => zBed - c.positions[i * 3 + 2];
  let top = -Infinity, gap = Infinity;
  for (let gx = -10; gx <= 10; gx += 0.5) for (let gy = -10; gy <= 10; gy += 0.5) {
    const px = gx * S, py = gy * S;
    const hits: number[] = [];
    for (let t = 0; t < c.indices.length; t += 3) {
      const a = c.indices[t], b = c.indices[t + 1], d = c.indices[t + 2];
      const x0 = X(a), y0 = Y(a), x1 = X(b), y1 = Y(b), x2 = X(d), y2 = Y(d);
      const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(den) < 1e-12) continue;
      const l0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / den;
      const l1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / den;
      const l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      const z = l0 * Z(a) + l1 * Z(b) + l2 * Z(d);
      if (z < 20) hits.push(z);
    }
    hits.sort((p, q) => p - q);
    const u = hits.filter((z, i) => i === 0 || z - hits[i - 1] > 1e-4);
    if (u.length < 2) continue;
    top = Math.max(top, u[0]);
    gap = Math.min(gap, u[1] - u[0]);
  }
  return { top, gap };
}
setBottomMarkField(relief);
{
  const v = vase(base, { footOn: true, footHeight: 6, markDepth: 0.7 });
  const p = probe(v);
  check(p.top > 6.6 && p.top < 6.75, `H  6 mm foot + 0.7 mm mark: deepest point of the bottom at ${p.top.toFixed(2)} mm (want ~6.7; the old cap gave ≤ ${(MOLD.masterWallThickness - 0.5).toFixed(1)})`);
  check(p.gap >= 0.55, `H  floor over the foot and mark: thinnest ${p.gap.toFixed(2)} mm (want ≥ 0.6)`);
  check(gen(v).markNotes.some((n) => n.includes('floor is')), 'H  the note says the master floor was thickened');
  setBottomMarkField(null);
  const q = probe(vase(base, { footOn: true, footHeight: 6 }));
  check(q.top > 5.95 && q.top < 6.05 && q.gap >= 0.45, `H  6 mm foot, no mark built: bottom at ${q.top.toFixed(2)}, floor ${q.gap.toFixed(2)} mm`);
  const w = probe(vase(base, { footOn: true, footHeight: 1 }));
  check(w.gap > MOLD.masterWallThickness - 1 - 0.3, `H  control: 1 mm foot keeps the Wall-thick floor (${w.gap.toFixed(2)} mm)`);
  check(gen(vase(base, { footOn: true, footHeight: 1 })).markNotes.length === 0, 'H  control: 1 mm foot, no floor note');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
