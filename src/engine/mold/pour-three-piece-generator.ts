/**
 * Pour three-piece mold generator — Pour 2-Pc with the cottle split vertically.
 *
 * 1. CENTER — identical to Pour 2-Pc (inverted vase + well + foot flange with
 *    three V ridge rings; no air holes — the halves part sideways).
 * 2. SHELL HALF ×2 — half of the drafted open-topped wall, bottom flange with
 *    three V grooves, and a SEAM BLOCK at each end of its arc: the full
 *    cross-section carried out to the flange edge over the whole height, with
 *    vertical Vs on its seam face. Binder clips clamp block-to-block at the two
 *    seams and flange-to-center below.
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
 * - A groove is subtractive and there is no CSG here, so the swept arc STOPS
 *   SHORT of the seam plane and the seam block owns the last few mm. Nothing
 *   can then fill a notch cut into the block, so the vertical Vs sit at the
 *   SAME radii as the ring grooves and run the full height, each standing on
 *   the ring ridge it continues — one barrier turning a corner rather than two
 *   handing off at different radii. (Before 2026-07-30 the swept flange reached
 *   the seam and filled any notch, which forced interleaved radii plus
 *   hand-built cap troughs and welded posts through the flange band.)
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
import { MeshBuilder, extrudeSolid, ensureOutward, triangulateFace, type P2 } from '../handle/mesh3';
import { vSeamLayout, vRidgeSection, vGrooveSection, vGrooveDepth, vEdgeMargin, vMaxWidth, sweepContourSection } from './v-seam';
import type { MoldParameters } from './mold-types';

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
  const clr = mold.notchClearance;
  // Material outboard of the outermost groove = the shell wall thickness.
  const edgeMargin = vEdgeMargin(cwt, O);
  // Adjacent ring grooves must not run into each other (the flange profile would
  // fold and earcut would produce garbage), and a groove must be deep enough to
  // swallow its ridge. Shrink the V rather than let either happen.
  const vw = Math.min(mold.notchWidth, vMaxWidth(O, edgeMargin, clr));
  const vh = Math.max(0.3, Math.min(mold.notchHeight, ffT - 0.6 - clr));
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
  // No air holes in this style (dropped 2026-07-30 at Gary's request): the shell
  // halves part sideways, so there is no suction pull to break. The other three
  // styles keep theirs — they all lift a part off the set plaster.
  const slab = extrudeSolid(flangeOuterPoly, [slabInnerPoly], 0, ffT);

  const gHalf = vw / 2 + clr;
  // Anchor the inner ring at the wall's outer face, but never so far in that its
  // groove would break out through the wall's inner face on a thin wall.
  const s0 = Math.max(P + cwt, P + gHalf + 0.05);
  const seamRings = vSeamLayout(s0, O, vw, clr, edgeMargin);
  const ridges = seamRings.map((c) => sweepContourSection(vRidgeSection(c, ffT, vw, vh), rRes, stationAt));
  const center = mergeMeshes([vessel, slab, ...ridges]);

  const undercut = computeUndercutFlags(outer.rings, outer.heights, rRes, nF * rRes, center.vertexCount, footH);

  // ── Shell halves ──
  const zB = ffT;
  const zFill = zBed + P;
  const zT = zFill; // no grab rim: the halves part sideways, nothing is pulled up
  const HFill = zFill - zB;
  const draftTan = Math.min(tanDeg(mold.cottleDraftAngle), Math.max(0, P - MIN_RIM_GAP) / Math.max(1, HFill - STRAIGHT_BASE));
  const gd = vGrooveDepth(vh, clr, ffT);
  const zFlangeTop = zB + ffT;
  const sIn = P;            // wall inner face at flange level
  const sOut = P + cwt + O; // flange outer edge

  /** Wall lean at height z — zero through the straight base, drafted above it. */
  const lean = (z: number) => draftTan * Math.max(0, z - zB - STRAIGHT_BASE);
  /** Draft kink height, kept strictly between the groove apexes and the rim. */
  const zStr = Math.max(zB + gd + 0.05, Math.min(zB + STRAIGHT_BASE, zT - 0.05));

  /** Like stationAt but with a tangential offset `w` — distance from the seam plane. */
  const placeW = (t: number, u: number, w: number, z: number): [number, number, number] => [
    tcx + dirX[t] * (baseR[t] + u) - dirY[t] * w,
    -(tcy + dirY[t] * (baseR[t] + u) + dirX[t] * w),
    z,
  ];

  /** Ring-groove depth in an underside at radial offset `s`; 0 away from every ring. */
  const ringGroove = (s: number): number => {
    for (const c of seamRings) {
      const d = Math.abs(s - c);
      if (d < gHalf) return gd * (1 - d / gHalf);
    }
    return 0;
  };

  /**
   * Wall + flange cross-section, walked clockwise in (u, z): up the inner face,
   * across the rim, down the outer face to the flange, out to the flange edge,
   * then back along the underside through the ring grooves. No point is emitted
   * at the wall's outer face on the underside — the inner groove already
   * straddles it, and re-emitting it backtracks and folds the bottom edge.
   * `triangulateFace` normalises the loop to CCW, which is the winding the
   * sweep quads and end caps below assume.
   */
  const rawProfile: P2[] = [
    [sIn, zB],
    [sIn, zStr],
    [sIn - lean(zT), zT],
    [sIn + cwt - lean(zT), zT],
    [sIn + cwt, zStr],
    [sIn + cwt, zFlangeTop],
    [sOut, zFlangeTop],
    [sOut, zB],
    ...seamRings.slice().reverse().flatMap((c) => vGrooveSection(c, zB, vw, clr, gd)),
  ];
  const cap = triangulateFace(rawProfile, []);
  const profile = cap.points;
  const nP = profile.length;

  const half = Math.floor(rRes / 2);
  const seamStation = ((Math.round((seamRad / (Math.PI * 2)) * rRes) % rRes) + rRes) % rRes;

  /**
   * Perpendicular distance from seam plane `sT` of the point at radial offset
   * `u` on station `sT + dir·k`. A radial end plane leans away from the seam
   * plane with radius, so the two callers below need different `u`: the
   * keep-out test the SMALLEST radius that carries a groove, the block length
   * the LARGEST radius on the end cap.
   */
  const distFromSeam = (sT: number, k: number, dir: number, u: number): number => {
    const t = (((sT + dir * k) % rRes) + rRes) % rRes;
    const r = baseR[t] + u;
    return Math.abs(dirX[t] * r * -dirY[sT] + dirY[t] * r * dirX[sT]);
  };

  /**
   * The swept arc STOPS SHORT of the seam plane and a seam block owns the rest.
   * That is what lets the vertical Vs be real grooves: there is no CSG here —
   * parts are unioned by overlapping — so swept flange material reaching the
   * seam would simply fill any notch cut into it. (Until 2026-07-30 it did, and
   * the Vs had to be interleaved between the rings and continued through the
   * flange band as hand-built cap troughs and welded posts.)
   *
   * `drop` = fewest whole stations that clear a groove's depth. `blockLen` =
   * far enough back that the block swallows the arc's end cap, measured at the
   * flange edge where a radial end plane is furthest from the seam plane.
   */
  const seamKeepOut = SEAM_CLEARANCE + vh + clr + 0.4;
  const maxDrop = Math.max(1, Math.floor(half / 4));
  const seamStations = [seamStation, (seamStation + half) % rRes];
  let drop = 1;
  while (drop < maxDrop) {
    let worst = Infinity;
    for (const sT of seamStations) for (const dir of [1, -1]) worst = Math.min(worst, distFromSeam(sT, drop, dir, seamRings[0]));
    if (worst >= seamKeepOut) break;
    drop++;
  }
  let blockLen = finT;
  for (const sT of seamStations) for (const dir of [1, -1]) blockLen = Math.max(blockLen, distFromSeam(sT, drop, dir, sOut) + 0.5);

  /**
   * Seam block: the last `blockLen` mm before the seam plane, built as its own
   * solid. Section = the (z, w) rectangle from the seam face back to the far
   * face, swept along the radial columns `s`. Its underside carries the ring
   * grooves and its seam face the vertical Vs, both driven by the SAME
   * `seamRings` radii — so each vertical V stands directly on the ring ridge it
   * continues and the barrier turns the corner instead of handing off.
   *
   * `s` is the unleaned radius: u = s − lean(z) keeps the block leaning with the
   * drafted wall, so the plaster sees no step where block meets arc.
   */
  const blockCols = (() => {
    const set = [sIn, sOut];
    for (const c of seamRings) set.push(c - gHalf, c - vw / 2, c, c + vw / 2, c + gHalf);
    return set
      .map((s) => Math.min(Math.max(s, sIn), sOut))
      .sort((a, b) => a - b)
      .filter((s, i, arr) => i === 0 || s - arr[i - 1] > 1e-4);
  })();

  const buildSeamBlock = (t: number, sgn: 1 | -1, ridge: boolean): VaseMesh => {
    const wFar = sgn * (SEAM_CLEARANCE + blockLen);
    /** Seam-face displacement at `s`: out across the seam on the ridge half,
     *  back into the material on the groove half. */
    const seamV = (s: number): number => {
      for (const c of seamRings) {
        const d = Math.abs(s - c);
        if (ridge) { if (d < vw / 2) return -vh * (1 - d / (vw / 2)); }
        else if (d < gHalf) return (vh + clr) * (1 - d / gHalf);
      }
      return 0;
    };
    const mb = new MeshBuilder();
    const rings = blockCols.map((s) => {
      const wS = sgn * (SEAM_CLEARANCE + seamV(s));
      const zb = zB + ringGroove(s);
      // CCW in (z, w) for sgn > 0; the sgn < 0 mirror flips it, so reverse back.
      const pts: P2[] = [[zb, wS], [zStr, wS], [zT, wS], [zT, wFar], [zStr, wFar], [zb, wFar]];
      return (sgn > 0 ? pts : pts.slice().reverse()).map(([z, w]) => {
        const q = placeW(t, s - lean(z), w, z);
        return mb.vertex(q[0], q[1], q[2]);
      });
    });
    const n = 6;
    for (let j = 0; j + 1 < rings.length; j++) {
      for (let i = 0; i < n; i++) {
        const iN = (i + 1) % n;
        mb.quad(rings[j][i], rings[j][iN], rings[j + 1][iN], rings[j + 1][i]);
      }
    }
    // Section is a rectangle with collinear extras — convex, so a fan is safe.
    const last = rings.length - 1;
    for (let i = 1; i + 1 < n; i++) {
      mb.tri(rings[last][0], rings[last][i], rings[last][i + 1]);
      mb.tri(rings[0][0], rings[0][i + 1], rings[0][i]);
    }
    return ensureOutward(mb.build());
  };

  /** One half: the swept arc between the two seam planes, plus a block at each. */
  const buildHalf = (start: number): VaseMesh => {
    const mb = new MeshBuilder();
    const rings: number[][] = [];
    for (let k = drop; k <= half - drop; k++) {
      const t = (start + k) % rRes;
      rings.push(profile.map(([u, z]) => {
        const q = placeW(t, u, 0, z);
        return mb.vertex(q[0], q[1], q[2]);
      }));
    }
    for (let k = 0; k + 1 < rings.length; k++) {
      for (let j = 0; j < nP; j++) {
        const jn = (j + 1) % nP;
        mb.quad(rings[k][j], rings[k][jn], rings[k + 1][jn], rings[k + 1][j]);
      }
    }
    // End caps: earcut over the same profile points, so the cap boundary is
    // exactly the sweep's end ring. Both sit buried inside a seam block — they
    // only have to close the arc solid. Winding follows extrudeSolid's
    // convention: (u, z) section CCW, sweep along +station, high end forward.
    const capAt = (t: number, forward: boolean) => {
      const ids = profile.map(([u, z]) => {
        const q = placeW(t, u, 0, z);
        return mb.vertex(q[0], q[1], q[2]);
      });
      for (const [i, j, k] of cap.tris) {
        if (forward) mb.tri(ids[i], ids[j], ids[k]);
        else mb.tri(ids[k], ids[j], ids[i]);
      }
    };
    capAt((start + half - drop) % rRes, true);
    capAt((start + drop) % rRes, false);

    return mergeMeshes([
      ensureOutward(mb.build()),
      buildSeamBlock(start % rRes, 1, true),
      buildSeamBlock((start + half) % rRes, -1, false),
    ]);
  };

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
