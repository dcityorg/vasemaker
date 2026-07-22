/**
 * MoldMaker geometry — builds the master (hollow positive + well + flange),
 * the cottle (plaster container), and a display plaster block from a vase
 * design (VaseParameters) plus MoldParameters.
 *
 * Reuses the VaseMaker engine read-only: computeRowContexts / computeVertex /
 * computeCenter sample the exact vase outer surface, so the mold always matches
 * the current vase math. All heavy shell assembly goes through buildRevolvedShell.
 */

import type { VaseParameters, VaseMesh } from '../types';
import {
  computeRowContexts,
  computeVertex,
  computeCenter,
  precomputeTextureTables,
} from '../surfaces';
import { computeMeshStats, MeshStats } from '../mesh-stats';
import { buildRevolvedShell, offsetRingRadial, liftRing, mergeMeshes, Ring } from './ring-mesh';
import { buildLid } from './lid';
import type { MoldParameters } from './mold-types';

const tanDeg = (deg: number) => Math.tan((deg * Math.PI) / 180);

export interface MoldMeshes {
  master: VaseMesh;
  cottle: VaseMesh;
  plaster: VaseMesh;
  /** Height the master is lifted inside the cottle so plaster sits beneath it (mm). */
  bottomGap: number;
  /** In master-local coords, the height up to which the master is embedded in plaster (well top). Above this is the flange/lip — not an undercut concern. */
  plasterTopZ: number;
  /** Estimated plaster volume (mold interior minus master envelope), mm³. */
  plasterVolumeMm3: number;
  masterStats: MeshStats;
  cottleStats: MeshStats;
}

/** Deep-clone a vase design and apply mold-specific adjustments (shrink scale, texture strip). */
function prepareVaseParams(vase: VaseParameters, scale: number, keepTexture: boolean): VaseParameters {
  const p: VaseParameters = JSON.parse(JSON.stringify(vase));
  p.radius *= scale;
  p.height *= scale;
  p.fixedOffset.x *= scale;
  p.fixedOffset.y *= scale;
  if (p.bezierOffset) {
    p.bezierOffset.scaleX *= scale;
    p.bezierOffset.scaleY *= scale;
  }
  if (!keepTexture) {
    p.textures.enabled = false;
  }
  // SVG pattern needs async rasterization priming that MoldMaker doesn't wire up;
  // disable it so texture sampling never reads stale/absent SVG data.
  if (p.textures.svgPattern) p.textures.svgPattern.enabled = false;
  return p;
}

/** Build the outer-surface ring stack (bottom → top) for a set of vase params. */
function buildOuterRings(p: VaseParameters, texturesEnabled: boolean): { rings: Ring[]; centers: [number, number][]; heights: number[] } {
  const vRes = p.resolution.vertical;
  const rRes = p.resolution.radial;
  const { simplexPerm, woodGrainPerm } = precomputeTextureTables(p, texturesEnabled);
  const rows = computeRowContexts(p, vRes, rRes);

  const rings: Ring[] = [];
  const centers: [number, number][] = [];
  const heights: number[] = [];
  for (let v = 0; v <= vRes; v++) {
    const row = rows[v];
    const ring = new Float32Array(rRes * 3);
    for (let t = 0; t < rRes; t++) {
      const [x, y, z] = computeVertex(row, t, 0, undefined, p, rRes, texturesEnabled, simplexPerm, woodGrainPerm);
      ring[t * 3] = x; ring[t * 3 + 1] = y; ring[t * 3 + 2] = z;
    }
    rings.push(ring);
    centers.push(computeCenter(row));
    heights.push(row.height);
  }
  return { rings, centers, heights };
}

