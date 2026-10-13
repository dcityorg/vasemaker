/**
 * Split Halves mold generator — the Split 2-Pc idea (two plaster halves split
 * through the vase axis, pulled apart sideways) built the HandleMaker way:
 * REUSABLE printed parts that come apart in four directions, instead of one
 * throwaway tray.
 *
 * Gary poured the first Split 2-Pc tray on 2026-10-11 and could not get the
 * plaster out of it — the tray wraps the setting plaster on five sides with the
 * half-vase fused into it. Here every surface has its own way out:
 *   - MASTER: the half-vase (+ well + half-handle) as a hollow shell, open on
 *     its cut face, standing in a `seat`-deep pocket in the plate. It pulls
 *     straight out of the plaster (the direction the undercut check tests);
 *     cold water poured into the open cavity shrinks it free.
 *   - PLATE: the parting face. Solid (no tape holes, Gary 2026-10-12), with the
 *     master pocket, the natches and HandleMaker's flange V ridges.
 *   - TWO WALLS: HandleMaker's clip-flange walls. The well runs into the wall
 *     through a collar, as the handle wells do.
 *
 * MIRROR, NOT ROTATE. With a handle, the two halves are mirror images (lay both
 * cut-face down: the handle is on the right in one and the left in the other),
 * so there is a master + plate per half — L and R. The walls are shared, and
 * SWAP ENDS between pours: wall 1 is L's well end and R's base end, wall 2 is
 * R's well end and L's base end. Each wall's collar is vestigial on the base
 * end (a shallow dent in the plaster's base face). That keeps the block tight
 * around the off-centre handle instead of centring it on the vase axis.
 * Wall 1 carries ridges at both seams and wall 2 grooves, so one of each always
 * mates whichever way round they go.
 *
 * Assembly coordinates per half (HandleMaker's): plate top = parting plane =
 * z 0, master skirt to z −seat, well at the low-x end (x = cavX0 = the well
 * wall's inner face), vase base at x = 0, plaster beyond it to x = cavX1.
 * Half L maps world (z, u, h) → (−z, −u, h); half R (−z, +u, h). Both are
 * rotations of the Split 2-Pc native frames, never mirrors, so winding holds.
 *
 * Plan + decisions: local-docs/moldmaker-split2pc-plan.md, Phase 4.
 */

import type { VaseParameters, VaseMesh } from '../types';
import { computeMeshStats, type MeshStats } from '../mesh-stats';
import { offsetRingRadial, mergeMeshes, type Ring } from './ring-mesh';
import { tanDeg, prepareVaseParams, buildOuterRings, buildCavityRings, clampCavityUnderRim } from './mold-generator';
import { boxSolid, extrudeSolid, translateMesh, rotate180Z, dedupeLoop, MAP_YZ_X, type P2 } from '../handle/mesh3';
import { buildDome, buildWall, buildPlateRidges, seamMaxVWidth, type MoldLayout } from '../handle/mold-parts';
import type { MoldParameters } from './mold-types';
import type { HandleParameters } from '../handle/handle-types';
import { sampleSpine } from '../handle/spine';
import { splitSilhouette, placeHandle, surfaceLookup, sweepHandle, meshSweep, resweep, halfProfile, channelProfile, type HandlePlacement, type HandleSweep } from './split-handle';
import { cutArc, buildRelief, buildFloor, halfSectionArea, undercutOf, type Arc, type HalfFrame } from './split-two-piece-generator';

/** Feature-into-host overlap for slicer union (HandleMaker's EMBED). */
const EMBED = 0.2;
/** Plaster kept between a natch and the block edge / the vase, mm. */
const NATCH_EDGE = 4;
/** Gap between the two assemblies in the display, mm. */
const LAYOUT_GAP = 30;
const DOME_SEG = 48;
/** The well-end cap stops this far short of the wall face, so its end face is
 *  never coplanar with the shell's open end (the wall covers it either way). */
const CAP_RECESS = 0.2;
/** Strap pull-ribs: fixed count and width (HandleMaker's ribWidth default),
 *  inset from the outer skin as HandleMaker's RIB_INSET. */
const RIB_COUNT = 3;
const RIB_WIDTH = 3;
const RIB_INSET = 0.15;
/** Collar material beyond the well bore, mm (HandleMaker's COLLAR_BAND). */
const COLLAR_BAND = 4;
/** How far past the vase surface each handle end is buried, beyond the shell, mm. */
const HANDLE_BURY_EXTRA = 0.5;
const HANDLE_SEG = 48;
/** Wall/plate seam V numbers — HandleMaker's proven defaults (vWidth, vHeight, vClearance). */
const V_WIDTH = 2;
const V_HEIGHT = 1.4;
const V_CLEARANCE = 0.2;
/** Max L/R master deviation (mm) still treated as one master for both halves. */
const SYMMETRY_TOL = 0.05;

