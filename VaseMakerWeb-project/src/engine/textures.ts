/**
 * Texture evaluation — registry pattern for computing surface displacement.
 *
 * Each texture type implements a common interface so computeRadius becomes
 * a loop over active textures instead of a long if-chain.
 *
 * ========================================
 * HOW TO ADD A NEW TEXTURE
 * ========================================
 * 1. Add the texture params to VaseParameters.textures in types.ts
 * 2. Add defaults in presets/defaults.ts
 * 3. Add slider ranges in config/shape-params.ts
 * 4. Add a texture evaluator function below (or import from noise.ts)
 * 5. Register it in the textureEvaluators object
 *
 * Example:
 * ```
 * // In textures.ts, add a new evaluator:
 * myTexture: (ctx, params, texturesEnabled, simplexPerm, woodGrainPerm, svgData, rRes, sampleFn) => {
 *   if (!texturesEnabled || !params.textures.myTexture?.enabled) return 0;
 *   const t = params.textures.myTexture;
 *   // Compute your pattern value using ctx.t (angle), ctx.v (height), etc.
 *   const value = computeMyPattern(ctx.t, ctx.v, t.scale);
 *   return t.depth * value * ctx.vSmooth * ctx.rSmooth * ctx.szf;
 * },
 * ```
 *
 * Then add to textureEvaluators:
 * ```
 * textureEvaluators.myTexture = myTexture;
 * ```
 */

import type { VaseParameters } from './types';
import { voronoiCell, simplex3D, fbm3D, woodGrain } from './noise';
import { sampleSvgPattern } from './svg-pattern';
import { sinD } from '@/lib/math-utils';

/**
 * Context passed to each texture evaluator.
 * Contains all the information needed to compute texture displacement.
 */
export interface TextureContext {
  t: number;         // angle in degrees (0-360)
  arcU: number;      // normalized arc length (0-1) — equal surface distance
  perimeter: number; // actual perimeter in world units for this row
  v: number;         // normalized height (0-1)
  rowM: number;      // parametric height (0-1)
  vSmooth: number;   // vertical smoothing factor
  rSmooth: number;   // radial smoothing factor
  szf: number;       // smooth zone factor
  shapeRadius: number;
}

/**
 * Texture evaluator function signature.
 * Returns radial offset contribution (positive = outward, negative = inward).
 */
export type TextureEvaluator = (
  ctx: TextureContext,
  params: VaseParameters,
  texturesEnabled: boolean,
  simplexPerm: Uint8Array | null,
  woodGrainPerm: Uint8Array | null,
  svgPatternData: { pixels: Uint8Array; width: number; height: number } | null,
  rRes: number
) => number;

// ============================================================
// Texture Evaluators
// ============================================================

/**
 * Fluting — cosine grooves running circumferentially around the vase.
 * Uses cosine profile (deepest at center, zero at edges).
 */
const flutingEvaluator: TextureEvaluator = (ctx, params, texturesEnabled) => {
  if (!texturesEnabled || !params.textures.fluting?.enabled) return 0;
  const fl = params.textures.fluting;
  const duty = fl.duty ?? 0;
  const phase = (ctx.arcU * fl.count) % 1;
  const pillarWidth = 1 - duty;
  const halfPillar = pillarWidth * 0.5;
  const dist = Math.abs(phase - 0.5) / halfPillar;
  if (dist < 1) {
    return -fl.depth * (1 + Math.cos(dist * Math.PI)) * 0.5 * ctx.vSmooth * ctx.rSmooth * ctx.szf;
  }
  return 0;
};

/**
 * Vertical fluting — cosine grooves running horizontally (bands up the height).
 * Uses rowM (parametric height) instead of angle.
 */
const verticalFlutingEvaluator: TextureEvaluator = (ctx, params, texturesEnabled) => {
  if (!texturesEnabled || !params.textures.verticalFluting?.enabled) return 0;
  const vf = params.textures.verticalFluting;
  const duty = vf.duty ?? 0;
  const phase = (ctx.rowM * vf.count) % 1;
  const pillarWidth = 1 - duty;
  const halfPillar = pillarWidth * 0.5;
  const dist = Math.abs(phase - 0.5) / halfPillar;
  if (dist < 1) {
    return -vf.depth * (1 + Math.cos(dist * Math.PI)) * 0.5 * ctx.vSmooth * ctx.rSmooth * ctx.szf;
  }
  return 0;
};

/**
 * Square flute — flat-topped pillars with rectangular channels.
 * Circumferential (runs around the vase).
 */
