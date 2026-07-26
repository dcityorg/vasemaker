/**
 * Handle master geometry — elliptical cross-section swept along the spine, with
 * a flared well cone at each end, plus the mid-plane silhouette polygon that
 * drives the plate pocket.
 *
 * Master-local coordinates: spine in the x–y plane (x = depth, y = height),
 * z = out-of-plane (cross-section thickness). The parting plane is z = 0.
 * Well cones extend in −x beyond the vase-wall plane (x = 0) and end with
 * circular openings in the plane x = −coneLength.
 */

import type { SpineStation } from './spine';
import { MeshBuilder, ensureOutward, dedupeLoop, type P2 } from './mesh3';
import type { VaseMesh } from '../types';

export interface HandleBodyDims {
  /** Cross-section half-width (in the parting plane), mm. */
  hw: number;
  /** Cross-section half-thickness (out of plane), mm. */
  ht: number;
  /** Well opening radius, mm. */
  openR: number;
  /** Cone length from handle end to the opening plane, mm. */
  coneLen: number;
}

interface ConeStation {
  cx: number;
  cy: number;
  /** In-plane unit basis vector for the ring's parting-plane axis. */
  ux: number;
  uy: number;
  /** In-plane semi-axis. */
  a: number;
  /** Out-of-plane semi-axis. */
  b: number;
}

/**
 * Cross-section stations along one well cone, s=0 at the handle end (ellipse)
 * → s=1 at the opening plane (circle of openR at x = −coneLen). The cone axis
 * runs straight from the spine endpoint to the opening center (same y), so the
 * opening is always flush with and perpendicular to the wall face.
 */
function coneStation(end: SpineStation, dims: HandleBodyDims, s: number): ConeStation {
  const sigma = end.ny >= 0 ? 1 : -1;
  let ux = end.nx * (1 - s);
  let uy = end.ny * (1 - s) + sigma * s;
  const len = Math.hypot(ux, uy);
  if (len > 1e-9) {
    ux /= len;
    uy /= len;
  } else {
    ux = 0;
    uy = sigma;
  }
  return {
    cx: end.x * (1 - s) + -dims.coneLen * s,
    cy: end.y,
    ux,
    uy,
    a: dims.hw + (dims.openR - dims.hw) * s,
    b: dims.ht + (dims.openR - dims.ht) * s,
  };
}

const CONE_STEPS = 12;
const SEG = 48;

/**
 * Build the master mesh: opening A cap → cone A → swept tube → cone B →
 * opening B cap. One closed, outward-wound solid.
 */
export function buildMasterMesh(stations: SpineStation[], dims: HandleBodyDims): VaseMesh {
  const b = new MeshBuilder();
  const rings: number[][] = [];

  const pushRing = (c: ConeStation) => {
    const ring: number[] = [];
    for (let k = 0; k < SEG; k++) {
      const th = (k / SEG) * Math.PI * 2;
      const ca = Math.cos(th) * c.a;
      const sb = Math.sin(th) * c.b;
      ring.push(b.vertex(c.cx + c.ux * ca, c.cy + c.uy * ca, sb));
    }
    rings.push(ring);
  };

  const endA = stations[0];
  const endB = stations[stations.length - 1];

  // Cone A: opening → base
  for (let i = CONE_STEPS; i >= 1; i--) pushRing(coneStation(endA, dims, i / CONE_STEPS));
  // Tube
  for (const st of stations) {
    pushRing({ cx: st.x, cy: st.y, ux: st.nx, uy: st.ny, a: dims.hw, b: dims.ht });
  }
  // Cone B: base → opening
  for (let i = 1; i <= CONE_STEPS; i++) pushRing(coneStation(endB, dims, i / CONE_STEPS));

  // Surface strips
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < SEG; k++) {
      const kn = (k + 1) % SEG;
      b.quad(rings[r][k], rings[r][kn], rings[r + 1][kn], rings[r + 1][k]);
    }
  }

  // Opening caps (fans)
  const capA = coneStation(endA, dims, 1);
  const capB = coneStation(endB, dims, 1);
  const cA = b.vertex(capA.cx, capA.cy, 0);
  const cB = b.vertex(capB.cx, capB.cy, 0);
  const first = rings[0];
  const last = rings[rings.length - 1];
  for (let k = 0; k < SEG; k++) {
    const kn = (k + 1) % SEG;
    // Cap A closes the chain start (reversed relative to strip direction),
    // cap B closes the end. ensureOutward settles the global orientation;
    // the two fans just need to oppose each other so the solid stays manifold.
    b.tri(cA, first[kn], first[k]);
    b.tri(cB, last[k], last[kn]);
  }

  return ensureOutward(b.build());
}

/**
 * Mid-plane silhouette of the master (tube + both cones + flat opening edges)
 * as one closed polygon in handle-plane (x, y) coords, offset outward by
 * `clearance` mm. clearance=0 gives the true silhouette; the plate pocket uses
 * the fit clearance.
 */
export function silhouetteLoop(stations: SpineStation[], dims: HandleBodyDims, clearance: number): P2[] {
  const endA = stations[0];
  const endB = stations[stations.length - 1];
  const side = (sign: 1 | -1): P2[] => {
    const pts: P2[] = [];
    // Cone A from opening to base
    for (let i = CONE_STEPS; i >= 0; i--) {
      const c = coneStation(endA, dims, i / CONE_STEPS);
      pts.push([c.cx + sign * c.ux * (c.a + clearance), c.cy + sign * c.uy * (c.a + clearance)]);
    }
    // Tube
    for (const st of stations) {
      pts.push([st.x + sign * st.nx * (dims.hw + clearance), st.y + sign * st.ny * (dims.hw + clearance)]);
    }
    // Cone B from base to opening
    for (let i = 0; i <= CONE_STEPS; i++) {
      const c = coneStation(endB, dims, i / CONE_STEPS);
      pts.push([c.cx + sign * c.ux * (c.a + clearance), c.cy + sign * c.uy * (c.a + clearance)]);
    }
    return pts;
  };
  // minus side A→B, then plus side B→A: the flat opening edges at x=−coneLen
  // close the loop implicitly between the two sides.
  return dedupeLoop([...side(-1), ...side(1).reverse()]);
}

/**
 * Self-intersection test for the silhouette. Nearby segment pairs are skipped:
 * a spine kink or slightly-too-tight bend folds the offset curve into a tiny
 * local cusp (a few segments wide) that prints fine — only genuinely separated
 * crossings (the handle curling back over itself) are flagged.
 */
export function loopSelfIntersects(loop: P2[], minSeparation = 6): boolean {
  const n = loop.length;
  const segs: [P2, P2][] = [];
  for (let i = 0; i < n; i++) segs.push([loop[i], loop[(i + 1) % n]]);
  for (let i = 0; i < n; i++) {
    for (let j = i + minSeparation; j < n; j++) {
      // Skip wrap-adjacent pairs at the loop closure
      if (i + n - j < minSeparation) continue;
      if (segIntersect(segs[i], segs[j])) return true;
    }
  }
  return false;
}

function segIntersect(s1: [P2, P2], s2: [P2, P2]): boolean {
  const [[ax, ay], [bx, by]] = s1;
  const [[cx, cy], [dx, dy]] = s2;
  const d1 = cross(cx - ax, cy - ay, bx - ax, by - ay);
  const d2 = cross(dx - ax, dy - ay, bx - ax, by - ay);
  const d3 = cross(ax - cx, ay - cy, dx - cx, dy - cy);
  const d4 = cross(bx - cx, by - cy, dx - cx, dy - cy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}
