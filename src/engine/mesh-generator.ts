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
 *
 * Architecture:
 * - noise.ts: hash2D, voronoiCell, simplex3D, fbm3D, woodGrain
 * - svg-pattern.ts: SVG pattern sampling (module-level state)
 * - textures.ts: Texture registry and evaluation
 * - surfaces.ts: RowContext, computeRadius, computeVertex, computeInnerVertex
 * - normals.ts: computeNormals
 * - mesh-generator.ts: Orchestration (this file)
 */

import type { VaseParameters, VaseMesh } from './types';
import {
  computeRowContexts,
  computeVertex,
  computeInnerVertex,
  computeCenter,
  computeCutoutFactor,
  precomputeTextureTables,
  MIN_INNER_RADIUS,
  RowContext,
} from './surfaces';
import { computeNormals } from './normals';
import { setSvgPatternData } from './svg-pattern';

/** Number of intermediate rings for rounded rim */
const RIM_STEPS = 5;

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

  // Precompute texture permutation tables
  const { simplexPerm, woodGrainPerm } = precomputeTextureTables(params, texturesEnabled);

  // Precompute per-row context (includes arc-length tables for texture mapping)
  const rowContexts = computeRowContexts(params, vRes, rRes);

  // ============================================================
  // Thin wall mode (wallThickness === 0)
  // ============================================================
  if (!hasShell) {
    return generateThinWallMesh(params, rowContexts, vRes, rRes, hasBase, texturesEnabled, simplexPerm, woodGrainPerm);
  }

  // ============================================================
  // Shell mode (wallThickness > 0)
  // ============================================================
  return generateShellMesh(params, rowContexts, vRes, rRes, wt, bt, hasBase, texturesEnabled, simplexPerm, woodGrainPerm);
}

/**
 * Generate mesh for thin wall mode (wallThickness === 0).
 */
function generateThinWallMesh(
  params: VaseParameters,
  rowContexts: RowContext[],
  vRes: number,
  rRes: number,
  hasBase: boolean,
  texturesEnabled: boolean,
  simplexPerm: Uint8Array | null,
  woodGrainPerm: Uint8Array | null
): VaseMesh {
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
      const [x, y, z] = computeVertex(row, tStep, 0, undefined, params, rRes, texturesEnabled, simplexPerm, woodGrainPerm);
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
      const [x, y] = computeVertex(bottomRow, tStep, 0, 0, params, rRes, texturesEnabled, simplexPerm, woodGrainPerm);
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
  return { positions, normals, indices, vertexCount: totalVertices, triangleCount: indices.length / 3 };
}

/**
 * Generate mesh for shell mode (wallThickness > 0).
 */
