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
import { MeshBuilder, ensureOutward, dedupeLoop, triangulateFace, weldMesh, type P2 } from './mesh3';
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
  /** Solid pull-ribs bridging the open channel, mm along the handle. 0 = none. */
  ribWidth: number;
  /** How many along the strap. Each well gets one regardless (when width > 0). */
  ribCount: number;
}

export interface MasterParts {
  /** True when the channel was actually hollowed. */
  hollowed: boolean;
  body: VaseMesh;
  wellA: VaseMesh;
  wellB: VaseMesh;
  /** Mid-plane silhouette of body + wells, offset outward by `clearance` mm. */
  silhouetteAt: (clearance: number) => P2[];
}

let HALF_SEG = 24;
/** Set the cross-section segment count. Module-level (like svg-pattern's data
 *  setter) because the profile builders are called from deep in the sweep and
 *  threading a count through every one of them buys nothing. */
export function setSectionSegments(n: number): void {
  HALF_SEG = Math.max(6, Math.round(n));
}
const EXT_RINGS = 48;
/** The wells' cone tip sits this far past the wall plane, buried inside the
 * body so the two solids genuinely overlap (slicer union). */
const CONE_TIP_X = 2;
/**
 * How far a pull-rib's own surface sits inside the master's outer skin, mm.
 * A rib is a solid slice, so without this its flank would be COINCIDENT with
 * the shell it laps into — the one thing the overlap discipline forbids.
 */
const RIB_INSET = 0.15;
/** A well's rib sits this far in from the open end (Gary: "2 mm or so"). */
const RIB_WELL_INSET = 2;

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
 * OPEN along the flat bottom — the shell walls run all the way down to
 * z = −seat and rest on the plate's lip, and everything between them is void.
 *
 * From 2026-07-30 to 2026-08-08 the channel was floored by a separate plug
 * solid so a leak at the seat lip could not get inside the master, and that
 * plug carried the seat-lip V groove. Gary poured with it (2026-08-08) and
 * reported the opposite problem: a closed-bottomed master is very hard to pry
 * out of the set plaster, and plaster getting into the channel is not a real
 * problem. Plug and groove are both gone; the shell IS the master.
 */
