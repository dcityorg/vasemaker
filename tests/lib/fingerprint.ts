/**
 * Mesh fingerprints for the golden checks: "did this geometry change?"
 *
 * Not a hash of the float bytes. A byte hash flips when a Node update changes
 * the last bit of a Math.sin, and a hash of ROUNDED values still flips
 * whenever a value sits on a rounding boundary. So the fingerprint keeps
 * numbers, and compare() treats anything under EPS (1 µm) as noise:
 *  - counts and the triangle index list (integers): exact;
 *  - bounding box and 128 sampled vertices: each within EPS;
 *  - the sum of x, y and z over all vertices: within 2·EPS, so ONE coordinate
 *    anywhere moved 3 µm or more is caught, sampled or not;
 *  - the sums of squares, the area and the signed volume: within an EPS-sized
 *    allowance for their units (mm², mm², mm³).
 * Positions are float32: one float32 step at 100 mm is ~0.01 µm, and what a
 * Node or CPU change can do to a double is flip a few of those steps at
 * random (about one float32 in 10⁹); 10 % of all coordinates flipped still
 * passes. A real geometry change moves vertices by far more than 3 µm (a
 * print layer is ~100 µm).
 * tests/checks/golden.ts runs the negative controls for both claims.
 */
import { createHash } from 'crypto';
import type { VaseMesh } from '@/engine/types';

export const EPS = 1e-3;   // mm
const SAMPLES = 128;

export interface Fingerprint {
  v: number; t: number; idx: string;
  bbox: number[]; area: number; volume: number;
  m1: number[]; m2: number[]; samples: number[];
}

export function isMesh(x: unknown): x is VaseMesh {
  return !!x && typeof x === 'object' && (x as VaseMesh).positions instanceof Float32Array && (x as VaseMesh).indices instanceof Uint32Array;
}

export function fingerprint(m: VaseMesh): Fingerprint {
  const P = m.positions, I = m.indices, v = P.length / 3, t = I.length / 3;
  const bbox = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const m1 = [0, 0, 0], m2 = [0, 0, 0];
  for (let i = 0; i < v; i++) for (let k = 0; k < 3; k++) {
    const c = P[i * 3 + k];
    bbox[k] = Math.min(bbox[k], c); bbox[k + 3] = Math.max(bbox[k + 3], c);
    m1[k] += c; m2[k] += c * c;
  }
  let area = 0, volume = 0;
  for (let f = 0; f < t; f++) {
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    area += Math.hypot(nx, ny, nz) / 2;
    volume += (P[a] * nx + P[a + 1] * ny + P[a + 2] * nz) / 6;
  }
  const samples: number[] = [];
  const n = Math.min(SAMPLES, v);
  for (let s = 0; s < n; s++) {
    const i = Math.floor((s * v) / n);
    samples.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  }
  const idx = createHash('sha1').update(Buffer.from(I.buffer, I.byteOffset, I.byteLength)).digest('hex').slice(0, 16);
  return { v, t, idx, bbox, area, volume, m1, m2, samples };
}

/** Every difference that is more than noise, as readable lines; [] = same. */
export function compare(got: Fingerprint, want: Fingerprint): string[] {
  if (got.v !== want.v || got.t !== want.t) return [`${want.v} vertices / ${want.t} triangles → ${got.v} / ${got.t}`];
  const out: string[] = [];
  if (got.idx !== want.idx) out.push('triangle list changed (same counts)');
  const R = Math.max(...want.bbox.map(Math.abs), 1);          // largest coordinate, mm
  const far = (a: number, b: number, tol: number) => !(Math.abs(a - b) <= tol);   // NaN counts as far
  const bb = want.bbox.findIndex((w, k) => far(got.bbox[k], w, EPS));
  if (bb >= 0) out.push(`bounding box ${['x min', 'y min', 'z min', 'x max', 'y max', 'z max'][bb]} ${want.bbox[bb]} → ${got.bbox[bb]}`);
  let moved = 0, worst = 0;
  for (let k = 0; k < want.samples.length; k += 3) {
    const d = Math.hypot(got.samples[k] - want.samples[k], got.samples[k + 1] - want.samples[k + 1], got.samples[k + 2] - want.samples[k + 2]);
    if (!(d <= EPS)) { moved++; worst = Math.max(worst, Number.isNaN(d) ? Infinity : d); }
  }
  if (moved) out.push(`${moved} of ${want.samples.length / 3} sampled vertices moved, up to ${worst.toPrecision(3)} mm`);
  const axis = ['x', 'y', 'z'];
  const m1 = want.m1.findIndex((w, k) => far(got.m1[k], w, 2 * EPS));
  if (m1 >= 0) out.push(`sum of ${axis[m1]} ${want.m1[m1].toFixed(4)} → ${got.m1[m1].toFixed(4)} (a vertex moved)`);
  const m2 = want.m2.findIndex((w, k) => far(got.m2[k], w, 4 * R * EPS));
  if (m2 >= 0) out.push(`sum of ${axis[m2]}² changed by ${(got.m2[m2] - want.m2[m2]).toPrecision(3)}`);
  if (far(got.area, want.area, R * EPS)) out.push(`area ${want.area.toFixed(4)} → ${got.area.toFixed(4)} mm²`);
  if (far(got.volume, want.volume, R * R * EPS)) out.push(`volume ${want.volume.toFixed(4)} → ${got.volume.toFixed(4)} mm³`);
  return out;
}

/** Every mesh in a generator's result, by path (three levels deep; `debug` skipped). */
export function meshesOf(x: unknown, path = '', depth = 0): [string, VaseMesh][] {
  if (isMesh(x)) return [[path || 'mesh', x]];
  if (!x || typeof x !== 'object' || ArrayBuffer.isView(x) || depth >= 3) return [];
  const entries: [string, unknown][] = Array.isArray(x)
    ? x.map((v, i) => [`[${i}]`, v])
    : Object.entries(x).filter(([k]) => k !== 'debug').map(([k, v]) => [path ? `.${k}` : k, v]);
  return entries.flatMap(([k, v]) => meshesOf(v, path + k, depth + 1));
}
