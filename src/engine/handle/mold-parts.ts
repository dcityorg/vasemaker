/**
 * Handle-mold part geometry — the bottom plate (parting template) and the side
 * wall (one design, printed twice, 180°-rotationally symmetric).
 *
 * Assembly coordinates: plate top = z 0, master mid-plane = z −seatDepth,
 * well openings face −x (the "well side" wall). The two cone centers sit at
 * y = 0 and y = H, so the box is centered on y = H/2 — that symmetry is what
 * lets one wall design serve both positions.
 *
 * Each part is a set of closed outward-wound solids merged into one mesh;
 * added features (V-ridge, domes, tabs, collars, flange) overlap their host by
 * 0.2–0.3 mm so slicers union them reliably (never coplanar-touching).
 */

import {
  MeshBuilder,
  ensureOutward,
  extrudeSolid,
  boxSolid,
  triangulateFace,
  circlePoints,
  rectPoints,
  ensureCCW,
  dedupeLoop,
  MAP_YZ_X,
  type P2,
} from './mesh3';
import { mergeMeshes } from '../mold/ring-mesh';
import type { VaseMesh } from '../types';

const EMBED = 0.2;      // feature-into-host overlap for reliable slicer union
const TAB_LIP = 0.3;    // seam-tab overlap into its own wall panel
const TAB_T = 4;        // seam tab thickness (mm)
const FLANGE_T = 3;     // clip flange / tab-web thickness (mm)
const COLLAR_BAND = 4;  // collar material beyond the well opening radius (mm)
export const SEAL_CLR = 0.25;  // collar D-hole clearance around the cone (mm)
/** Fallback circle resolution; the layout's `seg` overrides it where it matters. */
const DOME_RINGS = 8;

/** Box/plate layout computed once by the generator and shared by all parts. */
export interface MoldLayout {
  cavX0: number; cavX1: number; cavY0: number; cavY1: number;
  /** Box y center (= cone midpoint). */
  yc: number;
  px0: number; px1: number; py0: number; py1: number;
  seat: number;
  /** Support-lip thickness below the seat pocket (plate bottom slab). */
  lipThk: number;
  plateThk: number;
  wallH: number;
  wt: number;
  vw: number; vh: number; vclr: number;
  flangeW: number;
  domeR: number; domeH: number;
  /** Cross-section segments over a HALF turn — the Around slider. Curved
   *  features here follow it too, so "Around" means the same thing on the
   *  collar bore and the natches as it does on the strap. Both used to be
   *  hard-coded and ended up an order of magnitude coarser than the handle. */
  seg: number;
  /** Well opening radius + cone y centers (the spine endpoint heights). */
  openR: number; coneYA: number; coneYB: number;
  sealDepth: number;
  /** Well-collar V: a ring on the D-bore at x, dropping into the well
   *  cylinder's matching groove. Null = plain clearance fit. */
  collarV: { x: number; h: number; halfW: number } | null;
}

/** Outer ridge base stays 2 mm in from the plate/flange edge (Gary, 2026-07-26)
 * — the leak dam nearest the outside. */
const RIDGE_EDGE_INSET = 2;

/** Concentric seal dams, matching the pour molds (see engine/mold/v-seam.ts). */
export const SEAL_RING_COUNT = 3;
/** Land left between two adjacent flange grooves, mm — one nozzle pass plus margin. */
const MIN_LAND = 0.6;

/**
 * Seam-band dam positions, measured IN from the plate/flange edge, shared by
 * the plate (ridge loops) and the wall (flange grooves AND vertical seam Vs) so
 * the parts can never drift apart. Even pitch from the edge dam inward.
 *
 * The vertical seam Vs sit at the SAME positions as the ring dams (2026-07-30,
 * the Pour 3-Pc fix carried over): each vertical V stands directly on the plate
 * ridge it continues, so the barrier turns the corner in one piece instead of
 * handing off to a neighbouring position.
 *
 * Until then they were INTERLEAVED between the dams, because a vertical V
 * standing on a ridge line would block the ridge — the seam feet were plain
 * z-prisms with a flat underside, so the ridge had to pass through a tunnel
 * between them. The seam block below carries the ring grooves on its own
 * underside, which removes that constraint entirely.
 */
