/**
 * Well-collar fit check (rewritten 2026-08-08).
 *
 * The wall drops vertically onto the horizontal well cylinders; each opening is
 * ringed by a collar boss standing `wellSealDepth` proud of the wall's inner
 * face, and the cylinder runs through its D-bore. What keeps plaster out from
 * under the handle there is DEPTH OF ENGAGEMENT at a tight clearance — until
 * 2026-08-08 the bore also carried a V ring seating into a groove around the
 * cylinder, which sealed but filled with plaster and was very hard to clean.
 *
 * So the invariants now are:
 *   1. the bore is a plain straight cylinder — no neck anywhere along it
 *   2. the cylinder is likewise straight — no groove left behind
 *   3. bore radius − cylinder radius = Fit Clearance (the ONE clearance number,
 *      shared with the plate pocket; it was a separate hard-coded 0.25 before)
 *   4. the boss engages the cylinder over `wellSealDepth`, clamped so the bore
 *      never runs past the straight cylinder onto the transition's taper
 *
 * Both parts are measured the same way: slice by x and watch the y-extent, so
 * neither the axis nor the radius has to be known analytically.
 * Run: npx tsx --tsconfig tsconfig.json <this file>
 */
import { DEFAULT_HANDLE_PARAMETERS, type HandleParameters } from '@/engine/handle/handle-types';
import { generateHandleMold } from '@/engine/handle/handle-generator';
import type { VaseMesh } from '@/engine/types';

type V3 = [number, number, number];
function verts(mesh: VaseMesh): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < mesh.vertexCount; i++) {
    out.push([mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]);
  }
  return out;
}
const key = (x: number) => Math.round(x * 100) / 100;

/**
 * y-extent per x-station for vertices passing `keep`.
 *
 * Sparse stations are dropped. The well's PULL RIB is a narrower prism living
 * INSIDE the bore, and its two rings carry about half as many vertices as a
 * cylinder ring — so without this its stations read as a pinch in a cylinder
 * that is in fact perfectly straight. Filtering by ring size rather than by
 * position keeps the check independent of where the rib is placed.
 */
function extents(vs: V3[], keep: (v: V3) => boolean): Map<number, [number, number]> {
  const m2 = new Map<number, [number, number]>();
  const count = new Map<number, number>();
  for (const v of vs) {
    if (!keep(v)) continue;
    const k = key(v[0]);
    count.set(k, (count.get(k) ?? 0) + 1);
    const cur = m2.get(k);
    if (!cur) m2.set(k, [v[1], v[1]]);
    else m2.set(k, [Math.min(cur[0], v[1]), Math.max(cur[1], v[1])]);
  }
  let most = 0;
  count.forEach((n) => { if (n > most) most = n; });
  m2.forEach((_, k) => { if ((count.get(k) ?? 0) < most * 0.6) m2.delete(k); });
  return m2;
}

let ok = true;
const say = (pass: boolean, msg: string) => { if (!pass) ok = false; console.log(`${pass ? 'PASS' : 'FAIL'}  ${msg}`); };

function run(label: string, p: HandleParameters): void {
  const m = generateHandleMold(p);

  // ── Master: the well cylinder's y-extent along its length ──
  const MV = verts(m.master);
  const xMin = Math.min(...MV.map((v) => v[0]));
  const ys = MV.map((v) => v[1]);
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  // ONE well only (y < midY): both sit at the same x range, so an unrestricted
  // slice spans the pair and measures the gap between them. Stay above the
  // skirt so the flat bottom doesn't widen the slice.
  const cylZone = (v: V3) => v[0] < xMin + p.cylinderLength - 0.5 && v[2] > 0.5 && v[1] < midY;
  const mExt = extents(MV, cylZone);
  let cylWide = 0, cylNarrow = Infinity, axisY = 0;
  mExt.forEach(([lo, hi]) => {
    const w = hi - lo;
    if (w > cylWide) { cylWide = w; axisY = (lo + hi) / 2; }
    if (w < cylNarrow) cylNarrow = w;
  });
  say(cylWide - cylNarrow < 0.02,
    `${label} — cylinder is straight: ⌀ ${cylNarrow.toFixed(3)}–${cylWide.toFixed(3)} mm (no groove)`);

  // ── Wall: the collar's D-bore over the same run ──
  const WV = verts(m.wall);
  const boreZone = (v: V3) => v[2] > 0.5 && Math.abs(v[1] - axisY) < p.openingDiameter / 2 + 1;
  const wExt = extents(WV, boreZone);
  let boreWide = 0, boreNarrow = Infinity, x0 = Infinity, x1 = -Infinity;
  wExt.forEach(([lo, hi], x) => {
    const w = hi - lo;
    if (w > boreWide) boreWide = w;
    if (w < boreNarrow) boreNarrow = w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  });
  say(boreWide - boreNarrow < 0.02,
    `${label} — bore is straight: ⌀ ${boreNarrow.toFixed(3)}–${boreWide.toFixed(3)} mm (no ring)`);

  const clr = (boreWide - cylWide) / 2;
  say(Math.abs(clr - p.recessClearance) < 0.01,
    `${label} — bore clearance ${clr.toFixed(3)} mm = Fit Clearance ${p.recessClearance}`);

  // Engagement: the boss reaches `sealDepth` past the wall's inner face, and
  // the whole of it has to sit on the straight cylinder.
  const expect = Math.max(0, Math.min(p.wellSealDepth, p.cylinderLength - 2));
  const engaged = x1 - (x0 + 0.2); // the boss is embedded EMBED = 0.2 into the panel
  say(Math.abs(engaged - expect) < 0.02 && engaged <= p.cylinderLength - 0.5,
    `${label} — collar engages ${engaged.toFixed(2)} mm of the ${p.cylinderLength} mm cylinder (expect ${expect})`);
}

run('default', DEFAULT_HANDLE_PARAMETERS);
for (const [name, over] of [
  ['tight fit', { recessClearance: 0.05 }],
  ['loose fit', { recessClearance: 0.4 }],
  ['deep seal', { wellSealDepth: 5 }],
  ['seal clamped by a short cylinder', { wellSealDepth: 8, cylinderLength: 5 }],
  ['big opening', { openingDiameter: 26 }],
] as [string, Partial<HandleParameters>][]) {
  run(name, { ...DEFAULT_HANDLE_PARAMETERS, ...over });
}

console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
process.exit(ok ? 0 : 1);
