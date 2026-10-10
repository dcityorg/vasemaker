/**
 * Split two-piece mold generator — two PLASTER halves split by a vertical plane
 * through the vase axis, each poured in its own throwaway printed tray.
 *
 * Every other style casts one plaster block and pulls the vase straight out of
 * it, so the vase may never narrow going up. Here each plaster half pulls
 * SIDEWAYS, perpendicular to the split plane — and for any round cross-section
 * that always releases, so necks, bellies and rolled rims are all castable.
 *
 * One tray per half (Tony Hansen's digitalfire.com method — the tray is peeled
 * off with a heat gun and thrown away). Each tray is a set of overlapping closed
 * solids, the HandleMaker way:
 *   1. RELIEF — the half-vase (+ well), standing up off the floor as a thin
 *      skin, hollow underneath and open to the bed. Its two edges continue
 *      straight down to the bed as a skirt, so it laps into the floor slab
 *      instead of meeting it in a coplanar seam.
 *   2. FLOOR SLAB — the parting face, with a hole under the relief (so the
 *      slicer can put tree supports inside the hollow and they pull out from
 *      below) and pockets carved into its top for the plaster bumps.
 *   3. WALLS — four boxes; plaster pours into the open top.
 *   4. DOMES — proud caps on the floor that mould the plaster dimples.
 *
 * Print space (per half): X = vase height, Y = along the split line,
 * Z = height above the bed. The parting face is the floor top at Z = F. Half A
 * maps with (s, p) = (seam dir, pull dir); half B with (−s, −p), which is a
 * rotation, so both are right-handed and B is never a mirror of A.
 *
 * Plan + rationale: local-docs/moldmaker-split2pc-plan.md.
 */

import type { VaseParameters, VaseMesh } from '../types';
import { computeMeshStats, MeshStats } from '../mesh-stats';
import { offsetRingRadial, mergeMeshes, Ring } from './ring-mesh';
import { tanDeg, prepareVaseParams, buildOuterRings, buildCavityRings } from './mold-generator';
import { ShapeUtils, Vector2 } from 'three';
import { MeshBuilder, ensureOutward, triangulateFace, translateMesh, boxSolid, circlePoints, weldMesh, type P2 } from '../handle/mesh3';
import { buildDome } from '../handle/mold-parts';
import type { MoldParameters } from './mold-types';

/** How far the relief pokes into the end wall, mm. */
const EMBED = 0.3;
/** Minimum floor under a natch pocket, mm. */
const POCKET_FLOOR = 0.8;
/** Plaster kept between a natch and the block edge / the vase, mm — thinner chips when parting the halves. */
const NATCH_EDGE = 4;
/** Gap between the two trays in the laid-out display, mm. */
const LAYOUT_GAP = 20;
const DOME_SEG = 48;
const DOME_RINGS = 8;

export interface SplitTwoPieceMoldMeshes {
  style: 'splitTwoPiece';
  /** Tray A in print position (floor on the bed). */
  trayA: VaseMesh;
  /** Tray B in print position. */
  trayB: VaseMesh;
  /** Both trays laid out side by side — what the viewport shows. */
  trays: VaseMesh;
  /** Display plaster: one translucent block over each tray, laid out like `trays`. */
  plaster: VaseMesh;
  /** Per-vertex 0..1 sideways-pull undercut factor, aligned with `trays`. */
  undercutFlags: Float32Array;
  hasUndercuts: boolean;
  /** Plaster for BOTH halves, mm³. */
  plasterVolumeMm3: number;
  trayStats: MeshStats;
  /** Natch dome radius actually used (clamped to the plaster margin), mm. */
  natchRadius: number;
  /** Non-null when the vase cannot be split at this angle (a ring misses the split plane). */
  error: string | null;
  /** Tray A's separate solids (relief, floor, 4 walls, domes) — for the verify scripts. */
  partsA: VaseMesh[];
  partsB: VaseMesh[];
  /** Parting face height (floor top) in print space, mm. */
  floorTop: number;
  /** Natch centres in world split-plane coords (z along the vase, u along the split line). */
  bumpsA: P2[];
  dimplesA: P2[];
}

/** One half-ring: N+1 points from split plane to split plane, in print space. */
type Arc = [number, number, number][];

interface HalfFrame { sx: number; sy: number; px: number; py: number }

