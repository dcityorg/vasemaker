/**
 * The underside of the vase: the foot ring and the maker's mark
 * (local-docs/bottom-mark-plan.md). Replaces the flat bottom disc when either
 * is in use; with neither, generateMesh never calls this and the mesh is
 * byte-identical to before.
 *
 * Built as rings from the outside in — the wall's bottom row, the foot ring's
 * inner edge, the recess edge (exactly the molds' buildFootRings: radial
 * offsets of the bottom outline), then the recess floor as the recess edge
 * scaled toward the centre. The mark is a height field over that floor, so the
 * surface never folds and stays one closed, outward-facing skin.
 *
 * Orientation: the mark is read LOOKING UP at the bottom. Seen from below, +x
 * appears on the LEFT, so mark x = −world x. Offsets and Angle are in that
 * from-below frame.
 */

import type { BottomSettings, VaseParameters } from './types';
import type { ReliefField } from './sprig/relief';
import { offsetRingRadial } from './mold/ring-mesh';

/** PLA kept above the deepest point of the bottom, mm (3 layers). */
export const MIN_FLOOR = 0.6;
/** Ink below this fraction of the mark's height counts as no mark (antialias fringe). */
const INK = 0.02;
/** Most rings laid under the mark, whatever its size. */
const MAX_MARK_RINGS = 500;

/** The mark's relief, built from the vase's copy of the Mark design. Set by
 *  the browser hook (it needs a canvas); the mesh build reads it. Module state
 *  like the SVG texture's pixels, so the STL export sees the same mark. */
let markField: ReliefField | null = null;
export function setBottomMarkField(f: ReliefField | null): void { markField = f; }
export function getBottomMarkField(): ReliefField | null { return markField; }

/** What the bottom needs, given the settings and whether there is a base. */
export function bottomUse(b: BottomSettings | undefined, hasBase: boolean, field: ReliefField | null) {
  const recess = !!b && hasBase && b.footOn && b.footHeight > 0 && b.footSlopeWidth > 0;
  const mark = !!b && hasBase && b.markOn && !!b.mark && !!field && field.maxHeight > 0;
  return { recess, mark };
}

/** The mark for a mold's plug disk, or null (mark off / not built yet). A
 *  mold's piece has a clay bottom, so the vase's Base does not limit it. */
export function plugMark(v: VaseParameters, scale: number) {
  const f = markField;
  return bottomUse(v.bottom, true, f).mark ? { field: f!, b: v.bottom, scale } : null;
}

type Ring = Float32Array;

function minRadius(ring: Ring, cx: number, cy: number, n: number): number {
  let m = Infinity;
  for (let t = 0; t < n; t++) m = Math.min(m, Math.hypot(ring[t * 3] - cx, ring[t * 3 + 1] - cy));
  return m;
}
function maxRadius(ring: Ring, cx: number, cy: number, n: number): number {
  let m = 0;
  for (let t = 0; t < n; t++) m = Math.max(m, Math.hypot(ring[t * 3] - cx, ring[t * 3 + 1] - cy));
  return m;
}

/**
 * The foot as the molds build it (mold-generator buildFootRings: the same
 * clamp, the same offsets): the foot ring's inner edge at z = 0 and the recess
 * edge at z = h. Null when there is no recess.
 */
export function footRings(base: Ring, cx: number, cy: number, n: number, w1: number, w2: number, h: number): [Ring, Ring] | null {
  if (h <= 0 || w2 <= 0) return null;
  const avail = minRadius(base, cx, cy, n) - 0.5;
  if (avail <= 0.2) return null;
  let fw = w1, sw = w2;
  if (fw + sw > avail) {
    const s = avail / (fw + sw);
    fw *= s;
    sw *= s;
  }
  return [offsetRingRadial(base, cx, cy, -fw, 0, n), offsetRingRadial(base, cx, cy, -(fw + sw), h, n)];
}

