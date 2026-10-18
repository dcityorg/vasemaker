/**
 * Split Thirds mold generator — the Split Halves idea with the plaster split
 * into THREE pieces (later four) by seams through the vase axis, 120° apart.
 *
 * Why: a piece pulls straight out along its own centre line, so at a seam the
 * vase wall already leans 30° the safe way (halves: 0°). Soft flutes, waves and
 * 3-/6-fold shapes that lock a halves mold at its seam release from thirds.
 * Design + Gary's decisions: local-docs/moldmaker-split-thirds-plan.md and the
 * line drawings linked there.
 *
 * Each piece is poured on its own, like a Split Halves half:
 *   - MASTER: one piece's slice of the vase + well, a hollow shell open on its
 *     cut faces, with skirts that drop VERTICALLY `seat` into the plate (parallel
 *     to the way the plate comes off). A cap closes the well end so the hollow
 *     holds ice water.
 *   - V PLATE: the piece's two parting faces meet at the vase axis at 120°, so
 *     the plate is a shallow valley whose faces rise 30°. Pocket for the skirts,
 *     natches, and HandleMaker's three flange V rings run round its edge — across
 *     the ends they bend over the valley's apex. Two legs under the walls carry
 *     it to the table. Gary prints it standing on its end (no stair-steps on the
 *     faces, no support under them).
 *   - TWO WALLS, as Split Halves: wall 1 = the well end + half of each side,
 *     wall 2 = the base end + the other halves, meeting mid-length at clip
 *     blocks with V seams. The side walls stand SQUARE to the V face (Gary's
 *     sketch, 2026-10-15), not vertical: less plaster, and in the assembled mold
 *     neighbouring pieces' side faces line up. All wall tops are flat at the
 *     plaster level so a straightedge strikes the pour off.
 *
 * Coordinates. NATIVE per piece: (z, s, t) — z the vase height, t along the
 * piece's centre line (its pull, "up" in the pour), s across. The plate's faces
 * are t = |s|·cot α (α = 180°/N): face A at s > 0, face B at s < 0. A seam is
 * face A of one piece and face B of the next. Every solid is built in native
 * coordinates and mapped to ASSEMBLY (X, Y, Z) = (−z, s, t) — a proper rotation
 * of the world frame, so the well end sits at low X as in Split Halves.
 */

import { ShapeUtils, Vector2 } from 'three';
import type { VaseParameters, VaseMesh } from '../types';
import { computeMeshStats, type MeshStats } from '../mesh-stats';
import { computeNormals } from '../normals';
import { offsetRingRadial, mergeMeshes, type Ring } from './ring-mesh';
import { tanDeg, prepareVaseParams, buildOuterRings, buildCavityRings, clampCavityUnderRim } from './mold-generator';
import { MeshBuilder, ensureOutward, extrudeSolid, triangulateFace, dedupeLoop, ensureCCW, ensureCW, weldMesh, MAP_YZ_X, type P2 } from '../handle/mesh3';
import { buildDome, seamBandPositions, seamMaxVWidth } from '../handle/mold-parts';
import { undercutOf } from './split-two-piece-generator';
import { offsetPolygon, clipToXMax, clipToXMin, removeSpikes, signedDist, loftSolid } from './split-halves-generator';
import type { MoldParameters } from './mold-types';

type V3 = [number, number, number];
/** One ring's slice inside a piece's wedge: points [z, s, t] from face B to face A. */
type Arc3 = V3[];

/** Feature-into-host overlap for slicer union (HandleMaker's EMBED). */
const EMBED = 0.2;
/** As engine/handle/mold-parts.ts: clip flange thickness, seam block length, tab lip. */
const FLANGE_T = 3;
const TAB_T = 4;
const TAB_LIP = 0.3;
/** Plaster kept round a natch, mm (Split Halves' NATCH_EDGE). */
const NATCH_EDGE = 4;
/** Plan fold-back (mm) below which a row still counts as releasing. */
const FOLD_TOL = 0.02;
const DOME_SEG = 48;
const DOME_RINGS = 8;
/** The well-end cap stops this short of the wall face (Split Halves' CAP_RECESS). */
const CAP_RECESS = 0.2;
/** Wall/plate seam V numbers — HandleMaker's proven defaults. */
const V_WIDTH = 2;
const V_HEIGHT = 1.4;
const V_CLEARANCE = 0.2;
/** Max deviation (mm) between pieces still treated as one kit. */
const SYMMETRY_TOL = 0.05;
/** Gap between kits in the display, mm. */
const LAYOUT_GAP = 30;
/** Width of each plate leg, mm. */
const LEG_W = 4;
/** The plug's locking ring (Gary 2026-10-17): 4 mm wide, 1.5 mm proud, ROUNDED
 *  crest (a flat top's two corners are what chips off a plaster ridge). One
 *  profile drives the master's ring (→ groove in the pieces) and the cup wall's
 *  groove (→ ridge on the plug). */
const RING_W = 4;
const RING_H = 1.5;
/** The master and the V plate are ONE print (Gary 2026-10-17: plaster crept
 *  into the seam between them and gripped the master). Under the master's hollow,
 *  two water cavities either side of a GAP that runs the full length up to
 *  HINGE_SKIN under the master's outer face — so flexing the base hinges the
 *  master's arch too; CAV_WALL each side of the gap. The plate's top layer is
 *  TOP_SKIN under the faces.
 *  2026-10-18: with the plug the band is HOLLOW and open into the master, so
 *  the cavities and the gap run through it (it was a 30 mm solid block across
 *  the hinge); past each end leg the plate is only a clip lip. The gap is
 *  OPEN through the faces at both ends and the ridges stop at it: the halves
 *  swing about the crown skin, ~25 mm above the V's bottom, so anything
 *  bridging the gap down there is a strut that holds the V shut. The four
 *  flex slits are gone (Gary: next to the legs they did nothing, and they let
 *  the push bend the sides instead of opening the middle). */
const GAP = 2;
const CAV_WALL = 2;
const HINGE_SKIN = 2;
const TOP_SKIN = 2;
/** Plug cup: the ledge the bottom disk rests on, width and thickness, mm. */
const LEDGE_W = 3;
const LEDGE_T = 2;

/** Height of the ring's rounded crest at u from its centre line (0 outside). */
function ringBump(u: number): number {
  const a = RING_W / 2;
  if (Math.abs(u) >= a) return 0;
  const R = (a * a + RING_H * RING_H) / (2 * RING_H);
  return Math.sqrt(R * R - u * u) - (R - RING_H);
}
/** Stations across the ring, centre-relative, ends at the band surface. */
const RING_US = [-2, -1.6, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2, 1.6, 2].map((f) => (f * RING_W) / 4);

/** One natch, on every seam: (z, ρ) with ρ the distance from the vase axis along the face. */
export interface ThirdsNatch { z: number; rho: number; r: number }

export interface ThirdsKit {
  /** Which piece (0-based) this kit pours; with one kit, every piece. */
  piece: number;
  /** Assembly coordinates (plate faces meet at Z = 0). The master and plate
   *  are ONE print since 2026-10-17; `master` / `plate` split it for display. */
  master: VaseMesh;
  plate: VaseMesh;
  /** The one print: master + plate, assembly coordinates. */
  part: VaseMesh;
  wellWall: VaseMesh;
  /** Print orientations, bottom on the bed: the part lying down (the V's
   *  underside on the bed, Gary prints it this way with adaptive layers). */
  partPrint: VaseMesh;
  wellWallPrint: VaseMesh;
  /** The base-end wall this kit pours with (its boss fits this piece's foot disc). */
  baseWall: VaseMesh;
  baseWallPrint: VaseMesh;
  plasterVolumeMm3: number;
}

/**
 * The plaster PLUG's own mold (Gary 2026-10-17): a small cup — a bottom disk
 * shaped like the vase bottom (foot ring + recessed middle) resting on a ledge
 * inside two clip-together walls. Each wall carries the groove that gives the
 * plug its ridge. Print coords, each on the bed.
 */
export interface ThirdsFoot {
  /** The bottom disk, recess up. */
  plate: VaseMesh;
  /** Cup walls A and B, standing on their ledge. Each has V ridges on one
   *  clip flange and grooves on the other — A ridges at +x, B at −x — so a
   *  ridge end meets a groove end at both seams. */
  wall: VaseMesh;
  wallB: VaseMesh;
  /** B is A turned half a turn (a bottom outline that looks the same after a
   *  half turn — round, oval, rectangle): one wall STL, printed twice. */
  wallsSame: boolean;
  plateStats: MeshStats;
  wallStats: MeshStats;
  /** One plug. */
  plasterVolumeMm3: number;
  plugHeight: number;
}

export interface SplitThirdsMoldMeshes {
  style: 'splitThirds';
  pieceCount: number;
  /** One kit (poured N times) when every piece is the same, else one per piece. */
  kits: ThirdsKit[];
  oneKit: boolean;
  /** One base wall serves every kit (no foot, or one kit). */
  sharedBaseWall: boolean;
  baseWall: VaseMesh;
  baseWallPrint: VaseMesh;
  /** Display: the kits side by side, plates standing on the grid. */
  masters: VaseMesh;
  plates: VaseMesh;
  walls: VaseMesh;
  plaster: VaseMesh;
  undercutFlags: Float32Array;
  hasUndercuts: boolean;
  /** Plaster for ALL pieces, mm³. */
  plasterVolumeMm3: number;
  /** The one print (master + plate), as exported. */
  masterStats: MeshStats;
  wallStats: MeshStats;
  baseWallStats: MeshStats;
  natches: ThirdsNatch[];
  /** Null when the master's arch can hinge (slot cut, or Master Wall ≤ the skin); else why not. */
  hingeNote: string | null;
  natchNote: string | null;
  foot: ThirdsFoot | null;
  error: string | null;
  layout: {
    /** Plaster reach along each face (to the side wall) and the plaster level. */
    rW: number; H: number;
    /** Plaster extent along the vase (native z). */
    zLo: number; zHi: number;
    seat: number;
    /** Plate size: length (along the vase), width (across), height (apex bottom to edge top). */
    plateL: number; plateW: number; plateH: number;
    /** Wall height above the plate apex. */
    wallH: number;
  };
  debug: {
    /** Per kit: the separate solids, assembly coords. */
    parts: { relief: VaseMesh; cap: VaseMesh; disc: VaseMesh[]; cavWalls: VaseMesh[]; plate: VaseMesh[]; wellWall: VaseMesh[]; baseWall: VaseMesh[] }[];
    /** Per kit, native plan (z, s): the two water cavities (holes in the plate's body). */
    cavities: P2[][][];
    /** The gap's half-width; the top layer's vertical skin under the faces. */
    gap: number;
    skinV: number;
    tBed: number;
    hinge: boolean;
    baseWallParts: VaseMesh[];
    /** Per kit: the pocket outline, plan (z, s). */
    pockets: P2[][];
    /** Per kit: outer arcs and (un-slotted) hollow arcs, native. */
    outer: Arc3[][];
    inner: Arc3[][];
    /** Per kit, with the plug: the band's outer arc at 9 stations from z = zLo to 0; else empty. */
    band: Arc3[][];
    /** z of the end legs' outer faces (past them only the clip lip). */
    zLeg: [number, number];
    alpha: number;
    seat: number;
    clr: number;
    zEnd: number;
    sealDepth: number;
    /** Plaster starts here (the counterbore mouth with the foot on). */
    zB0: number;
    /** Plug + cup, cup coords (plan = world turned over about x; z = 0 the plug's vase face). */
    foot: { plugH: number; zRing: number; recessDepth: number; zDisk: number; zWall0: number; disk: VaseMesh[]; wallA: VaseMesh[]; wallB: VaseMesh[]; plugOutline: P2[]; base: P2[] } | null;
  };
}

// ── small vector helpers ─────────────────────────────────────────────────────

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): V3 => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };

function polyArea(p: P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += x1 * y2 - x2 * y1; }
  return s / 2;
}

function empty(): VaseMesh {
  return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), vertexCount: 0, triangleCount: 0 };
}

/** Apply a point map to a mesh (copy), recompute normals, and fix the winding
 *  (the native → assembly map is a reflection of native storage coordinates). */
