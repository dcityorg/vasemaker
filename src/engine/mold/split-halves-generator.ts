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
 * so there is a master + plate per half — L and R — and a WELL wall + BASE
 * wall per half (2026-10-18, as Split Thirds; the walls used to be shared and
 * swap ends between pours, which hung a filler disc + flange on each end of
 * the master). The well wall carries ridges at its seams, the base wall
 * grooves. With one kit, L's parts serve both halves.
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
import { boxSolid, extrudeSolid, translateMesh, rotate180Z, dedupeLoop, rectPoints, triangulateFace, ensureOutward, MeshBuilder, MAP_XY_Z, MAP_YZ_X, type ExtrudeMap, type P2 } from '../handle/mesh3';
import { buildDome, buildWall, buildPlateRidges, seamMaxVWidth, type MoldLayout } from '../handle/mold-parts';
import type { MoldParameters } from './mold-types';
import type { HandleParameters } from '../handle/handle-types';
import { sampleSpine } from '../handle/spine';
import { splitSilhouette, placeHandle, surfaceLookup, sweepHandle, meshSweep, resweep, halfProfile, channelProfile, type HandlePlacement, type HandleSweep } from './split-handle';
import { cutArc, buildRelief, buildFloor, halfSectionArea, undercutOf, type Arc, type HalfFrame } from './split-two-piece-generator';
import { buildPlugCup, RING_H, RING_W, RING_US, ringBump, type PlugFoot, type PlugDebug } from './plug-cup';

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
/** Water notch through each pull-rib (Gary, 2026-10-13), mm. Cut into the rib
 *  from its crown, so the strap's shell roofs it into a tunnel at the bottom of
 *  the channel when the half is turned cut-face up — one pour of ice water then
 *  runs the length of the strap instead of four eyedropper fills. */
const RIB_HOLE = 1.5;
/** Warn below this much plaster between the handle and the rim/well, mm. The
 *  first Split Halves pour chipped there at 7.7 mm (Gary, 2026-10-13). */
const MIN_PLASTER_GAP = 10;
/** Natch search grid, mm (refined to a quarter of this around the best spot). */
const NATCH_GRID = 2;
/** How far past the vase surface each handle end is buried, beyond the shell, mm. */
const HANDLE_BURY_EXTRA = 0.5;
const HANDLE_SEG = 48;
/** Wall/plate seam V numbers — HandleMaker's proven defaults (vWidth, vHeight, vClearance). */
const V_WIDTH = 2;
const V_HEIGHT = 1.4;
const V_CLEARANCE = 0.2;
/** Max L/R master deviation (mm) still treated as one master for both halves. */
const SYMMETRY_TOL = 0.05;
/** Foot (Gary, 2026-10-18, replacing the 10-14 counterbore + step foot piece,
 *  whose wedge cracked on Split Thirds): the plaster PLUG of plug-cup.ts. The
 *  master carries a BAND — the vase's bottom outline run straight down Plug
 *  Height — with the rounded ring round its middle; the halves get its groove
 *  and the plug, cast in its own cup, the ridge. */

export interface HalfDebug {
  relief: VaseMesh; cap: VaseMesh; capPoly: P2[];
  handle: VaseMesh | null; handleSolid: VaseMesh | null; strapLine: P2[];
  plate: VaseMesh[];
  /** Each pull-rib as its own solid, and its water tunnel: centre (print) and
   *  the strap direction there (print x, y). */
  ribs: VaseMesh[];
  ribHoles: { p: [number, number, number]; t: P2 }[];
}

/** One natch, world (z, u): a bump on plaster L (and a dimple on R) or the reverse. */
export interface Natch { z: number; u: number; r: number; bump: boolean }

export interface SplitHalvesMoldMeshes {
  style: 'splitHalves';
  /** Print parts, assembly coords (plate top z = 0). Export lifts below. */
  masterL: VaseMesh;
  masterR: VaseMesh;
  plateL: VaseMesh;
  plateR: VaseMesh;
  /** Each half's own WELL wall (the well end + half of each side, V ridges at
   *  its seams) and BASE wall (the base end + the other half of each side,
   *  grooves), assembly coords in that half's frame (Gary 2026-10-18: as Split
   *  Thirds — the walls used to swap ends between pours, which hung a filler
   *  disc + flange on each end of the master). With one kit, L's serve both. */
  wellWallL: VaseMesh;
  baseWallL: VaseMesh;
  wellWallR: VaseMesh;
  baseWallR: VaseMesh;
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
  baseWallStats: MeshStats;
  /** Smallest natch radius placed (Split 2-Pc's clamp note reads it). */
  natchRadius: number;
  natches: Natch[];
  /** Why the natches are not what was asked for (count forced to 4, or too few fit). */
  natchNote: string | null;
  /** Narrowest plaster between the handle and the rim/well, mm (null: no handle). */
  plasterGap: number | null;
  /** The same at the bottom end: to the block's bottom face, or the plug band. */
  plasterGapBottom: number | null;
  gapWarning: string | null;
  error: string | null;
  handle: { placement: HandlePlacement; sectionMm: [number, number] } | null;
  handleError: string | null;
  handleWarning: string | null;
  /** The plug cup's print parts (null when the foot is off): the disk and
   *  2–4 walls, as Split Thirds'. */
  foot: PlugFoot | null;
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
    /** What the natch search measured against: the vase footprint (z, u) and the plaster block. */
    natchFrame: { obstacle: P2[]; zB0: number; zB1: number; uB0: number; uB1: number; hTop: number } | null;
    /** Plug foot numbers + solids, for the verify script (null when off).
     *  World z of the ring's centre is −plugH/2; the band runs z 0 → −plugH. */
    foot: {
      plugH: number;
      /** Band outlines per half, world (u, h): the band, the ring's crest. */
      bandL: P2[]; bandR: P2[]; crestL: P2[]; crestR: P2[];
      /** Each half's master band parts (print coords). */
      discL: VaseMesh[]; discR: VaseMesh[];
      /** The cup, cup coords. */
      cup: PlugDebug;
    } | null;
  };
}

// ── 2-D helpers ───────────────────────────────────────────────────────────────

function polyArea(p: P2[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; s += x1 * y2 - x2 * y1; }
  return s / 2;
}

/** Offset a closed polygon outward by d (mitered, miter capped at 4×). Same point count/order. */
export function offsetPolygon(poly: P2[], d: number): P2[] {
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
export function clipToXMax(loop: P2[], xMax: number): P2[] {
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

/**
 * Drop SPIKES — a vertex where the loop doubles straight back on itself. The
 * mitred offset of the rim/ledge corner makes one (out 0.2 mm and back,
 * measured on Gary's Width 5 mug, 2026-10-13): zero area, but earcut cannot
 * triangulate round it and the plate's top slab was left with 12 open edges.
 */
export function removeSpikes(loop: P2[]): P2[] {
  let pts = loop.slice();
  for (let changed = true; changed && pts.length > 3;) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu < 1e-9 || lv < 1e-9 || (ux * vx + uy * vy) / (lu * lv) < -0.9) { pts.splice(i, 1); changed = true; i--; }
    }
  }
  return pts;
}

