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

import { sampleSpine, type SpineStation } from './spine';
import {
  buildMasterParts,
  loopSelfIntersects,
  setSectionSegments,
  spineArcTable,
  type HandleBodyDims,
} from './handle-mesh';
import { buildPlate, buildWall, seamMaxVWidth, type MoldLayout } from './mold-parts';
import { boxSolid, extrudeSolid, rectPoints, translateMesh, rotate180Z, flipWinding, signedArea, type P2 } from './mesh3';
import { mergeMeshes } from '../mold/ring-mesh';
import { computeMeshStats, type MeshStats } from '../mesh-stats';
import { computeNormals } from '../normals';
import type { HandleParameters } from './handle-types';
import type { VaseMesh } from '../types';

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
  /** Shell thickness actually used — clamped below the slider on a thin strap
   *  so the channel stays open (and so the master stays hollowable at all). */
  shellUsed: number;
  /** Open channel inside the master, mm — width × height, measured from the
   *  flat bottom up to the crown of the inner surface. It is open along the
   *  whole underside: that is what you get a tool into to pry the master out
   *  of the set plaster. */
  channel: [number, number];
  /** True when the silhouette is top-bottom symmetric (one plate/master kit). */
  isSymmetric: boolean;
  /** Tie bars actually placed across the tape hole, as rectangles in the same
   *  centered coordinates as the plate mesh. Fewer than asked for when the
   *  spine leaves no room clear of the wells and the pull-ribs. */
  tieBars: P2[][];

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

/**
 * Sutherland–Hodgman clip of a simple polygon to the half-plane x ≥ xMin.
 * Used for the tape hole, which follows the master's outline but has to stop a
 * lip-width short of the mold wall. A plain filter would drop the crossing
 * points and chord across the gap, pulling the boundary inside the lip.
 */