export interface HalfDebug {
  relief: VaseMesh; cap: VaseMesh; capPoly: P2[];
  handle: VaseMesh | null; handleSolid: VaseMesh | null; strapLine: P2[];
  plate: VaseMesh[];
}

export interface SplitHalvesMoldMeshes {
  style: 'splitHalves';
  /** Print parts, assembly coords (plate top z = 0). Export lifts below. */
  masterL: VaseMesh;
  masterR: VaseMesh;
  plateL: VaseMesh;
  plateR: VaseMesh;
  /** Wall 1 = L's well end (ridges); wall 2 = R's well end (grooves). Built in their own half's frame. */
  wall1: VaseMesh;
  wall2: VaseMesh;
  /** Display: both assemblies side by side, L on the left. */
  masters: VaseMesh;
  plates: VaseMesh;
  walls: VaseMesh;
  plaster: VaseMesh;
  /** Per-vertex 0..1 undercut factor, aligned with `masters`. */
  undercutFlags: Float32Array;
  hasUndercuts: boolean;
  /** True when one master + one plate serve both halves (4 STLs instead of 6). */
  oneKit: boolean;
  /** Plaster for BOTH halves, mm³. */
  plasterVolumeMm3: number;
  masterStats: MeshStats;
  plateStats: MeshStats;
  wallStats: MeshStats;
  natchRadius: number;
  error: string | null;
  handle: { placement: HandlePlacement; sectionMm: [number, number] } | null;
  handleError: string | null;
  handleWarning: string | null;
  /** Shared by both halves. */
  layout: {
    cavX0: number; cavX1: number;
    /** Half L's box across (y); R's is the mirror. */
    cavY0: number; cavY1: number;
    wallH: number; seat: number; plateThk: number;
    plateW: number; plateD: number;
    /** z lifts that put each part's bottom on the bed. */
    masterLift: number; plateLift: number;
  };
  /** For the verify scripts: separate solids and the pocket outlines (print coords). */
  debug: {
    partsL: HalfDebug;
    partsR: HalfDebug;
    /** Handle shell actually used (0 = solid, section too small) and ribs placed. */
    handleShell: number;
    handleRibs: number;
    pocketL: P2[]; islandL: P2[] | null;
    pocketR: P2[]; islandR: P2[] | null;
    /** Natch centres, world (z, u): plaster L bumps / dimples. */
    bumpsL: P2[]; dimplesL: P2[];
    /** Wall 2 placed at L's base end (and wall 1 at R's), for mating checks. */
    wall2AtL: VaseMesh; wall1AtR: VaseMesh;
  };
}

// ── 2-D helpers ───────────────────────────────────────────────────────────────

function polyArea(p: P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += x1 * y2 - x2 * y1; }
  return s / 2;
}

/** Offset a closed polygon outward by d (mitered, miter capped at 4×). Same point count/order. */
function offsetPolygon(poly: P2[], d: number): P2[] {
  const n = poly.length;
  const ccw = polyArea(poly) > 0;
  const normals: P2[] = [];
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n];
    const ex = x2 - x1, ey = y2 - y1;
    const L = Math.hypot(ex, ey) || 1;
    // Outward = right of the edge for a CCW loop.
    normals.push(ccw ? [ey / L, -ex / L] : [-ey / L, ex / L]);
  }
  return poly.map(([x, y], i) => {
    const a = normals[(i - 1 + n) % n], b = normals[i];
    let mx = a[0] + b[0], my = a[1] + b[1];
    const ml = Math.hypot(mx, my);
    if (ml < 1e-9) { mx = b[0]; my = b[1]; } else { mx /= ml; my /= ml; }
    const cos = mx * b[0] + my * b[1];
    const s = d / Math.max(0.25, cos);
    return [x + mx * s, y + my * s] as P2;
  });
}

