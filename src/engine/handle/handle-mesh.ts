/**
 * Handle master geometry (v3, 2026-07-26) — the master is built from THREE
 * closed solids so the wells can be toggled in the viewport and the handle
 * body always ends in a flat, wall-parallel face:
 *
 * 1. BODY — half-ellipse (+ optional hollow channel) cross-section swept along
 *    the spine. The spine is EXTENDED past the vase-wall plane (x = 0) along
 *    its end tangents and every vertex is clamped to x ≥ 0, which cuts the
 *    body flat at the wall plane no matter what angle it approaches at — one
 *    side of the tube gets longer, the other shorter, exactly like trimming a
 *    cast handle flat against the pot.
 * 2. WELLS (×2) — each is TWO solids running perpendicular to the wall: a
 *    round half-cylinder (radius openR, hollow with the body's shell) at the
 *    mold wall, and a SOLID transition lofting from the cylinder's round
 *    profile down to the handle's true cut outline at the tip plane — its rim
 *    lies exactly on the handle surface (no gap, no fin), stretching only in
 *    the direction an angled handle drifts.
 *
 * Master-local coordinates: spine in the x–y plane (x = depth, y = height),
 * z = out-of-plane. Parting plane z = 0; the half cross-section (z ≥ 0) rides
 * on a `seat`-deep vertical skirt down to the flat bottom.
 */

import type { SpineStation } from './spine';
import { MeshBuilder, ensureOutward, dedupeLoop, triangulateFace, type P2 } from './mesh3';
import type { VaseMesh } from '../types';
import { mergeMeshes as mergeMeshesLocal } from '../mold/ring-mesh';

export interface HandleBodyDims {
  /** Cross-section half-width (in the parting plane), mm. */
  hw: number;
  /** Cross-section half-thickness (out of plane), mm. */
  ht: number;
  /** Well opening / cylinder radius, mm. */
  openR: number;
  /** Straight cylinder length at the mold wall, mm. */
  cylLen: number;
  /** Transition (loft) length from the cylinder to the handle cut, mm. */
  coneLen: number;
}

export interface MasterOptions {
  seat: number;
  hollow: boolean;
  shellT: number;
}

export interface MasterParts {
  body: VaseMesh;
  wellA: VaseMesh;
  wellB: VaseMesh;
  /** Mid-plane silhouette of body + wells, offset outward by `clearance` mm. */
  silhouetteAt: (clearance: number) => P2[];
}

const HALF_SEG = 24;
const EXT_RINGS = 16;
/** The wells' cone tip sits this far past the wall plane, buried inside the
 * body so the two solids genuinely overlap (slicer union). */
const CONE_TIP_X = 2;

/**
 * Solid half cross-section: upper half-ellipse (a × b) + vertical skirt down
 * to the flat bottom at z = −seat. Closed CCW loop of HALF_SEG + 3 points.
 */
function halfProfile(a: number, b: number, seat: number): P2[] {
  const pts: P2[] = [];
  for (let j = 0; j <= HALF_SEG; j++) {
    const th = (j / HALF_SEG) * Math.PI;
    pts.push([Math.cos(th) * a, Math.sin(th) * b]);
  }
  pts.push([-a, -seat]);
  pts.push([a, -seat]);
  return pts;
}

/**
 * Hollow (channel) cross-section: the solid profile shelled to thickness sT,
 * open at the flat bottom. Closed simple loop.
 */
function channelProfile(a: number, b: number, sT: number, seat: number): P2[] {
  const ai = a - sT;
  const bi = b - sT;
  const pts: P2[] = [];
  pts.push([a, -seat]);
  for (let j = 0; j <= HALF_SEG; j++) {
    const th = (j / HALF_SEG) * Math.PI;
    pts.push([Math.cos(th) * a, Math.sin(th) * b]);
  }
  pts.push([-a, -seat]);
  pts.push([-ai, -seat]);
  for (let j = HALF_SEG; j >= 0; j--) {
    const th = (j / HALF_SEG) * Math.PI;
    pts.push([Math.cos(th) * ai, Math.sin(th) * bi]);
  }
  pts.push([ai, -seat]);
  return pts;
}

/**
 * Half-OBROUND (stadium/slot) cross-section for the wells: a half-circle of
 * radius R stretched by straight spans — a1 toward −u, a2 toward +u — plus the
 * vertical skirt. a1 = a2 = 0 degenerates to the plain half-circle. Point
 * count matches halfProfile (same K = HALF_SEG/2 per quarter arc), so round
 * and stretched rings loft index-to-index.
 */
