/**
 * Master lid (flange) builder — the flat top plate that sits on the cottle rim.
 *
 * Produces a solid annular slab following the vase's top cross-section, with:
 *  - round pour holes punched through it (for pouring plaster + brush access)
 *  - a downward "grip lip" at the outer edge that wraps over the cottle rim so
 *    the master self-centers and can't slide off.
 *
 * Built as an explicit vertex/triangle soup (holes break the ring symmetry).
 * Rendered DoubleSide and repaired by the slicer, matching the rest of the engine.
 */

import type { VaseMesh } from '../types';
import { computeNormals } from '../normals';

export interface LidOptions {
  topRing: Float32Array;   // master top cross-section ring (rRes × [x,y,z]); shape source
  cx: number;
  cy: number;
  rRes: number;
  innerDelta: number;      // radial delta from the top ring to the cavity opening (lid centre hole)
  lipInnerDelta: number;   // radial delta to the lip inner face (grips the cottle outer wall)
  lipOuterDelta: number;   // radial delta to the lip outer face
  zBot: number;            // flange underside (rests on cottle rim)
  zTop: number;            // flange top face
  lipDrop: number;         // how far the lip skirt hangs below zBot
  // Pour holes: arc-shaped slots that follow the cross-section, over the plaster gap.
  holeCount: number;       // number of slots around (0 → none)
  slotFraction: number;    // fraction of each sector that is open (0..1); the rest is spoke
  holeInnerDelta: number;  // radial delta of the slot's inner edge
  holeOuterDelta: number;  // radial delta of the slot's outer edge
}