/** Sutherland–Hodgman clip to the half-plane x ≤ xMax. */
function clipToXMax(loop: P2[], xMax: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const ain = a[0] <= xMax, bin = b[0] <= xMax;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (xMax - a[0]) / (b[0] - a[0]);
      out.push([xMax, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

interface Hit { e: number; et: number; s: number; st: number; pt: P2 }

/** All crossings of polyline E with polyline S, in order along E. */
function crossings(E: P2[], S: P2[]): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i + 1 < E.length; i++) {
    const [ax, ay] = E[i], [bx, by] = E[i + 1];
    const rx = bx - ax, ry = by - ay;
    const found: Hit[] = [];
    for (let j = 0; j + 1 < S.length; j++) {
      const [cx, cy] = S[j], [dx, dy] = S[j + 1];
      const sx = dx - cx, sy = dy - cy;
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
      const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
      if (t >= 0 && t < 1 && u >= 0 && u <= 1) found.push({ e: i, et: t, s: j, st: u, pt: [ax + rx * t, ay + ry * t] });
    }
    found.sort((p, q) => p.et - q.et);
    hits.push(...found);
  }
  return hits;
}

/** The run of edge E outside the vase outline S, as a polyline ordered along S
 *  (low S index first), with the two crossings. Null if E does not cross twice. */
function outsideRun(E: P2[], S: P2[]): { pts: P2[]; lo: Hit; hi: Hit } | null {
  const h = crossings(E, S);
  if (h.length < 2) return null;
  const A = h[0], B = h[h.length - 1];
  const pts: P2[] = [A.pt, ...E.slice(A.e + 1, B.e + 1), B.pt];
  const sA = A.s + A.st, sB = B.s + B.st;
  return sA <= sB ? { pts, lo: A, hi: B } : { pts: pts.reverse(), lo: B, hi: A };
}

// ── The generator ────────────────────────────────────────────────────────────

function empty(): VaseMesh {
  return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), vertexCount: 0, triangleCount: 0 };
}

function errorResult(error: string): SplitHalvesMoldMeshes {
  const e = empty();
  const st = computeMeshStats(e);
  return {
    style: 'splitHalves', masterL: e, masterR: e, plateL: e, plateR: e, wall1: e, wall2: e,
    masters: e, plates: e, walls: e, plaster: e, undercutFlags: new Float32Array(0), hasUndercuts: false,
    oneKit: false, plasterVolumeMm3: 0, masterStats: st, plateStats: st, wallStats: st, natchRadius: 0, error,
    handle: null, handleError: null, handleWarning: null,
    layout: { cavX0: 0, cavX1: 0, cavY0: 0, cavY1: 0, wallH: 0, seat: 0, plateThk: 0, plateW: 0, plateD: 0, masterLift: 0, plateLift: 0 },
    debug: {
      partsL: { relief: e, cap: e, capPoly: [], handle: null, handleSolid: null, strapLine: [], plate: [] },
      partsR: { relief: e, cap: e, capPoly: [], handle: null, handleSolid: null, strapLine: [], plate: [] },
      handleShell: 0, handleRibs: 0,
      pocketL: [], islandL: null, pocketR: [], islandR: null, bumpsL: [], dimplesL: [], wall2AtL: e, wall1AtR: e,
    },
  };
}