function halfObround(a1: number, a2: number, R: number, seat: number): P2[] {
  const K = HALF_SEG / 2;
  const pts: P2[] = [];
  for (let j = 0; j <= K; j++) {
    const th = (j / K) * (Math.PI / 2);
    pts.push([a2 + Math.cos(th) * R, Math.sin(th) * R]);
  }
  for (let j = 1; j <= K; j++) {
    const th = Math.PI / 2 + (j / K) * (Math.PI / 2);
    pts.push([-a1 + Math.cos(th) * R, Math.sin(th) * R]);
  }
  pts.push([-a1 - R, -seat]);
  pts.push([a2 + R, -seat]);
  return pts;
}

/** Hollow (channel) version of the half-obround, open at the flat bottom —
 * the inner surface shares the spans (an obround's inward offset is an
 * obround with the same centers and radius − sT). */
function channelObround(a1: number, a2: number, R: number, sT: number, seat: number): P2[] {
  const K = HALF_SEG / 2;
  const Ri = R - sT;
  const pts: P2[] = [];
  pts.push([a2 + R, -seat]);
  for (let j = 0; j <= K; j++) {
    const th = (j / K) * (Math.PI / 2);
    pts.push([a2 + Math.cos(th) * R, Math.sin(th) * R]);
  }
  for (let j = 1; j <= K; j++) {
    const th = Math.PI / 2 + (j / K) * (Math.PI / 2);
    pts.push([-a1 + Math.cos(th) * R, Math.sin(th) * R]);
  }
  pts.push([-a1 - R, -seat]);
  pts.push([-a1 - Ri, -seat]);
  for (let j = K; j >= 1; j--) {
    const th = Math.PI / 2 + (j / K) * (Math.PI / 2);
    pts.push([-a1 + Math.cos(th) * Ri, Math.sin(th) * Ri]);
  }
  for (let j = K; j >= 0; j--) {
    const th = (j / K) * (Math.PI / 2);
    pts.push([a2 + Math.cos(th) * Ri, Math.sin(th) * Ri]);
  }
  pts.push([a2 + Ri, -seat]);
  return pts;
}

interface RingFrame {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
}

/** Ring frames for the extended spine chain: [ext A (far → near), stations,
 * ext B (near → far)]. Extensions CURVE from the end tangent into straight-
 * through-the-wall (−x) over ~1.5 handle-widths, so even a near-parallel
 * approach dives through the wall plane quickly — a straight-tangent
 * extension would slide along the wall and leave a clamped tail nub. */
function extendedFrames(stations: SpineStation[], dims: HandleBodyDims): { frames: RingFrame[]; extALen: number } {
  const endA = stations[0];
  const endB = stations[stations.length - 1];
  const frames: RingFrame[] = [];
  const ext = (end: SpineStation, dx0: number, dy0: number): RingFrame[] => {
    const out: RingFrame[] = [];
    const blendLen = dims.hw * 1.5;
    const ds = (dims.hw + 4) / 6;
    let cx = end.x, cy = end.y, sAcc = 0;
    for (let e = 0; e < EXT_RINGS; e++) {
      const w = Math.min(1, sAcc / blendLen);
      let dx = dx0 * (1 - w) - w;
      let dy = dy0 * (1 - w);
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      cx += dx * ds; cy += dy * ds; sAcc += ds;
      out.push({ cx, cy, ux: end.nx, uy: end.ny });
      if (cx < -(dims.hw + 2)) break; // whole cross-section is behind the wall
    }
    return out;
  };
  const extA = ext(endA, -endA.tx, -endA.ty); // outward = backwards at the start
  const extB = ext(endB, endB.tx, endB.ty);
  for (let i = extA.length - 1; i >= 0; i--) frames.push(extA[i]);
  for (const st of stations) frames.push({ cx: st.x, cy: st.y, ux: st.nx, uy: st.ny });
  for (const f of extB) frames.push(f);
  return { frames, extALen: extA.length };
}

/** Map a profile point onto a ring frame. */
function framePoint(f: RingFrame, u: number, z: number): [number, number, number] {
  return [f.cx + f.ux * u, f.cy + f.uy * u, z];
}