function mapMesh(m: VaseMesh, f: (x: number, y: number, z: number) => V3): VaseMesh {
  const positions = new Float32Array(m.positions.length);
  for (let i = 0; i < m.positions.length; i += 3) {
    const [x, y, z] = f(m.positions[i], m.positions[i + 1], m.positions[i + 2]);
    positions[i] = x; positions[i + 1] = y; positions[i + 2] = z;
  }
  const out: VaseMesh = { ...m, positions, indices: new Uint32Array(m.indices), normals: new Float32Array(m.normals.length) };
  computeNormals(out.positions, out.indices, out.normals);
  return ensureOutward(out);
}

const toAsm = (m: VaseMesh) => mapMesh(m, (z, s, t) => [-z, s, t]);

function translate(m: VaseMesh, dx: number, dy: number, dz: number): VaseMesh {
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < positions.length; i += 3) { positions[i] += dx; positions[i + 1] += dy; positions[i + 2] += dz; }
  return { ...m, positions, normals: new Float32Array(m.normals) };
}

function zMin(m: VaseMesh): number {
  let lo = Infinity;
  for (let i = 2; i < m.positions.length; i += 3) lo = Math.min(lo, m.positions[i]);
  return Number.isFinite(lo) ? lo : 0;
}

// ── cutting a ring by a piece's wedge ────────────────────────────────────────

interface Wedge { phi: number; alpha: number; bx: number; by: number; qx: number; qy: number; ca: number; sa: number }

function wedgeOf(phi: number, alpha: number): Wedge {
  // s along q = b rotated +90°: (X, Y, Z) = (−z, s, t) is then a proper rotation.
  return { phi, alpha, bx: Math.cos(phi), by: Math.sin(phi), qx: -Math.sin(phi), qy: Math.cos(phi), ca: Math.cos(alpha), sa: Math.sin(alpha) };
}

/** Point on face A (sgn +1, s > 0) or face B (−1) at distance ρ from the axis, (s, t). */
const faceAt = (w: Wedge, sgn: number, rho: number): P2 => [sgn * rho * w.sa, rho * w.ca];
/** Normal into the plaster for face A (+1) or B (−1), (s, t). */
const faceN = (w: Wedge, sgn: number): P2 => [-sgn * w.ca, w.sa];

/**
 * The part of a ring inside the wedge, resampled to n+1 points evenly in
 * ring-index space (so consecutive rings pair up point for point) — Split
 * 2-Pc's cutArc with "inside" = inside both seam planes. The endpoints are the
 * exact seam crossings: each is interpolated on the plane it actually crosses,
 * then snapped onto that face. Index 0 is on face B, index n on face A.
 */
function cutWedge(ring: Ring, rRes: number, cx: number, cy: number, w: Wedge, n: number): Arc3 | null {
  const gA = new Float64Array(rRes), gB = new Float64Array(rRes);
  let tMin = 0;
  const g = (i: number) => Math.min(gA[i], gB[i]);
  for (let i = 0; i < rRes; i++) {
    const dx = ring[i * 3] - cx, dy = ring[i * 3 + 1] - cy;
    const s = dx * w.qx + dy * w.qy, t = dx * w.bx + dy * w.by;
    gA[i] = -w.ca * s + w.sa * t;
    gB[i] = w.ca * s + w.sa * t;
    if (g(i) < g(tMin)) tMin = i;
  }
  if (g(tMin) >= 0) return null;
  /** Fraction from a toward b where the plane that is negative at `out` crosses zero. */
  const frac = (a: number, b: number, out: number) => {
    const arr = gA[out] <= gB[out] ? gA : gB;
    return arr[a] / (arr[a] - arr[b]);
  };
  let tIn = NaN;
  for (let k = 0; k < rRes; k++) {
    const a = (tMin + k) % rRes, b = (a + 1) % rRes;
    if (g(a) < 0 && g(b) >= 0) { tIn = (tMin + k) + frac(a, b, a); break; }
  }
  let tOut = NaN;
  for (let k = 0; k < rRes; k++) {
    const b = ((tMin - k) % rRes + rRes) % rRes, a = (b - 1 + rRes) % rRes;
    if (g(a) >= 0 && g(b) < 0) { tOut = (tMin - k - 1) + frac(a, b, b); break; }
  }
  if (Number.isNaN(tIn) || Number.isNaN(tOut)) return null;
  while (tOut <= tIn) tOut += rRes;
  if (tOut - tIn > rRes) tOut -= rRes;

  const arc: Arc3 = [];
  for (let i = 0; i <= n; i++) {
    const tf = tIn + ((tOut - tIn) * i) / n;
    const i0 = Math.floor(tf), fr = tf - i0;
    const a = ((i0 % rRes) + rRes) % rRes, b = (a + 1) % rRes;
    const x = ring[a * 3] + (ring[b * 3] - ring[a * 3]) * fr - cx;
    const y = ring[a * 3 + 1] + (ring[b * 3 + 1] - ring[a * 3 + 1]) * fr - cy;
    const z = ring[a * 3 + 2] + (ring[b * 3 + 2] - ring[a * 3 + 2]) * fr;
    arc.push([z, x * w.qx + y * w.qy, x * w.bx + y * w.by]);
  }
  if (arc[0][1] > arc[n][1]) arc.reverse();
  // Snap the ends onto their faces — kill float noise.
  for (const [i, sgn] of [[0, -1], [n, 1]] as const) {
    const [z, s, t] = arc[i];
    const rho = sgn * s * w.sa + t * w.ca;
    const [fs, ft] = faceAt(w, sgn, rho);
    arc[i] = [z, fs, ft];
  }
  return arc;
}

/**
 * As cutWedge, but keeping the ring's own vertices instead of resampling:
 * the crossing points plus every vertex inside the wedge. A radial offset of a
 * ring keeps each vertex on its own ray from the axis, so which vertices are
 * inside — and so the point count — is the same at every offset. The plug band
 * uses this so the pieces' bore and the plug cup (built from the whole ring)
 * are the same polygon, not two samplings of it (on a sharp teardrop the two
 * samplings differed by 0.6 mm).
 */
function cutWedgeKeep(ring: Ring, rRes: number, cx: number, cy: number, w: Wedge): Arc3 | null {
  const gA = new Float64Array(rRes), gB = new Float64Array(rRes);
  const P: V3[] = [];
  for (let i = 0; i < rRes; i++) {
    const dx = ring[i * 3] - cx, dy = ring[i * 3 + 1] - cy;
    const s = dx * w.qx + dy * w.qy, t = dx * w.bx + dy * w.by;
    gA[i] = -w.ca * s + w.sa * t;
    gB[i] = w.ca * s + w.sa * t;
    P.push([ring[i * 3 + 2], s, t]);
  }
  // Inside by ANGLE from the seam planes (g / r), which a radial offset does
  // not change — so the decision, and the point count, is the same at every
  // offset. A vertex within 1e-3 rad of a seam counts as outside: its crossing
  // would land on top of it and make a zero-length edge.
  const inside = (i: number) => {
    const r = Math.hypot(P[i][1], P[i][2]);
    return r > 1e-9 && Math.min(gA[i], gB[i]) / r > 1e-3;
  };
  let start = -1;
  for (let i = 0; i < rRes; i++) if (inside(i) && !inside((i - 1 + rRes) % rRes)) { if (start >= 0) return null; start = i; }
  if (start < 0) return null;
  const cross = (a: number, b: number): V3 => {
    // a inside, b outside: the plane that is negative at b.
    const arr = gA[b] <= gB[b] ? gA : gB;
    const f = arr[a] / (arr[a] - arr[b]);
    return [P[a][0] + (P[b][0] - P[a][0]) * f, P[a][1] + (P[b][1] - P[a][1]) * f, P[a][2] + (P[b][2] - P[a][2]) * f];
  };
  const run: number[] = [];
  for (let k = 0; k < rRes && inside((start + k) % rRes); k++) run.push((start + k) % rRes);
  const i0 = run[0], i1 = run[run.length - 1];
  const arc: Arc3 = [cross(i0, (i0 - 1 + rRes) % rRes), ...run.map((i) => P[i]), cross(i1, (i1 + 1) % rRes)];
  if (arc[0][1] > arc[arc.length - 1][1]) arc.reverse();
  const n = arc.length - 1;
  for (const [i, sgn] of [[0, -1], [n, 1]] as const) {
    const [z, s2, t2] = arc[i];
    const rho = sgn * s2 * w.sa + t2 * w.ca;
    const [fs, ft] = faceAt(w, sgn, rho);
    arc[i] = [z, fs, ft];
  }
  return arc;
}

/**
 * A hollow arc (face B → face A) with the hinge slot: the arc from face B to
 * s = −h, up `depth`, across to s = +h, down, and on to face A — each side
 * resampled to nSide segments so every arc has the same point count (the
 * relief pairs arcs point for point). Null if the arc does not cross ±h once
 * from its own side.
 */
/** Where a hollow arc crosses s = −h (from face B) and s = +h (from face A),
 *  as fractional indices and points; null if it does not. */
function notchBase(arc: Arc3, h: number): { fl: number; fr: number; L: V3; R: V3 } | null {
  const n = arc.length - 1;
  let fl = -1, fr = -1;
  for (let j = 0; j < n; j++) if (arc[j][1] < -h && arc[j + 1][1] >= -h) { fl = j + (-h - arc[j][1]) / (arc[j + 1][1] - arc[j][1]); break; }
  for (let j = n; j > 0; j--) if (arc[j][1] > h && arc[j - 1][1] <= h) { fr = j - (arc[j][1] - h) / (arc[j][1] - arc[j - 1][1]); break; }
  if (fl < 0 || fr < 0 || fr <= fl) return null;
  const L = arcAt(arc, fl), R = arcAt(arc, fr);
  L[1] = -h; R[1] = h;
  return { fl, fr, L, R };
}
function arcAt(arc: Arc3, f: number): V3 {
  const n = arc.length - 1;
  const i0 = Math.min(n - 1, Math.max(0, Math.floor(f))), u = f - i0;
  const a = arc[i0], b = arc[i0 + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
function notchArc(arc: Arc3, h: number, depth: number, nSide: number): Arc3 | null {
  const nb = notchBase(arc, h);
  if (!nb) return null;
  const { fl, fr, L, R } = nb;
  const n = arc.length - 1;
  const out: Arc3 = [];
  for (let i = 0; i < nSide; i++) out.push(arcAt(arc, (fl * i) / nSide));
  out.push(L);
  out.push([L[0], -h, L[2] + depth], [R[0], h, R[2] + depth]);
  for (let i = 0; i <= nSide; i++) out.push(i === 0 ? R : arcAt(arc, fr + ((n - fr) * i) / nSide));
  return out;
}

/** A polyline (z, v) clipped to z0 ≤ z ≤ z1 — read at z0, every point
 *  strictly between (in increasing z), read at z1. The arcs' ends are not all
 *  at one z on a non-round vase, so the line's own ends may fall inside. */
function clipLine(line: P2[], z0: number, z1: number): P2[] | null {
  if (z1 <= z0 + 0.1) return null;
  const out: P2[] = [[z0, lineAt(line, z0)]];
  for (const [z, v] of line) if (z > out[out.length - 1][0] + 1e-3 && z < z1 - 1e-3) out.push([z, v]);
  out.push([z1, lineAt(line, z1)]);
  return out;
}

/** Topmost t (and its z) where an arc crosses s = sT; −∞ if it never does. */
function crossAtS(arc: Arc3, sT: number): { t: number; z: number } {
  let best = { t: -Infinity, z: arc[0][0] };
  for (let j = 0; j + 1 < arc.length; j++) {
    const [z1, s1, t1] = arc[j], [z2, s2, t2] = arc[j + 1];
    if ((s1 - sT) * (s2 - sT) <= 0 && s1 !== s2) {
      const f = (sT - s1) / (s2 - s1);
      const t = t1 + (t2 - t1) * f;
      if (t > best.t) best = { t, z: z1 + (z2 - z1) * f };
    }
  }
  return best;
}
const tinAt = (arc: Arc3, sT: number) => crossAtS(arc, sT).t;

/** Shortest distance from native p to the master's outer surface (the quads
 *  between consecutive outer arcs, each two triangles; Ericson's closest point). */
function distToOuter(outer: Arc3[], p: V3): number {
  const tri = (A: V3, B: V3, C: V3): number => {
    const ab = sub(B, A), ac = sub(C, A), ap = sub(p, A);
    const d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return Math.hypot(...ap);
    const bp = sub(p, B), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return Math.hypot(...bp);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return Math.hypot(ap[0] - v * ab[0], ap[1] - v * ab[1], ap[2] - v * ab[2]); }
    const cp = sub(p, C), d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return Math.hypot(...cp);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return Math.hypot(ap[0] - w * ac[0], ap[1] - w * ac[1], ap[2] - w * ac[2]); }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return Math.hypot(bp[0] - w * (C[0] - B[0]), bp[1] - w * (C[1] - B[1]), bp[2] - w * (C[2] - B[2])); }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
    return Math.hypot(ap[0] - ab[0] * v - ac[0] * w, ap[1] - ab[1] * v - ac[1] * w, ap[2] - ab[2] * v - ac[2] * w);
  };
  let best = Infinity;
  for (let i = 0; i + 1 < outer.length; i++) {
    if (Math.abs(outer[i][0][0] - p[0]) > 10) continue;
    for (let j = 0; j + 1 < outer[i].length; j++) {
      const a = outer[i][j], b = outer[i][j + 1], c = outer[i + 1][j + 1], d = outer[i + 1][j];
      if (Math.abs(a[1] - p[1]) > 12) continue;
      best = Math.min(best, tri(a, b, c), tri(a, c, d));
    }
  }
  return best;
}
/** A polyline (z, v) read at z (clamped to its ends). */
function lineAt(line: P2[], z: number): number {
  if (z <= line[0][0]) return line[0][1];
  for (let i = 0; i + 1 < line.length; i++) {
    const [z1, v1] = line[i], [z2, v2] = line[i + 1];
    if (z <= z2) return z2 > z1 ? v1 + ((v2 - v1) * (z - z1)) / (z2 - z1) : v2;
  }
  return line[line.length - 1][1];
}
const zAtS = (arc: Arc3, sT: number) => crossAtS(arc, sT).z;

