/** Quick manifold + component sanity over defaults and every preset. */
import { DEFAULT_HANDLE_PARAMETERS, type HandleParameters } from '@/engine/handle/handle-types';
import { HANDLE_PRESETS } from '@/config/handle-presets';
import { generateHandleMold } from '@/engine/handle/handle-generator';
import { signedVolume } from '@/engine/handle/mesh3';
import type { VaseMesh } from '@/engine/types';

function check(name: string, mesh: VaseMesh, expect?: number): boolean {
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
    for (const [x, y] of [[a, b], [b, c], [c, a]] as const) edges.set(`${x},${y}`, (edges.get(`${x},${y}`) ?? 0) + 1);
  }
  let multi = 0, unmatched = 0;
  for (const [k, n] of edges) {
    if (n !== 1) multi++;
    const [x, y] = k.split(',');
    if (!edges.has(`${y},${x}`)) unmatched++;
  }
  const roots = new Set<number>();
  for (let i = 0; i < mesh.vertexCount; i++) if (remap[i] === i) roots.add(find(i));
  const vol = signedVolume(mesh);
  const bad = expect !== undefined && roots.size !== expect;
  const ok = multi === 0 && unmatched === 0 && degenerate === 0 && vol > 0 && !bad;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: tris=${mesh.triangleCount} degen=${degenerate} multi=${multi} unmatched=${unmatched} comps=${roots.size}${expect !== undefined ? '/' + expect : ''} vol=${(vol / 1000).toFixed(2)}cm3`);
  return ok;
}

let ok = true;
const cases: [string, Partial<HandleParameters>][] = [
  ['default', {}],
  ...HANDLE_PRESETS.map((p) => [p.name, p.params] as [string, Partial<HandleParameters>]),
  ['short well', { cylinderLength: 4, coneLength: 6 }],
  ['fat handle', { width: 22, thickness: 18 }],
  ['thin handle', { width: 8, thickness: 6 }],
  ['big opening', { openingDiameter: 26 }],
  ['seat 6 / shell 3', { seatDepth: 6, masterShellThickness: 3 }],
  ['seat 0.5', { seatDepth: 0.5 }],
  ['wellSeal 8', { wellSealDepth: 8 }],
  ['clr 0', { recessClearance: 0 }],
  ['steep hook', {
    spinePoints: [[0, -17.5], [30, 11], [55, 41], [30, 82], [0, 63]],
    spineTypes: ['fixed', 'handle', 'handle', 'handle', 'fixed'],
    width: 9, thickness: 16,
  }],
  ['narrow strap, steep out', {
    spinePoints: [[0, 0], [34, -20], [60, 32], [34, 84], [0, 64]],
    spineTypes: ['fixed', 'handle', 'handle', 'handle', 'fixed'],
    width: 7, thickness: 18,
  }],
];
for (const [name, over] of cases) {
  const m = generateHandleMold({ ...DEFAULT_HANDLE_PARAMETERS, ...over });
  ok = check(`${name} master`, m.master) && ok;
  ok = check(`${name} plate`, m.plate) && ok;
  ok = check(`${name} wall`, m.wall, 6) && ok;
  if (m.masterB) ok = check(`${name} masterB`, m.masterB) && ok;
  if (m.plateB) ok = check(`${name} plateB`, m.plateB) && ok;
}
console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
process.exit(ok ? 0 : 1);
