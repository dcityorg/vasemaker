/**
 * Surface computation — RowContext, vertex computation, and texture integration.
 *
 * This module handles:
 * - Precomputed per-row context (profile, smoothing, twist, smooth zones)
 * - Radius computation with texture contributions
 * - Vertex position computation
 * - Cutout factor computation for hole punching
 */

import type { VaseParameters, ShapeParams } from './types';
import { evaluateBezier, evaluateBezierScalar } from './bezier';
import { getShapeFunction } from './shapes';
import {
  sineTwist,
  verticalSmoothing,
  radialSmoothing,
} from './modifiers';
import { sinD, cosD } from '@/lib/math-utils';
import { buildPermTable } from './noise';
import { getSvgPatternData, sampleSvgPattern } from './svg-pattern';
import { computeTextureContributions, TextureContext } from './textures';
import { voronoiCell } from './noise';

/** Minimum inner radius to prevent self-intersection */
export const MIN_INNER_RADIUS = 0.1;

/**
 * Precomputed per-row data that is shared between outer and inner surface generation.
 * Extracted to avoid recomputing for the inner surface.
 */
export interface RowContext {
  m: number;        // parametric height 0–1
  shapeRadius: number;
  height: number;
  v: number;        // normalized height 0–1
  centerX: number;
  centerY: number;
  twistAngle: number;
  vSmooth: number;
  smoothZoneFactor: number; // 0 = suppressed (in zone), 1 = normal
}

/**
 * Precompute all row contexts for a given set of parameters.
 * Called once per mesh generation to avoid recomputing for each vertex.
 */
export function computeRowContexts(
  params: VaseParameters,
  vRes: number
): RowContext[] {
  const rowContexts: RowContext[] = [];

  // Smooth zones — precompute base/rim fractions (0–1)
  const szEnabled = params.smoothZones?.enabled !== false;
  const szBase = szEnabled ? (params.smoothZones?.basePercent ?? 0) / 100 : 0;
  const szRim  = szEnabled ? (params.smoothZones?.rimPercent ?? 0) / 100 : 0;
  const szBaseFade = (params.smoothZones?.baseFade ?? 0) / 100;
  const szRimFade  = (params.smoothZones?.rimFade ?? 0) / 100;

  // Get shape functions
  const bottomShapeFn = getShapeFunction(params.bottomShape);
  const topShapeFn = getShapeFunction(params.topShape);
  const defaultSP: ShapeParams = { scaleFactor: 1, offsetX: 0, offsetY: 0 };
  const bottomParams = params.bottomShapeParams[params.bottomShape] ?? defaultSP;
  const topParams = params.topShapeParams[params.topShape] ?? defaultSP;

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

    // Smooth zone factor: 0 = fully suppressed, 1 = normal
    let smoothZoneFactor = 1;
    if (szBase > 0 || szRim > 0) {
      // Base zone: fadeStart marks where fade begins (below = fully suppressed)
      if (szBase > 0 && v < szBase) {
        const fadeStart = szBase * (1 - szBaseFade);
        if (v < fadeStart) {
          smoothZoneFactor = 0;
        } else {
          const fadeRange = szBase - fadeStart;
          const t = fadeRange > 0 ? (v - fadeStart) / fadeRange : 1;
          smoothZoneFactor = t * t * (3 - 2 * t); // smoothstep
        }
      }
      // Rim zone: fadeEnd marks where fade ends (above = fully suppressed)
      if (szRim > 0 && v > 1 - szRim) {
        const fadeEnd = 1 - szRim * (1 - szRimFade);
        let rimFactor: number;
        if (v > fadeEnd) {
          rimFactor = 0;
        } else {
          const fadeRange = fadeEnd - (1 - szRim);
          const t = fadeRange > 0 ? (fadeEnd - v) / fadeRange : 1;
          rimFactor = t * t * (3 - 2 * t); // smoothstep
        }
        smoothZoneFactor = Math.min(smoothZoneFactor, rimFactor);
      }
    }

    rowContexts.push({ m, shapeRadius, height, v, centerX, centerY, twistAngle, vSmooth, smoothZoneFactor });
  }

  return rowContexts;
}

/**
 * Compute the radial distance for a given row and angle.
 * When skipEffects is true, ripples and textures are zeroed out — used for
 * smooth inner surface calculation (suppresses both ripples AND textures).
 */
