/**
 * The plaster PLUG foot, shared by Split Thirds (2026-10-17) and Split Halves
 * (2026-10-18). The master carries a BAND — the vase's bottom outline run
 * straight down Plug Height — with a rounded RING round its middle; the
 * pieces get a groove from the ring, and the plug, cast in its own CUP, gets
 * the matching ridge, so the strapped pieces hold it.
 *
 * The cup: a bottom disk shaped like the vase bottom (foot ring + recessed
 * middle) resting on a ledge inside 2–4 clip-together walls — the fewest that
 * pull straight off the plug — each with the groove that gives the plug its
 * ridge. Moved here from split-thirds-generator.ts unchanged, so both styles
 * build it from one source.
 */

import type { VaseMesh } from '../types';
import { computeMeshStats, type MeshStats } from '../mesh-stats';
import { computeNormals } from '../normals';
import { offsetRingRadial, mergeMeshes, type Ring } from './ring-mesh';
import { extrudeSolid, type P2 } from '../handle/mesh3';
import { seamBandPositions, seamMaxVWidth } from '../handle/mold-parts';
import { loftSolid } from './split-halves-generator';
import { markSampler, floorLayout, MIN_FLOOR } from '../bottom';
import type { BottomSettings } from '../types';
import type { ReliefField } from '../sprig/relief';

const EMBED = 0.2;
/** Clip flange thickness (Split Thirds' FLANGE_T). */
const FLANGE_T = 3;
const V_WIDTH = 2;
const V_HEIGHT = 1.4;
const V_CLEARANCE = 0.2;
/** The plug's locking ring (Gary 2026-10-17): 4 mm wide, 1.5 mm proud, ROUNDED
 *  crest (a flat top's two corners are what chips off a plaster ridge). One
 *  profile drives the master's ring (→ groove in the pieces) and the cup wall's
 *  groove (→ ridge on the plug). */
export const RING_W = 4;
export const RING_H = 1.5;
/** Plug cup: the ledge the bottom disk rests on, width and thickness, mm. */
const LEDGE_W = 3;
const LEDGE_T = 2;

/** Height of the ring's rounded crest at u from its centre line (0 outside). */
export function ringBump(u: number): number {
  const a = RING_W / 2;
  if (Math.abs(u) >= a) return 0;
  const R = (a * a + RING_H * RING_H) / (2 * RING_H);
  return Math.sqrt(R * R - u * u) - (R - RING_H);
}
/** Stations across the ring, centre-relative, ends at the band surface. */
export const RING_US = [-2, -1.6, -1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2, 1.6, 2].map((f) => (f * RING_W) / 4);

/** The plug cup's print parts. Print coords, each on the bed. */
export interface PlugFoot {
  /** The bottom disk, recess up. */
  plate: VaseMesh;
  /** The cup's walls (2–4, the fewest that pull off the plug), each standing
   *  on its ledge, in CCW order round the cup. Each has V ridges on its first
   *  clip flange and grooves on its last, so a ridge meets a groove at every
   *  seam. `wall` is walls[0]. */
  walls: VaseMesh[];
  wall: VaseMesh;
  /** Every wall is wall 0 turned round (the outline repeats with the walls):
   *  one wall STL, printed `walls.length` times. */
  wallsSame: boolean;
  /** Set when even 4 walls would be gripped by a textured bottom edge. */
  plugNote: string | null;
  /** Set when the mark had to be made shallower to leave the disk a floor. */
  markNote: string | null;
  plateStats: MeshStats;
  wallStats: MeshStats;
  /** One plug. */
  plasterVolumeMm3: number;
  plugHeight: number;
}

/** Plug + cup in cup coords (plan = world turned over about x; z = 0 the plug's vase face). */
export interface PlugDebug { plugH: number; zRing: number; recessDepth: number; zDisk: number; zWall0: number; disk: VaseMesh[]; walls: VaseMesh[][]; seams: number[]; plugOutline: P2[]; base: P2[] }

