/**
 * HandleMaker orchestrator — turns HandleParameters into the display/export
 * meshes: HALF-handle master (flat side down + well cones), bottom plate with
 * seat pocket / support lip / tape-access through-hole, side wall (×2), and
 * the translucent plaster block, plus stats and warnings.
 *
 * Casting model (revised 2026-07-26): the master is the UPPER HALF of the
 * handle (half-ellipse cross-section + a `seatDepth` skirt down to a flat
 * bottom). It seats in the plate with the parting plane flush with the plate
 * top, taped from below through the lip opening. Each pour makes ONE plaster
 * mold half; two pours make the pair. If the handle silhouette is top-bottom
 * symmetric, the same plate is simply poured twice; if not, the two blocks
 * can't mate as identical twins, so mirrored `masterB`/`plateB` parts are also
 * generated (walls fit both — the box is y-symmetric by construction).
 *
 * Output is centered: the box center (cavity center x, cone midpoint y) sits at
 * the origin, plate top at z = 0. Export lifts put each part's bottom at z = 0.
 */

import { sampleSpine } from './spine';
import { buildMasterParts, loopSelfIntersects, type HandleBodyDims } from './handle-mesh';
import { buildPlate, buildWall, type MoldLayout } from './mold-parts';
import { boxSolid, extrudeSolid, rectPoints, translateMesh, rotate180Z, flipWinding, signedArea, type P2 } from './mesh3';
import { mergeMeshes } from '../mold/ring-mesh';
import { computeMeshStats, type MeshStats } from '../mesh-stats';
import { computeNormals } from '../normals';
import type { HandleParameters } from './handle-types';
import type { VaseMesh } from '../types';

const SPINE_SAMPLES = 140;
/** Max silhouette deviation (mm) still treated as top-bottom symmetric. */
const SYMMETRY_TOL = 0.4;

export interface HandleMeshes {
  /** Full master (body + wells) — the export/stats mesh. */
  master: VaseMesh;
  /** Handle body alone (flat wall-plane ends) — display. */
  masterBody: VaseMesh;
  /** Both wells merged — display (Wells view toggle). */
  masterWells: VaseMesh;
  plate: VaseMesh;
  /** One wall design (export this; print 2 copies). */
  wall: VaseMesh;
  /** The second wall — same design rotated 180°, for display only. */
  wallB: VaseMesh;
  /** Translucent pour volume box (display only). */
  plaster: VaseMesh;
  /** Mirrored master + plate for the second mold half — null when the handle
   * is top-bottom symmetric (then the same plate is just poured twice). */
  masterB: VaseMesh | null;
  plateB: VaseMesh | null;

  hasSelfIntersection: boolean;
  /** True when the silhouette is top-bottom symmetric (one plate/master kit). */
  isSymmetric: boolean;

  masterStats: MeshStats;
  plateStats: MeshStats;
  wallStats: MeshStats;
  /** Approximate set-plaster volume for BOTH halves, mm³. */
  plasterVolumeMm3: number;

  layout: {
    /** Cavity (wall interior) size, mm. */
    cavW: number;
    cavD: number;
    wallH: number;
    plateW: number;
    plateD: number;
    plateThk: number;
    /** z lifts that put each part's bottom at z=0 for export. */
    masterLift: number;
    plateLift: number;
  };
}

/** Mirror a mesh about the y=0 plane (post-centering) and restore outward winding. */
function mirrorY(mesh: VaseMesh): VaseMesh {
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i < positions.length; i += 3) positions[i + 1] = -positions[i + 1];
  const out: VaseMesh = {
    ...mesh,
    positions,
    normals: new Float32Array(mesh.normals.length),
    indices: new Uint32Array(mesh.indices),
  };
  flipWinding(out); // a mirror inverts orientation; flip restores outward
  computeNormals(out.positions, out.indices, out.normals);
  return out;
}

