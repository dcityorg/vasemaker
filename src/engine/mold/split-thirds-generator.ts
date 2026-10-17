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
import { offsetPolygon, clipToXMax, clipToXMin, removeSpikes, signedDist, loftSolid, FOOT_STEP_DEPTH, FOOT_STEP_DRAFT, FOOT_STEP_GAP, FOOT_FLANGE_T, FOOT_FLANGE_OVER } from './split-halves-generator';
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

/** One natch, on every seam: (z, ρ) with ρ the distance from the vase axis along the face. */
export interface ThirdsNatch { z: number; rho: number; r: number }

export interface ThirdsKit {
  /** Which piece (0-based) this kit pours; with one kit, every piece. */
  piece: number;
  /** Assembly coordinates (plate faces meet at Z = 0). */
  master: VaseMesh;
  plate: VaseMesh;
  wellWall: VaseMesh;
  /** Print orientations, bottom on the bed: master upright (base down), plate on its end. */
  masterPrint: VaseMesh;
  platePrint: VaseMesh;
  wellWallPrint: VaseMesh;
  /** The base-end wall this kit pours with (its boss fits this piece's foot disc). */
  baseWall: VaseMesh;
  baseWallPrint: VaseMesh;
  plasterVolumeMm3: number;
}

/** The foot piece's own mold (print coords: plate top = the foot's face against the pieces). */
export interface ThirdsFoot {
  /** Lifted so it sits on the bed. */
  plate: VaseMesh;
  /** One wall; print it three times. */
  wall: VaseMesh;
  plateStats: MeshStats;
  wallStats: MeshStats;
  plasterVolumeMm3: number;
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
  masterStats: MeshStats;
  plateStats: MeshStats;
  wallStats: MeshStats;
  baseWallStats: MeshStats;
  natches: ThirdsNatch[];
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
    parts: { relief: VaseMesh; cap: VaseMesh; disc: VaseMesh[]; plate: VaseMesh[]; wellWall: VaseMesh[]; baseWall: VaseMesh[] }[];
    baseWallParts: VaseMesh[];
    /** Per kit: the pocket outline, plan (z, s). */
    pockets: P2[][];
    /** Per kit: outer arcs, native. */
    outer: Arc3[][];
    alpha: number;
    seat: number;
    clr: number;
    zEnd: number;
    sealDepth: number;
    /** Plaster starts here (the counterbore mouth with the foot on). */
    zB0: number;
    foot: { stepD: number; M0: number; M1: number; zDeep: number; recessDepth: number; hex: P2[]; plateParts: VaseMesh[]; wallParts: VaseMesh[]; stepTop: P2[]; stepBase: P2[]; base: P2[] } | null;
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

/** Bottom on the bed: a proper rotation, then lift to z ≥ 0. */
function toPrint(m: VaseMesh, rot: (x: number, y: number, z: number) => V3): VaseMesh {
  const r = mapMesh(m, rot);
  return translate(r, 0, 0, -zMin(r));
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

// ── the master ───────────────────────────────────────────────────────────────

/**
 * The relief, Split 2-Pc's buildRelief on a V: outer and inner arcs lofted, a
 * base wall, a top annulus, and skirts dropping `seat` straight down (−t) from
 * each cut edge. Their bottoms lie on the two faces shifted down by `seat`, so
 * the bed is two planar strips that meet along the apex line AO–AI under the
 * base wall. Every face walks each shared edge opposite to its neighbour.
 */
function buildVRelief(outer: Arc3[], inner: Arc3[], seat: number): VaseMesh {
  const b = new MeshBuilder();
  const P: V3[] = [];
  const v = (p: V3) => { P.push(p); return b.vertex(p[0], p[1], p[2]); };
  const n = outer[0].length - 1;
  const O = outer.map((arc) => arc.map(v));
  const I = inner.map((arc) => arc.map(v));
  const bed = (p: V3) => v([p[0], p[1], p[2] - seat]);
  const Ob0 = outer.map((arc) => bed(arc[0]));
  const ObN = outer.map((arc) => bed(arc[n]));
  const Ib0 = inner.map((arc) => bed(arc[0]));
  const IbN = inner.map((arc) => bed(arc[n]));
  const AO = v([outer[0][0][0], 0, -seat]);
  const AI = v([inner[0][0][0], 0, -seat]);
  const L = O.length - 1, M = I.length - 1;

  for (let i = 0; i < L; i++) {
    for (let j = 0; j < n; j++) b.quad(O[i][j], O[i][j + 1], O[i + 1][j + 1], O[i + 1][j]);
    b.quad(O[i][0], O[i + 1][0], Ob0[i + 1], Ob0[i]);
    b.quad(O[i][n], ObN[i], ObN[i + 1], O[i + 1][n]);
  }
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < n; j++) b.quad(I[i][j], I[i + 1][j], I[i + 1][j + 1], I[i][j + 1]);
    b.quad(I[i][0], Ib0[i], Ib0[i + 1], I[i + 1][0]);
    b.quad(I[i][n], I[i + 1][n], IbN[i + 1], IbN[i]);
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

  loop([...O[0].slice().reverse(), Ob0[0], AO, ObN[0]], st);                                // base wall
  loop([...I[0], IbN[0], AI, Ib0[0]], st);                                                   // hollow ceiling
  loop([...O[L], ObN[L], IbN[M], ...I[M].slice().reverse(), Ib0[M], Ob0[L]], st);            // top annulus
  loop([...Ob0, ...Ib0.slice().reverse(), AI, AO], zs);                                      // bed, face B
  loop([AI, ...IbN, ...ObN.slice().reverse(), AO], zs);                                      // bed, face A

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
    plasterVolumeMm3: 0, masterStats: st, plateStats: st, wallStats: st, baseWallStats: st,
    natches: [], natchNote: null, foot: null, error,
    layout: { rW: 0, H: 0, zLo: 0, zHi: 0, seat: 0, plateL: 0, plateW: 0, plateH: 0, wallH: 0 },
    debug: { parts: [], baseWallParts: [], pockets: [], outer: [], alpha: 0, seat: 0, clr: 0, zEnd: 0, sealDepth: 0, zB0: 0, foot: null },
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

  // ── Foot piece (Phase 3, Gary 2026-10-16): as Split Halves, the pieces stop
  // stepD below the vase bottom; there the master carries a DISC (the base
  // outline grown by Margin, drafted wider over stepD) that moulds a
  // counterbore into each piece's bottom end, and runs on straight into the
  // base wall's boss. NO envelope with the well end: the thirds' walls never
  // swap ends (every piece pours the same way round), so the base wall's bore
  // is just this piece's disc. ──
  const footOn = mold.thirdsFootPiece;
  const stepD = FOOT_STEP_DEPTH;
  const stepTan = tanDeg(FOOT_STEP_DRAFT);
  const M0 = Math.max(1, mold.thirdsFootMargin), M1 = M0 + stepD * stepTan;
  const xF = stepD - FOOT_FLANGE_T;
  const ring0 = outerStack.rings[0];
  type DiscSet = { m0: Arc3; m1: Arc3; mEmb: Arc3; m1f: Arc3; mF: Arc3; plug: Arc3 };
  const discs: DiscSet[] = [];
  if (footOn) {
    for (const w of wedges) {
      const cut = (M: number) => cutWedge(offsetRingRadial(ring0, c0x, c0y, M, 0, rRes), rRes, c0x, c0y, w, nArc);
      const d = { m0: cut(M0), m1: cut(M1), mEmb: cut(M0 + (stepD + EMBED) * stepTan), m1f: cut(M1 + clr + FOOT_FLANGE_OVER), mF: cut(M0 + xF * stepTan), plug: cut(-0.1) };
      if (Object.values(d).some((a) => !a)) return errorResult('The foot piece could not be cut at this Seam Angle. Try another angle.', N);
      discs.push(d as DiscSet);
    }
  }

  // ── Block: plaster reaches rW along each face and up to the level H. ──
  let rhoMax = 0, tMax = 0;
  for (const r of outerRings) for (let t = 0; t < rRes; t++) rhoMax = Math.max(rhoMax, Math.hypot(r[t * 3] - c0x, r[t * 3 + 1] - c0y));
  for (const pc of pieces) for (const arc of pc.outer) for (const [, , t] of arc) tMax = Math.max(tMax, t);
  const rW = rhoMax + m;
  const H = tMax + m;
  // With the foot on, the plaster starts at the counterbore mouth and the base
  // wall's boss (Well Seal long, like the well end's) holds the disc's run.
  const zB0 = footOn ? -stepD : -m;
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
    for (const a of arcs) for (const q of [a[0], a[nArc]]) r = Math.max(r, Math.hypot(q[1], q[2]));
    return r + clr;
  };
  // With the foot on, the counterbore (and the flange's recess at its mouth)
  // is part of what a natch must keep clear of.
  const rhoFoot: P2[] = footOn
    ? [
      [zB0 - 1, 0], [zB0 - 1, rhoEnds(discs.map((d) => d.m1f))],
      [zB0 + FOOT_FLANGE_T, rhoEnds(discs.map((d) => d.m1f))], [zB0 + FOOT_FLANGE_T, rhoEnds(discs.map((d) => d.mF))],
      [0, rhoEnds(discs.map((d) => d.m0))],
    ]
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