export function buildMasterParts(stations: SpineStation[], dims: HandleBodyDims, opts: MasterOptions): MasterParts {
  const seat = opts.seat;
  const outerProfile = halfProfile(dims.hw, dims.ht, seat);
  const canHollow = opts.hollow && opts.shellT < Math.min(dims.hw, dims.ht) - 0.5;
  const bodyProfile = canHollow ? channelProfile(dims.hw, dims.ht, opts.shellT, seat) : outerProfile;

  const { frames, extALen } = extendedFrames(stations, dims);
  const stationBase = extALen; // index of stations[0] in frames
  // Strand list for the transition outline when hollow — the body's channel
  // cross-section (outer surface then inner shell), same topology as
  // channelObround so the loft maps index-to-index.
  const channelProfileForOutline = channelProfile(dims.hw, dims.ht, opts.shellT, seat);

  // ── Body: sweep the profile along the chain, clamp every vertex to x ≥ 0 ──
  const bb = new MeshBuilder();
  const M = bodyProfile.length;
  const rings: number[][] = [];
  for (let i = 0; i < frames.length; i++) {
    const isEnd = i === 0 || i === frames.length - 1;
    const ring: number[] = [];
    for (const [u, z] of bodyProfile) {
      const [x, y, zz] = framePoint(frames[i], u, z);
      // End rings are forced fully onto the cut plane so the caps are planar.
      ring.push(bb.vertex(isEnd ? 0 : Math.max(0, x), y, zz));
    }
    rings.push(ring);
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < M; k++) {
      const kn = (k + 1) % M;
      bb.quad(rings[r][k], rings[r][kn], rings[r + 1][kn], rings[r + 1][k]);
    }
  }
  // Caps in profile-INDEX space reusing ring vertices (deterministic
  // orientation relative to the strips — see v2 cap lesson in the plan doc).
  const bodyFace = triangulateFace(bodyProfile, []);
  const first = rings[0];
  const last = rings[rings.length - 1];
  for (const [i, j, k] of bodyFace.tris) {
    bb.tri(first[i], first[k], first[j]);
    bb.tri(last[i], last[j], last[k]);
  }
  const body = ensureOutward(bb.build());

  // ── Wells: round hollow half-cylinder + SOLID transition lofting onto the
  // handle's actual cut surface ──
  // Each well = two solids. The cylinder runs perpendicular to the wall
  // (radius openR, hollow with the body's shell). The transition lofts from
  // the cylinder's round profile down to the handle's TRUE cut outline at the
  // tip plane (per-strand crossing of the extended tube) — so its rim lies
  // exactly ON the handle surface: no gap under the arch, no fin poking
  // through, and it stretches only in the direction an angled handle drifts.
  // The transition stays solid (tiny volume; shelling an arbitrary outline
  // invites offset cusps), embedded 0.3 mm into the cylinder for union.
  const xOpen = -(dims.cylLen + dims.coneLen);
  const xCyl = -dims.coneLen;

  /** Per-strand crossing of the tube's surface with the plane x = px — the
   * crossing NEAREST this end. Walks from the outermost extension ring
   * (beyond the wall, x ≤ 0) inward, so a tube that hugs the wall or crosses
   * the plane again mid-run can't hijack a strand (the bogus-fallback stub).
   * The first `tuckCount` strands (the OUTER surface) are pulled `tuck` mm
   * toward the tube's local center, so the transition's rim dives just under
   * the handle's skin — otherwise the curved tube bulges through the straight
   * loft edge between strands, leaving paper-thin crescent fins. */
  const crossingOutline = (profile: P2[], outerIdx: number, step: -1 | 1, px: number, endIdx: number, tuckCount: number, tuck: number): [number, number, number][] => {
    const out: [number, number, number][] = [];
    for (let k = 0; k < profile.length; k++) {
      const [u, z] = profile[k];
      let found: [number, number, number] | null = null;
      let cyCross = frames[endIdx].cy;
      let prev = framePoint(frames[outerIdx], u, z);
      for (let i = outerIdx + step; i >= 0 && i < frames.length; i += step) {
        const cur = framePoint(frames[i], u, z);
        if (prev[0] <= px && cur[0] > px) {
          const t = (px - prev[0]) / Math.max(1e-9, cur[0] - prev[0]);
          found = [px, prev[1] + (cur[1] - prev[1]) * t, z];
          cyCross = frames[i - step].cy + (frames[i].cy - frames[i - step].cy) * t;
          break;
        }
        prev = cur;
      }
      if (!found) {
        // Strand never rises past the plane — anchor at the end station
        const fp = framePoint(frames[endIdx], u, z);
        found = [px, fp[1], z];
      }
      if (k < tuckCount) {
        const dy = cyCross - found[1];
        const ad = Math.abs(dy);
        if (ad > 1e-6) found[1] += Math.sign(dy) * Math.min(tuck, ad);
      }
      out.push(found);
    }
    return out;
  };

  interface WellBuild { cyl: VaseMesh; trans: VaseMesh; extNeg: number; extPos: number; }
  const buildWell = (end: SpineStation, outerIdx: number, step: -1 | 1, endIdx: number): WellBuild => {
    // σ aligns the well ring's +u axis with the tube's in-plane normal at this
    // end so loft strand k connects the matching side (no 180° twist).
    const sigma = end.ny >= 0 ? 1 : -1;
    const hollowWell = canHollow && dims.openR - opts.shellT > 0.8;

    // Cylinder (its own closed solid; annular caps when hollow)
    const cylProf = hollowWell
      ? channelObround(0, 0, dims.openR, opts.shellT, seat)
      : halfObround(0, 0, dims.openR, seat);
    const cb = new MeshBuilder();
    const cylRing = (x: number): number[] =>
      cylProf.map(([u, z]) => cb.vertex(x, end.y + sigma * u, z));
    const cr0 = cylRing(xOpen);
    const cr1 = cylRing(xCyl);
    const Mc = cylProf.length;
    for (let k = 0; k < Mc; k++) {
      const kn = (k + 1) % Mc;
      cb.quad(cr0[k], cr0[kn], cr1[kn], cr1[k]);
    }
    const cylFace = triangulateFace(cylProf, []);
    for (const [i, j, k] of cylFace.tris) {
      cb.tri(cr0[i], cr0[k], cr0[j]);
      cb.tri(cr1[i], cr1[j], cr1[k]);
    }
    const cyl = ensureOutward(cb.build());

    // Transition: lofts from the cylinder's profile to the tube's cut outline.
    // Hollow with the body (its cavity lofts from the cylinder bore onto the
    // handle's INNER shell outline, so the void runs continuously cylinder →
    // transition → handle). Starts a hair SMALLER than the cylinder so
    // surfaces never coincide in the overlap zone (slicer-ambiguous).
    const startProf = canHollow
      ? channelObround(0, 0, dims.openR - 0.05, opts.shellT, seat)
      : halfObround(0, 0, dims.openR - 0.05, seat);
    // Body-profile strands: outer surface first (tucked), then inner (hollow)
    const outerCount = HALF_SEG + 3;
    const outline = crossingOutline(
      canHollow ? channelProfileForOutline : outerProfile,
      outerIdx, step, CONE_TIP_X, endIdx,
      outerCount, 0.4
    );
    const tb = new MeshBuilder();
    const Mt = startProf.length;
    if (outline.length !== Mt) throw new Error('transition strand mismatch');
    const startPts = startProf.map(([u, z]) => [xCyl - 0.3, end.y + sigma * u, z] as [number, number, number]);
    const stack = [startPts, outline];
    const idx = stack.map((ring) => ring.map(([x, y, z]) => tb.vertex(x, y, z)));
    for (let k = 0; k < Mt; k++) {
      const kn = (k + 1) % Mt;
      tb.quad(idx[0][k], idx[0][kn], idx[1][kn], idx[1][k]);
    }
    // Caps in profile-INDEX space reusing ring vertices (start reversed, end
    // as-is — the body's rule). Handles the hollow channel's annular face;
    // the deformed outline end is buried in/around the handle.
    const transFace = triangulateFace(startProf, []);
    for (const [i, j, k] of transFace.tris) {
      tb.tri(idx[0][i], idx[0][k], idx[0][j]);
      tb.tri(idx[1][i], idx[1][j], idx[1][k]);
    }
    const trans = ensureOutward(tb.build());

    let extNeg = 0, extPos = 0;
    for (const [, y] of outline) {
      const dy = y - end.y;
      if (dy > extPos) extPos = dy;
      if (-dy > extNeg) extNeg = -dy;
    }
    return { cyl, trans, extNeg, extPos };
  };

  const wA = buildWell(stations[0], 0, 1, stationBase);
  const wB = buildWell(stations[stations.length - 1], frames.length - 1, -1, stationBase + stations.length - 1);
  const wellA = mergeMeshesLocal([wA.cyl, wA.trans]);
  const wellB = mergeMeshesLocal([wB.cyl, wB.trans]);

  // ── Silhouette ──
  const endA = stations[0];
  const endB = stations[stations.length - 1];
  const sigmaA = endA.ny >= 0 ? 1 : -1;
  const sigmaB = endB.ny >= 0 ? 1 : -1;
  const silhouetteAt = (cl: number): P2[] => {
    const side = (sign: 1 | -1): P2[] => {
      const pts: P2[] = [];
      // ySign keeps each side continuous with the tube's n-relative offsets
      const ysA = sign * sigmaA;
      const ysB = sign * sigmaB;
      // Well A: opening + cylinder edge, then the cone edge necking in
      pts.push([xOpen, endA.y + ysA * (dims.openR + cl)]);
      pts.push([xCyl, endA.y + ysA * (dims.openR + cl)]);
      pts.push([CONE_TIP_X, endA.y + ysA * ((ysA > 0 ? wA.extPos : wA.extNeg) + cl)]);
      // Body: station offsets. Points behind the cone tip plane OR inside
      // either cone-tip circle are skipped — the loop already encloses those
      // regions via the well segments, and keeping them would jog the
      // boundary back into itself (worst at steeply angled approaches, where
      // the auto-grown cone swallows a long stretch of the tube).
      const inWell = (ox: number, oy: number, end: SpineStation, w: { neg: number; pos: number }): boolean => {
        if (ox < CONE_TIP_X) return true;
        // Distance to the transition tip's footprint (slot along y)
        const dy = oy - end.y;
        const sPos = Math.max(0, w.pos - dims.hw);
        const sNeg = Math.max(0, w.neg - dims.hw);
        const dyc = Math.min(sPos, Math.max(-sNeg, dy));
        return Math.hypot(ox - CONE_TIP_X, dy - dyc) < dims.hw + cl + 0.4;
      };
      const offs: P2[] = [];
      for (const st of stations) {
        const ox = st.x + sign * st.nx * (dims.hw + cl);
        offs.push([ox, st.y + sign * st.ny * (dims.hw + cl)]);
      }
      let lo = 0;
      while (lo < offs.length && inWell(offs[lo][0], offs[lo][1], endA, { neg: wA.extNeg, pos: wA.extPos })) lo++;
      let hi = offs.length - 1;
      while (hi >= 0 && inWell(offs[hi][0], offs[hi][1], endB, { neg: wB.extNeg, pos: wB.extPos })) hi--;
      for (let i = lo; i <= hi; i++) pts.push(offs[i]);
      // Well B: cone edge back out to the opening
      pts.push([CONE_TIP_X, endB.y + ysB * ((ysB > 0 ? wB.extPos : wB.extNeg) + cl)]);
      pts.push([xCyl, endB.y + ysB * (dims.openR + cl)]);
      pts.push([xOpen, endB.y + ysB * (dims.openR + cl)]);
      return pts;
    };
    return removeLocalCusps(dedupeLoop([...side(-1), ...side(1).reverse()]));
  };

  return { body, wellA, wellB, silhouetteAt };
}