/**
 * Cut a closed ring by the split plane and return the arc on the +pull side,
 * resampled to n+1 points evenly in ring-index space (so consecutive rings
 * pair up point for point). Endpoints are the exact plane crossings.
 *
 * The arc runs from the first upward crossing after the ring's most negative
 * point to the last downward crossing before it — so a texture ripple that
 * dips through the plane near the seam stays IN the arc (and gets flagged as
 * an undercut) instead of cutting the arc short.
 */
function cutArc(ring: Ring, rRes: number, cx: number, cy: number, f: HalfFrame, F: number, n: number): Arc | null {
  const h = new Float64Array(rRes);
  let tMin = 0;
  for (let t = 0; t < rRes; t++) {
    h[t] = (ring[t * 3] - cx) * f.px + (ring[t * 3 + 1] - cy) * f.py;
    if (h[t] < h[tMin]) tMin = t;
  }
  if (h[tMin] >= 0) return null;
  // Forward from the minimum to the first neg → non-neg edge.
  // NaN, not −1, for "not found": a crossing just before index 0 is a
  // legitimately negative position, and a −1 sentinel rejected it (twisted
  // rectangle, 2026-10-09).
  let tIn = NaN;
  for (let k = 0; k < rRes; k++) {
    const a = (tMin + k) % rRes, b = (a + 1) % rRes;
    if (h[a] < 0 && h[b] >= 0) { tIn = (tMin + k) + (-h[a]) / (h[b] - h[a]); break; }
  }
  // Backward from the minimum to the last non-neg → neg edge.
  let tOut = NaN;
  for (let k = 0; k < rRes; k++) {
    const b = ((tMin - k) % rRes + rRes) % rRes, a = (b - 1 + rRes) % rRes;
    if (h[a] >= 0 && h[b] < 0) { tOut = (tMin - k - 1) + h[a] / (h[a] - h[b]); break; }
  }
  if (Number.isNaN(tIn) || Number.isNaN(tOut)) return null;
  while (tOut <= tIn) tOut += rRes;
  if (tOut - tIn > rRes) tOut -= rRes;

  const arc: Arc = [];
  for (let i = 0; i <= n; i++) {
    const tf = tIn + ((tOut - tIn) * i) / n;
    const i0 = Math.floor(tf), fr = tf - i0;
    const a = ((i0 % rRes) + rRes) % rRes, b = (a + 1) % rRes;
    let x = ring[a * 3] + (ring[b * 3] - ring[a * 3]) * fr;
    let y = ring[a * 3 + 1] + (ring[b * 3 + 1] - ring[a * 3 + 1]) * fr;
    const z = ring[a * 3 + 2] + (ring[b * 3 + 2] - ring[a * 3 + 2]) * fr;
    x -= cx; y -= cy;
    let hz = x * f.px + y * f.py;
    if (i === 0 || i === n) hz = 0; // exact crossings — kill float noise
    arc.push([z, x * f.sx + y * f.sy, F + hz]);
  }
  return arc;
}

/**
 * The relief: outer arcs (vase + well) and inner arcs (skin) lofted, closed by
 * a base wall, a top cap, two skirts down to the bed, and a U-shaped bed face.
 * The inner floor sits one skin above the outer base, so the base is a solid
 * wall and the hollow opens only downward through the bed face.
 *
 * Every face is emitted so that each shared edge is walked in OPPOSITE
 * directions by its two faces (worked through edge by edge — the loops passed
 * to `loop()` below are those traversals, not guesses); ensureOutward then only
 * has to choose the global sign.
 */
