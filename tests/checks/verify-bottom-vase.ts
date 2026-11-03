/**
 * Bottom Mark phase 2 — the foot and the mark on the PLA vase.
 *   npx tsx --tsconfig tsconfig.json tests/checks/verify-bottom-vase.ts
 *
 * A  closed + consistently wound (weld, every edge used once each way), for
 *    recess / mark / both, impressed and raised, a textured and a non-round vase
 * B  the recess is the molds' foot: same rings as mold-generator buildFootRings
 * C  the "F" test: read from BELOW the mark is an F, not its mirror image
 *    (with a negative control: the mirror reading must fail)
 * D  volumes: recess and impressed mark remove plastic, raised adds it (each
 *    against a plain vase with the same lifted floor)
 * E  notes: raised below the foot, off the bottom; a deep mark is NOT limited
 * L  Base is the plastic over the deepest point (2026-10-27): the floor lifts by
 *    foot + impressed mark, the outside is unchanged, a raised mark lifts nothing
 * F  no feature → byte-identical to the plain mesh (hash-vase-meshes covers presets)
 * G  no spikes on a textured edge: 45 narrow rods, the longest triangle edge on
 *    the mark stays near the ring spacing (v1.52.0 had 1.00 / 1.34 mm slivers;
 *    the smooth-foot case, 0.27 mm, is the control)
 */
import { generateMesh } from '@/engine/mesh-generator';
import { setBottomMarkField, footRings } from '@/engine/bottom';
import { buildFootRings } from '@/engine/mold/mold-generator';
import { buildRelief, type SprigSource } from '@/engine/sprig/relief';
import { DEFAULT_MARK_PARAMETERS } from '@/engine/sprig/sprig-types';
import { applyPreset } from '@/presets';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { BUILT_IN_PRESETS } from '@/config/presets';
import { computeMeshStats } from '@/engine/mesh-stats';
import { computeRowContexts, computeVertex, computeCenter, precomputeTextureTables } from '@/engine/surfaces';
import type { VaseParameters, VaseMesh, BottomSettings } from '@/engine/types';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

// ── An "F", 5 × 7, row 0 at the top ──
const F = ['#####', '#....', '#....', '####.', '#....', '#....', '#....'];
function fSource(scale = 12): SprigSource {
  const w = 5 * scale, h = 7 * scale;
  const pixels = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (F[Math.floor(y / scale)][Math.floor(x / scale)] === '#') pixels[y * w + x] = 0;
  return { pixels, width: w, height: h };
}
const markParams = { ...DEFAULT_MARK_PARAMETERS, width: 15, length: 21, svgAspect: 5 / 7, maxHeight: 0.8, edgeSoftness: 0.1 };
const relief = buildRelief(fSource(), markParams, 0.2);

function vase(base: VaseParameters, b: Partial<BottomSettings>): VaseParameters {
  return { ...base, bottomThickness: 4, bottom: { ...base.bottom, mark: markParams, markName: 'F', ...b } };
}

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
  for (const [k, c] of dir) {
    const [a, b] = k.split('>');
    const back = dir.get(`${b}>${a}`) ?? 0;
    if (c !== 1) bad++;
    if (back === 0) open++;
  }
  return { open, bad };
}

const base = applyPreset({ parameters: {} });
const fluted = applyPreset(BUILT_IN_PRESETS.find((p) => p.name === 'Fluted Tray')!);
const stone = applyPreset(BUILT_IN_PRESETS.find((p) => p.name === 'Stone Box')!);

// ── F: no feature = plain ──
setBottomMarkField(relief);
{
  const plain = generateMesh({ ...base, bottomThickness: 4 });
  const off = generateMesh(vase(base, { markOn: false, footOn: false }));
  check(Buffer.compare(Buffer.from(plain.positions.buffer), Buffer.from(off.positions.buffer)) === 0 && plain.indices.length === off.indices.length,
    'F  mark off + recess off → identical to the plain mesh');
}

