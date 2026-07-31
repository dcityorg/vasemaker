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
import { buildMasterParts, capThickness, loopSelfIntersects, setSectionSegments, type HandleBodyDims } from './handle-mesh';
import { buildPlate, buildWall, seamMaxVWidth, collarXSpan, SEAL_CLR, type MoldLayout } from './mold-parts';
import { boxSolid, extrudeSolid, rectPoints, translateMesh, rotate180Z, flipWinding, signedArea, type P2 } from './mesh3';
import { mergeMeshes } from '../mold/ring-mesh';
import { computeMeshStats, type MeshStats } from '../mesh-stats';
import { computeNormals } from '../normals';
import type { HandleParameters } from './handle-types';
import type { VaseMesh } from '../types';

/**
 * ALL runs of a closed silhouette loop with x >= `xMin`, as open paths.
 *
 * There are normally TWO: the outer and the inner side of the handle strap,
 * separated by the well regions at x < 0. Returning only the longest (as this
 * did until 2026-07-31) puts the seat-lip ridge on one side of the handle and
 * leaves the other bare — which is exactly what Gary spotted in the render.
 * The loop wraps, so runs are collected over the doubled sequence and the
 * wrap-around run is kept once.
 */
function trimToBody(loop: P2[], xMin = 0.2): P2[][] {
  const n = loop.length;
  const runs: P2[][] = [];
  let cur: P2[] = [];
  let started = false;
  for (let i = 0; i <= 2 * n; i++) {
    const pt = loop[i % n];
    const inside = i < 2 * n && pt[0] >= xMin;
    if (inside && cur.length < n) {
      cur.push(pt);
    } else {
      // Drop the first run: it may be the tail of a wrapped one, which gets
      // collected whole on the second pass.
      if (cur.length > 3 && started) runs.push(cur);
      if (!inside) started = true;
      cur = [];
    }
    if (runs.length >= 2 && i > n) break;
  }
  return runs;
}

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

  // Spine points are already in mm; S is the clay-shrinkage upscale.
  setSectionSegments(p.sectionSegments);
  const stations = sampleSpine(p.spinePoints, p.spineTypes, Math.round(p.spineSamples), S);
  const yA = stations[0].y;
  const yB = stations[stations.length - 1].y;
  /**
   * Seat-lip V — the labyrinth between the plaster and the master's underside.
   * ONE definition drives both sides: the plate's lip ridge and the master's
   * skirt groove, so they mate by construction the way the flange Vs do.
   *
   * Centred in the lip band (which runs from `recessClearance` outside the
   * silhouette to `lipW` inside it), and its height is clamped so the groove
   * can never eat through the channel plug it is cut into.
   */
  // The groove must sit entirely INBOARD of the body's shell wall. That wall's
  // own bottom reaches z = -seat too, so a notch overlapping it is simply
  // filled by wall material — the groove then exists in the mesh and NOT in the
  // solid (Gary spotted this on 2026-07-31; a vertex-position probe cannot see
  // it, only a ray from below can). Width is whatever the lip band can spare.
  // Two constraints bracket the groove's depth `d` (inward from the outline):
  //   clear of the shell wall   d >= shellT + gW + SEAT_M
  //   ridge inside the lip band d <= lipW - recessClearance - vw/2 - SEAT_M
  // Taking vw at the value that makes those meet collapses the bracket to a
  // point, which then fails a floating-point <= by one ulp and switches the
  // whole seat V off silently. Back the width off so the bracket has real
  // width, and compare with a tolerance.
  const SEAT_M = 0.15;
  // The body's skirt now stops above the plug, so the ONLY constraint left is
  // the lip band itself — the V can be full width and centred, instead of being
  // squeezed inboard of the shell wall and jammed against the tape hole.
  const seatVw = Math.min(p.vWidth, lipW - 2 * SEAT_M);
  const seatGW = seatVw / 2 + p.vClearance;
  const seatVDepth = lipW / 2 - p.recessClearance;
  const seatVFits = seatVw >= 0.6
    && seatVDepth - seatVw / 2 > SEAT_M
    && seatVDepth + seatVw / 2 < lipW - p.recessClearance - SEAT_M + 1e-6;
  /**
   * Well-collar V — the second leak path, where the wall's D-bore meets the
   * well cylinder. `cavX0` depends only on params, so it can be computed here,
   * before the master, and drive BOTH sides from one definition.
   *
   * The ring necks the bore in by `vHeight`; the cylinder's groove is deeper by
   * `vClearance` less the standing `SEAL_CLR`, so the apex gap is vClearance
   * while the rest of the annulus keeps its normal clearance.
   */
  const cavX0 = -(p.coneLength + p.cylinderLength);
  // The V has to sit inside BOTH the collar boss and the well cylinder. The
  // cylinder's open end is flush with the wall face (cylLen/coneLen are NOT
  // shrink-scaled), so the usable span is just the boss length — size the pair
  // from that intersection, widest-first, or one of them silently falls back to
  // a plain clearance fit when it runs past an end.
  const [collarX0, collarX1] = collarXSpan(cavX0, p.wellSealDepth);
  const vLo = Math.max(collarX0, cavX0);
  const vHi = Math.min(collarX1, -p.coneLength);
  const collarVx = (vLo + vHi) / 2;
  const grooveHalfW = Math.min(p.vWidth / 2 + p.vClearance, (vHi - vLo) / 2 - 0.2);
  const collarHalfW = Math.max(0.2, grooveHalfW - p.vClearance);
  // Keep the ring wider than it is tall — a tall thin fin standing off a curved
  // bore prints poorly and snaps (Gary, 2026-07-31).
  const collarVh = Math.max(0.3, Math.min(p.vHeight, collarHalfW * 1.2, p.masterShellThickness - p.vClearance - 0.5));
  const collarV = { x: collarVx, h: collarVh, halfW: collarHalfW };
  const seatVh = Math.max(0.3, Math.min(p.vHeight, capThickness(p.masterShellThickness, seat) - p.vClearance - 0.4));
  const parts = buildMasterParts(stations, dims, {
    seat,
    hollow: p.masterHollow,
    shellT: p.masterShellThickness,
    seatV: seatVFits ? { depth: seatVDepth, gW: seatGW, gH: seatVh + p.vClearance } : null,
    collarV: {
      x: collarVx,
      halfW: grooveHalfW,
      depth: collarVh + p.vClearance - SEAL_CLR,
    },
  });
  // Only when the channel was actually hollowed: a solid master has no plug to
  // groove, so the plate must stay flat there or it would hold the master up.
  // Trimmed to the BODY's extent (x >= 0, the wall plane): the wells reach out
  // past it and their bottoms carry no groove, so a ridge there would lift the
  // master off the lip. Everything past the wall is outside the plaster anyway.
  const seatVRuns = parts.hollowed && seatVFits ? trimToBody(parts.silhouetteAt(-seatVDepth)) : [];
  const silhouette = parts.silhouetteAt(0);
  const pocketLoop = parts.silhouetteAt(p.recessClearance);
  // Tape hole covers the BODY only. Under the wells the plate stays SOLID, so
  // plaster that creeps past the lip there reaches a dead end instead of the
  // master's underside — far better than trying to run a V around the wells,
  // whose plugs and solid transition have no groove to receive one. Filtering
  // the inset loop keeps both sides in order, and closing it chords across the
  // cut, which is exactly the body-only hole (Gary, 2026-07-31).
  const tapeHole = parts.silhouetteAt(p.recessClearance - lipW).filter(([x]) => x >= 0);
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
    collarV,
    seat,
    lipThk,
    plateThk,
    wallH,
    wt,
    // Clamped so adjacent flange grooves can't merge and fold the profile.
    vw: Math.min(p.vWidth, seamMaxVWidth(p.flangeWidth, p.vClearance)),
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

  const plateRaw = buildPlate(layout, pocketLoop, tapeHole, margin, seatVRuns.length ? { loops: seatVRuns, height: seatVh, width: seatVw } : null);
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
    const plateBRaw = buildPlate(layout, mirrorLoop(pocketLoop), mirrorLoop(tapeHole), margin, seatVRuns.length ? { loops: seatVRuns.map(mirrorLoop), height: seatVh, width: seatVw } : null);
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
