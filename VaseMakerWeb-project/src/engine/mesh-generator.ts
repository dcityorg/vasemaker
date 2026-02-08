/**
 * Mesh generator — the core of VaseMaker.
 * Takes VaseParameters, generates a triangle mesh as typed arrays.
 *
 * Ported from the makeObject() module in VaseMaker13 A.scad.
 * Instead of building individual polyhedron pie-slices, we build a shared
 * vertex grid and index buffer, which is far more efficient for Three.js.
 */

import type { VaseParameters, VaseMesh, ShapeType, ShapeParams } from './types';
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

/**
 * Generate the vase mesh from parameters.
 * This is the main entry point — equivalent to makeObject() in OpenSCAD.
 */
export function generateMesh(params: VaseParameters, useExportResolution = false): VaseMesh {
  const resolution = useExportResolution ? params.exportResolution : params.previewResolution;
  const vRes = resolution.vertical;
  const rRes = resolution.radial;

  // Get shape functions
  const bottomShapeFn = getShapeFunction(params.bottomShape);
  const topShapeFn = getShapeFunction(params.topShape);
  const bottomParams = params.bottomShapeParams[params.bottomShape];
  const topParams = params.topShapeParams[params.topShape];

  // Build the vertex grid: (vRes+1) rows × (rRes) columns
  // +1 on vertical because we need both top and bottom edges
  const vertRows = vRes + 1;
  const totalVertices = vertRows * rRes;
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);

  // Generate vertices
  for (let vStep = 0; vStep <= vRes; vStep++) {
    const m = vStep / vRes; // 0 to 1

    // Evaluate Bezier profile at this height
    const profilePoint = params.profileEnabled
      ? evaluateBezier(m, params.profilePoints)
      : [1.0, m]; // If profile disabled, constant radius

    const shapeRadius = profilePoint[0] * params.radius;
    const height = profilePoint[1] * params.height;
    const v = height / params.height; // Normalized height 0–1

    // Compute Bezier XY offset at this height
    let centerX = params.fixedOffset.x + bottomParams.offsetX;
    let centerY = params.fixedOffset.y + bottomParams.offsetY;

    if (params.bezierOffset.enabled && params.bezierOffset.points.length >= 2) {
      const offsetXPoints = params.bezierOffset.points.map(p => p[0]);
      const offsetYPoints = params.bezierOffset.points.map(p => p[1]);
      centerX += evaluateBezierScalar(v, offsetXPoints) * params.bezierOffset.scaleX;
      centerY += evaluateBezierScalar(v, offsetYPoints) * params.bezierOffset.scaleY;
    }

    // Compute Bezier twist at this height
    let twistAngle = 0;
    if (params.bezierTwist.enabled && params.bezierTwist.points.length >= 2) {
      twistAngle = evaluateBezierScalar(v, params.bezierTwist.points);
    }

    // Compute sine twist for ripple modulation
    const sineTwistValue = params.sineTwist.enabled
      ? sineTwist(v, params.sineTwist.cycles, params.sineTwist.maxDegrees)
      : 0;

    // Compute vertical smoothing factor
    const vSmooth = params.verticalSmoothing.enabled
      ? verticalSmoothing(v, params.verticalSmoothing.cycles, params.verticalSmoothing.startPercent)
      : 1;

    for (let tStep = 0; tStep < rRes; tStep++) {
      const t = tStep * 360 / rRes; // angle in degrees (0–359)

      // Evaluate shape function(s)
      let shapeValue: number;
      if (params.morphEnabled) {
        const bottomVal = bottomShapeFn(t, bottomParams);
        const topVal = topShapeFn(t, topParams);
        shapeValue = bottomVal * (1 - v) + topVal * v;
      } else {
        shapeValue = bottomShapeFn(t, bottomParams);
      }

      // Compute radial smoothing factor
      const rSmooth = params.radialSmoothing.enabled
        ? radialSmoothing(t, params.radialSmoothing.cycles, params.radialSmoothing.offsetAngle)
        : 1;

      // Compute ripple offsets
      const radRipple = params.radialRipple.enabled
        ? radialRipple(v, t, params.radialRipple.depth, params.radialRipple.count, sineTwistValue)
        : 0;

      const vertRipple = params.verticalRipple.enabled
        ? verticalRipple(v, params.verticalRipple.depth, params.verticalRipple.count)
        : 0;

      // Combine: shape * profile radius + modulations (matching OpenSCAD findRadius)
      const radius = shapeValue * shapeRadius
        + radRipple * vSmooth * rSmooth
        + vertRipple * vSmooth * rSmooth;

      // Convert polar to cartesian
      let x = radius * cosD(t) + centerX;
      let y = radius * sinD(t) + centerY;
      const z = height;

      // Apply Bezier twist rotation
      if (twistAngle !== 0) {
        const cosR = cosD(twistAngle);
        const sinR = sinD(twistAngle);
        const rx = x * cosR - y * sinR;
        const ry = y * cosR + x * sinR;
        x = rx;
        y = ry;
      }

      // Store vertex position
      const idx = (vStep * rRes + tStep) * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
    }
  }

  // Build triangle indices
  // Each quad (between two vertical layers and two radial steps) → 2 triangles
  const totalQuads = vRes * rRes;
  const indices = new Uint32Array(totalQuads * 6); // 2 triangles × 3 indices

  let idxOffset = 0;
  for (let vStep = 0; vStep < vRes; vStep++) {
    for (let tStep = 0; tStep < rRes; tStep++) {
      const tNext = (tStep + 1) % rRes; // wrap around

      const botLeft = vStep * rRes + tStep;
      const botRight = vStep * rRes + tNext;
      const topLeft = (vStep + 1) * rRes + tStep;
      const topRight = (vStep + 1) * rRes + tNext;

      // Triangle 1: botLeft, topLeft, topRight
      indices[idxOffset++] = botLeft;
      indices[idxOffset++] = topLeft;
      indices[idxOffset++] = topRight;

      // Triangle 2: botLeft, topRight, botRight
      indices[idxOffset++] = botLeft;
      indices[idxOffset++] = topRight;
      indices[idxOffset++] = botRight;
    }
  }

  // Compute normals (average of adjacent face normals per vertex)
  computeNormals(positions, indices, normals);

  return {
    positions,
    normals,
    indices,
    vertexCount: totalVertices,
    triangleCount: totalQuads * 2,
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
  // Zero out normals
  normals.fill(0);

  // Accumulate face normals to each vertex
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    // Edge vectors
    const ax = positions[i1] - positions[i0];
    const ay = positions[i1 + 1] - positions[i0 + 1];
    const az = positions[i1 + 2] - positions[i0 + 2];
    const bx = positions[i2] - positions[i0];
    const by = positions[i2 + 1] - positions[i0 + 1];
    const bz = positions[i2 + 2] - positions[i0 + 2];

    // Cross product = face normal (not normalized, area-weighted)
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    // Add to each vertex of this face
    normals[i0] += nx; normals[i0 + 1] += ny; normals[i0 + 2] += nz;
    normals[i1] += nx; normals[i1 + 1] += ny; normals[i1 + 2] += nz;
    normals[i2] += nx; normals[i2 + 1] += ny; normals[i2 + 2] += nz;
  }

  // Normalize all vertex normals
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
