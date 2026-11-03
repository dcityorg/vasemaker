/**
 * Mating check: wall A's vertical V bump apexes and (rotated) wall B's notch
 * apexes must sit at the SAME y positions on each seam, with notch deeper than
 * bump. Bump apex plane: x = xc + vh (this wall's max x near a seam); notch
 * apex plane on the rotated copy: x = xc + gH.
 */
import { DEFAULT_HANDLE_PARAMETERS } from '@/engine/handle/handle-types';
import { generateHandleMold } from '@/engine/handle/handle-generator';
import { SEAL_RING_COUNT } from '@/engine/handle/mold-parts';
import type { VaseMesh } from '@/engine/types';

const p = structuredClone(DEFAULT_HANDLE_PARAMETERS);
const m = generateHandleMold(p);
const vh = p.vHeight, gH = p.vHeight + p.vClearance;

function xMax(mesh: VaseMesh): number {
  let v = -Infinity;
  for (let i = 0; i < mesh.vertexCount; i++) v = Math.max(v, mesh.positions[i * 3]);
  return v;
}
function ysAt(mesh: VaseMesh, x: number): number[] {
  const ys = new Set<number>();
  for (let i = 0; i < mesh.vertexCount; i++) {
    if (Math.abs(mesh.positions[i * 3] - x) < 1e-4) ys.add(Math.round(mesh.positions[i * 3 + 1] * 1000) / 1000);
  }
  return [...ys].sort((a, b) => a - b);
}

const xcA = xMax(m.wall) - vh;        // wall A bump apex plane is its max x
const bumpY = ysAt(m.wall, xcA + vh);
const notchY = ysAt(m.wallB, xcA + gH); // rotated copy's notch apexes, same seam side
console.log('seam plane xc =', xcA.toFixed(3));
console.log('wall A bump apex y:', bumpY.join(', '));
console.log('wall B notch apex y:', notchY.join(', '));
const ok = bumpY.length === SEAL_RING_COUNT && notchY.length === SEAL_RING_COUNT &&
  bumpY.every((y, i) => Math.abs(y - notchY[i]) < 1e-6);
console.log(ok ? 'PASS  mating: bumps and notches aligned' : 'FAIL  mating: bumps and notches NOT aligned');
process.exit(ok ? 0 : 1);
