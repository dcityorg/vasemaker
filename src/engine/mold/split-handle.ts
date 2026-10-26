/**
 * Split 2-Pc Phase 2 — a HandleMaker handle cast onto the vase.
 *
 * The handle is drawn in HandleMaker as usual: a spine in its own (x, y) plane,
 * x = stick-out from a flat wall at x = 0, y = height. Here it is ROTATED onto
 * the vase (Gary, 2026-10-09: "rather than extending the handle ends, could you
 * rotate the handle to mate with the mug?"): the top end goes on the vase's
 * outline in the split plane at a chosen height, the bottom end where the
 * handle's span reaches the outline lower down. Handle +y maps along that chord,
 * handle +x to the outward perpendicular.
 *
 * World split-plane coordinates are (z, u): z up the vase, u along the split
 * line, positive on the seam-direction side (where the handle goes).
 *
 * The placement is a pure function of the outline and the spine, used by BOTH
 * the mold and HandleMaker's mug overlay, so what Sher draws against is what the
 * mold builds. It commutes with uniform scale, so the overlay can work in
 * finished mm while the mold works shrink-scaled.
 *
 * Plan + rationale: local-docs/moldmaker-split2pc-plan.md, Phase 2.
 */

import type { SpineStation } from '../handle/spine';
import type { Ring } from './ring-mesh';
import { MeshBuilder, ensureOutward, triangulateFace, type P2 } from '../handle/mesh3';
import type { VaseMesh, VaseParameters } from '../types';
import { prepareVaseParams, buildOuterRings } from './mold-generator';

/** Vase outline in the split plane on the +s side, (z, u), bottom → top. One
 *  point per ring: the ring's furthest crossing of the plane toward +s. */
export function splitSilhouette(rings: Ring[], rRes: number, cx: number, cy: number, sx: number, sy: number): P2[] {
  const px = -sy, py = sx;
  const out: P2[] = [];
  for (const r of rings) {
    let best = -Infinity, bz = 0;
    for (let t = 0; t < rRes; t++) {
      const a = t * 3, b = ((t + 1) % rRes) * 3;
      const ha = (r[a] - cx) * px + (r[a + 1] - cy) * py;
      const hb = (r[b] - cx) * px + (r[b + 1] - cy) * py;
      if ((ha <= 0 && hb > 0) || (ha > 0 && hb <= 0)) {
        const f = ha / (ha - hb);
        const x = r[a] + (r[b] - r[a]) * f, y = r[a + 1] + (r[b + 1] - r[a + 1]) * f;
        const u = (x - cx) * sx + (y - cy) * sy;
        if (u > best) { best = u; bz = r[a + 2] + (r[b + 2] - r[a + 2]) * f; }
      }
    }
    if (best > 0) out.push([bz, best]);
  }
  return out;
}

export interface HandlePlacement {
  /** Top and bottom attachment points on the outline, (z, u). */
  T: P2;
  B: P2;
  /** Unit chord B → T (handle +y) and outward perpendicular (handle +x), (z, u). */
  c: P2;
  n: P2;
  /** Handle-space y of the bottom endpoint. */
  yBot: number;
  /** Distance between the handle's two ends. */
  span: number;
}

/**
 * Put the handle on the outline: top end at height `topZ`, bottom end the first
 * outline point BELOW it at the handle's span. Returns an error message when it
 * cannot (top off the vase, or the handle longer than the vase below it).
 */