function clipToXMin(loop: P2[], xMin: number): P2[] {
  const out: P2[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    const ain = a[0] >= xMin;
    const bin = b[0] >= xMin;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (xMin - a[0]) / (b[0] - a[0]);
      out.push([xMin, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** How far past the pocket wall a tie bar buries each of its ends, mm. */
const TIE_REACH = 2;

/**
 * Tie bars across the tape hole — rectangles in the plate plane, centred on the
 * spine and running across the strap.
 *
 * Placed evenly by arc length and then pushed clear of the pull-ribs: a rib is
 * what long-nose jaws close on, and they come at it from below, so a bar parked
 * directly under one is in the way. (`ribArcs` is what the master actually
 * built, not what was asked for.)
 *
 * Both ends are kept well away from the wells, where the tape hole is as wide
 * as the pour opening rather than as wide as the strap — a bar sized to the
 * strap would end inside the hole out there and tie nothing to anything.
 */
function tieBarLoops(
  stations: SpineStation[],
  ribArcs: number[],
  ribW: number,
  dims: HandleBodyDims,
  tieW: number,
  tieN: number,
  clr: number,
): P2[][] {
  if (tieW <= 0.2 || tieN <= 0) return [];
  const { total, indexAt } = spineArcTable(stations);
  const halfLen = dims.hw + clr + TIE_REACH;
  const endMargin = tieW / 2 + Math.max(dims.hw, dims.openR) + 4;
  /** Gap between a bar's centre and a rib's that leaves the rib's flanks free. */
  const ribClear = (tieW + ribW) / 2 + 1;
  const loops: P2[][] = [];
  for (let k = 1; k <= tieN; k++) {
    let s = (total * k) / (tieN + 1);
    // One pass: with sane counts the bars and ribs interleave, and a bar that
    // still can't find room is dropped by the margin test below rather than
    // chasing its neighbours around the curve.
    for (const r of ribArcs) {
      const d = s - r;
      if (Math.abs(d) < ribClear) s = r + (d >= 0 ? ribClear : -ribClear);
    }
    if (s < endMargin || s > total - endMargin) continue;
    const st = stations[Math.max(0, Math.min(stations.length - 1, Math.round(indexAt(s))))];
    const hw = tieW / 2;
    loops.push([
      [st.x + st.nx * halfLen + st.tx * hw, st.y + st.ny * halfLen + st.ty * hw],
      [st.x - st.nx * halfLen + st.tx * hw, st.y - st.ny * halfLen + st.ty * hw],
      [st.x - st.nx * halfLen - st.tx * hw, st.y - st.ny * halfLen - st.ty * hw],
      [st.x + st.nx * halfLen - st.tx * hw, st.y + st.ny * halfLen - st.ty * hw],
    ]);
  }
  return loops;
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

  /**
   * Shell thickness, clamped so the channel stays a genuinely open void — the
   * master is what the shell encloses, and a shell that meets itself is just a
   * solid bar with extra print time. `canHollow` needs the same headroom.
   */
  const shellT = Math.max(1, Math.min(
    p.masterShellThickness,
    Math.min(dims.hw, dims.ht) - 0.55,
  ));
  // Spine points are already in mm; S is the clay-shrinkage upscale.
  setSectionSegments(p.sectionSegments);
  const stations = sampleSpine(p.spinePoints, p.spineTypes, Math.round(p.spineSamples), S);
  const yA = stations[0].y;
  const yB = stations[stations.length - 1].y;
  /** The mold wall's inner face — also the well openings' plane. */
  const cavX0 = -(p.coneLength + p.cylinderLength);
  const parts = buildMasterParts(stations, dims, {
    seat, hollow: true, shellT,
    ribWidth: p.ribWidth, ribCount: p.ribCount,
  });
  const silhouette = parts.silhouetteAt(0);
  const pocketLoop = parts.silhouetteAt(p.recessClearance);
  /**
   * Tape hole: the pocket floor cut through, `lipW` inside the master's own
   * outline so a support lip of that width is left all the way round. It runs
   * back under the wells with the rest of the outline but stops `lipW` short of
   * the mold wall, so the master has something to sit on out there too.
   *
   * Before 2026-08-08 this was derived from the seat-lip seal lines (inset past
   * the ridge). With the ridge gone the outline offset IS the boundary, and the
   * two land within ~0.3 mm of each other on the default handle.
   */
  const tapeHole = clipToXMin(parts.silhouetteAt(p.recessClearance - lipW), cavX0 + lipW);
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
    // The natch is centred in the plaster band between the wall and the
    // handle pocket, so its radius has to fit half that band. The 4 mm is
    // plaster, not print clearance: a thinner wall than that between the natch
    // and the edge of the block chips when the halves are separated. Without
    // this clamp a generous diameter silently overlaps the wall footprint (or
    // the pocket) as soon as Plaster Margin is reduced.
    domeR: Math.max(2, Math.min(p.domeDiameter / 2, margin / 2 - 4)),
    domeH: p.domeHeight,
    seg: Math.max(8, Math.round(p.sectionSegments)),
    openR: dims.openR,
    coneYA: Math.min(yA, yB),
    coneYB: Math.max(yA, yB),
    // Engagement of the well cylinder into the wall's collar bore. Clamped to
    // the cylinder: the bore has to stay a straight run past the collar, and
    // past the cylinder's end it would be biting into the transition's taper.
    sealDepth: Math.max(0, Math.min(p.wellSealDepth, p.cylinderLength - 2)),
    clr: p.recessClearance,
  };

  // ── Build parts (raw coords), then center on the box ──
  const bcx = (cavX0 + cavX1) / 2;
  const bcy = yc;

  const tieBars = tieBarLoops(
    stations, parts.ribArcs, p.ribWidth, dims, p.tieBarWidth, Math.round(p.tieBarCount), p.recessClearance,
  );
  const plateRaw = buildPlate(layout, pocketLoop, tapeHole, margin, tieBars);
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
    const plateBRaw = buildPlate(
      layout, mirrorLoop(pocketLoop), mirrorLoop(tapeHole), margin, tieBars.map(mirrorLoop),
    );
    plateB = translateMesh(plateBRaw, -bcx, -bcy, 0);
  }

  const masterStats = computeMeshStats(master);
  const plateStats = computeMeshStats(plate);
  const wallStats = computeMeshStats(wall);

  const cavW = cavX1 - cavX0;
  const cavD = cavY1 - cavY0;
  // Each pour fills the box to the wall top minus the master's above-plate
  // volume (master volume minus its skirt, which sits inside the plate). The
  // skirt is a `seat`-tall prism on the SHELL RAILS, not on the whole
  // silhouette — the channel between them is open now, so the footprint is the
  // outline less its inward offset by the shell thickness.
  const skirtArea = Math.abs(signedArea(silhouette))
    - (parts.hollowed ? Math.abs(signedArea(parts.silhouetteAt(-shellT))) : 0);
  const skirtVol = skirtArea * seat;
  const masterAbove = Math.max(0, masterStats.volumeMm3 - skirtVol);
  const plasterVolumeMm3 = 2 * (cavW * cavD * wallH - masterAbove);

  return {
    master, masterBody, masterWells, plate, wall, wallB, plaster, masterB, plateB,
    hasSelfIntersection,
    tieBars: tieBars.map((loop) => loop.map(([x, y]) => [x - bcx, y - bcy] as P2)),
    shellUsed: shellT,
    channel: [
      Math.max(0, 2 * (dims.hw - shellT)),
      Math.max(0, dims.ht - shellT + seat),
    ],
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