function buildRelief(outer: Arc[], inner: Arc[]): VaseMesh {
  const b = new MeshBuilder();
  const P: [number, number, number][] = [];
  const v = (p: [number, number, number]) => { P.push(p); return b.vertex(p[0], p[1], p[2]); };
  const n = outer[0].length - 1;
  const O = outer.map((arc) => arc.map(v));
  const I = inner.map((arc) => arc.map(v));
  const bed = (p: [number, number, number]) => v([p[0], p[1], 0]);
  const Ob0 = outer.map((arc) => bed(arc[0]));
  const ObN = outer.map((arc) => bed(arc[n]));
  const Ib0 = inner.map((arc) => bed(arc[0]));
  const IbN = inner.map((arc) => bed(arc[n]));
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

  /** Triangulate a planar-ish loop in a 2-D projection, every triangle wound
   *  the same way round as the loop itself. */
  const loop = (ids: number[], proj: (p: [number, number, number]) => P2) => {
    const pts = ids.map((id) => proj(P[id]));
    const area = (q: P2[]) => {
      let s = 0;
      for (let k = 0; k < q.length; k++) { const [x1, y1] = q[k], [x2, y2] = q[(k + 1) % q.length]; s += x1 * y2 - x2 * y1; }
      return s;
    };
    const loopSign = Math.sign(area(pts));
    const tris = ShapeUtils.triangulateShape(pts.map(([x, y]) => new Vector2(x, y)), []);
    for (const [i, j, k] of tris) {
      const s = Math.sign(area([pts[i], pts[j], pts[k]]));
      if (s === 0) continue;
      if (s === loopSign) b.tri(ids[i], ids[j], ids[k]);
      else b.tri(ids[i], ids[k], ids[j]);
    }
  };
  const yz = (p: [number, number, number]): P2 => [p[1], p[2]];
  const xy = (p: [number, number, number]): P2 => [p[0], p[1]];

  loop([...O[0].slice().reverse(), Ob0[0], ObN[0]], yz);                                  // base wall
  loop([...I[0], IbN[0], Ib0[0]], yz);                                                      // hollow ceiling
  loop([...O[L], ObN[L], IbN[M], ...I[M].slice().reverse(), Ib0[M], Ob0[L]], yz);           // top annulus
  loop([...Ob0, ...Ib0.slice().reverse(), ...IbN, ...ObN.slice().reverse()], xy);           // bed face

  return ensureOutward(b.build());
}

/** Floor slab: rect with the relief hole through it and natch pockets carved
 *  into its top face (inverted spherical caps — they mould the plaster bumps). */
function buildFloor(rect: [number, number, number, number], hole: P2[], pockets: P2[], a: number, h: number, F: number): VaseMesh {
  const b = new MeshBuilder();
  const [x0, y0, x1, y1] = rect;
  const outerLoop: P2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const circles = pockets.map(([cx, cy]) => circlePoints(cx, cy, a, DOME_SEG));

  const wall = (loop: P2[]) => {
    const bot = loop.map(([x, y]) => b.vertex(x, y, 0));
    const top = loop.map(([x, y]) => b.vertex(x, y, F));
    for (let i = 0; i < loop.length; i++) {
      const j = (i + 1) % loop.length;
      b.quad(bot[i], bot[j], top[j], top[i]);
    }
  };
  wall(outerLoop);                     // CCW → faces out
  let ha = 0;
  for (let i = 0; i < hole.length; i++) { const [p1, q1] = hole[i], [p2, q2] = hole[(i + 1) % hole.length]; ha += p1 * q2 - p2 * q1; }
  wall(ha > 0 ? hole.slice().reverse() : hole);   // CW → walls face into the hole

  const topFace = triangulateFace(outerLoop, [hole, ...circles]);
  const topIdx = topFace.points.map(([x, y]) => b.vertex(x, y, F));
  for (const [i, j, k] of topFace.tris) b.tri(topIdx[i], topIdx[j], topIdx[k]);
  const botFace = triangulateFace(outerLoop, [hole]);
  const botIdx = botFace.points.map(([x, y]) => b.vertex(x, y, 0));
  for (const [i, j, k] of botFace.tris) b.tri(botIdx[i], botIdx[k], botIdx[j]);

  const R = (a * a + h * h) / (2 * h);
  const phiMax = Math.asin(Math.min(1, a / R));
  const zc = F + R - h;
  for (const [cx, cy] of pockets) {
    const rings: number[][] = [];
    for (let j = 0; j < DOME_RINGS; j++) {
      const phi = phiMax * (1 - j / DOME_RINGS);
      const r = R * Math.sin(phi), z = zc - R * Math.cos(phi);
      const ring: number[] = [];
      for (let k = 0; k < DOME_SEG; k++) {
        const th = (k / DOME_SEG) * Math.PI * 2;
        ring.push(b.vertex(cx + r * Math.cos(th), cy + r * Math.sin(th), z));
      }
      rings.push(ring);
    }
    for (let j = 0; j + 1 < rings.length; j++) {
      for (let k = 0; k < DOME_SEG; k++) {
        const kn = (k + 1) % DOME_SEG;
        b.quad(rings[j][k], rings[j][kn], rings[j + 1][kn], rings[j + 1][k]);
      }
    }
    const bottom = b.vertex(cx, cy, F - h);
    const lr = rings[rings.length - 1];
    for (let k = 0; k < DOME_SEG; k++) b.tri(bottom, lr[k], lr[(k + 1) % DOME_SEG]);
  }
  // The pocket rims and the top face's hole circles are separate vertices at
  // the same positions — weld them so the slab is one closed surface.
  return ensureOutward(weldMesh(b.build()));
}