export function buildLid(opts: LidOptions): VaseMesh {
  const { topRing, cx, cy, rRes, innerDelta, lipInnerDelta, lipOuterDelta, zBot, zTop, lipDrop, holeCount, slotFraction, holeInnerDelta, holeOuterDelta } = opts;

  const positions: number[] = [];
  const indices: number[] = [];
  const addV = (x: number, y: number, z: number): number => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => {
    indices.push(a, b, c, a, c, d);
  };

  // Offset topRing point t radially by `delta`.
  const localXY = (t: number, delta: number): [number, number] => {
    const x = topRing[t * 3];
    const y = topRing[t * 3 + 1];
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx, dy);
    const f = r > 1e-6 ? (r + delta) / r : 1;
    return [cx + dx * f, cy + dy * f];
  };

  // A grid cell is part of a pour slot when it lies in the plaster-gap radial band
  // AND inside one of the angular slot windows. Because the radial band is a fixed
  // delta from the cross-section, the slot follows the vase contour (round, square, …).
  const isSlot = (t: number, j: number): boolean => {
    if (holeCount <= 0 || slotFraction <= 0) return false;
    const d = innerDelta + (lipInnerDelta - innerDelta) * ((j + 0.5) / NR);
    if (d < holeInnerDelta || d > holeOuterDelta) return false;
    const within = (((t + 0.5) / rRes) * holeCount) % 1; // position within this sector (0..1)
    return Math.abs(within - 0.5) < slotFraction / 2;
  };

  // ── Body grid: innerDelta → lipInnerDelta, top (zTop) + bottom (zBot) layers ──
  const NR = 18;
  const topGrid: number[][] = [];
  const botGrid: number[][] = [];
  for (let t = 0; t < rRes; t++) {
    const topRow: number[] = [];
    const botRow: number[] = [];
    for (let j = 0; j <= NR; j++) {
      const d = innerDelta + (lipInnerDelta - innerDelta) * (j / NR);
      const [x, y] = localXY(t, d);
      topRow.push(addV(x, y, zTop));
      botRow.push(addV(x, y, zBot));
    }
    topGrid.push(topRow);
    botGrid.push(botRow);
  }

  // Hole mask per cell (t, j) — cell spans t..t+1, j..j+1.
  const holeCell: boolean[][] = [];
  for (let t = 0; t < rRes; t++) {
    const row: boolean[] = [];
    for (let j = 0; j < NR; j++) row.push(isSlot(t, j));
    holeCell.push(row);
  }

  // Top + bottom faces (skip hole cells)
  for (let t = 0; t < rRes; t++) {
    const tN = (t + 1) % rRes;
    for (let j = 0; j < NR; j++) {
      if (holeCell[t][j]) continue;
      // top face (normal +z): wind radial-out then angular so (edge)×(edge) points up
      quad(topGrid[t][j], topGrid[t][j + 1], topGrid[tN][j + 1], topGrid[tN][j]);
      // bottom face (normal −z): opposite winding
      quad(botGrid[t][j], botGrid[tN][j], botGrid[tN][j + 1], botGrid[t][j + 1]);
    }
  }

  // Hole walls — connect top ↔ bottom around each hole boundary
  for (let t = 0; t < rRes; t++) {
    const tN = (t + 1) % rRes;
    const tP = (t - 1 + rRes) % rRes;
    for (let j = 0; j < NR; j++) {
      if (!holeCell[t][j]) continue;
      // angular-low side (shared with cell tP): verts at column t, rows j & j+1
      if (!holeCell[tP][j]) quad(topGrid[t][j], botGrid[t][j], botGrid[t][j + 1], topGrid[t][j + 1]);
      // angular-high side (shared with cell tN)
      if (!holeCell[tN][j]) quad(topGrid[tN][j], topGrid[tN][j + 1], botGrid[tN][j + 1], botGrid[tN][j]);
      // radial-inner side (shared with cell j-1)
      if (j === 0 || !holeCell[t][j - 1]) quad(topGrid[t][j], topGrid[tN][j], botGrid[tN][j], botGrid[t][j]);
      // radial-outer side (shared with cell j+1)
      if (j === NR - 1 || !holeCell[t][j + 1]) quad(topGrid[t][j + 1], botGrid[t][j + 1], botGrid[tN][j + 1], topGrid[tN][j + 1]);
    }
  }

  // Inner edge wall (cavity opening) — closes the slab's inner rim, zBot → zTop
  for (let t = 0; t < rRes; t++) {
    const tN = (t + 1) % rRes;
    quad(botGrid[t][0], topGrid[t][0], topGrid[tN][0], botGrid[tN][0]);
  }

  // ── Grip lip at the outer edge ──
  const ring = (delta: number, z: number): number[] => {
    const r: number[] = [];
    for (let t = 0; t < rRes; t++) {
      const [x, y] = localXY(t, delta);
      r.push(addV(x, y, z));
    }
    return r;
  };
  const bodyBotOuter = botGrid.map((r) => r[NR]); // (lipInnerDelta, zBot)
  const bodyTopOuter = topGrid.map((r) => r[NR]); // (lipInnerDelta, zTop)
  const lipInBot = ring(lipInnerDelta, zBot - lipDrop);
  const lipOutBot = ring(lipOuterDelta, zBot - lipDrop);
  const lipOutTop = ring(lipOuterDelta, zTop);
  for (let t = 0; t < rRes; t++) {
    const tN = (t + 1) % rRes;
    quad(bodyBotOuter[t], lipInBot[t], lipInBot[tN], bodyBotOuter[tN]);   // lip inner face (grips cottle)
    quad(lipInBot[t], lipOutBot[t], lipOutBot[tN], lipInBot[tN]);         // lip bottom
    quad(lipOutBot[t], lipOutTop[t], lipOutTop[tN], lipOutBot[tN]);       // lip outer face
    quad(lipOutTop[t], bodyTopOuter[t], bodyTopOuter[tN], lipOutTop[tN]); // overhang top face
  }

  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  const normals = new Float32Array(pos.length);
  computeNormals(pos, idx, normals);
  return { positions: pos, normals, indices: idx, vertexCount: pos.length / 3, triangleCount: idx.length / 3 };
}
