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

/** Radius of the air-relief hole through the cottle floor (4mm diameter). */
const AIR_HOLE_RADIUS = 2;
/** The cottle interior floor is never narrower than this radius (40mm diameter) so the plaster block always has a flat base to stand on. */
const MIN_FLOOR_RADIUS = 20;

/** Smallest distance from (cx, cy) to any point of the ring. */
function minRingRadius(ring: Ring, cx: number, cy: number, rRes: number): number {
  let m = Infinity;
  for (let t = 0; t < rRes; t++) {
    m = Math.min(m, Math.hypot(ring[t * 3] - cx, ring[t * 3 + 1] - cy));
  }
  return m;
}

/** Push any ring point closer than minR to (cx, cy) out to minR (in place). */
function clampRingMinRadius(ring: Ring, cx: number, cy: number, minR: number, rRes: number): Ring {
  for (let t = 0; t < rRes; t++) {
    const dx = ring[t * 3] - cx;
    const dy = ring[t * 3 + 1] - cy;
    const r = Math.hypot(dx, dy);
    if (r > 1e-6 && r < minR) {
      const f = minR / r;
      ring[t * 3] = cx + dx * f;
      ring[t * 3 + 1] = cy + dy * f;
    }
  }
  return ring;
}

/**
 * Stepped foot-recess rings for the master's bottom face, ordered inside → out
 * (ready to prepend to the outer ring stack, whose fan then closes the recessed
 * center plateau). From the outside in: the flat foot ring (width w1 at z = 0),
 * then a staircase rising `h` over width w2 in uniform steps of ~stepH (each
 * step = one printer layer), then the flat recessed center at z = h.
 * The last returned ring is the foot inner edge at z = 0; the caller appends
 * the base ring itself (delta 0) to close the foot annulus.
 */
function buildFootRings(baseRing: Ring, cx: number, cy: number, rRes: number, w1: number, w2: number, h: number, stepH: number): Ring[] {
  if (h <= 0 || w2 <= 0) return [];
  const avail = minRingRadius(baseRing, cx, cy, rRes) - 0.5;
  if (avail <= 0.2) return [];
  let fw = w1, sw = w2;
  if (fw + sw > avail) {
    const s = avail / (fw + sw);
    fw *= s;
    sw *= s;
  }
  const n = Math.max(1, Math.round(h / Math.max(0.05, stepH)));
  const sh = h / n;
  const rings: Ring[] = [];
  rings.push(offsetRingRadial(baseRing, cx, cy, -(fw + sw), h, rRes)); // recessed-center plateau edge
  for (let j = n - 1; j >= 0; j--) {
    const d = -(fw + (sw * j) / n);
    rings.push(offsetRingRadial(baseRing, cx, cy, d, sh * (j + 1), rRes)); // tread outer edge (riser top)
    rings.push(offsetRingRadial(baseRing, cx, cy, d, sh * j, rRes));       // riser bottom
  }
  return rings;
}

/**
 * Fuse the well collar into the body where the vase curls inward near the rim.
 * When a profile narrows toward the top (barrel / shoulder shapes), the razor
 * ledge steps out OVER the vase's own shoulder, leaving a razor-thin air wedge
 * between the ledge underside and the shoulder (non-manifold sliver when
 * printed). Fix: per angular station, if the body reaches the ledge-end radius
 * within `fuseWindow` mm below the rim, push every body point above that back
 * out to the ledge-end radius — the buried ledge becomes a solid vertical wall
 * merged with the body. Vases that don't curl inward near the rim are untouched
 * (their body never reaches the ledge radius inside the window).
 * Mutates `rings` in place.
 */
function fuseCollarIntoBody(rings: Ring[], heights: number[], tcx: number, tcy: number, rRes: number, ledgeRing: Ring, hTop: number, fuseWindow: number): void {
  const top = rings.length - 1;
  for (let t = 0; t < rRes; t++) {
    const W0 = Math.hypot(ledgeRing[t * 3] - tcx, ledgeRing[t * 3 + 1] - tcy);
    let pierce = -1;
    for (let v = top; v >= 0; v--) {
      if (heights[v] < hTop - fuseWindow) break;
      const dx = rings[v][t * 3] - tcx, dy = rings[v][t * 3 + 1] - tcy;
      if (Math.hypot(dx, dy) >= W0) { pierce = v; break; }
    }
    if (pierce < 0) continue;
    for (let v = pierce + 1; v <= top; v++) {
      const ring = rings[v];
      const dx = ring[t * 3] - tcx, dy = ring[t * 3 + 1] - tcy;
      const r = Math.hypot(dx, dy);
      if (r >= W0 || r < 1e-6) continue;
      const f = W0 / r;
      ring[t * 3] = tcx + dx * f;
      ring[t * 3 + 1] = tcy + dy * f;
    }
  }
}