// ── A + D ──
// The floor lifts by the foot + an impressed mark, so compare each case with a
// plain vase whose Base is that lifted floor.
const plainAt = (bt: number) => computeMeshStats(generateMesh({ ...base, bottomThickness: bt })).volumeMm3;
const d0 = DEFAULT_PARAMETERS.bottom;
const cases: [string, VaseParameters][] = [
  ['recess', vase(base, { footOn: true })],
  ['impressed', vase(base, { markOn: true })],
  ['impressed+recess', vase(base, { markOn: true, footOn: true })],
  ['raised+recess', vase(base, { markOn: true, footOn: true, markStyle: 'raised', markDepth: 0.8 })],
  ['raised (no recess)', vase(base, { markOn: true, markStyle: 'raised' })],
  ['turned+moved', vase(base, { markOn: true, footOn: true, markAngle: 37, markOffsetX: 3, markOffsetY: -2, markSize: 80 })],
  ['fluted tray', vase(fluted, { markOn: true, footOn: true, markSize: 60 })],
  ['stone box smooth', vase(stone, { markOn: true, footOn: true, footSmoothInner: true, markSize: 60 })],
];
const vols: Record<string, number> = {};
for (const [n, p] of cases) {
  const m = generateMesh(p);
  const c = closed(m);
  vols[n] = computeMeshStats(m).volumeMm3;
  check(c.open === 0 && c.bad === 0, `A  ${n}: closed, consistently wound (open ${c.open}, bad ${c.bad}), ${m.triangleCount} tris`);
}
check(vols['recess'] < plainAt(4 + d0.footHeight) - 100, `D  recess removes plastic (${(plainAt(4 + d0.footHeight) - vols['recess']).toFixed(0)} mm³)`);
{ const pv = plainAt(4 + d0.markDepth); check(vols['impressed'] < pv - 1 && vols['impressed'] > pv - 400, `D  impressed mark removes a little (${(pv - vols['impressed']).toFixed(1)} mm³)`); }
check(vols['raised+recess'] > vols['recess'] + 1, `D  raised mark adds plastic inside the recess (${(vols['raised+recess'] - vols['recess']).toFixed(1)} mm³)`);
// The F's ink area ≈ 15 squares of 3 mm × 0.8 mm ≈ 108 mm³ (less the edge slope)
const markVol = plainAt(4 + d0.footHeight + d0.markDepth) - plainAt(4 + d0.footHeight) + vols['recess'] - vols['impressed+recess'];
check(markVol > 60 && markVol < 120, `D  impressed F volume ${markVol.toFixed(1)} mm³ (expect ~100)`);

// ── B: same foot as the molds ──
{
  const p = base, rRes = p.resolution.radial;
  const rows = computeRowContexts(p, p.resolution.vertical, rRes);
  const { simplexPerm, woodGrainPerm } = precomputeTextureTables(p, true);
  const ring = new Float32Array(rRes * 3);
  for (let t = 0; t < rRes; t++) { const [x, y] = computeVertex(rows[0], t, 0, 0, p, rRes, true, simplexPerm, woodGrainPerm); ring[t * 3] = x; ring[t * 3 + 1] = y; }
  const [cx, cy] = computeCenter(rows[0]);
  for (const [w1, w2, h] of [[5, 1, 1], [8, 3, 2], [40, 20, 1.5]]) {
    const mine = footRings(ring, cx, cy, rRes, w1, w2, h)!;
    const mold = buildFootRings(ring, cx, cy, rRes, w1, w2, h);
    const same = mold.length === 2 && mine[0].every((v, i) => v === mold[1][i]) && mine[1].every((v, i) => v === mold[0][i]);
    check(same, `B  foot ${w1}/${w2}/${h} = the molds' buildFootRings, value for value`);
  }
  // Recess floor really sits at the foot height inside the foot ring
  const m = generateMesh(vase(base, { footOn: true }));
  let lowInside = 0;
  const R = Math.hypot(ring[0] - cx, ring[1] - cy);
  for (let i = 0; i < m.vertexCount; i++) {
    const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
    if (Math.hypot(x - cx, y - cy) < R - 6.5 && z < 0.999 && z > -0.01 && z < 3) lowInside++;
  }
  check(lowInside === 0, `B  nothing inside the recess edge below the 1 mm recess (found ${lowInside})`);
}