function seamBandPositions(layout: MoldLayout): number[] {
  const gW = layout.vw / 2 + layout.vclr;
  const first = RIDGE_EDGE_INSET + layout.vw / 2;
  const last = layout.flangeW - gW - 0.3;
  const pitch = (last - first) / (SEAL_RING_COUNT - 1);
  return Array.from({ length: SEAL_RING_COUNT }, (_, i) => first + i * pitch);
}

/**
 * Largest V base width that still leaves `MIN_LAND` between adjacent flange
 * grooves. Beyond it the grooves merge, the flange profile folds back on
 * itself and earcut emits garbage — so the V shrinks rather than the mold
 * breaking. Applied once in the generator so plate and wall see the same value.
 *
 * From the layout above: pitch = (flangeW − vw − vclr − 0.3 − RIDGE_EDGE_INSET)
 * / (N−1) must be ≥ 2·gW + MIN_LAND. Dropping the two interleaved verticals
 * lowered the flange-width floor from ~13 mm to ~10.5 mm at default V size.
 */
export function seamMaxVWidth(flangeW: number, vclr: number): number {
  const room = flangeW - RIDGE_EDGE_INSET - 0.3 - vclr - (SEAL_RING_COUNT - 1) * (2 * vclr + MIN_LAND);
  return Math.max(0.3, room / SEAL_RING_COUNT);
}

// ── Bottom plate ──────────────────────────────────────────────────────────────

/** Segments around a full circle for the natch pair — twice the half-section
 *  count, capped so a very high Around setting can't run away. */
function domeSeg(layout: MoldLayout): number {
  return Math.min(128, Math.max(24, 2 * layout.seg));
}

/** Custom slab: plate rect with the pocket hole through it and the recessed
 * registration dimple carved into the top face. z from zBot to 0. */
function buildTopSlab(layout: MoldLayout, pocketLoop: P2[], dimpleC: P2, zBot: number): VaseMesh {
  const b = new MeshBuilder();
  const outer = ensureCCW(rectPoints(layout.px0, layout.py0, layout.px1, layout.py1));
  const pocket = pocketLoop.slice();
  const DOME_SEG = domeSeg(layout);
  const dimple = circlePoints(dimpleC[0], dimpleC[1], layout.domeR, DOME_SEG);

  // Side walls (outer rect CCW + pocket hole CW, full depth)
  const pocketCW = sgn(pocket) <= 0 ? pocket : pocket.slice().reverse();
  for (const oriented of [outer, pocketCW]) {
    const bot = oriented.map(([x, y]) => b.vertex(x, y, zBot));
    const top = oriented.map(([x, y]) => b.vertex(x, y, 0));
    for (let i = 0; i < oriented.length; i++) {
      const j = (i + 1) % oriented.length;
      b.quad(bot[i], bot[j], top[j], top[i]);
    }
  }

  // Top cap (holes: pocket + dimple circle), bottom cap (hole: pocket)
  const topFace = triangulateFace(outer, [pocket, dimple]);
  const topIdx = topFace.points.map(([x, y]) => b.vertex(x, y, 0));
  for (const [i, j, k] of topFace.tris) b.tri(topIdx[i], topIdx[j], topIdx[k]);

  const botFace = triangulateFace(outer, [pocket]);
  const botIdx = botFace.points.map(([x, y]) => b.vertex(x, y, zBot));
  for (const [i, j, k] of botFace.tris) b.tri(botIdx[i], botIdx[k], botIdx[j]);

  // Dimple: inverted spherical cap descending from the rim circle. Depth is
  // clamped to the seat-slab thickness so it can't pierce into the lip slab.
  const a = layout.domeR;
  const h = Math.min(layout.domeH, layout.seat);
  const R = (a * a + h * h) / (2 * h);
  const phiMax = Math.asin(Math.min(1, a / R));
  const zc = R - h; // sphere center height
  const rings: number[][] = [];
  for (let j = 0; j < DOME_RINGS; j++) {
    const phi = phiMax * (1 - j / DOME_RINGS);
    const r = R * Math.sin(phi);
    const z = zc - R * Math.cos(phi);
    const ring: number[] = [];
    for (let k = 0; k < DOME_SEG; k++) {
      const th = (k / DOME_SEG) * Math.PI * 2;
      ring.push(b.vertex(dimpleC[0] + r * Math.cos(th), dimpleC[1] + r * Math.sin(th), z));
    }
    rings.push(ring);
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < DOME_SEG; k++) {
      const kn = (k + 1) % DOME_SEG;
      b.quad(rings[j][k], rings[j][kn], rings[j + 1][kn], rings[j + 1][k]);
    }
  }
  const bottom = b.vertex(dimpleC[0], dimpleC[1], -h);
  const lastRing = rings[rings.length - 1];
  for (let k = 0; k < DOME_SEG; k++) {
    const kn = (k + 1) % DOME_SEG;
    b.tri(bottom, lastRing[k], lastRing[kn]);
  }

  return b.build();
}