export function placeHandle(sil: P2[], stations: SpineStation[], topZ: number): HandlePlacement | string {
  if (sil.length < 2) return 'The vase outline could not be found in the split plane.';
  const y0 = stations[0].y, y1 = stations[stations.length - 1].y;
  const span = Math.abs(y1 - y0);
  if (span < 1) return 'The handle\'s two ends are at the same height — HandleMaker needs a span.';
  const yBot = Math.min(y0, y1);
  const zMin = sil[0][0], zMax = sil[sil.length - 1][0];
  if (topZ > zMax || topZ < zMin) return 'The top attachment is off the vase — reduce Top Below Rim.';
  let k = 0;
  while (k + 1 < sil.length && sil[k + 1][0] <= topZ) k++;
  const k1 = Math.min(k + 1, sil.length - 1);
  const fr = sil[k1][0] > sil[k][0] ? (topZ - sil[k][0]) / (sil[k1][0] - sil[k][0]) : 0;
  const T: P2 = [topZ, sil[k][1] + (sil[k1][1] - sil[k][1]) * fr];
  let prev: P2 = T, prevF = -span, B: P2 | null = null;
  for (let i = k; i >= 0; i--) {
    const P = sil[i];
    if (P[0] >= topZ) continue;
    const f = Math.hypot(P[0] - T[0], P[1] - T[1]) - span;
    if (f >= 0) {
      const t = -prevF / (f - prevF);
      B = [prev[0] + (P[0] - prev[0]) * t, prev[1] + (P[1] - prev[1]) * t];
      break;
    }
    prev = P; prevF = f;
  }
  if (!B) return `The handle's ends are ${span.toFixed(0)} mm apart — more than the vase has below the top attachment. Raise the top or shorten the handle.`;
  const len = Math.hypot(T[0] - B[0], T[1] - B[1]);
  const c: P2 = [(T[0] - B[0]) / len, (T[1] - B[1]) / len];
  const n: P2 = [-c[1], c[0]];
  return { T, B, c, n, yBot, span };
}

/** Handle (x, y) → world (z, u). */
export function handleToWorld(pl: HandlePlacement, x: number, y: number): P2 {
  const s = y - pl.yBot;
  return [pl.B[0] + s * pl.c[0] + x * pl.n[0], pl.B[1] + s * pl.c[1] + x * pl.n[1]];
}

/** World (z, u) → handle (x, y) — for drawing the vase in HandleMaker. */
export function worldToHandle(pl: HandlePlacement, z: number, u: number): P2 {
  const dz = z - pl.B[0], du = u - pl.B[1];
  return [dz * pl.n[0] + du * pl.n[1], pl.yBot + dz * pl.c[0] + du * pl.c[1]];
}

/** One half's outer arcs in print space: [X = z, Y = ±u, Z = F + height above the plane]. */
type Arc = [number, number, number][];

/**
 * u of the vase surface on the handle side, at height z and `hz` above the
 * parting plane, from ONE half's own arcs (an asymmetric cross-section has a
 * different surface near the outline on each half). −∞ above the half's crown.
 */
export function surfaceLookup(arcs: Arc[], F: number, ySign: number): (z: number, hz: number) => number {
  const rowU = (arc: Arc, hz: number): number => {
    const n = arc.length - 1;
    const fromStart = ySign * arc[0][1] > ySign * arc[n][1];
    let prevU = ySign * (fromStart ? arc[0][1] : arc[n][1]);
    let prevH = (fromStart ? arc[0][2] : arc[n][2]) - F;
    if (hz <= prevH) return prevU;
    for (let k = 1; k <= n; k++) {
      const p = fromStart ? arc[k] : arc[n - k];
      const u = ySign * p[1], h = p[2] - F;
      if (h >= hz) return prevU + (u - prevU) * ((hz - prevH) / Math.max(1e-9, h - prevH));
      prevU = u; prevH = h;
    }
    return -Infinity;
  };
  return (z: number, hz: number): number => {
    if (z <= arcs[0][0][0]) return rowU(arcs[0], hz);
    const last = arcs.length - 1;
    if (z >= arcs[last][0][0]) return rowU(arcs[last], hz);
    let lo = 0, hi = last;
    while (lo + 1 < hi) {
      const m = (lo + hi) >> 1;
      if (arcs[m][0][0] <= z) lo = m; else hi = m;
    }
    const z0 = arcs[lo][0][0], z1 = arcs[hi][0][0];
    const t = z1 > z0 ? (z - z0) / (z1 - z0) : 0;
    const a = rowU(arcs[lo], hz), b = rowU(arcs[hi], hz);
    if (!isFinite(a) || !isFinite(b)) return -Infinity;
    return a + (b - a) * t;
  };
}

/** Solid half cross-section: half-ellipse (in-plane half-width a, height b)
 *  over a skirt `seat` deep into the floor. Closed CCW in (u, h). */
