/**
 * Ring-based revolved-shell mesher — the geometric foundation for MoldMaker.
 *
 * A "ring" is one cross-section loop: rRes points as [x, y, z] triplets.
 * Given a stack of OUTER rings (outward-facing surface, larger radius) and a
 * parallel stack of INNER rings (inward-facing surface, smaller radius), both
 * ordered bottom → top, this builds a watertight shell:
 *   - outer surface, inner surface (reversed winding)
 *   - a solid disc closing each stack's bottom ring
 *   - an annulus connecting the two top rings (the open rim / top face)
 *
 * The master, cottle, and (display) plaster are all this same topology — a
 * hollow vessel / container — so they share this one mesher. All triangles are
 * wound outward (CCW from outside), matching the VaseMaker engine convention.
 */

import type { VaseMesh } from '../types';
import { computeNormals } from '../normals';

/** One cross-section loop: Float32Array of length rRes*3, [x,y,z] per step. */
export type Ring = Float32Array;

/** Centroid (x, y) and z of a ring (z assumed uniform around the loop). */
function ringCentroid(ring: Ring, rRes: number): [number, number, number] {
  let sx = 0, sy = 0;
  for (let t = 0; t < rRes; t++) {
    sx += ring[t * 3];
    sy += ring[t * 3 + 1];
  }
  return [sx / rRes, sy / rRes, ring[2]];
}

/**
 * Build a closed shell from outer + inner ring stacks.
 * Both stacks must use the same rRes and be ordered bottom → top with >= 2 rings each.
 * When `capTop` is false, the top annulus is omitted (the shell is left open at
 * the top — used when a separate lid closes it).
 * When `bottomHoleRadius` > 0, a round hole of that radius is punched vertically
 * through the bottom (both bottom discs become annuli joined by a cylindrical
 * hole wall) — used for the cottle's air-relief hole. Assumes the outer stack's
 * bottom ring sits below the inner stack's bottom ring (a floor slab between).
 */
export function buildRevolvedShell(outerRings: Ring[], innerRings: Ring[], rRes: number, capTop = true, bottomHoleRadius = 0): VaseMesh {
  const nOuter = outerRings.length;
  const nInner = innerRings.length;
  const hasHole = bottomHoleRadius > 0;

  const outerVerts = nOuter * rRes;
  const innerVerts = nInner * rRes;
  const outerBase = 0;
  const innerBase = outerVerts;
  const outerCenterIdx = outerVerts + innerVerts; // hole-outer ring base when hasHole
  const innerCenterIdx = outerCenterIdx + (hasHole ? rRes : 1); // hole-inner ring base when hasHole
  const totalVertices = outerVerts + innerVerts + (hasHole ? rRes * 2 : 2);

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);

  // Copy ring positions
  for (let r = 0; r < nOuter; r++) {
    positions.set(outerRings[r], (outerBase + r * rRes) * 3);
  }
  for (let r = 0; r < nInner; r++) {
    positions.set(innerRings[r], (innerBase + r * rRes) * 3);
  }
  // Disc centers (or hole rings around them)
  const [ocx, ocy, ocz] = ringCentroid(outerRings[0], rRes);
  const [icx, icy, icz] = ringCentroid(innerRings[0], rRes);
  if (hasHole) {
    for (let t = 0; t < rRes; t++) {
      const a = (t / rRes) * Math.PI * 2;
      const dx = Math.cos(a) * bottomHoleRadius;
      const dy = Math.sin(a) * bottomHoleRadius;
      const ho = (outerCenterIdx + t) * 3;
      positions[ho] = ocx + dx; positions[ho + 1] = ocy + dy; positions[ho + 2] = ocz;
      const hi = (innerCenterIdx + t) * 3;
      positions[hi] = icx + dx; positions[hi + 1] = icy + dy; positions[hi + 2] = icz;
    }
  } else {
    positions[outerCenterIdx * 3] = ocx;
    positions[outerCenterIdx * 3 + 1] = ocy;
    positions[outerCenterIdx * 3 + 2] = ocz;
    positions[innerCenterIdx * 3] = icx;
    positions[innerCenterIdx * 3 + 1] = icy;
    positions[innerCenterIdx * 3 + 2] = icz;
  }

  const outerQuads = (nOuter - 1) * rRes;
  const innerQuads = (nInner - 1) * rRes;
  const annulusTris = capTop ? rRes * 2 : 0;
  const bottomTris = hasHole ? rRes * 6 /*two annuli + hole wall*/ : rRes * 2 /*two disc fans*/;
  const totalTris = outerQuads * 2 + innerQuads * 2 + bottomTris + annulusTris;
  const indices = new Uint32Array(totalTris * 3);
  let o = 0;

  // Outer surface (faces outward)
  for (let r = 0; r < nOuter - 1; r++) {
    for (let t = 0; t < rRes; t++) {
      const tN = (t + 1) % rRes;
      const bl = outerBase + r * rRes + t;
      const br = outerBase + r * rRes + tN;
      const tl = outerBase + (r + 1) * rRes + t;
      const tr = outerBase + (r + 1) * rRes + tN;
      indices[o++] = bl; indices[o++] = tr; indices[o++] = tl;
      indices[o++] = bl; indices[o++] = br; indices[o++] = tr;
    }
  }

  // Inner surface (reversed winding — faces toward the axis / cavity)
  for (let r = 0; r < nInner - 1; r++) {
    for (let t = 0; t < rRes; t++) {
      const tN = (t + 1) % rRes;
      const bl = innerBase + r * rRes + t;
      const br = innerBase + r * rRes + tN;
      const tl = innerBase + (r + 1) * rRes + t;
      const tr = innerBase + (r + 1) * rRes + tN;
      indices[o++] = bl; indices[o++] = tl; indices[o++] = tr;
      indices[o++] = bl; indices[o++] = tr; indices[o++] = br;
    }
  }

  if (hasHole) {
    // Bottom with a through-hole: outer annulus (down), inner annulus (up),
    // and a cylindrical hole wall joining the two hole rings.
    for (let t = 0; t < rRes; t++) {
      const tN = (t + 1) % rRes;
      const o0 = outerBase + t, o1 = outerBase + tN;
      const h0 = outerCenterIdx + t, h1 = outerCenterIdx + tN;
      const i0 = innerBase + t, i1 = innerBase + tN;
      const g0 = innerCenterIdx + t, g1 = innerCenterIdx + tN;
      // Outer bottom annulus (normals down) — same orientation as the old fan
      indices[o++] = h0; indices[o++] = o1; indices[o++] = o0;
      indices[o++] = h0; indices[o++] = h1; indices[o++] = o1;
      // Inner bottom annulus (normals up — closes the cavity floor)
      indices[o++] = g0; indices[o++] = i0; indices[o++] = i1;
      indices[o++] = g0; indices[o++] = i1; indices[o++] = g1;
      // Hole wall (faces the hole axis), bottom ring → top ring
      indices[o++] = h0; indices[o++] = g0; indices[o++] = g1;
      indices[o++] = h0; indices[o++] = g1; indices[o++] = h1;
    }
  } else {
    // Outer bottom disc (fan, normals down)
    for (let t = 0; t < rRes; t++) {
      const tN = (t + 1) % rRes;
      const a = outerBase + t;
      const b = outerBase + tN;
      indices[o++] = outerCenterIdx; indices[o++] = b; indices[o++] = a;
    }

    // Inner bottom disc (fan, normals up — closes the cavity floor)
    for (let t = 0; t < rRes; t++) {
      const tN = (t + 1) % rRes;
      const a = innerBase + t;
      const b = innerBase + tN;
      indices[o++] = innerCenterIdx; indices[o++] = a; indices[o++] = b;
    }
  }

  // Top annulus (connects outer top ring ↔ inner top ring — the open rim / top face)
  if (capTop) {
    const outerTop = outerBase + (nOuter - 1) * rRes;
    const innerTop = innerBase + (nInner - 1) * rRes;
    for (let t = 0; t < rRes; t++) {
      const tN = (t + 1) % rRes;
      const oa = outerTop + t;
      const ob = outerTop + tN;
      const ia = innerTop + t;
      const ib = innerTop + tN;
      indices[o++] = oa; indices[o++] = ib; indices[o++] = ia;
      indices[o++] = oa; indices[o++] = ob; indices[o++] = ib;
    }
  }

  computeNormals(positions, indices, normals);
  return { positions, normals, indices, vertexCount: totalVertices, triangleCount: indices.length / 3 };
}