function insidePolygon(x: number, y: number, ring: Ring, n: number): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 3], yi = ring[i * 3 + 1], xj = ring[j * 3], yj = ring[j * 3 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Maps world (x, y) on the bottom to the mark's own frame and samples it. */
export function markSampler(field: ReliefField, b: BottomSettings, cx: number, cy: number) {
  const k = Math.max(0.01, b.markSize / 100);
  const a = (b.markAngle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const inv = field.maxHeight > 0 ? 1 / field.maxHeight : 0;
  const { nx, ny, step, x0, y0, heights } = field;
  /** 0..1 of the mark's full height at world (x, y). */
  const at = (x: number, y: number): number => {
    // From below: u to the viewer's right is world −x.
    const u = -(x - cx) - b.markOffsetX, v = (y - cy) - b.markOffsetY;
    const mu = (ca * u + sa * v) / k, mv = (-sa * u + ca * v) / k;
    const fi = (mu - x0) / step, fj = (mv - y0) / step;
    if (fi < 0 || fj < 0 || fi > nx - 1 || fj > ny - 1) return 0;
    const i0 = Math.min(nx - 2, Math.floor(fi)), j0 = Math.min(ny - 2, Math.floor(fj));
    const ai = fi - i0, aj = fj - j0;
    const h00 = heights[j0 * nx + i0], h10 = heights[j0 * nx + i0 + 1];
    const h01 = heights[(j0 + 1) * nx + i0], h11 = heights[(j0 + 1) * nx + i0 + 1];
    return ((h00 * (1 - ai) + h10 * ai) * (1 - aj) + (h01 * (1 - ai) + h11 * ai) * aj) * inv;
  };
  /** World position of mark cell (i, j). */
  const world = (i: number, j: number): [number, number] => {
    const mu = (x0 + i * step) * k, mv = (y0 + j * step) * k;
    const u = ca * mu - sa * mv + b.markOffsetX, v = sa * mu + ca * mv + b.markOffsetY;
    return [cx - u, cy + v];
  };
  /** Farthest the mark's grid reaches from the bottom's centre, mm. */
  const reach = Math.hypot(b.markOffsetX, b.markOffsetY) + (k * Math.hypot(nx * step, ny * step)) / 2;
  return { at, world, reach, cellMm: step * k };
}

export interface BottomPatch {
  positions: Float32Array;
  indices: Uint32Array;
  notes: string[];
}

/**
 * The underside, from the wall's bottom row (`ring0`, z = 0) inward.
 * `footBase` is the outline the foot is offset from (ring0, or the untextured
 * outline with Smooth Inside). `floorZ` = height of the inside floor.
 * Triangles face DOWN (clockwise seen from +z), like the disc they replace.
 */
export function buildBottomPatch(
  ring0: Ring, footBase: Ring, cx: number, cy: number, n: number,
  b: BottomSettings, field: ReliefField | null, floorZ: number,
  use: { recess: boolean; mark: boolean },
): BottomPatch {
  const notes: string[] = [];
  const maxRecess = Math.max(0, floorZ - MIN_FLOOR);

  let h = 0;
  let foot: [Ring, Ring] | null = null;
  if (use.recess) {
    h = Math.min(b.footHeight, maxRecess);
    if (h < b.footHeight - 1e-6) notes.push(`The recess is limited to ${h.toFixed(1)} mm here so ${MIN_FLOOR} mm of base is left — raise Base in Shell for the full ${b.footHeight} mm.`);
    foot = footRings(footBase, cx, cy, n, b.footWidth, b.footSlopeWidth, h);
    if (!foot) { h = 0; notes.push('The bottom is too small for a foot ring and recess.'); }
  }
  const plate: Ring = foot ? foot[1] : ring0; // the floor's outer edge

  const rings: Ring[] = [ring0];
  if (foot) rings.push(foot[0], foot[1]);

  let centreZ = h;
  if (use.mark && field) {
    const S = markSampler(field, b, cx, cy);
    const sgn = b.markStyle === 'impressed' ? 1 : -1;
    let d = Math.max(0, b.markDepth);
    if (sgn > 0 && h + d > maxRecess) {
      const dd = Math.max(0, maxRecess - h);
      notes.push(`The mark is limited to ${dd.toFixed(1)} mm deep so ${MIN_FLOOR} mm of base is left above it — raise Base in Shell for ${d} mm.`);
      d = dd;
    }
    if (sgn < 0) {
      if (!b.footOn) notes.push('Foot is off, so a raised mark stands below the bottom and the piece would sit on it. Turn Foot on, or use Impressed.');
      else if (d > h + 1e-6) notes.push(`The raised mark stands ${(d - h).toFixed(1)} mm below the foot ring — the piece will rock. Lower its Height or deepen the recess.`);
    }

    // Where is it? Check every marked cell on the outline of the mark.
    let offFloor = false;
    const { nx, ny, heights } = field;
    const cut = INK * field.maxHeight;
    for (let j = 0; j < ny && !offFloor; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (heights[k] <= cut) continue;
        const edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1
          || heights[k - 1] <= cut || heights[k + 1] <= cut || heights[k - nx] <= cut || heights[k + nx] <= cut;
        if (!edge) continue;
        const [x, y] = S.world(i, j);
        if (!insidePolygon(x, y, plate, n)) { offFloor = true; break; }
      }
    }
    if (offFloor) notes.push(foot
      ? 'Part of the mark runs onto the foot ring and is left off — make it smaller or move it in.'
      : 'Part of the mark runs off the bottom and is left off — make it smaller or move it in.');

    // Rings under the mark, a cell apart (or 0.25 mm, if finer), then one
    // flat strip out to the floor's edge.
    const rMin = minRadius(plate, cx, cy, n), rMax = maxRadius(plate, cx, cy, n);
    if (rMin > 0.2) {
      const sDense = Math.min(1, S.reach / rMin);
      const ds = Math.min(S.cellMm, 0.25) / rMax;
      const count = Math.min(MAX_MARK_RINGS, Math.max(1, Math.ceil(sDense / ds)));
      const first = sDense < 1 ? 0 : 1; // with the mark reaching the edge, the edge ring itself stays flat
      for (let r = first; r < count; r++) {
        const s = sDense * (1 - r / count);
        const ring = new Float32Array(n * 3);
        for (let t = 0; t < n; t++) {
          const x = cx + s * (plate[t * 3] - cx), y = cy + s * (plate[t * 3 + 1] - cy);
          ring[t * 3] = x; ring[t * 3 + 1] = y; ring[t * 3 + 2] = h + sgn * d * S.at(x, y);
        }
        rings.push(ring);
      }
      centreZ = h + sgn * d * S.at(cx, cy);
    }
  }

  // ── Mesh: rings joined in strips, a fan to the centre ──
  const nv = rings.length * n + 1;
  const positions = new Float32Array(nv * 3);
  rings.forEach((ring, r) => positions.set(ring, r * n * 3));
  const ci = rings.length * n;
  positions[ci * 3] = cx; positions[ci * 3 + 1] = cy; positions[ci * 3 + 2] = centreZ;
  const indices = new Uint32Array(((rings.length - 1) * 2 * n + n) * 3);
  let w = 0;
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let t = 0; t < n; t++) {
      const t1 = (t + 1) % n;
      const oA = r * n + t, oB = r * n + t1, iA = (r + 1) * n + t, iB = (r + 1) * n + t1;
      indices[w++] = oA; indices[w++] = iA; indices[w++] = iB;
      indices[w++] = oA; indices[w++] = iB; indices[w++] = oB;
    }
  }
  const last = (rings.length - 1) * n;
  for (let t = 0; t < n; t++) {
    indices[w++] = ci; indices[w++] = last + (t + 1) % n; indices[w++] = last + t;
  }
  return { positions, indices, notes };
}