const squareFluteEvaluator: TextureEvaluator = (ctx, params, texturesEnabled) => {
  if (!texturesEnabled || !params.textures.squareFlute?.enabled) return 0;
  const sf = params.textures.squareFlute;
  const phase = (ctx.arcU * sf.count) % 1;
  const halfDuty = sf.duty * 0.5;
  const dist = Math.abs(phase - 0.5) - halfDuty;
  const edge = 0.005 + (1 - sf.sharpness) * 0.15;
  const tNorm = Math.max(0, Math.min(1, dist / edge));
  const groove = tNorm * tNorm * (3 - 2 * tNorm);
  return -sf.depth * groove * ctx.vSmooth * ctx.rSmooth * ctx.szf;
};

/**
 * Vertical square flute — flat-topped horizontal bands.
 * Uses rowM (parametric height) instead of angle.
 */
const verticalSquareFluteEvaluator: TextureEvaluator = (ctx, params, texturesEnabled) => {
  if (!texturesEnabled || !params.textures.verticalSquareFlute?.enabled) return 0;
  const vsf = params.textures.verticalSquareFlute;
  const phase = (ctx.rowM * vsf.count) % 1;
  const halfDuty = vsf.duty * 0.5;
  const dist = Math.abs(phase - 0.5) - halfDuty;
  const edge = 0.005 + (1 - vsf.sharpness) * 0.15;
  const tNorm = Math.max(0, Math.min(1, dist / edge));
  const groove = tNorm * tNorm * (3 - 2 * tNorm);
  return -vsf.depth * groove * ctx.vSmooth * ctx.rSmooth * ctx.szf;
};

/**
 * Waves — smooth cosine-squared lobes going outward.
 * Circumferential.
 */
const wavesEvaluator: TextureEvaluator = (ctx, params, texturesEnabled) => {
  if (!texturesEnabled || !params.textures.waves?.enabled) return 0;
  const wv = params.textures.waves;
  const phase = (ctx.arcU * wv.count) % 1;
  const pillarWidth = 1 - wv.duty;
  const halfPillar = pillarWidth * 0.5;
  const dist = Math.abs(phase - 0.5) / halfPillar;
  if (dist < 1) {
    const cosVal = Math.cos(dist * Math.PI * 0.5);
    return wv.depth * cosVal * cosVal * ctx.vSmooth * ctx.rSmooth * ctx.szf;
  }
  return 0;
};

/**
 * Vertical waves — smooth cosine-squared lobes running horizontally.
 */
const verticalWavesEvaluator: TextureEvaluator = (ctx, params, texturesEnabled) => {
  if (!texturesEnabled || !params.textures.verticalWaves?.enabled) return 0;
  const vw = params.textures.verticalWaves;
  const phase = (ctx.rowM * vw.count) % 1;
  const pillarWidth = 1 - vw.duty;
  const halfPillar = pillarWidth * 0.5;
  const dist = Math.abs(phase - 0.5) / halfPillar;
  if (dist < 1) {
    const cosVal = Math.cos(dist * Math.PI * 0.5);
    return vw.depth * cosVal * cosVal * ctx.vSmooth * ctx.rSmooth * ctx.szf;
  }
  return 0;
};

/**
 * Rods — semicircular pillars going outward with flat channels between.
 * Circumferential.
 */
const rodsEvaluator: TextureEvaluator = (ctx, params, texturesEnabled) => {
  if (!texturesEnabled || !params.textures.rods?.enabled) return 0;
  const rd = params.textures.rods;
  const phase = (ctx.arcU * rd.count) % 1;
  const pillarWidth = 1 - rd.duty;
  const halfPillar = pillarWidth * 0.5;
  const dist = Math.abs(phase - 0.5) / halfPillar;
  if (dist < 1) {
    return rd.depth * Math.sqrt(1 - dist * dist) * ctx.vSmooth * ctx.rSmooth * ctx.szf;
  }
  return 0;
};

/**
 * Vertical rods — semicircular horizontal bands.
 */
const verticalRodsEvaluator: TextureEvaluator = (ctx, params, texturesEnabled) => {
  if (!texturesEnabled || !params.textures.verticalRods?.enabled) return 0;
  const vr = params.textures.verticalRods;
  const phase = (ctx.rowM * vr.count) % 1;
  const pillarWidth = 1 - vr.duty;
  const halfPillar = pillarWidth * 0.5;
  const dist = Math.abs(phase - 0.5) / halfPillar;
  if (dist < 1) {
    return vr.depth * Math.sqrt(1 - dist * dist) * ctx.vSmooth * ctx.rSmooth * ctx.szf;
  }
  return 0;
};

/**
 * Basket weave — sine waves with 180° phase shift per band.
 */
const basketWeaveEvaluator: TextureEvaluator = (ctx, params, texturesEnabled) => {
  if (!texturesEnabled || !params.textures.basketWeave?.enabled) return 0;
  const bw = params.textures.basketWeave;
  return bw.depth * sinD(
    bw.waves * ctx.arcU * 360
    + 180 * Math.floor(ctx.v * bw.bands)
  ) * ctx.vSmooth * ctx.rSmooth * ctx.szf;
};