function channelProfile(a: number, b: number, sT: number, seat: number): P2[] {
  const ai = a - sT;
  const bi = b - sT;
  const zSkirt = -seat;
  const pts: P2[] = [];
  pts.push([a, zSkirt]);
  for (let j = 0; j <= HALF_SEG; j++) {
    const th = (j / HALF_SEG) * Math.PI;
    pts.push([Math.cos(th) * a, Math.sin(th) * b]);
  }
  pts.push([-a, zSkirt]);
  pts.push([-ai, zSkirt]);
  for (let j = HALF_SEG; j >= 0; j--) {
    const th = (j / HALF_SEG) * Math.PI;
    pts.push([Math.cos(th) * ai, Math.sin(th) * bi]);
  }
  pts.push([ai, zSkirt]);
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
    // Fine steps: these rings carry the clamped cut face, where the tube's
    // offset curves hardest — and the body plug's seat groove is a chord
    // between them, which has to agree with the well plug's own samples.
    const ds = Math.min(0.55, (dims.hw + 4) / 14);
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
  /**
   * Frames whose ENTIRE cross-section sits behind the wall clamp to x = 0 and
   * enclose no volume: two of them in a row are joined by a strip that lies
   * flat in the wall plane. Those zero-thickness sheets are the paper-thin fins
   * at the junction — on an angled approach the extension drifts in y as it
   * curves back into -x, so each sheet lands at a different y and the outermost
   * ones stick out past the solid (and past the well funnel) with no thickness
   * at all. A straight approach drifts nowhere, which is why it looks clean.
   *
   * Sweeping only the innermost of each buried run deletes the sheets and
   * nothing else: a zero-volume set is not part of the solid, so the master,
   * its volume and its silhouette are unchanged. `frames` itself is untouched —
   * the crossing walks, the seal lines and the pocket envelope still see every
   * frame.
   */
  const sweepIdx = ((): number[] => {
    const uMax = dims.hw + 0.1; // widest u any swept profile uses, plus slack
    const buried = (i: number): boolean => frames[i].cx + Math.abs(frames[i].ux) * uMax <= 0;
    let lo = 0, hi = frames.length - 1;
    while (lo + 1 < hi && buried(lo) && buried(lo + 1)) lo++;
    while (hi - 1 > lo && buried(hi) && buried(hi - 1)) hi--;
    const out: number[] = [];
    for (let i = lo; i <= hi; i++) out.push(i);
    return out;
  })();
  /** Frame index that splits the chain between the two ends — the cut outlines
   *  and the well-region scans below only walk their own half. */
  const midFrame = stationBase + Math.floor(stations.length / 2);

  /**
   * y where the swept curve traced by profile point `u` (at the mid-plane)
   * crosses the plane x = px, walking from outside the wall inward — the
   * crossing NEAREST this end, so a tube that hugs the wall or crosses again
   * mid-run can't hijack the strand. Null when it never rises past the plane.
   *
   * Note x and y do not depend on z (`framePoint` puts the profile's z straight
   * through), so one call per profile-u answers for the whole strand.
   */
  const edgeAt = (u: number, px: number, outerIdx: number, step: -1 | 1): number | null => {
    let prev = framePoint(frames[outerIdx], u, 0);
    for (let i = outerIdx + step; i >= 0 && i < frames.length; i += step) {
      const cur = framePoint(frames[i], u, 0);
      if (prev[0] <= px && cur[0] > px) {
        const t = (px - prev[0]) / Math.max(1e-9, cur[0] - prev[0]);
        return prev[1] + (cur[1] - prev[1]) * t;
      }
      prev = cur;
    }
    return null;
  };

  /**
   * TRUE cut outline at the vase-wall plane, per end: the y at which each
   * profile strand crosses x = 0.
   *
   * The sweep used to clamp each vertex with `Math.max(0, x)` and keep the
   * frame's own y. That folds the buried part of a ring flat onto the wall
   * plane at whatever y that ring happened to be at — and since the extension
   * drifts in y as it curves back through the wall, consecutive rings fold to
   * DIFFERENT y and the strip between them is a zero-volume sheet. Those are
   * the paper-thin flaps at the transition (Gary, 2026-08-08). v1.28.1 removed
   * the sheets from rings that were ENTIRELY buried; these come from the rings
   * that only PARTLY are — on a half-ellipse the crown (small |u|) goes behind
   * the wall several frames before the flanks (large |u|) do, so ~9 rings fold
   * their crown band and fan out in y.
   *
   * Pinning every buried strand to its own crossing makes the cut face the
   * exact planar trim instead of a smear: all those rings then share the same
   * points and `weldMesh` drops the collapsed quads. Guarded — if either
   * outline comes out incomplete or self-crossing (which would make the end cap
   * garbage) the old clamp is used, sheets and all.
   */
  const cutOutline = (outerIdx: number, step: -1 | 1): number[] | null => {
    const ys: number[] = [];
    for (const [u] of bodyProfile) {
      const y = edgeAt(u, 0, outerIdx, step);
      if (y === null) return null;
      ys.push(y);
    }
    // The cap is triangulated in profile-INDEX space, so the outline has to be
    // a simple polygon in the (y, z) plane of the cut.
    const loop: P2[] = bodyProfile.map(([, z], k) => [ys[k], z]);
    return loopSelfIntersects(loop, 4) ? null : ys;
  };
  const cutA = cutOutline(0, 1);
  const cutB = cutOutline(frames.length - 1, -1);

  // ── Body: sweep the profile along the chain, trimmed at the wall plane ──
  const bb = new MeshBuilder();
  const M = bodyProfile.length;
  const rings: number[][] = [];
  for (const i of sweepIdx) {
    const isEnd = i === sweepIdx[0] || i === sweepIdx[sweepIdx.length - 1];
    const cut = i < midFrame ? cutA : cutB;
    const ring: number[] = [];
    for (let k = 0; k < M; k++) {
      const [u, z] = bodyProfile[k];
      const [x, y, zz] = framePoint(frames[i], u, z);
      // End rings are forced fully onto the cut plane so the caps are planar.
      if (x > 0 && !isEnd) ring.push(bb.vertex(x, y, zz));
      else ring.push(bb.vertex(0, cut ? cut[k] : y, zz));
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
  // Weld: pinning collapses every buried strand of every partly-buried ring
  // onto the same point, so the quads between those rings have no area. They
  // are dropped here rather than shipped as zero-area triangles.
  let body = ensureOutward(weldMesh(bb.build()));

  // (The body's channel plug is built AFTER the wells — its groove has to bend
  // onto the line the well plugs could actually host, so it needs their answer.)

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

  interface WellBuild {
    cyl: VaseMesh;
    trans: VaseMesh;
    extNeg: number;
    extPos: number;
  }
  const buildWell = (end: SpineStation, outerIdx: number, step: -1 | 1, endIdx: number): WellBuild => {
    // σ aligns the well ring's +u axis with the tube's in-plane normal at this
    // end so loft strand k connects the matching side (no 180° twist).
    const sigma = end.ny >= 0 ? 1 : -1;
    const hollowWell = canHollow && dims.openR - opts.shellT > 0.8;

    // Cylinder (its own closed solid; annular caps when hollow). A plain
    // straight bore: until 2026-08-08 it carried a groove for a ring in the
    // wall's collar bore, which sealed well and was very hard to clean plaster
    // out of (Gary, after pouring). The collar is a plain clearance fit now.
    const profAt = (r: number): P2[] => hollowWell
      ? channelObround(0, 0, r, opts.shellT, seat)
      : halfObround(0, 0, r, seat);
    const cylProf = profAt(dims.openR);
    const cb = new MeshBuilder();
    const cRings = [xOpen, xCyl].map((x) => cylProf.map(([u, z]) => cb.vertex(x, end.y + sigma * u, z)));
    const Mc = cylProf.length;
    for (let r = 0; r + 1 < cRings.length; r++) {
      for (let k = 0; k < Mc; k++) {
        const kn = (k + 1) % Mc;
        cb.quad(cRings[r][k], cRings[r][kn], cRings[r + 1][kn], cRings[r + 1][k]);
      }
    }
    const cylFace = triangulateFace(cylProf, []);
    const cr0 = cRings[0], cr1 = cRings[cRings.length - 1];
    for (const [i, j, k] of cylFace.tris) {
      cb.tri(cr0[i], cr0[k], cr0[j]);
      cb.tri(cr1[i], cr1[j], cr1[k]);
    }
    const cyl = ensureOutward(cb.build());

    // Transition: lofts from the cylinder's profile to the tube's cut outline.
    //
    // HOLLOW again (2026-08-09). It was made solid on 2026-07-30 so a leak at
    // the seat lip could not run from the bore into the body channel — moot
    // since v1.29.0, where the whole underside is open by design — and Gary
    // marked these two lumps "A" and asked for them hollow like the rest: they
    // are the stiffest part of the master and the hardest to lever out.
    //
    // No offsetting is involved (the old worry): `channelObround` and
    // `channelProfile` are the shelled forms of the two ends' own profiles and
    // share their point ORDER and COUNT exactly — outer-bottom, outer arc
    // right→left, outer-bottom, inner-bottom, inner arc left→right,
    // inner-bottom — so the loft still runs index to index.
    //
    // Both ends are sized so the transition's material lands strictly INSIDE
    // its neighbour's, never coincident with it: 0.1 mm thinner than the
    // cylinder's shell at the start (already 0.05 under its radius), 0.3 mm
    // thinner than the body's at the tip. That also keeps the VOID continuous,
    // which is what makes the whole underside one open channel.
    const hollowTrans = hollowWell && dims.hw - opts.shellT > 0.8;
    const startProf = hollowTrans
      ? channelObround(0, 0, dims.openR - 0.05, Math.max(0.5, opts.shellT - 0.1), seat)
      : halfObround(0, 0, dims.openR - 0.05, seat);
    const tipProfile = hollowTrans
      ? channelProfile(dims.hw, dims.ht, Math.max(0.5, opts.shellT - 0.3), seat)
      : outerProfile;
    // Only the OUTER strands get the rim tuck; they are the first HALF_SEG + 3
    // points of either profile.
    const outerCount = HALF_SEG + 3;
    const outline = crossingOutline(
      tipProfile,
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
    // Welded: the rim tuck clamps at the distance to the tube centre, so on a
    // near-straight approach several strands close to the crown land on the
    // very same point and the loft quads between them collapse. Unwelded those
    // are degenerate triangles (4 of them on preset D).
    const trans = ensureOutward(weldMesh(tb.build()));

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
  let wellA = mergeMeshesLocal([wA.cyl, wA.trans]);
  let wellB = mergeMeshesLocal([wB.cyl, wB.trans]);

  const endA = stations[0];
  const endB = stations[stations.length - 1];
  const sigmaA = endA.ny >= 0 ? 1 : -1;
  const sigmaB = endB.ny >= 0 ? 1 : -1;

  // ── Pull-ribs ────────────────────────────────────────────────────────────
  // Short SOLID slices bridging the open channel. The channel is open either
  // side of one, so long-nose jaws drop in and close on its two faces; that is
  // what you pull on to lever the master out of the set plaster (Gary,
  // 2026-08-09 — "I really had to tug and wiggle the plastic a lot").
  //
  // Each is its own overlapping closed solid rather than a swap of profile
  // inside the body sweep: the solid and channel profiles have different point
  // counts, so they cannot share a sweep, and separate solids are the idiom
  // here anyway. Inset `RIB_INSET` from the outer skin so the flanks lap into
  // the shell instead of coinciding with it.
  //
  // They live INSIDE the shell, so the plaster cavity — and therefore the cast
  // handle — is untouched by them.
  const ribW = Math.max(0, opts.ribWidth);
  if (ribW > 0.2) {
    /** Cumulative arc length along the stations — ribs are spaced by real
     *  distance along the handle, not by Bezier parameter (the stations are
     *  uniform in the parameter, which bunches them where the curve is slow). */
    const arc: number[] = [0];
    for (let i = 1; i < stations.length; i++) {
      arc.push(arc[i - 1] + Math.hypot(stations[i].x - stations[i - 1].x, stations[i].y - stations[i - 1].y));
    }
    const total = arc[arc.length - 1];
    /** Fractional station index at arc length `s`. */
    const stationAt = (s: number): number => {
      if (s <= 0) return 0;
      if (s >= total) return stations.length - 1;
      let lo = 0, hi = arc.length - 1;
      while (lo + 1 < hi) {
        const m = (lo + hi) >> 1;
        if (arc[m] <= s) lo = m; else hi = m;
      }
      return lo + (s - arc[lo]) / Math.max(1e-9, arc[lo + 1] - arc[lo]);
    };
    /** Frame at a fractional index; the u-axis is renormalised after the lerp. */
    const frameAtIdx = (fi: number): RingFrame => {
      const i0 = Math.max(0, Math.min(frames.length - 1, Math.floor(fi)));
      const i1 = Math.min(frames.length - 1, i0 + 1);
      const t = Math.max(0, Math.min(1, fi - i0));
      const a = frames[i0], b = frames[i1];
      let ux = a.ux + (b.ux - a.ux) * t;
      let uy = a.uy + (b.uy - a.uy) * t;
      const L = Math.hypot(ux, uy) || 1;
      ux /= L; uy /= L;
      return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, ux, uy };
    };
    /** Sweep a solid profile over the frames spanning one rib. */
    const ribSolid = (fIdx: number[], prof: P2[]): VaseMesh => {
      const rb = new MeshBuilder();
      const RM = prof.length;
      const rr = fIdx.map((fi) => {
        const f = frameAtIdx(fi);
        return prof.map(([u, z]) => {
          const [x, y, zz] = framePoint(f, u, z);
          return rb.vertex(Math.max(0, x), y, zz);
        });
      });
      for (let r = 0; r + 1 < rr.length; r++) {
        for (let k = 0; k < RM; k++) {
          const kn = (k + 1) % RM;
          rb.quad(rr[r][k], rr[r][kn], rr[r + 1][kn], rr[r + 1][k]);
        }
      }
      const face = triangulateFace(prof, []);
      const f0 = rr[0], f1 = rr[rr.length - 1];
      for (const [i, j, k] of face.tris) {
        rb.tri(f0[i], f0[k], f0[j]);
        rb.tri(f1[i], f1[j], f1[k]);
      }
      return ensureOutward(rb.build());
    };

    // Along the strap: evenly spaced, and kept clear of both ends so a rib can
    // never straddle the wall plane (where the sweep is being trimmed).
    const ribProf = halfProfile(dims.hw - RIB_INSET, dims.ht - RIB_INSET, seat);
    const margin = ribW / 2 + dims.hw + 2;
    const n = Math.max(0, Math.round(opts.ribCount));
    const ribs: VaseMesh[] = [];
    for (let k = 1; k <= n; k++) {
      const sc = (total * k) / (n + 1);
      if (sc - ribW / 2 < margin || sc + ribW / 2 > total - margin) continue;
      const f0 = stationBase + stationAt(sc - ribW / 2);
      const f1 = stationBase + stationAt(sc + ribW / 2);
      const idx = [f0];
      for (let i = Math.ceil(f0 + 1e-6); i < f1 - 1e-6; i++) idx.push(i);
      idx.push(f1);
      ribs.push(ribSolid(idx, ribProf));
    }
    if (ribs.length) body = mergeMeshesLocal([body, ...ribs]);

    // In each well: a straight plug across the bore, just inside the open end.
    // Sized off the CYLINDER, not the strap — the bore is much the wider of the
    // two, and this is the stiffest thing on the master to pull against.
    const wellRib = (end: SpineStation, sigma: 1 | -1): VaseMesh | null => {
      // Sized to the bore it sits in: a short cylinder gets a narrower rib
      // pushed closer to the open end rather than no rib at all.
      const avail = dims.cylLen - 0.5;
      const w = Math.min(ribW, avail - 0.6);
      if (w < 0.8) return null;
      const x0 = xOpen + Math.min(RIB_WELL_INSET, avail - w);
      const x1 = x0 + w;
      const prof = halfObround(0, 0, dims.openR - RIB_INSET, seat);
      const rb = new MeshBuilder();
      const rings = [x0, x1].map((x) => prof.map(([u, z]) => rb.vertex(x, end.y + sigma * u, z)));
      const RM = prof.length;
      for (let k = 0; k < RM; k++) {
        const kn = (k + 1) % RM;
        rb.quad(rings[0][k], rings[0][kn], rings[1][kn], rings[1][k]);
      }
      const face = triangulateFace(prof, []);
      for (const [i, j, k] of face.tris) {
        rb.tri(rings[0][i], rings[0][k], rings[0][j]);
        rb.tri(rings[1][i], rings[1][j], rings[1][k]);
      }
      return ensureOutward(rb.build());
    };
    if (canHollow) {
      const ra = wellRib(endA, sigmaA);
      const rbm = wellRib(endB, sigmaB);
      if (ra) wellA = mergeMeshesLocal([wellA, ra]);
      if (rbm) wellB = mergeMeshesLocal([wellB, rbm]);
    }
  }

  // ── Silhouette ──
  /**
   * Outward extent of the master at plane `px`, on the strap side `sign` of
   * well `w` — the larger of the transition's own lofted flank and the tube's
   * surface where it crosses that plane.
   *
   * Until 2026-07-31 the well region was closed with a single straight CHORD
   * from the cylinder to the transition tip, which cut ~1 mm INSIDE the tube
   * near the wall plane: the body's cut face is wider than the transition
   * there (the spine's extension curves, so the clamped section bulges). The
   * master then fouled the plate's pocket wall and sat 2 mm proud on two
   * corners — with the master held off the lip, no amount of sealing helps.
   */
  const wellFlank = (px: number, ys: 1 | -1, w: WellBuild): number => {
    if (px > CONE_TIP_X) return -Infinity; // the transition ends at the tip plane
    // The transition STARTS 0.3 mm inside the cylinder, so over that overlap the
    // cylinder is the wider solid and its radius is the answer. Without this the
    // taper has already begun at the plane where `silhouetteAt` hands over from
    // the straight cylinder edge to this envelope, and the pocket is cut a
    // fraction narrower than the cylinder it has to clear. Harmless while the
    // funnel is shallow; at openR 11 into a 5.6 mm strap it is ~0.1 mm and the
    // master lands on the plate's top slab (found 2026-08-09 via the new
    // defaults, whose bigger well made the taper nearly twice as steep).
    if (px <= xCyl) return dims.openR;
    const span = CONE_TIP_X - (xCyl - 0.3);
    const t = Math.min(1, Math.max(0, (px - (xCyl - 0.3)) / span));
    return dims.openR + t * ((ys > 0 ? w.extPos : w.extNeg) - dims.openR);
  };
  const wellEnvelope = (
    cl: number, sign: 1 | -1, ys: 1 | -1, end: SpineStation, w: WellBuild,
    outerIdx: number, step: -1 | 1, xStop: number,
  ): P2[] => {
    const out: P2[] = [];
    const N = 16;
    const planes: number[] = [];
    for (let k = 0; k <= N; k++) planes.push(xCyl + ((xStop - xCyl) * k) / N);
    // The tube's clamped cut face appears abruptly at the wall plane, so put a
    // sample either side of it — an evenly spaced list steps straight over the
    // step and interpolates back inside the master.
    // Extra planes where the boundary turns hardest — right at the wall, where
    // the clamped cut face appears, and just past it as the strand swings back.
    if (xStop > 0.1) {
      planes.push(-0.2, -0.12, -0.05, 0.01, 0.1, 0.25, 0.5, 0.8, 1.2, 1.7, 2.4, 3.2);
    }
    planes.sort((a, b) => a - b);
    for (const px of planes) {
      if (px < xCyl - 1e-9 || px > xStop + 1e-9) continue;
      let d = wellFlank(px, ys, w) + cl;
      // The tube's own extent at this plane, from BOTH measures — neither alone
      // is enough. The offset strand is the true envelope along the smooth
      // stretch (a per-frame scan misses it: the widest section at a plane
      // usually lies BETWEEN two sampled frames). The per-frame scan is what
      // catches the clamped cut face at the wall, where the strand is clamped
      // away and the piled-up sections are the widest thing there.
      // A hair of slack on the tube terms: the swept surface is polygonal and
      // this boundary is sampled, so the two disagree by a few hundredths —
      // enough for a corner of the master to catch on the pocket wall.
      const bias = 0.1;
      // Opened out over the same ramp the well plug widens on, so the pocket is
      // never the narrower of the two.
      if (px >= -0.15) {
        const strand = edgeAt(sign * (dims.hw + cl), px, outerIdx, step);
        if (strand !== null) d = Math.max(d, ys * (strand - end.y) + bias);
        const i0 = step > 0 ? 0 : midFrame;
        const i1 = step > 0 ? midFrame : frames.length;
        for (let i = i0; i < i1; i++) {
          const f = frames[i];
          if (Math.abs(f.ux) < 1e-6) continue;
          const u = (px - f.cx) / f.ux;
          if (Math.abs(u) > dims.hw + cl + 1e-6) continue;
          d = Math.max(d, ys * (f.cy + f.uy * u - end.y) + bias);
        }
      }
      if (Number.isFinite(d)) out.push([px, end.y + ys * d]);
    }
    return out;
  };
  const silhouetteAt = (cl: number): P2[] => {
    const side = (sign: 1 | -1): P2[] => {
      const pts: P2[] = [];
      // ySign keeps each side continuous with the tube's n-relative offsets
      const ysA = (sign * sigmaA) as 1 | -1;
      const ysB = (sign * sigmaB) as 1 | -1;
      // Well A: opening + cylinder edge, then the transition edge necking in
      pts.push([xOpen, endA.y + ysA * (dims.openR + cl)]);
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
      // The skipped stretch is bridged by the ENVELOPE of the well and the tube
      // rather than a chord, so the boundary always encloses the master.
      const stopA = lo < offs.length ? Math.max(CONE_TIP_X, offs[lo][0]) : CONE_TIP_X;
      const stopB = hi >= 0 ? Math.max(CONE_TIP_X, offs[hi][0]) : CONE_TIP_X;
      pts.push(...wellEnvelope(cl, sign, ysA, endA, wA, 0, 1, stopA));
      for (let i = lo; i <= hi; i++) pts.push(offs[i]);
      // Well B: transition edge back out to the opening
      pts.push(...wellEnvelope(cl, sign, ysB, endB, wB, frames.length - 1, -1, stopB).reverse());
      pts.push([xOpen, endB.y + ysB * (dims.openR + cl)]);
      return pts;
    };
    return removeLocalCusps(dedupeLoop([...side(-1), ...side(1).reverse()]));
  };

  return { hollowed: canHollow, body, wellA, wellB, silhouetteAt };
}

/**
 * Remove tiny LOCAL self-intersection cusps from a loop — a spine kink folds
 * the inner offset curve into a small loop-let a few segments wide (see the
 * v2 offset-cusp lesson). The cusp is physically meaningless (sub-mm) but a
 * self-crossing polygon makes earcut emit sliver triangles with T-junction
 * edges in the plate faces. Crossing segment pairs up to `maxSpan` apart are
 * cut at their intersection point, removing the loop-let.
 */
function removeLocalCusps(loop: P2[], maxSpan = 8, closed = true): P2[] {
  const pts = loop.slice();
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 50) {
    changed = false;
    const n = pts.length;
    outer: for (let i = 0; i < n; i++) {
      for (let d = 2; d <= maxSpan; d++) {
        const j = i + d;
        if (j >= n || (!closed && j >= n - 1)) break;
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
