/**
 * Numeric verification for the Pour 3-Pc shell seam-V changes:
 * position-weld + union-find + directed-edge manifold check per part,
 * plus signed volume. Run: npx tsx --tsconfig tsconfig.json <this file>
 * from the project root.
 */
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { DEFAULT_MOLD_PARAMETERS } from '@/engine/mold/mold-types';
import { generatePourThreePieceMold } from '@/engine/mold/pour-three-piece-generator';
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
  // union-find over welded vertices
  const parent = new Array<number>(mesh.vertexCount).fill(0).map((_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  const edges = new Map<string, number>();
  let degenerate = 0;
  for (let f = 0; f < mesh.triangleCount; f++) {
    const a = remap[mesh.indices[f * 3]], b = remap[mesh.indices[f * 3 + 1]], c = remap[mesh.indices[f * 3 + 2]];
    if (a === b || b === c || a === c) { degenerate++; continue; }
    union(a, b); union(b, c);
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const k = `${p},${q}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: verts=${mesh.vertexCount} tris=${mesh.triangleCount} ` +
    `degen=${degenerate} multiEdges=${multi} unmatched=${unmatched} components=${roots.size}` +
    `${expectComponents !== undefined ? `/${expectComponents}` : ''} vol=${(vol / 1000).toFixed(1)}cm3`);
  return ok;
}

function run(label: string, mutate: (v: typeof DEFAULT_PARAMETERS) => void): boolean {
  const vase = structuredClone(DEFAULT_PARAMETERS);
  mutate(vase);
  const mold = structuredClone(DEFAULT_MOLD_PARAMETERS);
  const m = generatePourThreePieceMold(vase, mold);
  console.log(`\n── ${label} (forcedRound=${m.forcedRound}, halvesIdentical=${m.halvesIdentical})`);
  let ok = true;
  // shellA/B: swept arc + 2 seam blocks = 3 overlapping closed solids
  ok = check('shellA', m.shellA, 3) && ok;
  ok = check('shellB', m.shellB, 3) && ok;
  ok = check('center', m.center) && ok;
  return ok;
}

let ok = true;
ok = run('Circle (default)', () => {}) && ok;
ok = run('Rectangle1 (shape-following, x/−y trap)', (v) => { v.bottomShape = 'Rectangle1'; v.topShape = 'Rectangle1'; }) && ok;
// Was Egg1 until 2026-10-10 — but Egg1 is two eggs tip to tip touching at the
// polar origin, so its VASE is already non-manifold; it never tested an egg.
ok = run('Egg2 (asymmetric contour)', (v) => { v.bottomShape = 'Egg2'; v.topShape = 'Egg2'; }) && ok;
ok = run('Low radial res (rRes=90)', (v) => { v.resolution.radial = 90; }) && ok;

console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
process.exit(ok ? 0 : 1);