/** Area of a half-section (arc closed by its chord on the parting plane), in (Y, Z−F). */
function halfSectionArea(arc: Arc, F: number): number {
  let s = 0;
  for (let k = 0; k < arc.length; k++) {
    const [, y1, z1] = arc[k], [, y2, z2] = arc[(k + 1) % arc.length];
    s += y1 * (z2 - F) - y2 * (z1 - F);
  }
  return Math.abs(s) / 2;
}

/**
 * Per-vertex undercut factor over the outer arcs: the half pulls along +Z, so
 * any outer-surface normal pointing DOWN (toward the parting face) locks into
 * the plaster. Points that dip below the parting face are locked outright.
 */
function undercutOf(outer: Arc[], F: number): Float32Array {
  const rows = outer.length, n = outer[0].length - 1;
  const out = new Float32Array(rows * (n + 1));
  const mid = Math.floor(n / 2);
  // Orientation: at the crown the outward normal is +Z.
  let sign = 0;
  for (let i = 1; i + 1 < rows && sign === 0; i++) {
    const nz = normalZ(outer, i, mid);
    if (Math.abs(nz) > 0.5) sign = Math.sign(nz);
  }
  if (sign === 0) sign = 1;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j <= n; j++) {
      let f = 0;
      if (outer[i][j][2] < F - 0.05) f = 1;
      else if (j > 0 && j < n) {
        const nz = sign * normalZ(outer, i, j);
        f = Math.max(0, Math.min(1, (-nz - 0.02) / 0.08));
      }
      out[i * (n + 1) + j] = f;
    }
  }
  return out;
}

function normalZ(outer: Arc[], i: number, j: number): number {
  const rows = outer.length, n = outer[0].length - 1;
  const a = outer[i][Math.max(0, j - 1)], c = outer[i][Math.min(n, j + 1)];
  // Rows that sit at the same height (the razor ledge) have no vertical
  // tangent — step further until one does.
  let ip = Math.max(0, i - 1), inx = Math.min(rows - 1, i + 1);
  while (ip > 0 && Math.abs(outer[ip][j][0] - outer[inx][j][0]) < 1e-6) ip--;
  while (inx < rows - 1 && Math.abs(outer[ip][j][0] - outer[inx][j][0]) < 1e-6) inx++;
  const d = outer[inx][j], e = outer[ip][j];
  const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const v = [d[0] - e[0], d[1] - e[1], d[2] - e[2]];
  const nx = u[1] * v[2] - u[2] * v[1];
  const ny = u[2] * v[0] - u[0] * v[2];
  const nz = u[0] * v[1] - u[1] * v[0];
  const len = Math.hypot(nx, ny, nz);
  return len > 1e-12 ? nz / len : 0;
}

function emptyResult(error: string): SplitTwoPieceMoldMeshes {
  const empty: VaseMesh = { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), vertexCount: 0, triangleCount: 0 };
  return {
    style: 'splitTwoPiece', trayA: empty, trayB: empty, trays: empty, plaster: empty,
    undercutFlags: new Float32Array(0), hasUndercuts: false, plasterVolumeMm3: 0,
    trayStats: computeMeshStats(empty), natchRadius: 0, error, partsA: [], partsB: [], floorTop: 0, bumpsA: [], dimplesA: [],
  };
}