/**
 * Return a new ring formed by moving each point of `src` radially (relative to
 * the given center) by `delta` mm, and setting z to `newZ`. Preserves the
 * cross-section shape while growing/shrinking it by a uniform radial amount —
 * used to build the well collar, flange, cottle offset, and inner cavity walls.
 */
export function offsetRingRadial(src: Ring, cx: number, cy: number, delta: number, newZ: number, rRes: number): Ring {
  const out = new Float32Array(rRes * 3);
  for (let t = 0; t < rRes; t++) {
    const x = src[t * 3];
    const y = src[t * 3 + 1];
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx, dy);
    let nx: number, ny: number;
    if (r > 1e-6) {
      const f = Math.max(1e-4, (r + delta) / r);
      nx = cx + dx * f;
      ny = cy + dy * f;
    } else {
      nx = cx;
      ny = cy;
    }
    out[t * 3] = nx;
    out[t * 3 + 1] = ny;
    out[t * 3 + 2] = newZ;
  }
  return out;
}

/** Return a copy of a ring translated in z by dz. */
export function liftRing(src: Ring, dz: number, rRes: number): Ring {
  const out = new Float32Array(rRes * 3);
  for (let t = 0; t < rRes; t++) {
    out[t * 3] = src[t * 3];
    out[t * 3 + 1] = src[t * 3 + 1];
    out[t * 3 + 2] = src[t * 3 + 2] + dz;
  }
  return out;
}

/** Concatenate several mold meshes into one VaseMesh (for combined STL export / display). */
export function mergeMeshes(meshes: VaseMesh[]): VaseMesh {
  let vTotal = 0, iTotal = 0;
  for (const m of meshes) { vTotal += m.vertexCount; iTotal += m.indices.length; }
  const positions = new Float32Array(vTotal * 3);
  const normals = new Float32Array(vTotal * 3);
  const indices = new Uint32Array(iTotal);
  let vOff = 0, iOff = 0;
  for (const m of meshes) {
    positions.set(m.positions, vOff * 3);
    normals.set(m.normals, vOff * 3);
    for (let k = 0; k < m.indices.length; k++) indices[iOff + k] = m.indices[k] + vOff;
    vOff += m.vertexCount;
    iOff += m.indices.length;
  }
  return { positions, normals, indices, vertexCount: vTotal, triangleCount: iOff / 3 };
}
