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
  sineTwistValue: number;
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

    const sineTwistValue = params.sineTwist.enabled
      ? sineTwist(v, params.sineTwist.cycles, params.sineTwist.maxDegrees)
      : 0;

    const vSmooth = params.verticalSmoothing.enabled
      ? verticalSmoothing(v, params.verticalSmoothing.cycles, params.verticalSmoothing.startPercent)
      : 1;

    rowContexts.push({ m, shapeRadius, height, v, centerX, centerY, twistAngle, sineTwistValue, vSmooth });
  }

  /**
   * Compute a single vertex position for a given row and angle, with an optional
   * radial offset (negative = inward for inner wall).
   */
  function computeVertex(
    row: RowContext, tStep: number, radiusOffset: number, zOverride?: number
  ): [number, number, number] {
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
      ? radialRipple(row.v, t, params.radialRipple.depth, params.radialRipple.count, row.sineTwistValue)
      : 0;

    const vertRipple = params.verticalRipple.enabled
      ? verticalRipple(row.v, params.verticalRipple.depth, params.verticalRipple.count)
      : 0;

    let radius = shapeValue * row.shapeRadius
      + radRipple * row.vSmooth * rSmooth
      + vertRipple * row.vSmooth * rSmooth;

    // Apply radial offset (for inner wall)
    radius = Math.max(radius + radiusOffset, MIN_INNER_RADIUS);

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
  // Bottom cap uses the bottom row (row 0) shape for both discs
  const bottomOuterDiscVerts = hasBase ? 1 + rRes : 0;
  const bottomInnerDiscVerts = hasBase ? 1 + rRes : 0;
  const bottomWallVerts = hasBase ? 2 * rRes : 0;

  const totalVertices = outerVerts + innerVerts + rimVerts
    + bottomOuterDiscVerts + bottomInnerDiscVerts + bottomWallVerts
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
  const bottomWallOffset = vertexCursor; vertexCursor += bottomWallVerts;

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
  // When there's a base, the first inner row uses row 0's shape (matching the
  // inner disc ring) placed at z=bt, so there's no visible step at the base.
  for (let vStep = innerStartStep; vStep <= vRes; vStep++) {
    const isFirstInnerRow = hasBase && vStep === innerStartStep;
    const row = isFirstInnerRow ? rowContexts[0] : rowContexts[vStep];
    const innerRow = vStep - innerStartStep;
    for (let tStep = 0; tStep < rRes; tStep++) {
      const zOverride = isFirstInnerRow ? bt : undefined;
      const [x, y, z] = computeVertex(row, tStep, -wt, zOverride);
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
        const [ix, iy, ] = computeVertex(topRow, tStep, -wt);

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

      const [ix, iy, iz] = computeVertex(topRow, tStep, -wt);
      const idx1 = (flatRimOffset + rRes + tStep) * 3;
      positions[idx1] = ix;
      positions[idx1 + 1] = iy;
      positions[idx1 + 2] = iz;
    }
  }

  // ---- 5. Bottom cap vertices ----
  // All bottom cap geometry uses the bottom row (row 0) shape so the base
  // follows the outer shell contour exactly. The inner disc ring is the
  // same bottom shape inset by wallThickness, placed at z=bt.
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

    // Inner disc: center + ring at z=bt, using bottom row shape inset by wt
    {
      const cIdx = bottomInnerDiscOffset * 3;
      positions[cIdx] = cx;
      positions[cIdx + 1] = cy;
      positions[cIdx + 2] = bt;

      for (let tStep = 0; tStep < rRes; tStep++) {
        const [x, y] = computeVertex(bottomRow, tStep, -wt);
        const idx = (bottomInnerDiscOffset + 1 + tStep) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = bt;
      }
    }

    // Bottom wall strip: outer ring at z=0 to inner ring at z=bt
    {
      for (let tStep = 0; tStep < rRes; tStep++) {
        const [ox, oy] = computeVertex(bottomRow, tStep, 0);
        const idx0 = (bottomWallOffset + tStep) * 3;
        positions[idx0] = ox;
        positions[idx0 + 1] = oy;
        positions[idx0 + 2] = 0;

        const [ix, iy] = computeVertex(bottomRow, tStep, -wt);
        const idx1 = (bottomWallOffset + rRes + tStep) * 3;
        positions[idx1] = ix;
        positions[idx1 + 1] = iy;
        positions[idx1 + 2] = bt;
      }
    }
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
  const bottomWallQuads = hasBase ? rRes : 0;

  const totalTriangles =
    outerQuads * 2 +
    innerQuads * 2 +
    rimQuads * 2 +
    flatRimQuads * 2 +
    bottomOuterDiscTris +
    bottomInnerDiscTris +
    bottomWallQuads * 2;

  const indices = new Uint32Array(totalTriangles * 3);
  let idxOffset = 0;

  // ---- Outer surface quads (CCW = outward-facing normals) ----
  for (let vStep = 0; vStep < vRes; vStep++) {
    for (let tStep = 0; tStep < rRes; tStep++) {
      const tNext = (tStep + 1) % rRes;
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

    // Inner disc (z=bt) — triangle fan, normals pointing up
    const innerCenter = bottomInnerDiscOffset;
    for (let tStep = 0; tStep < rRes; tStep++) {
      const tNext = (tStep + 1) % rRes;
      const a = bottomInnerDiscOffset + 1 + tStep;
      const b = bottomInnerDiscOffset + 1 + tNext;
      indices[idxOffset++] = innerCenter;
      indices[idxOffset++] = a;
      indices[idxOffset++] = b;
    }

    // Bottom wall strip: outer (z=0) to inner (z=bt)
    for (let tStep = 0; tStep < rRes; tStep++) {
      const tNext = (tStep + 1) % rRes;
      const outerA = bottomWallOffset + tStep;
      const outerB = bottomWallOffset + tNext;
      const innerA = bottomWallOffset + rRes + tStep;
      const innerB = bottomWallOffset + rRes + tNext;
      indices[idxOffset++] = outerA;
      indices[idxOffset++] = outerB;
      indices[idxOffset++] = innerB;
      indices[idxOffset++] = outerA;
      indices[idxOffset++] = innerB;
      indices[idxOffset++] = innerA;
    }
  }

  // Compute normals
  computeNormals(positions, indices, normals);

  return {
    positions,
    normals,
    indices,
    vertexCount: totalVertices,
    triangleCount: totalTriangles,
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
