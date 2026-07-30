/**
 * Pour three-piece mold generator — Pour 2-Pc with the cottle split vertically.
 *
 * 1. CENTER — identical to Pour 2-Pc (inverted vase + well + foot flange with
 *    two V ridge rings, 4 round air holes).
 * 2. SHELL HALF ×2 — half of the drafted open-topped wall, bottom flange with
 *    two V grooves, and a SEAM FIN at each end of its arc: a flat plate lying in
 *    the split plane, extending radially outward, running the full height.
 *    Binder clips clamp fin-to-fin at the two seams and flange-to-center below.
 *
 * Release: unclip, part the halves sideways, and the plaster block stands free —
 * no sliding the shell up over the whole block.
 *
 * Two things drive the construction (rationale in moldmaker-pour3pc-plan.md):
 *
 * - A half only parts sideways if the cross-section is convex in the pull
 *   direction. Concave shapes (heart, rose, butterfly…) grow a tongue into the
 *   notch between lobes and lock, at ANY seam angle, so those fall back to a
 *   round shell automatically.
 * - A groove is subtractive and there is no CSG here, so the vertical seam Vs
 *   sit at radii INTERLEAVED between the ring Vs — nothing has to be cut away
 *   for them and the flange (with its ring grooves) runs unbroken to the seam.
 *   Below the fins, the seam Vs continue through the flange band to the shell
 *   bottom: the groove side carves prismatic TROUGHS through the seam end cap
 *   (end-ring vertices swing tangentially into the material, and the cap is a
 *   quad grid rather than a fan so the trough has real walls), and the ridge
 *   side welds matching V POSTS onto its cap. Every radial path out of the
 *   seam slot therefore crosses two V barriers at every height.
 *
 * ⚠ Inherited coordinate trap: print orientation negates y. Every print-space
 * contour derived from upright rings must use (x, −y).
 */

import type { VaseParameters, VaseMesh } from '../types';
import { computeMeshStats, MeshStats } from '../mesh-stats';
import { computeNormals } from '../normals';
import { buildRevolvedShell, offsetRingRadial, mergeMeshes, Ring } from './ring-mesh';
import {
  tanDeg,
  prepareVaseParams,
  buildOuterRings,
  buildFootRings,
  buildCavityRings,
  fuseCollarIntoBody,
  buildCappedSolid,
  maxDiameterXY,
} from './mold-generator';
import { computeUndercutFlags } from './undercut';
import { MeshBuilder, extrudeSolid, ensureOutward, type P2 } from '../handle/mesh3';
import { vSeamLayout, vRidgeSection, vGrooveDepth, sweepContourSection } from './v-seam';
import type { MoldParameters } from './mold-types';

const AIR_HOLE_COUNT = 4;
const HOLE_SEGMENTS = 24;
const EMBED = 0.2;
const MIN_RIM_GAP = 5;
/** Half-gap between the two shell halves at the split plane, mm. */
const SEAM_CLEARANCE = 0.1;
/** Straight (undrafted) wall height above the flange before the draft starts, mm.
 *  Keeps the vertical seam Vs square to the master flange where they matter. */
const STRAIGHT_BASE = 8;
/** Deviation from convexity tolerated before falling back to a round shell, mm. */
const CONVEX_TOL = 0.3;

export interface PourThreePieceMoldMeshes {
  style: 'pourThreePiece';
  center: VaseMesh;
  /** Half A in ASSEMBLED position. */
  shellA: VaseMesh;
  /** Half B in ASSEMBLED position. Always built for display; see halvesIdentical. */
  shellB: VaseMesh;
  plaster: VaseMesh;
  undercutFlags: Float32Array;
  hasUndercuts: boolean;
  centerMaxDiameter: number;
  shellMaxDiameter: number;
  plasterVolumeMm3: number;
  centerStats: MeshStats;
  shellStats: MeshStats;
  shellExportDrop: number;
  /** True when the shell had to be made round because the shape cannot part. */
  forcedRound: boolean;
  /** True when one printed half serves both positions — print shell A twice. */
  halvesIdentical: boolean;
}

