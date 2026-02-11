/**
 * Mesh generator — the core of VaseMaker.
 * Takes VaseParameters, generates a triangle mesh as typed arrays.
 *
 * Ported from the makeObject() module in VaseMaker13 A.scad.
 * Instead of building individual polyhedron pie-slices, we build a shared
 * vertex grid and index buffer, which is far more efficient for Three.js.
 *
 * When wallThickness > 0, produces a solid shell with:
 * - Outer surface (same as thin wall)
 * - Inner surface (radius reduced by wallThickness, reversed winding)
 * - Bottom cap (solid base connecting outer/inner at the bottom)
 * - Rim at top (flat strip or rounded half-torus connecting outer/inner)
 *
 * When wallThickness === 0 and bottomThickness > 0, adds a simple disc cap at z=0.
 */

import type { VaseParameters, VaseMesh } from './types';
import { evaluateBezier, evaluateBezierScalar } from './bezier';
import { getShapeFunction } from './shapes';
import {
  sineTwist,
  radialRipple,
  verticalRipple,
  verticalSmoothing,
  radialSmoothing,
} from './modifiers';
import { sinD, cosD } from '@/lib/math-utils';

/** Minimum inner radius to prevent self-intersection */
const MIN_INNER_RADIUS = 0.1;

/**
 * Deterministic 2D hash returning two values in [0,1).
 * Uses a pair of large primes for mixing — no trig, no sin().
 */