export function halfProfile(a: number, b: number, seat: number, seg: number): P2[] {
  const pts: P2[] = [];
  for (let j = 0; j <= seg; j++) {
    const th = (j / seg) * Math.PI;
    pts.push([Math.cos(th) * a, Math.sin(th) * b]);
  }
  pts.push([-a, -seat]);
  pts.push([a, -seat]);
  return pts;
}

/**
 * Hollow half cross-section (HandleMaker's channel): the solid profile shelled
 * to `t`, OPEN along the bottom — both shell walls run down to −seat and the
 * space between them is void. Point 0 and point `seg` are still the strap's
 * outer edges at the parting plane, as in `halfProfile`.
 */
export function channelProfile(a: number, b: number, seat: number, seg: number, t: number): P2[] {
  const ai = a - t, bi = b - t;
  const pts: P2[] = [];
  for (let j = 0; j <= seg; j++) {
    const th = (j / seg) * Math.PI;
    pts.push([Math.cos(th) * a, Math.sin(th) * b]);
  }
  pts.push([-a, -seat], [-ai, -seat]);
  for (let j = seg; j >= 0; j--) {
    const th = (j / seg) * Math.PI;
    pts.push([Math.cos(th) * ai, Math.sin(th) * bi]);
  }
  pts.push([ai, -seat], [a, -seat]);
  return pts;
}

interface Frame { cx: number; cy: number; ux: number; uy: number }

/**
 * Sweep another profile over the same frames as `sw`, at fractional frame
 * indices (the u-axis is renormalised after the lerp). Used for the hollow
 * strap and its pull-ribs, which must follow the solid sweep exactly.
 */
export function resweep(
  sw: HandleSweep, pl: HandlePlacement, profile: P2[], at: number[],
): HandleSweep {
  const F = sw.frames;
  const frameAt = (fi: number): Frame => {
    const i0 = Math.max(0, Math.min(F.length - 1, Math.floor(fi)));
    const i1 = Math.min(F.length - 1, i0 + 1);
    const t = Math.max(0, Math.min(1, fi - i0));
    const a = F[i0], b = F[i1];
    let ux = a.ux + (b.ux - a.ux) * t, uy = a.uy + (b.uy - a.uy) * t;
    const L = Math.hypot(ux, uy) || 1;
    ux /= L; uy /= L;
    return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, ux, uy };
  };
  const rings = at.map((fi) => {
    const f = frameAt(fi);
    return profile.map(([pu, ph]) => {
      const [z, u] = handleToWorld(pl, f.cx + f.ux * pu, f.cy + f.uy * pu);
      return [z, u, ph] as [number, number, number];
    });
  });
  return { ...sw, rings, profile };
}

export interface HandleSweep {
  /** Rings of (z, u, h) — world split-plane coords + height above the parting plane. */
  rings: [number, number, number][][];
  profile: P2[];
  /** Half-handle volume of the VISIBLE part (station run only), mm³. */
  volume: number;
  /** The sweep frames (handle space) and where the visible station run sits in them. */
  frames: { cx: number; cy: number; ux: number; uy: number }[];
  stationFirst: number;
  /** Cumulative arc length along the station run, one entry per station. */
  stationArc: number[];
}

/**
 * Sweep the half-section along the spine and on past each end, curving into
 * the vase (handle −x), until every point of the end ring is `bury` mm inside
 * the vase surface on BOTH halves (`depthInside` returns how far inside a point
 * is; negative = outside).
 *
 * Why the ends still continue: the flat end HandleMaker draws maps onto the
 * CHORD between the two attachment points, and the vase curves away from a
 * chord, so part of each end face would otherwise hang in air. What continues
 * past the surface lies inside the relief's hollow, which faces the bed, not
 * the plaster — nothing moulds it.
 */