function toPrintOrientation(mesh: VaseMesh, zTop: number): void {
  const p = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    p[i * 3 + 1] = -p[i * 3 + 1];
    p[i * 3 + 2] = zTop - p[i * 3 + 2];
  }
  computeNormals(p, mesh.indices, mesh.normals);
}

/**
 * Can a half-shell split at `seamRad` part sideways? The half releases along the
 * pull normal only if its extent ALONG the seam line never exceeds what it is at
 * the seam itself — otherwise the shell wraps past the widest point and locks.
 */
export function halvesCanPart(baseR: Float32Array, dirX: Float32Array, dirY: Float32Array, seamRad: number): boolean {
  const n = baseR.length;
  const sx = Math.cos(seamRad), sy = Math.sin(seamRad);   // along the seam
  const px = -sy, py = sx;                                // pull direction
  let maxAtSeam = 0;
  for (let t = 0; t < n; t++) {
    const x = dirX[t] * baseR[t], y = dirY[t] * baseR[t];
    if (Math.abs(x * px + y * py) < 1e-6) maxAtSeam = Math.max(maxAtSeam, Math.abs(x * sx + y * sy));
  }
  if (maxAtSeam <= 0) {
    for (let t = 0; t < n; t++) maxAtSeam = Math.max(maxAtSeam, Math.abs(dirX[t] * baseR[t] * sx + dirY[t] * baseR[t] * sy));
  }
  for (let t = 0; t < n; t++) {
    const along = Math.abs(dirX[t] * baseR[t] * sx + dirY[t] * baseR[t] * sy);
    if (along > maxAtSeam + CONVEX_TOL) return false;
  }
  return true;
}

/** Is the contour 180°-rotationally symmetric (so one printed half serves both)? */
function isHalfTurnSymmetric(baseR: Float32Array): boolean {
  const n = baseR.length;
  if (n % 2 !== 0) return false;
  for (let t = 0; t < n; t++) {
    if (Math.abs(baseR[t] - baseR[(t + n / 2) % n]) > CONVEX_TOL) return false;
  }
  return true;
}

