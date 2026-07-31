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
  /** Seat-lip V groove in the skirt bottom, mating the plate's lip ridge.
   *  `depth` is measured inward from the master's outline. Null = no groove. */
  seatV: { depth: number; gW: number; gH: number } | null;
  /** Groove around each well cylinder at x, receiving the collar's bore ring. */
  collarV: { x: number; halfW: number; depth: number } | null;
}

export interface MasterParts {
  /** True when the channel was actually hollowed (and so has a plug to groove). */
  hollowed: boolean;
  body: VaseMesh;
  wellA: VaseMesh;
  wellB: VaseMesh;
  /** Mid-plane silhouette of body + wells, offset outward by `clearance` mm. */
  silhouetteAt: (clearance: number) => P2[];
  /**
   * The two seat-lip seal lines (one per side of the strap), each running from
   * `xEnd` at well A, along the handle, to `xEnd` at well B — the exact centre
   * lines of the master's underside grooves, so the plate's ridges are built
   * from the same numbers rather than from a parallel derivation.
   *
   * `inset` pulls the line further inboard (used for the tape-hole boundary,
   * which has to clear the ridge). Null when there is no seal to run.
   */
  seatSealPaths: ((xEnd: number, inset: number) => P2[][]) | null;
}

/** Where the well plug switches from its straight run to tracking the body
 *  plug — a hair BEFORE the wall plane, so by the time the body plug exists
 *  the two grooves already coincide. */
const WELL_STEP = -0.03;


/** Where the well plugs hand the groove over to the body plug (mm past the
 *  wall plane, so the two solids overlap instead of touching coplanar). */
const SEAL_JOIN = 0.3;

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
 * Cap thickness under the hollow channel, mm. The void's floor sits this far
 * above the master's flat bottom, so the underside is a CLOSED solid face.
 *
 * Until 2026-07-30 the channel was open along its whole flat bottom — one long
 * trough running the length of the handle and out through both wells, closed
 * only by the tape across the plate's access hole. Gary poured a mold on
 * 2026-07-30 and plaster that crossed the seat lip ran the entire underside.
 * Capping it means a leak can no longer get INSIDE the master; it also gives
 * the tape a continuous flat face to grab instead of two thin shell rails.
 *
 * Never thicker than the skirt, so the plug stays inside it and the underside
 * becomes a solid band — which is also what gives the seat lip's V groove
 * material to cut into.
 */
export function capThickness(sT: number, seat: number): number {
  // Strictly inside the skirt: at seat exactly, the void floor would land on
  // the parting plane and coincide with the inner profile's own end points —
  // duplicate loop points, which earcut turns into degenerate slivers.
  return Math.min(sT, Math.max(0.8, seat - 0.4));
}

/**
 * Hollow (channel) cross-section: the solid profile shelled to thickness sT,
 * open at the flat bottom. Closed simple loop.
 *
 * It has to stay open here: a single closed loop cannot enclose a DETACHED
 * void, so there is no way to floor the channel from inside the cross-section.
 * The floor is a separate swept plug solid instead — see `capThickness`.
 */