function sgn(loop: P2[]): number {
  let s = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % loop.length];
    s += x1 * y2 - x2 * y1;
  }
  return s;
}

/** Proud registration dome: base disc (embedded), short cylinder, spherical cap. */
function buildDome(cx: number, cy: number, a: number, h: number, DOME_SEG: number): VaseMesh {
  const b = new MeshBuilder();
  const R = (a * a + h * h) / (2 * h);
  const phiMax = Math.asin(Math.min(1, a / R));
  const zc = h - R; // sphere center (below the top)
  const rings: number[][] = [];
  const pushRing = (r: number, z: number) => {
    const ring: number[] = [];
    for (let k = 0; k < DOME_SEG; k++) {
      const th = (k / DOME_SEG) * Math.PI * 2;
      ring.push(b.vertex(cx + r * Math.cos(th), cy + r * Math.sin(th), z));
    }
    rings.push(ring);
  };
  pushRing(a, -EMBED);
  pushRing(a, 0);
  for (let j = 1; j < DOME_RINGS; j++) {
    const phi = phiMax * (1 - j / DOME_RINGS);
    pushRing(R * Math.sin(phi), zc + R * Math.cos(phi));
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < DOME_SEG; k++) {
      const kn = (k + 1) % DOME_SEG;
      b.quad(rings[j][k], rings[j][kn], rings[j + 1][kn], rings[j + 1][k]);
    }
  }
  const top = b.vertex(cx, cy, h);
  const last = rings[rings.length - 1];
  const base = b.vertex(cx, cy, -EMBED);
  for (let k = 0; k < DOME_SEG; k++) {
    const kn = (k + 1) % DOME_SEG;
    b.tri(top, last[k], last[kn]);
    b.tri(base, rings[0][kn], rings[0][k]);
  }
  return ensureOutward(b.build());
}

/**
 * Closed-POLYGON sweep (mitered) of a closed (u, z) cross-section; u+ = outward
 * from the loop. Torus topology, so one component and no caps. Used for the
 * seat-lip V ridge, which has to follow the handle silhouette rather than a
 * rectangle. The miter scale is clamped so a sharp corner in the silhouette
 * produces a blunt bevel instead of a spike.
 */
