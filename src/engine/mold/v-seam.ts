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

export interface SeamLayout {
  /** Radii of the two horizontal ring features (ridge on the master, groove on the shell). */
  rings: [number, number];
  /** Radii of the two vertical seam features — 3-piece only, interleaved between the rings. */
  verticals: [number, number];
}

/**
 * Four features alternating outward: ring, vertical, ring, vertical.
 *
 * Interleaving them is what lets the flange run UNBROKEN to the seam. When the
 * vertical V shared a radius with a ring, the master's ridge already occupied
 * that space at flange level, so the fin had to replace the flange locally and
 * the ring grooves died a few mm short of the seam (Gary's 2026-07-29 photo).
 * Off-radius, the two never meet and nothing has to be cut away.
 *
 * The innermost ring straddles the wall/flange junction — the furthest in it can
 * go with solid material on both sides. Further in and the groove would break
 * through the shell's 3 mm wall bottom, or leave a sub-nozzle lip that will not
 * print. It also shortens the plaster's run-up to the first barrier.
 *
 * `wallOuter` is the shell wall's outer face (offset from the contour); features
 * spread from there to the flange edge, held clear by a half-width plus margin.
 */
export function vSeamLayout(wallOuter: number, overlap: number, vw: number, clr: number): SeamLayout {
  const half = vw / 2 + clr;
  const last = wallOuter + Math.max(half + 0.3, overlap - half - 0.3);
  const pitch = (last - wallOuter) / 3;
  const at = (i: number) => wallOuter + i * pitch;
  return { rings: [at(0), at(2)], verticals: [at(1), at(3)] };
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
