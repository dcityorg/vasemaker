/**
 * HandleMaker orchestrator — turns HandleParameters into the display/export
 * meshes: master (handle + well cones), bottom plate, side wall (×2), and the
 * translucent plaster block, plus stats and warnings.
 *
 * Output is centered: the box center (cavity center x, cone midpoint y) sits at
 * the origin, plate top at z = 0. Export lifts put each part's bottom at z = 0.
 */

import { sampleSpine } from './spine';
import { buildMasterMesh, silhouetteLoop, loopSelfIntersects, type HandleBodyDims } from './handle-mesh';
import { buildPlate, buildWall, type MoldLayout } from './mold-parts';
import { boxSolid, translateMesh, rotate180Z } from './mesh3';
import { computeMeshStats, type MeshStats } from '../mesh-stats';
import type { HandleParameters } from './handle-types';
import type { VaseMesh } from '../types';

const SPINE_SAMPLES = 140;

export interface HandleMeshes {
  master: VaseMesh;
  plate: VaseMesh;
  /** One wall design (export this; print 2 copies). */
  wall: VaseMesh;
  /** The second wall — same design rotated 180°, for display only. */
  wallB: VaseMesh;
  /** Translucent pour-1 volume box (display only). */
  plaster: VaseMesh;

  hasSelfIntersection: boolean;

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

export function generateHandleMold(p: HandleParameters): HandleMeshes {
  const S = 1 + p.shrinkPercent / 100;
  const H = p.height * S;
  const D = p.depth * S;
  const dims: HandleBodyDims = {
    hw: (p.width * S) / 2,
    ht: (p.thickness * S) / 2,
    openR: p.openingDiameter / 2,
    coneLen: p.coneLength,
  };

  const stations = sampleSpine(p.spinePoints, p.spineTypes, D, H, SPINE_SAMPLES);
  const silhouette = silhouetteLoop(stations, dims, 0);
  const pocketLoop = silhouetteLoop(stations, dims, p.recessClearance);
  const hasSelfIntersection = loopSelfIntersects(silhouette);

  // ── Box layout ──
  let minY = Infinity, maxY = -Infinity, maxX = -Infinity;
  for (const [x, y] of silhouette) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x > maxX) maxX = x;
  }
  const yc = H / 2;
  const margin = p.plasterMargin;
  const halfY = Math.max(yc - minY, maxY - yc) + margin;
  const cavX0 = -p.coneLength;
  const cavX1 = maxX + margin;
  const cavY0 = yc - halfY;
  const cavY1 = yc + halfY;

  const maxLower = Math.max(dims.ht, dims.openR);
  const seat = p.seatDepth;
  const pocketDepth = seat + maxLower;
  const plateThk = pocketDepth + p.plateFloor;
  const wallH = maxLower - seat + p.plasterAbove;
  const wt = p.wallThickness;
  const border = wt + p.flangeWidth;

  const layout: MoldLayout = {
    cavX0, cavX1, cavY0, cavY1, yc,
    px0: cavX0 - border,
    px1: cavX1 + border,
    py0: cavY0 - border,
    py1: cavY1 + border,
    seat,
    pocketDepth,
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
    coneYA: 0,
    coneYB: H,
    sealDepth: p.wellSealDepth,
  };

  // ── Build parts (raw coords), then center on the box ──
  const bcx = (cavX0 + cavX1) / 2;
  const bcy = yc;

  const masterRaw = buildMasterMesh(stations, dims);
  const plateRaw = buildPlate(layout, pocketLoop, margin);
  const wallRaw = buildWall(layout);
  const plasterRaw = boxSolid(cavX0, cavY0, cavX1, cavY1, 0, wallH);

  const master = translateMesh(masterRaw, -bcx, -bcy, -seat);
  const plate = translateMesh(plateRaw, -bcx, -bcy, 0);
  const wall = translateMesh(wallRaw, -bcx, -bcy, 0);
  const wallB = rotate180Z(wall, 0, 0);
  const plaster = translateMesh(plasterRaw, -bcx, -bcy, 0);

  const masterStats = computeMeshStats(master);
  const plateStats = computeMeshStats(plate);
  const wallStats = computeMeshStats(wall);

  const cavW = cavX1 - cavX0;
  const cavD = cavY1 - cavY0;
  // Each half fills the box to the wall top minus half the master (the pours
  // are symmetric about the parting plane). Approximate — reported with ≈.
  const plasterVolumeMm3 = 2 * (cavW * cavD * wallH - masterStats.volumeMm3 / 2);

  return {
    master, plate, wall, wallB, plaster,
    hasSelfIntersection,
    masterStats, plateStats, wallStats,
    plasterVolumeMm3,
    layout: {
      cavW,
      cavD,
      wallH,
      plateW: layout.px1 - layout.px0,
      plateD: layout.py1 - layout.py0,
      plateThk,
      masterLift: seat + maxLower,
      plateLift: plateThk,
    },
  };
}