function sweepClosedLoop(loop: P2[], cs: P2[], closed = true, maxMiter = 2.5): VaseMesh {
  const L = closed ? ensureCCW(dedupeLoop(loop)) : dedupeLoop(loop);
  const n = L.length;
  const b = new MeshBuilder();
  // Outward normal of edge i for a CCW loop is (dy, −dx).
  const nrm: P2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x1, y1] = L[i];
    const [x2, y2] = L[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    nrm.push([dy / len, -dx / len]);
  }
  if (closed) {
    const [x1, y1] = L[n - 1];
    const [x2, y2] = L[0];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    nrm.push([dy / len, -dx / len]);
  } else {
    nrm.push(nrm[n - 2]); // open path: last vertex reuses its only edge
  }
  const rings: number[][] = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = nrm[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const [bx, by] = nrm[i];
    let mx = ax + bx, my = ay + by;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-9) { mx = bx; my = by; } else { mx /= ml; my /= ml; }
    const scale = Math.min(maxMiter, 1 / Math.max(0.35, mx * bx + my * by));
    const ring: number[] = [];
    for (const [u, z] of cs) ring.push(b.vertex(L[i][0] + mx * scale * u, L[i][1] + my * scale * u, z));
    rings.push(ring);
  }
  const M = cs.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const iN = (i + 1) % n;
    for (let k = 0; k < M; k++) {
      const kn = (k + 1) % M;
      b.quad(rings[i][k], rings[i][kn], rings[iN][kn], rings[iN][k]);
    }
  }
  if (!closed) {
    const face = triangulateFace(cs, []);
    const first = rings[0], last = rings[n - 1];
    for (const [i, j, k] of face.tris) {
      b.tri(first[i], first[k], first[j]);
      b.tri(last[i], last[j], last[k]);
    }
  }
  return ensureOutward(b.build());
}

/** Closed-rect sweep (mitered corners) of a closed (u,z) cross-section — used
 * for the plate's V-ridge loop. u+ = outward from the rect. */
function sweepRectLoop(x0: number, y0: number, x1: number, y1: number, cs: P2[]): VaseMesh {
  const b = new MeshBuilder();
  // Corner stations, CCW; outward miter dir is the corner diagonal, scale √2
  const corners: { px: number; py: number; mx: number; my: number }[] = [
    { px: x0, py: y0, mx: -Math.SQRT1_2, my: -Math.SQRT1_2 },
    { px: x1, py: y0, mx: Math.SQRT1_2, my: -Math.SQRT1_2 },
    { px: x1, py: y1, mx: Math.SQRT1_2, my: Math.SQRT1_2 },
    { px: x0, py: y1, mx: -Math.SQRT1_2, my: Math.SQRT1_2 },
  ];
  const scale = Math.SQRT2;
  const stations = corners.map((c) =>
    cs.map(([u, z]) => b.vertex(c.px + c.mx * u * scale, c.py + c.my * u * scale, z))
  );
  const n = corners.length;
  for (let k = 0; k < n; k++) {
    const kn = (k + 1) % n;
    for (let j = 0; j < cs.length; j++) {
      const jn = (j + 1) % cs.length;
      b.quad(stations[k][j], stations[k][jn], stations[kn][jn], stations[kn][j]);
    }
  }
  return ensureOutward(b.build());
}

/**
 * Bottom plate: lip slab (through-cut tape-access hole) + top slab (seat
 * pocket + dimple) + TWO V-ridge loops near the flange edge + proud dome.
 * The master's flat skirt bottom rests on the lip ring at z = −seat; inside
 * the lip the plate is open so the master can be taped from below against
 * plaster buoyancy. Registration pair: dome near cavY1, dimple near cavY0.
 */
