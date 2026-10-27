/**
 * Crease shading (2026-10-26, Gary — tried on the Mold page first): smooth
 * across gentle angles, sharp where two faces meet at more than `angleDeg`.
 * Smooth shading averages a V ridge's faces into a rounded tube and smears the
 * light round the flange grooves; flat shading shows every facet of a curve.
 * This keeps the curves smooth and the V edges crisp.
 *
 * Each corner of each triangle gets the area-weighted sum of the face normals
 * round its vertex that lie within the crease angle of its own face. So the
 * output is NOT indexed (a vertex on an edge needs two normals): 3 vertices per
 * triangle. three.js has toCreasedNormals, but it hashes every corner as a
 * string — seconds on a 350k-triangle center; this walks the index instead.
 *
 * Display only. It never touches the mesh that is exported. Used when Show
 * Facets is off (store/view-prefs.ts), on all four pages.
 */

import * as THREE from 'three';
import type { VaseMesh } from '@/engine/types';

export const CREASE_ANGLE_DEG = 30;

export function creasedGeometry(mesh: VaseMesh, colors: Float32Array | null, angleDeg = CREASE_ANGLE_DEG): THREE.BufferGeometry {
  const { positions: P, indices: I } = mesh;
  const nT = I.length / 3, nV = mesh.vertexCount;
  const cosA = Math.cos((angleDeg * Math.PI) / 180);

  // Face normals: weighted (|n| = 2 × area) and unit.
  const fw = new Float32Array(nT * 3), fu = new Float32Array(nT * 3);
  for (let f = 0; f < nT; f++) {
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    fw[f * 3] = nx; fw[f * 3 + 1] = ny; fw[f * 3 + 2] = nz;
    fu[f * 3] = nx / l; fu[f * 3 + 1] = ny / l; fu[f * 3 + 2] = nz / l;
  }

  // Faces round each vertex (compressed rows).
  const start = new Uint32Array(nV + 1);
  for (let k = 0; k < I.length; k++) start[I[k] + 1]++;
  for (let v = 0; v < nV; v++) start[v + 1] += start[v];
  const fill = start.slice(0, nV);
  const faces = new Uint32Array(I.length);
  for (let k = 0; k < I.length; k++) faces[fill[I[k]]++] = (k / 3) | 0;

  const pos = new Float32Array(nT * 9), nor = new Float32Array(nT * 9);
  const col = colors ? new Float32Array(nT * 9) : null;
  for (let f = 0; f < nT; f++) {
    const ux = fu[f * 3], uy = fu[f * 3 + 1], uz = fu[f * 3 + 2];
    for (let k = 0; k < 3; k++) {
      const v = I[f * 3 + k], o = (f * 3 + k) * 3;
      let sx = 0, sy = 0, sz = 0;
      for (let j = start[v]; j < start[v + 1]; j++) {
        const g = faces[j] * 3;
        if (ux * fu[g] + uy * fu[g + 1] + uz * fu[g + 2] >= cosA) { sx += fw[g]; sy += fw[g + 1]; sz += fw[g + 2]; }
      }
      const l = Math.hypot(sx, sy, sz);
      if (l > 0) { nor[o] = sx / l; nor[o + 1] = sy / l; nor[o + 2] = sz / l; }
      else { nor[o] = ux; nor[o + 1] = uy; nor[o + 2] = uz; }
      pos[o] = P[v * 3]; pos[o + 1] = P[v * 3 + 1]; pos[o + 2] = P[v * 3 + 2];
      if (col) { col[o] = colors![v * 3]; col[o + 1] = colors![v * 3 + 1]; col[o + 2] = colors![v * 3 + 2]; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/**
 * A part's display geometry: with facets showing, the mesh's own (indexed,
 * drawn with flat shading); without, crease shading. `colors` = per-vertex
 * RGB (undercut / overhang tints) or null.
 */
export function partGeometry(mesh: VaseMesh, showFacets: boolean, colors: Float32Array | null = null): THREE.BufferGeometry {
  if (!showFacets) return creasedGeometry(mesh, colors);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