function hash2D(ix: number, iy: number, seed: number): [number, number] {
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
function voronoiCell(
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
const GRAD3: [number, number, number][] = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

/** Build a seeded permutation table (512 entries, wrapping) */
function buildPermTable(seed: number): Uint8Array {
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

const F3 = 1 / 3;
const G3 = 1 / 6;

/** 3D simplex noise, returns value in approximately [-1, 1] */
function simplex3D(x: number, y: number, z: number, perm: Uint8Array): number {
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
function fbm3D(
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
function woodGrain(
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

// ============================================================
// SVG Pattern sampling — pixel data set externally by use-vase-mesh.ts
// ============================================================

/** Cached SVG pattern pixel data (module-level, set externally) */
let svgPatternData: { pixels: Uint8Array; width: number; height: number } | null = null;

/** Set the rasterized SVG pixel data for sampling. Called from use-vase-mesh.ts. */
export function setSvgPatternData(data: { pixels: Uint8Array; width: number; height: number } | null): void {
  svgPatternData = data;
}

/**
 * Sample the SVG pattern with bilinear interpolation.
 * @param u - horizontal tile coordinate (0–1 within one tile)
 * @param v - vertical tile coordinate (0–1 within one tile)
 * @returns brightness 0–1 (0 = black, 1 = white)
 */
function sampleSvgPattern(u: number, v: number): number {
  if (!svgPatternData) return 0;
  const { pixels, width, height } = svgPatternData;

  // Map to pixel coordinates (tile wraps via modulo already applied by caller)
  const px = u * (width - 1);
  const py = v * (height - 1);

  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);

  const fx = px - x0;
  const fy = py - y0;

  const p00 = pixels[y0 * width + x0];
  const p10 = pixels[y0 * width + x1];
  const p01 = pixels[y1 * width + x0];
  const p11 = pixels[y1 * width + x1];

  const top = p00 + (p10 - p00) * fx;
  const bottom = p01 + (p11 - p01) * fx;
  return (top + (bottom - top) * fy) / 255;
}

/** Number of intermediate rings for rounded rim */
const RIM_STEPS = 5;

/**
 * Precomputed per-row data that is shared between outer and inner surface generation.
 * Extracted to avoid recomputing for the inner surface.
 */
interface RowContext {
  m: number;        // parametric height 0–1
  shapeRadius: number;
  height: number;
  v: number;        // normalized height 0–1
  centerX: number;
  centerY: number;
  twistAngle: number;
  vSmooth: number;
}

/**
 * Generate the vase mesh from parameters.
 * This is the main entry point — equivalent to makeObject() in OpenSCAD.
 */
export function generateMesh(params: VaseParameters): VaseMesh {
  const resolution = params.resolution;
  const vRes = resolution.vertical;
  const rRes = resolution.radial;
  const wt = params.wallThickness;
  const bt = params.bottomThickness;
  const hasShell = wt > 0;
  const hasBase = bt > 0;

  // Master textures gate (backward compat: treat missing field as enabled)
  const texturesEnabled = params.textures.enabled !== false;

  // Precompute simplex permutation table (once per mesh generation, not per vertex)
  // Shared by simplex texture and wood grain (which uses simplex3D for wobble)
  const simplexPerm = texturesEnabled && params.textures.simplex?.enabled
    ? buildPermTable(params.textures.simplex.seed)
    : null;

  const woodGrainPerm = texturesEnabled && params.textures.woodGrain?.enabled
    ? buildPermTable(params.textures.woodGrain.seed)
    : null;

  // Get shape functions
  const bottomShapeFn = getShapeFunction(params.bottomShape);
  const topShapeFn = getShapeFunction(params.topShape);
  const bottomParams = params.bottomShapeParams[params.bottomShape];
  const topParams = params.topShapeParams[params.topShape];

  // --- Precompute per-row context for all vertical steps ---
  const rowContexts: RowContext[] = [];
  for (let vStep = 0; vStep <= vRes; vStep++) {
    const m = vStep / vRes;
    const profilePoint = params.profileEnabled
      ? evaluateBezier(m, params.profilePoints)
      : [1.0, m];

    const shapeRadius = profilePoint[0] * params.radius;
    const height = profilePoint[1] * params.height;
    const v = height / params.height;

    let centerX = params.fixedOffset.x;
    let centerY = params.fixedOffset.y;
    if (params.morphEnabled) {
      centerX += bottomParams.offsetX * (1 - v) + topParams.offsetX * v;
      centerY += bottomParams.offsetY * (1 - v) + topParams.offsetY * v;
    } else {
      centerX += bottomParams.offsetX;
      centerY += bottomParams.offsetY;
    }

    if (params.bezierOffset.enabled && params.bezierOffset.points.length >= 2) {
      const offsetXPoints = params.bezierOffset.points.map(p => p[0]);
      const offsetYPoints = params.bezierOffset.points.map(p => p[1]);
      centerX += evaluateBezierScalar(v, offsetXPoints) * params.bezierOffset.scaleX;
      centerY += evaluateBezierScalar(v, offsetYPoints) * params.bezierOffset.scaleY;
    }

    let twistAngle = 0;
    if (params.bezierTwist.enabled && params.bezierTwist.points.length >= 2) {
      twistAngle = evaluateBezierScalar(v, params.bezierTwist.points);
    }

    if (params.sineTwist.enabled) {
      twistAngle += sineTwist(v, params.sineTwist.cycles, params.sineTwist.maxDegrees);
    }

    const vSmooth = params.verticalSmoothing.enabled
      ? verticalSmoothing(v, params.verticalSmoothing.cycles, params.verticalSmoothing.startPercent)
      : 1;

    rowContexts.push({ m, shapeRadius, height, v, centerX, centerY, twistAngle, vSmooth });
  }

  /**
   * Compute the radial distance for a given row and angle.
   * When skipTextures is true, texture terms (fluting, basket weave, voronoi, simplex)
   * are zeroed out — used for smooth inner surface calculation.
   */
  function computeRadius(
    row: RowContext, tStep: number, skipTextures: boolean
  ): number {
    const t = tStep * 360 / rRes;

    let shapeValue: number;
    if (params.morphEnabled) {
      const bottomVal = bottomShapeFn(t, bottomParams);
      const topVal = topShapeFn(t, topParams);
      shapeValue = bottomVal * (1 - row.v) + topVal * row.v;
    } else {
      shapeValue = bottomShapeFn(t, bottomParams);
    }

    const rSmooth = params.radialSmoothing.enabled
      ? radialSmoothing(t, params.radialSmoothing.cycles, params.radialSmoothing.offsetAngle)
      : 1;

    const radRipple = params.radialRipple.enabled
      ? radialRipple(row.v, t, params.radialRipple.depth, params.radialRipple.count, 0)
      : 0;

    const vertRipple = params.verticalRipple.enabled
      ? verticalRipple(row.v, params.verticalRipple.depth, params.verticalRipple.count)
      : 0;

    let fluting = 0;
    let basketWeaveVal = 0;
    let voronoi = 0;
    let simplex = 0;
    let woodGrainVal = 0;
    let svgPatternVal = 0;

    if (!skipTextures) {
      fluting = texturesEnabled && params.textures.fluting.enabled
        ? -params.textures.fluting.depth * Math.abs(sinD(params.textures.fluting.count * t))
        : 0;

      basketWeaveVal = texturesEnabled && params.textures.basketWeave.enabled
        ? params.textures.basketWeave.depth * sinD(
            params.textures.basketWeave.waves * t
            + 180 * Math.floor(row.v * params.textures.basketWeave.bands)
          )
        : 0;

      // Voronoi cellular texture
      if (texturesEnabled && params.textures.voronoi?.enabled) {
        const vor = params.textures.voronoi;
        const cellsU = vor.scale;
        const circumference = 2 * Math.PI * params.radius;
        const cellsW = Math.max(1, Math.round(cellsU * params.height / circumference));
        const u = (t / 360) * cellsU;
        const w = row.v * cellsW;
        voronoi = vor.depth * voronoiCell(u, w, cellsU, vor.seed, vor.edgeWidth);
      }

      // Simplex noise texture
      if (texturesEnabled && simplexPerm && params.textures.simplex?.enabled) {
        const sx = params.textures.simplex;
        const angle = t * Math.PI / 180;
        const nx = Math.cos(angle) * sx.scale;
        const ny = Math.sin(angle) * sx.scale;
        const circumference = 2 * Math.PI * params.radius;
        const scaleV = sx.scale * params.height / circumference;
        const nz = row.v * scaleV;
        simplex = sx.depth * fbm3D(nx, ny, nz, sx.octaves, sx.persistence, sx.lacunarity, simplexPerm);
      }

      // Wood grain texture
      if (texturesEnabled && woodGrainPerm && params.textures.woodGrain?.enabled) {
        const wg = params.textures.woodGrain;
        // Map angle to horizontal stripe position (0..count), seamless at 0/360
        const wgU = (t / 360) * wg.count;
        // Aspect-ratio-corrected vertical coordinate
        const circumference = 2 * Math.PI * params.radius;
        const vScaled = row.v * (params.height / circumference) * wg.count;
        woodGrainVal = wg.depth * woodGrain(wgU, vScaled, wg.count, wg.wobble, wg.sharpness, woodGrainPerm);
      }

      // SVG pattern texture
      if (texturesEnabled && svgPatternData && params.textures.svgPattern?.enabled && params.textures.svgPattern.svgText) {
        const sp = params.textures.svgPattern;
        // Integer tile counts guarantee seamless wrapping at 0/360 and top/bottom
        const tileU = ((t / 360) * sp.repeatX) % 1;
        const tileV = (row.v * sp.repeatY) % 1;
        const brightness = sampleSvgPattern(tileU, tileV);
        // Black areas = grooves (negative offset), white = flush
        svgPatternVal = -sp.depth * (sp.invert ? brightness : 1 - brightness);
      }
    }

    return shapeValue * row.shapeRadius
      + radRipple * row.vSmooth * rSmooth
      + vertRipple * row.vSmooth * rSmooth
      + fluting
      + basketWeaveVal
      + voronoi
      + simplex
      + woodGrainVal
      + svgPatternVal;
  }

  /**
   * Compute a single vertex position for a given row and angle, with an optional
   * radial offset (negative = inward for inner wall).
   */
  function computeVertex(
    row: RowContext, tStep: number, radiusOffset: number, zOverride?: number
  ): [number, number, number] {
    const t = tStep * 360 / rRes;
    let radius = Math.max(computeRadius(row, tStep, false) + radiusOffset, MIN_INNER_RADIUS);

    let x = radius * cosD(t) + row.centerX;
    let y = radius * sinD(t) + row.centerY;
    const z = zOverride !== undefined ? zOverride : row.height;

    if (row.twistAngle !== 0) {
      const cosR = cosD(row.twistAngle);
      const sinR = sinD(row.twistAngle);
      const rx = x * cosR - y * sinR;
      const ry = y * cosR + x * sinR;
      x = rx;
      y = ry;
    }

    return [x, y, z];
  }

  /**
   * Compute cutout factor (0 or 1) for a vertex using a hard threshold.
   * Returns 0 = solid wall, 1 = hole (inner pushed to match outer).
   * Uses a threshold so only areas well inside cells/dark regions become holes,
   * while edges remain fully solid.
   */
  function computeCutoutFactor(row: RowContext, tStep: number): number {
    if (!texturesEnabled) return 0;
    // No cutout in base or rim zone — keeps solid bottom and top intact
    if (hasBase && row.height <= bt) return 0;
    if (hasBase && row.height >= params.height - bt) return 0;
    const t = tStep * 360 / rRes;
    let factor = 0;

    // Voronoi cutout: voronoiCell returns 0 at edges, 1 at cell centers.
    // Threshold at 0.5 — above = hole, below = solid. Smoothstep for clean boundary.
    if (params.textures.voronoi?.enabled && params.textures.voronoi?.cutout) {
      const vor = params.textures.voronoi;
      const cellsU = vor.scale;
      const circumference = 2 * Math.PI * params.radius;
      const cellsW = Math.max(1, Math.round(cellsU * params.height / circumference));
      const u = (t / 360) * cellsU;
      const w = row.v * cellsW;
      const raw = voronoiCell(u, w, cellsU, vor.seed, vor.edgeWidth);
      // Sharp transition: remap 0.3–0.7 → 0–1 with smoothstep
      const lo = 0.3, hi = 0.7;
      const clamped = Math.max(0, Math.min(1, (raw - lo) / (hi - lo)));
      factor = Math.max(factor, clamped * clamped * (3 - 2 * clamped));
    }

    // SVG Pattern cutout: dark areas = hole.
    // Apply similar threshold for clean edges.
    if (svgPatternData && params.textures.svgPattern?.enabled && params.textures.svgPattern?.cutout && params.textures.svgPattern.svgText) {
      const sp = params.textures.svgPattern;
      const tileU = ((t / 360) * sp.repeatX) % 1;
      const tileV = (row.v * sp.repeatY) % 1;
      const brightness = sampleSvgPattern(tileU, tileV);
      const raw = sp.invert ? brightness : 1 - brightness;
      const lo = 0.3, hi = 0.7;
      const clamped = Math.max(0, Math.min(1, (raw - lo) / (hi - lo)));
      factor = Math.max(factor, clamped * clamped * (3 - 2 * clamped));
    }

    return factor;
  }

  /**
   * Compute inner surface vertex with smooth inner logic.
   * When smoothInner is enabled, the inner surface ignores textures and
   * enforces a minimum wall thickness relative to the textured outer surface.
   */
  function computeInnerVertex(
    row: RowContext, tStep: number, zOverride?: number
  ): [number, number, number] {
    const t = tStep * 360 / rRes;
    const smoothInner = params.smoothInner ?? false;
    const outerRadius = computeRadius(row, tStep, false);
    let innerRadius: number;

    if (smoothInner) {
      const smoothRadius = computeRadius(row, tStep, true);
      innerRadius = smoothRadius - wt;
      // Enforce minimum wall thickness
      const minWall = params.minWallThickness ?? 0.4;
      if (outerRadius - innerRadius < minWall) {
        innerRadius = outerRadius - minWall;
      }
    } else {
      innerRadius = outerRadius - wt;
    }

    innerRadius = Math.max(innerRadius, MIN_INNER_RADIUS);

    let x = innerRadius * cosD(t) + row.centerX;
    let y = innerRadius * sinD(t) + row.centerY;
    const z = zOverride !== undefined ? zOverride : row.height;

    if (row.twistAngle !== 0) {
      const cosR = cosD(row.twistAngle);
      const sinR = sinD(row.twistAngle);
      const rx = x * cosR - y * sinR;
      const ry = y * cosR + x * sinR;
      x = rx;
      y = ry;
    }

    return [x, y, z];
  }

  /** Compute twisted center position for a row (for disc center vertices). */
  function computeCenter(row: RowContext): [number, number] {
    let cx = row.centerX;
    let cy = row.centerY;
    if (row.twistAngle !== 0) {
      const cosR = cosD(row.twistAngle);
      const sinR = sinD(row.twistAngle);
      const rx = cx * cosR - cy * sinR;
      const ry = cy * cosR + cx * sinR;
      cx = rx;
      cy = ry;
    }
    return [cx, cy];
  }

  // ============================================================
  // Thin wall mode (wallThickness === 0)
  // ============================================================
  if (!hasShell) {
    const vertRows = vRes + 1;
    const surfaceVerts = vertRows * rRes;
    // Optional base disc: center + ring
    const baseVerts = hasBase ? 1 + rRes : 0;
    const totalVertices = surfaceVerts + baseVerts;

    const positions = new Float32Array(totalVertices * 3);
    const normals = new Float32Array(totalVertices * 3);

    // Surface vertices
    for (let vStep = 0; vStep <= vRes; vStep++) {
      const row = rowContexts[vStep];
      for (let tStep = 0; tStep < rRes; tStep++) {
        const [x, y, z] = computeVertex(row, tStep, 0);
        const idx = (vStep * rRes + tStep) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;
      }
    }

    // Surface quads
    const surfaceQuads = vRes * rRes;
    const baseTris = hasBase ? rRes : 0;
    const totalTris = surfaceQuads * 2 + baseTris;
    const indices = new Uint32Array(totalTris * 3);
    let idxOffset = 0;

    for (let vStep = 0; vStep < vRes; vStep++) {
      for (let tStep = 0; tStep < rRes; tStep++) {
        const tNext = (tStep + 1) % rRes;
        const bl = vStep * rRes + tStep;
        const br = vStep * rRes + tNext;
        const tl = (vStep + 1) * rRes + tStep;
        const tr = (vStep + 1) * rRes + tNext;
        indices[idxOffset++] = bl;
        indices[idxOffset++] = tl;
        indices[idxOffset++] = tr;
        indices[idxOffset++] = bl;
        indices[idxOffset++] = tr;
        indices[idxOffset++] = br;
      }
    }

    // Base disc (simple flat cap at z=0 using bottom row shape)
    if (hasBase) {
      const baseOffset = surfaceVerts;
      const bottomRow = rowContexts[0];
      const [cx, cy] = computeCenter(bottomRow);

      // Center vertex
      const cIdx = baseOffset * 3;
      positions[cIdx] = cx;
      positions[cIdx + 1] = cy;
      positions[cIdx + 2] = 0;

      // Ring vertices matching the outer bottom shape
      for (let tStep = 0; tStep < rRes; tStep++) {
        const [x, y] = computeVertex(bottomRow, tStep, 0);
        const idx = (baseOffset + 1 + tStep) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = 0;
      }

      // Triangle fan — normals pointing down
      const center = baseOffset;
      for (let tStep = 0; tStep < rRes; tStep++) {
        const tNext = (tStep + 1) % rRes;
        const a = baseOffset + 1 + tStep;
        const b = baseOffset + 1 + tNext;
        indices[idxOffset++] = center;
        indices[idxOffset++] = b;
        indices[idxOffset++] = a;
      }
    }

    computeNormals(positions, indices, normals);
    return { positions, normals, indices, vertexCount: totalVertices, triangleCount: totalTris };
  }

  // ============================================================
  // Shell mode (wallThickness > 0)
  // ============================================================

  // Determine the first inner row: if bottomThickness > 0, the inner surface
  // starts at the height corresponding to bottomThickness. Find the first
  // vStep whose height >= bottomThickness.
  let innerStartStep = 0;
  if (hasBase) {
    for (let vStep = 0; vStep <= vRes; vStep++) {
      if (rowContexts[vStep].height >= bt) {
        innerStartStep = vStep;
        break;
      }
      if (vStep === vRes) innerStartStep = vRes; // base thicker than vase
    }
  }

  const outerRows = vRes + 1;         // rows 0..vRes
  const innerRows = vRes + 1 - innerStartStep; // rows innerStartStep..vRes
  const rimSteps = params.rimShape === 'rounded' ? RIM_STEPS : 0;

  // Count vertices for each segment
  const outerVerts = outerRows * rRes;
  const innerVerts = innerRows * rRes;
  const rimVerts = params.rimShape === 'rounded' ? (rimSteps + 1) * rRes : 0;
  const flatRimVerts = params.rimShape === 'flat' ? 2 * rRes : 0;
  // Bottom cap: outer disc at z=0, inner disc at z=innerStartStep height
  const bottomOuterDiscVerts = hasBase ? 1 + rRes : 0;
  const bottomInnerDiscVerts = hasBase ? 1 + rRes : 0;

  const totalVertices = outerVerts + innerVerts + rimVerts
    + bottomOuterDiscVerts + bottomInnerDiscVerts
    + flatRimVerts;

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);

  // Track base offsets for each segment
  let vertexCursor = 0;
  const outerOffset = vertexCursor; vertexCursor += outerVerts;
  const innerOffset = vertexCursor; vertexCursor += innerVerts;
  const rimOffset = vertexCursor; vertexCursor += rimVerts;
  const flatRimOffset = vertexCursor; vertexCursor += flatRimVerts;
  const bottomOuterDiscOffset = vertexCursor; vertexCursor += bottomOuterDiscVerts;
  const bottomInnerDiscOffset = vertexCursor; vertexCursor += bottomInnerDiscVerts;

  // ---- 1. Outer surface vertices ----
  for (let vStep = 0; vStep <= vRes; vStep++) {
    const row = rowContexts[vStep];
    for (let tStep = 0; tStep < rRes; tStep++) {
      const [x, y, z] = computeVertex(row, tStep, 0);
      const idx = (outerOffset + vStep * rRes + tStep) * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }
  }

  // ---- 2. Inner surface vertices ----
  for (let vStep = innerStartStep; vStep <= vRes; vStep++) {
    const row = rowContexts[vStep];
    const innerRow = vStep - innerStartStep;
    for (let tStep = 0; tStep < rRes; tStep++) {
      const [x, y, z] = computeInnerVertex(row, tStep);
      const idx = (innerOffset + innerRow * rRes + tStep) * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }
  }

  // ---- 3. Rounded rim vertices ----
  if (params.rimShape === 'rounded' && rimSteps > 0) {
    const topRow = rowContexts[vRes];
    for (let rStep = 0; rStep <= rimSteps; rStep++) {
      const arcAngle = (rStep / rimSteps) * Math.PI;
      const arcCos = Math.cos(arcAngle);
      const arcSin = Math.sin(arcAngle);

      for (let tStep = 0; tStep < rRes; tStep++) {
        const [ox, oy, oz] = computeVertex(topRow, tStep, 0);
        const [ix, iy, ] = computeInnerVertex(topRow, tStep);

        const mx = (ox + ix) / 2;
        const my = (oy + iy) / 2;
        const dx = (ox - ix) / 2;
        const dy = (oy - iy) / 2;

        const x = mx + dx * arcCos;
        const y = my + dy * arcCos;
        const z = oz + (wt / 2) * arcSin;

        const idx = (rimOffset + rStep * rRes + tStep) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;
      }
    }
  }

  // ---- 4. Flat rim vertices ----
  if (params.rimShape === 'flat') {
    const topRow = rowContexts[vRes];
    for (let tStep = 0; tStep < rRes; tStep++) {
      const [ox, oy, oz] = computeVertex(topRow, tStep, 0);
      const idx0 = (flatRimOffset + tStep) * 3;
      positions[idx0] = ox;
      positions[idx0 + 1] = oy;
      positions[idx0 + 2] = oz;

      const [ix, iy, iz] = computeInnerVertex(topRow, tStep);
      const idx1 = (flatRimOffset + rRes + tStep) * 3;
      positions[idx1] = ix;
      positions[idx1 + 1] = iy;
      positions[idx1 + 2] = iz;
    }
  }

  // ---- 5. Bottom cap vertices ----
  // Outer disc at z=0 closes the bottom visually.
  // Inner disc at innerStartStep height seals the inner cavity.
  if (hasBase) {
    const bottomRow = rowContexts[0];
    const [cx, cy] = computeCenter(bottomRow);

    // Outer disc: center + ring at z=0
    {
      const cIdx = bottomOuterDiscOffset * 3;
      positions[cIdx] = cx;
      positions[cIdx + 1] = cy;
      positions[cIdx + 2] = 0;

      for (let tStep = 0; tStep < rRes; tStep++) {
        const [x, y] = computeVertex(bottomRow, tStep, 0);
        const idx = (bottomOuterDiscOffset + 1 + tStep) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = 0;
      }
    }

    // Inner disc: center + ring at innerStartStep, using that row's shape inset by wt
    {
      const innerRow = rowContexts[innerStartStep];
      const [icx, icy] = computeCenter(innerRow);
      const cIdx = bottomInnerDiscOffset * 3;
      positions[cIdx] = icx;
      positions[cIdx + 1] = icy;
      positions[cIdx + 2] = innerRow.height;

      for (let tStep = 0; tStep < rRes; tStep++) {
        const [x, y, z] = computeInnerVertex(innerRow, tStep);
        const idx = (bottomInnerDiscOffset + 1 + tStep) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;
      }
    }
  }

  // ============================================================
  // Precompute cutout grid — true where triangles should be omitted
  // ============================================================
  const hasCutout = texturesEnabled && (
    (params.textures.voronoi?.enabled && params.textures.voronoi?.cutout) ||
    (params.textures.svgPattern?.enabled && params.textures.svgPattern?.cutout)
  );

  // cutoutGrid[vStep][tStep] = true if this vertex is in a cutout hole
  const CUTOUT_THRESHOLD = 0.5;
  let cutoutGrid: boolean[][] | null = null;
  if (hasCutout) {
    cutoutGrid = [];
    for (let vStep = 0; vStep <= vRes; vStep++) {
      const row: boolean[] = [];
      for (let tStep = 0; tStep < rRes; tStep++) {
        row.push(computeCutoutFactor(rowContexts[vStep], tStep) >= CUTOUT_THRESHOLD);
      }
      cutoutGrid.push(row);
    }
  }

  /** Check if a quad should be skipped (all 4 corners are in cutout region) */
  function isQuadCutout(vStep: number, tStep: number, tNext: number): boolean {
    if (!cutoutGrid) return false;
    return cutoutGrid[vStep][tStep] && cutoutGrid[vStep][tNext]
      && cutoutGrid[vStep + 1][tStep] && cutoutGrid[vStep + 1][tNext];
  }

  // ============================================================
  // Build index buffer
  // ============================================================

  const outerQuads = vRes * rRes;
  const innerQuads = (innerRows - 1) * rRes;
  const rimQuads = params.rimShape === 'rounded' ? rimSteps * rRes : 0;
  const flatRimQuads = params.rimShape === 'flat' ? rRes : 0;
  const bottomOuterDiscTris = hasBase ? rRes : 0;
  const bottomInnerDiscTris = hasBase ? rRes : 0;

  // Estimate cutout wall quads: each boundary edge between cutout/non-cutout quads
  // needs 1 wall quad (2 triangles). Worst case: every cutout quad has 4 boundary edges.
  const maxCutoutWallQuads = hasCutout ? outerQuads * 4 : 0;

  // Over-allocate — cutout may skip some quads but adds wall quads
  const maxTriangles =
    outerQuads * 2 +
    innerQuads * 2 +
    maxCutoutWallQuads * 2 +
    rimQuads * 2 +
    flatRimQuads * 2 +
    bottomOuterDiscTris +
    bottomInnerDiscTris;

  const indices = new Uint32Array(maxTriangles * 3);
  let idxOffset = 0;

  // ---- Outer surface quads (CCW = outward-facing normals) ----
  for (let vStep = 0; vStep < vRes; vStep++) {
    for (let tStep = 0; tStep < rRes; tStep++) {
      const tNext = (tStep + 1) % rRes;
      if (isQuadCutout(vStep, tStep, tNext)) continue;
      const bl = outerOffset + vStep * rRes + tStep;
      const br = outerOffset + vStep * rRes + tNext;
      const tl = outerOffset + (vStep + 1) * rRes + tStep;
      const tr = outerOffset + (vStep + 1) * rRes + tNext;
      indices[idxOffset++] = bl;
      indices[idxOffset++] = tl;
      indices[idxOffset++] = tr;
      indices[idxOffset++] = bl;
      indices[idxOffset++] = tr;
      indices[idxOffset++] = br;
    }
  }

  // ---- Inner surface quads (reversed winding for inward-facing normals) ----
  for (let iRow = 0; iRow < innerRows - 1; iRow++) {
    for (let tStep = 0; tStep < rRes; tStep++) {
      const tNext = (tStep + 1) % rRes;
      // Map inner row back to global vStep for cutout lookup
      const vStep = iRow + innerStartStep;
      if (cutoutGrid && vStep + 1 <= vRes &&
          cutoutGrid[vStep][tStep] && cutoutGrid[vStep][tNext] &&
          cutoutGrid[vStep + 1][tStep] && cutoutGrid[vStep + 1][tNext]) continue;
      const bl = innerOffset + iRow * rRes + tStep;
      const br = innerOffset + iRow * rRes + tNext;
      const tl = innerOffset + (iRow + 1) * rRes + tStep;
      const tr = innerOffset + (iRow + 1) * rRes + tNext;
      indices[idxOffset++] = bl;
      indices[idxOffset++] = tr;
      indices[idxOffset++] = tl;
      indices[idxOffset++] = bl;
      indices[idxOffset++] = br;
      indices[idxOffset++] = tr;
    }
  }

  // ---- Cutout wall quads (connect outer↔inner at hole boundaries) ----
  // For each cutout quad, check 4 edges. If the neighbor is NOT cutout (or at
  // the mesh boundary), emit a wall quad connecting outer and inner surfaces.
  // Wall normals face outward from the hole (into the solid region).
  if (cutoutGrid) {
    for (let vStep = 0; vStep < vRes; vStep++) {
      for (let tStep = 0; tStep < rRes; tStep++) {
        const tNext = (tStep + 1) % rRes;
        const thisIsCutout = isQuadCutout(vStep, tStep, tNext);
        if (!thisIsCutout) continue;

        // Only emit walls for edges where inner surface exists
        const iRow = vStep - innerStartStep;
        if (iRow < 0) continue; // below inner start, no inner surface

        // Helper: get outer and inner vertex indices for a vertex at (v, t)
        const outerIdx = (v: number, t: number) => outerOffset + v * rRes + t;
        const innerIdx = (v: number, t: number) => innerOffset + (v - innerStartStep) * rRes + t;

        // Left edge (tStep side): neighbor is quad at (vStep, tStep-1)
        const tPrev = (tStep - 1 + rRes) % rRes;
        const leftNeighborCutout = isQuadCutout(vStep, tPrev, tStep);
        if (!leftNeighborCutout && iRow >= 0 && iRow + 1 < innerRows) {
          // Wall edge runs vertically along tStep from vStep to vStep+1
          // Normal faces left (toward the solid neighbor)
          const o0 = outerIdx(vStep, tStep);
          const o1 = outerIdx(vStep + 1, tStep);
          const i0 = innerIdx(vStep, tStep);
          const i1 = innerIdx(vStep + 1, tStep);
          // Winding: looking from the solid side toward the hole
          indices[idxOffset++] = o0;
          indices[idxOffset++] = i0;
          indices[idxOffset++] = i1;
          indices[idxOffset++] = o0;
          indices[idxOffset++] = i1;
          indices[idxOffset++] = o1;
        }

        // Right edge (tNext side): neighbor is quad at (vStep, tNext)
        const tNextNext = (tNext + 1) % rRes;
        const rightNeighborCutout = isQuadCutout(vStep, tNext, tNextNext);
        if (!rightNeighborCutout && iRow >= 0 && iRow + 1 < innerRows) {
          const o0 = outerIdx(vStep, tNext);
          const o1 = outerIdx(vStep + 1, tNext);
          const i0 = innerIdx(vStep, tNext);
          const i1 = innerIdx(vStep + 1, tNext);
          // Winding: looking from the solid side (right) toward the hole (left)
          indices[idxOffset++] = o0;
          indices[idxOffset++] = o1;
          indices[idxOffset++] = i1;
          indices[idxOffset++] = o0;
          indices[idxOffset++] = i1;
          indices[idxOffset++] = i0;
        }

        // Bottom edge (vStep side): neighbor is quad at (vStep-1, tStep)
        if (vStep > 0) {
          const bottomNeighborCutout = isQuadCutout(vStep - 1, tStep, tNext);
          if (!bottomNeighborCutout && iRow >= 0 && (vStep - innerStartStep) >= 0) {
            const o0 = outerIdx(vStep, tStep);
            const o1 = outerIdx(vStep, tNext);
            const i0 = innerIdx(vStep, tStep);
            const i1 = innerIdx(vStep, tNext);
            // Winding: looking from below (solid) toward above (hole)
            indices[idxOffset++] = o0;
            indices[idxOffset++] = o1;
            indices[idxOffset++] = i1;
            indices[idxOffset++] = o0;
            indices[idxOffset++] = i1;
            indices[idxOffset++] = i0;
          }
        }

        // Top edge (vStep+1 side): neighbor is quad at (vStep+1, tStep)
        if (vStep + 1 < vRes) {
          const topNeighborCutout = isQuadCutout(vStep + 1, tStep, tNext);
          if (!topNeighborCutout && iRow + 1 < innerRows && (vStep + 1 - innerStartStep) >= 0) {
            const o0 = outerIdx(vStep + 1, tStep);
            const o1 = outerIdx(vStep + 1, tNext);
            const i0 = innerIdx(vStep + 1, tStep);
            const i1 = innerIdx(vStep + 1, tNext);
            // Winding: looking from above (solid) toward below (hole)
            indices[idxOffset++] = o0;
            indices[idxOffset++] = i0;
            indices[idxOffset++] = i1;
            indices[idxOffset++] = o0;
            indices[idxOffset++] = i1;
            indices[idxOffset++] = o1;
          }
        }
      }
    }
  }

  // ---- Rounded rim quads ----
  if (params.rimShape === 'rounded' && rimSteps > 0) {
    for (let rStep = 0; rStep < rimSteps; rStep++) {
      for (let tStep = 0; tStep < rRes; tStep++) {
        const tNext = (tStep + 1) % rRes;
        const bl = rimOffset + rStep * rRes + tStep;
        const br = rimOffset + rStep * rRes + tNext;
        const tl = rimOffset + (rStep + 1) * rRes + tStep;
        const tr = rimOffset + (rStep + 1) * rRes + tNext;
        indices[idxOffset++] = bl;
        indices[idxOffset++] = tl;
        indices[idxOffset++] = tr;
        indices[idxOffset++] = bl;
        indices[idxOffset++] = tr;
        indices[idxOffset++] = br;
      }
    }
  }

  // ---- Flat rim quads ----
  if (params.rimShape === 'flat') {
    for (let tStep = 0; tStep < rRes; tStep++) {
      const tNext = (tStep + 1) % rRes;
      const outerA = flatRimOffset + tStep;
      const outerB = flatRimOffset + tNext;
      const innerA = flatRimOffset + rRes + tStep;
      const innerB = flatRimOffset + rRes + tNext;
      indices[idxOffset++] = outerA;
      indices[idxOffset++] = innerA;
      indices[idxOffset++] = innerB;
      indices[idxOffset++] = outerA;
      indices[idxOffset++] = innerB;
      indices[idxOffset++] = outerB;
    }
  }

  // ---- Bottom cap ----
  if (hasBase) {
    // Outer disc (z=0) — triangle fan, normals pointing down
    const outerCenter = bottomOuterDiscOffset;
    for (let tStep = 0; tStep < rRes; tStep++) {
      const tNext = (tStep + 1) % rRes;
      const a = bottomOuterDiscOffset + 1 + tStep;
      const b = bottomOuterDiscOffset + 1 + tNext;
      indices[idxOffset++] = outerCenter;
      indices[idxOffset++] = b;
      indices[idxOffset++] = a;
    }

    // Inner disc — triangle fan, normals pointing up
    const innerCenter = bottomInnerDiscOffset;
    for (let tStep = 0; tStep < rRes; tStep++) {
      const tNext = (tStep + 1) % rRes;
      const a = bottomInnerDiscOffset + 1 + tStep;
      const b = bottomInnerDiscOffset + 1 + tNext;
      indices[idxOffset++] = innerCenter;
      indices[idxOffset++] = a;
      indices[idxOffset++] = b;
    }
  }

  // Trim index buffer if cutout skipped some triangles
  const actualTriangles = idxOffset / 3;
  const finalIndices = hasCutout ? indices.slice(0, idxOffset) : indices;

  // Compute normals
  computeNormals(positions, finalIndices, normals);

  return {
    positions,
    normals,
    indices: finalIndices,
    vertexCount: totalVertices,
    triangleCount: actualTriangles,
  };
}

/**
 * Compute smooth vertex normals by averaging adjacent face normals.
 */
function computeNormals(
  positions: Float32Array,
  indices: Uint32Array,
  normals: Float32Array
): void {
  normals.fill(0);

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const ax = positions[i1] - positions[i0];
    const ay = positions[i1 + 1] - positions[i0 + 1];
    const az = positions[i1 + 2] - positions[i0 + 2];
    const bx = positions[i2] - positions[i0];
    const by = positions[i2 + 1] - positions[i0 + 1];
    const bz = positions[i2 + 2] - positions[i0 + 2];

    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    normals[i0] += nx; normals[i0 + 1] += ny; normals[i0 + 2] += nz;
    normals[i1] += nx; normals[i1 + 1] += ny; normals[i1 + 2] += nz;
    normals[i2] += nx; normals[i2 + 1] += ny; normals[i2 + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(
      normals[i] * normals[i] +
      normals[i + 1] * normals[i + 1] +
      normals[i + 2] * normals[i + 2]
    );
    if (len > 0) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    }
  }
}
