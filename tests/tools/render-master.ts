/**
 * Offline z-buffer render of the master's solids, false-coloured per SOLID, so
 * a visual complaint can be matched to the geometry that produced it without
 * driving the app (which writes to Gary's shared localStorage).
 *
 * Usage: npx tsx --tsconfig tsconfig.json render.ts <params.json> <out.ppm> [az] [el] [zoom] [cx cy cz]
 */
import { readFileSync, writeFileSync } from 'fs';
import { DEFAULT_HANDLE_PARAMETERS, mergeHandleParameters, type HandleParameters } from '@/engine/handle/handle-types';
import { sampleSpine } from '@/engine/handle/spine';
import { buildMasterParts, setSectionSegments, type HandleBodyDims } from '@/engine/handle/handle-mesh';
import type { VaseMesh } from '@/engine/types';

const file = process.argv[2];
const out = process.argv[3] ?? 'out.ppm';
const az = Number(process.argv[4] ?? 40) * Math.PI / 180;
const el = Number(process.argv[5] ?? -25) * Math.PI / 180;
const zoom = Number(process.argv[6] ?? 12);
const focus = process.argv[7] ? process.argv.slice(7, 10).map(Number) : null;

let p: HandleParameters = DEFAULT_HANDLE_PARAMETERS;
if (file && file !== '-') {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  p = mergeHandleParameters(raw.settings ?? raw.params ?? raw);  // as Load Settings does: old files get every new default
}

const S = 1 + p.shrinkPercent / 100;
const dims: HandleBodyDims = {
  hw: (p.width * S) / 2,
  ht: (p.thickness * S) / 2,
  openR: p.openingDiameter / 2,
  cylLen: p.cylinderLength,
  coneLen: p.coneLength,
};
const shellT = Math.max(1, Math.min(p.masterShellThickness, Math.min(dims.hw, dims.ht) - 0.55));
setSectionSegments(p.sectionSegments);
const stations = sampleSpine(p.spinePoints, p.spineTypes, Math.round(p.spineSamples), S);
const parts = buildMasterParts(stations, dims, { seat: p.seatDepth, hollow: true, shellT, ribWidth: p.ribWidth, ribCount: p.ribCount, ribSlot: p.ribSlot });

// One colour per solid so a suspicious surface can be named.
const layers: { name: string; mesh: VaseMesh; rgb: [number, number, number] }[] = [
  { name: 'body', mesh: parts.body, rgb: [90, 120, 200] },
  { name: 'wellA', mesh: parts.wellA, rgb: [220, 130, 60] },
  { name: 'wellB', mesh: parts.wellB, rgb: [60, 190, 130] },
];

const W = 1100, H = 900;
const zbuf = new Float64Array(W * H).fill(Infinity);
const img = new Uint8Array(W * H * 3);

// Camera basis: look direction from az/el, screen right/up orthonormal to it.
const dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
const upW = [0, 0, 1];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const right = norm(cross(dir, upW));
const up = norm(cross(right, dir));

let cx = 0, cy = 0, cz = 0;
if (focus) { [cx, cy, cz] = focus; }
else {
  let n = 0;
  for (const L of layers) for (let i = 0; i < L.mesh.vertexCount; i++) {
    cx += L.mesh.positions[i * 3]; cy += L.mesh.positions[i * 3 + 1]; cz += L.mesh.positions[i * 3 + 2]; n++;
  }
  cx /= n; cy /= n; cz /= n;
}

const project = (x: number, y: number, z: number): [number, number, number] => {
  const dx = x - cx, dy = y - cy, dz = z - cz;
  const sx = dx * right[0] + dy * right[1] + dz * right[2];
  const sy = dx * up[0] + dy * up[1] + dz * up[2];
  const sd = dx * dir[0] + dy * dir[1] + dz * dir[2];
  return [W / 2 + sx * zoom, H / 2 - sy * zoom, sd];
};

const light = norm([-0.4, -0.5, 0.75]);

for (const L of layers) {
  const P = L.mesh.positions, I = L.mesh.indices;
  for (let f = 0; f < L.mesh.triangleCount; f++) {
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
    const A = project(P[a], P[a + 1], P[a + 2]);
    const B = project(P[b], P[b + 1], P[b + 2]);
    const C = project(P[c], P[c + 1], P[c + 2]);
    // Face normal in world space for shading
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const nw = norm(cross(e1, e2));
    let lam = nw[0] * light[0] + nw[1] * light[1] + nw[2] * light[2];
    lam = 0.32 + 0.68 * Math.abs(lam);
    const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (Math.abs(den) < 1e-12) continue;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const l1 = ((B[1] - C[1]) * (px + 0.5 - C[0]) + (C[0] - B[0]) * (py + 0.5 - C[1])) / den;
        const l2 = ((C[1] - A[1]) * (px + 0.5 - C[0]) + (A[0] - C[0]) * (py + 0.5 - C[1])) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const d = l1 * A[2] + l2 * B[2] + l3 * C[2];
        const k = py * W + px;
        if (d >= zbuf[k]) continue;
        zbuf[k] = d;
        img[k * 3] = Math.min(255, L.rgb[0] * lam);
        img[k * 3 + 1] = Math.min(255, L.rgb[1] * lam);
        img[k * 3 + 2] = Math.min(255, L.rgb[2] * lam);
      }
    }
  }
}

writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), Buffer.from(img)]));
console.log(`wrote ${out}  centre ${cx.toFixed(1)},${cy.toFixed(1)},${cz.toFixed(1)}  hw=${dims.hw.toFixed(2)} ht=${dims.ht.toFixed(2)} openR=${dims.openR} shell=${shellT}`);
