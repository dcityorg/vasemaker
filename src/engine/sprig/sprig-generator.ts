/**
 * SprigMaker mold generator: relief plate + two clip-together walls + the
 * plaster block they make. Design doc: local-docs/sprigmaker-plan.md.
 *
 * Assembly coordinates (HandleMaker's): plate top = z 0, the box centred on the
 * origin, walls standing on the plate from z 0 to wallH. Plaster is poured over
 * the relief to the top of the walls; turned over, its cavity is the mold and
 * its face — cast against the smooth plate — is what the back is scraped on.
 *
 * The walls are HandleMaker's, collar-free (`buildWall(layout, { collars:
 * false })`, already used by Split Halves): ONE design, printed twice, the
 * second copy rotated 180° — a rectangle is 180°-symmetric whatever its sides,
 * so that holds for Long as well as the squares. Plate ridges come from the same
 * layout (`buildPlateRidges`), so plate and walls cannot drift apart.
 */

import { MeshBuilder, ensureOutward, rotate180Z, type P2 } from '../handle/mesh3';
import { buildWall, buildPlateRidges, seamMaxVWidth, type MoldLayout } from '../handle/mold-parts';
import { mergeMeshes } from '../mold/ring-mesh';
import { computeMeshStats, type MeshStats } from '../mesh-stats';
import type { VaseMesh } from '../types';
import { buildRelief, type ReliefField, type SprigSource } from './relief';
import {
  sprigBox, SPRIG_SIZES, STANDARD_BOX, STANDARD_ORDER,
  type SprigBox, type SprigMoldSize, type SprigParameters,
} from './sprig-types';

/** HandleMaker's poured V seal (vWidth / vHeight / vClearance defaults). */
const V_WIDTH = 2;
const V_HEIGHT = 1.4;
const V_CLEARANCE = 0.2;
/** Plaster behind the tallest point below which the mold is fragile, mm. */
export const MIN_PLASTER_BEHIND = 15;

export interface SprigMoldMeshes {
  /** Relief + plate + seal ridges, one printed part. */
  plate: VaseMesh;
  /** Per plate vertex, 1 where the relief is thinner than Min Feature Width. */
  thinFlags: Float32Array;
  /** The wall as printed (assembled position A); print it twice. */
  wall: VaseMesh;
  /** The same wall turned 180° — display only. */
  wallB: VaseMesh;
  plaster: VaseMesh;
  plasterVolumeMm3: number;
  plateStats: MeshStats;
  wallStats: MeshStats;
  relief: ReliefField;
  box: SprigBox;
  layout: MoldLayout & { plateW: number; plateD: number };
  /** Printed (shrink-scaled) sprig extent, mm. */
  masterW: number;
  masterL: number;
  masterH: number;
  /** Plaster between the tallest point and the back of the mold, mm. */
  plasterBehind: number;
  fits: boolean;
  /** Plain-English notes for the sidebar, worst first. */
  warnings: string[];
}

/** Does a sprig of printed size w × l fit a box with `margin` all round? */
export function fitsBox(w: number, l: number, cavW: number, cavL: number, margin: number): boolean {
  return w + 2 * margin <= cavW + 1e-6 && l + 2 * margin <= cavL + 1e-6;
}

/** Smallest standard size the sprig fits, or null. */
export function smallestFit(p: SprigParameters): Exclude<SprigMoldSize, 'custom'> | null {
  const S = 1 + p.shrinkPercent / 100;
  for (const k of STANDARD_ORDER) {
    const s = SPRIG_SIZES[k];
    if (fitsBox(p.width * S, p.length * S, s.cavW, s.cavL, p.plasterMargin)) return k;
  }
  return null;
}