/**
 * Remove tiny LOCAL self-intersection cusps from a loop — a spine kink folds
 * the inner offset curve into a small loop-let a few segments wide (see the
 * v2 offset-cusp lesson). The cusp is physically meaningless (sub-mm) but a
 * self-crossing polygon makes earcut emit sliver triangles with T-junction
 * edges in the plate faces. Crossing segment pairs up to `maxSpan` apart are
 * cut at their intersection point, removing the loop-let.
 */
function removeLocalCusps(loop: P2[], maxSpan = 8): P2[] {
  const pts = loop.slice();
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 50) {
    changed = false;
    const n = pts.length;
    outer: for (let i = 0; i < n; i++) {
      for (let d = 2; d <= maxSpan; d++) {
        const j = i + d;
        if (j >= n) break;
        const s1: [P2, P2] = [pts[i], pts[i + 1]];
        const s2: [P2, P2] = [pts[j], pts[(j + 1) % n]];
        if (!segIntersect(s1, s2)) continue;
        const ip = segIntersectionPoint(s1, s2);
        if (!ip) continue;
        // Cut the loop-let: replace pts[i+1 .. j] with the intersection point
        pts.splice(i + 1, j - i, ip);
        changed = true;
        break outer;
      }
    }
  }
  return pts;
}

function segIntersectionPoint(s1: [P2, P2], s2: [P2, P2]): P2 | null {
  const [[ax, ay], [bx, by]] = s1;
  const [[cx, cy], [dx, dy]] = s2;
  const r1x = bx - ax, r1y = by - ay;
  const r2x = dx - cx, r2y = dy - cy;
  const den = r1x * r2y - r1y * r2x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * r2y - (cy - ay) * r2x) / den;
  return [ax + r1x * t, ay + r1y * t];
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
