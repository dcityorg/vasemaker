/**
 * Fingerprint generateMesh output for every built-in preset plus a few shell
 * variants. Run before and after a mesh-generator change: a design that does
 * not use the new feature must come out byte-identical.
 *   npx tsx --tsconfig tsconfig.json tests/tools/hash-vase-meshes.ts > before.txt
 */
import { createHash } from 'crypto';
import { generateMesh } from '@/engine/mesh-generator';
import { applyPreset } from '@/presets';
import { BUILT_IN_PRESETS } from '@/config/presets';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import type { VaseParameters } from '@/engine/types';

const h = (m: ReturnType<typeof generateMesh>) => createHash('sha1')
  .update(Buffer.from(m.positions.buffer)).update(Buffer.from(m.indices.buffer)).update(Buffer.from(m.normals.buffer)).digest('hex').slice(0, 16);
const cases: [string, VaseParameters][] = [['default', applyPreset({ parameters: {} })]];
for (const p of BUILT_IN_PRESETS) cases.push([p.name, applyPreset(p)]);
const base = applyPreset({ parameters: {} });
cases.push(['wall0', { ...base, wallThickness: 0 }]);
cases.push(['openBottom', { ...base, bottomThickness: 0 }]);
cases.push(['thickBase', { ...base, bottomThickness: 6 }]);
cases.push(['perp', { ...base, innerOffsetMode: 'perpendicular' }]);
void DEFAULT_PARAMETERS;
for (const [n, p] of cases) { const m = generateMesh(p); console.log(`${n.padEnd(20)} ${m.vertexCount} ${m.triangleCount} ${h(m)}`); }
