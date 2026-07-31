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

/** Outer ridge base stays 2 mm in from the plate/flange edge (Gary, 2026-07-26)
 * — the leak dam nearest the outside. */
const RIDGE_EDGE_INSET = 2;

/**
 * Seam-band feature positions, measured IN from the plate/flange edge, shared
 * by the plate (ridge loops) and the wall (flange grooves + seam Vs) so the
 * two parts can never drift apart. The arrangement is the pour-3-pc one
 * rotated onto this mold: ring dam, vertical V, ring dam, vertical V at even
 * pitch from the edge dam to the wall panel. Interleaving matters because the
 * seam Vs now run FULL HEIGHT to the plate (2026-07-29): a vertical V standing
 * on a ridge line would block the ridge instead of sealing beside it.
 * flangeW ≥ ~13 keeps ≥ 0.5 mm of printable wall between neighbouring voids —
 * the default is 14; old saves at 12 print with merged voids at the seams.
 */
function seamBandPositions(layout: MoldLayout): { dR1: number; dV1: number; dR2: number; dV2: number } {
  const gW = layout.vw / 2 + layout.vclr;
  const dR1 = RIDGE_EDGE_INSET + layout.vw / 2;
  const dInner = layout.flangeW - gW - 0.3;
  const pitch = (dInner - dR1) / 3;
  return { dR1, dV1: dR1 + pitch, dR2: dR1 + 2 * pitch, dV2: dInner };
}

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

  // Two V-ridge loops near the plate/flange edge (matching grooves live in the
  // wall's clip-flange underside).
  const ridgeCs: P2[] = [
    [-layout.vw / 2, -EMBED],
    [layout.vw / 2, -EMBED],
    [0, layout.vh],
  ];
  const { dR1: d1, dR2: d2 } = seamBandPositions(layout);
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
  const u1 = uEdge - band.dR1;
  const u2 = uEdge - band.dR2;
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
  const xF = xc - TAB_T; // flange ends here; feet own [xF, xc]
  const flangePath: P2[] = [
    [xF, cy0],
    [cx0, cy0],
    [cx0, cy1],
    [xF, cy1],
  ];
  const flange = sweepOpenPath(flangePath, outward, flangeCs);

  /**
   * Seam-face outline: a plate spanning [yA, yB] with its mating edge at the
   * seam plane x = xc, carrying vertical V bumps (ridge side) or notches
   * (groove side) at the given centers (ascending). Every seam solid — foot
   * fingers, channel bridge, tab — is this shape extruded over its z band.
   */
  const seamFace = (xInner: number, yA: number, yB: number, vs: number[], ridge: boolean): P2[] => {
    const pts: P2[] = [[xInner, yA], [xc, yA]];
    for (const v of vs) {
      if (ridge) pts.push([xc, v - vw / 2], [xc + vh, v], [xc, v + vw / 2]);
      else pts.push([xc, v - gW], [xc - gH, v], [xc, v + gW]);
    }
    pts.push([xc, yB], [xInner, yB]);
    return pts;
  };

  /**
   * Seam feet, in TWO layers so the ridge crossings are snug tunnels rather
   * than open windows (Gary, 2026-07-29 — a full-height channel let plaster
   * over the ridge with no resistance):
   *  - finger slabs, z ∈ [0, tunH+EMBED]: tile the band BETWEEN the plate-ridge
   *    lines, so each vertical V runs from the PLATE TOP up. The gaps between
   *    fingers are the square channel walls.
   *  - bridge slab, z ∈ [tunH, FLANGE_T]: full band width, spanning the
   *    channels — its underside is the tunnel roof, vClearance above the
   *    ridge crest, making the crossing as tight as the V-groove seat.
   * Both are plain extrusions, so the Vs are just outline shape; the tab above
   * continues them to the wall top.
   */
  const tunH = vh + vclr;
  const xIn = xF - EMBED;
  const finger = (yA: number, yB: number, v: number | null, ridge: boolean): VaseMesh =>
    extrudeSolid(seamFace(xIn, yA, yB, v !== null ? [v] : [], ridge), [], 0, tunH + EMBED);

  // Seam tabs: vertical plates from just inside the flange top up to the wall
  // top, welded into the bridge/feet below and into the panel via a small lip.
  // Each tab occupies the x < xc side of its seam so the rotated copy's tab
  // lands face-to-face on the other side. The mating faces carry TWO vertical
  // V pairs — ridges on the y0-side tab, grooves on the y1-side tab — at the
  // shared band positions, which the 180° rotation maps onto each other
  // (ridge y = py0 + dV mirrors to groove y = py1 - dV).
  const tabZ0 = FLANGE_T - EMBED;

  // y0-side seam (ridges). Flange band: [py0, cavY0 - wt], edge at py0.
  const b0 = layout.py0;
  const b1 = cavY0 - wt;
  const r1 = b0 + band.dR1;
  const r2 = b0 + band.dR2;
  const v1 = b0 + band.dV1;
  const v2 = b0 + band.dV2;
  // y1-side seam (grooves). Flange band: [cavY1 + wt, py1], edge at py1.
  const t0 = cavY1 + wt;
  const t1 = layout.py1;
  const q1 = t1 - band.dR1;
  const q2 = t1 - band.dR2;
  const w1 = t1 - band.dV1;
  const w2 = t1 - band.dV2;
  const tabA = extrudeSolid(seamFace(xc - TAB_T, b0, b1 + TAB_LIP, [v1, v2], true), [], tabZ0, wallH);
  const tabB = extrudeSolid(seamFace(xc - TAB_T, t0 - TAB_LIP, t1, [w2, w1], false), [], tabZ0, wallH);

  const feet = [
    // y0 seam: edge strip, between-ridges strip (V1), panel-side strip (V2)
    finger(b0, r1 - gW, null, true),
    finger(r1 + gW, r2 - gW, v1, true),
    finger(r2 + gW, b1 + TAB_LIP, v2, true),
    extrudeSolid(seamFace(xIn, b0, b1 + TAB_LIP, [v1, v2], true), [], tunH, FLANGE_T),
    // y1 seam, mirrored: panel-side strip (V2'), between-ridges strip (V1'), edge strip
    finger(t0 - TAB_LIP, q2 - gW, w2, false),
    finger(q2 + gW, q1 - gW, w1, false),
    finger(q1 + gW, t1, null, false),
    extrudeSolid(seamFace(xIn, t0 - TAB_LIP, t1, [w2, w1], false), [], tunH, FLANGE_T),
  ];

  // Collars for BOTH wells on this design's full (well) side. The rotated
  // copy's collars land on the far wall as harmless shallow dents.
  const collarA = buildCollar(layout, layout.coneYA, cavX0, 1);
  const collarB = buildCollar(layout, layout.coneYB, cavX0, 1);

  return mergeMeshes([body, flange, tabA, tabB, ...feet, collarA, collarB]);
}