  // ── Plate parts that are the same for every kit: base slab, legs, ridges,
  // domes. The top slab carries the kit's own pocket. ──
  const rect: P2[] = [[zP0, -sEdge], [zP1, -sEdge], [zP1, sEdge], [zP0, sEdge]];
  const baseSlab = creasedSlab(rect, [], (s) => Vt(s) - seat, (s) => Vt(s) - seat - floorV);
  const legs = [1, -1].map((sg) => {
    const sL = rhoWc * sa * sg, x0 = sL - LEG_W / 2, x1 = sL + LEG_W / 2;
    const top = (s: number) => Vt(s) - seat - floorV + EMBED;
    return extrudeSolid([[x0, tBed], [x1, tBed], [x1, top(x1)], [x0, top(x0)]], [], zP0, zP1, MAP_YZ_X);
  });
  /** A closed loop on the plate surface, `d` in from the plate edge, A0 → A1 → apex → B1 → B0 → apex. */
  const plateLoop = (d: number): { V: V3[]; segs: { o: V3; n: V3 }[] } => {
    const r = rhoEdge - d, z0 = zP0 + d, z1 = zP1 - d;
    return {
      V: [onFace(1, z0, r), onFace(1, z1, r), [z1, 0, 0], onFace(-1, z1, r), onFace(-1, z0, r), [z0, 0, 0]],
      segs: [fA, { o: Z, n: fA.n }, { o: Z, n: fB.n }, fB, { o: mZ, n: fB.n }, { o: mZ, n: fA.n }],
    };
  };
  const ridgeCs: P2[] = [[-vw / 2, -EMBED], [vw / 2, -EMBED], [0, V_HEIGHT]];
  const ridges = band.map((d) => { const { V, segs } = plateLoop(d); return framedSweep(V, segs, ridgeCs, true); });
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
  const builtKits = kitIdx.map((k) => {
    const { outer, inner } = pieces[k];
    const relief = buildVRelief(outer, inner, seat);
    const last = outer[outer.length - 1];
    const capArc: P2[] = last.map(([, s, t]) => [s, t]);
    const n = capArc.length - 1;
    const capPoly = dedupeLoop(offsetPolygon([...capArc, [capArc[n][0], capArc[n][1] - seat], [0, -seat], [capArc[0][0], capArc[0][1] - seat]], -0.1));
    const cap = extrudeSolid(capPoly, [], zEnd - CAP_RECESS - shell, zEnd - CAP_RECESS, MAP_YZ_X);
    // Foot disc (solid), each section closed down to the V bed like the cap:
    // drafted over the counterbore (z 0 → −stepD), the 1 mm flange inside the
    // mouth that covers the boss's fit gap, the straight run into the boss
    // (starting inside the flange so the two never share a face), and a plug
    // lapping into the relief's solid base — the disc's z = 0 face only
    // touches the relief.
    const disc: VaseMesh[] = [];
    const secOf = (arc: Arc3, bed = -seat): P2[] => {
      const q = arc.map(([, s2, t2]) => [s2, t2] as P2), e = q.length - 1;
      return [...q, [q[e][0], q[e][1] + bed], [0, bed], [q[0][0], q[0][1] + bed]];
    };
    if (footOn) {
      const d = discs[k];
      disc.push(
        // Stations in increasing w: loftSolid's caps assume it.
        loftSolid([
          { outer: secOf(d.mEmb), holes: [], w: -stepD - EMBED },
          { outer: secOf(d.m1), holes: [], w: -stepD },
          { outer: secOf(d.m0), holes: [], w: 0 },
        ], MAP_YZ_X),
        extrudeSolid(secOf(d.m1), [], zLo, zB0 + EMBED, MAP_YZ_X),
        extrudeSolid(secOf(d.m1f), [], zB0, zB0 + FOOT_FLANGE_T, MAP_YZ_X),
        extrudeSolid(secOf(d.plug, -seat + 0.1), [], -Math.min(1, stepD / 2), Math.min(1, shell / 2), MAP_YZ_X),
      );
    }
    const master = mergeMeshes([relief, cap, ...disc]);
    const flags = undercutThirds(outer, wedges[k]);

    // Pocket: the skirt footprint in plan (z, s), grown by the clearance and
    // cut at the well wall's inner face.
    const sideB: P2[] = outer.map((arc) => [arc[0][0], arc[0][1]]);
    const sideA: P2[] = outer.map((arc) => [arc[nArc][0], arc[nArc][1]]);
    const dd = (run: P2[]) => run.filter((q, i) => i === 0 || Math.hypot(q[0] - run[i - 1][0], q[1] - run[i - 1][1]) > 1e-6);
    // The disc's skirts too, from the base wall to the vase bottom.
    const discB: P2[] = [], discA: P2[] = [];
    if (footOn) {
      const d = discs[k];
      const run: [number, Arc3][] = [[zLo, d.m1], [zB0, d.m1], [zB0, d.m1f], [zB0 + FOOT_FLANGE_T, d.m1f], [zB0 + FOOT_FLANGE_T, d.mF], [0, d.m0]];
      for (const [z, a] of run) { discB.push([z, a[0][1]]); discA.push([z, a[nArc][1]]); }
    }
    const fp = [...discB, ...dd(sideB), ...dd(sideA).reverse(), ...discA.reverse()];
    let pocketLoop = clipToXMax(offsetPolygon(fp, clr), zHi);
    if (footOn) pocketLoop = clipToXMin(pocketLoop, zLo);
    const pocket = removeSpikes(dedupeLoop(pocketLoop));
    const topSlab = creasedSlab(rect, [pocket], Vt, (s) => Vt(s) - seat - EMBED, pocketHoles, bowls);
    const plateParts = [baseSlab, topSlab, ...legs, ...ridges, ...domes];

    // Well-end boss: the end section inside the side walls, standing Well Seal
    // proud of the wall, with a bore = the well's end outline + clearance.
    // The base wall gets the same round the foot disc's straight run.
    const boss = bossFor(capArc, zHi - sealDepth, zHi + EMBED);
    const wellWallParts = [...wallCommon(true), boss];
    const baseParts = footOn ? [...baseWallParts, bossFor(discs[k].m1.map(([, s2, t2]) => [s2, t2] as P2), zLo - EMBED, zB0)] : baseWallParts;

    // Plaster: the block section along the plaster run, less the vase + well
    // slice inside it.
    let env = 0;
    const secArea = (arc: Arc3) => Math.abs(polyArea([...arc.map(([, s, t]) => [s, t] as P2), [0, 0]]));
    for (let i = 0; i + 1 < outer.length; i++) {
      const za = outer[i][0][0], zb = outer[i + 1][0][0];
      env += ((zb - za) * (secArea(outer[i]) + secArea(outer[i + 1]))) / 2;
    }
    env -= secArea(last) * sealDepth;
    // With the foot, the plaster starts at the mouth and the counterbore is cut out of it.
    if (footOn) env += (stepD * (secArea(discs[k].m0) + secArea(discs[k].m1))) / 2;
    const plasterVol = Math.max(0, plasterArea * (zPl - zB0) - env);

    return { k, relief, cap, disc, master, flags, plateParts, wellWallParts, baseParts, pocket, plasterVol };
  });