export function generatePourThreePieceMold(vase: VaseParameters, mold: MoldParameters): PourThreePieceMoldMeshes {
  const rRes = vase.resolution.radial;
  const scale = 1 + mold.shrinkPercent / 100;
  const wt = mold.masterWallThickness;
  const P = mold.plasterThickness;
  const cwt = mold.cottleWallThickness;
  const ffT = mold.footFlangeThickness;
  const O = mold.flangeOverlap;
  const vw = mold.notchWidth;
  const vh = mold.notchHeight;
  const clr = mold.notchClearance;
  const finT = mold.seamFinWidth;

  const masterParams = prepareVaseParams(vase, scale, mold.keepTexture);
  const texturesEnabled = mold.keepTexture && masterParams.textures.enabled !== false;
  const outer = buildOuterRings(masterParams, texturesEnabled);

  const topIdx = outer.rings.length - 1;
  const topRing = outer.rings[topIdx];
  const [tcx, tcy] = outer.centers[topIdx];
  const hTop = outer.heights[topIdx];

  const wellOuterDelta = mold.wellWidth + mold.wellHeight * tanDeg(mold.wellDraftAngle);
  const wellTopZ = hTop + mold.wellHeight;
  const zBed = wellTopZ + ffT;

  const footH = mold.footEnabled ? Math.max(0, Math.min(mold.footHeight, wt - 0.5)) : 0;
  const footBase = mold.footSmoothInner ? outer.smoothBase : outer.rings[0];
  const footRings = footH > 0
    ? buildFootRings(footBase, outer.centers[0][0], outer.centers[0][1], rRes, mold.footWidth, mold.footSlopeWidth, footH, mold.footStepHeight)
    : [];
  const nF = footRings.length;

  const floorTopZ = Math.min(hTop + wt, wellTopZ);
  const ledgeRing = offsetRingRadial(topRing, tcx, tcy, mold.wellWidth, hTop, rRes);
  const wellTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, wellTopZ, rRes);
  const wellOuterBedRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, zBed, rRes);
  const wellInnerTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - wt, wellTopZ, rRes);
  const wellInnerBedRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - wt, zBed, rRes);

  const fuseWindow = Math.max(wt, mold.wellWidth * 0.6);
  fuseCollarIntoBody(outer.rings, outer.heights, tcx, tcy, rRes, ledgeRing, hTop, fuseWindow);

  let innerStart = 0;
  for (let v = 0; v <= topIdx; v++) {
    if (outer.heights[v] >= wt) { innerStart = v; break; }
    if (v === topIdx) innerStart = topIdx;
  }
  const cavityBody = buildCavityRings(outer.rings, outer.centers, rRes, innerStart, topIdx, wt);
  const cavityTop = cavityBody[cavityBody.length - 1];
  const floorRiseRing = new Float32Array(rRes * 3);
  for (let t = 0; t < rRes; t++) {
    floorRiseRing[t * 3] = cavityTop[t * 3];
    floorRiseRing[t * 3 + 1] = cavityTop[t * 3 + 1];
    floorRiseRing[t * 3 + 2] = floorTopZ;
  }
  const floorFlatRing = offsetRingRadial(ledgeRing, tcx, tcy, -wt, floorTopZ, rRes);

  const outerStack: Ring[] = [...footRings, ...outer.rings, ledgeRing, wellTopRing, wellOuterBedRing];
  const innerStack: Ring[] = [...cavityBody, floorRiseRing, floorFlatRing, wellInnerTopRing, wellInnerBedRing];
  const vessel = buildRevolvedShell(outerStack, innerStack, rRes, true);
  toPrintOrientation(vessel, zBed);

  // ── Contour: per-station widest master radius about the rim centre ──
  const shapeR = new Float32Array(rRes);
  const dirX = new Float32Array(rRes);
  const dirY = new Float32Array(rRes);
  for (let t = 0; t < rRes; t++) {
    const dx = wellTopRing[t * 3] - tcx;
    const dy = wellTopRing[t * 3 + 1] - tcy;
    const r = Math.hypot(dx, dy);
    shapeR[t] = r;
    dirX[t] = r > 1e-6 ? dx / r : 1;
    dirY[t] = r > 1e-6 ? dy / r : 0;
  }
  for (const ring of outer.rings) {
    for (let t = 0; t < rRes; t++) {
      const r = Math.hypot(ring[t * 3] - tcx, ring[t * 3 + 1] - tcy);
      if (r > shapeR[t]) shapeR[t] = r;
    }
  }

  // Follow the shape unless it cannot part sideways (or the user forced round).
  const seamRad = (mold.seamAngle * Math.PI) / 180;
  const canPart = halvesCanPart(shapeR, dirX, dirY, seamRad);
  const forcedRound = !mold.roundShell && !canPart;
  const useRound = mold.roundShell || forcedRound;
  const baseR = new Float32Array(rRes);
  if (useRound) {
    let rMax = 0;
    for (let t = 0; t < rRes; t++) rMax = Math.max(rMax, shapeR[t]);
    baseR.fill(rMax);
    for (let t = 0; t < rRes; t++) {
      const a = (t / rRes) * Math.PI * 2;
      dirX[t] = Math.cos(a);
      dirY[t] = Math.sin(a);
    }
  } else {
    baseR.set(shapeR);
  }

  const contourPoly = (u: number): P2[] => {
    const pts: P2[] = [];
    for (let t = 0; t < rRes; t++) pts.push([tcx + dirX[t] * (baseR[t] + u), -(tcy + dirY[t] * (baseR[t] + u))]);
    return pts;
  };
  const contourRing = (u: number, z: number): Ring => {
    const out = new Float32Array(rRes * 3);
    for (let t = 0; t < rRes; t++) {
      out[t * 3] = tcx + dirX[t] * (baseR[t] + u);
      out[t * 3 + 1] = tcy + dirY[t] * (baseR[t] + u);
      out[t * 3 + 2] = z;
    }
    return out;
  };
  const stationAt = (t: number, u: number, z: number): [number, number, number] => [
    tcx + dirX[t] * (baseR[t] + u),
    -(tcy + dirY[t] * (baseR[t] + u)),
    z,
  ];

  // ── Center: slab + air holes + two V ridge rings (same as Pour 2-Pc) ──
  const flangeOuterPoly = contourPoly(P + cwt + O + mold.flangeLip);
  const midWallRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - wt / 2, 0, rRes);
  const slabInnerPoly: P2[] = [];
  for (let t = 0; t < rRes; t++) slabInnerPoly.push([midWallRing[t * 3], -midWallRing[t * 3 + 1]]);
  const holes: P2[][] = [slabInnerPoly];
  if (mold.airHoleEnabled && mold.airHoleDiameter > 0) {
    for (let k = 0; k < AIR_HOLE_COUNT; k++) {
      const t = Math.round((k + 0.5) * (rRes / AIR_HOLE_COUNT)) % rRes;
      const rIn = Math.hypot(wellTopRing[t * 3] - tcx, wellTopRing[t * 3 + 1] - tcy);
      const rOut = baseR[t] + P;
      const rc = (rIn + rOut) / 2;
      const holeR = Math.min(mold.airHoleDiameter / 2, Math.max(0.5, (rOut - rIn) / 2 - 1));
      const cx = tcx + dirX[t] * rc;
      const cy = -(tcy + dirY[t] * rc);
      const circle: P2[] = [];
      for (let s = 0; s < HOLE_SEGMENTS; s++) {
        const a = (s / HOLE_SEGMENTS) * Math.PI * 2;
        circle.push([cx + holeR * Math.cos(a), cy + holeR * Math.sin(a)]);
      }
      holes.push(circle);
    }
  }
  const slab = extrudeSolid(flangeOuterPoly, holes, 0, ffT);

  const s0 = P + cwt;
  const seam = vSeamLayout(s0, O, vw, clr);
  const [c1, c2] = seam.rings;
  const ridge1 = sweepContourSection(vRidgeSection(c1, ffT, vw, vh), rRes, stationAt);
  const ridge2 = sweepContourSection(vRidgeSection(c2, ffT, vw, vh), rRes, stationAt);
  const center = mergeMeshes([vessel, slab, ridge1, ridge2]);

  const undercut = computeUndercutFlags(outer.rings, outer.heights, rRes, nF * rRes, center.vertexCount, footH);

  // ── Shell halves ──
  const zB = ffT;
  const zFill = zBed + P;
  const zT = zFill; // no grab rim: the halves part sideways, nothing is pulled up
  const HFill = zFill - zB;
  const draftTan = Math.min(tanDeg(mold.cottleDraftAngle), Math.max(0, P - MIN_RIM_GAP) / Math.max(1, HFill - STRAIGHT_BASE));
  const gd = vGrooveDepth(vh, clr, ffT);
  const zFlangeTop = zB + ffT;
  const g = vw / 2 + clr;
  const [rv1, rv2] = seam.verticals;
  /**
   * De-z-fight offsets, cosmetic only: the cap troughs used to share their apex
   * line with the fin notches (and the posts crossed the fin bumps' flanks), so
   * bare-half viewport views shimmered at every seam V. Oversizing the trough
   * and insetting the post keeps every nested pair ≥ 0.05 mm apart; the
   * labyrinth seal is clearance-tolerant by design, so function is unchanged.
   */
  const TROUGH_EXTRA = 0.1;
  const POST_INSET = 0.05;
  /** Trough depth past the seam plane — the fins' notch apex plus the oversize. */
  const troughD = SEAM_CLEARANCE + vh + clr + TROUGH_EXTRA;
  /** Trough half-width at the seam plane. */
  const troughHalf = g + TROUGH_EXTRA;

  /** Wall lean at height z — zero through the straight base, drafted above it. */
  const lean = (z: number) => draftTan * Math.max(0, z - zB - STRAIGHT_BASE);

  /** Like stationAt but with a tangential offset `w` (the fins' seam-plane axis). */
  const placeW = (t: number, u: number, w: number, z: number): [number, number, number] => [
    tcx + dirX[t] * (baseR[t] + u) - dirY[t] * w,
    -(tcy + dirY[t] * (baseR[t] + u) + dirX[t] * w),
    z,
  ];

  /**
   * Cap-grid columns across the flange band, inner → outer. Every column is a
   * profile point on BOTH the bottom edge and the flange-top edge, so the seam
   * end cap can be a quad grid whose boundary is exactly the sweep's end ring —
   * a cap vertex anywhere else on the profile boundary would be a T-junction.
   * Ring grooves live at the c columns (bottom raised to the groove apex), the
   * vertical seam Vs at the rv columns (`trough` — displaced off the seam plane
   * on the groove end, so the cap carries a full-height prismatic V channel).
   */
  const cols: { u: number; zb: number; trough: boolean }[] = [
    { u: P, zb: zB, trough: false },
    { u: c1 - g, zb: zB, trough: false },
    { u: c1, zb: zB + gd, trough: false },
    { u: c1 + g, zb: zB, trough: false },
    { u: rv1 - troughHalf, zb: zB, trough: false },
    { u: rv1, zb: zB, trough: true },
    { u: rv1 + troughHalf, zb: zB, trough: false },
    { u: c2 - g, zb: zB, trough: false },
    { u: c2, zb: zB + gd, trough: false },
    { u: c2 + g, zb: zB, trough: false },
    { u: rv2 - troughHalf, zb: zB, trough: false },
    { u: rv2, zb: zB, trough: true },
    { u: rv2 + troughHalf, zb: zB, trough: false },
    { u: P + cwt + O, zb: zB, trough: false },
  ];
  const nCols = cols.length;
  // Extreme settings (small overlap, thin cottle wall) can push the bands into
  // each other; keep columns strictly increasing so the grid never folds.
  for (let i = 1; i < nCols; i++) cols[i].u = Math.max(cols[i].u, cols[i - 1].u + 0.02);

  /**
   * Wall + flange profile, built from the columns. The flange runs unbroken to
   * the seam, so its ring grooves do too — possible because the vertical Vs sit
   * BETWEEN the ring radii, where nothing has to be cut away for them.
   * Indices 2..5 are the wall panel corners (the seam caps rely on that).
   */
  const profile: P2[] = [];
  const pushP = (u: number, z: number): number => { profile.push([u, z]); return profile.length - 1; };
  const capBot = new Array<number>(nCols);
  const capTop = new Array<number>(nCols).fill(-1);
  capBot[0] = pushP(P, zB);
  capTop[0] = pushP(P, zFlangeTop);
  pushP(P, zB + STRAIGHT_BASE);
  pushP(P - lean(zT), zT);
  pushP(P + cwt - lean(zT), zT);
  pushP(P + cwt, zB + STRAIGHT_BASE);
  capTop[2] = pushP(P + cwt, zFlangeTop);
  for (let i = 3; i < nCols; i++) capTop[i] = pushP(cols[i].u, zFlangeTop);
  for (let i = nCols - 1; i >= 1; i--) capBot[i] = pushP(cols[i].u, cols[i].zb);
  // (column 1's top corner sits under the wall — an interior cap vertex, not a
  // profile point, created per cap below)

  /** Profile indices displaced tangentially on a half's END ring to carve the troughs. */
  const troughIdx = new Set<number>();
  for (let i = 0; i < nCols; i++) if (cols[i].trough) { troughIdx.add(capBot[i]); troughIdx.add(capTop[i]); }

  const half = Math.floor(rRes / 2);
  const seamStation = ((Math.round((seamRad / (Math.PI * 2)) * rRes) % rRes) + rRes) % rRes;

  /**
   * Ridge post: continues a fin's vertical V ridge down through the flange band
   * to the shell bottom, so the seam slot is barred all the way down to the
   * center's flange. Base sunk into the flange behind the seam cap; apex crosses
   * the seam into the mating half's cap trough. Inset by POST_INSET so its
   * exposed flanks nest strictly inside the fin bump above instead of crossing
   * them (viewport z-fighting; the seal has clearance to spare).
   */
  const buildPost = (t: number, c: number): VaseMesh => {
    const xy = (u: number, w: number): P2 => {
      const q = placeW(t, u, w, 0);
      return [q[0], q[1]];
    };
    const outline: P2[] = [
      xy(c - vw / 2 + POST_INSET, EMBED),
      xy(c + vw / 2 - POST_INSET, EMBED),
      xy(c, SEAM_CLEARANCE - vh + POST_INSET),
    ];
    return extrudeSolid(outline, [], zB, zFlangeTop);
  };

  /** Build one half from station `start`, spanning `half + 1` stations. */
  const buildHalf = (start: number): VaseMesh => {
    const mb = new MeshBuilder();
    const nP = profile.length;
    const rings: number[][] = [];
    for (let k = 0; k <= half; k++) {
      const t = (start + k) % rRes;
      const ring: number[] = [];
      for (let pi = 0; pi < nP; pi++) {
        const [u, z] = profile[pi];
        // The end (groove) ring carries the seam troughs: its rv columns swing
        // off the seam plane into the material. When troughD exceeds one
        // station's arc this folds the bottom/top facet outlines slightly over
        // the previous station — an in-plane overlap slicers union away; the
        // solid is correct at every slicing height.
        const w = k === half && troughIdx.has(pi) ? -troughD : 0;
        const [x, y, zz] = placeW(t, u, w, z);
        ring.push(mb.vertex(x, y, zz));
      }
      rings.push(ring);
    }
    for (let k = 0; k < half; k++) {
      for (let j = 0; j < nP; j++) {
        const jn = (j + 1) % nP;
        mb.quad(rings[k][j], rings[k][jn], rings[k + 1][jn], rings[k + 1][j]);
      }
    }

    /**
     * Seam end cap: a quad grid across the flange band (so the ring grooves and
     * seam troughs run through to the seam plane with real walls) plus the wall
     * panel above it. The old whole-profile centroid fan folded outside the
     * L-shaped profile — a drafted wall leans further than it is thick, so no
     * single fan centre sees the whole polygon.
     */
    const buildCap = (k: number, forward: boolean) => {
      const t = (start + k) % rRes;
      const ring = rings[k];
      const q = forward
        ? (a: number, b: number, c: number, d: number) => mb.quad(a, b, c, d)
        : (a: number, b: number, c: number, d: number) => mb.quad(d, c, b, a);
      const tr = forward
        ? (a: number, b: number, c: number) => mb.tri(a, b, c)
        : (a: number, b: number, c: number) => mb.tri(c, b, a);
      const xq = placeW(t, c1 - g, 0, zFlangeTop);
      const X = mb.vertex(xq[0], xq[1], xq[2]); // interior band corner under the wall
      const topAt = (i: number) => (i === 1 ? X : ring[capTop[i]]);
      for (let i = 0; i < nCols - 1; i++) q(ring[capBot[i + 1]], ring[capBot[i]], topAt(i), topAt(i + 1));
      // Wall panel: fan the squat part from X (which sits on its bottom edge),
      // quad the leaning part — both star-safe.
      tr(X, ring[capTop[0]], ring[2]);
      tr(X, ring[2], ring[5]);
      tr(X, ring[5], ring[capTop[2]]);
      q(ring[2], ring[3], ring[4], ring[5]);
    };
    buildCap(0, false);
    buildCap(half, true);

    const swept = ensureOutward(mb.build());
    return mergeMeshes([
      swept,
      buildFin(start % rRes, true, true),
      buildFin((start + half) % rRes, false, false),
      buildPost(start % rRes, rv1),
      buildPost(start % rRes, rv2),
    ]);
  };

  /**
   * Seam fin: a plate in the split plane sitting ON TOP of the flange, running
   * to the wall top — the handle mold's arrangement. Above the flange the fin is
   * the only material out past the wall, so a groove notch in its seam face has
   * nothing to fill it; that is what removed the old flange taper. Lofted, not
   * extruded, so it tracks the wall's lean instead of detaching near the top.
   */
  function buildFin(t: number, positiveSide: boolean, ridge: boolean): VaseMesh {
    const sgn = positiveSide ? 1 : -1;
    const ax = dirX[t], ay = dirY[t];
    const nx = -dirY[t], ny = dirX[t];
    const R = baseR[t];
    const place = (u: number, w: number, z: number): [number, number, number] => [
      tcx + ax * (R + u) + nx * w,
      -(tcy + ay * (R + u) + ny * w),
      z,
    ];
    const wIn = sgn * SEAM_CLEARANCE;
    const wOut = sgn * (SEAM_CLEARANCE + finT);
    const zLo = zFlangeTop - EMBED; // weld down into the flange; posts/troughs carry the Vs below
    const zHi = zT;

    /** Seam-face outline at height z, inner → outer, with V bumps or notches. */
    const face = (z: number): [number, number][] => {
      const d = lean(z);
      const out: [number, number][] = [[P - d - EMBED, wIn]];
      for (const c0 of seam.verticals) {
        const c = c0 - d;
        if (ridge) out.push([c - vw / 2, wIn], [c, wIn - sgn * vh], [c + vw / 2, wIn]);
        else out.push([c - g, wIn], [c, wIn + sgn * (vh + clr)], [c + g, wIn]);
      }
      out.push([P + cwt + O - d, wIn], [P + cwt + O - d, wOut], [P - d - EMBED, wOut]);
      return out;
    };

    const mb = new MeshBuilder();
    const loFace = face(zLo), hiFace = face(zHi);
    const n = loFace.length;
    const loIds = loFace.map(([u, w]) => { const q = place(u, w, zLo); return mb.vertex(q[0], q[1], q[2]); });
    const hiIds = hiFace.map(([u, w]) => { const q = place(u, w, zHi); return mb.vertex(q[0], q[1], q[2]); });
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      mb.quad(loIds[i], loIds[j], hiIds[j], hiIds[i]);
    }
    const cen = (f: [number, number][], z: number) => {
      let x = 0, y = 0;
      for (const [u, w] of f) { const q = place(u, w, z); x += q[0]; y += q[1]; }
      return mb.vertex(x / f.length, y / f.length, z);
    };
    const loC = cen(loFace, zLo), hiC = cen(hiFace, zHi);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      mb.tri(loC, loIds[j], loIds[i]);
      mb.tri(hiC, hiIds[i], hiIds[j]);
    }
    return ensureOutward(mb.build());
  }

  const halvesIdentical = isHalfTurnSymmetric(baseR);
  const shellA = buildHalf(seamStation);
  const shellB = buildHalf((seamStation + half) % rRes);

  // ── Plaster block + volume ──
  const shellInnerRimUp = contourRing(P - draftTan * Math.max(0, HFill - STRAIGHT_BASE), -P);
  const shellInnerFloorUp = contourRing(P, wellTopZ);
  const envelope: Ring[] = [...footRings, ...outer.rings, ledgeRing, wellTopRing];
  const plaster = buildRevolvedShell([shellInnerRimUp, shellInnerFloorUp, wellTopRing], envelope, rRes);
  toPrintOrientation(plaster, zBed);

  const interiorVol = computeMeshStats(buildCappedSolid([shellInnerRimUp, shellInnerFloorUp], rRes)).volumeMm3;
  const envelopeVol = computeMeshStats(buildCappedSolid(envelope, rRes)).volumeMm3;

  return {
    style: 'pourThreePiece',
    center,
    shellA,
    shellB,
    plaster,
    undercutFlags: undercut.flags,
    hasUndercuts: undercut.any,
    centerMaxDiameter: maxDiameterXY(center),
    shellMaxDiameter: maxDiameterXY(shellA),
    plasterVolumeMm3: Math.max(0, interiorVol - envelopeVol),
    centerStats: computeMeshStats(center),
    shellStats: computeMeshStats(shellA),
    shellExportDrop: ffT,
    forcedRound,
    halvesIdentical,
  };
}