/**
 * Voronoi cellular texture.
 */
const voronoiEvaluator: TextureEvaluator = (ctx, params, texturesEnabled) => {
  if (!texturesEnabled || !params.textures.voronoi?.enabled) return 0;
  const vor = params.textures.voronoi;
  const cellsU = vor.scale;
  const cellsW = Math.max(1, Math.round(cellsU * params.height / ctx.perimeter));
  const u = ctx.arcU * cellsU;
  const w = ctx.v * cellsW;
  return vor.depth * voronoiCell(u, w, cellsU, vor.seed, vor.edgeWidth) * ctx.vSmooth * ctx.rSmooth * ctx.szf;
};

/**
 * Simplex noise — isotropic fBm noise.
 */
const simplexEvaluator: TextureEvaluator = (ctx, params, texturesEnabled, simplexPerm) => {
  if (!texturesEnabled || !simplexPerm || !params.textures.simplex?.enabled) return 0;
  const sx = params.textures.simplex;
  // Map arc-length U to a circle for seamless wrapping
  const angle = ctx.arcU * 2 * Math.PI;
  const nx = Math.cos(angle) * sx.scale;
  const ny = Math.sin(angle) * sx.scale;
  const scaleV = sx.scale * params.height / ctx.perimeter;
  const nz = ctx.v * scaleV;
  return sx.depth * fbm3D(nx, ny, nz, sx.octaves, sx.persistence, sx.lacunarity, simplexPerm) * ctx.vSmooth * ctx.rSmooth * ctx.szf;
};

/**
 * Wood grain — vertical streaks with organic wobble.
 */
const woodGrainEvaluator: TextureEvaluator = (ctx, params, texturesEnabled, _simplexPerm, woodGrainPerm) => {
  if (!texturesEnabled || !woodGrainPerm || !params.textures.woodGrain?.enabled) return 0;
  const wg = params.textures.woodGrain;
  const wgU = ctx.arcU * wg.count;
  const vScaled = ctx.v * (params.height / ctx.perimeter) * wg.count;
  return wg.depth * woodGrain(wgU, vScaled, wg.count, wg.wobble, wg.sharpness, woodGrainPerm) * ctx.vSmooth * ctx.rSmooth * ctx.szf;
};

/**
 * SVG pattern — user-supplied SVG as displacement map.
 */
const svgPatternEvaluator: TextureEvaluator = (ctx, params, texturesEnabled, _simplexPerm, _woodGrainPerm, svgData) => {
  if (!texturesEnabled || !svgData || !params.textures.svgPattern?.enabled || !params.textures.svgPattern.svgText) return 0;
  const sp = params.textures.svgPattern;
  const tileU = (ctx.arcU * sp.repeatX) % 1;
  const tileV = (ctx.v * sp.repeatY) % 1;
  const brightness = sampleSvgPattern(tileU, tileV);
  return -sp.depth * (sp.invert ? brightness : 1 - brightness) * ctx.vSmooth * ctx.rSmooth * ctx.szf;
};

// ============================================================
// Registry
// ============================================================

/**
 * Registry of texture evaluators — each returns a radial offset contribution.
 * The keys match the texture names in VaseParameters.textures.
 */
export const textureEvaluators: Record<string, TextureEvaluator> = {
  fluting: flutingEvaluator,
  verticalFluting: verticalFlutingEvaluator,
  squareFlute: squareFluteEvaluator,
  verticalSquareFlute: verticalSquareFluteEvaluator,
  waves: wavesEvaluator,
  verticalWaves: verticalWavesEvaluator,
  rods: rodsEvaluator,
  verticalRods: verticalRodsEvaluator,
  basketWeave: basketWeaveEvaluator,
  voronoi: voronoiEvaluator,
  simplex: simplexEvaluator,
  woodGrain: woodGrainEvaluator,
  svgPattern: svgPatternEvaluator,
};

/**
 * Compute total texture contribution by summing all enabled textures.
 */
export function computeTextureContributions(
  ctx: TextureContext,
  params: VaseParameters,
  texturesEnabled: boolean,
  simplexPerm: Uint8Array | null,
  woodGrainPerm: Uint8Array | null,
  svgPatternData: { pixels: Uint8Array; width: number; height: number } | null,
  rRes: number
): number {
  let total = 0;
  for (const name of Object.keys(textureEvaluators)) {
    const evaluator = textureEvaluators[name];
    total += evaluator(ctx, params, texturesEnabled, simplexPerm, woodGrainPerm, svgPatternData, rRes);
  }
  return total;
}
