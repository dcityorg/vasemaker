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
const SEAL_CLR = 0.25;  // collar D-hole clearance around the cone (mm)
const DOME_SEG = 32;
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
  /** Well opening radius + cone y centers (the spine endpoint heights). */
  openR: number; coneYA: number; coneYB: number;
  sealDepth: number;
}

/** V-ridge placement (Gary, 2026-07-26): outer ridge base 2 mm in from the
 * plate/flange edge, second ridge 2.5 mm inside the first — both under the
 * wall's clip flange, doubling the leak dam near the outside edge. */
const RIDGE_EDGE_INSET = 2;
const RIDGE_GAP = 2.5;

// ── Bottom plate ──────────────────────────────────────────────────────────────

/** Custom slab: plate rect with the pocket hole through it and the recessed
 * registration dimple carved into the top face. z from zBot to 0. */
function buildTopSlab(layout: MoldLayout, pocketLoop: P2[], dimpleC: P2, zBot: number): VaseMesh {
  const b = new MeshBuilder();
  const outer = ensureCCW(rectPoints(layout.px0, layout.py0, layout.px1, layout.py1));
  const pocket = pocketLoop.slice();
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
function buildDome(cx: number, cy: number, a: number, h: number): VaseMesh {
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
export function buildPlate(layout: MoldLayout, pocketLoop: P2[], tapeHole: P2[], margin: number): VaseMesh {
  const { px0, py0, px1, py1, seat, lipThk } = layout;
  const xd = (layout.cavX0 + layout.cavX1) / 2;
  const domeC: P2 = [xd, layout.cavY1 - margin / 2];
  const dimpleC: P2 = [xd, layout.cavY0 + margin / 2];

  // Lip slab: full plate footprint with the tape-access hole cut through.
  const base = extrudeSolid(rectPoints(px0, py0, px1, py1), [tapeHole], -seat - lipThk, -seat);
  // Seat slab: pocket hole through it, overlapping the lip slab by EMBED.
  const top = buildTopSlab(layout, pocketLoop, dimpleC, -seat - EMBED);

  // Two V-ridge loops near the plate/flange edge (matching grooves live in the
  // wall's clip-flange underside).
  const ridgeCs: P2[] = [
    [-layout.vw / 2, -EMBED],
    [layout.vw / 2, -EMBED],
    [0, layout.vh],
  ];
  const d1 = RIDGE_EDGE_INSET + layout.vw / 2;
  const d2 = d1 + layout.vw + RIDGE_GAP;
  const ridge1 = sweepRectLoop(px0 + d1, py0 + d1, px1 - d1, py1 - d1, ridgeCs);
  const ridge2 = sweepRectLoop(px0 + d2, py0 + d2, px1 - d2, py1 - d2, ridgeCs);

  const dome = buildDome(domeC[0], domeC[1], layout.domeR, layout.domeH);

  return mergeMeshes([base, top, ridge1, ridge2, dome]);
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
function buildCollar(layout: MoldLayout, coneY: number, xFace: number, dir: 1 | -1): VaseMesh {
  const Rc = layout.openR + SEAL_CLR;
  const zTop = Math.min(Rc + COLLAR_BAND, layout.wallH);
  const yL = coneY - (Rc + COLLAR_BAND);
  const yR = coneY + (Rc + COLLAR_BAND);
  const poly: P2[] = [];
  poly.push([yL, 0]);
  poly.push([coneY - Rc, 0]);
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - (Math.PI * i) / steps;
    poly.push([coneY + Rc * Math.cos(a), Rc * Math.sin(a)]);
  }
  poly.push([coneY + Rc, 0]);
  poly.push([yR, 0]);
  poly.push([yR, zTop]);
  poly.push([yL, zTop]);
  const x0 = dir === 1 ? xFace - EMBED : xFace - layout.sealDepth;
  const x1 = dir === 1 ? xFace + layout.sealDepth : xFace + EMBED;
  return extrudeSolid(poly, [], x0, x1, MAP_YZ_X);
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
  /** Vertical seam-tab groove depth (mates the other copy's vertical ridge). */
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

  // Clip flange (bottom, outward) runs the FULL path to both seams; its
  // underside carries the TWO V-grooves that mate with the plate's edge
  // ridges. The flange outer edge is flush with the plate edge.
  const uEdge = wt / 2 + flangeW;
  const u1 = uEdge - (RIDGE_EDGE_INSET + vw / 2);
  const u2 = u1 - (vw + RIDGE_GAP);
  const flangeCs: P2[] = [
    [wt / 2 - TAB_LIP, 0],
    [u2 - gW, 0],
    [u2, gHf],
    [u2 + gW, 0],
    [u1 - gW, 0],
    [u1, gHf],
    [u1 + gW, 0],
    [uEdge, 0],
    [uEdge, FLANGE_T],
    [wt / 2 - TAB_LIP, FLANGE_T],
  ];
  const flange = sweepOpenPath(path, outward, flangeCs);

  // Seam tabs: vertical plates sitting ON TOP of the flange (z from just
  // inside it up to the wall top), welded into the flange below and into the
  // panel via a small lip. Each tab occupies the x < xc side of its seam so
  // the rotated copy's tab lands face-to-face on the other side. The mating
  // faces carry TWO vertical V pairs: ridges on the y0-side tab, grooves on
  // the y1-side tab, placed symmetrically about the flange-band center so the
  // rotation maps ridge onto groove.
  const tabZ0 = FLANGE_T - EMBED;
  const V_SPACING = 3; // half-distance between the two vertical Vs

  // y0-side seam (ridges). Flange band: [py0, cavY0 - wt].
  const b0 = layout.py0;
  const b1 = cavY0 - wt;
  const ym = (b0 + b1) / 2;
  const ridgeTab: P2[] = [
    [xc - TAB_T, b0],
    [xc, b0],
    [xc, ym - V_SPACING - vw / 2],
    [xc + vh, ym - V_SPACING],
    [xc, ym - V_SPACING + vw / 2],
    [xc, ym + V_SPACING - vw / 2],
    [xc + vh, ym + V_SPACING],
    [xc, ym + V_SPACING + vw / 2],
    [xc, b1 + TAB_LIP],
    [xc - TAB_T, b1 + TAB_LIP],
  ];
  // y1-side seam (grooves). Flange band: [cavY1 + wt, py1].
  const t0 = cavY1 + wt;
  const t1 = layout.py1;
  const ym2 = (t0 + t1) / 2;
  const grooveTab: P2[] = [
    [xc - TAB_T, t0 - TAB_LIP],
    [xc, t0 - TAB_LIP],
    [xc, ym2 - V_SPACING - gW],
    [xc - gH, ym2 - V_SPACING],
    [xc, ym2 - V_SPACING + gW],
    [xc, ym2 + V_SPACING - gW],
    [xc - gH, ym2 + V_SPACING],
    [xc, ym2 + V_SPACING + gW],
    [xc, t1],
    [xc - TAB_T, t1],
  ];
  const tabA = extrudeSolid(ridgeTab, [], tabZ0, wallH);
  const tabB = extrudeSolid(grooveTab, [], tabZ0, wallH);

  // Collars for BOTH wells on this design's full (well) side. The rotated
  // copy's collars land on the far wall as harmless shallow dents.
  const collarA = buildCollar(layout, layout.coneYA, cavX0, 1);
  const collarB = buildCollar(layout, layout.coneYB, cavX0, 1);

  return mergeMeshes([body, flange, tabA, tabB, collarA, collarB]);
}
