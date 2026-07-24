/**
 * One-piece pour mold generator — a SINGLE printed part that replaces the
 * two-part master + cottle. The vase sits upside-down in the center (foot
 * recess facing up), fused to the cottle floor through the well structure;
 * plaster is poured in through the fully open top and covers the vase bottom,
 * forming the solid base of the mold. Flipped over after release, the plaster
 * block is the same finished mold the two-part system produces.
 *
 * Geometry strategy: everything is built in VASE-UPRIGHT space (vase base at
 * z = 0, exactly like the two-part master) reusing the same ring builders, as
 * ONE closed revolved loop fed to a single buildRevolvedShell call — which
 * guarantees the part is one connected component by construction (the failure
 * mode that bit the two-part master, see moldmaker-plan.md 2026-07-22 (4)).
 *
 *   outer stack: foot recess → body → razor ledge → well outer wall →
 *                floor-slab underside (outward) → cottle inner wall (down to
 *                the pour rim)
 *   inner stack: cavity → well interior → up through the slab opening →
 *                bed face (outward) → cottle outer wall (down to the pour rim)
 *   capTop annulus: joins the two stack ends = the pour rim.
 *
 * The 4 air-relief holes are then punched through the floor slab (grid-aligned
 * cells removed from both faces + vertical hole walls, same technique as the
 * two-part lid slots), and finally the whole mesh is moved to PRINT orientation
 * by a 180° rotation about the x-axis: (x, y, z) → (x, −y, zBedTop − z).
 * A rotation — NOT a z-mirror, which would mirror-image twisted vases.
 * Bed at z = 0, open pour rim at the top.
 */

import type { VaseParameters, VaseMesh } from '../types';
import { computeMeshStats, MeshStats } from '../mesh-stats';
import { computeNormals } from '../normals';
import { buildRevolvedShell, offsetRingRadial, Ring } from './ring-mesh';
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
import type { MoldParameters } from './mold-types';

/** Radial subdivisions of the floor slab (the air-hole grid). */
const NR = 12;
/** Number of air holes around the floor ring. */
const AIR_HOLE_COUNT = 4;

