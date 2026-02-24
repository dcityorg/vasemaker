/**
 * STL file export — generates binary STL from mesh data.
 */

import type { VaseMesh } from './types';
import { downloadBlob } from '@/lib/image-capture';

/**
 * Generate a binary STL file from mesh data.
 * Returns an ArrayBuffer ready to be saved as a .stl file.
 */
export function generateSTL(mesh: VaseMesh): ArrayBuffer {
  const { positions, indices, triangleCount } = mesh;

  // Binary STL format:
  // 80 bytes: header
  // 4 bytes: number of triangles (uint32)
  // Per triangle (50 bytes each):
  //   12 bytes: normal (3 × float32)
  //   36 bytes: 3 vertices (3 × 3 × float32)
  //   2 bytes: attribute byte count (uint16, usually 0)

  const bufferSize = 80 + 4 + triangleCount * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Header (80 bytes) — can be anything
  const header = 'VaseMakerWeb STL Export';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }

  // Triangle count
  view.setUint32(80, triangleCount, true);

  let offset = 84;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    // Compute face normal
    const ax = positions[i1] - positions[i0];
    const ay = positions[i1 + 1] - positions[i0 + 1];
    const az = positions[i1 + 2] - positions[i0 + 2];
    const bx = positions[i2] - positions[i0];
    const by = positions[i2 + 1] - positions[i0 + 1];
    const bz = positions[i2 + 2] - positions[i0 + 2];

    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }

    // Normal
    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;

    // Vertex 1
    view.setFloat32(offset, positions[i0], true); offset += 4;
    view.setFloat32(offset, positions[i0 + 1], true); offset += 4;
    view.setFloat32(offset, positions[i0 + 2], true); offset += 4;

    // Vertex 2
    view.setFloat32(offset, positions[i1], true); offset += 4;
    view.setFloat32(offset, positions[i1 + 1], true); offset += 4;
    view.setFloat32(offset, positions[i1 + 2], true); offset += 4;

    // Vertex 3
    view.setFloat32(offset, positions[i2], true); offset += 4;
    view.setFloat32(offset, positions[i2 + 1], true); offset += 4;
    view.setFloat32(offset, positions[i2 + 2], true); offset += 4;

    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}

/**
 * Trigger a download of the STL file in the browser.
 */
export function downloadSTL(mesh: VaseMesh, filename = 'vase.stl'): void {
  const buffer = generateSTL(mesh);
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  downloadBlob(blob, filename);
}
