/**
 * Pour two-piece mold generator — the one-piece pour mold split into two
 * prints that binder-clip together at a bottom flange:
 *
 * 1. CENTER — the inverted vase + well form (same core as the one-piece),
 *    whose floor continues outward as a flat foot flange carrying two raised
 *    concentric notch rings. Open through the well interior at the bed, foot
 *    recess on top, 4 ROUND air holes through the plaster-floor annulus.
 * 2. SHELL — a separate open-topped wall ring following the cross-section
 *    shape, drafted INWARD going up (plaster is narrower at the top, so the
 *    shell slides up and off), ending in a flange with two grooves that
 *    receive the center's notches (labyrinth plaster seal). Clips clamp the
 *    flange stack right over the notches.
 *
 * Construction: the vessel reuses the one-piece single-loop revolved build
 * (upright space → 180° x-rotation to print orientation), but the slab and
 * notch rings need round holes / ring features that don't fit a revolved
 * loop — they use the HandleMaker overlap-weld style (closed solids embedded
 * 0.2 mm into their host; never coplanar-touching). The shell is one closed
 * profile loop swept around the per-station contour (torus topology → one
 * component by construction).
 *
 * ⚠ Coordinate trap: print orientation negates y. Every print-space contour
 * derived from upright rings must negate y or nothing lines up on
 * non-circular vases.
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
import { vSeamLayout, vRidgeSection, vGrooveSection, vGrooveDepth, vEdgeMargin, vMaxWidth, sweepContourSection } from './v-seam';
import type { MoldParameters } from './mold-types';

const AIR_HOLE_COUNT = 4;
const HOLE_SEGMENTS = 24;
const EMBED = 0.2;
/** Minimum plaster left at the pour rim after the inward draft (clamps steep drafts on tall vases). */
const MIN_RIM_GAP = 5;

export interface PourTwoPieceMoldMeshes {
  style: 'pourTwoPiece';
  /** Center piece (vase + well + flange with notches), print orientation, bed at z = 0. */
  center: VaseMesh;
  /** Outer shell in ASSEMBLED position (flange underside at z = flange thickness). */
  shell: VaseMesh;
  /** Display plaster block, print orientation. */
  plaster: VaseMesh;
  /** Per-vertex 0..1 straight-pull undercut factor, aligned with the center mesh. */
  undercutFlags: Float32Array;
  hasUndercuts: boolean;
  centerMaxDiameter: number;
  shellMaxDiameter: number;
  plasterVolumeMm3: number;
  centerStats: MeshStats;
  shellStats: MeshStats;
  /** Translate the shell down by this for export (flange lands on the bed). */
  shellExportDrop: number;
}

/** Rotate a mesh 180° about the x-axis and lift so print z = zTop − z: bed at 0. */
function toPrintOrientation(mesh: VaseMesh, zTop: number): void {
  const p = mesh.positions;
  for (let i = 0; i < mesh.vertexCount; i++) {
    p[i * 3 + 1] = -p[i * 3 + 1];
    p[i * 3 + 2] = zTop - p[i * 3 + 2];
  }
  computeNormals(p, mesh.indices, mesh.normals);
}

