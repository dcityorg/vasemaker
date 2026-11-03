/**
 * Golden geometry: every built-in design, and one default of each tool, must
 * build the same geometry as when the goldens were last accepted. Catches the
 * change nobody meant to make (a vase that does not use a new feature, but
 * whose mesh moved anyway).
 *   npm test -- golden                                    check
 *   npx tsx --tsconfig tsconfig.json tests/checks/golden.ts --update   accept the current geometry
 * Update ONLY after reading the differences and deciding the change is wanted;
 * say so in the commit. Tolerances, and why they are not a byte hash:
 * tests/lib/fingerprint.ts.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fingerprint, compare, meshesOf, type Fingerprint } from '../lib/fingerprint';
import { generateMesh } from '@/engine/mesh-generator';
import { applyPreset } from '@/presets';
import { BUILT_IN_PRESETS } from '@/config/presets';
import { HANDLE_PRESETS } from '@/config/handle-presets';
import { DEFAULT_MOLD_PARAMETERS, type MoldParameters } from '@/engine/mold/mold-types';
import { generatePourThreePieceMold } from '@/engine/mold/pour-three-piece-generator';
import { generateSplitHalvesMold } from '@/engine/mold/split-halves-generator';
import { generateSplitThirdsMold } from '@/engine/mold/split-thirds-generator';
import { DEFAULT_HANDLE_PARAMETERS, mergeHandleParameters } from '@/engine/handle/handle-types';
import { generateHandleMold } from '@/engine/handle/handle-generator';
import { DEFAULT_SPRIG_PARAMETERS } from '@/engine/sprig/sprig-types';
import { generateSprigMold } from '@/engine/sprig/sprig-generator';
import type { VaseMesh } from '@/engine/types';

const DIR = join(process.cwd(), 'tests/golden');
const update = process.argv.includes('--update');
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

type Group = Record<string, Fingerprint>;
const groups: Record<string, () => [string, VaseMesh][]> = {};

// ── The vase: default, every built-in preset, and the shell variants ──
groups.vase = () => {
  const base = applyPreset({ parameters: {} });
  const cases: [string, ReturnType<typeof applyPreset>][] = [['default', base]];
  for (const p of BUILT_IN_PRESETS) cases.push([p.name, applyPreset(p)]);
  cases.push(['wall 0', { ...base, wallThickness: 0 }], ['open bottom', { ...base, bottomThickness: 0 }],
    ['thick base', { ...base, bottomThickness: 6 }], ['perpendicular wall', { ...base, innerOffsetMode: 'perpendicular' }]);
  return cases.map(([n, p]) => [n, generateMesh(p)]);
};

// ── Molds: Pour 3-Pc on three vases, foot on and off; Halves and Thirds on the default vase ──
const mold = (over: Partial<MoldParameters>): MoldParameters => ({ ...DEFAULT_MOLD_PARAMETERS, ...over });
groups['mold-pour3pc'] = () => {
  const vases: [string, ReturnType<typeof applyPreset>][] = [['default', applyPreset({ parameters: {} })]];
  for (const n of ['Fluted Tray', 'Stone Box']) vases.push([n, applyPreset(BUILT_IN_PRESETS.find((p) => p.name === n)!)]);
  return vases.flatMap(([n, v]) => [true, false].flatMap((foot) =>
    meshesOf(generatePourThreePieceMold(v, mold({ moldStyle: 'pourThreePiece', footEnabled: foot, footHeight: foot ? 1 : 0 })))
      .map(([part, m]): [string, VaseMesh] => [`${n}, foot ${foot ? 'on' : 'off'}: ${part}`, m])));
};
groups['mold-split'] = () => {
  const v = applyPreset({ parameters: {} });
  // The default handle needs a mug at least ~120 mm tall; the default vase is 100.
  const withHandle = generateSplitHalvesMold({ ...v, height: 120 }, mold({ moldStyle: 'splitHalves', splitHandle: true }), DEFAULT_HANDLE_PARAMETERS);
  if (!withHandle.handle) throw new Error(`golden: the halves + handle case built no handle (${withHandle.handleError}) — it would only repeat the plain case`);
  return [
    ...meshesOf(generateSplitHalvesMold(v, mold({ moldStyle: 'splitHalves' }), null)).map(([p, m]): [string, VaseMesh] => [`halves: ${p}`, m]),
    ...meshesOf(withHandle).map(([p, m]): [string, VaseMesh] => [`halves + handle: ${p}`, m]),
    ...meshesOf(generateSplitThirdsMold(v, mold({ moldStyle: 'splitThirds' }))).map(([p, m]): [string, VaseMesh] => [`thirds: ${p}`, m]),
  ];
};

// ── HandleMaker: default and every handle preset ──
groups.handle = () => [['default', DEFAULT_HANDLE_PARAMETERS] as const, ...HANDLE_PRESETS.map((h) => [h.name, mergeHandleParameters({ ...DEFAULT_HANDLE_PARAMETERS, ...h.params })] as const)]
  .flatMap(([n, p]) => meshesOf(generateHandleMold(p)).map(([part, m]): [string, VaseMesh] => [`${n}: ${part}`, m]));

// ── SprigMaker: the default settings on a synthetic disc ──
groups.sprig = () => {
  const w = 400, px = new Uint8Array(w * w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) px[y * w + x] = Math.hypot(x + 0.5 - 200, y + 0.5 - 200) < 199 ? 0 : 255;
  return meshesOf(generateSprigMold({ ...DEFAULT_SPRIG_PARAMETERS }, { pixels: px, width: w, height: w }));
};

// ── Negative controls: the tolerance must see a small real change and ignore noise ──
{
  const m = generateMesh(applyPreset({ parameters: {} }));
  const want = fingerprint(m);
  const v = m.positions.length / 3;
  // 1. ONE vertex, not one of the 128 sampled, moved 3 µm — along each axis in turn.
  const step = v / 128;
  let i = Math.floor(step / 2) + 1;
  while (Number.isInteger(i / step)) i++;
  for (const k of [0, 1, 2]) {
    const nudged = new Float32Array(m.positions); nudged[i * 3 + k] += 0.003;
    const d = compare(fingerprint({ ...m, positions: nudged }), want);
    check(d.length > 0, `control: one unsampled vertex moved 3 µm in ${'xyz'[k]} is caught (${d.join('; ') || 'NOT caught'})`);
  }
  // 2. Noise: coordinates moved one float32 step up or down at random (seeded),
  //    1 % and 10 % of them. A last-bit change in a double flips its float32
  //    about once in 10⁹, so this is millions of times what a Node or CPU
  //    change does. (EVERY coordinate moved a step IS flagged: that is a change
  //    in the arithmetic itself, not rounding, and it should be looked at.)
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (const share of [0.01, 0.1]) {
    const noisy = new Float32Array(m.positions);
    let flipped = 0;
    noisy.forEach((c, k) => {
      if (rnd() >= share) return;
      const up = rnd() < 0.5, mag = Math.abs(c) || 1e-30;
      noisy[k] = Math.fround(c + (up ? 1 : -1) * mag * 2 ** -23);
      if (noisy[k] !== c) flipped++;
    });
    const d = compare(fingerprint({ ...m, positions: noisy }), want);
    check(flipped > share * m.positions.length * 0.9 && d.length === 0,
      `control: ${flipped} of ${m.positions.length} coordinates moved one float32 step is NOT a change${d.length ? ` (flagged: ${d.join('; ')})` : ''}`);
  }
}

// ── Check or update each group ──
mkdirSync(DIR, { recursive: true });
for (const [group, build] of Object.entries(groups)) {
  const file = join(DIR, `${group}.json`);
  const got: Group = {};
  for (const [name, m] of build()) {
    if (got[name]) throw new Error(`golden: duplicate case name "${name}" in ${group}`);
    got[name] = fingerprint(m);
  }
  if (update) {
    // One line per mesh, so an accepted change reads as a short diff. Samples
    // are float32: 9 significant digits round-trip them exactly. Sums keep 12.
    const round = (k: string, x: unknown) => (typeof x === 'number' && !Number.isInteger(x) ? Number(x.toPrecision(k === 'samples' ? 9 : 12)) : x);
    const line = (fp: Fingerprint) => JSON.stringify(Object.fromEntries(Object.entries(fp).map(([k, x]) => [k, Array.isArray(x) ? x.map((y) => round(k, y)) : round(k, x)])));
    writeFileSync(file, `{\n${Object.entries(got).map(([n, fp]) => `${JSON.stringify(n)}: ${line(fp)}`).join(',\n')}\n}\n`);
    console.log(`UPDATED  ${group}: ${Object.keys(got).length} meshes written to tests/golden/${group}.json`);
    continue;
  }
  if (!existsSync(file)) { check(false, `${group}: no golden file (run with --update once, after checking the geometry)`); continue; }
  const want: Group = JSON.parse(readFileSync(file, 'utf8'));
  let same = 0;
  for (const name of Object.keys({ ...want, ...got })) {
    if (!want[name]) { check(false, `${group} / ${name}: new mesh, not in the golden file`); continue; }
    if (!got[name]) { check(false, `${group} / ${name}: in the golden file but no longer built`); continue; }
    const d = compare(got[name], want[name]);
    if (d.length) check(false, `${group} / ${name}: ${d.join('; ')}`); else same++;
  }
  check(same === Object.keys(want).length, `${group}: ${same} of ${Object.keys(want).length} meshes unchanged`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