export function buildPlate(
  layout: MoldLayout,
  pocketLoop: P2[],
  tapeHole: P2[],
  margin: number,
  /** Centre lines of the seat-lip V ridges (one per side of the strap), and
   *  their height. Null = no lip V (solid master: no plug to groove). */
  seatV: { loops: P2[][]; height: number; half: number } | null,
): VaseMesh {
  const { px0, py0, px1, py1, seat, lipThk } = layout;
  // Registration pair sits 3/4 of the way from the well side toward the far
  // side, NOT on the cavity centerline: the walls split at the mid-x point, so
  // a centered dome lands right on the wall seam and fouls the tape that goes
  // over it. Three-quarters clears the seam while staying well inside the plate.
  const xd = layout.cavX0 + 0.75 * (layout.cavX1 - layout.cavX0);
  const domeC: P2 = [xd, layout.cavY1 - margin / 2];
  const dimpleC: P2 = [xd, layout.cavY0 + margin / 2];

  // Lip slab: full plate footprint with the tape-access hole cut through.
  const base = extrudeSolid(rectPoints(px0, py0, px1, py1), [tapeHole], -seat - lipThk, -seat);
  // Seat slab: pocket hole through it, overlapping the lip slab by EMBED.
  const top = buildTopSlab(layout, pocketLoop, dimpleC, -seat - EMBED);

  // V-ridge loops near the plate/flange edge (matching grooves live in the
  // wall's clip-flange underside, and the wall's vertical seam Vs stand on
  // these same lines).
  const ridgeCs: P2[] = [
    [-layout.vw / 2, -EMBED],
    [layout.vw / 2, -EMBED],
    [0, layout.vh],
  ];
  const ridges = seamBandPositions(layout).map((d) =>
    sweepRectLoop(px0 + d, py0 + d, px1 - d, py1 - d, ridgeCs));

  // Seat-lip V ridge: the barrier between the plaster and the master's
  // underside. Before 2026-07-31 this joint was a plain flat land, which is
  // exactly the geometry that leaked — the master's skirt bottom now carries
  // the matching groove, cut into its channel plug.
  // Open path, not a loop: the master's groove lives in its body plug, which
  // stops at the wall plane (x = 0) — the wells past it have no groove, and a
  // ridge running under them would jack the master up off the lip.
  const lipRidge = (seatV?.loops ?? [])
    .filter((l) => l.length > 2)
    .map((l) => sweepClosedLoop(l, [
      [-seatV!.half, -seat - EMBED],
      [seatV!.half, -seat - EMBED],
      [0, -seat + seatV!.height],
    ], false, 1.1));
  // Miter clamped hard (1.1, not the default 2.5): this ridge has to stay
  // inside a groove only `vWidth/2 + clearance` wide, and a mitered corner
  // widens the swept section — at the turn onto the wells that alone put the
  // ridge's flank 0.2 mm proud of the groove floor and lifted the master. The
  // crest is at u = 0 so it is unaffected; only the base corner under-fills.

  const dome = buildDome(domeC[0], domeC[1], layout.domeR, layout.domeH, domeSeg(layout));

  return mergeMeshes([base, top, ...ridges, ...lipRidge, dome]);
}

// ── Side wall ─────────────────────────────────────────────────────────────────

interface SweepStation {
  px: number;
  py: number;
  mx: number;
  my: number;
  scale: number;
}

/** Open-path sweep with mitered corners + triangulated end caps. */
function sweepOpenPath(path: P2[], outward: P2[], cs: P2[]): VaseMesh {
  const b = new MeshBuilder();
  const n = path.length;
  const stations: SweepStation[] = [];
  for (let k = 0; k < n; k++) {
    let mx: number, my: number, scale: number;
    if (k === 0) {
      [mx, my] = outward[0];
      scale = 1;
    } else if (k === n - 1) {
      [mx, my] = outward[n - 2];
      scale = 1;
    } else {
      const [ax, ay] = outward[k - 1];
      const [bx2, by2] = outward[k];
      let sx = ax + bx2, sy = ay + by2;
      const len = Math.hypot(sx, sy) || 1;
      sx /= len;
      sy /= len;
      mx = sx;
      my = sy;
      scale = 1 / Math.max(0.2, sx * bx2 + sy * by2);
    }
    stations.push({ px: path[k][0], py: path[k][1], mx, my, scale });
  }

  const loop = ensureCCW(cs);
  const verts = stations.map((s) =>
    loop.map(([u, z]) => b.vertex(s.px + s.mx * u * s.scale, s.py + s.my * u * s.scale, z))
  );
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < loop.length; j++) {
      const jn = (j + 1) % loop.length;
      b.quad(verts[k][j], verts[k][jn], verts[k + 1][jn], verts[k + 1][j]);
    }
  }

  // End caps
  const face = triangulateFace(loop, []);
  const cap = (s: SweepStation, flip: boolean) => {
    const idx = face.points.map(([u, z]) => b.vertex(s.px + s.mx * u * s.scale, s.py + s.my * u * s.scale, z));
    for (const [i, j, k] of face.tris) {
      if (flip) b.tri(idx[i], idx[k], idx[j]);
      else b.tri(idx[i], idx[j], idx[k]);
    }
  };
  cap(stations[0], true);
  cap(stations[n - 1], false);

  return ensureOutward(b.build());
}