export interface PlugCupInput {
  /** The vase's bottom ring (scaled), its centre, and the radial resolution. */
  ring0: Ring; c0x: number; c0y: number; rRes: number;
  /** The untextured bottom ring, for Smooth Inside. */
  smoothBase: Ring;
  plugH: number;
  clr: number;
  /** The style's wall thickness, flange width and plate floor. */
  wt: number; flangeW: number; floorT: number;
  footSmoothInner: boolean; footHeight: number; footWidth: number; footSlopeWidth: number;
  /** The maker's mark on the disk (the vase's Foot & Mark; `scale` = the
   *  master's shrink scale, so the mark grows with the outline). */
  mark?: { field: ReliefField; b: BottomSettings; scale: number } | null;
}

function polyArea(p: P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

function translate(m: VaseMesh, dx: number, dy: number, dz: number): VaseMesh {
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < positions.length; i += 3) { positions[i] += dx; positions[i + 1] += dy; positions[i + 2] += dz; }
  return { ...m, positions, normals: new Float32Array(m.normals) };
}

/**
 * The plug's cup. Cup coords: plan (x, −y) about the vase axis, z up, z = 0
 * the plug's vase face — the world turned over about x, a rotation, never a
 * mirror (the plug sits vase face DOWN in its cup). The cup's inside is the
 * band less the clearance, so the plug drops into the pieces' bore; the disk
 * is another clearance smaller so it slides in. Returns an error string when
 * the outline cannot be split into walls.
 */