  // ── The foot piece's mold (Gary, 2026-10-16): a flat plate carrying the step
  // pocket and the foot face, upside down, and three identical walls round a
  // HEXAGON — the three pieces' bottom face exactly, so one strap holds all
  // four. Foot coords: plan (x, −y) about the vase axis, z = print height, so
  // the plate top (z = 0) is the foot's face against the pieces and the
  // pocket floor is the vase bottom: the world turned over about x, a
  // rotation, never a mirror. Each wall = one piece's top side + half of each
  // seam side; the hexagon is 3-fold symmetric (every piece's section is
  // endPoly(rW)), so one wall design fits all three places. Its two ends meet
  // the neighbours at seam blocks — grooves at the start, ridges at the end.
  let foot: ThirdsFoot | null = null;
  let footDbg: SplitThirdsMoldMeshes['debug']['foot'] = null;
  let footDisplay: { plate: VaseMesh; walls: VaseMesh; plaster: VaseMesh; reach: number; lift: number } | null = null;
  if (footOn) {
    const toFR = (ring: Ring): P2[] => {
      const out: P2[] = [];
      for (let t = 0; t < rRes; t++) out.push([ring[t * 3] - c0x, -(ring[t * 3 + 1] - c0y)]);
      return out;
    };
    // Hexagon corners in world plan, CCW (pieces by increasing angle, face B
    // then face A), then into foot coords — y flips, so reverse to stay CCW.
    const ep = endPoly(rW);
    const hexW: P2[] = [];
    for (const w of wedges) for (const [s2, t2] of [ep[4], ep[0]]) hexW.push([s2 * w.qx + t2 * w.bx, s2 * w.qy + t2 * w.by]);
    const hex: P2[] = hexW.map(([x, y]) => [x, -y] as P2).reverse();
    // hex[2j], hex[2j+1] = a piece's top side; (2j+1, 2j+2) a seam side.
    const FT = m;
    const fBase = mold.footSmoothInner ? outerStack.smoothBase : ring0;
    const hF = Math.max(0, mold.footHeight);
    let fw = mold.footWidth, sw = mold.footSlopeWidth;
    let rMin = Infinity;
    for (let t = 0; t < rRes; t++) rMin = Math.min(rMin, Math.hypot(fBase[t * 3] - c0x, fBase[t * 3 + 1] - c0y));
    const avail = rMin - 0.5;
    const recess = hF > 1e-6 && sw > 0 && avail > 0.2;
    if (recess && fw + sw > avail) { const kk = avail / (fw + sw); fw *= kk; sw *= kk; }
    const nSt = recess ? Math.max(1, Math.round(hF / Math.max(0.05, mold.footStepHeight))) : 0;
    const sh = recess ? hF / nSt : 0;
    const inset = (d: number) => toFR(offsetRingRadial(fBase, c0x, c0y, -d, 0, rRes));
    const riser = (j: number) => inset(fw + (sw * j) / nSt);
    const zDeep = -stepD - (recess ? hF : 0);
    const plateOut = offsetPolygon(hex, border);
    const P = (M: number) => toFR(offsetRingRadial(ring0, c0x, c0y, M, 0, rRes));
    const stepTop = P(M0 - FOOT_STEP_GAP), stepBase = P(M1 - FOOT_STEP_GAP);
    const plateParts: VaseMesh[] = [extrudeSolid(plateOut, [], zDeep - floorT, zDeep)];
    if (recess) {
      plateParts.push(extrudeSolid(plateOut, [riser(0)], zDeep - EMBED, -stepD));
      // Each tread laps 0.1 under the taller one outside it.
      for (let j = 1; j < nSt; j++) plateParts.push(extrudeSolid(inset(fw + (sw * (j - 1)) / nSt - 0.1), [riser(j)], zDeep - EMBED, -stepD - j * sh));
    }
    plateParts.push(loftSolid([
      { outer: plateOut, holes: [P(M0 - FOOT_STEP_GAP - EMBED * stepTan)], w: -stepD - EMBED },
      { outer: plateOut, holes: [stepBase], w: 0 },
    ]));
    // The three flange ridges, closed loops `d` in from the plate edge.
    const up: V3 = [0, 0, 1];
    const outN = (a: P2, b: P2): V3 => { const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1; return [ey / L, -ex / L, 0]; };
    for (const d of band) {
      const loop = offsetPolygon(hex, border - d);
      const V: V3[] = loop.map(([x, y]) => [x, y, 0]);
      const segs = loop.map((a, i) => ({ o: outN(a, loop[(i + 1) % loop.length]), n: up }));
      plateParts.push(framedSweep(V, segs, ridgeCs, true));
    }

    // Wall 0: piece 0's top side (hex 0 → 1) + half of each neighbouring seam side.
    const mid = (a: P2, b: P2): P2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const C = offsetPolygon(hex, wt / 2);
    const iPrev = hex.length - 1;
    const path2: P2[] = [mid(C[iPrev], C[0]), C[0], C[1], mid(C[1], C[2])];
    const sideN = [outN(hex[iPrev], hex[0]), outN(hex[0], hex[1]), outN(hex[1], hex[2])];
    const segsW = sideN.map((o) => ({ o, n: up }));
    const body = framedSweep(path2.map(([x, y]) => [x, y, 0] as V3), segsW, [[-wt / 2, 0], [wt / 2, 0], [wt / 2, FT], [-wt / 2, FT]], false);
    // The clip flange stops TAB_T short of each end, where the seam blocks take over.
    const along = (a: P2, b: P2, d: number): P2 => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [a[0] + ((b[0] - a[0]) * d) / L, a[1] + ((b[1] - a[1]) * d) / L]; };
    const flPath: P2[] = [along(path2[0], path2[1], TAB_T), path2[1], path2[2], along(path2[3], path2[2], TAB_T)];
    const flangeF = framedSweep(flPath.map(([x, y]) => [x, y, 0] as V3), segsW, flangeCs, false);
    /** Seam block at a wall end: `M` on the hexagon's inner line at the seam,
     *  `e` along the side INTO this wall, `o` outward. As the V-plate walls'
     *  seamBlock, flat: grooves over the plate ridges underneath, vertical Vs
     *  on the seam face, standing up to the plaster level. */
    const footSeamBlock = (M: P2, e: P2, o: V3, ridge: boolean): VaseMesh => {
      const a0 = wt - TAB_LIP, a1 = wt + flangeW;
      const dams = band.map((d) => a1 - d);
      const face = (a: number): number => {
        for (const dm of dams) {
          const t = Math.abs(a - dm);
          if (ridge) { if (t < vw / 2) return V_HEIGHT * (1 - t / (vw / 2)); }
          else if (t < gW) return -gH * (1 - t / gW);
        }
        return 0;
      };
      const floor = (a: number): number => {
        for (const dm of dams) { const t = Math.abs(a - dm); if (t < gW) return gHf * (1 - t / gW); }
        return 0;
      };
      const cols = [a0, a1];
      for (const dm of dams) cols.push(dm - gW, dm - vw / 2, dm, dm + vw / 2, dm + gW);
      const as = cols.map((a) => Math.min(Math.max(a, a0), a1)).sort((x, y) => x - y).filter((a, i, arr) => i === 0 || a - arr[i - 1] > 1e-4);
      const alIn = TAB_T + EMBED;
      const mb = new MeshBuilder();
      const pt = (al: number, a: number, h: number) => mb.vertex(M[0] + al * e[0] + a * o[0], M[1] + al * e[1] + a * o[1], h);
      const rings = as.map((a) => {
        const alS = -face(a), h0 = floor(a);
        return ([[alIn, h0], [alIn, FT], [alS, FT], [alS, h0]] as P2[]).map(([al, h]) => pt(al, a, h));
      });
      for (let j = 0; j + 1 < rings.length; j++) for (let i = 0; i < 4; i++) { const iN = (i + 1) % 4; mb.quad(rings[j][i], rings[j][iN], rings[j + 1][iN], rings[j + 1][i]); }
      const last = rings.length - 1;
      for (let i = 1; i + 1 < 4; i++) { mb.tri(rings[last][0], rings[last][i], rings[last][i + 1]); mb.tri(rings[0][0], rings[0][i + 1], rings[0][i]); }
      return ensureOutward(mb.build());
    };
    const unit = (a: P2, b: P2): P2 => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
    const mStart = mid(hex[iPrev], hex[0]), mEnd = mid(hex[1], hex[2]);
    const wallParts = [
      body, flangeF,
      footSeamBlock(mStart, unit(hex[iPrev], hex[0]), sideN[0], false),
      footSeamBlock(mEnd, unit(hex[2], hex[1]), sideN[2], true),
    ];
    const wallF = mergeMeshes(wallParts);
    const rotZ = (mesh: VaseMesh, ang: number) => { const c = Math.cos(ang), sn = Math.sin(ang); return mapMesh(mesh, (x, y, z) => [x * c - y * sn, x * sn + y * c, z]); };
    let vol = Math.abs(polyArea(hex)) * FT + (stepD * (Math.abs(polyArea(stepTop)) + Math.abs(polyArea(stepBase)))) / 2;
    for (let j = 0; j < nSt; j++) vol += Math.abs(polyArea(riser(j))) * sh;
    const plateF = mergeMeshes(plateParts);
    const lift = floorT - zDeep;
    const platePrintF = translate(plateF, 0, 0, lift);
    foot = { plate: platePrintF, wall: wallF, plateStats: computeMeshStats(platePrintF), wallStats: computeMeshStats(wallF), plasterVolumeMm3: vol };
    let reach = 0;
    for (const [x, y] of plateOut) reach = Math.max(reach, Math.hypot(x, y));
    footDisplay = {
      plate: plateF,
      walls: mergeMeshes([wallF, rotZ(wallF, (2 * Math.PI) / 3), rotZ(wallF, (4 * Math.PI) / 3)]),
      plaster: extrudeSolid(hex, [], 0, FT),
      reach, lift,
    };
    footDbg = { stepD, M0, M1, zDeep, recessDepth: recess ? hF : 0, hex, plateParts, wallParts, stepTop, stepBase, base: toFR(ring0) };
  }

  // ── To assembly coordinates, print orientations, display. ──
  const asmList = (ms: VaseMesh[]) => ms.map(toAsm);
  const sharedBaseWall = !footOn || builtKits.length === 1;
  // Master upright (vase base down): new = (Z, Y, −X). Plate on its end: (Y, Z, X).
  const upright = (x: number, y: number, z: number): V3 => [z, y, -x];
  const onEnd = (x: number, y: number, z: number): V3 => [y, z, x];
  const kits: ThirdsKit[] = builtKits.map((b) => {
    const master = toAsm(b.master);
    const plate = toAsm(mergeMeshes(b.plateParts));
    const wellWall = toAsm(mergeMeshes(b.wellWallParts));
    const baseWall = toAsm(mergeMeshes(b.baseParts));
    return {
      piece: b.k, master, plate, wellWall,
      masterPrint: toPrint(master, upright),
      platePrint: toPrint(plate, onEnd),
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
    // Sizes as printed: master upright, plate on its end, walls as assembled.
    masterStats: computeMeshStats(kits[0].masterPrint),
    plateStats: computeMeshStats(kits[0].platePrint),
    wallStats: computeMeshStats(kits[0].wellWallPrint),
    baseWallStats: computeMeshStats(baseWallPrint),
    natches, natchNote, foot, error: null,
    layout: { rW, H, zLo, zHi, seat, plateL: zP1 - zP0, plateW: 2 * sEdge, plateH, wallH: H - tBed },
    debug: {
      parts: builtKits.map((b) => ({ relief: toAsm(b.relief), cap: toAsm(b.cap), disc: asmList(b.disc), plate: asmList(b.plateParts), wellWall: asmList(b.wellWallParts), baseWall: asmList(b.baseParts) })),
      baseWallParts: asmList(builtKits[0].baseParts),
      pockets: builtKits.map((b) => b.pocket),
      outer: builtKits.map((b) => pieces[b.k].outer),
      alpha, seat, clr, zEnd, sealDepth, zB0, foot: footDbg,
    },
  };
}