/**
 * Master cavity rings: offset the body rings inward along the PROFILE normal
 * (in the r-z plane, per angular station) instead of purely radially. A radial
 * offset has zero perpendicular thickness on near-horizontal surfaces (inward
 * shoulders), collapsing the master wall to a paper-thin sheet; the profile
 * normal keeps full `wt` thickness there by dropping the cavity downward.
 * The tangent uses rows v±2 (clamped) to smooth texture-frequency wiggle.
 */
function buildCavityRings(rings: Ring[], centers: [number, number][], rRes: number, vFrom: number, vTo: number, wt: number): Ring[] {
  const top = rings.length - 1;
  const out: Ring[] = [];
  for (let v = vFrom; v <= vTo; v++) {
    const ring = rings[v];
    const [cx, cy] = centers[v];
    const vP = Math.max(v - 2, 0);
    const vN = Math.min(v + 2, top);
    const [cxP, cyP] = centers[vP];
    const [cxN, cyN] = centers[vN];
    const res = new Float32Array(rRes * 3);
    for (let t = 0; t < rRes; t++) {
      const x = ring[t * 3], y = ring[t * 3 + 1], z = ring[t * 3 + 2];
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy);
      const rP = Math.hypot(rings[vP][t * 3] - cxP, rings[vP][t * 3 + 1] - cyP);
      const rN = Math.hypot(rings[vN][t * 3] - cxN, rings[vN][t * 3 + 1] - cyN);
      const dr = rN - rP;
      const dz = rings[vN][t * 3 + 2] - rings[vP][t * 3 + 2];
      const len = Math.hypot(dr, dz);
      let nr = 1, nz = 0; // fallback: radial
      if (len > 1e-9) { nr = dz / len; nz = -dr / len; } // outward normal in (r, z)
      const f = r > 1e-6 ? Math.max(1e-4, (r - wt * nr) / r) : 1;
      res[t * 3] = cx + dx * f;
      res[t * 3 + 1] = cy + dy * f;
      res[t * 3 + 2] = z - wt * nz;
    }
    out.push(res);
  }
  return out;
}

/** Widest horizontal extent of a mesh — diameter of the enclosing circle about the XY bounding-box center. */
function maxDiameterXY(mesh: VaseMesh): number {
  const p = mesh.positions;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = p[i * 3], y = p[i * 3 + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let r2 = 0;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const dx = p[i * 3] - cx, dy = p[i * 3 + 1] - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) r2 = d2;
  }
  return 2 * Math.sqrt(r2);
}

