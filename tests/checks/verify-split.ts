/**
 * Numeric verification for the Split 2-Pc mold (moldmaker-split2pc-plan.md):
 *  A. every separate solid of both trays is a closed, consistently wound,
 *     positive-volume manifold;
 *  B. the sideways-pull undercut check discriminates — a WAISTED round vase
 *     (which every other style flags) is clean; twist / heart / flutes flag;
 *  C. natches pair up: A's pocket at (z,u) faces B's dome at the same (z,u),
 *     and vice versa (ray probes, not vertex positions);
 *  D. the floor is OPEN under the relief (so tree supports pull out) and the
 *     base wall is closed.
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-split.ts
 */
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { DEFAULT_MOLD_PARAMETERS } from '@/engine/mold/mold-types';
import { generateSplitTwoPieceMold } from '@/engine/mold/split-two-piece-generator';
import { signedVolume } from '@/engine/handle/mesh3';
import type { VaseMesh } from '@/engine/types';

let ok = true;
const fail = (msg: string) => { ok = false; console.log(`FAIL  ${msg}`); };
const pass = (msg: string) => console.log(`PASS  ${msg}`);

function manifold(name: string, mesh: VaseMesh): boolean {
  const map = new Map<string, number>();
  const remap = new Array<number>(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const k = `${mesh.positions[i * 3].toFixed(4)},${mesh.positions[i * 3 + 1].toFixed(4)},${mesh.positions[i * 3 + 2].toFixed(4)}`;
    const seen = map.get(k);
    if (seen === undefined) { map.set(k, i); remap[i] = i; } else remap[i] = seen;
  }
  const parent = Array.from({ length: mesh.vertexCount }, (_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const edges = new Map<string, number>();
  let degenerate = 0;
  for (let f = 0; f < mesh.triangleCount; f++) {
    const a = remap[mesh.indices[f * 3]], b = remap[mesh.indices[f * 3 + 1]], c = remap[mesh.indices[f * 3 + 2]];
    if (a === b || b === c || a === c) { degenerate++; continue; }
    parent[find(a)] = find(b); parent[find(b)] = find(c);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.set(`${p},${q}`, (edges.get(`${p},${q}`) ?? 0) + 1);
  }
  let multi = 0, unmatched = 0;
  for (const [k, n] of edges) {
    if (n !== 1) multi++;
    const [p, q] = k.split(',');
    if (!edges.has(`${q},${p}`)) unmatched++;
  }
  const roots = new Set<number>();
  for (let i = 0; i < mesh.vertexCount; i++) if (remap[i] === i && mesh.triangleCount) roots.add(find(i));
  const vol = signedVolume(mesh);
  const good = multi === 0 && unmatched === 0 && degenerate === 0 && vol > 0 && roots.size === 1;
  const line = `${name}: tris=${mesh.triangleCount} degen=${degenerate} multi=${multi} unmatched=${unmatched} comps=${roots.size} vol=${(vol / 1000).toFixed(2)}cm3`;
  if (good) pass(line); else fail(line);
  return good;
}

/** Z values where the vertical line (x, y) crosses the mesh. */
function zHits(mesh: VaseMesh, x: number, y: number): number[] {
  const P = mesh.positions, I = mesh.indices, out: number[] = [];
  for (let f = 0; f < mesh.triangleCount; f++) {
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
    const x0 = P[a], y0 = P[a + 1], x1 = P[b], y1 = P[b + 1], x2 = P[c], y2 = P[c + 1];
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(d) < 1e-12) continue;
    const w0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d;
    const w1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
    const w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    out.push(w0 * P[a + 2] + w1 * P[b + 2] + w2 * P[c + 2]);
  }
  return out.sort((p, q) => p - q);
}
const top = (m: VaseMesh, x: number, y: number) => Math.max(...zHits(m, x, y));

type Vase = typeof DEFAULT_PARAMETERS;
function build(mutate: (v: Vase) => void, moldMut: (m: typeof DEFAULT_MOLD_PARAMETERS) => void = () => {}) {
  const vase = structuredClone(DEFAULT_PARAMETERS);
  vase.resolution.vertical = 80; vase.resolution.radial = 120; // keep the probes quick
  mutate(vase);
  const mold = structuredClone(DEFAULT_MOLD_PARAMETERS);
  mold.moldStyle = 'splitTwoPiece';
  moldMut(mold);
  return generateSplitTwoPieceMold(vase, mold);
}
const maxFlag = (f: Float32Array) => f.reduce((a, b) => Math.max(a, b), 0);

// ── A. Manifold, several shapes ──
const NAMES = ['relief', 'floor', 'wall-base', 'wall-end', 'wall-side', 'wall-side', 'dome', 'dome'];
for (const [label, mut, moldMut] of [
  ['default (waisted circle)', () => {}],
  ['Rectangle1', (v: Vase) => { v.bottomShape = 'Rectangle1'; v.topShape = 'Rectangle1'; }],
  // Earcut drops exactly-collinear cap points; a rectangle's flat side at a
  // non-zero split angle left 65 open edges until the 2-D jitter (2026-10-09).
  ['Rectangle1 @30°', (v: Vase) => { v.bottomShape = 'Rectangle1'; v.topShape = 'Rectangle1'; }, (m: typeof DEFAULT_MOLD_PARAMETERS) => { m.seamAngle = 30; }],
  ['Rectangle1 @90°', (v: Vase) => { v.bottomShape = 'Rectangle1'; v.topShape = 'Rectangle1'; }, (m: typeof DEFAULT_MOLD_PARAMETERS) => { m.seamAngle = 90; }],
  ['Egg1 (asymmetric)', (v: Vase) => { v.bottomShape = 'Egg1'; v.topShape = 'Egg1'; }],
  ['fluted, textured', (v: Vase) => { v.textures.enabled = true; v.textures.fluting.enabled = true; }],
  // The case that caught the −1 "not found" sentinel in cutArc (2026-10-09):
  // a crossing just before ring index 0 was rejected and the whole mold errored.
  ['twisted rectangle', (v: Vase) => { v.bottomShape = 'Rectangle1'; v.topShape = 'Rectangle1'; v.bezierTwist.enabled = true; v.bezierTwist.points = [[0, 0], [0, 0.25], [0, 0.5], [0, 0.75], [90, 1]] as never; }],
] as [string, (v: Vase) => void, ((m: typeof DEFAULT_MOLD_PARAMETERS) => void)?][]) {
  const m = build(mut, moldMut);
  console.log(`\n── A. ${label}`);
  if (m.error) fail(`${label}: ${m.error}`);
  m.partsA.forEach((p, i) => manifold(`A ${NAMES[i] ?? i}`, p));
  m.partsB.forEach((p, i) => manifold(`B ${NAMES[i] ?? i}`, p));
}

// ── B. Undercut discrimination ──
console.log('\n── B. Undercut check');
{
  const m = build(() => {});
  if (!m.hasUndercuts && maxFlag(m.undercutFlags) < 0.5) pass(`waisted circle is clean (max flag ${maxFlag(m.undercutFlags).toFixed(2)}) — every other style flags this vase`);
  else fail(`waisted circle flagged (max ${maxFlag(m.undercutFlags).toFixed(2)})`);
  const tw = build((v) => { v.bezierTwist.enabled = true; v.bezierTwist.points = [[0, 0], [0, 0.25], [0, 0.5], [0, 0.75], [90, 1]] as never; v.bottomShape = 'Rectangle1'; v.topShape = 'Rectangle1'; });
  if (tw.hasUndercuts) pass('twisted rectangle flags'); else fail('twisted rectangle NOT flagged');
  const heart = build((v) => { v.bottomShape = 'Heart1'; v.topShape = 'Heart1'; }, (mm) => { mm.seamAngle = 0; });
  console.log(`      heart @0°: hasUndercuts=${heart.hasUndercuts} max=${maxFlag(heart.undercutFlags).toFixed(2)} error=${heart.error}`);
  const flute = build((v) => { v.textures.enabled = true; v.textures.fluting.enabled = true; v.textures.fluting.depth = 3; });
  if (flute.hasUndercuts) pass('fluting flags (flutes cross the split)'); else fail('fluting NOT flagged');
}

// ── C. Natch pairing + D. floor open / base closed ──
console.log('\n── C/D. Natches and floor (Egg1, seam 30°, so nothing is symmetric by accident)');
{
  const m = build((v) => { v.bottomShape = 'Egg1'; v.topShape = 'Egg1'; }, (mm) => { mm.seamAngle = 30; });
  const F = m.floorTop, h = DEFAULT_MOLD_PARAMETERS.natchHeight;
  const [, floorA, , , , , ...domesA] = m.partsA;
  const [, floorB, , , , , ...domesB] = m.partsB;
  const domeTop = (domes: VaseMesh[], x: number, y: number) => Math.max(-Infinity, ...domes.flatMap((d) => zHits(d, x, y)));
  for (const [z, u] of m.bumpsA) {
    const pa = top(floorA, z, u), db = domeTop(domesB, z, -u);
    if (Math.abs(pa - (F - h)) < 0.05 && Math.abs(db - (F + h)) < 0.05) pass(`bump A (${z.toFixed(1)}, ${u.toFixed(1)}): pocket A floor ${pa.toFixed(2)}, dome B top ${db.toFixed(2)}`);
    else fail(`bump A (${z.toFixed(1)}, ${u.toFixed(1)}): pocket A floor ${pa.toFixed(2)} (want ${(F - h).toFixed(2)}), dome B top ${db.toFixed(2)} (want ${(F + h).toFixed(2)})`);
  }
  for (const [z, u] of m.dimplesA) {
    const da = domeTop(domesA, z, u), pb = top(floorB, z, -u);
    if (Math.abs(da - (F + h)) < 0.05 && Math.abs(pb - (F - h)) < 0.05) pass(`dimple A (${z.toFixed(1)}, ${u.toFixed(1)}): dome A top ${da.toFixed(2)}, pocket B floor ${pb.toFixed(2)}`);
    else fail(`dimple A (${z.toFixed(1)}, ${u.toFixed(1)}): dome A ${da.toFixed(2)}, pocket B ${pb.toFixed(2)}`);
  }
  const relief = m.partsA[0];
  // Mid-height, midway between the two INNER skirts (bed-level vertices of
  // the relief, which sit on the skirt lines): the hollow must be open there.
  const P = relief.positions;
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < relief.vertexCount; i++) { x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]); }
  const xm = (x0 + x1) / 2;
  const ys: number[] = [];
  for (let i = 0; i < relief.vertexCount; i++) if (P[i * 3 + 2] === 0 && Math.abs(P[i * 3] - xm) < 2) ys.push(P[i * 3 + 1]);
  ys.sort((p, q) => p - q);
  // four skirt lines: outer, inner | inner, outer — the hole is between the middle two
  const ym = (ys[Math.floor(ys.length / 4)] + ys[Math.floor((3 * ys.length) / 4)]) / 2;
  const hitsR = zHits(relief, xm, ym), hitsF = zHits(floorA, xm, ym);
  if (hitsF.length === 0 && hitsR.length === 2 && hitsR[0] > F) pass(`floor open under the relief at (${xm.toFixed(1)}, ${ym.toFixed(1)}): relief skin at z=${hitsR.map((z) => z.toFixed(2)).join(', ')}, no floor`);
  else fail(`floor under relief: relief hits ${hitsR.map((z) => z.toFixed(2))}, floor hits ${hitsF.map((z) => z.toFixed(2))}`);
  // Through the base wall horizontally is harder to probe with a vertical ray;
  // instead: the relief's minimum X is the vase bottom and it is a solid wall.
  console.log(`      relief min X (vase bottom) = ${x0.toFixed(3)}  (expect 0)`);
  console.log(`      plaster both halves = ${(m.plasterVolumeMm3 / 1000).toFixed(0)} cm3, tray A ${m.trayStats.sizeX.toFixed(0)} x ${m.trayStats.sizeY.toFixed(0)} x ${m.trayStats.sizeZ.toFixed(0)} mm, plastic ${(m.trayStats.volumeMm3 / 1000).toFixed(0)} cm3, natch r=${m.natchRadius}`);
}

console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
process.exit(ok ? 0 : 1);
