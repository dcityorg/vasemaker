/**
 * V ridge/groove seam seal — shared by the pour mold styles.
 *
 * This is the profile from HandleMaker's plate/wall joint, which Gary poured on
 * 2026-07-28 with zero leaks; it replaced the square notch rings the pour molds
 * originally used. Both halves are pure triangles with a point apex:
 *
 *   ridge   base `vw` wide, `vh` tall, centred on the ring radius
 *   groove  the same triangle oversized by `clr` on each side and in depth
 *
 * Plaster has to travel the full zigzag to escape, so a loose fit still seals —
 * the clips do not need to pull the joint tight. The ridge base is sunk `EMBED`
 * below its host face so the slicer welds it instead of coplanar-touching.
 */

import { MeshBuilder, ensureOutward, type P2 } from '../handle/mesh3';
import type { VaseMesh } from '../types';

/** Feature-into-host overlap, mm. Matches the pour generators' EMBED. */
export const V_EMBED = 0.2;
/** Material left under a groove apex so it cannot eat through the flange, mm. */
const GROOVE_FLOOR = 0.6;

/** Concentric seal rings, matching the reference mold Gary poured leak-free. */
export const SEAL_RING_COUNT = 3;

/**
 * Radii of the seal rings, innermost first — ridges on the center flange,
 * grooves in the shell's underside, and (3-piece only) the vertical seam Vs at
 * the SAME radii, so the barrier turns the corner at the seam instead of
 * handing off to a different radius.
 *
 * Alignment is the point. Up to 2026-07-30 the vertical Vs were INTERLEAVED
 * between the rings, because a groove is subtractive and the shell's swept
 * flange reached the seam plane and filled any notch cut into it. The 3-piece
 * shell now stops short of the seam and a separate seam block owns the last few
 * mm, so a groove costs nothing and the vertical V can sit directly above the
 * ring ridge it continues.
 *
 * The innermost ring straddles the wall/flange junction — the furthest in it can
 * go with solid material on both sides, which shortens the plaster's run-up to
 * the first barrier. Callers pass `wallOuter` already clamped so the groove
 * cannot break out through the wall's inner face.
 */
export function vSeamLayout(wallOuter: number, overlap: number, vw: number, clr: number, edgeMargin: number): number[] {
  const half = vw / 2 + clr;
  const last = wallOuter + Math.max(half + 0.3, overlap - half - edgeMargin);
  const pitch = (last - wallOuter) / (SEAL_RING_COUNT - 1);
  return Array.from({ length: SEAL_RING_COUNT }, (_, i) => wallOuter + i * pitch);
}

/** Land left between two adjacent grooves, mm — one nozzle pass plus margin. */
const MIN_LAND = 0.6;

/**
 * Material left outboard of the OUTERMOST groove, mm. Tied to the shell wall
 * thickness at Gary's request (2026-07-30): the old fixed 0.3 mm left a sliver
 * at the flange edge that would split. Clamped so a small Overlap cannot let
 * the margin eat the whole flange and leave no room for the rings.
 */
export function vEdgeMargin(wallThickness: number, overlap: number): number {
  return Math.min(wallThickness, Math.max(0.3, (overlap - 4) / 2));
}

/**
 * Largest V base width that still leaves `MIN_LAND` between adjacent grooves.
 *
 * With N rings spanning `wallOuter` → flange edge − half − edgeMargin, the pitch
 * is (overlap − half − edgeMargin)/(N−1) and the land is pitch − 2·half, so
 * half ≤ (overlap − edgeMargin − (N−1)·MIN_LAND) / (2N−1). Without this the
 * grooves merge, the flange profile folds back on itself, and earcut emits
 * garbage — so the V shrinks rather than the mold breaking.
 */
export function vMaxWidth(overlap: number, edgeMargin: number, clr: number): number {
  const half = (overlap - edgeMargin - (SEAL_RING_COUNT - 1) * MIN_LAND) / (2 * SEAL_RING_COUNT - 1);
  return Math.max(0.3, 2 * (half - clr));
}

/** Groove depth, clamped so it never breaks through a thin flange. */
export function vGrooveDepth(vh: number, clr: number, flangeThickness: number): number {
  return Math.min(vh + clr, flangeThickness - GROOVE_FLOOR);
}

/**
 * Ridge cross-section in (radial offset, z) for sweeping around a contour.
 * `zFace` is the host's top face; the base sits V_EMBED below it.
 */
export function vRidgeSection(centre: number, zFace: number, vw: number, vh: number): P2[] {
  return [
    [centre - vw / 2, zFace - V_EMBED],
    [centre + vw / 2, zFace - V_EMBED],
    [centre, zFace + vh],
  ];
}

/**
 * Groove points for a swept flange underside, in OUTER → INNER radial order so
 * they drop straight into a profile that is being walked inward. `zFace` is the
 * flange underside; the apex rises `depth` into the material.
 */
export function vGrooveSection(centre: number, zFace: number, vw: number, clr: number, depth: number): P2[] {
  const half = vw / 2 + clr;
  return [
    [centre + half, zFace],
    [centre, zFace + depth],
    [centre - half, zFace],
  ];
}

/**
 * Sweep a closed (u, z) cross-section around a per-station contour, producing a
 * torus-topology solid — one connected component by construction, the same
 * technique the shell uses. `stationAt(t, u, z)` places a point.
 */
export function sweepContourSection(
  section: P2[],
  count: number,
  stationAt: (t: number, u: number, z: number) => [number, number, number],
): VaseMesh {
  const mb = new MeshBuilder();
  const rings: number[][] = [];
  for (let t = 0; t < count; t++) {
    const ring: number[] = [];
    for (const [u, z] of section) {
      const [x, y, zz] = stationAt(t, u, z);
      ring.push(mb.vertex(x, y, zz));
    }
    rings.push(ring);
  }
  const n = section.length;
  for (let t = 0; t < count; t++) {
    const tn = (t + 1) % count;
    for (let j = 0; j < n; j++) {
      const jn = (j + 1) % n;
      mb.quad(rings[t][j], rings[t][jn], rings[tn][jn], rings[tn][j]);
    }
  }
  return ensureOutward(mb.build());
}