export function computeRadius(
  row: RowContext,
  tStep: number,
  skipEffects: boolean,
  params: VaseParameters,
  rRes: number,
  texturesEnabled: boolean,
  simplexPerm: Uint8Array | null,
  woodGrainPerm: Uint8Array | null
): number {
  const t = tStep * 360 / rRes;

  // Get shape functions
  const bottomShapeFn = getShapeFunction(params.bottomShape);
  const topShapeFn = getShapeFunction(params.topShape);
  const defaultSP: ShapeParams = { scaleFactor: 1, offsetX: 0, offsetY: 0 };
  const bottomParams = params.bottomShapeParams[params.bottomShape] ?? defaultSP;
  const topParams = params.topShapeParams[params.topShape] ?? defaultSP;

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

  // Build texture context
  const textureCtx: TextureContext = {
    t,
    v: row.v,
    rowM: row.m,
    vSmooth: row.vSmooth,
    rSmooth,
    szf: row.smoothZoneFactor,
    shapeRadius: row.shapeRadius,
  };

  // Get SVG pattern data
  const svgPatternData = getSvgPatternData();

  // Compute texture contributions
  let textureOffset = 0;
  if (!skipEffects) {
    textureOffset = computeTextureContributions(
      textureCtx,
      params,
      texturesEnabled,
      simplexPerm,
      woodGrainPerm,
      svgPatternData,
      rRes
    );
  }

  return shapeValue * row.shapeRadius + textureOffset;
}

/**
 * Compute a single vertex position for a given row and angle, with an optional
 * radial offset (negative = inward for inner wall).
 */
export function computeVertex(
  row: RowContext,
  tStep: number,
  radiusOffset: number,
  zOverride: number | undefined,
  params: VaseParameters,
  rRes: number,
  texturesEnabled: boolean,
  simplexPerm: Uint8Array | null,
  woodGrainPerm: Uint8Array | null
): [number, number, number] {
  const t = tStep * 360 / rRes;
  let radius = Math.max(
    computeRadius(row, tStep, false, params, rRes, texturesEnabled, simplexPerm, woodGrainPerm) + radiusOffset,
    MIN_INNER_RADIUS
  );

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
 * Compute inner surface vertex with smooth inner logic.
 * When smoothInner is enabled, the inner surface ignores textures and
 * enforces a minimum wall thickness relative to the textured outer surface.
 */
export function computeInnerVertex(
  row: RowContext,
  tStep: number,
  zOverride: number | undefined,
  params: VaseParameters,
  rRes: number,
  texturesEnabled: boolean,
  simplexPerm: Uint8Array | null,
  woodGrainPerm: Uint8Array | null
): [number, number, number] {
  const t = tStep * 360 / rRes;
  const wt = params.wallThickness;
  const smoothInner = params.smoothInner ?? false;
  const outerRadius = computeRadius(row, tStep, false, params, rRes, texturesEnabled, simplexPerm, woodGrainPerm);
  let innerRadius: number;

  if (smoothInner) {
    const smoothRadius = computeRadius(row, tStep, true, params, rRes, texturesEnabled, simplexPerm, woodGrainPerm);
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
export function computeCenter(row: RowContext): [number, number] {
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

/**
 * Compute cutout factor (0 or 1) for a vertex using a hard threshold.
 * Returns 0 = solid wall, 1 = hole (inner pushed to match outer).
 * Uses a threshold so only areas well inside cells/dark regions become holes,
 * while edges remain fully solid.
 */
export function computeCutoutFactor(
  row: RowContext,
  tStep: number,
  params: VaseParameters,
  rRes: number,
  texturesEnabled: boolean
): number {
  if (!texturesEnabled) return 0;
  // No cutout in smooth zones — keeps solid base/rim intact.
  if (row.smoothZoneFactor < 1) return 0;
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
  const svgPatternData = getSvgPatternData();
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
 * Precompute permutation tables for textures that need them.
 * Call once per mesh generation.
 */
export function precomputeTextureTables(params: VaseParameters, texturesEnabled: boolean): {
  simplexPerm: Uint8Array | null;
  woodGrainPerm: Uint8Array | null;
} {
  const simplexPerm = texturesEnabled && params.textures.simplex?.enabled
    ? buildPermTable(params.textures.simplex.seed)
    : null;

  const woodGrainPerm = texturesEnabled && params.textures.woodGrain?.enabled
    ? buildPermTable(params.textures.woodGrain.seed)
    : null;

  return { simplexPerm, woodGrainPerm };
}