function generateShellMesh(
  params: VaseParameters,
  rowContexts: RowContext[],
  vRes: number,
  rRes: number,
  wt: number,
  bt: number,
  hasBase: boolean,
  texturesEnabled: boolean,
  simplexPerm: Uint8Array | null,
  woodGrainPerm: Uint8Array | null
): VaseMesh {
  // Determine the first inner row: if bottomThickness > 0, the inner surface
  // starts at the height corresponding to bottomThickness.
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
  // Bottom ring (no base): annulus at z=0 connecting outer to inner wall
  const hasBottomRing = !hasBase;

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
      const [x, y, z] = computeVertex(row, tStep, 0, undefined, params, rRes, texturesEnabled, simplexPerm, woodGrainPerm);
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
      const [x, y, z] = computeInnerVertex(row, tStep, undefined, params, rRes, texturesEnabled, simplexPerm, woodGrainPerm);
      const idx = (innerOffset + innerRow * rRes + tStep) * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }
  }

  // ---- 2b. Clamp top row so it doesn't flare out past the row below ----
  // Prevents rim overhang when textures (especially SVG) have less displacement
  // at the very top of the vase (e.g. grass pattern with white sky at top of tile).
  if (vRes >= 2) {
    const topCX = rowContexts[vRes].centerX;
    const topCY = rowContexts[vRes].centerY;
    const belowCX = rowContexts[vRes - 1].centerX;
    const belowCY = rowContexts[vRes - 1].centerY;

    // Clamp outer wall top row
    for (let tStep = 0; tStep < rRes; tStep++) {
      const topIdx = (outerOffset + vRes * rRes + tStep) * 3;
      const belowIdx = (outerOffset + (vRes - 1) * rRes + tStep) * 3;

      const topDx = positions[topIdx] - topCX;
      const topDy = positions[topIdx + 1] - topCY;
      const belowDx = positions[belowIdx] - belowCX;
      const belowDy = positions[belowIdx + 1] - belowCY;

      const topR2 = topDx * topDx + topDy * topDy;
      const belowR2 = belowDx * belowDx + belowDy * belowDy;

      if (topR2 > belowR2 && belowR2 > 0) {
        const scale = Math.sqrt(belowR2 / topR2);
        positions[topIdx] = topCX + topDx * scale;
        positions[topIdx + 1] = topCY + topDy * scale;
      }
    }

    // Clamp inner wall top row
    const innerTopRow = vRes - innerStartStep;
    if (innerTopRow >= 2) {
      const innerBelowStep = vRes - 1;
      const innerBelowRow = innerBelowStep - innerStartStep;
      const iTopCX = rowContexts[vRes].centerX;
      const iTopCY = rowContexts[vRes].centerY;
      const iBelowCX = rowContexts[innerBelowStep].centerX;
      const iBelowCY = rowContexts[innerBelowStep].centerY;

      for (let tStep = 0; tStep < rRes; tStep++) {
        const topIdx = (innerOffset + innerTopRow * rRes + tStep) * 3;
        const belowIdx = (innerOffset + innerBelowRow * rRes + tStep) * 3;

        const topDx = positions[topIdx] - iTopCX;
        const topDy = positions[topIdx + 1] - iTopCY;
        const belowDx = positions[belowIdx] - iBelowCX;
        const belowDy = positions[belowIdx + 1] - iBelowCY;

        const topR2 = topDx * topDx + topDy * topDy;
        const belowR2 = belowDx * belowDx + belowDy * belowDy;

        if (topR2 > belowR2 && belowR2 > 0) {
          const scale = Math.sqrt(belowR2 / topR2);
          positions[topIdx] = iTopCX + topDx * scale;
          positions[topIdx + 1] = iTopCY + topDy * scale;
        }
      }
    }
  }

  // ---- 3. Rounded rim vertices ----
  // Read outer/inner positions from the (clamped) wall buffer for consistency
  if (params.rimShape === 'rounded' && rimSteps > 0) {
    for (let rStep = 0; rStep <= rimSteps; rStep++) {
      const arcAngle = (rStep / rimSteps) * Math.PI;
      const arcCos = Math.cos(arcAngle);
      const arcSin = Math.sin(arcAngle);

      for (let tStep = 0; tStep < rRes; tStep++) {
        const outerIdx = (outerOffset + vRes * rRes + tStep) * 3;
        const ox = positions[outerIdx], oy = positions[outerIdx + 1], oz = positions[outerIdx + 2];

        const innerTopRowIdx = vRes - innerStartStep;
        const innerIdx = (innerOffset + innerTopRowIdx * rRes + tStep) * 3;
        const ix = positions[innerIdx], iy = positions[innerIdx + 1];

        const mx = (ox + ix) / 2;
        const my = (oy + iy) / 2;
        const dx = (ox - ix) / 2;
        const dy = (oy - iy) / 2;

        // Compute actual rim half-width from the clamped positions
        const rimHalfWidth = Math.sqrt(dx * dx + dy * dy);

        const x = mx + dx * arcCos;
        const y = my + dy * arcCos;
        const z = oz + rimHalfWidth * arcSin;

        const idx = (rimOffset + rStep * rRes + tStep) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;
      }
    }
  }

  // ---- 4. Flat rim vertices ----
  // Read from the (clamped) wall buffer instead of recomputing
  if (params.rimShape === 'flat') {
    const innerTopRowIdx = vRes - innerStartStep;
    for (let tStep = 0; tStep < rRes; tStep++) {
      const outerIdx = (outerOffset + vRes * rRes + tStep) * 3;
      const idx0 = (flatRimOffset + tStep) * 3;
      positions[idx0] = positions[outerIdx];
      positions[idx0 + 1] = positions[outerIdx + 1];
      positions[idx0 + 2] = positions[outerIdx + 2];

      const innerIdx = (innerOffset + innerTopRowIdx * rRes + tStep) * 3;
      const idx1 = (flatRimOffset + rRes + tStep) * 3;
      positions[idx1] = positions[innerIdx];
      positions[idx1 + 1] = positions[innerIdx + 1];
      positions[idx1 + 2] = positions[innerIdx + 2];
    }
  }

  // ---- 5. Bottom cap vertices (solid base) ----
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
        const [x, y] = computeVertex(bottomRow, tStep, 0, 0, params, rRes, texturesEnabled, simplexPerm, woodGrainPerm);
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
        const [x, y, z] = computeInnerVertex(innerRow, tStep, undefined, params, rRes, texturesEnabled, simplexPerm, woodGrainPerm);
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

  const CUTOUT_THRESHOLD = 0.5;
  let cutoutGrid: boolean[][] | null = null;
  if (hasCutout) {
    cutoutGrid = [];
    for (let vStep = 0; vStep <= vRes; vStep++) {
      const row: boolean[] = [];
      for (let tStep = 0; tStep < rRes; tStep++) {
        row.push(computeCutoutFactor(rowContexts[vStep], tStep, params, rRes, texturesEnabled) >= CUTOUT_THRESHOLD);
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
  // Bottom ring (no base): annulus at z=0 connecting outer wall to inner wall
  const bottomRingQuads = hasBottomRing ? rRes : 0;

  // Estimate cutout wall quads
  const maxCutoutWallQuads = hasCutout ? outerQuads * 4 : 0;

  const maxTriangles =
    outerQuads * 2 +
    innerQuads * 2 +
    maxCutoutWallQuads * 2 +
    rimQuads * 2 +
    flatRimQuads * 2 +
    bottomOuterDiscTris +
    bottomInnerDiscTris +
    bottomRingQuads * 2;

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
  if (cutoutGrid) {
    for (let vStep = 0; vStep < vRes; vStep++) {
      for (let tStep = 0; tStep < rRes; tStep++) {
        const tNext = (tStep + 1) % rRes;
        if (!isQuadCutout(vStep, tStep, tNext)) continue;

        const iRow = vStep - innerStartStep;
        if (iRow < 0) continue;

        const outerIdx = (v: number, t: number) => outerOffset + v * rRes + t;
        const innerIdx = (v: number, t: number) => innerOffset + (v - innerStartStep) * rRes + t;

        // Left edge
        const tPrev = (tStep - 1 + rRes) % rRes;
        const leftNeighborCutout = isQuadCutout(vStep, tPrev, tStep);
        if (!leftNeighborCutout && iRow >= 0 && iRow + 1 < innerRows) {
          const o0 = outerIdx(vStep, tStep);
          const o1 = outerIdx(vStep + 1, tStep);
          const i0 = innerIdx(vStep, tStep);
          const i1 = innerIdx(vStep + 1, tStep);
          indices[idxOffset++] = o0;
          indices[idxOffset++] = i0;
          indices[idxOffset++] = i1;
          indices[idxOffset++] = o0;
          indices[idxOffset++] = i1;
          indices[idxOffset++] = o1;
        }

        // Right edge
        const tNextNext = (tNext + 1) % rRes;
        const rightNeighborCutout = isQuadCutout(vStep, tNext, tNextNext);
        if (!rightNeighborCutout && iRow >= 0 && iRow + 1 < innerRows) {
          const o0 = outerIdx(vStep, tNext);
          const o1 = outerIdx(vStep + 1, tNext);
          const i0 = innerIdx(vStep, tNext);
          const i1 = innerIdx(vStep + 1, tNext);
          indices[idxOffset++] = o0;
          indices[idxOffset++] = o1;
          indices[idxOffset++] = i1;
          indices[idxOffset++] = o0;
          indices[idxOffset++] = i1;
          indices[idxOffset++] = i0;
        }

        // Bottom edge
        if (vStep > 0) {
          const bottomNeighborCutout = isQuadCutout(vStep - 1, tStep, tNext);
          if (!bottomNeighborCutout && iRow >= 0 && (vStep - innerStartStep) >= 0) {
            const o0 = outerIdx(vStep, tStep);
            const o1 = outerIdx(vStep, tNext);
            const i0 = innerIdx(vStep, tStep);
            const i1 = innerIdx(vStep, tNext);
            indices[idxOffset++] = o0;
            indices[idxOffset++] = o1;
            indices[idxOffset++] = i1;
            indices[idxOffset++] = o0;
            indices[idxOffset++] = i1;
            indices[idxOffset++] = i0;
          }
        }

        // Top edge
        if (vStep + 1 < vRes) {
          const topNeighborCutout = isQuadCutout(vStep + 1, tStep, tNext);
          if (!topNeighborCutout && iRow + 1 < innerRows && (vStep + 1 - innerStartStep) >= 0) {
            const o0 = outerIdx(vStep + 1, tStep);
            const o1 = outerIdx(vStep + 1, tNext);
            const i0 = innerIdx(vStep + 1, tStep);
            const i1 = innerIdx(vStep + 1, tNext);
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

  // ---- Bottom cap (solid base) ----
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

  // ---- Bottom ring (no base — annulus at z=0 connecting outer to inner wall) ----
  if (hasBottomRing) {
    for (let tStep = 0; tStep < rRes; tStep++) {
      const tNext = (tStep + 1) % rRes;
      // Outer wall row 0 vertices
      const oA = outerOffset + tStep;
      const oB = outerOffset + tNext;
      // Inner wall row 0 vertices (innerStartStep=0 when bt=0)
      const iA = innerOffset + tStep;
      const iB = innerOffset + tNext;
      // Normals pointing down
      indices[idxOffset++] = oA;
      indices[idxOffset++] = iB;
      indices[idxOffset++] = iA;
      indices[idxOffset++] = oA;
      indices[idxOffset++] = oB;
      indices[idxOffset++] = iB;
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

// Re-export for public API
export { setSvgPatternData };
