/**
 * Mesh statistics — enclosed volume and bounding box for print estimates.
 * Pure math, no UI dependencies.
 */

import type { VaseMesh } from './types';

export interface MeshStats {
  /** Enclosed volume in mm³ (only meaningful when the mesh is closed, i.e. wallThickness > 0) */
  volumeMm3: number;
  /** Bounding box size in mm */
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  triangleCount: number;
  vertexCount: number;
}

/**
 * Computes enclosed volume via the divergence theorem: the signed volume of a
 * closed triangle mesh is the sum of signed tetrahedron volumes (origin, v0, v1, v2)
 * over all triangles. Winding determines sign, so we take the absolute value.
 */
export function computeMeshStats(mesh: VaseMesh): MeshStats {
  const { positions, indices } = mesh;

  let volume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    // a · (b × c)
    volume +=
      ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx);
  }
  volume = Math.abs(volume) / 6;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return {
    volumeMm3: volume,
    sizeX: positions.length ? maxX - minX : 0,
    sizeY: positions.length ? maxY - minY : 0,
    sizeZ: positions.length ? maxZ - minZ : 0,
    triangleCount: mesh.triangleCount,
    vertexCount: mesh.vertexCount,
  };
}