export function buildPlugCup(inp: PlugCupInput): { foot: PlugFoot; display: { plate: VaseMesh; walls: VaseMesh; plaster: VaseMesh; reach: number; lift: number }; dbg: PlugDebug } | string {
  const { ring0, c0x, c0y, rRes, plugH, clr, wt, flangeW, floorT } = inp;
  const vw = Math.min(V_WIDTH, seamMaxVWidth(flangeW, V_CLEARANCE));
  const band = seamBandPositions({ vw, vclr: V_CLEARANCE, flangeW });
  const gW = vw / 2 + V_CLEARANCE;
  const gH = V_HEIGHT + V_CLEARANCE;
  const toFR = (ring: Ring): P2[] => {
    const out: P2[] = [];
    for (let t = 0; t < rRes; t++) out.push([ring[t * 3] - c0x, -(ring[t * 3 + 1] - c0y)]);
    return out;
  };
  const L = (M: number) => toFR(offsetRingRadial(ring0, c0x, c0y, M, 0, rRes));
  // The cup's walls are SECTORS of the loop between seam rays from the
  // cup's centre. A radial offset keeps each point on its own ray, so which
  // points fall in a sector, and the segments crossing its seams, are the
  // same for every offset: every station of a wall has the same point count.
  const base = L(0);
  const TAU = 2 * Math.PI;
  const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
  const angOf = base.map(([x, y]) => Math.atan2(y, x));
  const ccw = polyArea(base) > 0;
  /** Indices strictly inside the CCW sector a0 → a0 + span, in loop order; null if not one run. */
  const sectorIdx = (a0: number, span: number): number[] | null => {
    const inside = (i: number) => { const d = wrap(angOf[i] - a0); return d > 1e-9 && d < span - 1e-9; };
    let start = -1;
    for (let i = 0; i < rRes; i++) if (inside(i) && !inside((i - 1 + rRes) % rRes)) { if (start >= 0) return null; start = i; }
    if (start < 0) return null;
    const idx: number[] = [];
    for (let k = 0; k < rRes && inside((start + k) % rRes); k++) idx.push((start + k) % rRes);
    return idx;
  };
  /** Where segment a→b of `loop` crosses the seam ray at angle aS, snapped onto it. */
  const crossAt = (loop: P2[], a: number, b: number, aS: number): P2 => {
    const c = Math.cos(aS), sn = Math.sin(aS);
    const va = -loop[a][0] * sn + loop[a][1] * c, vb = -loop[b][0] * sn + loop[b][1] * c;
    const f = Math.abs(va - vb) > 1e-12 ? va / (va - vb) : 0;
    const x = loop[a][0] + (loop[b][0] - loop[a][0]) * f, y = loop[a][1] + (loop[b][1] - loop[a][1]) * f;
    const r = x * c + y * sn;
    return [r * c, r * sn];
  };
  /** The sector's slice of `loop`, seam crossing to seam crossing, in loop order. */
  const sector = (loop: P2[], idx: number[], a0: number, span: number): P2[] => {
    const i0 = idx[0], i1 = idx[idx.length - 1];
    const [aIn, aOut] = ccw ? [a0, a0 + span] : [a0 + span, a0];
    return [crossAt(loop, (i0 - 1 + rRes) % rRes, i0, aIn), ...idx.map((i) => loop[i]), crossAt(loop, i1, (i1 + 1) % rRes, aOut)];
  };
  // How many walls, and where the seams go (Gary 2026-10-18): the FEWEST,
  // 2 to 4, that all pull off the plug, each straight out along its own
  // centre line. A wall locks where the plug's outline faces away from its
  // pull (outward normal · pull < 0) — a textured bottom edge, ribs near a
  // seam. Seams are turned round in 0.1° steps and the clearest kept; a plain
  // round cup stays 2 walls split on the x axis. Tested on the plug's side
  // and on the ring's crest.
  const LOCK_TOL = 0.02;
  const lockLoops = [L(-clr), L(-clr + RING_H)].map((q) => (ccw ? q : q.slice().reverse()));
  const worstPull = (n: number, a0: number): number => {
    const span = TAU / n;
    let worst = Infinity;
    for (const q of lockLoops) for (let i = 0; i < q.length; i++) {
      const [ax, ay] = q[i], [bx, by] = q[(i + 1) % q.length];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const k = Math.floor(wrap(Math.atan2((ay + by) / 2, (ax + bx) / 2) - a0) / span);
      const pull = a0 + (k + 0.5) * span;
      worst = Math.min(worst, (dy * Math.cos(pull) - dx * Math.sin(pull)) / len);
    }
    return worst;
  };
  const sectorsOk = (n: number, a0: number): boolean => {
    for (let k = 0; k < n; k++) if (!sectorIdx(a0 + (k * TAU) / n, TAU / n)) return false;
    return true;
  };
  let plugWalls = 0, seam0 = 0, bestWorst = -Infinity, bestN = 2, bestA = 0;
  for (const n of [2, 3, 4]) {
    const span = TAU / n;
    let nW = worstPull(n, 0), nA = 0;
    if (nW < -LOCK_TOL) {
      for (let a = 0.1 * Math.PI / 180; a < span; a += 0.1 * Math.PI / 180) {
        const w = worstPull(n, a);
        if (w > nW) { nW = w; nA = a; }
      }
    }
    if (nW > bestWorst) { bestWorst = nW; bestN = n; bestA = nA; }
    if (nW >= -LOCK_TOL && sectorsOk(n, nA)) { plugWalls = n; seam0 = nA; break; }
  }
  let plugNote: string | null = null;
  if (!plugWalls) {
    plugWalls = bestN; seam0 = bestA;
    if (!sectorsOk(plugWalls, seam0)) return 'The plug cup cannot be split along this bottom outline (a seam crosses it more than once). Turn the foot piece off for this shape.';
    plugNote = `The texture runs down to the bottom edge, so the plug's ribs grip its cup walls at the seams even with ${plugWalls} walls. Add a base Smooth Zone on the Vase tab so the bottom edge is plain.`;
  }
  const seams = Array.from({ length: plugWalls }, (_, k) => seam0 + (k * TAU) / plugWalls);
  const spanW = TAU / plugWalls;
  const idxW = seams.map((a) => sectorIdx(a, spanW) as number[]);

  const fBase = inp.footSmoothInner ? inp.smoothBase : ring0;
  const hF = Math.max(0, inp.footHeight);
  let fw = inp.footWidth, sw = inp.footSlopeWidth;
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
  // With a mark the disk is ONE height-field solid instead: the same outline,
  // foot ring and slope, and the recess floor carrying the mark. Without one
  // the original build above is untouched (a retrofit's no-mark disk must stay
  // the disk that was printed).
  let markNote: string | null = null;
  let disk: VaseMesh;
  if (inp.mark) {
    const md = markedDisk(inp, diskOut, recess ? [inset(fw), inset(fw + sw)] : null, recessD, zDisk);
    disk = md.mesh; markNote = md.note;
  } else {
    disk = mergeMeshes(diskParts);
  }

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
  const wallBody = (k: number) => {
    const outer = sector(L(mOut), idxW[k], seams[k], spanW);
    return loftSolid(st.map(([w, M]) => ({ outer: [...outer, ...sector(L(M), idxW[k], seams[k], spanW).reverse()], holes: [], w })));
  };
  // Clip flange at each end of a wall, built on the seam ray as the +x axis
  // and turned onto it: from 1 mm inside the wall's outer face out flangeW
  // along the seam, FLANGE_T thick on the wall's own side (+y: the wall lies
  // CCW of this seam), the three V's on its mating face (y = 0). Each wall
  // has RIDGES at its first seam (CCW order) and GROOVES at its last (Gary
  // 2026-10-18), so a ridge meets a groove at every seam and the walls are
  // the same part turned round wherever the outline allows it.
  const flangeAt = (xE: number, side: number, ridge: boolean, aS: number): VaseMesh => {
    const x0 = xE - 1, x1 = xE + flangeW;
    const face: P2[] = [[x0, 0]];
    for (const d of band.slice().sort((p, q) => q - p)) {
      const c = x1 - d;
      if (ridge) face.push([c - vw / 2, 0], [c, -side * V_HEIGHT], [c + vw / 2, 0]);
      else face.push([c - gW, 0], [c, side * gH], [c + gW, 0]);
    }
    face.push([x1, 0], [x1, side * FLANGE_T], [x0, side * FLANGE_T]);
    return rotZ(extrudeSolid(face, [], zW0, plugH), aS);
  };
  const rotZ = (m: VaseMesh, a: number): VaseMesh => {
    const c = Math.cos(a), sn = Math.sin(a);
    const positions = new Float32Array(m.positions.length);
    for (let q = 0; q < positions.length; q += 3) {
      const x = m.positions[q], y = m.positions[q + 1];
      positions[q] = x * c - y * sn; positions[q + 1] = x * sn + y * c; positions[q + 2] = m.positions[q + 2];
    }
    const out = { ...m, positions, normals: new Float32Array(m.normals.length) };
    computeNormals(out.positions, out.indices, out.normals);
    return out;
  };
  // Same part? (Gary 2026-10-18.) Ask the OUTLINE, not the mesh: every wall
  // loop is a radial offset of the bottom outline about the cup's centre, so
  // if its radius r(θ) repeats every wall span, all the walls are one design.
  // Comparing the built walls vertex by vertex failed on a round mug at an
  // ODD Radial count (609): turning a wall by 180° does not land its samples
  // on the other wall's, though the shapes agree to well under 0.001 mm. When
  // it repeats, wall 0 is built once and turned round for the others, so the
  // exports really are the same part.
  const radiusAt = (th: number): number => {
    const c = Math.cos(th), sn = Math.sin(th);
    let best = 0;
    for (let i = 0; i < base.length; i++) {
      const [ax, ay] = base[i], [bx, by] = base[(i + 1) % base.length];
      // Ray t·(c, sn) meets segment a + u·(b − a).
      const ex = bx - ax, ey = by - ay, det = ex * sn - ey * c;
      if (Math.abs(det) < 1e-12) continue;
      const t = (ex * ay - ey * ax) / det, u = (c * ay - sn * ax) / det;
      if (u >= -1e-9 && u <= 1 + 1e-9 && t > best) best = t;
    }
    return best;
  };
  const SAME_TOL = 0.01;
  let wallsSame = true;
  for (let q = 0; q < 3600 && wallsSame; q++) {
    const th = seams[0] + (q / 3600) * spanW, r0 = radiusAt(th);
    for (let k = 1; k < plugWalls && wallsSame; k++) if (Math.abs(radiusAt(th + k * spanW) - r0) > SAME_TOL) wallsSame = false;
  }
  const outerLoop = L(mOut);
  const buildWallParts = (a0: number, k: number) => {
    const seg = sector(outerLoop, idxW[k], a0, spanW);
    const rIn = Math.hypot(...seg[ccw ? 0 : seg.length - 1]), rOut = Math.hypot(...seg[ccw ? seg.length - 1 : 0]);
    return [wallBody(k), flangeAt(rIn, 1, true, a0), flangeAt(rOut, -1, false, a0 + spanW)];
  };
  const wall0 = buildWallParts(seams[0], 0);
  const wallParts = seams.map((a0, k) => (k === 0 ? wall0 : wallsSame ? wall0.map((m) => rotZ(m, k * spanW)) : buildWallParts(a0, k)));
  const wallMeshes = wallParts.map((ps) => mergeMeshes(ps));

  const plugOut = L(-clr);
  let vol = Math.abs(polyArea(plugOut)) * plugH;
  if (recess) vol += (recessD * (Math.abs(polyArea(inset(fw))) + Math.abs(polyArea(inset(fw + sw))))) / 2;
  const diskPrint = translate(disk, 0, 0, -zDisk);
  const wallPrints = wallMeshes.map((m) => translate(m, 0, 0, -zW0));
  const foot: PlugFoot = { plate: diskPrint, walls: wallPrints, wall: wallPrints[0], wallsSame, plugNote, markNote, plateStats: computeMeshStats(diskPrint), wallStats: computeMeshStats(wallPrints[0]), plasterVolumeMm3: vol, plugHeight: plugH };
  let reach = 0;
  for (const [x, y] of L(mOut)) reach = Math.max(reach, Math.hypot(x, y));
  reach += flangeW + 2;
  const display = { plate: disk, walls: mergeMeshes(wallMeshes), plaster: extrudeSolid(plugOut, [], 0, plugH), reach, lift: -zW0 };
  const dbg: PlugDebug = { plugH, zRing: plugH / 2, recessDepth: recessD, zDisk, zWall0: zW0, disk: diskParts, walls: wallParts, seams, plugOutline: plugOut, base: base };
  return { foot, display, dbg };
}