export interface MoldMeshes {
  master: VaseMesh;
  cottle: VaseMesh;
  plaster: VaseMesh;
  /** Height the master is lifted inside the cottle so plaster sits beneath it (mm). */
  bottomGap: number;
  /** In master-local coords, the height up to which the master is embedded in plaster (well top). Above this is the flange/lip — not an undercut concern. */
  plasterTopZ: number;
  /** In master-local coords, the top of the bottom foot recess (0 when disabled). Downward faces at or below this are the stepped bottom — not an undercut concern. */
  footTopZ: number;
  /** Widest horizontal extent of the master (incl. lid grip lip), mm — printer-bed fit check. */
  masterMaxDiameter: number;
  /** Widest horizontal extent of the cottle, mm — printer-bed fit check. */
  cottleMaxDiameter: number;
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

/** Build the outer-surface ring stack (bottom → top) for a set of vase params.
 * Also returns `smoothBase`: the bottom ring with textures suppressed (used for
 * the foot recess's "smooth inside" option). */
function buildOuterRings(p: VaseParameters, texturesEnabled: boolean): { rings: Ring[]; centers: [number, number][]; heights: number[]; smoothBase: Ring } {
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
  const smoothBase = new Float32Array(rRes * 3);
  for (let t = 0; t < rRes; t++) {
    const [x, y, z] = computeVertex(rows[0], t, 0, undefined, p, rRes, false, simplexPerm, woodGrainPerm);
    smoothBase[t * 3] = x; smoothBase[t * 3 + 1] = y; smoothBase[t * 3 + 2] = z;
  }
  return { rings, centers, heights, smoothBase };
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

  // ── Master body outer rings (textured when Keep Texture is on). The cottle
  // and plaster envelope are built from these SAME rings, so they follow the
  // master's actual contour — texture ripples included — and the cottle rim
  // always matches the lid's grip lip. ──
  const masterParams = prepareVaseParams(vase, scale, mold.keepTexture);
  const texturesEnabled = mold.keepTexture && masterParams.textures.enabled !== false;

  const outer = buildOuterRings(masterParams, texturesEnabled);

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

  // ── Foot recess (stepped indent in the master bottom → foot ring + glaze
  // well on every cast piece). Height is clamped so it can't punch through the
  // master's base slab into the hollow interior. ──
  const footH = mold.footEnabled ? Math.max(0, Math.min(mold.footHeight, wt - 0.5)) : 0;
  const footBase = mold.footSmoothInner ? outer.smoothBase : outer.rings[0];
  const footRings = footH > 0
    ? buildFootRings(footBase, outer.centers[0][0], outer.centers[0][1], rRes, mold.footWidth, mold.footSlopeWidth, footH, mold.footStepHeight)
    : [];

  // ── Well rings + cavity floor path — computed from the PRE-fuse rim so the
  // ledge, lid, and cavity keep the true rim contour. fuseCollarIntoBody (below)
  // then mutates the body rings; where it fuses, the clamped rim meets
  // ledgeRing exactly and the ledge quad degenerates into the merged wall. ──
  const floorTopZ = Math.min(hTop + wt, wellTopZ); // guard: degenerate if wellHeight < wall thickness
  const ledgeRing = offsetRingRadial(topRing, tcx, tcy, mold.wellWidth, hTop, rRes);            // ledge (90° razor step)
  const wellTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, wellTopZ, rRes);      // well top (drafted)
  const wellInnerTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - wt, wellTopZ, rRes); // square corner, up the well inner wall (cavity opening)
  const topRingOrig = new Float32Array(topRing); // pre-fuse rim contour for the lid

  // Fuse the collar into the body where the vase curls inward near the rim
  // (kills the razor air wedge between ledge underside and shoulder).
  const fuseWindow = Math.max(wt, mold.wellWidth * 0.6);
  fuseCollarIntoBody(outer.rings, outer.heights, tcx, tcy, rRes, ledgeRing, hTop, fuseWindow);

  // ── Master vessel outer stack (foot recess + body + well ledge + well wall). Lid closes the top. ──
  const masterOuter: Ring[] = [...footRings, ...outer.rings, ledgeRing, wellTopRing];

  // ── Master vessel inner stack (cavity: body offset inward, then well interior) ──
  // The well-floor slab sits ABOVE the razor-ledge plane: z ∈ [hTop, hTop+wt].
  // Its underside outside the vase radius IS the external ledge (mold shape
  // unchanged), and inside the vase radius it rests on the vase wall top — so it
  // is solidly connected on the vase side. The cavity path: vase inner wall all
  // the way up to the rim, rise `wt` (floor inner edge), run FLAT out to the well
  // wall, then square up the well inner wall — no 45° chamfer, no floating shelf.
  // Body cavity rings use the profile-normal offset (buildCavityRings) so
  // near-horizontal shoulders keep full wall thickness.
  const baseThk = wt;
  let innerStart = 0;
  for (let v = 0; v <= topIdx; v++) { if (outer.heights[v] >= baseThk) { innerStart = v; break; } if (v === topIdx) innerStart = topIdx; }
  const cavityBody = buildCavityRings(outer.rings, outer.centers, rRes, innerStart, topIdx, wt);
  // Floor path follows the ACTUAL cavity top (fused or not): rise straight up
  // from the last cavity ring to the floor-top plane, then run flat out to the
  // ledge interior (ledge radius − wt). At fused stations the cavity top is
  // already at the ledge interior radius, so rise and flat coincide and the
  // stair degenerates — the whole region above the fused wall stays solid
  // (an earlier version rose at the ORIGINAL rim radius, which after fusing
  // jogged the cavity inward and carved a razor-thin annular slot there).
  const floorRiseRing = new Float32Array(rRes * 3);
  const cavityTop = cavityBody[cavityBody.length - 1];
  for (let t = 0; t < rRes; t++) {
    floorRiseRing[t * 3] = cavityTop[t * 3];
    floorRiseRing[t * 3 + 1] = cavityTop[t * 3 + 1];
    floorRiseRing[t * 3 + 2] = floorTopZ;
  }
  const floorFlatRing = offsetRingRadial(ledgeRing, tcx, tcy, -wt, floorTopZ, rRes);
  const masterInner: Ring[] = [
    ...cavityBody,
    floorRiseRing,
    floorFlatRing,
    wellInnerTopRing,
  ];

  // capTop: TRUE — the top annulus joins the outer and inner walls at the well
  // rim, making the vessel one closed solid. Without it (as before), the outer
  // and inner strips were two DISCONNECTED shells only coplanar-touched by the
  // lid — slicers sometimes failed to union them ("floating cantilever").
  // The lid slab sits on the closed rim and welds to the vessel via the shared
  // cavity-opening ring.
  const vessel = buildRevolvedShell(masterOuter, masterInner, rRes, true);

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
  const SLOT_FRACTION = 0.82; // fraction of each sector that is open; the rest is a spoke

  const lid = buildLid({
    topRing: topRingOrig, cx: tcx, cy: tcy, rRes,
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
  // Master envelope (foot recess + body + well ledge + well top, NO flange), in
  // the master's own coordinates (base at z = 0). This is the plaster cavity
  // shape — built from the master's actual (textured) rings so the plaster
  // block and volume match what the master really displaces.
  const envelope: Ring[] = [
    ...footRings,
    ...outer.rings,
    ledgeRing,
    wellTopRing,
  ];

  // The cavity in assembly space: envelope lifted by bottomGap (top at H_c).
  const plasterVoid = envelope.map((r) => liftRing(r, bottomGap, rRes));

  // ── Cottle: offset the envelope out by plaster + draft, built floor → fill line ──
  // Built from the same (textured) rings as the master, so the cottle follows
  // the vase's full contour — ripples, squares, any cross-section — and its rim
  // matches the master's grip lip. The cottle skips the well ledge (the
  // horizontal step): it flares diagonally from the body rim straight to the
  // well-top radius. Following the ledge would create a horizontal shoulder
  // that, with a purely radial wall offset, is zero-thickness. The diagonal
  // keeps a real wall thickness everywhere. (The plaster void above still uses
  // the full stepped `envelope`.)
  // Every interior ring is clamped to MIN_FLOOR_RADIUS so the plaster block
  // always gets a flat standing base at least 40mm across.
  const cottleEnv: Ring[] = [...outer.rings, wellTopRing];
  const cottleEnvCenters: [number, number][] = [...outer.centers, [tcx, tcy]];
  const cottleEnvHeights: number[] = [...outer.heights, wellTopZ];

  const draftTanC = tanDeg(mold.cottleDraftAngle);
  const floorZ = mold.cottleWallThickness;
  const minOuterR = MIN_FLOOR_RADIUS + mold.cottleWallThickness;
  const cottleInner: Ring[] = [];
  const cottleOuter: Ring[] = [];
  // Floor rings: inner at the cavity-floor height, outer at z = 0 (solid slab between).
  const [c0x, c0y] = cottleEnvCenters[0];
  cottleInner.push(clampRingMinRadius(offsetRingRadial(cottleEnv[0], c0x, c0y, mold.plasterThickness + draftTanC * floorZ, floorZ, rRes), c0x, c0y, MIN_FLOOR_RADIUS, rRes));
  cottleOuter.push(clampRingMinRadius(offsetRingRadial(cottleEnv[0], c0x, c0y, mold.plasterThickness + mold.cottleWallThickness, 0, rRes), c0x, c0y, minOuterR, rRes));
  // Wall rings following the lifted envelope up to the fill line H_c.
  for (let i = 0; i < cottleEnv.length; i++) {
    const z = cottleEnvHeights[i] + bottomGap;
    const [cx, cy] = cottleEnvCenters[i];
    const innerDelta = mold.plasterThickness + draftTanC * z;
    cottleInner.push(clampRingMinRadius(offsetRingRadial(cottleEnv[i], cx, cy, innerDelta, z, rRes), cx, cy, MIN_FLOOR_RADIUS, rRes));
    cottleOuter.push(clampRingMinRadius(offsetRingRadial(cottleEnv[i], cx, cy, innerDelta + mold.cottleWallThickness, z, rRes), cx, cy, minOuterR, rRes));
  }
  // 4mm air-relief hole through the floor center — lets air in when pulling the
  // set plaster block out of the cottle.
  const cottle = buildRevolvedShell(cottleOuter, cottleInner, rRes, true, AIR_HOLE_RADIUS);

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
    footTopZ: footH,
    masterMaxDiameter: maxDiameterXY(master),
    cottleMaxDiameter: maxDiameterXY(cottle),
    plasterVolumeMm3,
    masterStats: computeMeshStats(master),
    cottleStats: computeMeshStats(cottle),
  };
}