export function generateSplitTwoPieceMold(vase: VaseParameters, mold: MoldParameters): SplitTwoPieceMoldMeshes {
  const rRes = vase.resolution.radial;
  const scale = 1 + mold.shrinkPercent / 100;
  const skin = mold.trayWallThickness;
  const m = mold.plasterThickness;

  const p = prepareVaseParams(vase, scale, mold.keepTexture);
  const texturesEnabled = mold.keepTexture && p.textures.enabled !== false;
  const outerStack = buildOuterRings(p, texturesEnabled);
  const topIdx = outerStack.rings.length - 1;
  const topRing = outerStack.rings[topIdx];
  const [tcx, tcy] = outerStack.centers[topIdx];
  const hTop = outerStack.heights[topIdx];

  // ── Well: razor ledge + drafted wall, exactly the other styles' well, plus a
  // short embed so the relief laps into the end wall. ──
  const draftTan = tanDeg(mold.wellDraftAngle);
  const wellOuterDelta = mold.wellWidth + mold.wellHeight * draftTan;
  const wellTopZ = hTop + mold.wellHeight;
  const ledgeRing = offsetRingRadial(topRing, tcx, tcy, mold.wellWidth, hTop, rRes);
  const wellTopRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta, wellTopZ, rRes);
  const wellEmbRing = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta + EMBED * draftTan, wellTopZ + EMBED, rRes);
  const outerRings: Ring[] = [...outerStack.rings, ledgeRing, wellTopRing, wellEmbRing];

  // Skin: profile-normal offset of the body (full thickness on shoulders),
  // then the same rise-and-run under the ledge the master uses.
  let innerStart = topIdx;
  for (let v = 0; v <= topIdx; v++) if (outerStack.heights[v] >= skin) { innerStart = v; break; }
  const cavity = buildCavityRings(outerStack.rings, outerStack.centers, rRes, innerStart, topIdx, skin);
  const floorTopZ = Math.min(hTop + skin, wellTopZ);
  const cavTop = cavity[cavity.length - 1];
  const riseRing = new Float32Array(cavTop);
  for (let t = 0; t < rRes; t++) riseRing[t * 3 + 2] = floorTopZ;
  const flatRing = offsetRingRadial(ledgeRing, tcx, tcy, -skin, floorTopZ, rRes);
  const wellInnerTop = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - skin, wellTopZ, rRes);
  const wellInnerEmb = offsetRingRadial(topRing, tcx, tcy, wellOuterDelta - skin + EMBED * draftTan, wellTopZ + EMBED, rRes);
  const innerRings: Ring[] = [...cavity, riseRing, flatRing, wellInnerTop, wellInnerEmb];

  // ── Split plane: through the base center, along seamAngle. ──
  const [c0x, c0y] = outerStack.centers[0];
  const a = (mold.seamAngle * Math.PI) / 180;
  const sx = Math.cos(a), sy = Math.sin(a);
  const frameA: HalfFrame = { sx, sy, px: -sy, py: sx };
  const frameB: HalfFrame = { sx: -sx, sy: -sy, px: sy, py: -sx };

  const natchH = mold.natchHeight;
  const F = Math.max(mold.trayFloorThickness, natchH + POCKET_FLOOR);
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
    return emptyResult('The split plane misses part of the vase at this Split Angle (XY Sway can carry it entirely to one side). Try another angle or less sway.');
  }

  // ── Block outline in world split-plane coords (u along s, z up), shared by
  // both halves so their parting faces coincide when assembled. ──
  let uMin = Infinity, uMax = -Infinity, hMaxA = 0, hMaxB = 0;
  for (const r of outerRings) {
    for (let t = 0; t < rRes; t++) {
      const dx = r[t * 3] - c0x, dy = r[t * 3 + 1] - c0y;
      const u = dx * sx + dy * sy, h = dx * frameA.px + dy * frameA.py;
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
      hMaxA = Math.max(hMaxA, h); hMaxB = Math.max(hMaxB, -h);
    }
  }
  const xa = -m, xb = wellTopZ;                       // plaster block, along the vase
  const ua = uMin - m, ub = uMax + m;                 // plaster block, across

  // ── Natches: diagonal pairs in the side bands. Bumps on plaster A at
  // (low, near) and (high, far); dimples at the other two corners. ──
  const natchR = Math.max(2, Math.min(mold.natchDiameter / 2, m / 2 - NATCH_EDGE));
  const inset = Math.max(m / 2, natchR + NATCH_EDGE);
  const zLo = xa + inset, zHi = xb - inset;
  const uNear = ua + m / 2, uFar = ub - m / 2;
  const bumpsA: P2[] = [[zLo, uNear], [zHi, uFar]];   // (z, u) world
  const dimplesA: P2[] = [[zHi, uNear], [zLo, uFar]];

  const buildTray = (outer: Arc[], inner: Arc[], f: HalfFrame, hMax: number, pocketsW: P2[], domesW: P2[]) => {
    const ySign = f.sx === sx && f.sy === sy ? 1 : -1;  // B's Y is −u
    const relief = buildRelief(outer, inner);

    // Floor hole: the inner skirt line, pushed half a skin outward so the
    // floor overlaps the skirt; it starts half a skin into the base wall.
    const n = inner[0].length - 1;
    const side = (j: number) => inner.map((arc) => arc[j]);
    const s0 = side(0), sN = side(n);
    const out0 = Math.sign(s0[0][1] - sN[0][1]) || -1;
    const push = skin / 2;
    const xStart = inner[0][0][0] - push;
    const hole: P2[] = [
      [xStart, s0[0][1] + out0 * push],
      ...s0.map(([x, y]) => [x, y + out0 * push] as P2),
      ...sN.slice().reverse().map(([x, y]) => [x, y - out0 * push] as P2),
      [xStart, sN[0][1] - out0 * push],
    ];

    const yA = ySign > 0 ? ua : -ub, yB = ySign > 0 ? ub : -ua;
    const zTop = F + hMax + m;
    const tw = skin;
    const floor = buildFloor([xa - tw, yA - tw, xb + tw, yB + tw], hole,
      pocketsW.map(([z, u]) => [z, ySign * u] as P2), natchR, natchH, F);
    const walls = [
      boxSolid(xa - tw, yA - tw, xa, yB + tw, 0, zTop),
      boxSolid(xb, yA - tw, xb + tw, yB + tw, 0, zTop),
      boxSolid(xa - tw, yA - tw, xb + tw, yA, 0, zTop),
      boxSolid(xa - tw, yB, xb + tw, yB + tw, 0, zTop),
    ];
    const domes = domesW.map(([z, u]) => translateMesh(buildDome(z, ySign * u, natchR, natchH, DOME_SEG), 0, 0, F));
    const parts = [relief, floor, ...walls, ...domes];
    const tray = mergeMeshes(parts);

    // Undercut flags: the relief's first vertices are the outer arcs, row-major.
    const flags = new Float32Array(tray.vertexCount);
    flags.set(undercutOf(outer, F));

    // Plaster: block interior minus the half-vase envelope above the floor.
    let envelope = 0;
    for (let i = 0; i + 1 < outer.length; i++) {
      const dx = outer[i + 1][0][0] - outer[i][0][0];
      envelope += (dx * (halfSectionArea(outer[i], F) + halfSectionArea(outer[i + 1], F))) / 2;
    }
    const blockVol = (xb - xa) * (yB - yA) * (zTop - F);
    const plaster = boxSolid(xa, yA, xb, yB, F, zTop);
    return { tray, parts, flags, plasterVol: Math.max(0, blockVol - envelope), plaster, yA, yB };
  };

  const A = buildTray(outA, inA, frameA, hMaxA, bumpsA, dimplesA);
  const B = buildTray(outB, inB, frameB, hMaxB, dimplesA, bumpsA);

  // ── Laid out for display: A on the left, B on the right, centered. ──
  const cx = -(xa + xb) / 2;
  const dyA = -A.yB - LAYOUT_GAP / 2, dyB = -B.yA + LAYOUT_GAP / 2;
  const trays = mergeMeshes([translateMesh(A.tray, cx, dyA, 0), translateMesh(B.tray, cx, dyB, 0)]);
  const plaster = mergeMeshes([translateMesh(A.plaster, cx, dyA, 0), translateMesh(B.plaster, cx, dyB, 0)]);
  const undercutFlags = new Float32Array(trays.vertexCount);
  undercutFlags.set(A.flags, 0);
  undercutFlags.set(B.flags, A.tray.vertexCount);
  let hasUndercuts = false;
  for (let i = 0; i < undercutFlags.length; i++) if (undercutFlags[i] >= 0.999) { hasUndercuts = true; break; }

  return {
    style: 'splitTwoPiece',
    trayA: A.tray,
    trayB: B.tray,
    trays,
    plaster,
    undercutFlags,
    hasUndercuts,
    plasterVolumeMm3: A.plasterVol + B.plasterVol,
    trayStats: computeMeshStats(A.tray),
    natchRadius: natchR,
    error: null,
    partsA: A.parts,
    partsB: B.parts,
    floorTop: F,
    bumpsA,
    dimplesA,
  };
}