// ── the master ───────────────────────────────────────────────────────────────

/**
 * The relief, Split 2-Pc's buildRelief on a V: outer and inner arcs lofted, a
 * base wall, a top annulus, and skirts dropping `seat` straight down (−t) from
 * each cut edge. Their bottoms lie on the two faces shifted down by `seat`, so
 * the bed is two planar strips that meet along the apex line AO–AI under the
 * base wall. Every face walks each shared edge opposite to its neighbour.
 * `openBase`: no base wall — the base end is an annulus like the top, so the
 * hollow runs on out of it (inner[0] must then sit at outer[0]'s z).
 */
function buildVRelief(outer: Arc3[], inner: Arc3[], seat: number, openBase = false): VaseMesh {
  const b = new MeshBuilder();
  const P: V3[] = [];
  const v = (p: V3) => { P.push(p); return b.vertex(p[0], p[1], p[2]); };
  // Inner arcs may carry more points than the outer (the hinge slot), so
  // each side indexes its own.
  const n = outer[0].length - 1, ni = inner[0].length - 1;
  const O = outer.map((arc) => arc.map(v));
  const I = inner.map((arc) => arc.map(v));
  const bed = (p: V3) => v([p[0], p[1], p[2] - seat]);
  const Ob0 = outer.map((arc) => bed(arc[0]));
  const ObN = outer.map((arc) => bed(arc[n]));
  const Ib0 = inner.map((arc) => bed(arc[0]));
  const IbN = inner.map((arc) => bed(arc[ni]));
  const AO = openBase ? -1 : v([outer[0][0][0], 0, -seat]);
  const AI = openBase ? -1 : v([inner[0][0][0], 0, -seat]);
  const L = O.length - 1, M = I.length - 1;

  for (let i = 0; i < L; i++) {
    for (let j = 0; j < n; j++) b.quad(O[i][j], O[i][j + 1], O[i + 1][j + 1], O[i + 1][j]);
    b.quad(O[i][0], O[i + 1][0], Ob0[i + 1], Ob0[i]);
    b.quad(O[i][n], ObN[i], ObN[i + 1], O[i + 1][n]);
  }
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < ni; j++) b.quad(I[i][j], I[i + 1][j], I[i + 1][j + 1], I[i][j + 1]);
    b.quad(I[i][0], Ib0[i], Ib0[i + 1], I[i + 1][0]);
    b.quad(I[i][ni], I[i + 1][ni], IbN[i + 1], IbN[i]);
  }

  const loop = (ids: number[], proj: (p: V3) => P2) => {
    const pts = ids.map((id) => proj(P[id]));
    const area = (q: P2[]) => {
      let s = 0;
      for (let k = 0; k < q.length; k++) { const [x1, y1] = q[k], [x2, y2] = q[(k + 1) % q.length]; s += x1 * y2 - x2 * y1; }
      return s;
    };
    const loopSign = Math.sign(area(pts));
    // Earcut drops exactly-collinear points (see buildRelief); jitter the 2-D
    // projection only.
    const jit = pts.map(([x, y], k): P2 => [x + 1e-5 * Math.cos(k * 2.39996), y + 1e-5 * Math.sin(k * 2.39996)]);
    const tris = ShapeUtils.triangulateShape(jit.map(([x, y]) => new Vector2(x, y)), []);
    for (const [i, j, k] of tris) {
      const s = Math.sign(area([jit[i], jit[j], jit[k]]));
      if (s === 0) continue;
      if (s === loopSign) b.tri(ids[i], ids[j], ids[k]);
      else b.tri(ids[i], ids[k], ids[j]);
    }
  };
  const st = (p: V3): P2 => [p[1], p[2]];
  const zs = (p: V3): P2 => [p[0], p[1]];

  loop([...O[L], ObN[L], IbN[M], ...I[M].slice().reverse(), Ib0[M], Ob0[L]], st);            // top annulus
  if (openBase) {
    loop([Ob0[0], Ib0[0], ...I[0], IbN[0], ObN[0], ...O[0].slice().reverse()], st);         // base annulus
    loop([...Ob0, ...Ib0.slice().reverse()], zs);                                            // bed, face B
    loop([...IbN, ...ObN.slice().reverse()], zs);                                            // bed, face A
  } else {
    loop([...O[0].slice().reverse(), Ob0[0], AO, ObN[0]], st);                               // base wall
    loop([...I[0], IbN[0], AI, Ib0[0]], st);                                                 // hollow ceiling
    loop([...Ob0, ...Ib0.slice().reverse(), AI, AO], zs);                                    // bed, face B
    loop([AI, ...IbN, ...ObN.slice().reverse(), AO], zs);                                    // bed, face A
  }

  return ensureOutward(b.build());
}

/** Undercut factor per outer-arc point: the piece pulls along +t, so a normal
 *  pointing down locks; a point outside the wedge (texture dipping through a
 *  seam) locks outright. Aligned with buildVRelief's first vertices. */
function undercutThirds(outer: Arc3[], w: Wedge): Float32Array {
  const f = undercutOf(outer, -1e9);
  const n = outer[0].length - 1;
  for (let i = 0; i < outer.length; i++) {
    for (let j = 1; j < n; j++) {
      const [, s, t] = outer[i][j];
      const g = Math.min(-w.ca * s + w.sa * t, w.ca * s + w.sa * t);
      if (g < -0.05) f[i * (n + 1) + j] = 1;
    }
    // The pull is horizontal, so the exact test is per row: walking the arc
    // from face B to face A, s must never turn back. A fold is flagged from
    // either side (the lip that overhangs and the stretch it hides). The 3-D
    // normal test above misses these on a twisted design — the helix tilts the
    // normal toward z and hides a 15° plan lean under its threshold (ribbed
    // tumbler, 2026-10-16: 0.26 mm folds at the seams, nothing painted).
    const back = new Float64Array(n + 1);
    let hiS = -Infinity;
    for (let j = 0; j <= n; j++) { hiS = Math.max(hiS, outer[i][j][1]); back[j] = hiS - outer[i][j][1]; }
    let loS = Infinity;
    for (let j = n; j >= 0; j--) {
      loS = Math.min(loS, outer[i][j][1]);
      const b = Math.max(back[j], outer[i][j][1] - loS);
      const k = i * (n + 1) + j;
      f[k] = Math.max(f[k], Math.max(0, Math.min(1, (b - FOLD_TOL) / 0.08)));
    }
  }
  return f;
}

// ── the V plate ──────────────────────────────────────────────────────────────

/** Insert a point wherever an edge crosses s = 0, so no boundary edge spans the crease. */
function splitAtCrease(loop: P2[]): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    out.push(a);
    if ((a[1] > 1e-9 && b[1] < -1e-9) || (a[1] < -1e-9 && b[1] > 1e-9)) {
      const f = a[1] / (a[1] - b[1]);
      out.push([a[0] + (b[0] - a[0]) * f, 0]);
    }
  }
  return out;
}

/** Earcut a plan region, then split every triangle that straddles s = 0 there
 *  (crossing vertices shared per edge, so no T-junctions). Returns the points
 *  (loops first, in order) and the triangles, each on one face of the V. */
function creasedCap(o: P2[], hs: P2[][]): { pts: P2[]; tris: number[][] } {
  const { points, tris } = triangulateFace(o, hs);
  const pts = points.slice();
  const key = new Map<string, number>();
  const cross = (i: number, j: number): number => {
    const k = i < j ? `${i},${j}` : `${j},${i}`;
    let id = key.get(k);
    if (id === undefined) {
      const a = pts[i], b = pts[j];
      const f = a[1] / (a[1] - b[1]);
      id = pts.length;
      pts.push([a[0] + (b[0] - a[0]) * f, 0]);
      key.set(k, id);
    }
    return id;
  };
  const side = (i: number) => (pts[i][1] > 1e-9 ? 1 : pts[i][1] < -1e-9 ? -1 : 0);
  const out: number[][] = [];
  for (const tri of tris) {
    const sg = tri.map(side);
    if (!(sg.includes(1) && sg.includes(-1))) { out.push(tri); continue; }
    // Rotate so the special vertex is first: the zero one, else the lone sign.
    let r = sg.indexOf(0);
    if (r < 0) r = sg.filter((x) => x === 1).length === 1 ? sg.indexOf(1) : sg.indexOf(-1);
    const [a, b, c] = [tri[r], tri[(r + 1) % 3], tri[(r + 2) % 3]];
    if (side(a) === 0) {
      const x = cross(b, c);
      out.push([a, b, x], [a, x, c]);
    } else {
      const x1 = cross(a, b), x2 = cross(c, a);
      out.push([a, x1, x2], [x1, b, c], [x1, c, x2]);
    }
  }
  return { pts, tris: out };
}

/**
 * A slab over a plan region (z, s) whose top and bottom are height fields t(s)
 * with a crease at s = 0 (the V), and VERTICAL side walls. `holes` go right
 * through; `blind` holes are in the top only — `extra` closes them (the natch
 * bowls) before the weld.
 */
function creasedSlab(outer: P2[], holes: P2[][], topT: (s: number) => number, botT: (s: number) => number, blind: P2[][] = [], extra?: (b: MeshBuilder) => void): VaseMesh {
  const o = ensureCCW(dedupeLoop(splitAtCrease(outer)));
  const hs = holes.map((h) => ensureCW(dedupeLoop(splitAtCrease(h))));
  const bl = blind.map((h) => ensureCW(dedupeLoop(h)));
  const top = creasedCap(o, [...hs, ...bl]);
  const bot = creasedCap(o, hs);
  const mb = new MeshBuilder();
  const T = top.pts.map(([z, s]) => mb.vertex(z, s, topT(s)));
  const B = bot.pts.map(([z, s]) => mb.vertex(z, s, botT(s)));
  for (const [a, b, c] of top.tris) mb.tri(T[a], T[b], T[c]);
  for (const [a, b, c] of bot.tris) mb.tri(B[a], B[c], B[b]);
  // The outer loop and the through holes come first, in the same order, in both caps.
  let base = 0;
  for (const lp of [o, ...hs]) {
    for (let i = 0; i < lp.length; i++) {
      const j = (i + 1) % lp.length;
      mb.quad(B[base + i], B[base + j], T[base + j], T[base + i]);
    }
    base += lp.length;
  }
  extra?.(mb);
  return ensureOutward(weldMesh(mb.build()));
}

/**
 * Sweep a profile (u outward, h up) along a polyline whose segments each carry
 * their own frame (o outward, n up). At a vertex the section is the bisecting
 * plane (a miter); because each frame is the previous one rotated about the
 * bend, a point keeps its (u, h) on both sides — so ridges and grooves built
 * from one path always line up, including where the path bends over the V's
 * apex. Open paths get square ends with caps.
 */