function channelProfile(a: number, b: number, sT: number, seat: number): P2[] {
  const ai = a - sT;
  const bi = b - sT;
  // The skirt stops SHORT of the flat bottom, overlapping the plug by 0.3: the
  // plug alone then forms the whole underside, so the seat-lip groove cut into
  // it is exposed everywhere rather than being filled by shell-wall material
  // wherever the two overlap (2026-07-31 — that swallowed the groove entirely,
  // and squeezing it inboard of the wall left it hard against the tape hole).
  const zSkirt = -seat + Math.max(0, capThickness(sT, seat) - 0.3);
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

/**
 * Bottom edge from −au to +au at z = −seat, with a V notch centred on `gLo`
 * and another on `gHi`, each rising `gH`. Points run in increasing u so the
 * caller's loop stays CCW. Falls back to a plain flat edge when the notches
 * would overlap each other or run off the ends — the two centres are allowed
 * to differ because near the wall the groove bends onto the wells' line.
 */
function notchedBottom(au: number, seat: number, v: { gLo: number; gHi: number; gW: number; gH: number } | null): P2[] {
  const flat: P2[] = [[-au, -seat], [au, -seat]];
  if (!v) return flat;
  const { gLo, gHi, gW, gH } = v;
  if (gLo - gW <= -au + 0.05 || gHi + gW >= au - 0.05 || gLo + gW >= gHi - gW) return flat;
  return [
    [-au, -seat],
    [gLo - gW, -seat], [gLo, -seat + gH], [gLo + gW, -seat],
    [gHi - gW, -seat], [gHi, -seat + gH], [gHi + gW, -seat],
    [au, -seat],
  ];
}

export function buildMasterParts(stations: SpineStation[], dims: HandleBodyDims, opts: MasterOptions): MasterParts {
  const seat = opts.seat;
  const outerProfile = halfProfile(dims.hw, dims.ht, seat);
  const canHollow = opts.hollow && opts.shellT < Math.min(dims.hw, dims.ht) - 0.5;
  const bodyProfile = canHollow ? channelProfile(dims.hw, dims.ht, opts.shellT, seat) : outerProfile;
  const capT = capThickness(opts.shellT, seat);
  /**
   * Skirt depth used by every solid EXCEPT the underside plugs. They stop
   * `capT − 0.3` above the flat bottom (same rule `channelProfile` already
   * applies to the body's shell) so the plugs ALONE own the underside — which
   * is what keeps the seat-lip groove exposed instead of quietly filled by a
   * neighbouring solid that also reaches z = −seat.
   */
  const skirtSeat = canHollow ? seat - Math.max(0, capT - 0.3) : seat;
  /** The body's outer profile with that raised skirt — what the wells' loft
   *  rims must land on, since the shell no longer reaches the bottom. */
  const cutProfile = canHollow ? halfProfile(dims.hw, dims.ht, skirtSeat) : outerProfile;
  const sv = opts.seatV;
  /** Groove height actually cut into the plugs (never through their roof). */
  const seatGH = sv ? Math.min(sv.gH, capT - 0.4) : 0;
  const sealOn = canHollow && sv !== null && seatGH > 0.2;

  const { frames, extALen } = extendedFrames(stations, dims);
  const stationBase = extALen; // index of stations[0] in frames
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
  let body = ensureOutward(bb.build());

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

  /**
   * y where the swept curve traced by profile point `u` (at the mid-plane)
   * crosses the plane x = px, walking from outside the wall inward like
   * `crossingOutline`. Null when that strand never rises past the plane.
   *
   * With u = ±hw this is the master's true edge at that plane; with u = ±(hw −
   * seat-V depth) it is the body plug's groove line — which is how the well
   * seal knows where to meet the body's groove instead of guessing.
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

  interface WellBuild {
    cyl: VaseMesh;
    trans: VaseMesh;
    extNeg: number;
    extPos: number;
    /** Seal-line offset from the well axis, per world side (−1 / +1), or null
     *  when no groove fits under this well. */
    sealD: { [k: string]: number } | null;
    /** Profile-u that puts the BODY plug's groove on this well's seal line at
     *  the join plane, per strap side (frame-u sign). Null = leave the body
     *  line alone (a near-parallel approach makes the solve ill-conditioned). */
    uEnd: { [k: string]: number | null };
    /** Groove centre line under this well — the plate's ridge is swept along
     *  the very same samples. */
    sealY: ((ys: 1 | -1, x: number) => number) | null;
    /** Planes at which the plug (and so the ridge) is sampled. */
    sealXs: number[];
  }
  const buildWell = (end: SpineStation, outerIdx: number, step: -1 | 1, endIdx: number): WellBuild => {
    // σ aligns the well ring's +u axis with the tube's in-plane normal at this
    // end so loft strand k connects the matching side (no 180° twist).
    const sigma = end.ny >= 0 ? 1 : -1;
    const hollowWell = canHollow && dims.openR - opts.shellT > 0.8;

    // Cylinder (its own closed solid; annular caps when hollow)
    const profAt = (r: number): P2[] => hollowWell
      ? channelObround(0, 0, r, opts.shellT, skirtSeat)
      : halfObround(0, 0, r, skirtSeat);
    const cylProf = profAt(dims.openR);
    // Groove for the collar's bore ring — the cylinder's radius dips over a
    // slightly wider span than the ring, so the ring seats with clearance.
    const cv = opts.collarV;
    const useCv = cv !== null && cv.x - cv.halfW > xOpen + 0.05 && cv.x + cv.halfW < xCyl - 0.05
      && cv.depth > 0.1 && cv.depth < opts.shellT - 0.3;
    const cxs = useCv && cv ? [xOpen, cv.x - cv.halfW, cv.x, cv.x + cv.halfW, xCyl] : [xOpen, xCyl];
    const rCyl = (x: number): number => (useCv && cv
      ? dims.openR - cv.depth * Math.max(0, 1 - Math.abs(x - cv.x) / cv.halfW)
      : dims.openR);
    const cb = new MeshBuilder();
    const cRings = cxs.map((x) => profAt(rCyl(x)).map(([u, z]) => cb.vertex(x, end.y + sigma * u, z)));
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
    let cyl = ensureOutward(cb.build());
    // Plug the bore's open bottom, same idea as the body's (a closed loop
    // cannot enclose a detached void). Built after the transition, below —
    // ONE plug spans the cylinder AND the transition so the seat groove runs
    // unbroken from the mold wall to the body plug.

    // Transition: lofts from the cylinder's profile to the tube's cut outline.
    // ALWAYS SOLID (2026-07-30). It used to loft hollow, so the void ran
    // continuously cylinder → transition → handle — one trough the length of
    // the master, which is how a leak at the seat lip reached everywhere. Solid
    // here isolates the bore from the body channel, and each of those is
    // floored by its own plug, so no void is reachable from under the plate.
    // Costs very little plastic. Starts a hair SMALLER than the cylinder so
    // surfaces never coincide in the overlap zone (slicer-ambiguous).
    const startProf = halfObround(0, 0, dims.openR - 0.05, skirtSeat);
    // Body-profile strands: outer surface only, now that this is solid.
    const outerCount = HALF_SEG + 3;
    const outline = crossingOutline(
      cutProfile,
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

    // ── Underside plug: the well's floor AND the seat-lip groove ──
    // One solid from the mold wall to SEAL_JOIN, so the barrier the plate's
    // ridge rides in is continuous from the wall to where the body plug (whose
    // groove follows the spine) takes over. The cylinder and transition above
    // it now stop at `skirtSeat`, so this plug alone owns the underside — the
    // 2026-07-31 lesson: a groove cut into a solid that another solid also
    // reaches is filled, and every manifold check still passes.
    let sealD: { [k: string]: number } | null = null;
    let sealY: ((ys: 1 | -1, x: number) => number) | null = null;
    let sealXs: number[] = [];
    const uEnd: { [k: string]: number | null } = { '-1': null, '1': null };
    if (canHollow) {
      const x0 = xOpen;
      const x1 = SEAL_JOIN;
      // Transition edge at a plane: the loft runs xCyl−0.3 (radius openR) →
      // CONE_TIP_X (the cut outline), so its flank interpolates linearly.
      const tSpan = CONE_TIP_X - (xCyl - 0.3);
      const flank = (x: number, ys: 1 | -1): number => {
        if (x <= xCyl) return dims.openR;
        const t = Math.min(1, Math.max(0, (x - (xCyl - 0.3)) / tSpan));
        return dims.openR + t * ((ys > 0 ? extPos : extNeg) - dims.openR);
      };
      let xs = [x0, xCyl];
      for (let i = 1; i <= 8; i++) xs.push(xCyl + ((0 - xCyl) * i) / 8);
      // Dense past the wall plane: the plug widens abruptly there (the body's
      // clamped cut face is wider than the transition) and its groove starts
      // tracking the body's strand.
      for (const x of [-2.2, -1.8, -1.4, -1.0, -0.6, -0.3, -0.1, -0.02, 0.05, 0.12, 0.2, x1]) {
        if (x <= x1 + 1e-9) xs.push(x);
      }
      /** Half-width the plug may occupy: the transition's flank, or the body's
       *  own section once past the wall, where the body plug backs it. */
      /** Half-width the plug may occupy — the transition's own flank, never
       *  more: past the wall the body is wider, but this plug has to stay
       *  inside the master's footprint at every plane it spans, and the
       *  narrowest of those is what the pocket is cut to. */
      const half = (x: number, ys: 1 | -1): number => flank(x, ys) + 0.05;

      if (sealOn && sv) {
        const gW = sv.gW;
        // Widest offset the groove can sit at and still have plug either side
        // of it at EVERY station — checked here rather than trusted, because a
        // notch that overruns its host silently degrades to a flat bottom.
        let dMax = Infinity;
        const dJoin: { [k: string]: number } = {};
        for (const ysN of [-1, 1] as const) {
          for (const x of xs) dMax = Math.min(dMax, half(x, ysN) - gW - 0.25);
          const yb = edgeAt(ysN * sigma * (dims.hw - sv.depth), 0, outerIdx, step);
          dJoin[ysN] = yb === null ? Infinity : Math.abs(yb - end.y);
        }
        const d: { [k: string]: number } = {};
        let ok = true;
        for (const ysN of [-1, 1] as const) {
          d[ysN] = Math.min(dims.openR - sv.depth, dJoin[ysN], dMax);
          if (!(d[ysN] > gW + 0.4)) ok = false;
        }
        if (ok) sealD = d;
      }

      // Profile-u that lands the body plug's groove on this seal line at the
      // WALL PLANE — where the body plug starts, so the two grooves agree
      // exactly at the handover instead of meeting at an angle. That matters more than it looks: `sweepClosedLoop`
      // miters its corners, so a near-square turn in the ridge path balloons
      // the ridge's base by up to 2.5x and it no longer fits its own groove.
      // The body plug then BENDS onto this line over `SEAL_TAPER`, and
      // (below) this plug tracks that same strand through the overlap — two V's
      // even a couple of tenths apart intersect to a shallower groove, and the
      // ridge lifts the master by the difference.
      if (sealD && sv) {
        for (const ysN of [-1, 1] as const) {
          const sgn = (ysN * sigma) as 1 | -1;
          const target = end.y + ysN * sealD[ysN];
          // Frame where the body's nominal groove crosses the wall plane —
          // used only to turn a wanted world y into a profile u.
          let anchor: RingFrame | null = null;
          let prev = framePoint(frames[outerIdx], sgn * (dims.hw - sv.depth), 0);
          for (let i = outerIdx + step; i >= 0 && i < frames.length; i += step) {
            const cur = framePoint(frames[i], sgn * (dims.hw - sv.depth), 0);
            if (prev[0] <= 0 && cur[0] > 0) { anchor = frames[i]; break; }
            prev = cur;
          }
          if (!anchor || Math.abs(anchor.uy) < 0.3) continue;
          // Solve so the strand at u ACTUALLY passes through the target at
          // WELL_STEP. One linear guess is not enough — a different u crosses
          // the plane at a different frame — and being a couple of tenths out
          // here puts a corner in the ridge path that the mitered sweep cannot
          // follow, which is what lifts the master.
          let u = (target - anchor.cy) / anchor.uy;
          for (let k = 0; k < 6; k++) {
            const y = edgeAt(u, WELL_STEP, outerIdx, step);
            if (y === null) break;
            const err = y - target;
            if (Math.abs(err) < 0.002) break;
            u -= err / anchor.uy;
          }
          if (Math.abs(u) <= dims.hw - sv.gW - 0.4) uEnd[sgn] = u;
        }
      }

      /**
       * Groove centre at plane `x`, world y. Straight back from the wall, but
       * from `WELL_STEP` on it follows the body plug's own strand so the two
       * grooves coincide wherever both plugs exist. THE PLATE'S RIDGE IS BUILT
       * FROM THIS SAME FUNCTION — anywhere the two derivations could differ,
       * the ridge stands beside the groove and lifts the master by the gap.
       */
      sealY = (ysN: 1 | -1, x: number): number => {
        const flat = end.y + ysN * sealD![ysN];
        const u = uEnd[(ysN * sigma) as 1 | -1];
        let y = flat;
        // Past WELL_STEP, follow the body plug's own strand. No blend is needed
        // because `uEnd` is solved so that strand passes through `flat` at the
        // wall plane — the two lines meet there by construction, and a corner
        // in the ridge path is exactly what the mitered sweep cannot follow.
        if (x >= WELL_STEP && u !== null) {
          const s = edgeAt(u, x, outerIdx, step);
          if (s !== null) y = s;
        }
        // Never let the notch run off the plug — `notchedBottom` would fall
        // back to a flat bottom and the seal would vanish without a word.
        const lim = half(x, ysN) - sv!.gW - 0.25;
        return end.y + ysN * Math.min(lim, ysN * (y - end.y));
      };
      const zBot = -seat;
      const zTop = -seat + capT;
      const ring = (x: number): P2[] => {
        const yLo = end.y - half(x, -1);
        const yHi = end.y + half(x, 1);
        const bottom: P2[] = sealD
          ? (() => {
            const gW = sv!.gW;
            const gLo = Math.min(sealY!(-1, x), sealY!(1, x));
            const gHi = Math.max(sealY!(-1, x), sealY!(1, x));
            return [
              [yLo, zBot],
              [gLo - gW, zBot], [gLo, zBot + seatGH], [gLo + gW, zBot],
              [gHi - gW, zBot], [gHi, zBot + seatGH], [gHi + gW, zBot],
              [yHi, zBot],
            ];
          })()
          : [[yLo, zBot], [yHi, zBot]];
        return [...bottom, [yHi, zTop], [yLo, zTop]];
      };
      // Sorted and de-duplicated: two stations closer than a micron produce
      // zero-area quads, which every manifold check flags as degenerate.
      xs.sort((a, b) => a - b);
      xs = xs.filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-3);
      if (!sealD) sealY = null;
      sealXs = xs;
      const proto = ring(xCyl);
      const wb = new MeshBuilder();
      const wRings = xs.map((x) => ring(x).map(([y, z]) => wb.vertex(x, y, z)));
      const PM = proto.length;
      for (let r = 0; r + 1 < wRings.length; r++) {
        for (let k = 0; k < PM; k++) {
          const kn = (k + 1) % PM;
          wb.quad(wRings[r][k], wRings[r][kn], wRings[r + 1][kn], wRings[r + 1][k]);
        }
      }
      const wFace = triangulateFace(proto, []);
      const w0 = wRings[0], w1 = wRings[wRings.length - 1];
      for (const [i, j, k] of wFace.tris) {
        wb.tri(w0[i], w0[k], w0[j]);
        wb.tri(w1[i], w1[j], w1[k]);
      }
      cyl = mergeMeshesLocal([cyl, ensureOutward(wb.build())]);
    }

    return { cyl, trans, extNeg, extPos, sealD, uEnd, sealY, sealXs };
  };

  const wA = buildWell(stations[0], 0, 1, stationBase);
  const wB = buildWell(stations[stations.length - 1], frames.length - 1, -1, stationBase + stations.length - 1);
  const wellA = mergeMeshesLocal([wA.cyl, wA.trans]);
  const wellB = mergeMeshesLocal([wB.cyl, wB.trans]);

  const endA = stations[0];
  const endB = stations[stations.length - 1];
  const sigmaA = endA.ny >= 0 ? 1 : -1;
  const sigmaB = endB.ny >= 0 ? 1 : -1;

  // ── Seat-groove centre line ───────────────────────────────────────────────
  // Along the strap the groove sits `sv.depth` in from the outline, but near
  // each end it BENDS onto the straight line the well plug runs back to the
  // wall on. It has to: at the wall plane the master's underside is only as
  // wide as the transition, while the body's clamped cut face is ~1 mm wider,
  // so the body's own line has no material under it there. Where the two plugs
  // overlap their notches must agree — two V's a few tenths apart intersect to
  // a shallower groove, and the ridge then lifts the master off the lip by the
  // difference (measured 0.36 mm before this bend was added).
  const gcBody = sv ? dims.hw - sv.depth : 0;
  /**
   * Distance over which the body's groove bends onto the well's line, mm.
   * Generous on purpose: the bend has to be gentle enough that the plate's
   * MITERED ridge sweep still sits inside the plug's per-frame notch, and a
   * strap much wider than its well opening has a long way to bend.
   */
  const SEAL_TAPER = Math.max(8, 4 * Math.abs(dims.hw - dims.openR) + 6);
  const uEndA = wA.uEnd;
  const uEndB = wB.uEnd;
  let bodyGrooveOk = sealOn;
  const midFrame = stationBase + Math.floor(stations.length / 2);
  /** Groove centre (profile u) for strap side `sign` at frame `i`. */
  const notchU = (i: number, sign: -1 | 1): number => {
    const base = sign * gcBody;
    const uEnd = (i < midFrame ? uEndA : uEndB)[sign];
    if (uEnd === null || uEnd === undefined) return base;
    const xr = framePoint(frames[i], base, 0)[0];
    const w = Math.min(1, Math.max(0, (xr - SEAL_JOIN) / SEAL_TAPER));
    return uEnd + (base - uEnd) * w;
  };

  // ── Channel plug: floors the hollow so the underside is a CLOSED solid face ──
  // A separate overlapping solid, because the cross-section loop above cannot
  // enclose a detached void. Swept along the SAME frames with the same x >= 0
  // clamp, so it tracks the body exactly; it overlaps the shell walls laterally
  // and is never wider than the outer surface.
  if (canHollow) {
    // FULL width (less a 0.2 inset so it never coincides with the outer skin),
    // not just the channel: that makes the whole underside belong to ONE solid,
    // which is what lets the seat-lip V groove be cut cleanly rather than
    // straddling the plug/shell-wall boundary.
    const au = dims.hw + 0.05; // fractionally proud: a narrower plug leaves a
    // 0.05 mm downward ledge around the skirt, and the pocket has clearance.
    const profileAt = (i: number, notch: boolean): P2[] => [
      ...notchedBottom(au, seat, notch && sv
        ? { gLo: notchU(i, -1), gHi: notchU(i, 1), gW: sv.gW, gH: seatGH }
        : null),
      [au, -seat + capT],
      [-au, -seat + capT],
    ];
    // Every ring must carry the notch or none may: a per-ring fallback to a
    // flat bottom changes the point count and the sweep silently mismatches.
    // (`notchedBottom` falls back rather than folding the profile, so this is
    // the only place that can notice it went missing.)
    let profiles = frames.map((_, i) => profileAt(i, sealOn));
    if (profiles.some((pr) => pr.length !== profiles[0].length)) {
      bodyGrooveOk = false;
      profiles = frames.map((_, i) => profileAt(i, false));
    }
    const pb = new MeshBuilder();
    const pRings: number[][] = [];
    for (let i = 0; i < frames.length; i++) {
      const isEnd = i === 0 || i === frames.length - 1;
      const ring: number[] = [];
      for (const [u, z] of profiles[i]) {
        const [x, y, zz] = framePoint(frames[i], u, z);
        ring.push(pb.vertex(isEnd ? 0 : Math.max(0, x), y, zz));
      }
      pRings.push(ring);
    }
    const PM = profiles[0].length;
    for (let r = 0; r < pRings.length - 1; r++) {
      for (let k = 0; k < PM; k++) {
        const kn = (k + 1) % PM;
        pb.quad(pRings[r][k], pRings[r][kn], pRings[r + 1][kn], pRings[r + 1][k]);
      }
    }
    const plugFace = triangulateFace(profiles[0], []);
    const pFirst = pRings[0];
    const pLast = pRings[pRings.length - 1];
    for (const [i, j, k] of plugFace.tris) {
      pb.tri(pFirst[i], pFirst[k], pFirst[j]);
      pb.tri(pLast[i], pLast[j], pLast[k]);
    }
    body = mergeMeshesLocal([body, ensureOutward(pb.build())]);
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

  /**
   * Seat-lip seal lines. Along the strap they ARE the body plug's groove line
   * (same frames, same offset), so the plate's ridge cannot drift off the
   * groove; under each well they run straight back to the mold wall at the
   * offset that well's plug could actually accommodate.
   */
  const seatSealPaths = bodyGrooveOk && wA.sealY && wB.sealY
    ? (xEnd: number, inset: number): P2[][] => {
      const out: P2[][] = [];
      for (const sign of [-1, 1] as const) {
        const ysA = (sign * sigmaA) as 1 | -1;
        const ysB = (sign * sigmaB) as 1 | -1;
        if (wA.sealD![ysA] - inset <= 0.2 || wB.sealD![ysB] - inset <= 0.2) return [];
        /** The well's own groove samples, inset toward the strap centre. */
        // Stations past `xEnd` are dropped, not clipped: the tape hole stops a
        // lip-width short of the wall, and keeping the plug's outermost station
        // would run the boundary backwards and self-intersect the polygon.
        const wellRun = (w: WellBuild, ys: 1 | -1): P2[] =>
          [xEnd, ...w.sealXs.filter((x) => x > xEnd + 1e-6)]
            .map((x) => [x, w.sealY!(ys, x) - ys * inset] as P2);
        // Contiguous run of the body line that clears the join plane — taken as
        // a range, not a filter, so a stray dip can't split it into two runs.
        const line: P2[] = frames.map((f, i) => {
          const [x, y] = framePoint(f, notchU(i, sign) - sign * inset, 0);
          return [x, y] as P2;
        });
        // The line is followed down to WELL_STEP, not to the join plane: past
        // the wall the well plug tracks this same strand, so the ridge has to
        // as well or it sits beside the groove for those few tenths.
        // Body line picked up where the well plugs stop, so the two agree at
        // the handover: past SEAL_JOIN only the body plug carries the groove.
        const joinA = wA.sealXs[wA.sealXs.length - 1];
        const joinB = wB.sealXs[wB.sealXs.length - 1];
        let lo = 0;
        while (lo < line.length && line[lo][0] < joinA) lo++;
        let hi = line.length - 1;
        while (hi >= 0 && line[hi][0] < joinB) hi--;
        if (hi - lo < 2) return [];
        out.push(removeLocalCusps(dedupeLoop([
          ...wellRun(wA, ysA),
          ...line.slice(lo, hi + 1),
          ...wellRun(wB, ysB).reverse(),
        ]), 8, false));
      }
      return out;
    }
    : null;

  return { hollowed: canHollow, body, wellA, wellB, silhouetteAt, seatSealPaths };
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