export function generateSplitHalvesMold(
  vase: VaseParameters, mold: MoldParameters, handleParams: HandleParameters | null = null,
): SplitHalvesMoldMeshes {
  const rRes = vase.resolution.radial;
  const scale = 1 + mold.shrinkPercent / 100;
  const shell = mold.masterWallThickness;
  const m = mold.plasterThickness;
  const seat = mold.halvesSeatDepth;
  const clr = mold.halvesFitClearance;
  // The straight run is only as long as the collar that seals on it (Gary,
  // 2026-10-12) — but never shorter than the end cap it carries, which must
  // sit on the straight section: on the funnel it would poke through the taper.
  const sealDepth = Math.max(0.5, mold.halvesWellSeal);
  const cylLen = Math.max(sealDepth, shell + CAP_RECESS + 0.2);

  const p = prepareVaseParams(vase, scale, mold.keepTexture);
  const texturesEnabled = mold.keepTexture && p.textures.enabled !== false;
  const outerStack = buildOuterRings(p, texturesEnabled);
  const topIdx = outerStack.rings.length - 1;
  const topRing = outerStack.rings[topIdx];
  const [tcx, tcy] = outerStack.centers[topIdx];
  const hTop = outerStack.heights[topIdx];

  // ── Well: Split 2-Pc's ledge + drafted funnel, then a STRAIGHT run to the
  // wall — the collar can only seat on a constant section, not on a cone. ──
  const draftTan = tanDeg(mold.wellDraftAngle);
  const wellOuterDelta = mold.wellWidth + mold.wellHeight * draftTan;
  const wellTopZ = hTop + mold.wellHeight;
  const zEnd = wellTopZ + cylLen;
  const ledgeRing = offsetRingRadial(topRing, tcx, tcy, mold.wellWidth, hTop, rRes);
  const wellTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, wellTopZ, rRes);
  const cylEndRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, zEnd, rRes);
  // A zero-width ledge or zero-height funnel repeats the ring before it, and a
  // strip between two identical rings is all degenerate triangles.
  const outerRings: Ring[] = [
    ...outerStack.rings,
    ...(mold.wellWidth > 1e-3 ? [ledgeRing] : []),
    ...(mold.wellHeight > 1e-3 ? [wellTopRing] : []),
    cylEndRing,
  ];

  let innerStart = topIdx;
  for (let v = 0; v <= topIdx; v++) if (outerStack.heights[v] >= shell) { innerStart = v; break; }
  const cavity = buildCavityRings(outerStack.rings, outerStack.centers, rRes, innerStart, topIdx, shell);
  // Inward-curling lips leave a thin rim corner otherwise (see the helper).
  clampCavityUnderRim(cavity, topRing, tcx, tcy, hTop, shell, rRes);
  const floorTopZ = Math.min(hTop + shell, wellTopZ);
  const riseRing = new Float32Array(cavity[cavity.length - 1]);
  for (let t = 0; t < rRes; t++) riseRing[t * 3 + 2] = floorTopZ;
  const flatRing = offsetRingRadial(ledgeRing, tcx, tcy, -shell, floorTopZ, rRes);
  const wellInnerTop = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - shell, wellTopZ, rRes);
  const wellInnerEnd = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - shell, zEnd, rRes);
  // flatRing is the well floor across the ledge. With no ledge (Width 0) the
  // clamped rise ring already sits at rim − shell, so flatRing would repeat it
  // (an all-degenerate strip) — leave it out.
  const innerRings: Ring[] = [...cavity, riseRing, ...(mold.wellWidth > 1e-3 ? [flatRing] : []), ...(mold.wellHeight > 1e-3 ? [wellInnerTop] : []), wellInnerEnd];

  // ── Split plane, as Split 2-Pc. Native arcs are (z, Y, seat + h); A has
  // Y = u, B has Y = −u. ──
  const [c0x, c0y] = outerStack.centers[0];
  const a = (mold.seamAngle * Math.PI) / 180;
  const sx = Math.cos(a), sy = Math.sin(a);
  const frameA: HalfFrame = { sx, sy, px: -sy, py: sx };
  const frameB: HalfFrame = { sx: -sx, sy: -sy, px: sy, py: -sx };
  const F = seat;
  const nArc = Math.max(16, Math.ceil(rRes / 2));
  const cutAll = (rings: Ring[], f: HalfFrame): Arc[] | null => {
    const out: Arc[] = [];
    for (const r of rings) {
      const arc = cutArc(r, rRes, c0x, c0y, f, F, nArc);
      if (!arc) return null;
      out.push(arc);
    }
    return out;
  };
  const outA = cutAll(outerRings, frameA), inA = cutAll(innerRings, frameA);
  const outB = cutAll(outerRings, frameB), inB = cutAll(innerRings, frameB);
  if (!outA || !inA || !outB || !inB) {
    return errorResult('The split plane misses part of the vase at this Split Angle (XY Sway can carry it entirely to one side). Try another angle or less sway.');
  }

  // ── Handle: Split 2-Pc's placement and burial, skirted to the seat depth. ──
  let handleSweep: HandleSweep | null = null;
  let placement: HandlePlacement | null = null;
  let handleError: string | null = null;
  let handleWarning: string | null = null;
  let sectionMm: [number, number] = [0, 0];
  /** What the master's handle is printed from: the hollow strap + its ribs,
   *  or the solid sweep when the section is too small to shell. The SOLID
   *  sweep stays the source for the pocket and the plaster volume. */
  let handlePrint: HandleSweep[] = [];
  let handleShell = 0;
  let handleRibs = 0;
  if (mold.splitHandle && handleParams) {
    const nBody = outerStack.rings.length;
    const sil = splitSilhouette(outerStack.rings, rRes, c0x, c0y, sx, sy);
    const stations = sampleSpine(handleParams.spinePoints, handleParams.spineTypes, Math.round(handleParams.spineSamples), scale);
    const pl = placeHandle(sil, stations, hTop - mold.handleTopDrop * scale);
    if (typeof pl === 'string') handleError = pl;
    else {
      const lookA = surfaceLookup(outA.slice(0, nBody), F, 1);
      const lookB = surfaceLookup(outB.slice(0, nBody), F, -1);
      const depth = (z: number, u: number, h: number) => Math.min(lookA(z, h), lookB(z, h)) - u;
      const hw = (handleParams.width * scale) / 2, ht = (handleParams.thickness * scale) / 2;
      const sw = sweepHandle(stations, pl, hw, ht, seat, HANDLE_SEG, depth, shell + HANDLE_BURY_EXTRA);
      if (typeof sw === 'string') handleError = sw;
      else {
        let zLo = Infinity, zHi = -Infinity;
        for (const r of sw.rings) for (const [z] of r) { zLo = Math.min(zLo, z); zHi = Math.max(zHi, z); }
        if (zLo < shell) handleError = 'The bottom of the handle reaches the base of the vase — raise the top attachment or shorten the handle.';
        else if (zHi > hTop) handleError = 'The handle reaches above the rim — lower the top attachment (Top Below Rim).';
        else {
          handleSweep = sw; placement = pl;
          // Hollow like HandleMaker's master: open along the cut face, so the
          // ice water gets into the strap too, and so pliers can reach the
          // ribs. Shell clamped as HandleMaker clamps it.
          const t = Math.min(shell, Math.min(hw, ht) - 0.55);
          if (t >= 1) {
            handleShell = t;
            const all = sw.frames.map((_, i) => i);
            handlePrint.push(resweep(sw, pl, channelProfile(hw, ht, seat, HANDLE_SEG, t), all));
            // Pull-ribs: solid slices across the channel, evenly spaced by arc
            // length along the visible strap and clear of both ends.
            const arc = sw.stationArc, total = arc[arc.length - 1];
            const idxAt = (sc: number): number => {
              let i = 0;
              while (i + 2 < arc.length && arc[i + 1] < sc) i++;
              const seg = arc[i + 1] - arc[i];
              return sw.stationFirst + i + (seg > 1e-9 ? (sc - arc[i]) / seg : 0);
            };
            const ribProf = halfProfile(hw - RIB_INSET, ht - RIB_INSET, seat, HANDLE_SEG);
            const margin = RIB_WIDTH / 2 + hw + 2;
            for (let k = 1; k <= RIB_COUNT; k++) {
              const sc = (total * k) / (RIB_COUNT + 1);
              if (sc - RIB_WIDTH / 2 < margin || sc + RIB_WIDTH / 2 > total - margin) continue;
              const f0 = idxAt(sc - RIB_WIDTH / 2), f1 = idxAt(sc + RIB_WIDTH / 2);
              const at = [f0];
              for (let i = Math.ceil(f0 + 1e-6); i < f1 - 1e-6; i++) at.push(i);
              at.push(f1);
              handlePrint.push(resweep(sw, pl, ribProf, at));
              handleRibs++;
            }
          } else handlePrint = [sw];
        }
      }
    }
    const lo = Math.min(handleParams.width, handleParams.thickness), hi = Math.max(handleParams.width, handleParams.thickness);
    sectionMm = [lo, hi];
    const fill = 2 * mold.castWallThickness;
    if (handleSweep && lo > fill + 1e-9) {
      handleWarning = `The handle is ${lo.toFixed(1)} mm at its thinnest. Walls of ${mold.castWallThickness.toFixed(1)} mm cast from both sides meet at about ${fill.toFixed(1)} mm, so the middle may still be liquid when the mug is drained. Thin it in HandleMaker, or expect a hollow handle.`;
    }
  }

  // ── Block extents in world (z, u), shared by both halves. ──
  let uMin = Infinity, uMax = -Infinity, hMax = 0;
  for (const r of outerRings) {
    for (let t = 0; t < rRes; t++) {
      const dx = r[t * 3] - c0x, dy = r[t * 3 + 1] - c0y;
      const u = dx * sx + dy * sy, h = dx * frameA.px + dy * frameA.py;
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); hMax = Math.max(hMax, Math.abs(h));
    }
  }
  if (handleSweep) for (const r of handleSweep.rings) for (const [, u, h] of r) { uMax = Math.max(uMax, u); hMax = Math.max(hMax, h); }

  const cavX0 = -zEnd, cavX1 = m;
  const wallH = hMax + m;
  const wt = mold.halvesWallThickness;
  const flangeW = mold.halvesFlangeWidth;
  const border = wt + flangeW;
  const floorT = mold.halvesPlateFloor;
  const natchR = Math.max(2, Math.min(mold.natchDiameter / 2, m / 2 - NATCH_EDGE));
  const natchH = Math.min(mold.natchHeight, seat);

  // Natches: Split 2-Pc's diagonal pairs, in world (z, u). Bumps on plaster L
  // at (low, near) and (high, far). On a box symmetric about the axis this
  // pattern also mates with ITSELF (each bump's mirror across the axis is a
  // dimple), which is what lets one plate serve both halves.
  const inset = Math.max(m / 2, natchR + NATCH_EDGE);
  const zLoN = -m + inset, zHiN = zEnd - inset;
  const uNear = uMin - m / 2, uFar = uMax + m / 2;
  const bumpsL: P2[] = [[zLoN, uNear], [zHiN, uFar]];
  const dimplesL: P2[] = [[zHiN, uNear], [zLoN, uFar]];

  const layoutFor = (cavY0: number, cavY1: number): MoldLayout => ({
    cavX0, cavX1, cavY0, cavY1, yc: (cavY0 + cavY1) / 2,
    px0: cavX0 - border, px1: cavX1 + border, py0: cavY0 - border, py1: cavY1 + border,
    seat, lipThk: floorT, plateThk: seat + floorT, wallH, wt,
    vw: Math.min(V_WIDTH, seamMaxVWidth(flangeW, V_CLEARANCE)), vh: V_HEIGHT, vclr: V_CLEARANCE,
    flangeW, domeR: natchR, domeH: natchH, seg: 48,
    openR: 0, coneYA: 0, coneYB: 0,
    sealDepth, clr,
  });

  /**
   * One half's kit. `ySign` = +1 for L (native frame A), −1 for R (frame B);
   * native Y = ySign·u, print (x, y) = (−z, −Y).
   */
  const buildHalf = (outer: Arc[], inner: Arc[], ySign: 1 | -1, pocketsW: P2[], domesW: P2[]) => {
    const toPrint = ([z, Y]: P2): P2 => [-z, -Y];
    const worldToPrint = ([z, u]: P2): P2 => [-z, -ySign * u];
    // y range of the block: print y = −ySign·u.
    const cavY0 = ySign > 0 ? -(uMax + m) : uMin - m;
    const cavY1 = ySign > 0 ? -(uMin - m) : uMax + m;
    const layout = layoutFor(cavY0, cavY1);

    // Master: the relief (skirt to the bed = −seat after the shift) + handle.
    const relief = translateMesh(rotate180Z(buildRelief(outer, inner), 0, 0), 0, 0, -seat);
    const handleMesh = handlePrint.length
      ? mergeMeshes(handlePrint.map((sw) => meshSweep(sw, (z, u, h) => [-z, -ySign * u, h])))
      : null;
    // End cap: closes the well end so the hollow holds ice water once the
    // walls are off and the half is turned cut-face up (Gary, 2026-10-12).
    // Shell-thick, on the straight run inside the collar; inset 0.1 so it laps
    // into the shell rather than sharing its skin, recessed CAP_RECESS from the
    // wall face so it never shares the shell's open-end plane.
    const capArc = outer[outer.length - 1].map(([, Y, Z]) => [-Y, Z - F] as P2);
    const capPoly = dedupeLoop(offsetPolygon(
      [...capArc, [capArc[capArc.length - 1][0], -seat], [capArc[0][0], -seat]], -0.1));
    const cap = extrudeSolid(capPoly, [], cavX0 + CAP_RECESS, cavX0 + CAP_RECESS + shell, MAP_YZ_X);
    const master = mergeMeshes(handleMesh ? [relief, cap, handleMesh] : [relief, cap]);
    const flags = new Float32Array(master.vertexCount);
    flags.set(undercutOf(outer, F));

    // ── Pocket outline, native (z, Y). Vase footprint at the parting plane =
    // the arcs' two endpoints per ring; the handle side is the one where
    // ySign·Y is larger (the handle sits at u > 0). ──
    const n = outer[0].length - 1;
    const e0: P2[] = outer.map((arc) => [arc[0][0], arc[0][1]]);
    const eN: P2[] = outer.map((arc) => [arc[n][0], arc[n][1]]);
    const mid = Math.floor(outer.length / 2);
    const zeroIsHandle = ySign * e0[mid][1] > ySign * eN[mid][1];
    const sideH = zeroIsHandle ? e0 : eN, sideO = zeroIsHandle ? eN : e0;
    // Closed footprint: handle side base → end, other side end → base. Each
    // side is de-duplicated on its own (a zero-width ledge repeats a point) so
    // the split back into sides below is by a known index.
    const dedupeRun = (run: P2[]): P2[] => run.filter((q, i) => i === 0 || Math.hypot(q[0] - run[i - 1][0], q[1] - run[i - 1][1]) > 1e-6);
    const sideHd = dedupeRun(sideH), sideOd = dedupeRun(sideO);
    const foot: P2[] = [...sideHd, ...sideOd.slice().reverse()];
    const off = offsetPolygon(foot, clr);
    const S = off.slice(0, sideHd.length);     // handle side, base → end
    const rest = off.slice(sideHd.length);      // other side, end → base

    let pocketNative: P2[] = [...S, ...rest];
    let islandNative: P2[] | null = null;
    if (handleSweep) {
      // Strap edges at the parting plane (profile ends, h = 0), pushed out by
      // the clearance; native (z, Y).
      const seg = HANDLE_SEG;
      const edge = (k0: number, k1: number): P2[] => handleSweep!.rings.map((r) => {
        const [z0, u0] = r[k0], [z1, u1] = r[k1];
        const dz = z0 - z1, du = u0 - u1, L = Math.hypot(dz, du) || 1;
        return [z0 + (dz / L) * clr, ySign * (u0 + (du / L) * clr)] as P2;
      });
      const E1 = edge(0, seg), E2 = edge(seg, 0);
      const r1 = outsideRun(E1, S), r2 = outsideRun(E2, S);
      if (r1 && r2) {
        const span = (r: { lo: Hit; hi: Hit }) => (r.hi.s + r.hi.st) - (r.lo.s + r.lo.st);
        const [outerRun, innerRun] = span(r1) >= span(r2) ? [r1, r2] : [r2, r1];
        pocketNative = [
          ...S.slice(0, outerRun.lo.s + 1), ...outerRun.pts, ...S.slice(outerRun.hi.s + 1), ...rest,
        ];
        islandNative = [...innerRun.pts, ...S.slice(innerRun.lo.s + 1, innerRun.hi.s + 1).reverse()];
      } else {
        handleError = handleError ?? 'The handle outline could not be joined to the vase outline for the plate pocket.';
      }
    }
    // Map to print and stop the pocket at the well wall's inner face.
    const pocket = dedupeLoop(clipToXMax(pocketNative.map(toPrint).map(([x, y]) => [-x, y] as P2), zEnd).map(([x, y]) => [-x, y] as P2));
    const island = islandNative ? dedupeLoop(islandNative.map(toPrint)) : null;

    // ── Plate: solid base slab + top slab (pocket + natch pockets) + finger
    // island + flange ridges + domes. ──
    const base = boxSolid(layout.px0, layout.py0, layout.px1, layout.py1, -seat - floorT, -seat);
    const topSlab = translateMesh(
      buildFloor([layout.px0, layout.py0, layout.px1, layout.py1], pocket,
        pocketsW.map(worldToPrint), natchR, natchH, seat + EMBED),
      0, 0, -seat - EMBED);
    const islandSolid = island && Math.abs(polyArea(island)) > 1 ? extrudeSolid(island, [], -seat - EMBED, 0) : null;
    const domes = domesW.map(worldToPrint).map(([x, y]) => buildDome(x, y, natchR, natchH, DOME_SEG));
    const plateParts = [base, topSlab, ...(islandSolid ? [islandSolid] : []), ...buildPlateRidges(layout), ...domes];
    const plate = mergeMeshes(plateParts);

    // ── Collar: wall boss around this half's well end, bore = the end arc
    // (print y, z = h) pushed out by the clearance. ──
    const endArc = outer[outer.length - 1].map(([, Y, Z]) => [-Y, Z - F] as P2);
    const bite: P2[] = endArc.map((pt, k) => {
      const prev = endArc[Math.max(0, k - 1)], next = endArc[Math.min(endArc.length - 1, k + 1)];
      let tx = next[0] - prev[0], ty = next[1] - prev[1];
      const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      // Outward = away from the arc's own chord midpoint.
      let nx = ty, ny = -tx;
      const cx = (endArc[0][0] + endArc[endArc.length - 1][0]) / 2;
      if (nx * (pt[0] - cx) + ny * pt[1] < 0) { nx = -nx; ny = -ny; }
      return [pt[0] + nx * clr, Math.max(0, pt[1] + ny * clr)];
    });
    if (bite[0][0] > bite[bite.length - 1][0]) bite.reverse();
    bite[0] = [bite[0][0], 0];
    bite[bite.length - 1] = [bite[bite.length - 1][0], 0];
    // From the arc's extremes, not its endpoints: a side that leans out over the
    // parting plane (an undercut, flagged elsewhere) must not fold the outline.
    let bMin = Infinity, bMax = -Infinity;
    for (const [y] of bite) { bMin = Math.min(bMin, y); bMax = Math.max(bMax, y); }
    const yL = bMin - COLLAR_BAND, yR = bMax + COLLAR_BAND;
    const collarPoly = dedupeLoop([[yL, 0], ...bite, [yR, 0], [yR, wallH], [yL, wallH]]);
    const collar = extrudeSolid(collarPoly, [], cavX0 - EMBED, cavX0 + layout.sealDepth, MAP_YZ_X);
    const wall = mergeMeshes([buildWall(layout, { collars: false, seams: ySign > 0 ? 'ridges' : 'grooves' }), collar]);

    // Plaster: block interior minus the half-vase (+ handle) above the plane.
    let envelope = 0;
    for (let i = 0; i + 1 < outer.length; i++) {
      const dx = outer[i + 1][0][0] - outer[i][0][0];
      envelope += (dx * (halfSectionArea(outer[i], F) + halfSectionArea(outer[i + 1], F))) / 2;
    }
    if (handleSweep) envelope += handleSweep.volume;
    const plasterVol = Math.max(0, (cavX1 - cavX0) * (cavY1 - cavY0) * wallH - envelope);
    const plaster = boxSolid(cavX0, cavY0, cavX1, cavY1, 0, wallH);

    const toP = (z: number, u: number, h: number): [number, number, number] => [-z, -ySign * u, h];
    const dbg: HalfDebug = {
      relief, cap, capPoly, handle: handleMesh, plate: plateParts,
      handleSolid: handleSweep ? meshSweep(handleSweep, toP) : null,
      // Strap centreline at the parting plane, print (x, y), visible stations only.
      strapLine: handleSweep
        ? handleSweep.rings.slice(handleSweep.stationFirst, handleSweep.stationFirst + handleSweep.stationArc.length)
          .map((r) => { const [x0, y0] = toP(r[0][0], r[0][1], 0), [x1, y1] = toP(r[HANDLE_SEG][0], r[HANDLE_SEG][1], 0); return [(x0 + x1) / 2, (y0 + y1) / 2] as P2; })
        : [],
    };
    return { master, flags, plate, plateParts, wall, plaster, plasterVol, layout, relief, handleMesh, pocket, island, dbg, outerPrint: outer.map((arc) => arc.map(([z, Y, Z]) => [-z, -Y, Z - F])) };
  };

  const L = buildHalf(outA, inA, 1, bumpsL, dimplesL);
  const R = buildHalf(outB, inB, -1, dimplesL, bumpsL);

  // ── One kit for both halves? Only if the R master IS the L master. ──
  let oneKit = !handleSweep;
  if (oneKit) {
    const near = (pa: number[][], pb: number[][]) => {
      let worst = 0;
      for (let k = 0; k < pa.length; k++) {
        const q = pb[k];
        worst = Math.max(worst, Math.hypot(pa[k][0] - q[0], pa[k][1] - q[1], pa[k][2] - q[2]));
      }
      return worst;
    };
    for (let i = 0; i < L.outerPrint.length && oneKit; i++) {
      const la = L.outerPrint[i], ra = R.outerPrint[i];
      const d = Math.min(near(la, ra), near(la, ra.slice().reverse()));
      if (d > SYMMETRY_TOL) oneKit = false;
    }
  }

  // ── Display: L assembly on the left, R on the right (shifted along −y/+y). ──
  const dyL = -L.layout.py1 - LAYOUT_GAP / 2;
  const dyR = -R.layout.py0 + LAYOUT_GAP / 2;
  // Wall 2 at L's base end: rotate R's well-end wall 180° about R's box
  // centre, then move it onto L's box. Likewise wall 1 at R's base end.
  const cxBox = (cavX0 + cavX1) / 2;
  const wall2AtL = translateMesh(rotate180Z(R.wall, cxBox, R.layout.yc), 0, L.layout.yc - R.layout.yc, 0);
  const wall1AtR = translateMesh(rotate180Z(L.wall, cxBox, L.layout.yc), 0, R.layout.yc - L.layout.yc, 0);
  const shiftX = -cxBox;
  // Display only: stand the plates on the ground grid (plate bottom at z = 0)
  // so the grid doesn't show through inside the mold. Exports keep assembly
  // coordinates and their own lifts.
  const dz = seat + floorT;
  const masters = mergeMeshes([translateMesh(L.master, shiftX, dyL, dz), translateMesh(R.master, shiftX, dyR, dz)]);
  const plates = mergeMeshes([translateMesh(L.plate, shiftX, dyL, dz), translateMesh(R.plate, shiftX, dyR, dz)]);
  const walls = mergeMeshes([
    translateMesh(L.wall, shiftX, dyL, dz), translateMesh(wall2AtL, shiftX, dyL, dz),
    translateMesh(R.wall, shiftX, dyR, dz), translateMesh(wall1AtR, shiftX, dyR, dz),
  ]);
  const plaster = mergeMeshes([translateMesh(L.plaster, shiftX, dyL, dz), translateMesh(R.plaster, shiftX, dyR, dz)]);
  const undercutFlags = new Float32Array(masters.vertexCount);
  undercutFlags.set(L.flags, 0);
  undercutFlags.set(R.flags, L.master.vertexCount);
  let hasUndercuts = false;
  for (let i = 0; i < undercutFlags.length; i++) if (undercutFlags[i] >= 0.999) { hasUndercuts = true; break; }

  return {
    style: 'splitHalves',
    masterL: L.master, masterR: R.master, plateL: L.plate, plateR: R.plate, wall1: L.wall, wall2: R.wall,
    masters, plates, walls, plaster, undercutFlags, hasUndercuts, oneKit,
    plasterVolumeMm3: L.plasterVol + R.plasterVol,
    masterStats: computeMeshStats(L.master),
    plateStats: computeMeshStats(L.plate),
    wallStats: computeMeshStats(L.wall),
    natchRadius: natchR,
    error: null,
    handle: placement && handleSweep ? { placement, sectionMm } : null,
    handleError, handleWarning,
    layout: {
      cavX0, cavX1, cavY0: L.layout.cavY0, cavY1: L.layout.cavY1, wallH, seat,
      plateThk: seat + floorT,
      plateW: L.layout.px1 - L.layout.px0, plateD: L.layout.py1 - L.layout.py0,
      masterLift: seat, plateLift: seat + floorT,
    },
    debug: {
      partsL: L.dbg, partsR: R.dbg, handleShell, handleRibs,
      pocketL: L.pocket, islandL: L.island, pocketR: R.pocket, islandR: R.island,
      bumpsL, dimplesL, wall2AtL, wall1AtR,
    },
  };
}