export function generatePourTwoPieceMold(vase: VaseParameters, mold: MoldParameters): PourTwoPieceMoldMeshes {
  const rRes = vase.resolution.radial;
  const scale = 1 + mold.shrinkPercent / 100;
  const wt = mold.masterWallThickness;
  const P = mold.plasterThickness;
  const cwt = mold.cottleWallThickness;
  const ffT = mold.footFlangeThickness;
  const O = mold.flangeOverlap;
  const nClr = mold.notchClearance;
  // Same clamps as Pour 3-Pc: keep adjacent grooves from merging (which folds the
  // flange profile) and keep a groove deeper than the ridge it receives.
  const nW = Math.min(mold.notchWidth, vMaxWidth(O, vEdgeMargin(cwt, O), nClr));
  const nH = Math.max(0.3, Math.min(mold.notchHeight, ffT - 0.6 - nClr));

  const masterParams = prepareVaseParams(vase, scale, mold.keepTexture);
  const texturesEnabled = mold.keepTexture && masterParams.textures.enabled !== false;
  const outer = buildOuterRings(masterParams, texturesEnabled);

  const topIdx = outer.rings.length - 1;
  const topRing = outer.rings[topIdx];
  const [tcx, tcy] = outer.centers[topIdx];
  const hTop = outer.heights[topIdx];

  // ── Planes (upright space) ──
  const wellOuterDelta = mold.wellWidth + mold.wellHeight * tanDeg(mold.wellDraftAngle);
  const wellTopZ = hTop + mold.wellHeight;
  const zBed = wellTopZ + ffT; // slab: z ∈ [wellTopZ, zBed]; print z = zBed − z_upright

  // ── Foot recess ──
  const footH = mold.footEnabled ? Math.max(0, Math.min(mold.footHeight, wt - 0.5)) : 0;
  const footBase = mold.footSmoothInner ? outer.smoothBase : outer.rings[0];
  const footRings = footH > 0
    ? buildFootRings(footBase, outer.centers[0][0], outer.centers[0][1], rRes, mold.footWidth, mold.footSlopeWidth, footH, mold.footStepHeight)
    : [];
  const nF = footRings.length;

  // ── Well rings ──
  const floorTopZ = Math.min(hTop + wt, wellTopZ);
  const ledgeRing = offsetRingRadial(topRing, tcx, tcy, mold.wellWidth, hTop, rRes);
  const wellTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, wellTopZ, rRes);
  const wellOuterBedRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, zBed, rRes);
  const wellInnerTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - wt, wellTopZ, rRes);
  const wellInnerBedRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - wt, zBed, rRes);

  const fuseWindow = Math.max(wt, mold.wellWidth * 0.6);
  fuseCollarIntoBody(outer.rings, outer.heights, tcx, tcy, rRes, ledgeRing, hTop, fuseWindow);

  // ── Master cavity ──
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

  // ── Vessel: one closed revolved loop (upright), then to print orientation ──
  // capTop joins well-outer ↔ well-inner at zBed = the bed-face annulus around
  // the open well interior.
  const outerStack: Ring[] = [...footRings, ...outer.rings, ledgeRing, wellTopRing, wellOuterBedRing];
  const innerStack: Ring[] = [...cavityBody, floorRiseRing, floorFlatRing, wellInnerTopRing, wellInnerBedRing];
  const vessel = buildRevolvedShell(outerStack, innerStack, rRes, true);
  toPrintOrientation(vessel, zBed);

  // ── Shell/flange contour: per-station widest master radius about the rim center ──
  const baseR = new Float32Array(rRes);
  const dirX = new Float32Array(rRes);
  const dirY = new Float32Array(rRes);
  for (let t = 0; t < rRes; t++) {
    const dx = wellTopRing[t * 3] - tcx;
    const dy = wellTopRing[t * 3 + 1] - tcy;
    const r = Math.hypot(dx, dy);
    baseR[t] = r;
    dirX[t] = r > 1e-6 ? dx / r : 1;
    dirY[t] = r > 1e-6 ? dy / r : 0;
  }
  for (const ring of outer.rings) {
    for (let t = 0; t < rRes; t++) {
      const r = Math.hypot(ring[t * 3] - tcx, ring[t * 3 + 1] - tcy);
      if (r > baseR[t]) baseR[t] = r;
    }
  }

  /** Contour polygon at constant radial offset u, in PRINT space (y negated). */
  const contourPoly = (u: number): P2[] => {
    const pts: P2[] = [];
    for (let t = 0; t < rRes; t++) {
      pts.push([tcx + dirX[t] * (baseR[t] + u), -(tcy + dirY[t] * (baseR[t] + u))]);
    }
    return pts;
  };
  /** Contour ring at offset u, height z, in UPRIGHT space (for plaster/volumes). */
  const contourRing = (u: number, z: number): Ring => {
    const out = new Float32Array(rRes * 3);
    for (let t = 0; t < rRes; t++) {
      out[t * 3] = tcx + dirX[t] * (baseR[t] + u);
      out[t * 3 + 1] = tcy + dirY[t] * (baseR[t] + u);
      out[t * 3 + 2] = z;
    }
    return out;
  };

  // ── Slab (print space): flange annulus with 4 ROUND air holes ──
  // Inner boundary sits at the well wall's mid-thickness so the slab overlaps
  // the vessel's well wall with real volume (weld) while the well interior
  // stays open. The center flange extends `flangeLip` past the shell flange —
  // an exposed rim to press the center down while pulling the shell up.
  const flangeOuterPoly = contourPoly(P + cwt + O + mold.flangeLip);
  const midWallRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - wt / 2, 0, rRes);
  const slabInnerPoly: P2[] = [];
  for (let t = 0; t < rRes; t++) {
    slabInnerPoly.push([midWallRing[t * 3], -midWallRing[t * 3 + 1]]);
  }
  const holes: P2[][] = [slabInnerPoly];
  if (mold.airHoleEnabled && mold.airHoleDiameter > 0) {
    for (let k = 0; k < AIR_HOLE_COUNT; k++) {
      const t = Math.round((k + 0.5) * (rRes / AIR_HOLE_COUNT)) % rRes;
      // Center of the plaster-floor annulus at this station: between the well
      // outer wall and the shell inner face.
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

  // ── V ridge rings on the slab top face ──
  // Was square notch rings; switched to the handle mold's V profile after that
  // joint poured leak-free (see engine/mold/v-seam.ts). Three rings since
  // 2026-07-30, shared with 3-Pc: the inner one straddles the wall/flange
  // junction so the plaster meets a barrier almost immediately.
  const gHalf = nW / 2 + nClr;
  // Anchor the inner ring at the wall's outer face, but never so far in that its
  // groove would break out through the wall's inner face on a thin wall.
  const s0 = Math.max(P + cwt, P + gHalf + 0.05);
  const seamRings = vSeamLayout(s0, O, nW, nClr, vEdgeMargin(cwt, O));
  const stationAt = (t: number, u: number, z: number): [number, number, number] => [
    tcx + dirX[t] * (baseR[t] + u),
    -(tcy + dirY[t] * (baseR[t] + u)),
    z,
  ];
  const ridges = seamRings.map((c) => sweepContourSection(vRidgeSection(c, ffT, nW, nH), rRes, stationAt));

  // Vessel FIRST so undercutFlags stay index-aligned with the body rings.
  const center = mergeMeshes([vessel, slab, ...ridges]);

  const undercut = computeUndercutFlags(
    outer.rings, outer.heights, rRes,
    nF * rRes, center.vertexCount, footH,
  );

  // ── Shell: closed profile loop swept around the contour ──
  const zB = ffT;             // wall bottom / flange underside (on the center flange top)
  const zFill = zBed + P;     // plaster fill line = plasterThickness above the vase bottom
  const zT = zFill + mold.shellGrabHeight; // wall top — empty grab rim above the fill line
  // Inward draft going up; clamped so ≥ MIN_RIM_GAP of plaster remains at the
  // FILL line (the grab rim above it may narrow further — it holds no plaster).
  const HFill = zFill - zB;
  const draftTan = Math.min(tanDeg(mold.cottleDraftAngle), Math.max(0, P - MIN_RIM_GAP) / HFill);
  const Hw = zT - zB;
  const gd = vGrooveDepth(nH, nClr, ffT); // groove depth into the shell flange

  const profile: P2[] = [
    [P, zB],                        // inner wall bottom
    [P - draftTan * Hw, zT],        // inner wall top (inward)
    [P + cwt - draftTan * Hw, zT],  // rim outer
    [P + cwt, zB + ffT],            // outer wall down to flange top
    [P + cwt + O, zB + ffT],        // flange top outer edge (flush with center flange)
    [P + cwt + O, zB],              // flange outer underside corner
    // underside inward with the V grooves (outer → inner), then straight on to
    // the inner wall face. No point at [P + cwt, zB]: the inner groove already
    // straddles it, so re-emitting it backtracks and folds the bottom edge.
    ...seamRings.slice().reverse().flatMap((c) => vGrooveSection(c, zB, nW, nClr, gd)),
  ];

  const sb = new MeshBuilder();
  const stations: number[][] = [];
  for (let t = 0; t < rRes; t++) {
    const ring: number[] = [];
    for (const [u, z] of profile) {
      ring.push(sb.vertex(
        tcx + dirX[t] * (baseR[t] + u),
        -(tcy + dirY[t] * (baseR[t] + u)),
        z,
      ));
    }
    stations.push(ring);
  }
  const nP = profile.length;
  for (let t = 0; t < rRes; t++) {
    const tn = (t + 1) % rRes;
    for (let j = 0; j < nP; j++) {
      const jn = (j + 1) % nP;
      sb.quad(stations[t][j], stations[t][jn], stations[tn][jn], stations[tn][j]);
    }
  }
  const shell = ensureOutward(sb.build());

  // ── Plaster block + volume (upright space, then rotated with the parts) ──
  const shellInnerRimUp = contourRing(P - draftTan * HFill, -P);
  const shellInnerFloorUp = contourRing(P, wellTopZ);
  const envelope: Ring[] = [...footRings, ...outer.rings, ledgeRing, wellTopRing];
  const plaster = buildRevolvedShell([shellInnerRimUp, shellInnerFloorUp, wellTopRing], envelope, rRes);
  toPrintOrientation(plaster, zBed);

  const interiorVol = computeMeshStats(buildCappedSolid([shellInnerRimUp, shellInnerFloorUp], rRes)).volumeMm3;
  const envelopeVol = computeMeshStats(buildCappedSolid(envelope, rRes)).volumeMm3;
  const plasterVolumeMm3 = Math.max(0, interiorVol - envelopeVol);

  return {
    style: 'pourTwoPiece',
    center,
    shell,
    plaster,
    undercutFlags: undercut.flags,
    hasUndercuts: undercut.any,
    centerMaxDiameter: maxDiameterXY(center),
    shellMaxDiameter: maxDiameterXY(shell),
    plasterVolumeMm3,
    centerStats: computeMeshStats(center),
    shellStats: computeMeshStats(shell),
    shellExportDrop: ffT,
  };
}