function framedSweep(V: V3[], segs: { o: V3; n: V3 }[], cs: P2[], closed: boolean): VaseMesh {
  const b = new MeshBuilder();
  const prof = ensureCCW(dedupeLoop(cs));
  const nv = V.length, ns = closed ? nv : nv - 1;
  const dir = (k: number) => norm(sub(V[(k + 1) % nv], V[k]));
  const secs = V.map((p, k) => {
    const hasIn = closed || k > 0, hasOut = closed || k < nv - 1;
    let f = segs[Math.min(k, ns - 1)], d1: V3 = [0, 0, 0], kIn = -1;
    if (hasIn) { kIn = (k - 1 + ns) % ns; f = segs[kIn]; d1 = dir(kIn); }
    const d2 = hasOut ? dir(k % ns) : d1;
    const den = 1 + dot(d1, d2);
    return prof.map(([u, h]) => {
      const c = hasIn && hasOut ? -(u * dot(f.o, d2) + h * dot(f.n, d2)) / den : 0;
      return b.vertex(
        p[0] + u * f.o[0] + h * f.n[0] + c * d1[0],
        p[1] + u * f.o[1] + h * f.n[1] + c * d1[1],
        p[2] + u * f.o[2] + h * f.n[2] + c * d1[2],
      );
    });
  });
  const m = prof.length;
  for (let k = 0; k < ns; k++) {
    const kn = (k + 1) % nv;
    for (let j = 0; j < m; j++) {
      const jn = (j + 1) % m;
      b.quad(secs[k][j], secs[k][jn], secs[kn][jn], secs[kn][j]);
    }
  }
  if (!closed) {
    const { tris } = triangulateFace(prof, []);
    for (const [i, j, k] of tris) {
      b.tri(secs[0][i], secs[0][k], secs[0][j]);
      b.tri(secs[nv - 1][i], secs[nv - 1][j], secs[nv - 1][k]);
    }
  }
  return ensureOutward(b.build());
}

// ── the generator ────────────────────────────────────────────────────────────

function errorResult(error: string, N: number): SplitThirdsMoldMeshes {
  const e = empty();
  const st = computeMeshStats(e);
  return {
    style: 'splitThirds', pieceCount: N, kits: [], oneKit: false, sharedBaseWall: true, baseWall: e, baseWallPrint: e,
    masters: e, plates: e, walls: e, plaster: e, undercutFlags: new Float32Array(0), hasUndercuts: false,
    plasterVolumeMm3: 0, masterStats: st, wallStats: st, baseWallStats: st,
    natches: [], natchNote: null, hingeNote: null, foot: null, error,
    layout: { rW: 0, H: 0, zLo: 0, zHi: 0, seat: 0, plateL: 0, plateW: 0, plateH: 0, wallH: 0 },
    debug: { parts: [], cavities: [], gap: 0, skinV: 0, tBed: 0, hinge: false, baseWallParts: [], pockets: [], outer: [], inner: [], band: [], zLeg: [0, 0], alpha: 0, seat: 0, clr: 0, zEnd: 0, sealDepth: 0, zB0: 0, foot: null },
  };
}

