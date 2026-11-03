/**
 * Fingerprint Pour 3-Pc's parts (center, shells, plaster) for a few vases,
 * foot on and off. Run at the old and new commit: with no mark, every part
 * must come out byte-identical.
 *   npx tsx --tsconfig tsconfig.json tests/tools/hash-3pc.ts
 */
import { createHash } from 'crypto';
import { applyPreset } from '@/presets';
import { BUILT_IN_PRESETS } from '@/config/presets';
import { DEFAULT_MOLD_PARAMETERS, type MoldParameters } from '@/engine/mold/mold-types';
import { generatePourThreePieceMold } from '@/engine/mold/pour-three-piece-generator';
import type { VaseMesh } from '@/engine/types';

const h = (m: VaseMesh) => createHash('sha1')
  .update(Buffer.from(m.positions.buffer)).update(Buffer.from(m.indices.buffer)).digest('hex').slice(0, 12);
const mold = (foot: boolean): MoldParameters => ({ ...DEFAULT_MOLD_PARAMETERS, moldStyle: 'pourThreePiece', footEnabled: foot, footHeight: foot ? 1 : 0 });
const vases: [string, ReturnType<typeof applyPreset>][] = [['default', applyPreset({ parameters: {} })]];
for (const n of ['Fluted Tray', 'Stone Box']) vases.push([n, applyPreset(BUILT_IN_PRESETS.find((p) => p.name === n)!)]);
for (const [n, v] of vases) for (const foot of [true, false]) {
  const r = generatePourThreePieceMold(v, mold(foot));
  console.log(`${n.padEnd(12)} foot ${foot ? 'on ' : 'off'} center ${h(r.center)} A ${h(r.shellA)} B ${h(r.shellB)} plaster ${h(r.plaster)} uc ${r.undercutFlags.reduce((a, b) => a + b, 0).toFixed(3)}`);
}
