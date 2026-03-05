/**
 * Noise functions — deterministic hash, Voronoi, Simplex, and wood grain.
 * Pure math with no external dependencies.
 *
 * Used by textures.ts and mesh-generator.ts for surface displacement.
 */

import { sinD } from '@/lib/math-utils';

/**
 * Deterministic 2D hash returning two values in [0, 1).
 * Uses a pair of large primes for mixing — no trig, no sin().
 */
export function hash2D(ix: number, iy: number, seed: number): [number, number] {
  let h = ix * 374761393 + iy * 668265263 + seed * 1274126177;
  h = ((h ^ (h >> 13)) * 1103515245 + 12345) | 0;
  const a = (h & 0x7fffffff) / 0x7fffffff;
  h = ((h ^ (h >> 13)) * 1103515245 + 12345) | 0;
  const b = (h & 0x7fffffff) / 0x7fffffff;
  return [a, b];
}

/**
 * Compute Voronoi cell value (0–1) at a point in cell-space.
 * Returns 1 at cell centers, 0 at edges.
 * @param u - horizontal position in cell-space (wraps at cellsU)
 * @param w - vertical position in cell-space
 * @param cellsU - number of cells around circumference (for wrapping)
 * @param seed - random seed for pattern variation
 * @param edgeWidth - edge sharpness (0 = smooth, 1 = sharp)
 */
export function voronoiCell(
  u: number, w: number, cellsU: number, seed: number, edgeWidth: number
): number {
  const cellX = Math.floor(u);
  const cellY = Math.floor(w);

  let d1 = 1e10; // nearest seed distance
  let d2 = 1e10; // second nearest

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      let nx = cellX + dx;
      const ny = cellY + dy;

      // Wrap horizontally for seamless 0/360
      let wrappedNx = nx;
      if (wrappedNx < 0) wrappedNx += cellsU;
      else if (wrappedNx >= cellsU) wrappedNx -= cellsU;

      const [jx, jy] = hash2D(wrappedNx, ny, seed);
      const seedU = nx + jx;
      const seedW = ny + jy;

      const ddx = u - seedU;
      const ddy = w - seedW;
      const dist = ddx * ddx + ddy * ddy;

      if (dist < d1) {
        d2 = d1;
        d1 = dist;
      } else if (dist < d2) {
        d2 = dist;
      }
    }
  }

  // Edge detection: difference between second-nearest and nearest
  const diff = Math.sqrt(d2) - Math.sqrt(d1);
  // Smoothstep with edgeWidth controlling transition width
  const edge = 0.05 + (1 - edgeWidth) * 0.45; // range 0.05 (sharp) to 0.5 (smooth)
  const t = Math.min(diff / edge, 1);
  return t * t * (3 - 2 * t); // smoothstep
}

// ============================================================
// 3D Simplex Noise (from scratch, no dependencies)
// ============================================================

/** 12 gradient vectors for 3D simplex noise */
export const GRAD3: [number, number, number][] = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

export const F3 = 1 / 3;
export const G3 = 1 / 6;

/** Build a seeded permutation table (512 entries, wrapping) */
export function buildPermTable(seed: number): Uint8Array {
  const p = new Uint8Array(512);
  // Initialize 0–255
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle seeded by seed
  let s = seed * 2654435761 + 2246822519;
  for (let i = 255; i > 0; i--) {
    s = ((s ^ (s >> 13)) * 1103515245 + 12345) | 0;
    const j = (s & 0x7fffffff) % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  // Duplicate for wrapping
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  return p;
}

/** 3D simplex noise, returns value in approximately [-1, 1] */
export function simplex3D(x: number, y: number, z: number, perm: Uint8Array): number {
  // Skew input space to determine which simplex cell we're in
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);

  const t = (i + j + k) * G3;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const z0 = z - (k - t);

  // Determine which simplex we're in (6 possible tetrahedra)
  let i1: number, j1: number, k1: number;
  let i2: number, j2: number, k2: number;
  if (x0 >= y0) {
    if (y0 >= z0)      { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
    else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
    else               { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
  } else {
    if (y0 < z0)       { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
    else if (x0 < z0)  { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
    else               { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  let n = 0;

  let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
  if (t0 > 0) {
    const g = GRAD3[perm[ii + perm[jj + perm[kk]]] % 12];
    t0 *= t0;
    n += t0 * t0 * (g[0]*x0 + g[1]*y0 + g[2]*z0);
  }

  let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
  if (t1 > 0) {
    const g = GRAD3[perm[ii+i1 + perm[jj+j1 + perm[kk+k1]]] % 12];
    t1 *= t1;
    n += t1 * t1 * (g[0]*x1 + g[1]*y1 + g[2]*z1);
  }

  let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
  if (t2 > 0) {
    const g = GRAD3[perm[ii+i2 + perm[jj+j2 + perm[kk+k2]]] % 12];
    t2 *= t2;
    n += t2 * t2 * (g[0]*x2 + g[1]*y2 + g[2]*z2);
  }

  let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
  if (t3 > 0) {
    const g = GRAD3[perm[ii+1 + perm[jj+1 + perm[kk+1]]] % 12];
    t3 *= t3;
    n += t3 * t3 * (g[0]*x3 + g[1]*y3 + g[2]*z3);
  }

  return 32 * n; // Scale to approximately [-1, 1]
}

/** Fractal Brownian Motion — layer multiple octaves of simplex noise */
export function fbm3D(
  x: number, y: number, z: number,
  octaves: number, persistence: number, lacunarity: number,
  perm: Uint8Array
): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;
  for (let i = 0; i < octaves; i++) {
    total += amplitude * simplex3D(x * frequency, y * frequency, z * frequency, perm);
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return total / maxAmplitude; // Normalize to [-1, 1]
}

/**
 * Wood grain texture — vertical streaks with organic wobble.
 * Uses simplex noise to perturb horizontal stripe positions so they
 * meander side-to-side like flat-sawn wood grain.
 *
 * @param u - horizontal position (angle mapped to 0..count)
 * @param v - vertical position (height 0..1, scaled by aspect ratio)
 * @param count - number of grain lines
 * @param wobble - how much lines meander (0–1)
 * @param sharpness - edge sharpness (0=soft grooves, 1=sharp lines)
 * @param perm - simplex permutation table
 * @returns value in [-1, 0] — negative = groove inward
 */
export function woodGrain(
  u: number, v: number, count: number,
  wobble: number, sharpness: number, perm: Uint8Array
): number {
  // Wobble the horizontal position using simplex noise seeded by height.
  // Use two octaves at different scales for organic irregularity.
  const wobbleAmount = wobble * count * 0.3;
  const warp = wobbleAmount * (
    0.7 * simplex3D(u * 0.5, v * 4, 0, perm)
    + 0.3 * simplex3D(u * 1.2, v * 8, 3.7, perm)
  );

  // Vary stripe width using a slower noise field
  const widthVar = 0.3 * simplex3D(u * 0.3, v * 2, 7.1, perm);

  // Sine wave for the base stripe pattern
  const phase = (u + warp) * Math.PI * 2;
  const raw = Math.sin(phase); // -1 to 1

  // Threshold to create distinct grooves.
  // Map sharpness: 0 = gentle sine, 1 = hard binary edge.
  // The threshold shifts by widthVar to create varying widths.
  const threshold = 0.2 + widthVar;
  const edge = 0.05 + (1 - sharpness) * 0.6; // transition width
  const t = (raw - threshold) / edge;
  const groove = Math.max(0, Math.min(1, t * 0.5 + 0.5));

  return -(1 - groove); // negative = inward groove, 0 = flush
}
