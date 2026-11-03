import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { DEFAULT_MOLD_PARAMETERS } from '@/engine/mold/mold-types';
import { generatePourTwoPieceMold } from '@/engine/mold/pour-two-piece-generator';
import { signedVolume } from '@/engine/handle/mesh3';
import type { VaseMesh } from '@/engine/types';

function check(name: string, mesh: VaseMesh, expect?: number) {
  const map = new Map<string, number>(); const remap = new Array<number>(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const k = `${mesh.positions[i*3].toFixed(4)},${mesh.positions[i*3+1].toFixed(4)},${mesh.positions[i*3+2].toFixed(4)}`;
    const s = map.get(k); if (s === undefined) { map.set(k, i); remap[i] = i; } else remap[i] = s;
  }
  const parent = Array.from({length: mesh.vertexCount}, (_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const uni = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) parent[x] = y; };
  const edges = new Map<string, number>(); let degen = 0;
  for (let f = 0; f < mesh.triangleCount; f++) {
    const a = remap[mesh.indices[f*3]], b = remap[mesh.indices[f*3+1]], c = remap[mesh.indices[f*3+2]];
    if (a === b || b === c || a === c) { degen++; continue; }
    uni(a,b); uni(b,c);
    for (const [p,q] of [[a,b],[b,c],[c,a]] as const) edges.set(`${p},${q}`, (edges.get(`${p},${q}`) ?? 0) + 1);
  }
  let multi = 0, unmatched = 0;
  edges.forEach((n, k) => { if (n !== 1) multi++; const [p,q] = k.split(','); if (!edges.has(`${q},${p}`)) unmatched++; });
  const roots = new Set<number>();
  for (let i = 0; i < mesh.vertexCount; i++) if (remap[i] === i) roots.add(find(i));
  const vol = signedVolume(mesh);
  const bad = expect !== undefined && roots.size !== expect;
  const ok = multi === 0 && unmatched === 0 && degen === 0 && vol > 0 && !bad;
  console.log(`${ok?'PASS':'FAIL'}  ${name}: degen=${degen} multi=${multi} unmatched=${unmatched} comps=${roots.size}${expect!==undefined?`/${expect}`:''} vol=${(vol/1000).toFixed(1)}cm3`);
  return ok;
}
let ok = true;
for (const [label, shape] of [['Circle','Circle1'],['Rectangle1','Rectangle1']] as const) {
  const v = structuredClone(DEFAULT_PARAMETERS); v.bottomShape = shape as never; v.topShape = shape as never;
  const m = generatePourTwoPieceMold(v, structuredClone(DEFAULT_MOLD_PARAMETERS));
  console.log(`\n── Pour 2-Pc ${label}`);
  ok = check('center', m.center, 5) && ok;   // vessel + slab + 3 ridges
  ok = check('shell', m.shell, 1) && ok;
}
console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