export function generateSplitThirdsMold(vase: VaseParameters, mold: MoldParameters, N = 3): SplitThirdsMoldMeshes {
  const rRes = vase.resolution.radial;
  const scale = 1 + mold.shrinkPercent / 100;
  const shell = mold.masterWallThickness;
  const m = mold.plasterThickness;
  const seat = mold.halvesSeatDepth;
  const clr = mold.halvesFitClearance;
  const sealDepth = Math.max(0.5, mold.halvesWellSeal);
  const cylLen = Math.max(sealDepth, shell + CAP_RECESS + 0.2);
  const wt = mold.thirdsWallThickness;
  const flangeW = mold.thirdsFlangeWidth;
  const floorT = mold.thirdsPlateFloor;
  const alpha = Math.PI / N;

  // ── Vase + well rings, exactly as Split Halves builds them. ──
  const p = prepareVaseParams(vase, scale, mold.keepTexture);
  const texturesEnabled = mold.keepTexture && p.textures.enabled !== false;
  const outerStack = buildOuterRings(p, texturesEnabled);
  const topIdx = outerStack.rings.length - 1;
  const topRing = outerStack.rings[topIdx];
  const [tcx, tcy] = outerStack.centers[topIdx];
  const hTop = outerStack.heights[topIdx];
  const draftTan = tanDeg(mold.wellDraftAngle);
  const wellOuterDelta = mold.wellWidth + mold.wellHeight * draftTan;
  const wellTopZ = hTop + mold.wellHeight;
  const zEnd = wellTopZ + cylLen;
  const ledgeRing = offsetRingRadial(topRing, tcx, tcy, mold.wellWidth, hTop, rRes);
  const wellTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, wellTopZ, rRes);
  const cylEndRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, zEnd, rRes);
  const outerRings: Ring[] = [
    ...outerStack.rings,
    ...(mold.wellWidth > 1e-3 ? [ledgeRing] : []),
    ...(mold.wellHeight > 1e-3 ? [wellTopRing] : []),
    cylEndRing,
  ];
  let innerStart = topIdx;
  for (let v = 0; v <= topIdx; v++) if (outerStack.heights[v] >= shell) { innerStart = v; break; }
  const cavity = buildCavityRings(outerStack.rings, outerStack.centers, rRes, innerStart, topIdx, shell);
  clampCavityUnderRim(cavity, topRing, tcx, tcy, hTop, shell, rRes);
  const floorTopZ = Math.min(hTop + shell, wellTopZ);
  const riseRing = new Float32Array(cavity[cavity.length - 1]);
  for (let t = 0; t < rRes; t++) riseRing[t * 3 + 2] = floorTopZ;
  const flatRing = offsetRingRadial(ledgeRing, tcx, tcy, -shell, floorTopZ, rRes);
  const wellInnerTop = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - shell, wellTopZ, rRes);
  const wellInnerEnd = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - shell, zEnd, rRes);
  const innerRings: Ring[] = [...cavity, riseRing, ...(mold.wellWidth > 1e-3 ? [flatRing] : []), ...(mold.wellHeight > 1e-3 ? [wellInnerTop] : []), wellInnerEnd];

  // ── Each piece's arcs. Seams at seamAngle + k·2α; piece k between seam k
  // (its face B) and seam k+1 (its face A). ──
  const [c0x, c0y] = outerStack.centers[0];
  const a0 = (mold.seamAngle * Math.PI) / 180;
  const nArc = Math.max(16, Math.ceil(rRes / N));
  const wedges = Array.from({ length: N }, (_, k) => wedgeOf(a0 + (2 * k + 1) * alpha, alpha));
  const W0 = wedges[0];
  const ca = W0.ca, sa = W0.sa, cotA = ca / sa;
  const pieces: { outer: Arc3[]; inner: Arc3[] }[] = [];
  for (const w of wedges) {
    const outer: Arc3[] = [], inner: Arc3[] = [];
    for (const r of outerRings) { const a = cutWedge(r, rRes, c0x, c0y, w, nArc); if (!a) return errorResult('A seam misses part of the vase at this Seam Angle (XY Sway can carry the vase off the axis). Try another angle or less sway.', N); outer.push(a); }
    for (const r of innerRings) { const a = cutWedge(r, rRes, c0x, c0y, w, nArc); if (!a) return errorResult('A seam misses part of the vase wall at this Seam Angle. Try another angle or less sway.', N); inner.push(a); }
    pieces.push({ outer, inner });
  }

  // ── One kit for all pieces? Only if every piece IS piece 0. ──
  let oneKit = true;
  for (let k = 1; k < N && oneKit; k++) {
    for (let i = 0; i < pieces[0].outer.length && oneKit; i++) {
      const A = pieces[0].outer[i], B = pieces[k].outer[i];
      for (let j = 0; j < A.length; j++) {
        if (Math.hypot(A[j][0] - B[j][0], A[j][1] - B[j][1], A[j][2] - B[j][2]) > SYMMETRY_TOL) { oneKit = false; break; }
      }
    }
  }

  // ── Foot = a plaster PLUG (Gary 2026-10-17, replacing the 10-16 hexagon
  // foot, which cracked): the master carries a BAND — the vase's bottom outline
  // exactly, run straight down plugH and on into the base wall — with a rounded
  // ring round it. No margin means no flat ledge meeting a curled-in bottom, so
  // no thin wedge of plaster. Each piece gets a groove from the ring; the plug,
  // cast in its own cup, gets the matching ridge, so the strapped pieces hold
  // it. The pieces still pull straight out sideways (the ring's flanks are
  // level). ──
  const footOn = mold.thirdsFootPiece;
  const plugH = Math.max(6, mold.thirdsPlugHeight);
  const zRing = -plugH / 2;
  const ring0 = outerStack.rings[0];
  type BandSet = { b0: Arc3; lap: Arc3; ring: Arc3[]; bR: Arc3 };
  const bands: BandSet[] = [];
  if (footOn) {
    for (const w of wedges) {
      const cut = (M: number) => cutWedgeKeep(offsetRingRadial(ring0, c0x, c0y, M, 0, rRes), rRes, c0x, c0y, w);
      const ring = RING_US.map((u) => cut(ringBump(u)));
      const d = { b0: cut(0), lap: cut(-0.3), bR: cut(RING_H), ring };
      if (!d.b0 || !d.lap || !d.bR || ring.some((a) => !a)) return errorResult('The plug band could not be cut at this Seam Angle. Try another angle.', N);
      bands.push(d as BandSet);
    }
  }

  // ── Block: plaster reaches rW along each face and up to the level H. ──
  let rhoMax = 0, tMax = 0;
  for (const r of outerRings) for (let t = 0; t < rRes; t++) rhoMax = Math.max(rhoMax, Math.hypot(r[t * 3] - c0x, r[t * 3 + 1] - c0y));
  for (const pc of pieces) for (const arc of pc.outer) for (const [, , t] of arc) tMax = Math.max(tMax, t);
  const rW = rhoMax + m;
  const H = tMax + m;
  // With the plug, the pieces stop plugH below the vase bottom (the plug's
  // bottom is flush with theirs) and the base wall's boss (Well Seal long, like
  // the well end's) holds the band's run.
  const zB0 = footOn ? -plugH : -m;
  const zLo = footOn ? zB0 - sealDepth : -m, zHi = zEnd;
  const zPl = zHi - sealDepth;            // plaster ends at the boss face
  const zMid = (zLo + zHi) / 2;           // wall seam
  const border = wt + flangeW;
  const rhoEdge = rW + wt + flangeW;      // plate edge, along the face
  const rhoWc = rW + wt / 2;              // wall centre line
  const sEdge = rhoEdge * sa;
  const zP0 = zLo - border, zP1 = zHi + border;
  const floorV = floorT / sa;             // vertical thickness for floorT square to the face
  const Vt = (s: number) => Math.abs(s) * cotA;
  const tBed = -seat - floorV;
  /** Height above face (sgn) at distance ρ where t reaches H. */
  const hToTop = (rho: number) => (H - rho * ca) / sa;
  const vw = Math.min(V_WIDTH, seamMaxVWidth(flangeW, V_CLEARANCE));
  const band = seamBandPositions({ vw, vclr: V_CLEARANCE, flangeW });
  const gW = vw / 2 + V_CLEARANCE;
  const gH = V_HEIGHT + V_CLEARANCE;
  const gHf = Math.min(V_HEIGHT + V_CLEARANCE, FLANGE_T - 0.6);

  /** A face point in native (z, s, t), lifted h along the face normal. */
  const onFace = (sgn: number, z: number, rho: number, h = 0): V3 => {
    const [s, t] = faceAt(W0, sgn, rho), [ns, nt] = faceN(W0, sgn);
    return [z, s + h * ns, t + h * nt];
  };
  const fA = { o: [0, sa, ca] as V3, n: [0, -ca, sa] as V3 };     // face A: outward = up the face, n = into the plaster
  const fB = { o: [0, -sa, ca] as V3, n: [0, ca, sa] as V3 };
  const Z: V3 = [1, 0, 0], mZ: V3 = [-1, 0, 0];

  // ── Natches: two per seam, the same (z, ρ) on every seam, one in each end's
  // corner (clear of the block edges, the axis, every piece's footprint and
  // the other natch). Plate face A carries domes
  // (dimples in the plaster), face B pockets (bumps), so each piece's bumps
  // meet the next piece's dimples. ──
  const rMaxN = Math.max(2, mold.natchDiameter / 2);
  const natchH = Math.max(0.5, Math.min(mold.natchHeight, seat * sa - 0.4));
  const rhoEnds = (arcs: Arc3[]) => {
    let r = 0;
    for (const a of arcs) for (const q of [a[0], a[a.length - 1]]) r = Math.max(r, Math.hypot(q[1], q[2]));
    return r + clr;
  };
  // With the plug, the band (and its ring, counted at full height the whole
  // way) is part of what a natch must keep clear of.
  const rhoFoot: P2[] = footOn
    ? [[zB0 - 1, 0], [zB0 - 1, rhoEnds(bands.map((d) => d.bR))], [0, rhoEnds(bands.map((d) => d.bR))]]
    : [[zLo + m - clr, 0]];
  for (let i = 0; i < outerRings.length; i++) {
    const z = pieces[0].outer[i][0][0];
    rhoFoot.push([i === 0 && !footOn ? -clr : z, rhoEnds(pieces.map((pc) => pc.outer[i]))]);
  }
  rhoFoot.push([zHi, 0]);
  const clearAt = (z: number, rho: number, placed: ThirdsNatch[]) => {
    let c = Math.min(z - zB0, zPl - z, rW - rho, rho, signedDist(z, rho, rhoFoot));
    for (const q of placed) c = Math.min(c, Math.hypot(z - q.z, rho - q.rho) - q.r);
    return c - NATCH_EDGE;
  };
  // Each natch sits in its end's corner, the same distance from all three
  // things round it (Gary, 2026-10-16): the lower one from the block's base
  // end, the side wall and the master; the upper one from the well (its ledge
  // and funnel), the side wall and the master cup. That is the biggest circle
  // that still touches its end feature — grow it out of the corner until both
  // other sides stop it. A natch smaller than that circle keeps equal plaster
  // on all three sides.
  // The well side starts one point early, so the stretch up to the rim corner
  // counts as well (else neither side would see it).
  const iWell = rhoFoot.findIndex(([z]) => z >= hTop - 1e-6);
  const wellFoot = rhoFoot.slice(Math.max(0, iWell - 1));
  const distPolyline = (z: number, rho: number, pl: P2[]) => {
    let d = Infinity;
    for (let i = 0; i + 1 < pl.length; i++) {
      const [az, ar] = pl[i], [bz, br] = pl[i + 1];
      const ez = bz - az, er = br - ar, L2 = ez * ez + er * er;
      const u = L2 > 0 ? Math.max(0, Math.min(1, ((z - az) * ez + (rho - ar) * er) / L2)) : 0;
      d = Math.min(d, Math.hypot(z - az - u * ez, rho - ar - u * er));
    }
    return d;
  };
  // The cup only: the rim corner belongs to the well side, or the circle settles
  // on that one point instead of the cup wall (tumbler: 15.2 / 15.3 / 16.5).
  const bodyFoot = rhoFoot.filter(([z]) => z < hTop - 1e-6);
  // Per corner: its three distances — the end feature, the side wall, the master.
  const ends = [
    { za: zB0, zb: (zB0 + zPl) / 2, feats: (z: number, rho: number) => [z - zB0, rW - rho, signedDist(z, rho, rhoFoot)] },
    { za: (zB0 + zPl) / 2, zb: zPl, feats: (z: number, rho: number) => [Math.min(zPl - z, distPolyline(z, rho, wellFoot)), rW - rho, distPolyline(z, rho, bodyFoot)] },
  ];
  const cornerOf = ({ za, zb, feats }: typeof ends[0]) => {
    let best: { z: number; rho: number; c: number } | null = null;
    // Score = free radius, less a steep penalty (×20) for the three distances
    // not being equal: evenness wins over room (a leaning mug offered a roomier
    // spot 1 mm off even, and a ×4 penalty took it). Smooth, so each finer
    // pass improves on the last.
    let bestS = -Infinity;
    const scan = (z0: number, z1: number, r0: number, r1: number, st: number) => {
      for (let z = z0; z <= z1 + 1e-9; z += st) for (let r = r0; r <= r1 + 1e-9; r += st) {
        if (z < za || z > zb || r <= 0 || r >= rW) continue;
        const c = clearAt(z, r, []) + NATCH_EDGE;
        const f = feats(z, r);
        const sc = c - 20 * (Math.max(...f) - Math.min(...f));
        if (sc > bestS) { bestS = sc; best = { z, rho: r, c }; }
      }
    };
    scan(za + 0.5, zb, 0.5, rW, 1);
    for (const st of [0.2, 0.04]) {
      const b0 = best as { z: number; rho: number; c: number } | null;
      if (!b0) break;
      scan(b0.z - 6 * st, b0.z + 6 * st, b0.rho - 6 * st, b0.rho + 6 * st, st);
    }
    return best as { z: number; rho: number; c: number } | null;
  };
  const natches: ThirdsNatch[] = [];
  for (const e of ends) {
    const q = cornerOf(e);
    if (!q) continue;
    const r = Math.min(rMaxN, clearAt(q.z, q.rho, natches));
    if (r >= 2) natches.push({ z: q.z, rho: q.rho, r });
  }
  const natchNote = natches.length < 2 ? `Only ${natches.length} natch${natches.length === 1 ? '' : 'es'} per seam fit${natches.length === 1 ? 's' : ''} — raise Plaster to make room.` : null;

  // ── Plate parts that are the same for every kit: the ridges and domes. The
  // body is per kit (its water cavities follow that piece's hollow). ──
  /** Outer face of each side's load-bearing leg (where the old leg was). */
  const sLegOut = rhoWc * sa + LEG_W / 2;
  /** One face's run of a ridge on the plate surface, `d` in from the plate
   *  edge: from the gap at the well-less end, up the face, along it and back
   *  down to the gap. The ridges stop at the gap (2026-10-18, it is open
   *  through the faces at the ends): each end is cut square to the run, `ρa`
   *  up the face so even the ridge's crest, leaning over the V's bottom, stays
   *  0.05 clear of the gap. */
  const ridgeRun = (d: number, sgn: 1 | -1): { V: V3[]; segs: { o: V3; n: V3 }[] } => {
    const r = rhoEdge - d, z0 = zP0 + d, z1 = zP1 - d;
    const ra = (GAP / 2 + 0.05 + ca * V_HEIGHT) / sa;
    const f = sgn > 0 ? fA : fB;
    return {
      V: [onFace(sgn, z0, ra), onFace(sgn, z0, r), onFace(sgn, z1, r), onFace(sgn, z1, ra)],
      segs: [{ o: mZ, n: f.n }, f, { o: Z, n: f.n }],
    };
  };
  const ridgeCs: P2[] = [[-vw / 2, -EMBED], [vw / 2, -EMBED], [0, V_HEIGHT]];
  const ridges = band.flatMap((d) => ([1, -1] as const).map((sg) => { const { V, segs } = ridgeRun(d, sg); return framedSweep(V, segs, ridgeCs, false); }));
  const faceMesh = (mesh: VaseMesh, sgn: number) => mapMesh(mesh, (a, rho, h) => onFace(sgn, a, rho, h));
  const domes = natches.map((q) => faceMesh(buildDome(q.z, q.rho, q.r, natchH, DOME_SEG), 1));
  /** Natch pocket bowls on face B, emitted into the top slab before its weld. */
  const pocketHoles: P2[][] = natches.map((q) => {
    const pts: P2[] = [];
    for (let k = 0; k < DOME_SEG; k++) {
      const th = (k / DOME_SEG) * Math.PI * 2;
      const [z, s] = onFace(-1, q.z + q.r * Math.cos(th), q.rho + q.r * Math.sin(th));
      pts.push([z, s]);
    }
    return pts;
  });
  const bowls = (b: MeshBuilder) => {
    for (const q of natches) {
      const a = q.r, h = natchH;
      const R = (a * a + h * h) / (2 * h);
      const phiMax = Math.asin(Math.min(1, a / R));
      const rings: number[][] = [];
      for (let j = 0; j < DOME_RINGS; j++) {
        const phi = phiMax * (1 - j / DOME_RINGS);
        const r = R * Math.sin(phi), depth = R * Math.cos(phi) - (R - h);
        const ring: number[] = [];
        for (let k = 0; k < DOME_SEG; k++) {
          const th = (k / DOME_SEG) * Math.PI * 2;
          ring.push(b.vertex(...onFace(-1, q.z + r * Math.cos(th), q.rho + r * Math.sin(th), -depth)));
        }
        rings.push(ring);
      }
      // Face B's (along, ρ, h) frame is left-handed in native, so these run
      // the opposite way to Split 2-Pc's buildFloor bowls.
      for (let j = 0; j + 1 < rings.length; j++) {
        for (let k = 0; k < DOME_SEG; k++) {
          const kn = (k + 1) % DOME_SEG;
          b.quad(rings[j][k], rings[j + 1][k], rings[j + 1][kn], rings[j][kn]);
        }
      }
      const bottom = b.vertex(...onFace(-1, q.z, q.rho, -h));
      const lr = rings[rings.length - 1];
      for (let k = 0; k < DOME_SEG; k++) b.tri(bottom, lr[(k + 1) % DOME_SEG], lr[k]);
    }
  };

  // ── Walls. Wall 1 = well end + half of each side (seam RIDGES), wall 2 =
  // base end + the other halves (seam GROOVES), as Split Halves. ──
  const sideSlab = (sgn: number, z0: number, z1: number) => {
    const [is, it] = faceAt(W0, sgn, rW), [os, ot] = faceAt(W0, sgn, rW + wt);
    const [ns, nt] = faceN(W0, sgn);
    const hi = hToTop(rW), ho = hToTop(rW + wt);
    return extrudeSolid([[is, it], [os, ot], [os + ho * ns, ot + ho * nt], [is + hi * ns, it + hi * nt]], [], z0, z1, MAP_YZ_X);
  };
  /** The wall's section in the end plane: V bottom from ρ = rr on each face, lines square to the faces up to t = H. */
  const endPoly = (rr: number): P2[] => {
    const pts: P2[] = [];
    for (const sgn of [1, -1]) {
      const [s, t] = faceAt(W0, sgn, rr), [ns, nt] = faceN(W0, sgn);
      const h = (H - t) / nt;
      if (sgn === 1) pts.push([s + h * ns, H], [s, t], [0, 0]);
      else pts.push([s, t], [s + h * ns, H]);
    }
    return pts;
  };
  const flangeCs: P2[] = [[wt / 2 - TAB_LIP, 0]];
  for (let i = band.length - 1; i >= 0; i--) {
    const u = wt / 2 + flangeW - band[i];
    flangeCs.push([u - gW, 0], [u, gHf], [u + gW, 0]);
  }
  flangeCs.push([wt / 2 + flangeW, 0], [wt / 2 + flangeW, FLANGE_T], [wt / 2 - TAB_LIP, FLANGE_T]);
  /**
   * Seam block on face `sgn`: the last TAB_T before the seam plane z = zMid, from
   * just inside the wall's outer face out to the plate edge, up to t = H. Its
   * underside carries the flange grooves over the plate ridges; its seam face
   * the vertical Vs at the same band positions (Split Halves' seamBlock, on
   * the face). `side` +1: the block lies at z > zMid (wall 1), −1: z < zMid.
   */
  const seamBlock = (sgn: number, side: 1 | -1, ridge: boolean): VaseMesh => {
    const r0 = rW + wt - TAB_LIP, r1 = rhoEdge;
    const dams = band.map((d) => rhoEdge - d);
    const face = (rho: number): number => {
      for (const d of dams) {
        const t = Math.abs(rho - d);
        if (ridge) { if (t < vw / 2) return V_HEIGHT * (1 - t / (vw / 2)); }
        else if (t < gW) return -gH * (1 - t / gW);
      }
      return 0;
    };
    const floor = (rho: number): number => {
      for (const d of dams) { const t = Math.abs(rho - d); if (t < gW) return gHf * (1 - t / gW); }
      return 0;
    };
    const cols = [r0, r1];
    for (const d of dams) cols.push(d - gW, d - vw / 2, d, d + vw / 2, d + gW);
    const rs = cols.map((r) => Math.min(Math.max(r, r0), r1)).sort((a, b) => a - b).filter((r, i, arr) => i === 0 || r - arr[i - 1] > 1e-4);
    const zIn = zMid + side * (TAB_T + EMBED);
    const mb = new MeshBuilder();
    const rings = rs.map((rho) => {
      const zS = zMid - side * face(rho);
      const h0 = floor(rho), h1 = hToTop(rho);
      return ([[zIn, h0], [zIn, h1], [zS, h1], [zS, h0]] as P2[]).map(([z, h]) => mb.vertex(...onFace(sgn, z, rho, h)));
    });
    for (let j = 0; j + 1 < rings.length; j++) for (let i = 0; i < 4; i++) { const iN = (i + 1) % 4; mb.quad(rings[j][i], rings[j][iN], rings[j + 1][iN], rings[j + 1][i]); }
    const last = rings.length - 1;
    for (let i = 1; i + 1 < 4; i++) { mb.tri(rings[last][0], rings[last][i], rings[last][i + 1]); mb.tri(rings[0][0], rings[0][i + 1], rings[0][i]); }
    return ensureOutward(mb.build());
  };
  /** Clip flange along the wall, from the seam (TAB_T short of it) round the end and back. */
  const flangePath = (well: boolean): { V: V3[]; segs: { o: V3; n: V3 }[] } => {
    const zc = well ? zHi + wt / 2 : zLo - wt / 2;
    const zs = well ? zMid + TAB_T : zMid - TAB_T;
    const o = well ? Z : mZ;
    return well
      ? { V: [onFace(1, zs, rhoWc), onFace(1, zc, rhoWc), [zc, 0, 0], onFace(-1, zc, rhoWc), onFace(-1, zs, rhoWc)], segs: [fA, { o, n: fA.n }, { o, n: fB.n }, fB] }
      : { V: [onFace(-1, zs, rhoWc), onFace(-1, zc, rhoWc), [zc, 0, 0], onFace(1, zc, rhoWc), onFace(1, zs, rhoWc)], segs: [fB, { o, n: fB.n }, { o, n: fA.n }, fA] };
  };
  const wallCommon = (well: boolean): VaseMesh[] => {
    const [zs0, zs1] = well ? [zMid, zHi + wt] : [zLo - wt, zMid];
    const [ze0, ze1] = well ? [zHi, zHi + wt] : [zLo - wt, zLo];
    const { V, segs } = flangePath(well);
    return [
      sideSlab(1, zs0, zs1), sideSlab(-1, zs0, zs1),
      extrudeSolid(endPoly(rW + wt), [], ze0, ze1, MAP_YZ_X),
      framedSweep(V, segs, flangeCs, false),
      seamBlock(1, well ? 1 : -1, well), seamBlock(-1, well ? 1 : -1, well),
    ];
  };
  const baseWallParts = wallCommon(false);
  /** A full-width end boss (inside the side walls) from z0 to z1 whose bore is
   *  `arc` (s, t) grown by the clearance, its ends slid out along their faces. */
  const bossFor = (arc: P2[], z0: number, z1: number): VaseMesh => {
    const n = arc.length - 1;
    const bore: P2[] = arc.map(([s2, t2], i) => {
      const prev = arc[Math.max(0, i - 1)], next = arc[Math.min(n, i + 1)];
      let tx = next[0] - prev[0], ty = next[1] - prev[1];
      const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      let nx = ty, ny = -tx;
      if (nx * s2 + ny * t2 < 0) { nx = -nx; ny = -ny; }
      return [s2 + nx * clr, t2 + ny * clr];
    });
    const rB = Math.hypot(arc[0][0], arc[0][1]) + clr, rA = Math.hypot(arc[n][0], arc[n][1]) + clr;
    bore[0] = faceAt(W0, -1, rB); bore[n] = faceAt(W0, 1, rA);
    const [aS, aT] = faceAt(W0, 1, rW), [bS, bT] = faceAt(W0, -1, rW);
    const outline = endPoly(rW);  // [topA, faceA(rW), apex, faceB(rW), topB]
    const bossPoly = dedupeLoop([outline[0], [aS, aT], ...bore.slice().reverse(), [bS, bT], outline[4]]);
    return extrudeSolid(bossPoly, [], z0, z1, MAP_YZ_X);
  };

  const plasterPoly = endPoly(rW);
  const plasterArea = Math.abs(polyArea(plasterPoly));

  // ── Per kit: master, plate top slab (its pocket), well-end boss. ──
  const kitIdx = oneKit ? [0] : pieces.map((_, k) => k);
  const builtRaw = kitIdx.map((k) => {
    const { outer } = pieces[k];
    // With the plug, the master's base is OPEN into a hollow band (Gary
    // 2026-10-18: water all through, and no solid block across the hinge):
    // a first hollow arc at z = 0 — the bottom outline in by Master Wall, the
    // same contour as the band's own hollow (`bi`, which keeps ring0's
    // vertices like the band does).
    let inner = pieces[k].inner;
    let bi: Arc3 | null = null;
    if (footOn) {
      const ringIn = offsetRingRadial(ring0, c0x, c0y, -shell, 0, rRes);
      const m0 = cutWedge(ringIn, rRes, c0x, c0y, wedges[k], nArc);
      bi = cutWedgeKeep(ringIn, rRes, c0x, c0y, wedges[k]);
      if (!m0 || !bi) return null;
      inner = [m0, ...inner];
    }
    // The hinge: a slot GAP wide (less 0.1, so it never shares a face with the
    // cavity walls) up the middle of the hollow, cut into the shell from inside
    // so HINGE_SKIN of master is all that crosses the middle.
    // The slot goes as deep as leaves HINGE_SKIN to the outer surface, measured
    // square to it at each height: the shell is a radial offset, so on a
    // non-round section it is thinner than Master Wall in places, and a fixed
    // depth left 1.1 mm on a twisted rectangle.
    const notchD = shell - HINGE_SKIN;
    // Measured at each wall of the slot and its middle, on each arc AND halfway
    // to its neighbours: the slot's top is straight between arcs, and on a
    // twisted design the outer surface is not (1.68 mm between arcs otherwise).
    const hN = GAP / 2 - 0.05;
    const bases = inner.map((arc) => notchBase(arc, hN));
    let notched: (Arc3 | null)[] | null = null;
    if (notchD > 0.05 && bases.every((b) => b)) {
      const bs = bases as { L: V3; R: V3 }[];
      const pts = (b: { L: V3; R: V3 }): V3[] => [b.L, b.R, [(b.L[0] + b.R[0]) / 2, 0, (b.L[2] + b.R[2]) / 2]];
      const mid = (p: V3, q: V3): V3 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      const room = (p: V3) => distToOuter(outer, p) - HINGE_SKIN;
      const depth = bs.map((b, i) => {
        let d = Math.min(...pts(b).map(room));
        for (const j of [i - 1, i + 1]) if (j >= 0 && j < bs.length) {
          const P = pts(b), Q = pts(bs[j]);
          d = Math.min(d, ...P.map((p, q) => room(mid(p, Q[q]))));
        }
        return Math.max(0.05, Math.min(notchD + 1, d));
      });
      notched = inner.map((arc, i) => notchArc(arc, hN, depth[i], Math.ceil(nArc / 2)));
    }
    // A slot is only needed where the wall is thicker than the skin; at
    // Master Wall ≤ HINGE_SKIN the gap meets the hollow and the wall itself is
    // the hinge (2026-10-18: this used to warn "will not flex" at Wall 2).
    const slotted = !!notched && notched.every((a) => a);
    const hinge = slotted || notchD <= 0.05;
    const relief = buildVRelief(outer, slotted ? (notched as Arc3[]) : inner, seat, footOn);
    const last = outer[outer.length - 1];
    const capArc: P2[] = last.map(([, s, t]) => [s, t]);
    const n = capArc.length - 1;
    const capPoly = dedupeLoop(offsetPolygon([...capArc, [capArc[n][0], capArc[n][1] - seat], [0, -seat], [capArc[0][0], capArc[0][1] - seat]], -0.1));
    // The cap closes each cavity's well end; it stops at the gap on each side,
    // so it does not stiffen the hinge.
    const capZ0 = zEnd - CAP_RECESS - shell;
    const cap = mergeMeshes([clipToXMin(capPoly, GAP / 2), clipToXMax(capPoly, -GAP / 2)].map((q) => extrudeSolid(dedupeLoop(q), [], capZ0, zEnd - CAP_RECESS, MAP_YZ_X)));
    // Plug band, HOLLOW (2026-10-18): the bottom outline run straight from the
    // base wall up to the vase bottom as a C-section — outer arc, skirts down
    // `seat`, the hollow arc (with the hinge slot, like the master's) — open
    // at z = 0 into the master's hollow and at the bed into the cavities. Its
    // base end is closed by two half caps that stop at the gap (as the well
    // cap does), so nothing solid crosses the hinge. The rounded ring is a
    // crescent loft over the band's outer skin (0.8 mm deep, so it stays out
    // of the slot); a crescent lap 0.3–0.8 mm inside the outline joins the
    // band to the master (the band's z = 0 face only touches the relief).
    const disc: VaseMesh[] = [];
    const secOf = (arc: Arc3, bed = -seat): P2[] => {
      const q = arc.map(([, s2, t2]) => [s2, t2] as P2), e = q.length - 1;
      return [...q, [q[e][0], q[e][1] + bed], [0, bed], [q[0][0], q[0][1] + bed]];
    };
    const crescent = (X: Arc3, Y: Arc3, drop: number): P2[] => {
      const o = X.map(([, s2, t2]) => [s2, t2] as P2), i = Y.map(([, s2, t2]) => [s2, t2] as P2);
      const e = o.length - 1, f = i.length - 1;
      return [...o, [o[e][0], o[e][1] - drop], [i[f][0], i[f][1] - drop], ...i.slice().reverse(), [i[0][0], i[0][1] - drop], [o[0][0], o[0][1] - drop]];
    };
    if (footOn && bi) {
      const d = bands[k];
      const cutK = (M: number) => cutWedgeKeep(offsetRingRadial(ring0, c0x, c0y, M, 0, rRes), rRes, c0x, c0y, wedges[k]);
      const lapIn = cutK(-0.4) ?? d.lap;
      const deep = cutK(-0.8);
      if (!deep) return null;
      // The band's hinge slot: as deep as leaves HINGE_SKIN to its outer face.
      let biN: Arc3 = bi;
      const nb = slotted ? notchBase(bi, hN) : null;
      if (nb) {
        const bo: Arc3[] = [d.b0.map(([, s2, t2]): V3 => [-1, s2, t2]), d.b0.map(([, s2, t2]): V3 => [1, s2, t2])];
        const pts: V3[] = [nb.L, nb.R, [0, 0, (nb.L[2] + nb.R[2]) / 2]].map(([, s2, t2]): V3 => [0, s2, t2]);
        const dB = Math.max(0.05, Math.min(notchD + 1, ...pts.map((q) => distToOuter(bo, q) - HINGE_SKIN)));
        biN = notchArc(bi, hN, dB, Math.ceil(nArc / 2)) ?? bi;
      }
      disc.push(
        extrudeSolid(dedupeLoop(crescent(d.b0, biN, seat)), [], zLo, 0, MAP_YZ_X),
        // Stations in increasing w (loftSolid's caps assume it); the two end
        // stations sit just inside the band's skin.
        loftSolid([
          { outer: crescent(lapIn, deep, seat), holes: [], w: zRing + RING_US[0] - 0.1 },
          ...RING_US.map((u, i) => ({ outer: crescent(d.ring[i], deep, seat), holes: [], w: zRing + u })),
          { outer: crescent(lapIn, deep, seat), holes: [], w: zRing + RING_US[RING_US.length - 1] + 0.1 },
        ], MAP_YZ_X),
        extrudeSolid(crescent(d.lap, deep, seat - 0.1), [], -Math.min(0.5, plugH / 4), Math.min(0.5, shell / 2), MAP_YZ_X),
      );
      const bcPoly = dedupeLoop(offsetPolygon(secOf(d.b0), -0.1));
      for (const q of [clipToXMin(bcPoly, GAP / 2), clipToXMax(bcPoly, -GAP / 2)]) disc.push(extrudeSolid(dedupeLoop(q), [], zLo + 0.1, zLo + shell, MAP_YZ_X));
    }
    const flags = undercutThirds(outer, wedges[k]);

    // Pocket: the skirt footprint in plan (z, s), grown by the clearance and
    // cut at the well wall's inner face.
    const sideB: P2[] = outer.map((arc) => [arc[0][0], arc[0][1]]);
    const sideA: P2[] = outer.map((arc) => [arc[nArc][0], arc[nArc][1]]);
    const dd = (run: P2[]) => run.filter((q, i) => i === 0 || Math.hypot(q[0] - run[i - 1][0], q[1] - run[i - 1][1]) > 1e-6);
    // The band's skirts too, from the base wall to the vase bottom (the ring
    // counted full height over its whole width).
    const discB: P2[] = [], discA: P2[] = [];
    if (footOn) {
      const d = bands[k];
      const r0 = zRing + RING_US[0] - 0.1, r1 = zRing + RING_US[RING_US.length - 1] + 0.1;
      const run: [number, Arc3][] = [[zLo, d.b0], [r0, d.b0], [r0, d.bR], [r1, d.bR], [r1, d.b0], [0, d.b0]];
      for (const [z, a] of run) { discB.push([z, a[0][1]]); discA.push([z, a[a.length - 1][1]]); }
    }
    const fp = [...discB, ...dd(sideB), ...dd(sideA).reverse(), ...discA.reverse()];
    let pocketLoop = clipToXMax(offsetPolygon(fp, clr), zHi);
    if (footOn) pocketLoop = clipToXMin(pocketLoop, zLo);
    const pocket = removeSpikes(dedupeLoop(pocketLoop));
    // ── The plate's body, one print with the master. Per side (A: s > 0, B
    // mirrored): a TOP LAYER from the gap to the leg's outer face, TOP_SKIN
    // thick under the face (thicker if a natch pocket needs it); the BODY below
    // it down to the bed between the end legs, an end LIP past each; the OUTER
    // SLAB under the side wall and clip flange. The water cavity is a hole
    // through the top layer and the body; the cavity wall stands on the top
    // layer up into the master's hollow. Nothing crosses the gap but the
    // master's crown skin. ──
    const g = GAP / 2;
    const innerZ0 = inner[0][0][0];
    // With the plug the cavities run on down the hollow band to its half caps.
    const zCav0 = footOn ? zLo + shell : innerZ0;
    const zc0 = zCav0 + 0.1, zc1 = capZ0 - 0.1;
    // The end LEGS' outer faces (under the end walls, as the side legs are
    // under the side walls): past them only a LIP is left, the side flange's
    // thickness, so a binder clip reaches round it at the ends too (Gary
    // 2026-10-18).
    const zLegA = zLo - wt / 2 - LEG_W / 2, zLegB = zHi + wt / 2 + LEG_W / 2;
    const skinV = Math.max(TOP_SKIN, natchH + 0.8) / sa;
    const plateParts: VaseMesh[] = [];
    const cavities: P2[][] = [];
    const cavWalls: VaseMesh[] = [];
    for (const sgn of [1, -1]) {
      // The inner skirt's line in plan (z, |s|): each hollow arc's face end.
      const endS = (arc: Arc3) => Math.abs((sgn > 0 ? arc[arc.length - 1] : arc[0])[1]);
      const line: P2[] = inner.map((arc) => { const e = sgn > 0 ? arc[arc.length - 1] : arc[0]; return [e[0], Math.abs(e[1])]; });
      const oLine: P2[] = outer.map((arc) => { const e = sgn > 0 ? arc[arc.length - 1] : arc[0]; return [e[0], Math.abs(e[1])]; });
      if (footOn && bi) { line.unshift([zLo, endS(bi)]); oLine.unshift([zLo, endS(bands[k].b0)]); }
      const cl = clipLine(line, zc0, zc1);
      if (!cl) return null;
      // Where the hollow is narrower than the cavity wants (a narrow vase at
      // the seam), the cavity runs on under the master's own bed — still
      // master above it, still watertight — to 1.5 mm inside the outer skirt;
      // and on a really narrow one the wall by the gap thins (to 1.2 mm).
      const edge = cl.map(([z, q]): P2 => [z, Math.max(q - 0.1, Math.min(lineAt(oLine, z) - 1.5, g + CAV_WALL + 2))]);
      const sMin = Math.min(...edge.map(([, q]) => q));
      const cw = Math.max(1.2, Math.min(CAV_WALL, sMin - g - 1));
      const sWall = g + cw;
      if (sMin < sWall + 0.5) return null;
      const cav: P2[] = dedupeLoop([[zc0, sgn * sWall], [zc1, sgn * sWall], ...edge.slice().reverse().map(([z, q]): P2 => [z, sgn * q])]);
      cavities.push(cav);
      const rectS = (u0: number, u1: number, z0 = zP0, z1 = zP1): P2[] => [[z0, sgn * u0], [z1, sgn * u0], [z1, sgn * u1], [z0, sgn * u1]];
      plateParts.push(creasedSlab(rectS(g, sLegOut - 0.05), [cav], Vt, (q) => Vt(q) - skinV, sgn < 0 ? pocketHoles : [], sgn < 0 ? bowls : undefined));
      // The body under the top layer, down to the bed between the end legs;
      // past them, the end lips.
      plateParts.push(creasedSlab(rectS(g + 0.05, sLegOut, zLegA, zLegB), [offsetPolygon(cav, 0.05)], (q) => Vt(q) - skinV + EMBED, () => tBed));
      for (const [z0, z1] of [[zP0, zLegA + 1], [zLegB - 1, zP1]]) {
        plateParts.push(creasedSlab(rectS(g + 0.05, sLegOut, z0, z1), [], (q) => Vt(q) - skinV + EMBED, (q) => Vt(q) - seat - floorV));
      }
      plateParts.push(creasedSlab(rectS(sLegOut - 1, sEdge), [], Vt, (q) => Vt(q) - seat - floorV));
      // The cavity wall beside the gap, from the top layer up into the shell:
      // one station per hollow arc, strictly increasing along z, from just
      // inside the relief's base to just inside the cap.
      const w0 = sgn * (g + 0.05), w1 = sgn * (sWall + 0.05), wm = sgn * (g + cw / 2);
      // Where the hollow does not reach the wall's far side, the wall's top is
      // inside the master's bed there instead.
      const sec = (arc: Arc3): P2[] | null => {
        let t0 = tinAt(arc, w0), t1 = tinAt(arc, w1);
        if (!Number.isFinite(t1)) t1 = Vt(w1) + EMBED;
        if (!Number.isFinite(t0)) t0 = Vt(w0) + EMBED;
        return [[w0, Vt(w0) - EMBED], [w1, Vt(w1) - EMBED], [w1, t1 + EMBED], [w0, t0 + EMBED]];
      };
      const stations: { outer: P2[]; holes: P2[][]; w: number }[] = [];
      const zOf = (arc: Arc3) => zAtS(arc, wm);
      const s0 = sec(footOn && bi ? bi : inner[0]);
      if (!s0) return null;
      stations.push({ outer: s0, holes: [], w: zCav0 - EMBED });
      const zEndW = capZ0 + EMBED;
      for (let i = 0; i < inner.length; i++) {
        const z = zOf(inner[i]);
        if (z >= zEndW) {
          // Interpolate the last station between this arc and the one before.
          const zp = zOf(inner[i - 1]), sp = sec(inner[i - 1]), sc = sec(inner[i]);
          if (!sp || !sc) return null;
          const f = z > zp ? (zEndW - zp) / (z - zp) : 1;
          stations.push({ outer: sp.map(([u, v], j): P2 => [u, v + (sc[j][1] - v) * f]), holes: [], w: zEndW });
          break;
        }
        const sc = sec(inner[i]);
        if (!sc) return null;
        const prev = stations[stations.length - 1].w;
        stations.push({ outer: sc, holes: [], w: Math.max(z, prev + 0.01) });
      }
      cavWalls.push(loftSolid(stations, MAP_YZ_X));
    }
    // No roof over the gap at the ends (2026-10-18): it is open through the
    // faces. No plaster reaches the V's bottom there — the master or the band
    // covers it along the whole plaster run, and the walls past that.
    plateParts.push(...ridges, ...domes);

    // Well-end boss: the end section inside the side walls, standing Well Seal
    // proud of the wall, with a bore = the well's end outline + clearance.
    // The base wall gets the same round the foot disc's straight run.
    const boss = bossFor(capArc, zHi - sealDepth, zHi + EMBED);
    const wellWallParts = [...wallCommon(true), boss];
    const baseParts = footOn ? [...baseWallParts, bossFor(bands[k].b0.map(([, s2, t2]) => [s2, t2] as P2), zLo - EMBED, zB0)] : baseWallParts;

    // Plaster: the block section along the plaster run, less the vase + well
    // slice inside it.
    let env = 0;
    const secArea = (arc: Arc3) => Math.abs(polyArea([...arc.map(([, s, t]) => [s, t] as P2), [0, 0]]));
    for (let i = 0; i + 1 < outer.length; i++) {
      const za = outer[i][0][0], zb = outer[i + 1][0][0];
      env += ((zb - za) * (secArea(outer[i]) + secArea(outer[i + 1]))) / 2;
    }
    env -= secArea(last) * sealDepth;
    // With the plug, the plaster starts plugH below the vase and the band is cut out of it.
    if (footOn) env += plugH * secArea(bands[k].b0);
    const plasterVol = Math.max(0, plasterArea * (zPl - zB0) - env);

    const master = mergeMeshes([relief, cap, ...disc, ...cavWalls]);
    return { k, relief, cap, disc, cavWalls, master, flags, plateParts, wellWallParts, baseParts, pocket, plasterVol, cavities, hinge, skinV, inner };
  });
  if (builtRaw.some((b) => !b)) return errorResult('The vase is too narrow where a seam crosses it for the master\'s water cavities (each side of the hinge gap needs about 4 mm of hollow). Try another Seam Angle so the seams miss the narrow part.', N);
  const builtKits = builtRaw as NonNullable<typeof builtRaw[number]>[];

  // ── The plug's cup (Gary 2026-10-17): a bottom disk shaped like the vase
  // bottom resting on a ledge inside two clip-together walls, each with the
  // groove that gives the plug its ridge. Cup coords: plan (x, −y) about the
  // vase axis, z up, z = 0 the plug's vase face — the world turned over about
  // x, a rotation, never a mirror (the plug sits vase face DOWN in its cup). The
  // walls split along the cup's x axis and part sideways, as the pieces do off
  // the plug. The cup's inside is the band less the clearance, so the plug
  // drops into the pieces' bore; the disk is another clearance smaller so it
  // slides in. Each wall has V ridges on one clip flange, grooves on the other. ──
  let foot: ThirdsFoot | null = null;
  let footDbg: SplitThirdsMoldMeshes['debug']['foot'] = null;
  let footDisplay: { plate: VaseMesh; walls: VaseMesh; plaster: VaseMesh; reach: number; lift: number } | null = null;
  if (footOn) {
    const toFR = (ring: Ring): P2[] => {
      const out: P2[] = [];
      for (let t = 0; t < rRes; t++) out.push([ring[t * 3] - c0x, -(ring[t * 3 + 1] - c0y)]);
      return out;
    };
    const L = (M: number) => toFR(offsetRingRadial(ring0, c0x, c0y, M, 0, rRes));
    // The half of a loop with y > 0 (wall A) or y < 0 (B), from one x-axis
    // crossing to the other. A radial offset keeps each point on its own ray, so
    // which points are inside, and the two crossing segments, are the same for
    // every offset: every station of a wall has the same point count.
    const base = L(0);
    const ys = base.map(([, y]) => y);
    const halfIdx = (sgn: number) => {
      const inside = (i: number) => sgn * ys[i] > 1e-9;
      let start = -1;
      for (let i = 0; i < rRes; i++) if (inside(i) && !inside((i - 1 + rRes) % rRes)) { if (start >= 0) return null; start = i; }
      if (start < 0) return null;
      const idx: number[] = [];
      for (let k = 0; k < rRes && inside((start + k) % rRes); k++) idx.push((start + k) % rRes);
      return idx;
    };
    const half = (loop: P2[], idx: number[]): P2[] => {
      const cross = (a: number, b: number): P2 => {
        const [ax, ay] = loop[a], [bx, by] = loop[b];
        const f = Math.abs(ay - by) > 1e-12 ? ay / (ay - by) : 0;
        return [ax + (bx - ax) * f, 0];
      };
      const i0 = idx[0], i1 = idx[idx.length - 1];
      return [cross((i0 - 1 + rRes) % rRes, i0), ...idx.map((i) => loop[i]), cross(i1, (i1 + 1) % rRes)];
    };
    const idxA = halfIdx(1), idxB = halfIdx(-1);
    if (!idxA || !idxB) return errorResult('The plug cup cannot be split in two along this bottom outline (it crosses the split line more than twice). Turn the foot piece off for this shape.', N);

    const fBase = mold.footSmoothInner ? outerStack.smoothBase : ring0;
    const hF = Math.max(0, mold.footHeight);
    let fw = mold.footWidth, sw = mold.footSlopeWidth;
    let rMin = Infinity;
    for (let t = 0; t < rRes; t++) rMin = Math.min(rMin, Math.hypot(fBase[t * 3] - c0x, fBase[t * 3 + 1] - c0y));
    const avail = rMin - 0.5;
    const recess = hF > 1e-6 && sw > 0 && avail > 0.2;
    if (recess && fw + sw > avail) { const kk = avail / (fw + sw); fw *= kk; sw *= kk; }
    fw = Math.max(fw, 2 * clr + 0.3);
    const inset = (d: number) => toFR(offsetRingRadial(fBase, c0x, c0y, -d, 0, rRes));
    const recessD = recess ? hF : 0;
    const zDisk = -recessD - floorT;          // disk bottom = ledge top
    const zW0 = zDisk - LEDGE_T;              // wall bottom, on the bed

    // Disk: the vase bottom's positive — foot ring flat at z = 0, sloping down to
    // the recessed middle (the plug's face is its negative, the vase's foot).
    const diskOut = L(-2 * clr);
    const diskParts: VaseMesh[] = [extrudeSolid(diskOut, [], zDisk, recess ? -recessD : 0)];
    if (recess) {
      diskParts.push(loftSolid([
        { outer: diskOut, holes: [inset(fw + sw)], w: -recessD - EMBED },
        { outer: diskOut, holes: [inset(fw + sw)], w: -recessD },
        { outer: diskOut, holes: [inset(fw)], w: 0 },
      ]));
    }
    const disk = mergeMeshes(diskParts);

    // Walls: one loft per half, inside offset by station — the ledge, the
    // plug's straight side, the groove (the ring's own profile, less clr).
    const mOut = -clr + RING_H + wt;
    const st: [number, number][] = [
      // The ledge's top steps out 0.01 mm BELOW the disk, so the disk sits on it
      // without the step's ramp reaching under the disk's edge.
      [zW0, -clr - LEDGE_W], [zDisk - 0.01, -clr - LEDGE_W], [zDisk, -clr],
      ...RING_US.map((u): [number, number] => [plugH / 2 + u, -clr + ringBump(u)]),
      [plugH, -clr],
    ];
    const outerA = half(L(mOut), idxA), outerB = half(L(mOut), idxB);
    const wallBody = (idx: number[], outer: P2[]) => loftSolid(st.map(([w, M]) => ({ outer: [...outer, ...half(L(M), idx).reverse()], holes: [], w })));
    // Clip flange at each end of a wall: from 1 mm inside the wall's outer face
    // out flangeW along the split line, FLANGE_T thick on the wall's own side,
    // the three V's on its mating face (y = 0). Ridges at +x on A and at −x
    // on B, grooves at the other end (Gary 2026-10-18), so the two walls are
    // the same part turned half a turn wherever the outline allows it.
    const flangeAt = (xE: number, side: number, ridge: boolean): VaseMesh => {
      const sx = Math.sign(xE) || 1;
      const x0 = xE - sx * 1, x1 = xE + sx * flangeW;
      const face: P2[] = [[x0, 0]];
      for (const d of band.slice().sort((p, q) => q - p)) {
        const c = x1 - sx * d;
        if (ridge) face.push([c - sx * vw / 2, 0], [c, -side * V_HEIGHT], [c + sx * vw / 2, 0]);
        else face.push([c - sx * gW, 0], [c, side * gH], [c + sx * gW, 0]);
      }
      face.push([x1, 0], [x1, side * FLANGE_T], [x0, side * FLANGE_T]);
      return extrudeSolid(face, [], zW0, plugH);
    };
    const wallOf = (idx: number[], outer: P2[], side: number) => [
      wallBody(idx, outer),
      ...[outer[0][0], outer[outer.length - 1][0]].map((xE) => flangeAt(xE, side, (xE > 0) === (side > 0))),
    ];
    const wallAParts = wallOf(idxA, outerA, 1);
    const wallBParts = wallOf(idxB, outerB, -1);
    const wallA = mergeMeshes(wallAParts), wallB = mergeMeshes(wallBParts);
    // Same part? Every vertex of B turned half a turn about z must land on A,
    // and every vertex of A on B turned (to 0.01 mm, by a spatial hash). Not
    // point counts: a sample landing exactly on the split line gives one half
    // an extra, collinear point (Gary's 30-wave tumbler at Radial 360).
    const onEachOther = (a: VaseMesh, b: VaseMesh, sb: number): boolean => {
      const tol = 0.01, cell = 0.05;
      const grid = new Map<string, number[]>();
      for (let i = 0; i < a.vertexCount; i++) {
        const k = `${Math.floor(a.positions[i * 3] / cell)},${Math.floor(a.positions[i * 3 + 1] / cell)},${Math.floor(a.positions[i * 3 + 2] / cell)}`;
        const arr = grid.get(k);
        if (arr) arr.push(i); else grid.set(k, [i]);
      }
      for (let i = 0; i < b.vertexCount; i++) {
        const x = sb * b.positions[i * 3], y = sb * b.positions[i * 3 + 1], z = b.positions[i * 3 + 2];
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
        let hit = false;
        for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) for (let dz = -1; dz <= 1 && !hit; dz++) {
          for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            if (Math.hypot(a.positions[j * 3] - x, a.positions[j * 3 + 1] - y, a.positions[j * 3 + 2] - z) <= tol) { hit = true; break; }
          }
        }
        if (!hit) return false;
      }
      return true;
    };
    const sameAfterHalfTurn = (a: VaseMesh, b: VaseMesh) => onEachOther(a, b, -1) && onEachOther(b, a, -1);
    const wallsSame = sameAfterHalfTurn(wallA, wallB);

    const plugOut = L(-clr);
    let vol = Math.abs(polyArea(plugOut)) * plugH;
    if (recess) vol += (recessD * (Math.abs(polyArea(inset(fw))) + Math.abs(polyArea(inset(fw + sw))))) / 2;
    const diskPrint = translate(disk, 0, 0, -zDisk);
    const wallAPrint = translate(wallA, 0, 0, -zW0), wallBPrint = translate(wallB, 0, 0, -zW0);
    foot = { plate: diskPrint, wall: wallAPrint, wallB: wallBPrint, wallsSame, plateStats: computeMeshStats(diskPrint), wallStats: computeMeshStats(wallAPrint), plasterVolumeMm3: vol, plugHeight: plugH };
    let reach = 0;
    for (const [x, y] of L(mOut)) reach = Math.max(reach, Math.hypot(x, y));
    reach += flangeW + 2;
    footDisplay = { plate: disk, walls: mergeMeshes([wallA, wallB]), plaster: extrudeSolid(plugOut, [], 0, plugH), reach, lift: -zW0 };
    footDbg = { plugH, zRing: plugH / 2, recessDepth: recessD, zDisk, zWall0: zW0, disk: diskParts, wallA: wallAParts, wallB: wallBParts, plugOutline: plugOut, base: base };
  }

  // ── To assembly coordinates, print orientations, display. ──
  const asmList = (ms: VaseMesh[]) => ms.map(toAsm);
  const sharedBaseWall = !footOn || builtKits.length === 1;
  const kits: ThirdsKit[] = builtKits.map((b) => {
    const master = toAsm(b.master);
    const plate = toAsm(mergeMeshes(b.plateParts));
    const part = mergeMeshes([master, plate]);
    const wellWall = toAsm(mergeMeshes(b.wellWallParts));
    const baseWall = toAsm(mergeMeshes(b.baseParts));
    return {
      piece: b.k, master, plate, part, wellWall,
      // Lying down as assembled: the bed under the V, plaster side up.
      partPrint: translate(part, 0, 0, -zMin(part)),
      wellWallPrint: translate(wellWall, 0, 0, -zMin(wellWall)),
      baseWall,
      baseWallPrint: translate(baseWall, 0, 0, -zMin(baseWall)),
      plasterVolumeMm3: b.plasterVol,
    };
  });
  const baseWallAsm = kits[0].baseWall;
  const baseWallPrint = kits[0].baseWallPrint;

  // Kits side by side along Y, plates standing on the grid, centred on X.
  const pitch = 2 * sEdge + LAYOUT_GAP;
  const dz = -tBed;
  const dx = (zLo + zHi) / 2;   // X = −z, so this centres the run
  const off = (i: number) => (i - (kits.length - 1) / 2) * pitch;
  const plasterAsm = toAsm(extrudeSolid(plasterPoly, [], zB0, zPl, MAP_YZ_X));
  const masters = mergeMeshes(kits.map((kt, i) => translate(kt.master, dx, off(i), dz)));
  // The foot kit stands beside the last plate, its plate bottom on the grid.
  const footY = off(kits.length - 1) + sEdge + LAYOUT_GAP + (footDisplay?.reach ?? 0);
  const fd = footDisplay;
  const footShow = (mesh: VaseMesh) => translate(mesh, 0, footY, fd ? fd.lift : 0);
  const plates = mergeMeshes([...kits.map((kt, i) => translate(kt.plate, dx, off(i), dz)), ...(fd ? [footShow(fd.plate)] : [])]);
  const walls = mergeMeshes([
    ...kits.flatMap((kt, i) => [translate(kt.wellWall, dx, off(i), dz), translate(kt.baseWall, dx, off(i), dz)]),
    ...(fd ? [footShow(fd.walls)] : []),
  ]);
  const plaster = mergeMeshes([...kits.map((_, i) => translate(plasterAsm, dx, off(i), dz)), ...(fd ? [footShow(fd.plaster)] : [])]);
  const undercutFlags = new Float32Array(masters.vertexCount);
  let at = 0;
  for (const b of builtKits) { undercutFlags.set(b.flags, at); at += b.master.vertexCount; }
  let hasUndercuts = false;
  for (let i = 0; i < undercutFlags.length && !hasUndercuts; i++) if (undercutFlags[i] >= 0.999) hasUndercuts = true;

  const plasterTotal = oneKit ? builtKits[0].plasterVol * N : builtKits.reduce((s, b) => s + b.plasterVol, 0);
  const plateH = (rhoEdge * ca + FLANGE_T) - tBed;

  return {
    style: 'splitThirds', pieceCount: N, kits, oneKit, sharedBaseWall,
    baseWall: baseWallAsm, baseWallPrint,
    masters, plates, walls, plaster, undercutFlags, hasUndercuts,
    plasterVolumeMm3: plasterTotal,
    // Sizes as printed: the one part lying down, walls as assembled.
    masterStats: computeMeshStats(kits[0].partPrint),
    wallStats: computeMeshStats(kits[0].wellWallPrint),
    baseWallStats: computeMeshStats(baseWallPrint),
    natches, natchNote,
    hingeNote: builtKits.every((b) => b.hinge) ? null : 'The hinge slot could not be cut into the master at this Seam Angle, so the master\'s arch is stiffer than it should be. Try another Seam Angle.',
    foot, error: null,
    layout: { rW, H, zLo, zHi, seat, plateL: zP1 - zP0, plateW: 2 * sEdge, plateH, wallH: H - tBed },
    debug: {
      parts: builtKits.map((b) => ({ relief: toAsm(b.relief), cap: toAsm(b.cap), disc: asmList(b.disc), cavWalls: asmList(b.cavWalls), plate: asmList(b.plateParts), wellWall: asmList(b.wellWallParts), baseWall: asmList(b.baseParts) })),
      cavities: builtKits.map((b) => b.cavities), gap: GAP / 2, skinV: builtKits[0].skinV, tBed, hinge: builtKits.every((b) => b.hinge),
      baseWallParts: asmList(builtKits[0].baseParts),
      pockets: builtKits.map((b) => b.pocket),
      outer: builtKits.map((b) => pieces[b.k].outer),
      inner: builtKits.map((b) => b.inner),
      zLeg: [zLo - wt / 2 - LEG_W / 2, zHi + wt / 2 + LEG_W / 2],
      band: builtKits.map((b) => (footOn ? Array.from({ length: 9 }, (_, i) => zLo * (1 - i / 8)).map((z) => bands[b.k].b0.map(([, s2, t2]): V3 => [z, s2, t2])) : [])),
      alpha, seat, clr, zEnd, sealDepth, zB0, foot: footDbg,
    },
  };
}