export function sprigLayout(box: SprigBox): MoldLayout & { plateW: number; plateD: number } {
  const cavX0 = -box.cavW / 2, cavX1 = box.cavW / 2;
  const cavY0 = -box.cavL / 2, cavY1 = box.cavL / 2;
  const border = box.wallThickness + box.flangeWidth;
  return {
    cavX0, cavX1, cavY0, cavY1, yc: 0,
    px0: cavX0 - border, px1: cavX1 + border, py0: cavY0 - border, py1: cavY1 + border,
    seat: 0, lipThk: box.plateFloor, plateThk: box.plateFloor,
    wallH: box.wallH, wt: box.wallThickness,
    vw: Math.min(V_WIDTH, seamMaxVWidth(box.flangeWidth, V_CLEARANCE)), vh: V_HEIGHT, vclr: V_CLEARANCE,
    flangeW: box.flangeWidth,
    // No natches, wells or collars in a one-piece open mold; buildWall reads none
    // of these with collars off, but the type wants them.
    domeR: 2, domeH: 1, seg: 48,
    openR: 0, coneYA: 0, coneYB: 0, sealDepth: 0, clr: 0.1,
    plateW: box.cavW + 2 * border, plateD: box.cavL + 2 * border,
  };
}

/**
 * The plate as ONE closed solid whose top face IS the relief: a grid of the
 * height field (cell centres, scaled to print size), a flat frame from the
 * grid's border out to the plate edge, four sides and a bottom. The grid's
 * border ring is height 0, so the relief meets the plate top exactly in its own
 * vertices — no second solid lying on the plate, so nothing coplanar for a
 * slicer to guess about.
 */
function buildReliefPlate(relief: ReliefField, S: number, layout: MoldLayout): { mesh: VaseMesh; thin: Float32Array } {
  const { nx, ny, step, x0, y0, heights, thin } = relief;
  const b = new MeshBuilder();
  const grid = new Int32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const border = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      grid[j * nx + i] = b.vertex((x0 + i * step) * S, (y0 + j * step) * S, border ? 0 : heights[j * nx + i] * S);
    }
  }
  // Top surface, CCW from above. Diagonal follows the flatter pair so a ramp
  // edge is not split across its steep direction.
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = grid[j * nx + i], c = grid[j * nx + i + 1];
      const d = grid[(j + 1) * nx + i + 1], e = grid[(j + 1) * nx + i];
      const ha = heights[j * nx + i], hd = heights[(j + 1) * nx + i + 1];
      const hc = heights[j * nx + i + 1], he = heights[(j + 1) * nx + i];
      if (Math.abs(ha - hd) <= Math.abs(hc - he)) { b.tri(a, c, d); b.tri(a, d, e); }
      else { b.tri(a, c, e); b.tri(c, d, e); }
    }
  }

  // Flat frame between the grid border and the plate edge: four convex
  // trapezoids, each fanned from one plate corner.
  const { px0, px1, py0, py1, plateThk } = layout;
  const P = [b.vertex(px0, py0, 0), b.vertex(px1, py0, 0), b.vertex(px1, py1, 0), b.vertex(px0, py1, 0)];
  const row = (j: number) => Array.from({ length: nx }, (_, i) => grid[j * nx + i]);
  const col = (i: number) => Array.from({ length: ny }, (_, j) => grid[j * nx + i]);
  // Each side as (outer corner A, outer corner B, inner border run from A's end to B's end).
  const sides: [number, number, number[]][] = [
    [P[0], P[1], row(0)],
    [P[1], P[2], col(nx - 1)],
    [P[2], P[3], row(ny - 1).reverse()],
    [P[3], P[0], col(0).reverse()],
  ];
  for (const [A, B, run] of sides) {
    // Polygon A → B → run(last) … run(0), CCW from above.
    b.tri(A, B, run[run.length - 1]);
    for (let k = run.length - 1; k > 0; k--) b.tri(A, run[k], run[k - 1]);
  }

  // Sides and bottom.
  const Q = [b.vertex(px0, py0, -plateThk), b.vertex(px1, py0, -plateThk), b.vertex(px1, py1, -plateThk), b.vertex(px0, py1, -plateThk)];
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    b.quad(Q[k], Q[n], P[n], P[k]);
  }
  b.tri(Q[0], Q[2], Q[1]);
  b.tri(Q[0], Q[3], Q[2]);

  const mesh = ensureOutward(b.build());
  const flags = new Float32Array(mesh.vertexCount);
  for (let k = 0; k < nx * ny; k++) if (thin[k]) flags[grid[k]] = 1;
  return { mesh, thin: flags };
}