/** A capped solid (surface + bottom disc + top disc) for volume computation only. */
function buildCappedSolid(rings: Ring[], rRes: number): VaseMesh {
  // Reuse buildRevolvedShell with a degenerate inner stack collapsed to the axis
  // would double-count; instead build a minimal capped tube here.
  const n = rings.length;
  const surfVerts = n * rRes;
  const totalVerts = surfVerts + 2; // + bottom center + top center
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  for (let r = 0; r < n; r++) positions.set(rings[r], r * rRes * 3);
  const bottomCenterIdx = surfVerts;
  const topCenterIdx = surfVerts + 1;
  const cenOf = (ring: Ring) => {
    let sx = 0, sy = 0; for (let t = 0; t < rRes; t++) { sx += ring[t * 3]; sy += ring[t * 3 + 1]; }
    return [sx / rRes, sy / rRes, ring[2]] as [number, number, number];
  };
  const [bx, by, bz] = cenOf(rings[0]);
  positions[bottomCenterIdx * 3] = bx; positions[bottomCenterIdx * 3 + 1] = by; positions[bottomCenterIdx * 3 + 2] = bz;
  const [tx, ty, tz] = cenOf(rings[n - 1]);
  positions[topCenterIdx * 3] = tx; positions[topCenterIdx * 3 + 1] = ty; positions[topCenterIdx * 3 + 2] = tz;

  const tris = (n - 1) * rRes * 2 + rRes * 2;
  const indices = new Uint32Array(tris * 3);
  let o = 0;
  for (let r = 0; r < n - 1; r++) {
    for (let t = 0; t < rRes; t++) {
      const tN = (t + 1) % rRes;
      const bl = r * rRes + t, br = r * rRes + tN, tl = (r + 1) * rRes + t, tr = (r + 1) * rRes + tN;
      indices[o++] = bl; indices[o++] = tr; indices[o++] = tl;
      indices[o++] = bl; indices[o++] = br; indices[o++] = tr;
    }
  }
  // Bottom disc (down)
  for (let t = 0; t < rRes; t++) { const tN = (t + 1) % rRes; indices[o++] = bottomCenterIdx; indices[o++] = tN; indices[o++] = t; }
  // Top disc (up)
  const topBase = (n - 1) * rRes;
  for (let t = 0; t < rRes; t++) { const tN = (t + 1) % rRes; indices[o++] = topCenterIdx; indices[o++] = topBase + t; indices[o++] = topBase + tN; }
  return { positions, normals, indices, vertexCount: totalVerts, triangleCount: o / 3 };
}