function segDist(px: number, py: number, a: P2, b: P2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 > 1e-12 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

/** Distance from p to a closed polygon's boundary, NEGATIVE inside it. */
export function signedDist(px: number, py: number, poly: P2[]): number {
  let d = Infinity, inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    d = Math.min(d, segDist(px, py, a, b));
    if ((a[1] > py) !== (b[1] > py) && px < a[0] + ((py - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
  }
  return inside ? -d : d;
}

/** Sutherland–Hodgman clip to the half-plane x ≥ xMin. */
export function clipToXMin(loop: P2[], xMin: number): P2[] {
  return clipToXMax(loop.map(([x, y]) => [-x, y] as P2), -xMin).map(([x, y]) => [-x, y] as P2);
}

/**
 * Upper envelope of several arches in (u, h) — each a polyline from h = 0 up
 * and back to h = 0 — as one polyline in increasing u. Exact for piecewise-
 * linear input: sampled at every vertex of every arch, plus the crossing
 * wherever the topmost segment changes between two samples (a corner cut
 * there would make a bore smaller than the part it must clear).
 */
function upperEnvelope(arches: P2[][]): P2[] {
  const segs: [P2, P2][] = [];
  const us: number[] = [];
  for (const a of arches) {
    for (let i = 0; i < a.length; i++) {
      us.push(a[i][0]);
      if (i + 1 < a.length) {
        const p = a[i], q = a[i + 1];
        if (Math.abs(q[0] - p[0]) > 1e-9) segs.push(p[0] < q[0] ? [p, q] : [q, p]);
      }
    }
  }
  us.sort((x, y) => x - y);
  const xs = us.filter((u, i) => i === 0 || u - us[i - 1] > 1e-7);
  /** Topmost segment over [ua, ub] (whole interval inside it), and its value at u. */
  const lineAt = (sg: [P2, P2], u: number) => sg[0][1] + ((sg[1][1] - sg[0][1]) * (u - sg[0][0])) / (sg[1][0] - sg[0][0]);
  const out: P2[] = [];
  for (let k = 0; k < xs.length; k++) {
    const u = xs[k];
    let h = 0;
    for (const sg of segs) if (u >= sg[0][0] - 1e-9 && u <= sg[1][0] + 1e-9) h = Math.max(h, lineAt(sg, u));
    out.push([u, h]);
    if (k + 1 < xs.length) {
      const ua = u, ub = xs[k + 1];
      const live = segs.filter((sg) => sg[0][0] <= ua + 1e-9 && sg[1][0] >= ub - 1e-9);
      if (live.length < 2) continue;
      let ia = 0, ib = 0;
      for (let i = 1; i < live.length; i++) {
        if (lineAt(live[i], ua) > lineAt(live[ia], ua)) ia = i;
        if (lineAt(live[i], ub) > lineAt(live[ib], ub)) ib = i;
      }
      if (ia === ib) continue;
      const da = lineAt(live[ia], ua) - lineAt(live[ib], ua), db = lineAt(live[ia], ub) - lineAt(live[ib], ub);
      const t = da / (da - db);
      if (t > 1e-6 && t < 1 - 1e-6) { const uc = ua + (ub - ua) * t; out.push([uc, Math.max(0, lineAt(live[ia], uc))]); }
    }
  }
  out[0] = [out[0][0], 0];
  out[out.length - 1] = [out[out.length - 1][0], 0];
  // A crossing that lands a hair from a vertex makes an earcut sliver.
  return out.filter((q, i) => i === 0 || i === out.length - 1 || Math.hypot(q[0] - out[i - 1][0], q[1] - out[i - 1][1]) > 1e-3);
}

/** Offset an arch (h ≥ 0, endpoints on h = 0) outward by d, normal to the
 *  curve and away from its chord midpoint; returned in increasing first
 *  coordinate with both ends pinned to h = 0. The well collar's bore. */
function offsetArch(arc: P2[], d: number): P2[] {
  const out: P2[] = arc.map((pt, k) => {
    const prev = arc[Math.max(0, k - 1)], next = arc[Math.min(arc.length - 1, k + 1)];
    let tx = next[0] - prev[0], ty = next[1] - prev[1];
    const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    // Outward = away from the arc's own chord midpoint.
    let nx = ty, ny = -tx;
    const cx = (arc[0][0] + arc[arc.length - 1][0]) / 2;
    if (nx * (pt[0] - cx) + ny * pt[1] < 0) { nx = -nx; ny = -ny; }
    return [pt[0] + nx * d, Math.max(0, pt[1] + ny * d)];
  });
  if (out[0][0] > out[out.length - 1][0]) out.reverse();
  out[0] = [out[0][0], 0];
  out[out.length - 1] = [out[out.length - 1][0], 0];
  return out;
}

/**
 * A closed solid lofted through stations of equal point count: each station is
 * an outer loop (and optional holes) at extrusion coordinate w, mapped to 3-D
 * by `map` (right-handed, as extrudeSolid). Point i of one station joins point
 * i of the next; the first and last stations are capped. For the foot step's
 * drafted pocket and the master's drafted disc, which a prism can't make.
 */
export function loftSolid(stations: { outer: P2[]; holes: P2[][]; w: number }[], map: ExtrudeMap = MAP_XY_Z): VaseMesh {
  const b = new MeshBuilder();
  const area = (q: P2[]) => polyArea(q);
  const flipO = area(stations[0].outer) < 0;
  const flipH = stations[0].holes.map((h) => area(h) > 0);
  const st = stations.map((s) => ({
    w: s.w,
    loops: [flipO ? s.outer.slice().reverse() : s.outer, ...s.holes.map((h, i) => (flipH[i] ? h.slice().reverse() : h))],
  }));
  for (let li = 0; li < st[0].loops.length; li++) {
    for (let k = 0; k + 1 < st.length; k++) {
      const A = st[k].loops[li], B = st[k + 1].loops[li];
      const bot = A.map(([u, v]) => b.vertex(...map(u, v, st[k].w)));
      const top = B.map(([u, v]) => b.vertex(...map(u, v, st[k + 1].w)));
      for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; b.quad(bot[i], bot[j], top[j], top[i]); }
    }
  }
  const cap = (s: typeof st[number], up: boolean) => {
    const { points, tris } = triangulateFace(s.loops[0], s.loops.slice(1));
    const idx = points.map(([u, v]) => b.vertex(...map(u, v, s.w)));
    for (const [i, j, k] of tris) { if (up) b.tri(idx[i], idx[j], idx[k]); else b.tri(idx[i], idx[k], idx[j]); }
  };
  cap(st[st.length - 1], st[st.length - 1].w > st[0].w);
  cap(st[0], st[0].w > st[st.length - 1].w);
  // Not welded: caps and walls keep their own vertices so sharp edges shade
  // sharp (the checkers weld by position anyway).
  return ensureOutward(b.build());
}

/**
 * Pull-rib section: the solid half-ellipse (a, b) with a RIB_HOLE-wide notch
 * cut down from its crown to RIB_HOLE below where the channel's inner surface
 * (ai, bi) crosses the notch walls — so under the shell the notch is a tunnel
 * at least RIB_HOLE tall. Returns the section and the two notch-floor point
 * indices; the plain section (indices −1) when the strap is too small.
 */
function ribProfile(a: number, b: number, ai: number, bi: number, seat: number, seg: number): { prof: P2[]; iA: number; iB: number } {
  const plain = { prof: halfProfile(a, b, seat, seg), iA: -1, iB: -1 };
  const w = RIB_HOLE / 2;
  if (ai < w + 0.6) return plain;
  const roof = bi * Math.sqrt(1 - (w / ai) ** 2);
  const floor = roof - RIB_HOLE;
  if (floor < -seat + 1) return plain;
  const top = b * Math.sqrt(Math.max(0, 1 - (w / a) ** 2));
  const prof: P2[] = [];
  let iA = -1;
  for (let j = 0; j <= seg; j++) {
    const th = (j / seg) * Math.PI;
    const x = Math.cos(th) * a, y = Math.sin(th) * b;
    if (Math.abs(x) < w + 1e-6) {
      if (iA < 0) { prof.push([w, top], [w, floor]); iA = prof.length - 1; prof.push([-w, floor], [-w, top]); }
      continue;
    }
    prof.push([x, y]);
  }
  prof.push([-a, -seat], [a, -seat]);
  return { prof, iA, iB: iA + 1 };
}

// ── The generator ────────────────────────────────────────────────────────────

function empty(): VaseMesh {
  return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), vertexCount: 0, triangleCount: 0 };
}