export interface OnePieceMoldMeshes {
  /** Discriminant for the AnyMoldMeshes union. */
  style: 'onePiece';
  /** The single printed part, in print orientation (bed at z = 0, pour rim up). */
  mold: VaseMesh;
  /** Display plaster block (the finished mold), print orientation. */
  plaster: VaseMesh;
  /** Per-vertex 0..1 straight-pull undercut factor, aligned with the mold mesh. */
  undercutFlags: Float32Array;
  /** True if any vertex is fully flagged as a pull undercut. */
  hasUndercuts: boolean;
  /** Widest horizontal extent of the part, mm — printer-bed fit check. */
  moldMaxDiameter: number;
  /** Estimated plaster volume (cottle interior minus master envelope), mm³. */
  plasterVolumeMm3: number;
  moldStats: MeshStats;
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

export function generateOnePieceMold(vase: VaseParameters, mold: MoldParameters): OnePieceMoldMeshes {
  const rRes = vase.resolution.radial;
  const scale = 1 + mold.shrinkPercent / 100;
  const wt = mold.masterWallThickness;
  const P = mold.plasterThickness;
  const cwt = mold.cottleWallThickness;

  const masterParams = prepareVaseParams(vase, scale, mold.keepTexture);
  const texturesEnabled = mold.keepTexture && masterParams.textures.enabled !== false;
  const outer = buildOuterRings(masterParams, texturesEnabled);

  const vCount = outer.rings.length;
  const topIdx = vCount - 1;
  const topRing = outer.rings[topIdx];
  const [tcx, tcy] = outer.centers[topIdx];
  const hTop = outer.heights[topIdx];

  // ── Well / slab planes (upright space) ──
  const wellOuterDelta = mold.wellWidth + mold.wellHeight * tanDeg(mold.wellDraftAngle);
  const wellTopZ = hTop + mold.wellHeight;
  const zBedTop = wellTopZ + cwt; // floor slab: z ∈ [wellTopZ, zBedTop] (thickness = cottle wall)
  const zRim = -P;                // pour rim (upright) — becomes the open top of the print

  // ── Foot recess (indents the vase base; faces up into the plaster after inversion) ──
  const footH = mold.footEnabled ? Math.max(0, Math.min(mold.footHeight, wt - 0.5)) : 0;
  const footBase = mold.footSmoothInner ? outer.smoothBase : outer.rings[0];
  const footRings = footH > 0
    ? buildFootRings(footBase, outer.centers[0][0], outer.centers[0][1], rRes, mold.footWidth, mold.footSlopeWidth, footH, mold.footStepHeight)
    : [];
  const nF = footRings.length;

  // ── Well rings (pre-fuse rim contour, same as two-part) ──
  const floorTopZ = Math.min(hTop + wt, wellTopZ);
  const ledgeRing = offsetRingRadial(topRing, tcx, tcy, mold.wellWidth, hTop, rRes);
  const wellTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, wellTopZ, rRes);
  const wellInnerTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - wt, wellTopZ, rRes);
  const wellInnerBedRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - wt, zBedTop, rRes);

  // Fuse the collar into the body where the vase curls inward near the rim
  // (kills the razor air wedge — same failure mode as the two-part master).
  const fuseWindow = Math.max(wt, mold.wellWidth * 0.6);
  fuseCollarIntoBody(outer.rings, outer.heights, tcx, tcy, rRes, ledgeRing, hTop, fuseWindow);
  const nB = outer.rings.length;

  // ── Cottle contour: per-station widest master radius about the rim center ──
  // For a release-valid vase the rim is the widest ring per azimuth, so the
  // shadow is just wellTopRing; the max over body rings is a safety clamp for
  // bulging (undercut-flagged) designs so the wall never visually intersects
  // the body. Directions are taken from wellTopRing's stations, so every cottle
  // ring shares the master's angular stations (no shear in the slab quads).
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
  const cottleRing = (extraDelta: number, z: number): Ring => {
    const out = new Float32Array(rRes * 3);
    for (let t = 0; t < rRes; t++) {
      const r = baseR[t] + extraDelta;
      out[t * 3] = tcx + dirX[t] * r;
      out[t * 3 + 1] = tcy + dirY[t] * r;
      out[t * 3 + 2] = z;
    }
    return out;
  };

  // Draft widens the cottle toward the pour rim (downward in upright space) so
  // the plaster block slides out; the wall is vertical through the slab band.
  const draftTanC = tanDeg(mold.cottleDraftAngle);
  const rimDraft = draftTanC * (wellTopZ + P);
  const cottleInnerFloor = cottleRing(P, wellTopZ);
  const cottleInnerRim = cottleRing(P + rimDraft, zRim);
  const cottleOuterBed = cottleRing(P + cwt, zBedTop);
  const cottleOuterFloor = cottleRing(P + cwt, wellTopZ);
  const cottleOuterRim = cottleRing(P + cwt + rimDraft, zRim);

  // ── Floor slab grid rings (shared radii on both faces → vertical hole walls) ──
  const lerpRing = (a: Ring, b: Ring, f: number, z: number): Ring => {
    const out = new Float32Array(rRes * 3);
    for (let t = 0; t < rRes; t++) {
      out[t * 3] = a[t * 3] + (b[t * 3] - a[t * 3]) * f;
      out[t * 3 + 1] = a[t * 3 + 1] + (b[t * 3 + 1] - a[t * 3 + 1]) * f;
      out[t * 3 + 2] = z;
    }
    return out;
  };
  const undersideGrid: Ring[] = [];
  const bedGrid: Ring[] = [];
  for (let j = 1; j <= NR; j++) {
    const g = lerpRing(wellTopRing, cottleInnerFloor, j / NR, wellTopZ);
    undersideGrid.push(g);
    bedGrid.push(lerpRing(g, g, 0, zBedTop)); // same (x, y), bed height
  }

  // ── Master cavity (identical to the two-part master interior) ──
  let innerStart = 0;
  for (let v = 0; v <= topIdx; v++) {
    if (outer.heights[v] >= wt) { innerStart = v; break; }
    if (v === topIdx) innerStart = topIdx;
  }
  const cavityBody = buildCavityRings(outer.rings, outer.centers, rRes, innerStart, topIdx, wt);
  const nC = cavityBody.length;
  const cavityTop = cavityBody[nC - 1];
  const floorRiseRing = new Float32Array(rRes * 3);
  for (let t = 0; t < rRes; t++) {
    floorRiseRing[t * 3] = cavityTop[t * 3];
    floorRiseRing[t * 3 + 1] = cavityTop[t * 3 + 1];
    floorRiseRing[t * 3 + 2] = floorTopZ;
  }
  const floorFlatRing = offsetRingRadial(ledgeRing, tcx, tcy, -wt, floorTopZ, rRes);

  // ── The single closed loop ──
  const outerStack: Ring[] = [
    ...footRings,
    ...outer.rings,
    ledgeRing,
    wellTopRing,
    ...undersideGrid,       // floor-slab underside, wellTopRing → cottleInnerFloor
    cottleInnerRim,         // down the cottle inner wall to the pour rim
  ];
  const innerStack: Ring[] = [
    ...cavityBody,
    floorRiseRing,
    floorFlatRing,
    wellInnerTopRing,
    wellInnerBedRing,       // slab opening wall (the print's bed-level opening)
    ...bedGrid,             // bed face, slab-opening edge → cottle wall
    cottleOuterBed,
    cottleOuterFloor,
    cottleOuterRim,         // down the cottle outer wall to the pour rim
  ];
  const nOuter = outerStack.length;
  const nInner = innerStack.length;

  const shell = buildRevolvedShell(outerStack, innerStack, rRes, true);

  // ── Air holes: punch grid cells out of both slab faces + add vertical walls ──
  // Underside cell (t, j) spans grid radii S_j → S_{j+1} (S_0 = wellTopRing);
  // the bed face has rings at the SAME radii for j ≥ 1, so cells j ∈ [1, NR−1]
  // are vertically aligned and the hole walls are straight.
  const holeD = mold.airHoleEnabled ? mold.airHoleDiameter : 0;
  let spanSum = 0, rcSum = 0;
  for (let t = 0; t < rRes; t++) {
    const rIn = baseR[t];
    spanSum += P;
    rcSum += rIn + P / 2;
  }
  const spanMean = spanSum / rRes;   // radial width of the floor ring (= plaster thickness)
  const rcMean = rcSum / rRes;       // radius at the middle of the ring
  const halfFracR = holeD > 0 ? Math.min(0.49, holeD / 2 / spanMean) : -1;
  const halfFracA = holeD > 0 ? Math.min(0.45, (2 * holeD) / (2 * Math.PI * rcMean)) : -1;
  const isHole = (t: number, j: number): boolean => {
    if (holeD <= 0 || j < 1 || j > NR - 1) return false;
    if (Math.abs((j + 0.5) / NR - 0.5) > halfFracR) return false;
    const within = ((((t + 0.5) / rRes) * AIR_HOLE_COUNT) % 1);
    return Math.abs(within - 0.5) < halfFracA;
  };

  let mesh = shell;
  if (holeD > 0) {
    // Vertex/quad layout inside the shell (see buildRevolvedShell):
    const outerBase = 0;
    const innerBase = nOuter * rRes;
    const wellTopIdx = nF + nB + 1;              // outer-stack ring index of wellTopRing (S_0)
    const bedGridBase = nC + 3;                  // inner-stack ring index of wellInnerBedRing; S_j is at bedGridBase + j
    const U = (j: number, t: number) => outerBase + (wellTopIdx + j) * rRes + t;
    const B = (j: number, t: number) => innerBase + (bedGridBase + j) * rRes + t;
    const outerQuads = (nOuter - 1) * rRes;

    // Mark triangles to drop (2 per quad, quads emitted sequentially by ring pair).
    const totalTris = shell.triangleCount;
    const drop = new Uint8Array(totalTris);
    let dropped = 0;
    const wallQuads: number[] = [];
    for (let t = 0; t < rRes; t++) {
      const tN = (t + 1) % rRes;
      const tP = (t - 1 + rRes) % rRes;
      for (let j = 1; j <= NR - 1; j++) {
        if (!isHole(t, j)) continue;
        // Underside face cell: outer ring pair (wellTopIdx + j − 1? no — pair r covers rings r..r+1)
        const rOut = wellTopIdx + j;             // pair wellTopIdx+j → wellTopIdx+j+1 spans S_j → S_{j+1}
        const q1 = (rOut * rRes + t) * 2;
        drop[q1] = 1; drop[q1 + 1] = 1;
        // Bed face cell: inner ring pair bedGridBase+j → bedGridBase+j+1 (same radii)
        const rIn = bedGridBase + j;
        const q2 = (outerQuads + rIn * rRes + t) * 2;
        drop[q2] = 1; drop[q2 + 1] = 1;
        dropped += 4;
        // Hole walls on non-hole neighbors (bed = upper layer, underside = lower)
        if (!isHole(tP, j)) wallQuads.push(B(j, t), U(j, t), U(j + 1, t), B(j + 1, t));
        if (!isHole(tN, j)) wallQuads.push(B(j, tN), B(j + 1, tN), U(j + 1, tN), U(j, tN));
        if (!isHole(t, j - 1)) wallQuads.push(B(j, t), B(j, tN), U(j, tN), U(j, t));
        if (!isHole(t, j + 1)) wallQuads.push(B(j + 1, t), U(j + 1, t), U(j + 1, tN), B(j + 1, tN));
      }
    }

    const wallTris = (wallQuads.length / 4) * 2;
    const indices = new Uint32Array((totalTris - dropped + wallTris) * 3);
    let o = 0;
    for (let tri = 0; tri < totalTris; tri++) {
      if (drop[tri]) continue;
      indices[o++] = shell.indices[tri * 3];
      indices[o++] = shell.indices[tri * 3 + 1];
      indices[o++] = shell.indices[tri * 3 + 2];
    }
    for (let q = 0; q < wallQuads.length; q += 4) {
      const [a, b, c, d] = [wallQuads[q], wallQuads[q + 1], wallQuads[q + 2], wallQuads[q + 3]];
      indices[o++] = a; indices[o++] = b; indices[o++] = c;
      indices[o++] = a; indices[o++] = c; indices[o++] = d;
    }
    mesh = {
      positions: shell.positions,
      normals: shell.normals,
      indices,
      vertexCount: shell.vertexCount,
      triangleCount: indices.length / 3,
    };
  }

  // ── Undercut analysis (upright space, world-z pull axis — the condition is
  // orientation-symmetric, so the same check covers the inverted pull). Vertex
  // ids are untouched by hole punching and rotation, so flags stay aligned. ──
  const undercut = computeUndercutFlags(
    outer.rings, outer.heights, rRes,
    nF * rRes, mesh.vertexCount, footH,
  );

  // ── Plaster display block (upright, then rotated with the part) ──
  // Outer: pour face → up the cottle inner wall → inward along the slab
  // underside to the well wall. Inner: the master envelope. The cap annulus
  // between the coincident wellTopRing ends is degenerate (zero area) — fine.
  const envelope: Ring[] = [...footRings, ...outer.rings, ledgeRing, wellTopRing];
  const plasterOuter: Ring[] = [cottleInnerRim, cottleInnerFloor, wellTopRing];
  const plaster = buildRevolvedShell(plasterOuter, envelope, rRes);

  // ── Volumes ──
  const interiorVol = computeMeshStats(buildCappedSolid([cottleInnerRim, cottleInnerFloor], rRes)).volumeMm3;
  const envelopeVol = computeMeshStats(buildCappedSolid(envelope, rRes)).volumeMm3;
  const plasterVolumeMm3 = Math.max(0, interiorVol - envelopeVol);

  // ── To print orientation: bed at z = 0, pour rim at the top ──
  toPrintOrientation(mesh, zBedTop);
  toPrintOrientation(plaster, zBedTop);

  return {
    style: 'onePiece',
    mold: mesh,
    plaster,
    undercutFlags: undercut.flags,
    hasUndercuts: undercut.any,
    moldMaxDiameter: maxDiameterXY(mesh),
    plasterVolumeMm3,
    moldStats: computeMeshStats(mesh),
  };
}