// ── C: the F reads correctly from below ──
function readFromBelow(p: VaseParameters, mirror: boolean): boolean {
  const m = generateMesh(p);
  const cx = 0, cy = 0;
  // Impressed with no recess: marked = z above 0.4 on the bottom (z < 2)
  const pts: [number, number][] = [];
  for (let i = 0; i < m.vertexCount; i++) {
    const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
    if (z > 0.4 && z < 1.5 && Math.hypot(x, y) < 20) pts.push([(mirror ? 1 : -1) * (x - cx), y - cy]);
  }
  // Seen from below, an F (15 × 21) has: a full-height stem on the LEFT, a
  // top bar reaching the RIGHT, and nothing at the bottom right.
  const has = (u0: number, u1: number, v0: number, v1: number) => pts.some(([u, v]) => u >= u0 && u <= u1 && v >= v0 && v <= v1);
  const stemTop = has(-7, -5, 7, 9), stemBot = has(-7, -5, -9, -7);
  const barRight = has(5, 7, 8, 10);
  const emptyBotRight = !has(2, 7, -10, -4);
  return stemTop && stemBot && barRight && emptyBotRight;
}
check(readFromBelow(vase(base, { markOn: true }), false), 'C  the F reads as an F looking up at the bottom');
check(!readFromBelow(vase(base, { markOn: true }), true), 'C  control: read the other way round (from above) it is NOT an F');
check(!readFromBelow(vase(base, { markOn: true, markAngle: 180 }), false), 'C  control: turned 180° it no longer reads as an F');

// ── E: notes ──
const notes = (p: VaseParameters) => generateMesh(p).bottomNotes ?? [];
check(notes(vase(base, { markOn: true, footOn: true })).length === 0, 'E  a plain mark in the recess: no notes');
check(notes(vase(base, { markOn: true, markDepth: 5 })).length === 0, 'E  a 5 mm mark on a 4 mm Base: no notes (the floor goes up instead)');
check(notes(vase(base, { markOn: true, footOn: true, markStyle: 'raised', markDepth: 1.5 })).some((n) => n.includes('rock')), 'E  a raised mark taller than the recess warns it will rock');
check(notes(vase(base, { markOn: true, markStyle: 'raised' })).some((n) => n.includes('Foot is off')), 'E  a raised mark with Foot off warns');
check(notes(vase(base, { markOn: true, footOn: true, markSize: 300 })).some((n) => n.includes('foot ring')), 'E  a mark too big for the recess warns');
check(notes(vase(base, { markOn: true, footOn: true, markSize: 160 })).some((n) => n.includes('foot ring')), 'E  fits the flat bottom but not the recess: warns with Foot on');
check(!notes(vase(base, { markOn: true, markSize: 160 })).some((n) => n.includes('left off')), 'E  …and not with Foot off (the whole bottom is the floor)');