function errorResult(error: string): SplitHalvesMoldMeshes {
  const e = empty();
  const st = computeMeshStats(e);
  return {
    style: 'splitHalves', masterL: e, masterR: e, plateL: e, plateR: e, wellWallL: e, baseWallL: e, wellWallR: e, baseWallR: e,
    masters: e, plates: e, walls: e, plaster: e, undercutFlags: new Float32Array(0), hasUndercuts: false,
    oneKit: false, plasterVolumeMm3: 0, masterStats: st, plateStats: st, wallStats: st, baseWallStats: st, natchRadius: 0,
    natches: [], natchNote: null, plasterGap: null, plasterGapBottom: null, gapWarning: null, error,
    handle: null, handleError: null, handleWarning: null, foot: null,
    layout: { cavX0: 0, cavX1: 0, cavY0: 0, cavY1: 0, wallH: 0, seat: 0, plateThk: 0, plateW: 0, plateD: 0, masterLift: 0, plateLift: 0 },
    debug: {
      partsL: { relief: e, cap: e, capPoly: [], handle: null, handleSolid: null, strapLine: [], plate: [], ribs: [], ribHoles: [] },
      partsR: { relief: e, cap: e, capPoly: [], handle: null, handleSolid: null, strapLine: [], plate: [], ribs: [], ribHoles: [] },
      handleShell: 0, handleRibs: 0,
      pocketL: [], islandL: null, pocketR: [], islandR: null, bumpsL: [], dimplesL: [], natchFrame: null, foot: null,
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
  // With the plug the master's floor is OPEN into the band's hollow (Gary
  // 2026-10-18: one cold-water fill reaches both): the skin starts at the base
  // plane, one Master Wall in from the bottom outline — exactly the band's own
  // hollow, so the two run on into each other.
  const innerAll = mold.halvesFootPiece
    ? [offsetRingRadial(outerStack.rings[0], ...outerStack.centers[0], -shell, 0, rRes), ...innerRings]
    : innerRings;
  const outA = cutAll(outerRings, frameA), inA = cutAll(innerAll, frameA);
  const outB = cutAll(outerRings, frameB), inB = cutAll(innerAll, frameB);
  if (!outA || !inA || !outB || !inB) {
    return errorResult('The split plane misses part of the vase at this Split Angle (XY Sway can carry it entirely to one side). Try another angle or less sway.');
  }

  // ── Foot = a plaster PLUG (Gary 2026-10-18, as Split Thirds'; replaces the
  // 10-14 counterbore + step foot piece). Below the vase's bottom plane the
  // master carries a BAND — the bottom outline exactly, run straight down
  // plugH — with a rounded ring round its middle. The halves stop plugH below
  // the vase (flush with the plug's bottom); past that the band runs straight
  // into the base-end wall, capped and sealed like the well end, with the
  // flange in front covering the fit gap.
  //
  // Each half has its OWN base wall (2026-10-18, as Split Thirds), whose boss
  // holds the band's straight run: no envelope with the other half's well,
  // and no flange.
  //
  // Arches here are in (u, h): u along the split, h out of the parting face.
  // Half L print y = −u, R y = u. ──
  const footOn = mold.halvesFootPiece;
  const plugH = Math.max(6, mold.halvesPlugHeight);
  const ring0 = outerStack.rings[0];
  const arcU = (arc: Arc, sgn: 1 | -1): P2[] => arc.map(([, Y, Z]) => [sgn * Y, Z - F] as P2);
  const discArc = (M: number, sgn: 1 | -1): P2[] | null => {
    const arc = cutArc(offsetRingRadial(ring0, c0x, c0y, M, 0, rRes), rRes, c0x, c0y, sgn > 0 ? frameA : frameB, F, nArc);
    return arc ? arcU(arc, sgn) : null;
  };
  /** Per half: the band, its hollow, the laps, the ring stations, its crest,
   *  and the band grown by the clearance (the base wall's bore). */
  type BandSet = { b0: P2[]; inner: P2[]; lap: P2[]; lapIn: P2[]; deep: P2[]; ring: P2[][]; bR: P2[]; bc: P2[] };
  const bands: Record<1 | -1, BandSet> = { 1: null!, [-1]: null! } as Record<1 | -1, BandSet>;
  if (footOn) {
    for (const sg of [1, -1] as const) {
      const b0 = discArc(0, sg), inner = discArc(-shell, sg), lap = discArc(-0.3, sg), lapIn = discArc(-0.4, sg), deep = discArc(-0.8, sg);
      const bR = discArc(RING_H, sg), bc = discArc(clr, sg);
      const ring = RING_US.map((u) => discArc(ringBump(u), sg));
      if (!b0 || !inner || !lap || !lapIn || !deep || !bR || !bc || ring.some((q) => !q)) return errorResult('The plug band could not be cut at this Split Angle.');
      bands[sg] = { b0, inner, lap, lapIn, deep, bR, bc, ring: ring as P2[][] };
    }
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
  /** Each rib's water tunnel, world: centre (z, u, h) and strap direction (z, u). */
  const ribHolesW: { c: [number, number, number]; t: P2 }[] = [];
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
            const rib = ribProfile(hw - RIB_INSET, ht - RIB_INSET, hw - t, ht - t, seat, HANDLE_SEG);
            const margin = RIB_WIDTH / 2 + hw + 2;
            for (let k = 1; k <= RIB_COUNT; k++) {
              const sc = (total * k) / (RIB_COUNT + 1);
              if (sc - RIB_WIDTH / 2 < margin || sc + RIB_WIDTH / 2 > total - margin) continue;
              const f0 = idxAt(sc - RIB_WIDTH / 2), f1 = idxAt(sc + RIB_WIDTH / 2);
              const at = [f0];
              for (let i = Math.ceil(f0 + 1e-6); i < f1 - 1e-6; i++) at.push(i);
              at.push(f1);
              const ribSw = resweep(sw, pl, rib.prof, at);
              handlePrint.push(ribSw);
              handleRibs++;
              if (rib.iA >= 0) {
                const midR = ribSw.rings[Math.floor(ribSw.rings.length / 2)];
                const A = midR[rib.iA], B = midR[rib.iB];
                const r0 = ribSw.rings[0][rib.iA], r1 = ribSw.rings[ribSw.rings.length - 1][rib.iA];
                ribHolesW.push({ c: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, A[2] + RIB_HOLE / 2], t: [r1[0] - r0[0], r1[1] - r0[1]] });
              }
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
  if (footOn) for (const q of [bands[1].bR, bands[-1].bR]) for (const [u, h] of q) { uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); hMax = Math.max(hMax, h); }

  // With the plug the block ends at the wall boss past the band.
  const cavX0 = -zEnd, cavX1 = footOn ? plugH + sealDepth : m;
  const wallH = hMax + m;
  const wt = mold.halvesWallThickness;
  const flangeW = mold.halvesFlangeWidth;
  const border = wt + flangeW;
  const floorT = mold.halvesPlateFloor;

  /**
   * The vase (+ handle) footprint on the parting face for one half, native
   * (z, Y) with Y = ySign·u — so half L's is in world (z, u). The pocket is
   * the outer loop; the island is the plate inside the handle's C.
   */
  const footprint = (outer: Arc[], ySign: 1 | -1): { pocketNative: P2[]; islandNative: P2[] | null; error: string | null } => {
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
    let error: string | null = null;
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
        error = 'The handle outline could not be joined to the vase outline for the plate pocket.';
      }
    }
    if (footOn) {
      // Add the band below the base plane: cut the vase footprint at the base
      // and detour round the band (straight down, out round the ring, on into
      // the base wall), all with the clearance.
      const ext = (q: P2[]): P2 => [Math.min(q[0][0], q[q.length - 1][0]), Math.max(q[0][0], q[q.length - 1][0])];
      const d = bands[ySign];
      const [l0, h0] = ext(d.b0);
      // The ring skirts to the bed, so its footprint is its own ROUNDED
      // profile (Gary 2026-10-18: it was a box round the ring, which left open
      // corners in the plate face either side of each ring end for plaster to
      // run into). The pocket follows that profile at exactly Fit Clearance:
      // the clr-dilation of the edge, z (descending) on a 0.05 mm grid.
      const zRing = -plugH / 2;
      const ringEdge = (side: 0 | 1) => d.ring.map((q, i) => [zRing + RING_US[i], side ? Math.max(q[0][0], q[q.length - 1][0]) : Math.min(q[0][0], q[q.length - 1][0])] as P2);
      const ringRun = (side: 0 | 1): P2[] => {
        const e = ringEdge(side), base = side ? h0 : l0, sg = side ? 1 : -1;
        const edgeAt = (z: number): number => {
          if (z <= e[0][0] || z >= e[e.length - 1][0]) return base;
          let i = 0;
          while (i + 2 < e.length && e[i + 1][0] < z) i++;
          const f = (z - e[i][0]) / (e[i + 1][0] - e[i][0]);
          return e[i][1] + f * (e[i + 1][1] - e[i][1]);
        };
        const out: P2[] = [];
        const z0 = e[0][0] - clr - 0.1, z1 = e[e.length - 1][0] + clr + 0.1;
        for (let z = z1; z >= z0 - 1e-9; z -= 0.05) {
          let best = base + sg * clr;
          for (let dz = -clr; dz <= clr + 1e-9; dz += clr / 8) {
            const v = edgeAt(z + dz) + sg * Math.sqrt(Math.max(0, clr * clr - dz * dz));
            best = sg > 0 ? Math.max(best, v) : Math.min(best, v);
          }
          out.push([z, best]);
        }
        return out;
      };
      const loSide: P2[] = [[-clr, l0 - clr], ...ringRun(0), [-cavX1, l0 - clr]];
      const hiSide: P2[] = [[-clr, h0 + clr], ...ringRun(1), [-cavX1, h0 + clr]];
      const nat = (q: P2[]) => q.map(([z, u]) => [z, ySign * u] as P2);
      // Lower native Y first.
      const [sideA, sideB] = ySign > 0 ? [nat(loSide), nat(hiSide)] : [nat(hiSide), nat(loSide)];
      // Cut at the vase bottom, run the vase's own outline on down by the
      // clearance, and only THEN step in to the band: the band IS the bottom
      // outline, so nothing stands out in front of its face (the old disc did,
      // and was cut at +clr — which, on a mug flaring out just above its
      // bottom, left the master's first 0.1 mm outside the pocket).
      let poly = clipToXMin(pocketNative, 0);
      const k = poly.findIndex((q, i) => Math.abs(q[0]) < 1e-9 && Math.abs(poly[(i + 1) % poly.length][0]) < 1e-9);
      if (k < 0) error = error ?? 'The vase outline could not be joined to the plug band for the plate pocket.';
      else {
        poly = [...poly.slice(k + 1), ...poly.slice(0, k + 1)];   // the cut edge is now last → first
        const yLast = poly[poly.length - 1][1], yFirst = poly[0][1];
        const detour = yLast < yFirst ? [...sideA, ...sideB.slice().reverse()] : [...sideB, ...sideA.slice().reverse()];
        pocketNative = [...poly, [-clr, yLast], ...detour, [-clr, yFirst]];
      }
    }
    return { pocketNative, islandNative, error };
  };

  // ── One kit for both halves? Only if the R master IS the L master. ──
  const printArcs = (outer: Arc[]) => outer.map((arc) => arc.map(([z, Y, Z]) => [-z, -Y, Z - F]));
  let oneKit = !handleSweep;
  if (oneKit) {
    const la = printArcs(outA), ra = printArcs(outB);
    const near = (pa: number[][], pb: number[][]) => {
      let worst = 0;
      for (let k = 0; k < pa.length; k++) {
        const q = pb[k];
        worst = Math.max(worst, Math.hypot(pa[k][0] - q[0], pa[k][1] - q[1], pa[k][2] - q[2]));
      }
      return worst;
    };
    for (let i = 0; i < la.length && oneKit; i++) {
      const d = Math.min(near(la[i], ra[i]), near(la[i], ra[i].slice().reverse()));
      if (d > SYMMETRY_TOL) oneKit = false;
    }
  }

  // ── Natches, placed automatically (Gary, 2026-10-13). One per quarter of the
  // block — base/rim end × either side of the axis — each in its corner, the
  // same distance from the end, the side and the vase (2026-10-16; was: the
  // spot with the most free plaster), sized to fit up to Natch Diameter with NATCH_EDGE
  // of plaster all round. Both halves share the parting-face outline, so one
  // set of world (z, u) positions serves both. Diagonal pairs as before: bumps
  // on plaster L at (base, −u) and (rim, +u). With ONE kit the pattern must be
  // its own mirror across the axis (each bump's mirror a dimple), so the −u
  // side is placed and mirrored, and the count is always 4. ──
  const natchH = Math.min(mold.natchHeight, seat);
  const rMax = Math.max(2, mold.natchDiameter / 2);
  const obstacle = footprint(outA, 1).pocketNative;
  // Plaster ends: the well wall's boss face, and the base end (with the plug, the halves' bottom face).
  const zB0 = footOn ? -plugH : -m, zB1 = zEnd - sealDepth, uB0 = uMin - m, uB1 = uMax + m;
  const zMid = hTop / 2;
  const clearAt = (z: number, u: number, placed: Natch[]): number => {
    let c = Math.min(z - zB0, zB1 - z, u - uB0, uB1 - u, signedDist(z, u, obstacle));
    for (const n of placed) c = Math.min(c, Math.hypot(z - n.z, u - n.u) - n.r);
    return c - NATCH_EDGE;
  };
  const wantCount = oneKit ? 4 : Math.round(mold.halvesNatchCount) === 3 ? 3 : 4;
  let natchNote: string | null = oneKit && Math.round(mold.halvesNatchCount) === 3
    ? 'This vase pours one plate twice, which needs a bump opposite every dimple, so it uses 4 natches.'
    : null;
  /** Best spot in [z0,z1]×[u0,u1]: coarse grid, then a fine pass round the winner. */
  const bestIn = (z0: number, z1: number, u0: number, u1: number, score: (z: number, u: number) => number): { z: number; u: number; c: number } => {
    let best = { z: 0, u: 0, c: -Infinity };
    const scan = (za: number, zb: number, ua: number, ub: number, step: number) => {
      for (let z = za; z <= zb + 1e-9; z += step) for (let u = ua; u <= ub + 1e-9; u += step) {
        const c = score(z, u);
        if (c > best.c) best = { z, u, c };
      }
    };
    scan(z0 + NATCH_GRID / 2, z1, u0 + NATCH_GRID / 2, u1, NATCH_GRID);
    const f = NATCH_GRID / 4;
    scan(Math.max(z0, best.z - NATCH_GRID), Math.min(z1, best.z + NATCH_GRID), Math.max(u0, best.u - NATCH_GRID), Math.min(u1, best.u + NATCH_GRID), f);
    return best;
  };
  const natches: Natch[] = [];
  const fits = (c: number) => c >= 2;
  // Each corner natch sits the same distance from the three things round it
  // (Gary, 2026-10-16, as Split Thirds): the base end (the halves' bottom face
  // mouth), the side of the block and the vase; at the rim end, the well (its
  // ledge and funnel), the side and the vase. That is the biggest circle that
  // still touches its end feature. Found on a 1 → 0.2 → 0.04 mm grid.
  const wellSegs: [P2, P2][] = [];
  for (let i = 0; i < obstacle.length; i++) {
    const a = obstacle[i], b = obstacle[(i + 1) % obstacle.length];
    // Any segment reaching the rim counts as well — including the stretch up
    // to the rim corner, which the cup (below) deliberately leaves out.
    if (a[0] >= hTop - 1e-6 || b[0] >= hTop - 1e-6) wellSegs.push([a, b]);
  }
  const bodySegs: [P2, P2][] = [];
  for (let i = 0; i < obstacle.length; i++) {
    const a = obstacle[i], b = obstacle[(i + 1) % obstacle.length];
    // The cup only — the rim corner belongs to the well side, or a rim-end
    // circle settles on that one point instead of the cup wall.
    if (a[0] < hTop - 1e-6 && b[0] < hTop - 1e-6) bodySegs.push([a, b]);
  }
  /** A corner's three distances: its end feature, the block side, the vase. */
  const feats = (lo: boolean, neg: boolean, z: number, u: number): number[] => {
    let end = lo ? z - zB0 : zB1 - z, vase = Infinity;
    if (!lo) for (const [a, b] of wellSegs) end = Math.min(end, segDist(z, u, a, b));
    for (const [a, b] of lo ? bodySegs.concat(wellSegs) : bodySegs) vase = Math.min(vase, segDist(z, u, a, b));
    return [end, neg ? u - uB0 : uB1 - u, vase];
  };
  /** The corner natch of one quarter; `raw` = free radius at a point (clearAt + NATCH_EDGE). */
  const cornerIn = (lo: boolean, u0: number, u1: number, raw: (z: number, u: number) => number): { z: number; u: number; c: number } | null => {
    const neg = u1 <= 0;
    const [z0, z1] = lo ? [zB0, zMid] : [zMid, zB1];
    let best: { z: number; u: number; c: number } | null = null;
    // Score = free radius, less a steep penalty (×20) for the three distances
    // not being equal: evenness wins over room (a leaning mug offered a roomier
    // spot 1 mm off even, and ×4 took it). Smooth, so finer passes improve.
    let bestS = -Infinity;
    const scan = (za: number, zb: number, ua: number, ub: number, st: number) => {
      for (let z = za; z <= zb + 1e-9; z += st) for (let u = ua; u <= ub + 1e-9; u += st) {
        if (z < z0 || z > z1 || u < u0 || u > u1) continue;
        const c = raw(z, u);
        const f = feats(lo, neg, z, u);
        const sc = c - 20 * (Math.max(...f) - Math.min(...f));
        if (sc > bestS) { bestS = sc; best = { z, u, c }; }
      }
    };
    scan(z0 + 0.5, z1, u0 + 0.5, u1, 1);
    for (const st of [0.2, 0.04]) {
      const b0 = best as { z: number; u: number; c: number } | null;
      if (!b0) break;
      scan(b0.z - 6 * st, b0.z + 6 * st, b0.u - 6 * st, b0.u + 6 * st, st);
    }
    return best;
  };
  if (oneKit) {
    // Placed on the −u side and mirrored, so every bump meets a dimple.
    for (const lo of [true, false]) {
      const b = cornerIn(lo, uB0, Math.min(0, uB1), (z, u) => Math.min(clearAt(z, u, natches), clearAt(z, -u, natches), -u - NATCH_EDGE) + NATCH_EDGE);
      if (!b) continue;
      const c = Math.min(clearAt(b.z, b.u, natches), clearAt(b.z, -b.u, natches), -b.u - NATCH_EDGE);
      if (!fits(c)) continue;
      const r = Math.min(rMax, c);
      natches.push({ z: b.z, u: b.u, r, bump: lo }, { z: b.z, u: -b.u, r, bump: !lo });
    }
  } else if (wantCount === 4) {
    for (const [lo, neg] of [[true, true], [false, false], [false, true], [true, false]] as const) {
      const [u0, u1] = neg ? [uB0, 0] : [0, uB1];
      const b = cornerIn(lo, u0, u1, (z, u) => clearAt(z, u, []) + NATCH_EDGE);
      if (!b) continue;
      const c = clearAt(b.z, b.u, natches);
      if (fits(c)) natches.push({ z: b.z, u: b.u, r: Math.min(rMax, c), bump: lo === neg });
    }
  } else {
    // Three (Gary, 2026-10-14): not four with the smallest dropped — that kept
    // two crowded together on his mug. Try two at the ends of one side and one
    // along the other, both ways round. Keep the layout with more natches, then
    // the larger smallest natch, then the wider triangle.
    type C = Natch & { c: number };
    let best: { set: C[]; key: number[] } | null = null;
    for (const pairNeg of [true, false]) {
      const set: C[] = [];
      for (const lo of [true, false]) {
        const [u0, u1] = pairNeg ? [uB0, 0] : [0, uB1];
        const b = cornerIn(lo, u0, u1, (z, u) => clearAt(z, u, []) + NATCH_EDGE);
        const c = b ? clearAt(b.z, b.u, set) : -1;
        if (b && fits(c)) set.push({ z: b.z, u: b.u, r: Math.min(rMax, c), bump: lo === pairNeg, c });
      }
      // Opposite the middle of the pair (a balanced triangle) where a
      // full-size natch fits, else the roomiest spot on that side.
      const zc = set.length === 2 ? (set[0].z + set[1].z) / 2 : zMid;
      const [u0, u1] = pairNeg ? [0, uB1] : [uB0, 0];
      const b = bestIn(zB0, zB1, u0, u1, (z, u) => { const c = clearAt(z, u, set); return c >= rMax ? 1e6 - Math.abs(z - zc) : c; });
      const c = clearAt(b.z, b.u, set);
      if (fits(c)) set.push({ z: b.z, u: b.u, r: Math.min(rMax, c), bump: (b.z < zMid) === !pairNeg, c });
      const minR = set.length ? Math.min(...set.map((q) => q.r)) : 0;
      const area = set.length === 3
        ? Math.abs((set[1].z - set[0].z) * (set[2].u - set[0].u) - (set[1].u - set[0].u) * (set[2].z - set[0].z)) / 2 : 0;
      const key = [set.length, Math.round(minR * 2) / 2, area];
      const better = !best || key.some((v, i) => v !== best!.key[i]) && (() => {
        for (let i = 0; i < key.length; i++) if (key[i] !== best!.key[i]) return key[i] > best!.key[i];
        return false;
      })();
      if (better) best = { set, key };
    }
    for (const { z, u, r, bump } of best!.set) natches.push({ z, u, r, bump });
  }
  if (natches.length < wantCount) natchNote = `Only ${natches.length} natch${natches.length === 1 ? '' : 'es'} fit${natches.length === 1 ? 's' : ''} — raise Plaster to make room.`;
  const natchR = natches.length ? Math.min(...natches.map((n) => n.r)) : 0;
  const bumpsL: P2[] = natches.filter((n) => n.bump).map((n) => [n.z, n.u]);
  const dimplesL: P2[] = natches.filter((n) => !n.bump).map((n) => [n.z, n.u]);
  const bumpR = natches.filter((n) => n.bump).map((n) => n.r);
  const dimpleR = natches.filter((n) => !n.bump).map((n) => n.r);

  // ── Plaster between the handle and the rim/well. The first pour chipped
  // there: the top of the strap curls up under a flared rim and well, leaving
  // a thin plaster tongue that breaks as the master comes out. Measured in the
  // parting plane from the strap's two edges (visible stations) to the vase +
  // well outline at or above the rim. Ignores the body below the rim, which
  // the handle always meets at a sharp corner. ──
  let plasterGap: number | null = null;
  let plasterGapBottom: number | null = null;
  let gapWarning: string | null = null;
  if (handleSweep) {
    const nA = outA[0].length - 1;
    const rimSide = (k: number): P2[] => outA.map((arc) => [arc[k][0], arc[k][1]] as P2);
    let g = Infinity;
    for (const side of [rimSide(0), rimSide(nA)]) {
      for (let i = 0; i + 1 < side.length; i++) {
        if (Math.max(side[i][0], side[i + 1][0]) < hTop - 1e-6) continue;
        for (let st = handleSweep.stationFirst; st < handleSweep.stationFirst + handleSweep.stationArc.length; st++) {
          const ring = handleSweep.rings[st];
          for (const k of [0, HANDLE_SEG]) g = Math.min(g, segDist(ring[k][0], ring[k][1], side[i], side[i + 1]));
        }
      }
    }
    if (Number.isFinite(g)) {
      plasterGap = g;
      if (g < MIN_PLASTER_GAP) gapWarning = `Only ${g.toFixed(1)} mm of plaster between the top of the handle and the rim. Under ${MIN_PLASTER_GAP} mm it can chip as the master comes out — lower the handle (Top Below Rim) or narrow the well.`;
    }
    // And at the bottom end (2026-10-18): from the strap to the bottom of the
    // block — with the plug, to the band's sides (ring crest) and the halves'
    // bottom face.
    let gb = Infinity;
    const bottom: [P2, P2][] = [[[zB0, uB0], [zB0, uB1]]];
    if (footOn) {
      const c = bands[1].bR, lo = Math.min(c[0][0], c[c.length - 1][0]), hi = Math.max(c[0][0], c[c.length - 1][0]);
      for (const u of [lo, hi]) bottom.push([[0, u], [zB0, u]]);
    }
    for (let st = handleSweep.stationFirst; st < handleSweep.stationFirst + handleSweep.stationArc.length; st++) {
      const ring = handleSweep.rings[st];
      for (const k of [0, HANDLE_SEG]) for (const [p0, p1] of bottom) gb = Math.min(gb, segDist(ring[k][0], ring[k][1], p0, p1));
    }
    if (Number.isFinite(gb)) {
      plasterGapBottom = gb;
      if (gb < MIN_PLASTER_GAP) {
        const w = `Only ${gb.toFixed(1)} mm of plaster between the bottom of the handle and the ${footOn ? 'plug' : 'bottom of the mold'}. Under ${MIN_PLASTER_GAP} mm it can chip — raise the handle${footOn ? '' : ' or add Plaster'}.`;
        gapWarning = gapWarning ? `${gapWarning} ${w}` : w;
      }
    }
  }

  const layoutFor = (cavY0: number, cavY1: number): MoldLayout => ({
    cavX0, cavX1, cavY0, cavY1, yc: (cavY0 + cavY1) / 2,
    px0: cavX0 - border, px1: cavX1 + border, py0: cavY0 - border, py1: cavY1 + border,
    seat, lipThk: floorT, plateThk: seat + floorT, wallH, wt,
    vw: Math.min(V_WIDTH, seamMaxVWidth(flangeW, V_CLEARANCE)), vh: V_HEIGHT, vclr: V_CLEARANCE,
    flangeW, domeR: Math.max(natchR, 2), domeH: natchH, seg: 48,
    openR: 0, coneYA: 0, coneYB: 0,
    sealDepth, clr,
  });

  /**
   * One half's kit. `ySign` = +1 for L (native frame A), −1 for R (frame B);
   * native Y = ySign·u, print (x, y) = (−z, −Y).
   */
  const buildHalf = (outer: Arc[], inner: Arc[], ySign: 1 | -1, pocketsW: P2[], pocketR: number[], domesW: P2[], domeR: number[]) => {
    const toPrint = ([z, Y]: P2): P2 => [-z, -Y];
    const worldToPrint = ([z, u]: P2): P2 => [-z, -ySign * u];
    // y range of the block: print y = −ySign·u.
    const cavY0 = ySign > 0 ? -(uMax + m) : uMin - m;
    const cavY1 = ySign > 0 ? -(uMin - m) : uMax + m;
    const layout = layoutFor(cavY0, cavY1);

    // Master: the relief (skirt to the bed = −seat after the shift) + handle.
    const relief = translateMesh(rotate180Z(buildRelief(outer, inner, footOn), 0, 0), 0, 0, -seat);
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
    // Plug band (Gary 2026-10-18, as Split Thirds'): HOLLOW, a C-section —
    // the outer arc, skirts down `seat`, the hollow arc — open on the cut face
    // like the rest of the master, so the same ice water fills it. It runs
    // from the vase bottom (x = 0, where the relief's floor is open into it)
    // on through the base wall's boss to the wall, as the well runs into its
    // collar, and is capped there like the well end.
    // The rounded ring is a crescent loft over the band's outer skin (0.8 mm
    // deep); a crescent lap 0.3–0.8 mm inside the outline joins the band to
    // the relief (the band's x = 0 face only touches it).
    const disc: VaseMesh[] = [];
    if (footOn) {
      const d = bands[ySign];
      const pr = (q: P2[]): P2[] => q.map(([u, h]) => [-ySign * u, h] as P2);
      const sec = (q: P2[], bed = -seat): P2[] => {
        const pts = pr(q);
        return [...pts, [pts[pts.length - 1][0], bed], [pts[0][0], bed]];
      };
      const baseCap = dedupeLoop(offsetPolygon(sec(d.b0), -0.1));
      const crescent = (X: P2[], Y: P2[], drop: number): P2[] => {
        const o = pr(X), i = pr(Y), e = o.length - 1, f = i.length - 1;
        return [...o, [o[e][0], o[e][1] - drop], [i[f][0], i[f][1] - drop], ...i.slice().reverse(), [i[0][0], i[0][1] - drop], [o[0][0], o[0][1] - drop]];
      };
      const xRing = plugH / 2;
      disc.push(
        extrudeSolid(dedupeLoop(crescent(d.b0, d.inner, seat)), [], 0, cavX1, MAP_YZ_X),
        // Stations in increasing w (loftSolid's caps assume it); the two end
        // stations sit just inside the band's skin.
        loftSolid([
          { outer: crescent(d.lapIn, d.deep, seat), holes: [], w: xRing + RING_US[0] - 0.1 },
          ...RING_US.map((u, i) => ({ outer: crescent(d.ring[i], d.deep, seat), holes: [], w: xRing + u })),
          { outer: crescent(d.lapIn, d.deep, seat), holes: [], w: xRing + RING_US[RING_US.length - 1] + 0.1 },
        ], MAP_YZ_X),
        extrudeSolid(crescent(d.lap, d.deep, seat - 0.1), [], -Math.min(0.5, shell / 2), Math.min(0.5, plugH / 4), MAP_YZ_X),
        // End cap, inset and recessed as the well cap is.
        extrudeSolid(baseCap, [], cavX1 - CAP_RECESS - shell, cavX1 - CAP_RECESS, MAP_YZ_X),
      );
    }
    const master = mergeMeshes([relief, cap, ...(handleMesh ? [handleMesh] : []), ...disc]);
    const flags = new Float32Array(master.vertexCount);
    flags.set(undercutOf(outer, F));

    const fp = footprint(outer, ySign);
    if (fp.error) handleError = handleError ?? fp.error;
    const { pocketNative, islandNative } = fp;
    // Map to print and stop the pocket at the well wall's inner face.
    const pocket = removeSpikes(dedupeLoop(clipToXMax(pocketNative.map(toPrint).map(([x, y]) => [-x, y] as P2), zEnd).map(([x, y]) => [-x, y] as P2)));
    const island = islandNative ? dedupeLoop(islandNative.map(toPrint)) : null;

    // ── Plate: solid base slab + top slab (pocket + natch pockets) + finger
    // island + flange ridges + domes. ──
    const base = boxSolid(layout.px0, layout.py0, layout.px1, layout.py1, -seat - floorT, -seat);
    const topSlab = translateMesh(
      buildFloor([layout.px0, layout.py0, layout.px1, layout.py1], pocket,
        pocketsW.map(worldToPrint), pocketR, natchH, seat + EMBED),
      0, 0, -seat - EMBED);
    const islandSolid = island && Math.abs(polyArea(island)) > 1 ? extrudeSolid(island, [], -seat - EMBED, 0) : null;
    const domes = domesW.map(worldToPrint).map(([x, y], i) => buildDome(x, y, domeR[i], natchH, DOME_SEG));
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
    // Full width, side wall to side wall (Gary 2026-10-18): a collar band
    // 4 mm wide left a narrow plaster step each side of it, the kind
    // of corner that chips. So the plaster's pour end is flat, like its base.
    const collarPoly = dedupeLoop([[layout.cavY0 - EMBED, 0], ...bite, [layout.cavY1 + EMBED, 0], [layout.cavY1 + EMBED, wallH], [layout.cavY0 - EMBED, wallH]]);
    const collar = extrudeSolid(collarPoly, [], cavX0 - EMBED, cavX0 + layout.sealDepth, MAP_YZ_X);
    const wellWall = mergeMeshes([buildWall(layout, { collars: false, seams: 'ridges' }), collar]);
    // Base wall: the same wall design turned end for end about the box centre
    // (its sides land on the other halves of the long sides), grooves at its
    // seams. With the plug, a full-width boss holds the band's straight run —
    // full width so the halves' bottom face is flat round the plug — bored to
    // this half's band + the clearance.
    const cxB = (cavX0 + cavX1) / 2;
    const baseParts = [rotate180Z(buildWall(layout, { collars: false, seams: 'grooves' }), cxB, layout.yc)];
    if (footOn) {
      const bore = bands[ySign].bc.map(([u, h]) => [-ySign * u, Math.max(0, h)] as P2);
      if (bore[0][0] > bore[bore.length - 1][0]) bore.reverse();
      bore[0] = [bore[0][0], 0];
      bore[bore.length - 1] = [bore[bore.length - 1][0], 0];
      const bossPoly = dedupeLoop([[layout.cavY0 - EMBED, 0], ...bore, [layout.cavY1 + EMBED, 0], [layout.cavY1 + EMBED, wallH], [layout.cavY0 - EMBED, wallH]]);
      baseParts.push(extrudeSolid(bossPoly, [], cavX1 - sealDepth, cavX1 + EMBED, MAP_YZ_X));
    }
    const baseWall = mergeMeshes(baseParts);

    // Plaster: block interior minus the half-vase (+ handle) above the plane.
    let envelope = 0;
    for (let i = 0; i + 1 < outer.length; i++) {
      const dx = outer[i + 1][0][0] - outer[i][0][0];
      envelope += (dx * (halfSectionArea(outer[i], F) + halfSectionArea(outer[i + 1], F))) / 2;
    }
    if (handleSweep) envelope += handleSweep.volume;
    // The plaster starts at the well wall's boss face (drop the well run
    // inside it); with the plug it stops at the base wall's boss, the halves'
    // bottom face: add the band (and its ring, a rounded bump ~2/3 of its box).
    const xLo = cavX0 + sealDepth, xHi = footOn ? plugH : cavX1;
    envelope -= halfSectionArea(outer[outer.length - 1], F) * sealDepth;
    if (footOn) {
      const d = bands[ySign];
      envelope += plugH * Math.abs(polyArea(d.b0)) + (RING_W * 2 / 3) * (Math.abs(polyArea(d.bR)) - Math.abs(polyArea(d.b0)));
    }
    const plasterVol = Math.max(0, (xHi - xLo) * (cavY1 - cavY0) * wallH - envelope);
    const plaster = boxSolid(xLo, cavY0, xHi, cavY1, 0, wallH);

    const toP = (z: number, u: number, h: number): [number, number, number] => [-z, -ySign * u, h];
    const dbg: HalfDebug = {
      relief, cap, capPoly, handle: handleMesh, plate: plateParts,
      ribs: handleShell > 0 ? handlePrint.slice(1).map((sw) => meshSweep(sw, toP)) : [],
      ribHoles: ribHolesW.map(({ c, t }) => ({ p: toP(c[0], c[1], c[2]), t: [-t[0], -ySign * t[1]] as P2 })),
      handleSolid: handleSweep ? meshSweep(handleSweep, toP) : null,
      // Strap centreline at the parting plane, print (x, y), visible stations only.
      strapLine: handleSweep
        ? handleSweep.rings.slice(handleSweep.stationFirst, handleSweep.stationFirst + handleSweep.stationArc.length)
          .map((r) => { const [x0, y0] = toP(r[0][0], r[0][1], 0), [x1, y1] = toP(r[HANDLE_SEG][0], r[HANDLE_SEG][1], 0); return [(x0 + x1) / 2, (y0 + y1) / 2] as P2; })
        : [],
    };
    return { master, flags, plate, plateParts, wellWall, baseWall, plaster, plasterVol, layout, relief, handleMesh, pocket, island, dbg, disc, outerPrint: outer.map((arc) => arc.map(([z, Y, Z]) => [-z, -Y, Z - F])) };
  };

  const L = buildHalf(outA, inA, 1, bumpsL, bumpR, dimplesL, dimpleR);
  const R = buildHalf(outB, inB, -1, dimplesL, dimpleR, bumpsL, bumpR);

  // ── The plug's cup (plug-cup.ts, shared with Split Thirds): a disk shaped
  // like the vase bottom on a ledge inside 2–4 clip-together walls, the fewest
  // that pull straight off the plug. Same wall, flange and floor numbers as
  // the halves' own walls. ──
  let footOut: PlugFoot | null = null;
  let footDbg: SplitHalvesMoldMeshes['debug']['foot'] = null;
  let footDisplay: { plate: VaseMesh; walls: VaseMesh; plaster: VaseMesh; reach: number; lift: number } | null = null;
  if (footOn) {
    const cup = buildPlugCup({
      ring0, c0x, c0y, rRes, smoothBase: outerStack.smoothBase, plugH, clr, wt, flangeW, floorT,
      footSmoothInner: mold.footSmoothInner, footHeight: mold.footHeight, footWidth: mold.footWidth, footSlopeWidth: mold.footSlopeWidth,
    });
    if (typeof cup === 'string') return errorResult(cup);
    footOut = cup.foot; footDisplay = cup.display;
    footDbg = {
      plugH, bandL: bands[1].b0, bandR: bands[-1].b0, crestL: bands[1].bR, crestR: bands[-1].bR,
      discL: [], discR: [], cup: cup.dbg,
    };
  }

  // ── Display: L assembly on the left, R on the right (shifted along −y/+y). ──
  const dyL = -L.layout.py1 - LAYOUT_GAP / 2;
  const dyR = -R.layout.py0 + LAYOUT_GAP / 2;
  const cxBox = (cavX0 + cavX1) / 2;
  const shiftX = -cxBox;
  // Display only: stand the plates on the ground grid (plate bottom at z = 0)
  // so the grid doesn't show through inside the mold. Exports keep assembly
  // coordinates and their own lifts.
  const dz = seat + floorT;
  const masters = mergeMeshes([translateMesh(L.master, shiftX, dyL, dz), translateMesh(R.master, shiftX, dyR, dz)]);
  const plates = mergeMeshes([translateMesh(L.plate, shiftX, dyL, dz), translateMesh(R.plate, shiftX, dyR, dz)]);
  const walls = mergeMeshes([
    translateMesh(L.wellWall, shiftX, dyL, dz), translateMesh(L.baseWall, shiftX, dyL, dz),
    translateMesh(R.wellWall, shiftX, dyR, dz), translateMesh(R.baseWall, shiftX, dyR, dz),
  ]);
  const plasterParts = [translateMesh(L.plaster, shiftX, dyL, dz), translateMesh(R.plaster, shiftX, dyR, dz)];
  let platesOut = plates, wallsOut = walls;
  if (footDisplay) {
    // The cup to the side of the two halves (they run along y), centred,
    // standing on the grid like the plates.
    const halvesRight = L.layout.px1 + shiftX;
    const fsx = halvesRight + LAYOUT_GAP + footDisplay.reach;
    const dzF = footDisplay.lift;
    platesOut = mergeMeshes([plates, translateMesh(footDisplay.plate, fsx, 0, dzF)]);
    wallsOut = mergeMeshes([walls, translateMesh(footDisplay.walls, fsx, 0, dzF)]);
    plasterParts.push(translateMesh(footDisplay.plaster, fsx, 0, dzF));
  }
  const plaster = mergeMeshes(plasterParts);
  if (footDbg) { footDbg.discL = L.disc; footDbg.discR = R.disc; }
  const undercutFlags = new Float32Array(masters.vertexCount);
  undercutFlags.set(L.flags, 0);
  undercutFlags.set(R.flags, L.master.vertexCount);
  let hasUndercuts = false;
  for (let i = 0; i < undercutFlags.length; i++) if (undercutFlags[i] >= 0.999) { hasUndercuts = true; break; }

  return {
    style: 'splitHalves',
    masterL: L.master, masterR: R.master, plateL: L.plate, plateR: R.plate,
    wellWallL: L.wellWall, baseWallL: L.baseWall, wellWallR: R.wellWall, baseWallR: R.baseWall,
    masters, plates: platesOut, walls: wallsOut, plaster, undercutFlags, hasUndercuts, oneKit,
    plasterVolumeMm3: L.plasterVol + R.plasterVol,
    masterStats: computeMeshStats(L.master),
    plateStats: computeMeshStats(L.plate),
    wallStats: computeMeshStats(L.wellWall),
    baseWallStats: computeMeshStats(L.baseWall),
    natchRadius: natchR,
    natches, natchNote, plasterGap, plasterGapBottom, gapWarning,
    error: null,
    handle: placement && handleSweep ? { placement, sectionMm } : null,
    handleError, handleWarning,
    foot: footOut,
    layout: {
      cavX0, cavX1, cavY0: L.layout.cavY0, cavY1: L.layout.cavY1, wallH, seat,
      plateThk: seat + floorT,
      plateW: L.layout.px1 - L.layout.px0, plateD: L.layout.py1 - L.layout.py0,
      masterLift: seat, plateLift: seat + floorT,
    },
    debug: {
      partsL: L.dbg, partsR: R.dbg, handleShell, handleRibs,
      pocketL: L.pocket, islandL: L.island, pocketR: R.pocket, islandR: R.island,
      bumpsL, dimplesL, natchFrame: { obstacle, zB0, zB1, uB0, uB1, hTop }, foot: footDbg,
    },
  };
}
