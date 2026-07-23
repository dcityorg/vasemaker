/**
 * Straight-pull undercut analysis for the mold master.
 *
 * The master releases from the set plaster only if, along every vertical line
 * of its surface, the radius about the pull axis never DECREASES moving up:
 * each horizontal slice must fit through every slice above it. Surface angle is
 * irrelevant — a 1° inward lean traps the master just like a steep ledge, and
 * vertical walls pull fine. So this is a strict monotonicity test, not an
 * overhang-angle test.
 *
 * The check paints the whole TRAPPED region, not just where the profile turns
 * inward: a vertex is flagged when it sits farther out than the narrowest
 * material anywhere ABOVE it at the same azimuth (a running minimum swept
 * top → bottom). A bulge below a neck therefore shows red across the entire
 * stuck bulge — exactly the material that would collide with plaster on the
 * way out.
 *
 * Rings are resampled onto a fixed azimuth grid about the world z-axis (the
 * pull direction) before the sweep. Mesh columns are NOT vertical lines in
 * world space (arc-length sampling and twist make vertex t drift in azimuth
 * from row to row), so comparing raw grid columns would be wrong — e.g. a
 * twisted square has constant radius down every mesh column but genuinely
 * cannot pull straight up; the azimuth resample catches it.
 */

import type { Ring } from './ring-mesh';

/** Ignore violations smaller than this (azimuth-resampling noise on curved shapes), mm. */
const TOLERANCE = 0.02;
/** Flag ramps 0 → 1 over this extra violation depth (anti-aliased red edge), mm. */
const RAMP = 0.05;

const TWO_PI = Math.PI * 2;

export interface UndercutResult {
  /** Per-vertex 0..1 undercut factor, aligned with the master mesh vertex buffer (0 for non-body vertices). */
  flags: Float32Array;
  /** True if any vertex is fully flagged (violation past the anti-alias ramp). */
  any: boolean;
}

/**
 * Resample one ring's outermost radius at the N azimuth grid nodes
 * (θ_k = k·2π/N about the world origin) into `out` (values < 0 = azimuth not
 * covered by this ring — possible only when heavy XY sway pushes the world
 * axis outside the loop; such nodes simply contribute no constraint).
 */
function resampleRingRadius(ring: Ring, rRes: number, N: number, out: Float32Array): void {
  out.fill(-1);
  const step = TWO_PI / N;
  for (let t = 0; t < rRes; t++) {
    const tN = (t + 1) % rRes;
    const x0 = ring[t * 3], y0 = ring[t * 3 + 1];
    const x1 = ring[tN * 3], y1 = ring[tN * 3 + 1];
    const a0 = Math.atan2(y0, x0);
    let da = Math.atan2(y1, x1) - a0;
    if (da > Math.PI) da -= TWO_PI;
    else if (da < -Math.PI) da += TWO_PI;
    const lo = da >= 0 ? a0 : a0 + da;
    const hi = da >= 0 ? a0 + da : a0;
    const kStart = Math.ceil(lo / step - 1e-9);
    const kEnd = Math.floor(hi / step + 1e-9);
    for (let k = kStart; k <= kEnd; k++) {
      const theta = k * step;
      const c = Math.cos(theta), s = Math.sin(theta);
      // Ray from origin along (c, s) ∩ segment: solve cross(dir, P(u)) = 0.
      const e0 = c * y0 - s * x0;
      const e1 = c * y1 - s * x1;
      const denom = e0 - e1;
      let r: number;
      if (Math.abs(denom) < 1e-12) {
        // Segment collinear with the ray — outermost endpoint wins.
        r = Math.max(x0 * c + y0 * s, x1 * c + y1 * s);
      } else {
        const u = e0 / denom;
        const px = x0 + u * (x1 - x0);
        const py = y0 + u * (y1 - y0);
        r = px * c + py * s;
      }
      if (r > 0) {
        const kw = ((k % N) + N) % N;
        if (r > out[kw]) out[kw] = r;
      }
    }
  }
}

/**
 * Sweep the master body rings top → bottom, flagging every vertex whose radius
 * exceeds the running minimum of the material above it at its azimuth.
 *
 * @param bodyRings   Master body outer rings, bottom → top (post collar-fuse).
 * @param heights     Ring heights in master-local z, parallel to `bodyRings`.
 * @param rRes        Points per ring.
 * @param bodyBaseVertex Vertex index of bodyRings[0]'s first point in the master mesh.
 * @param vertexCount Total master mesh vertex count (flags array length).
 * @param exemptBelowZ Rings at or below this height (+0.05 slack) are not
 *   flagged — the foot recess / build-plate zone lifts cleanly off the plaster boss.
 */
export function computeUndercutFlags(
  bodyRings: Ring[],
  heights: number[],
  rRes: number,
  bodyBaseVertex: number,
  vertexCount: number,
  exemptBelowZ: number,
): UndercutResult {
  const N = rRes;
  const flags = new Float32Array(vertexCount);
  const runMin = new Float32Array(N).fill(Infinity);
  const ringR = new Float32Array(N);
  let any = false;

  for (let v = bodyRings.length - 1; v >= 0; v--) {
    const ring = bodyRings[v];

    // 1. Flag this ring's vertices against the material strictly above it.
    if (heights[v] > exemptBelowZ + 0.05) {
      for (let t = 0; t < rRes; t++) {
        const x = ring[t * 3], y = ring[t * 3 + 1];
        const r = Math.hypot(x, y);
        if (r < 1e-6) continue;
        let a = Math.atan2(y, x);
        if (a < 0) a += TWO_PI;
        const b = (a / TWO_PI) * N;
        const b0 = Math.floor(b) % N;
        const b1 = (b0 + 1) % N;
        const m0 = runMin[b0], m1 = runMin[b1];
        let m: number;
        if (m0 === Infinity) m = m1;
        else if (m1 === Infinity) m = m0;
        else m = m0 + (m1 - m0) * (b - Math.floor(b));
        if (m === Infinity) continue; // nothing above at this azimuth
        const f = Math.min(1, Math.max(0, (r - m - TOLERANCE) / RAMP));
        if (f > 0) {
          flags[bodyBaseVertex + v * rRes + t] = f;
          if (f >= 1) any = true;
        }
      }
    }

    // 2. Fold this ring into the running minimum for the rings below it.
    resampleRingRadius(ring, rRes, N, ringR);
    for (let k = 0; k < N; k++) {
      const r = ringR[k];
      if (r > 0 && r < runMin[k]) runMin[k] = r;
    }
  }

  return { flags, any };
}