export function sweepHandle(
  stations: SpineStation[], pl: HandlePlacement,
  hw: number, ht: number, seat: number, seg: number,
  depthInside: (z: number, u: number, h: number) => number, bury: number,
): HandleSweep | string {
  const profile = halfProfile(hw, ht, seat, seg);
  const buried = (f: Frame): boolean => {
    for (const [pu, ph] of profile) {
      const [z, u] = handleToWorld(pl, f.cx + f.ux * pu, f.cy + f.uy * pu);
      if (depthInside(z, u, Math.max(0, ph)) < bury) return false;
    }
    return true;
  };
  const ext = (end: SpineStation, dx0: number, dy0: number): Frame[] | null => {
    const out: Frame[] = [];
    // Blend from the end tangent into straight-into-the-vase (−x). Longer than
    // HandleMaker's 1.5·hw so the inside of the bend doesn't fold.
    const blendLen = hw * 2.5;
    const ds = 0.5;
    let cx = end.x, cy = end.y, sAcc = 0;
    for (let e = 0; e < 400; e++) {
      const w = Math.min(1, sAcc / blendLen);
      let dx = dx0 * (1 - w) - w, dy = dy0 * (1 - w);
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      cx += dx * ds; cy += dy * ds; sAcc += ds;
      const f = { cx, cy, ux: end.nx, uy: end.ny };
      out.push(f);
      if (buried(f)) return out;
    }
    return null;
  };
  const s0 = stations[0], s1 = stations[stations.length - 1];
  const extA = ext(s0, -s0.tx, -s0.ty);
  const extB = ext(s1, s1.tx, s1.ty);
  if (!extA || !extB) return 'A handle end could not be buried in the vase wall — check the handle shape and Top Below Rim.';
  const frames: Frame[] = [];
  for (let i = extA.length - 1; i >= 0; i--) frames.push(extA[i]);
  for (const st of stations) frames.push({ cx: st.x, cy: st.y, ux: st.nx, uy: st.ny });
  for (const f of extB) frames.push(f);

  const rings = frames.map((f) => profile.map(([pu, ph]) => {
    const [z, u] = handleToWorld(pl, f.cx + f.ux * pu, f.cy + f.uy * pu);
    return [z, u, ph] as [number, number, number];
  }));
  const stationArc = [0];
  for (let i = 1; i < stations.length; i++) stationArc.push(stationArc[i - 1] + Math.hypot(stations[i].x - stations[i - 1].x, stations[i].y - stations[i - 1].y));
  const len = stationArc[stationArc.length - 1];
  return { rings, profile, volume: (Math.PI * hw * ht / 2) * len, frames, stationFirst: extA.length, stationArc };
}

/** Mesh a sweep through a print-space map. Caps are triangulated in profile-
 *  index space on the end rings (planar by construction). */
export function meshSweep(sw: HandleSweep, map: (z: number, u: number, h: number) => [number, number, number]): VaseMesh {
  const b = new MeshBuilder();
  const M = sw.profile.length;
  const ids = sw.rings.map((r) => r.map(([z, u, h]) => {
    const [x, y, zz] = map(z, u, h);
    return b.vertex(x, y, zz);
  }));
  for (let r = 0; r + 1 < ids.length; r++) {
    for (let k = 0; k < M; k++) {
      const kn = (k + 1) % M;
      b.quad(ids[r][k], ids[r][kn], ids[r + 1][kn], ids[r + 1][k]);
    }
  }
  const face = triangulateFace(sw.profile, []);
  const first = ids[0], last = ids[ids.length - 1];
  for (const [i, j, k] of face.tris) {
    b.tri(first[i], first[k], first[j]);
    b.tri(last[i], last[j], last[k]);
  }
  return ensureOutward(b.build());
}

/**
 * The vase outline on the handle side, in FINISHED mm (no shrink), for
 * HandleMaker's mug overlay. Resolution is capped — this redraws while Sher
 * drags, and a 2-D outline does not need the mold's mesh density.
 */