export function generateSprigMold(p: SprigParameters, src: SprigSource): SprigMoldMeshes {
  const S = 1 + p.shrinkPercent / 100;
  const box = sprigBox(p);
  const layout = sprigLayout(box);

  // Finished-mm grid step chosen so the PRINTED grid spacing is Resolution.
  const relief = buildRelief(src, p, Math.max(0.05, p.resolution) / S);
  const { mesh: reliefPlate, thin } = buildReliefPlate(relief, S, layout);
  const plate = mergeMeshes([reliefPlate, ...buildPlateRidges(layout)]);
  const thinFlags = new Float32Array(plate.vertexCount);
  thinFlags.set(thin);

  const wall = buildWall(layout, { collars: false });
  const wallB = rotate180Z(wall, 0, 0);

  const plasterB = new MeshBuilder();
  const corners: P2[] = [[layout.cavX0, layout.cavY0], [layout.cavX1, layout.cavY0], [layout.cavX1, layout.cavY1], [layout.cavX0, layout.cavY1]];
  const lo = corners.map(([x, y]) => plasterB.vertex(x, y, 0));
  const hi = corners.map(([x, y]) => plasterB.vertex(x, y, box.wallH));
  for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; plasterB.quad(lo[k], lo[n], hi[n], hi[k]); }
  plasterB.tri(lo[0], lo[2], lo[1]); plasterB.tri(lo[0], lo[3], lo[2]);
  plasterB.tri(hi[0], hi[1], hi[2]); plasterB.tri(hi[0], hi[2], hi[3]);
  const plaster = ensureOutward(plasterB.build());
  const reliefVolMaster = relief.volume * S * S * S;
  const plasterVolumeMm3 = Math.max(0, box.cavW * box.cavL * box.wallH - reliefVolMaster);

  const masterW = p.width * S, masterL = p.length * S, masterH = relief.maxHeight * S;
  const plasterBehind = box.wallH - masterH;
  const fits = fitsBox(masterW, masterL, box.cavW, box.cavL, p.plasterMargin);

  const warnings: string[] = [];
  if (!fits) {
    const best = smallestFit(p);
    const turned = smallestFit({ ...p, width: p.length, length: p.width });
    let w = `The sprig (${masterW.toFixed(0)} × ${masterL.toFixed(0)} mm printed) plus ${p.plasterMargin} mm of plaster round it does not fit this mold.`;
    if (best) w += ` ${SPRIG_SIZES[best].label} fits it.`;
    else if (turned) w += ` Turned 90° it would fit ${SPRIG_SIZES[turned].label}.`;
    else w += ' Make it smaller, or use a Custom size.';
    warnings.push(w);
  }
  if (plasterBehind < MIN_PLASTER_BEHIND) {
    warnings.push(`Only ${plasterBehind.toFixed(1)} mm of plaster behind the tallest point — under ${MIN_PLASTER_BEHIND} mm the mold can crack. Lower Max Height${p.moldSize === 'custom' ? ' or raise Wall Height' : ''}.`);
  }
  if (relief.thinSpots > 0) {
    warnings.push(`${relief.thinSpots} part${relief.thinSpots === 1 ? '' : 's'} narrower than ${p.minFeatureWidth} mm (red) — thinnest ≈ ${relief.thinnestWidth.toFixed(1)} mm. They may tear coming out of the mold or crack drying.`);
  }

  return {
    plate, thinFlags, wall, wallB, plaster, plasterVolumeMm3,
    plateStats: computeMeshStats(plate), wallStats: computeMeshStats(wall),
    relief, box, layout, masterW, masterL, masterH, plasterBehind, fits, warnings,
  };
}

/** True when nothing that shapes a wall depends on the sprig — the standard-size promise. */
export function isStandardBox(box: SprigBox): boolean {
  return box.wallH === STANDARD_BOX.wallH && box.wallThickness === STANDARD_BOX.wallThickness
    && box.flangeWidth === STANDARD_BOX.flangeWidth && box.plateFloor === STANDARD_BOX.plateFloor;
}
