/**
 * Is a part a printable solid? Positions are welded (0.1 µm grid); then each
 * edge must be crossed as often in one direction as in the other. A hole
 * leaves an edge crossed once, a flipped triangle crosses its edges the wrong
 * way, and both break the balance. A positive signed volume means the
 * triangles face outward. Coordinates must all be finite.
 *
 * Balanced, not strictly manifold, on purpose: a part the app exports is
 * often several closed solids in one mesh (a master's body, handle and ribs
 * touch or overlap; the slicer unions them), and solids that touch along an
 * edge share it 2 + 2 — `shared` counts those, for information. Splitting a
 * part by its own index connectivity does not work either: a generator joins
 * the pieces of ONE solid (a side strip and its caps) by position only.
 */
import type { VaseMesh } from '@/engine/types';

export interface SolidReport { finite: boolean; triangles: number; open: number; shared: number; volume: number }

export function solidReport(m: VaseMesh): SolidReport {
  const P = m.positions, I = m.indices;
  const finite = P.every(Number.isFinite);
  const id = new Map<string, number>();
  const weld = new Uint32Array(P.length / 3);
  for (let i = 0; i < weld.length; i++) {
    const k = `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
    let w = id.get(k);
    if (w === undefined) { w = id.size; id.set(k, w); }
    weld[i] = w;
  }
  const edges = new Map<number, number>();               // directed edge → count
  const key = (a: number, b: number) => a * 4294967296 + b;
  let volume = 0;
  for (let f = 0; f < I.length; f += 3) {
    const a = weld[I[f]], b = weld[I[f + 1]], c = weld[I[f + 2]];
    if (a === b || b === c || c === a) continue;          // degenerate after welding
    for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.set(key(u, v), (edges.get(key(u, v)) ?? 0) + 1);
    const A = I[f] * 3, B = I[f + 1] * 3, C = I[f + 2] * 3;
    volume += (P[A] * (P[B + 1] * P[C + 2] - P[B + 2] * P[C + 1])
      - P[A + 1] * (P[B] * P[C + 2] - P[B + 2] * P[C])
      + P[A + 2] * (P[B] * P[C + 1] - P[B + 1] * P[C])) / 6;
  }
  let open = 0, shared = 0;
  edges.forEach((n, k) => {
    const a = Math.floor(k / 4294967296), b = k % 4294967296;
    if (a > b) return;                                     // each pair once
    const back = edges.get(key(b, a)) ?? 0;
    if (n !== back) open++;
    else if (n > 1) shared++;
  });
  return { finite, triangles: I.length / 3, open, shared, volume };
}

export const isSolid = (r: SolidReport) => r.finite && r.triangles > 0 && r.open === 0 && r.volume > 0;

export const describe = (r: SolidReport) => r.finite
  ? `${r.triangles} triangles, ${r.open} unbalanced edges, volume ${r.volume.toFixed(1)} mm³`
  : 'NON-FINITE coordinates (NaN or Infinity)';