/** Is the loop symmetric about y = yc (within tol)? Nearest-point check both ways. */
function isLoopSymmetric(loop: P2[], yc: number, tol: number): boolean {
  const mirrored = loop.map(([x, y]) => [x, 2 * yc - y] as P2);
  const maxMinDist = (from: P2[], to: P2[]): number => {
    let worst = 0;
    for (const [ax, ay] of from) {
      let best = Infinity;
      for (const [bx, by] of to) {
        const d = (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
        if (d < best) best = d;
      }
      if (best > worst) worst = best;
      if (worst > tol * tol) return Infinity;
    }
    return Math.sqrt(worst);
  };
  return maxMinDist(loop, mirrored) <= tol;
}

export function generateHandleMold(p: HandleParameters): HandleMeshes {
  const S = 1 + p.shrinkPercent / 100;
  const H = p.height * S;
  const D = p.depth * S;
  const dims: HandleBodyDims = {
    hw: (p.width * S) / 2,
    ht: (p.thickness * S) / 2,
    openR: p.openingDiameter / 2,
    cylLen: p.cylinderLength,
    coneLen: p.coneLength,
  };
  const seat = p.seatDepth;
  // Lip can't be wider than the narrowest half-width of the master footprint
  const lipW = Math.min(p.lipWidth, Math.min(dims.hw, dims.openR) + p.recessClearance - 1);

  const stations = sampleSpine(p.spinePoints, p.spineTypes, D, H, SPINE_SAMPLES);
  const yA = stations[0].y;
  const yB = stations[stations.length - 1].y;
  const parts = buildMasterParts(stations, dims, {
    seat,
    hollow: p.masterHollow,
    shellT: p.masterShellThickness,
  });
  const silhouette = parts.silhouetteAt(0);
  const pocketLoop = parts.silhouetteAt(p.recessClearance);
  const tapeHole = parts.silhouetteAt(p.recessClearance - lipW);
  const hasSelfIntersection = loopSelfIntersects(silhouette);

  // ── Box layout (y-centered on the cone midpoint so one wall design serves
  // both positions rotated 180°) ──
  let minY = Infinity, maxY = -Infinity, maxX = -Infinity;
  for (const [x, y] of silhouette) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x > maxX) maxX = x;
  }
  const yc = (yA + yB) / 2;
  const margin = p.plasterMargin;
  const halfY = Math.max(yc - minY, maxY - yc) + margin;
  const cavX0 = -(p.coneLength + p.cylinderLength);
  const cavX1 = maxX + margin;
  const cavY0 = yc - halfY;
  const cavY1 = yc + halfY;

  const lipThk = p.plateFloor;
  const plateThk = seat + lipThk;
  const wallH = Math.max(dims.ht, dims.openR) + p.plasterAbove;
  const wt = p.wallThickness;
  const border = wt + p.flangeWidth;

  const layout: MoldLayout = {
    cavX0, cavX1, cavY0, cavY1, yc,
    px0: cavX0 - border,
    px1: cavX1 + border,
    py0: cavY0 - border,
    py1: cavY1 + border,
    seat,
    lipThk,
    plateThk,
    wallH,
    wt,
    vw: p.vWidth,
    vh: p.vHeight,
    vclr: p.vClearance,
    flangeW: p.flangeWidth,
    domeR: p.domeDiameter / 2,
    domeH: p.domeHeight,
    openR: dims.openR,
    coneYA: Math.min(yA, yB),
    coneYB: Math.max(yA, yB),
    sealDepth: p.wellSealDepth,
  };

  // ── Build parts (raw coords), then center on the box ──
  const bcx = (cavX0 + cavX1) / 2;
  const bcy = yc;

  const plateRaw = buildPlate(layout, pocketLoop, tapeHole, margin);
  const wallRaw = buildWall(layout);
  // Plaster display block: the pour with the handle's footprint cut out up to
  // the master's height, solid plaster above it (display-only approximation —
  // the true cavity is the handle's rounded imprint).
  // The block extends 1 mm into the wall zone so the pocket hole (whose well
  // openings sit exactly at cavX0) stays strictly inside the outer boundary —
  // a hole touching the boundary breaks the triangulation.
  const maxUpper = Math.max(dims.ht, dims.openR);
  const plasterRaw = mergeMeshes([
    extrudeSolid(rectPoints(cavX0 - 1, cavY0, cavX1, cavY1), [pocketLoop], 0, maxUpper),
    boxSolid(cavX0 - 1, cavY0, cavX1, cavY1, maxUpper - 0.2, wallH),
  ]);

  const masterBody = translateMesh(parts.body, -bcx, -bcy, 0);
  const masterWells = translateMesh(mergeMeshes([parts.wellA, parts.wellB]), -bcx, -bcy, 0);
  const master = mergeMeshes([masterBody, masterWells]);
  const plate = translateMesh(plateRaw, -bcx, -bcy, 0);
  const wall = translateMesh(wallRaw, -bcx, -bcy, 0);
  const wallB = rotate180Z(wall, 0, 0);
  const plaster = translateMesh(plasterRaw, -bcx, -bcy, 0);

  // ── Mirrored second-half kit for asymmetric handles ──
  const isSymmetric = isLoopSymmetric(silhouette, yc, SYMMETRY_TOL);
  let masterB: VaseMesh | null = null;
  let plateB: VaseMesh | null = null;
  if (!isSymmetric) {
    masterB = mirrorY(master);
    // Plate B needs the MIRRORED pocket/tape loops but the SAME dome
    // positions/types (that's what makes bump meet dimple when block B is
    // flipped onto block A) — so it's rebuilt, not mesh-mirrored.
    const mirrorLoop = (loop: P2[]): P2[] => loop.map(([x, y]) => [x, 2 * yc - y] as P2);
    const plateBRaw = buildPlate(layout, mirrorLoop(pocketLoop), mirrorLoop(tapeHole), margin);
    plateB = translateMesh(plateBRaw, -bcx, -bcy, 0);
  }

  const masterStats = computeMeshStats(master);
  const plateStats = computeMeshStats(plate);
  const wallStats = computeMeshStats(wall);

  const cavW = cavX1 - cavX0;
  const cavD = cavY1 - cavY0;
  // Each pour fills the box to the wall top minus the master's above-plate
  // volume (master volume minus its skirt, which sits inside the plate).
  const skirtVol = Math.abs(signedArea(silhouette)) * seat;
  const masterAbove = Math.max(0, masterStats.volumeMm3 - skirtVol);
  const plasterVolumeMm3 = 2 * (cavW * cavD * wallH - masterAbove);

  return {
    master, masterBody, masterWells, plate, wall, wallB, plaster, masterB, plateB,
    hasSelfIntersection,
    isSymmetric,
    masterStats, plateStats, wallStats,
    plasterVolumeMm3,
    layout: {
      cavW,
      cavD,
      wallH,
      plateW: layout.px1 - layout.px0,
      plateD: layout.py1 - layout.py0,
      plateThk,
      masterLift: seat,
      plateLift: plateThk,
    },
  };
}
