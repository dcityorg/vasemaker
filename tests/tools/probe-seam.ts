/**
 * Probe the seam interface of the Pour 3-Pc shells: at the +x seam (seamAngle 0),
 * bucket each half's vertices by their signed tangential offset (y in print
 * space) and z-band, to confirm:
 *   - protruding features (posts z 2-4, fin bumps z>=3.8) reach |y| ~ 0.9
 *   - recessed features (cap troughs z 2-4, fin notches) reach |y| ~ 1.3
 *   - protrusions of one half and recesses of the OTHER share the same sign
 *     (nested, not colliding), and |protrusion| < |recess|
 *   - nothing dips below the shell bottom z = ffT
 * Run: npx tsx --tsconfig tsconfig.json <this file>
 */
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { DEFAULT_MOLD_PARAMETERS } from '@/engine/mold/mold-types';
import { generatePourThreePieceMold } from '@/engine/mold/pour-three-piece-generator';
import type { VaseMesh } from '@/engine/types';

const vase = structuredClone(DEFAULT_PARAMETERS);
const mold = structuredClone(DEFAULT_MOLD_PARAMETERS);
const m = generatePourThreePieceMold(vase, mold);
const ffT = mold.footFlangeThickness; // 2
const zB = ffT, zFT = 2 * ffT;

function minZ(mesh: VaseMesh): number {
  let z = Infinity;
  for (let i = 0; i < mesh.vertexCount; i++) z = Math.min(z, mesh.positions[i * 3 + 2]);
  return z;
}

// Histogram of y values (0.05 bins) for verts near the +x seam in a z-band.
function yHisto(mesh: VaseMesh, z0: number, z1: number): Map<string, number> {
  const h = new Map<string, number>();
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = mesh.positions[i * 3], y = mesh.positions[i * 3 + 1], z = mesh.positions[i * 3 + 2];
    if (x < 30 || Math.abs(y) > 4 || z < z0 - 1e-6 || z > z1 + 1e-6) continue;
    const key = (Math.round(y / 0.05) * 0.05).toFixed(2);
    h.set(key, (h.get(key) ?? 0) + 1);
  }
  return new Map([...h.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])));
}

console.log('minZ shellA:', minZ(m.shellA).toFixed(4), ' shellB:', minZ(m.shellB).toFixed(4), ' (expect', zB.toFixed(1) + ')');
for (const [name, mesh] of [['shellA', m.shellA], ['shellB', m.shellB]] as const) {
  console.log(`\n${name} — flange band z=[${zB},${zFT}] near +x seam, y histogram:`);
  console.log(' ', JSON.stringify(Object.fromEntries(yHisto(mesh, zB, zFT))));
  console.log(`${name} — fin overlap band z=[3.8,4.0]:`);
  console.log(' ', JSON.stringify(Object.fromEntries(yHisto(mesh, 3.8, 4.0))));
}
