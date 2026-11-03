/**
 * Verify the handle-mold wall seam (aligned Vs + one seam block per seam):
 *  1. weld + union-find + directed-edge manifold check per part
 *  2. wall component count = body + flange + 2 seam blocks + 2 collars = 6
 *  3. geometric probe: the vertical V runs from the flange groove apex (where
 *     the plate ridge stops) to the wall top, and its y positions match the
 *     plate's ridge lines — the alignment that makes the barrier turn the
 *     corner in one piece
 *
 * The master's own underside (seating on the lip, the open channel) is checked
 * by verify-handle-seal.ts, and the well/collar fit by verify-handle-collar.ts.
 * Run: npx tsx --tsconfig tsconfig.json <this file>
 */
import { DEFAULT_HANDLE_PARAMETERS } from '@/engine/handle/handle-types';
import { generateHandleMold } from '@/engine/handle/handle-generator';
import { signedVolume } from '@/engine/handle/mesh3';
import type { VaseMesh } from '@/engine/types';

function check(name: string, mesh: VaseMesh, expectComponents?: number): boolean {
  const map = new Map<string, number>();
  const remap = new Array<number>(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const k = `${mesh.positions[i * 3].toFixed(4)},${mesh.positions[i * 3 + 1].toFixed(4)},${mesh.positions[i * 3 + 2].toFixed(4)}`;
    const seen = map.get(k);
    if (seen === undefined) { map.set(k, i); remap[i] = i; } else remap[i] = seen;
  }
  const parent = new Array<number>(mesh.vertexCount).fill(0).map((_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const edges = new Map<string, number>();
  let degenerate = 0;
  for (let f = 0; f < mesh.triangleCount; f++) {
    const a = remap[mesh.indices[f * 3]], b = remap[mesh.indices[f * 3 + 1]], c = remap[mesh.indices[f * 3 + 2]];
    if (a === b || b === c || a === c) { degenerate++; continue; }
    union(a, b); union(b, c);
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) edges.set(`${p},${q}`, (edges.get(`${p},${q}`) ?? 0) + 1);
  }
  let multi = 0, unmatched = 0;
  for (const [k, n] of edges) {
    if (n !== 1) multi++;
    const [p, q] = k.split(',');
    if (!edges.has(`${q},${p}`)) unmatched++;
  }
  const roots = new Set<number>();
  for (let i = 0; i < mesh.vertexCount; i++) if (remap[i] === i) roots.add(find(i));
  const vol = signedVolume(mesh);
  const compBad = expectComponents !== undefined && roots.size !== expectComponents;
  const ok = multi === 0 && unmatched === 0 && degenerate === 0 && vol > 0 && !compBad;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: verts=${mesh.vertexCount} tris=${mesh.triangleCount} degen=${degenerate} ` +
    `multi=${multi} unmatched=${unmatched} comps=${roots.size}${expectComponents !== undefined ? `/${expectComponents}` : ''} vol=${(vol / 1000).toFixed(1)}cm3`);
  return ok;
}

const p = structuredClone(DEFAULT_HANDLE_PARAMETERS);
const m = generateHandleMold(p);

let ok = true;
ok = check('wall (6 = body+flange+2 seam blocks+2 collars)', m.wall, 6) && ok;
ok = check('wallB', m.wallB, 6) && ok;
ok = check('plate', m.plate) && ok;
ok = check('master', m.master) && ok;

// ── Seam-V continuity + alignment probe ──
function verts(mesh: VaseMesh): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < mesh.vertexCount; i++) out.push([mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]);
  return out;
}
function cluster(vals: number[], tol = 0.15): number[] {
  const s = [...vals].sort((a, b) => a - b);
  const g: number[][] = [];
  for (const v of s) {
    const last = g[g.length - 1];
    if (last && v - last[last.length - 1] <= tol) last.push(v);
    else g.push([v]);
  }
  return g.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

const vh = p.vHeight, vclr = p.vClearance;
const gHf = Math.min(vh + vclr, 3 - 0.6); // FLANGE_T = 3 in mold-parts

// The ridge-V apexes are the global max-x vertices of the wall.
const W = verts(m.wall);
const xMax = Math.max(...W.map((v) => v[0]));
const apex = W.filter((v) => Math.abs(v[0] - xMax) < 1e-4);
const zLo = Math.min(...apex.map((v) => v[2]));
const zHi = Math.max(...apex.map((v) => v[2]));

// 1. The V starts exactly where the plate ridge stops: the flange groove apex.
const spanOk = Math.abs(zLo - gHf) < 1e-3 && zHi > 10;
console.log(`${spanOk ? 'PASS' : 'FAIL'}  ridge-V spans z ∈ [${zLo.toFixed(3)}, ${zHi.toFixed(3)}] (expect ${gHf.toFixed(3)} → wall top)`);
ok = ok && spanOk;

// 2. Alignment: the V y positions must equal the plate's ridge y positions.
const vYs = cluster(apex.map((v) => v[1]));
// Plate ridge apexes sit at z = vh exactly (the dome is taller, so a global
// max-z filter would find the dome instead). sweepRectLoop emits 4 corner
// stations per loop, so this is 4 verts x 3 loops = 6 distinct y lines.
const P = verts(m.plate);
const ridgeYs = cluster(P.filter((v) => Math.abs(v[2] - vh) < 1e-4).map((v) => v[1]));
const alignOk = vYs.every((y) => ridgeYs.some((r) => Math.abs(r - y) < 1e-3));
console.log(`${alignOk ? 'PASS' : 'FAIL'}  ${vYs.length} vertical Vs at y = ${vYs.map((v) => v.toFixed(2)).join(', ')}`);
console.log(`        plate ridge lines at y = ${ridgeYs.map((v) => v.toFixed(2)).join(', ')}`);
ok = ok && alignOk && vYs.length === 3;

console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
process.exit(ok ? 0 : 1);