/**
 * The disk as one closed height field over its outline (cup coords: plan
 * (x, −y) about the vase axis, z = −vase z). Rings from the outline in: the
 * outline and the foot ring's inner edge at z = 0, the recess edge at
 * −recessD, then the recess floor scaled toward the centre with the mark — the
 * vase's bottom z negated, so the cast piece carries exactly the PLA vase's
 * mark (read the right way round from below). Sides straight down to zDisk.
 */
function markedDisk(
  inp: PlugCupInput, diskOut: P2[], foot: [P2[], P2[]] | null, recessD: number, zDisk: number,
): { mesh: VaseMesh; note: string | null } {
  const { c0x, c0y } = inp;
  const { field, b, scale } = inp.mark!;
  const S = markSampler(field, { ...b, markSize: b.markSize * scale, markOffsetX: b.markOffsetX * scale, markOffsetY: b.markOffsetY * scale }, c0x, c0y);
  const sgn = b.markStyle === 'impressed' ? 1 : -1;
  let d = Math.max(0, b.markDepth);
  let note: string | null = null;
  // An impressed mark is a ridge going DOWN into the disk: keep a floor under it.
  const room = -zDisk - recessD - MIN_FLOOR;
  if (sgn > 0 && d > room) {
    d = Math.max(0, room);
    note = `The mark is ${d.toFixed(1)} mm deep on the plug disk (not ${b.markDepth}) so the disk keeps a ${MIN_FLOOR} mm floor. A thicker Plate Floor allows more, but it changes the plug walls too — not for a reprint of the disk alone.`;
  }
  /** Disk top z at a cup point: minus the vase bottom's height there. */
  const zAt = (X: number, Y: number) => -(recessD + sgn * d * S.at(c0x + X, c0y - Y));

  const n = diskOut.length;
  const rings: { pts: P2[]; z: (i: number) => number }[] = [{ pts: diskOut, z: () => 0 }];
  if (foot) {
    rings.push({ pts: foot[0], z: () => 0 }, { pts: foot[1], z: () => -recessD });
  }
  const plate = foot ? foot[1] : diskOut;
  // Rings under the mark: the floor edge smoothed (bottom.ts floorLayout),
  // so a textured outline's bumps do not shear the mark into spikes.
  const L = floorLayout(plate.length, (t) => plate[t][0], (t) => plate[t][1], S.reach, S.cellMm);
  if (L) {
    for (let r = 0; r < L.count; r++) {
      const sc = L.sTop * (1 - r / L.count);
      const pts: P2[] = plate.map((_, t) => [L.dirX[t] * L.rho[t] * sc, L.dirY[t] * L.rho[t] * sc]);
      rings.push({ pts, z: (i) => zAt(pts[i][0], pts[i][1]) });
    }
  }
  const zc = L ? zAt(0, 0) : -recessD;

  // Vertices: the top rings, top centre, the bottom ring, bottom centre.
  const nTop = rings.length * n;
  const positions = new Float32Array((nTop + 1 + n + 1) * 3);
  rings.forEach((ring, r) => {
    for (let i = 0; i < n; i++) {
      const q = (r * n + i) * 3;
      positions[q] = ring.pts[i][0]; positions[q + 1] = ring.pts[i][1]; positions[q + 2] = ring.z(i);
    }
  });
  const cTop = nTop, b0 = nTop + 1, cBot = b0 + n;
  positions[cTop * 3 + 2] = zc;
  for (let i = 0; i < n; i++) {
    positions[(b0 + i) * 3] = diskOut[i][0]; positions[(b0 + i) * 3 + 1] = diskOut[i][1]; positions[(b0 + i) * 3 + 2] = zDisk;
  }
  positions[cBot * 3 + 2] = zDisk;
  const idx: number[] = [];
  for (let r = 0; r + 1 < rings.length; r++) {
    // The slope (foot ring edge → recess edge) is split along the same
    // diagonal as the unmarked disk's loft, so it is the same surface exactly.
    const slope = !!foot && r === 1;
    for (let t = 0; t < n; t++) {
      const t1 = (t + 1) % n;
      const oA = r * n + t, oB = r * n + t1, iA = (r + 1) * n + t, iB = (r + 1) * n + t1;
      if (slope) idx.push(oA, iA, oB, iA, iB, oB);
      else idx.push(oA, iA, iB, oA, iB, oB);
    }
  }
  const last = (rings.length - 1) * n;
  for (let t = 0; t < n; t++) {
    const t1 = (t + 1) % n;
    idx.push(cTop, last + t1, last + t);          // top centre
    idx.push(t, t1, b0 + t1, t, b0 + t1, b0 + t); // side
    idx.push(cBot, b0 + t, b0 + t1);              // bottom
  }
  // One consistent winding throughout; flip it all if it came out inside out.
  let vol = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k] * 3, bq = idx[k + 1] * 3, c = idx[k + 2] * 3;
    vol += positions[a] * (positions[bq + 1] * positions[c + 2] - positions[bq + 2] * positions[c + 1])
      - positions[a + 1] * (positions[bq] * positions[c + 2] - positions[bq + 2] * positions[c])
      + positions[a + 2] * (positions[bq] * positions[c + 1] - positions[bq + 1] * positions[c]);
  }
  if (vol < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  const indices = new Uint32Array(idx);
  const normals = new Float32Array(positions.length);
  computeNormals(positions, indices, normals);
  return { mesh: { positions, normals, indices, vertexCount: positions.length / 3, triangleCount: indices.length / 3 }, note };
}