// ── G: a textured edge does not shear the mark into spikes ──
{
  const rods: VaseParameters = { ...base, radius: 25, bottomThickness: 2, wallThickness: 1.6,
    textures: { ...base.textures, enabled: true, rods: { ...base.textures.rods, enabled: true, count: 45, depth: 2.4, duty: 0.05 } },
    smoothZones: { ...base.smoothZones, basePercent: 0 } };
  const longest = (b: Partial<BottomSettings>) => {
    const m = generateMesh(vase(rods, { markOn: true, markSize: 60, markDepth: 0.4, ...b }));
    const st = m.bottomStart!, P = m.positions, z0 = b.footOn ? Math.min(1, 2 - 0.6) : 0;
    let worst = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const v = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
      if (v.some((i) => i < st) || !v.some((i) => P[i * 3 + 2] > z0 + 0.02)) continue;
      for (let e = 0; e < 3; e++) { const a = v[e], c = v[(e + 1) % 3]; worst = Math.max(worst, Math.hypot(P[a * 3] - P[c * 3], P[a * 3 + 1] - P[c * 3 + 1])); }
    }
    return worst;
  };
  const ctl = longest({ footOn: true, footSmoothInner: true });
  for (const [n, b] of [['Foot off', { footOn: false }], ['Foot on, Smooth Inside off', { footOn: true, footSmoothInner: false }]] as const) {
    const w = longest(b);
    check(w < 0.4 && w < ctl * 1.5, `G  rods vase, ${n}: longest edge on the mark ${w.toFixed(2)} mm (smooth-foot control ${ctl.toFixed(2)} mm)`);
  }
}

setBottomMarkField(null);
check(generateMesh(vase(base, { markOn: true })).bottomNotes === undefined, 'F  mark on but no mark built yet → plain bottom');

// ── L: Base = the plastic over the deepest point (2026-10-27) ──
setBottomMarkField(relief);
{
  const rows = computeRowContexts(base, base.resolution.vertical, base.resolution.radial);
  const step = rows[1].height - rows[0].height;
  const outerN = (base.resolution.vertical + 1) * base.resolution.radial * 3;
  const plain2 = generateMesh({ ...base, bottomThickness: 2 });
  const under = (m: VaseMesh) => { let z = -Infinity; for (let i = m.bottomStart!; i < m.vertexCount; i++) z = Math.max(z, m.positions[i * 3 + 2]); return z; };
  const deep = { ...vase(base, { markOn: true, footOn: true, footHeight: 6, markDepth: 0.7, footSmoothInner: false }), bottomThickness: 2 };
  const m = generateMesh(deep);
  const fz = m.bottomFloor!.z;
  check(m.bottomFloor!.base === 2 && m.bottomFloor!.foot === 6 && m.bottomFloor!.mark === 0.7, 'L  the floor reports its parts: base 2 + foot 6 + mark 0.7');
  check(fz >= 8.7 - 1e-6 && fz < 8.7 + step + 1e-6, `L  Base 2 + 6 mm foot + 0.7 mm mark: inside floor ${fz.toFixed(2)} mm (want 8.7, up to one row of ${step.toFixed(2)} more)`);
  const u = under(m);
  check(u > 6.69 && fz - u >= 2 - 1e-6, `L  full depth on the print: deepest point ${u.toFixed(2)} mm, ${(fz - u).toFixed(2)} mm of plastic over it (Base 2)`);
  check(u > 2, 'L  control: that underside would break through the unlifted 2 mm floor');
  check((m.bottomNotes ?? []).length === 0, 'L  no notes');
  check(Buffer.compare(Buffer.from(m.positions.buffer, 0, outerN * 4), Buffer.from(plain2.positions.buffer, 0, outerN * 4)) === 0,
    'L  the outside wall is byte-identical to the plain vase');
  const raised = generateMesh({ ...vase(base, { markOn: true, footOn: true, footHeight: 6, markStyle: 'raised', markDepth: 0.7 }), bottomThickness: 2 });
  check(raised.bottomFloor!.z >= 8 - 1e-6 && raised.bottomFloor!.z < 8 + step + 1e-6, `L  raised mark lifts nothing: floor ${raised.bottomFloor!.z.toFixed(2)} mm (want 8)`);
  const markOnly = generateMesh({ ...vase(base, { markOn: true, markDepth: 0.7 }), bottomThickness: 2 });
  check(markOnly.bottomFloor!.z >= 2.7 - 1e-6 && markOnly.bottomFloor!.z < 2.7 + step + 1e-6, `L  mark alone (Foot off): floor ${markOnly.bottomFloor!.z.toFixed(2)} mm (want 2.7)`);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