/** Collar around a well opening: 1 mm-proud face frame with a half-circle bite
 * that the cone's last millimeter nests into (labyrinth seal, zero cutting).
 * The half-master's opening is a half-disc sitting ON the parting plane, so
 * the bite is a half-circle arc centered at z = 0.
 * Extruded along x from xFace−EMBED (into the panel) to xFace+sealDepth·dir. */
/**
 * The collar boss's x span for a wall face. Exported so the generator can place
 * the bore V strictly inside it without duplicating EMBED.
 */
export function collarXSpan(xFace: number, sealDepth: number): [number, number] {
  return [xFace - EMBED, xFace + sealDepth];
}

function buildCollar(layout: MoldLayout, coneY: number, xFace: number, dir: 1 | -1): VaseMesh {
  const Rc = layout.openR + SEAL_CLR;
  // Full wall height, not `Rc + COLLAR_BAND` (Gary, 2026-07-31). A boss that
  // stops part-way up leaves a horizontal top ledge, and that ledge is a
  // mid-air overhang when the wall is printed UPSIDE DOWN — which is the
  // orientation that makes the bore self-supporting. Running the boss to the
  // rim removes the ledge in both orientations; it costs ~0.6 cm³ per collar
  // and just deepens the vertical channel the collar already imprints in the
  // plaster face above the pour opening.
  const zTop = layout.wallH;
  const yL = coneY - (Rc + COLLAR_BAND);
  const yR = coneY + (Rc + COLLAR_BAND);
  const steps = layout.seg;
  /** Collar cross-section in (y, z) for a given bore radius. CCW. */
  const polyAt = (r: number): P2[] => {
    const poly: P2[] = [[yL, 0]];
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI - (Math.PI * i) / steps;
      poly.push([coneY + r * Math.cos(a), r * Math.sin(a)]);
    }
    poly.push([yR, 0], [yR, zTop], [yL, zTop]);
    return poly;
  };
  const x0 = dir === 1 ? xFace - EMBED : xFace - layout.sealDepth;
  const x1 = dir === 1 ? xFace + layout.sealDepth : xFace + EMBED;

  const v = layout.collarV;
  if (!v || v.x - v.halfW <= x0 || v.x + v.halfW >= x1) {
    return extrudeSolid(polyAt(Rc), [], x0, x1, MAP_YZ_X);
  }

  // V ring in the D-bore: the bore necks in by `h` at x = v.x. The wall drops
  // straight down onto a horizontal cylinder, so the ring simply seats into the
  // cylinder's matching groove — no sliding fit, nothing to scrape past.
  const xs = [x0, v.x - v.halfW, v.x, v.x + v.halfW, x1];
  const rAt = (x: number) => Rc - v.h * Math.max(0, 1 - Math.abs(x - v.x) / v.halfW);
  const b = new MeshBuilder();
  const rings = xs.map((x) => polyAt(rAt(x)).map(([y, z]) => b.vertex(x, y, z)));
  const M = rings[0].length;
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < M; k++) {
      const kn = (k + 1) % M;
      b.quad(rings[i][k], rings[i][kn], rings[i + 1][kn], rings[i + 1][k]);
    }
  }
  // Caps: both ends are at the nominal radius, so one triangulation serves.
  const face = triangulateFace(polyAt(Rc), []);
  const first = rings[0], last = rings[rings.length - 1];
  for (const [i, j, k] of face.tris) {
    b.tri(first[i], first[k], first[j]);
    b.tri(last[i], last[j], last[k]);
  }
  return ensureOutward(b.build());
}