export function vaseOutlineForHandle(vase: VaseParameters, seamAngle: number, keepTexture: boolean): { sil: P2[]; silFar: P2[]; rimZ: number; center: P2 } {
  const v: VaseParameters = { ...vase, resolution: { ...vase.resolution, vertical: Math.min(vase.resolution.vertical, 160), radial: Math.min(vase.resolution.radial, 240) } };
  const p = prepareVaseParams(v, 1, keepTexture);
  const stack = buildOuterRings(p, keepTexture && p.textures.enabled !== false);
  const a = (seamAngle * Math.PI) / 180;
  const [cx, cy] = stack.centers[0];
  return {
    sil: splitSilhouette(stack.rings, p.resolution.radial, cx, cy, Math.cos(a), Math.sin(a)),
    // The opposite side of the same split plane (u measured along −s) — with
    // `sil` it is the vase's full profile through the handle.
    silFar: splitSilhouette(stack.rings, p.resolution.radial, cx, cy, -Math.cos(a), -Math.sin(a)),
    rimZ: stack.heights[stack.heights.length - 1],
    /** The point u is measured from (the base ring's centre) — SprigMaker's On Vase needs it. */
    center: [cx, cy],
  };
}

/** Clip a polyline to a rectangle, returning the visible runs. */
export function clipPolyline(pts: P2[], x0: number, x1: number, y0: number, y1: number): P2[][] {
  const out: P2[][] = [];
  let run: P2[] = [];
  const flush = () => { if (run.length > 1) out.push(run); run = []; };
  for (let i = 0; i + 1 < pts.length; i++) {
    // Liang–Barsky on segment i.
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1, ok = true;
    for (const [pp, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]] as [number, number][]) {
      if (pp === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / pp;
      if (pp < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { flush(); continue; }
    const s: P2 = [ax + dx * t0, ay + dy * t0], e: P2 = [ax + dx * t1, ay + dy * t1];
    if (run.length === 0 || t0 > 0) { flush(); run.push(s); }
    run.push(e);
    if (t1 < 1) flush();
  }
  flush();
  return out;
}

/**
 * One horizontal slice of the vase in FINISHED mm, relative to the base
 * centre — for the Mold tab's top-down Split Angle diagram. `zFrac` is the
 * height as a fraction of the vase (0 = base, 1 = rim).
 */
export function vaseSliceForDiagram(vase: VaseParameters, keepTexture: boolean, zFrac: number): P2[] {
  const v: VaseParameters = { ...vase, resolution: { ...vase.resolution, vertical: Math.min(vase.resolution.vertical, 120), radial: Math.min(vase.resolution.radial, 240) } };
  const p = prepareVaseParams(v, 1, keepTexture);
  const stack = buildOuterRings(p, keepTexture && p.textures.enabled !== false);
  const i = Math.max(0, Math.min(stack.rings.length - 1, Math.round(zFrac * (stack.rings.length - 1))));
  const r = stack.rings[i];
  const [cx, cy] = stack.centers[0];
  const out: P2[] = [];
  for (let t = 0; t < p.resolution.radial; t++) out.push([r[t * 3] - cx, r[t * 3 + 1] - cy]);
  return out;
}

/** Outline radius u at height z, linear between outline points (clamped at the ends). */
export function outlineAt(sil: P2[], z: number): number {
  if (z <= sil[0][0]) return sil[0][1];
  const last = sil.length - 1;
  if (z >= sil[last][0]) return sil[last][1];
  let lo = 0, hi = last;
  while (lo + 1 < hi) {
    const m = (lo + hi) >> 1;
    if (sil[m][0] <= z) lo = m; else hi = m;
  }
  const t = (z - sil[lo][0]) / Math.max(1e-9, sil[hi][0] - sil[lo][0]);
  return sil[lo][1] + (sil[hi][1] - sil[lo][1]) * t;
}

/**
 * The handle's outline in the split plane, (z, u), as a closed polygon — for
 * HandleMaker's side view of the finished mug. The same sweep as the mold,
 * buried against the 2-D outline (the view only needs the ends to disappear
 * into the wall, not the mold's per-half 3-D test). `hw` = half the strap
 * as seen side-on (stored `width` / 2).
 */
export function strapOutline2D(stations: SpineStation[], pl: HandlePlacement, hw: number, sil: P2[]): P2[] | null {
  const seg = 8;
  const sw = sweepHandle(stations, pl, hw, 1, 0, seg, (z, u) => outlineAt(sil, z) - u, 0.6);
  if (typeof sw === 'string') return null;
  const a = sw.rings.map((r) => [r[0][0], r[0][1]] as P2);
  const b = sw.rings.map((r) => [r[seg][0], r[seg][1]] as P2);
  return [...a, ...b.reverse()];
}
