/**
 * Low-level mesh construction utilities for HandleMaker — general triangle-mesh
 * building (the handle mold parts are prisms, sweeps, and caps, not surfaces of
 * revolution, so ring-mesh.ts doesn't apply).
 *
 * Conventions: all solids are closed and outward-wound (CCW from outside).
 * Where a part is assembled from several closed solids that OVERLAP slightly
 * (0.2–0.3 mm embeds), slicers union them reliably; coplanar *touching* is
 * avoided — that's the MoldMaker v1.10 "two disconnected shells" lesson.
 */

import { ShapeUtils, Vector2 } from 'three';
import type { VaseMesh } from '../types';
import { computeNormals } from '../normals';

export type P2 = [number, number];

/** Incremental mesh builder: push vertices, emit triangles, finish → VaseMesh. */
export class MeshBuilder {
  private pos: number[] = [];
  private idx: number[] = [];

  vertex(x: number, y: number, z: number): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  build(): VaseMesh {
    const positions = new Float32Array(this.pos);
    const indices = new Uint32Array(this.idx);
    const normals = new Float32Array(positions.length);
    computeNormals(positions, indices, normals);
    return {
      positions,
      normals,
      indices,
      vertexCount: positions.length / 3,
      triangleCount: indices.length / 3,
    };
  }
}

/** Signed volume of a closed mesh (positive = outward-wound). */
export function signedVolume(mesh: VaseMesh): number {
  const { positions, indices } = mesh;
  let v = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    v +=
      positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) +
      positions[a + 1] * (positions[b + 2] * positions[c] - positions[b] * positions[c + 2]) +
      positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c]);
  }
  return v / 6;
}

/** Flip a mesh's winding in place (recomputes normals). */
export function flipWinding(mesh: VaseMesh): void {
  const { indices } = mesh;
  for (let i = 0; i < indices.length; i += 3) {
    const t = indices[i + 1];
    indices[i + 1] = indices[i + 2];
    indices[i + 2] = t;
  }
  computeNormals(mesh.positions, mesh.indices, mesh.normals);
}

/** Flip the whole mesh if its signed volume is negative (valid for consistently-wound solids). */
export function ensureOutward(mesh: VaseMesh): VaseMesh {
  if (signedVolume(mesh) < 0) flipWinding(mesh);
  return mesh;
}

/** Return a translated copy of a mesh. */
export function translateMesh(mesh: VaseMesh, dx: number, dy: number, dz: number): VaseMesh {
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += dx;
    positions[i + 1] += dy;
    positions[i + 2] += dz;
  }
  return { ...mesh, positions, normals: new Float32Array(mesh.normals) };
}

/** Return a copy rotated 180° about the vertical axis through (cx, cy) — a proper rotation, so winding is preserved. */
export function rotate180Z(mesh: VaseMesh, cx: number, cy: number): VaseMesh {
  const positions = new Float32Array(mesh.positions);
  const normals = new Float32Array(mesh.normals);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = 2 * cx - positions[i];
    positions[i + 1] = 2 * cy - positions[i + 1];
    normals[i] = -normals[i];
    normals[i + 1] = -normals[i + 1];
  }
  return { ...mesh, positions, normals };
}

/** Shoelace signed area (positive = CCW). */
export function signedArea(poly: P2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function ensureCCW(poly: P2[]): P2[] {
  return signedArea(poly) >= 0 ? poly : poly.slice().reverse();
}

export function ensureCW(poly: P2[]): P2[] {
  return signedArea(poly) <= 0 ? poly : poly.slice().reverse();
}

/** n points of a circle, CCW. */
export function circlePoints(cx: number, cy: number, r: number, n: number): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

export function rectPoints(x0: number, y0: number, x1: number, y1: number): P2[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** Remove consecutive (near-)duplicate points, including the wrap pair. */
export function dedupeLoop(loop: P2[], eps = 1e-5): P2[] {
  const out: P2[] = [];
  for (const p of loop) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > eps) out.push(p);
  }
  while (
    out.length > 1 &&
    Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps
  ) {
    out.pop();
  }
  return out;
}

/**
 * Triangulate a polygon with holes (earcut via THREE.ShapeUtils). Outer is
 * normalized CCW, holes CW. Returns the concatenated point list and triangle
 * index triples into it, wound CCW in the 2D plane.
 */
export function triangulateFace(outer: P2[], holes: P2[][]): { points: P2[]; tris: number[][] } {
  const o = ensureCCW(dedupeLoop(outer));
  const hs = holes.map((h) => ensureCW(dedupeLoop(h)));
  const tris = ShapeUtils.triangulateShape(
    o.map(([x, y]) => new Vector2(x, y)),
    hs.map((h) => h.map(([x, y]) => new Vector2(x, y)))
  );
  const points: P2[] = [...o];
  for (const h of hs) points.push(...h);
  return { points, tris };
}

/** Map from local extrusion coords (u, v, w) to world (x, y, z). Must be right-handed. */
export type ExtrudeMap = (u: number, v: number, w: number) => [number, number, number];

export const MAP_XY_Z: ExtrudeMap = (u, v, w) => [u, v, w];
/** Cross-section in (y, z), extruded along x — right-handed cyclic permutation. */
export const MAP_YZ_X: ExtrudeMap = (u, v, w) => [w, u, v];

/**
 * Extrude a polygon (with optional holes) from w0 to w1 along the map's w axis.
 * Produces a closed outward-wound solid.
 */
export function extrudeSolid(outer: P2[], holes: P2[][], w0: number, w1: number, map: ExtrudeMap = MAP_XY_Z): VaseMesh {
  const b = new MeshBuilder();
  const o = ensureCCW(dedupeLoop(outer));
  const hs = holes.map((h) => ensureCW(dedupeLoop(h)));
  const loops = [o, ...hs];

  // Side walls: for a CCW outer loop (and CW holes) with w up, the quad
  // (bot_i, bot_i+1, top_i+1, top_i) faces outward from the solid.
  for (const loop of loops) {
    const bot = loop.map(([u, v]) => b.vertex(...map(u, v, w0)));
    const top = loop.map(([u, v]) => b.vertex(...map(u, v, w1)));
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length;
      b.quad(bot[i], bot[j], top[j], top[i]);
    }
  }

  // Caps
  const { points, tris } = triangulateFace(o, hs);
  const topIdx = points.map(([u, v]) => b.vertex(...map(u, v, w1)));
  const botIdx = points.map(([u, v]) => b.vertex(...map(u, v, w0)));
  for (const [i, j, k] of tris) {
    b.tri(topIdx[i], topIdx[j], topIdx[k]); // CCW in-plane → +w normal
    b.tri(botIdx[i], botIdx[k], botIdx[j]); // reversed → -w normal
  }
  return ensureOutward(b.build());
}

/** Simple axis-aligned box solid. */
export function boxSolid(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): VaseMesh {
  return extrudeSolid(rectPoints(x0, y0, x1, y1), [], z0, z1);
}