/**
 * Side wall — ONE design, printed twice. Covers the lower half of the well
 * side + the full y0 side + the lower half of the far side. The second copy is
 * the same part rotated 180° about the box center. Seam tabs: V-ridge tab at
 * the well-side end, V-groove tab at the far-side end, so each copy's ridge
 * mates with the other's groove. Collars are built at BOTH y≈0 segments (well
 * + far): the far one is vestigial on this copy but becomes the second cone's
 * collar after rotation.
 */
export function buildWall(layout: MoldLayout): VaseMesh {
  const { cavX0, cavX1, cavY0, cavY1, yc, wt, wallH, vclr, vw, vh, flangeW } = layout;
  const gW = vw / 2 + vclr;
  /** Vertical seam groove depth (mates the other copy's vertical ridge). */
  const gH = vh + vclr;
  /** Flange-underside groove height, kept inside the flange thickness. */
  const gHf = Math.min(vh + vclr, FLANGE_T - 0.6);

  // Seams sit mid-way along the two NON-well sides (x = box center), so the
  // well-side wall pulls straight out away from the well cylinders without
  // catching anything. Each wall = one full x-side + two half y-sides; the
  // second copy is the same print rotated 180° about the box center.
  const xc = (cavX0 + cavX1) / 2;
  const cx0 = cavX0 - wt / 2;
  const cy0 = cavY0 - wt / 2;
  const cy1 = cavY1 + wt / 2;

  // Main body: plain panel (the V grooves live in the clip flange).
  const bodyCs: P2[] = [
    [-wt / 2, wallH],
    [-wt / 2, 0],
    [wt / 2, 0],
    [wt / 2, wallH],
  ];
  const path: P2[] = [
    [xc, cy0],
    [cx0, cy0],
    [cx0, cy1],
    [xc, cy1],
  ];
  const outward: P2[] = [
    [0, -1],
    [-1, 0],
    [0, 1],
  ];
  const body = sweepOpenPath(path, outward, bodyCs);

  // Clip flange (bottom, outward); its underside carries the TWO V-grooves
  // that mate with the plate's edge ridges. The flange outer edge is flush
  // with the plate edge. It stops TAB_T short of each seam: a swept profile
  // cannot carry the vertical seam Vs on its end face, so the seam feet below
  // own that region instead (they continue the grooves as square channels).
  const uEdge = wt / 2 + flangeW;
  const band = seamBandPositions(layout);
  // Underside walked INWARD from the panel to the edge, dropping a groove at
  // each dam. Innermost dam first, since `band` is measured in from the edge.
  const flangeCs: P2[] = [[wt / 2 - TAB_LIP, 0]];
  for (let i = band.length - 1; i >= 0; i--) {
    const u = uEdge - band[i];
    flangeCs.push([u - gW, 0], [u, gHf], [u + gW, 0]);
  }
  flangeCs.push([uEdge, 0], [uEdge, FLANGE_T], [wt / 2 - TAB_LIP, FLANGE_T]);
  const xF = xc - TAB_T; // flange ends here; feet own [xF, xc]
  const flangePath: P2[] = [
    [xF, cy0],
    [cx0, cy0],
    [cx0, cy1],
    [xF, cy1],
  ];
  const flange = sweepOpenPath(flangePath, outward, flangeCs);

  const xIn = xF - EMBED;

  /**
   * Seam block: the last `TAB_T` mm before the seam plane as ONE solid, running
   * from the plate face to the wall top. Section = the (z, x) rectangle from the
   * inner face out to the seam face, swept along y columns. Its UNDERSIDE
   * carries the flange's ring grooves and its SEAM FACE the vertical Vs, both
   * from the SAME `band` positions — so each vertical V stands on the plate
   * ridge it continues.
   *
   * This replaces the old finger/bridge/tab stack (2026-07-30). Those existed
   * only because a plain z-prism has a flat underside: with no groove to receive
   * the plate ridge, the fingers had to tile BETWEEN the ridge lines and a
   * bridge slab had to roof the crossings into tunnels. Giving the block a
   * grooved underside removes the whole problem — and lets the Vs line up.
   *
   * `dams` are absolute y positions; `ridge` picks bumps (crossing the seam) or
   * notches (receding from it), which the 180° rotation maps onto each other.
   */
  const seamBlock = (yA: number, yB: number, dams: number[], ridge: boolean): VaseMesh => {
    /** Seam-face offset from x = xc at y: out past it (ridge) or back in (groove). */
    const face = (y: number): number => {
      for (const d of dams) {
        const t = Math.abs(y - d);
        if (ridge) { if (t < vw / 2) return vh * (1 - t / (vw / 2)); }
        else if (t < gW) return -gH * (1 - t / gW);
      }
      return 0;
    };
    /** Underside height at y — the flange groove that receives the plate ridge. */
    const floor = (y: number): number => {
      for (const d of dams) {
        const t = Math.abs(y - d);
        if (t < gW) return gHf * (1 - t / gW);
      }
      return 0;
    };
    // A column at every slope break of both profiles, so the swept surfaces are
    // exact rather than sampled.
    const cols = [yA, yB];
    for (const d of dams) cols.push(d - gW, d - vw / 2, d, d + vw / 2, d + gW);
    const ys = cols
      .map((y) => Math.min(Math.max(y, yA), yB))
      .sort((a, b) => a - b)
      .filter((y, i, arr) => i === 0 || y - arr[i - 1] > 1e-4);

    const mb = new MeshBuilder();
    // Section given CCW in (z, x) and swept along +y: (z, x, y) is right-handed,
    // so extrudeSolid's winding convention applies (high-y cap forward).
    const rings = ys.map((y) => {
      const xS = xc + face(y);
      const z0 = floor(y);
      return ([[z0, xIn], [wallH, xIn], [wallH, xS], [z0, xS]] as P2[])
        .map(([z, x]) => mb.vertex(x, y, z));
    });
    for (let j = 0; j + 1 < rings.length; j++) {
      for (let i = 0; i < 4; i++) {
        const iN = (i + 1) % 4;
        mb.quad(rings[j][i], rings[j][iN], rings[j + 1][iN], rings[j + 1][i]);
      }
    }
    const last = rings.length - 1;
    for (let i = 1; i + 1 < 4; i++) {
      mb.tri(rings[last][0], rings[last][i], rings[last][i + 1]);
      mb.tri(rings[0][0], rings[0][i + 1], rings[0][i]);
    }
    return ensureOutward(mb.build());
  };

  // y0-side seam carries the RIDGES, y1-side the GROOVES, so the 180° rotation
  // maps one onto the other and a single print serves both walls.
  const b0 = layout.py0;
  const b1 = cavY0 - wt + TAB_LIP;
  const t0 = cavY1 + wt - TAB_LIP;
  const t1 = layout.py1;
  const blockA = seamBlock(b0, b1, band.map((d) => b0 + d), true);
  const blockB = seamBlock(t0, t1, band.map((d) => t1 - d), false);

  // Collars for BOTH wells on this design's full (well) side. The rotated
  // copy's collars land on the far wall as harmless shallow dents.
  const collarA = buildCollar(layout, layout.coneYA, cavX0, 1);
  const collarB = buildCollar(layout, layout.coneYB, cavX0, 1);

  return mergeMeshes([body, flange, blockA, blockB, collarA, collarB]);
}