export function generateMoldMeshes(vase: VaseParameters, mold: MoldParameters): MoldMeshes {
  const rRes = vase.resolution.radial;
  const scale = 1 + mold.shrinkPercent / 100;
  const wt = mold.masterWallThickness;

  // ── Master body: outer + smooth outer rings ──
  const masterParams = prepareVaseParams(vase, scale, mold.keepTexture);
  const smoothParams = prepareVaseParams(vase, scale, false);
  const texturesEnabled = mold.keepTexture && masterParams.textures.enabled !== false;

  const outer = buildOuterRings(masterParams, texturesEnabled);
  const smooth = buildOuterRings(smoothParams, false);

  const vCount = outer.rings.length; // vRes + 1
  const topIdx = vCount - 1;
  const topRing = outer.rings[topIdx];
  const [tcx, tcy] = outer.centers[topIdx];
  const hTop = outer.heights[topIdx];

  // Well geometry
  const draftTan = tanDeg(mold.wellDraftAngle);
  const wellOuterDelta = mold.wellWidth + mold.wellHeight * draftTan;
  const wellTopZ = hTop + mold.wellHeight;
  const flangeTopZ = wellTopZ + mold.flangeThickness;
  const bottomGap = mold.plasterThickness; // master lift inside the cottle

  // ── Master vessel outer stack (body + well ledge + well wall). Lid closes the top. ──
  const masterOuter: Ring[] = [...outer.rings];
  masterOuter.push(offsetRingRadial(topRing, tcx, tcy, mold.wellWidth, hTop, rRes));       // ledge (90° razor step)
  masterOuter.push(offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, wellTopZ, rRes));   // well top (drafted)

  // ── Master vessel inner stack (cavity: body offset inward, then well interior) ──
  // The well-floor slab sits ABOVE the razor-ledge plane: z ∈ [hTop, hTop+wt].
  // Its underside outside the vase radius IS the external ledge (mold shape
  // unchanged), and inside the vase radius it rests on the vase wall top — so it
  // is solidly connected on the vase side. The cavity path: vase inner wall all
  // the way up to the rim, rise `wt` (floor inner edge), run FLAT out to the well
  // wall, then square up the well inner wall — no 45° chamfer, no floating shelf.
  const baseThk = wt;
  let innerStart = 0;
  for (let v = 0; v <= topIdx; v++) { if (outer.heights[v] >= baseThk) { innerStart = v; break; } if (v === topIdx) innerStart = topIdx; }
  const floorTopZ = Math.min(hTop + wt, wellTopZ); // guard: degenerate if wellHeight < wall thickness
  const masterInner: Ring[] = [];
  for (let v = innerStart; v <= topIdx; v++) {
    const [cx, cy] = outer.centers[v];
    masterInner.push(offsetRingRadial(outer.rings[v], cx, cy, -wt, outer.heights[v], rRes));
  }
  masterInner.push(offsetRingRadial(topRing, tcx, tcy, -wt, floorTopZ, rRes));                    // floor inner edge — rises from the vase wall top
  masterInner.push(offsetRingRadial(topRing, tcx, tcy, mold.wellWidth - wt, floorTopZ, rRes));    // FLAT floor top, vase wall → well wall
  masterInner.push(offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - wt, wellTopZ, rRes));     // square corner, up the well inner wall (cavity opening)

  const vessel = buildRevolvedShell(masterOuter, masterInner, rRes, false); // open top — lid closes it

  // ── Lid: flange plate + pour holes + grip lip ──
  // The lip grips the cottle outer wall, so its radius is derived from the cottle.
  const H_c = wellTopZ + bottomGap; // fill line / cottle rim height in assembly space
  const cottleInnerDelta = wellOuterDelta + mold.plasterThickness + tanDeg(mold.cottleDraftAngle) * H_c;
  const cottleOuterDelta = cottleInnerDelta + mold.cottleWallThickness;
  const LIP_CLEARANCE = 0.25, LIP_WALL = 2, LIP_DROP = 2;
  const lipInnerDelta = cottleOuterDelta + LIP_CLEARANCE;
  const lipOuterDelta = lipInnerDelta + LIP_WALL;
  const cavityOpenDelta = wellOuterDelta - wt;

  // Pour slots: arc-shaped, following the cross-section, spanning the plaster gap
  // (well outer wall → cottle inner wall) so they open onto the plaster, not the cavity.
  const holeCount = Math.max(0, Math.round(mold.pourHoleCount));
  const SLOT_FRACTION = 0.68; // fraction of each sector that is open; the rest is a spoke

  const lid = buildLid({
    topRing, cx: tcx, cy: tcy, rRes,
    innerDelta: cavityOpenDelta,
    lipInnerDelta, lipOuterDelta,
    zBot: wellTopZ, zTop: flangeTopZ, lipDrop: LIP_DROP,
    holeCount, slotFraction: SLOT_FRACTION,
    holeInnerDelta: wellOuterDelta,
    holeOuterDelta: cottleInnerDelta,
  });

  const master = mergeMeshes([vessel, lid]);

  // ── Assembly coordinates ──
  // In the mold, the master is lifted `bottomGap` above the cottle floor so a
  // layer of plaster forms beneath it. Everything below is built in assembly
  // space (z = 0 at the cottle floor). The fill line (cottle rim = flange
  // underside) is at H_c = bottomGap + wellTop. (bottomGap defined above.)
  const smTop = smooth.rings[topIdx];
  const [scx, scy] = smooth.centers[topIdx];

  // Smooth master envelope (body + well ledge + well top, NO flange), in the
  // master's own coordinates (base at z = 0). This is the plaster cavity shape.
  const envelope: Ring[] = [
    ...smooth.rings,
    offsetRingRadial(smTop, scx, scy, mold.wellWidth, hTop, rRes),
    offsetRingRadial(smTop, scx, scy, wellOuterDelta, wellTopZ, rRes),
  ];
  const envCenters: [number, number][] = [...smooth.centers, [scx, scy], [scx, scy]];
  const envHeights: number[] = [...smooth.heights, hTop, wellTopZ];

  // The cavity in assembly space: envelope lifted by bottomGap (top at H_c).
  const plasterVoid = envelope.map((r) => liftRing(r, bottomGap, rRes));

  // ── Cottle: offset the envelope out by plaster + draft, built floor → fill line ──
  // The cottle skips the well ledge (the horizontal step): it flares diagonally
  // from the body rim straight to the well-top radius. Following the ledge would
  // create a horizontal shoulder that, with a purely radial wall offset, is
  // zero-thickness. The diagonal keeps a real wall thickness everywhere. (The
  // plaster void above still uses the full stepped `envelope`.)
  const cottleEnv: Ring[] = [...smooth.rings, offsetRingRadial(smTop, scx, scy, wellOuterDelta, wellTopZ, rRes)];
  const cottleEnvCenters: [number, number][] = [...smooth.centers, [scx, scy]];
  const cottleEnvHeights: number[] = [...smooth.heights, wellTopZ];

  const draftTanC = tanDeg(mold.cottleDraftAngle);
  const floorZ = mold.cottleWallThickness;
  const cottleInner: Ring[] = [];
  const cottleOuter: Ring[] = [];
  // Floor rings: inner at the cavity-floor height, outer at z = 0 (solid slab between).
  cottleInner.push(offsetRingRadial(cottleEnv[0], cottleEnvCenters[0][0], cottleEnvCenters[0][1], mold.plasterThickness + draftTanC * floorZ, floorZ, rRes));
  cottleOuter.push(offsetRingRadial(cottleEnv[0], cottleEnvCenters[0][0], cottleEnvCenters[0][1], mold.plasterThickness + mold.cottleWallThickness, 0, rRes));
  // Wall rings following the lifted envelope up to the fill line H_c.
  for (let i = 0; i < cottleEnv.length; i++) {
    const z = cottleEnvHeights[i] + bottomGap;
    const [cx, cy] = cottleEnvCenters[i];
    const innerDelta = mold.plasterThickness + draftTanC * z;
    cottleInner.push(offsetRingRadial(cottleEnv[i], cx, cy, innerDelta, z, rRes));
    cottleOuter.push(offsetRingRadial(cottleEnv[i], cx, cy, innerDelta + mold.cottleWallThickness, z, rRes));
  }
  const cottle = buildRevolvedShell(cottleOuter, cottleInner, rRes);

  // ── Plaster (display block): cottle interior with the cavity void ──
  // Both stacks end at the fill line H_c, so the top face closes flat (no flare).
  const plaster = buildRevolvedShell(cottleInner, plasterVoid, rRes);

  // ── Volumes ──
  const cottleInteriorVol = computeMeshStats(buildCappedSolid(cottleInner, rRes)).volumeMm3;
  const masterEnvelopeVol = computeMeshStats(buildCappedSolid(plasterVoid, rRes)).volumeMm3;
  const plasterVolumeMm3 = Math.max(0, cottleInteriorVol - masterEnvelopeVol);

  return {
    master,
    cottle,
    plaster,
    bottomGap,
    plasterTopZ: wellTopZ,
    plasterVolumeMm3,
    masterStats: computeMeshStats(master),
    cottleStats: computeMeshStats(cottle),
  };
}
