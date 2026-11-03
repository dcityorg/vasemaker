/** The whole "no dialog on the happy path" claim rests on this round-trip. */
import { applyPreset, BUILT_IN_PRESETS } from '@/presets';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';

const live = { ...applyPreset(BUILT_IN_PRESETS[0]), color: '#0000ff' };
const cases: [string, unknown][] = [
  ['store initial state', live],
  ['after an edit', { ...live, radius: 47.5 }],
  ['default params', DEFAULT_PARAMETERS],
  ...BUILT_IN_PRESETS.map((p, i) => [`preset ${i}: ${p.name}`, applyPreset(p)] as [string, unknown]),
];
let ok = true;
for (const [name, params] of cases) {
  // Simulate: saved to a mold file, read back, merged like the load path does.
  const fromFile = JSON.parse(JSON.stringify(params));
  const merged = applyPreset({ parameters: fromFile });
  const same = JSON.stringify(merged) === JSON.stringify(params);
  if (!same) {
    ok = false;
    const a = JSON.stringify(merged), b = JSON.stringify(params);
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    console.log(`FAIL  ${name}\n      diverges at ${i}: ...${a.slice(Math.max(0,i-60), i+60)}\n                       ...${b.slice(Math.max(0,i-60), i+60)}`);
  } else {
    console.log(`PASS  ${name}`);
  }
}
// And an OLD file (missing a recently-added key) must still compare equal to a
// current design that only differs by that key's default.
const stripped = JSON.parse(JSON.stringify(live)) as Record<string, unknown>;
delete stripped.printCheck;
const revived = applyPreset({ parameters: stripped });
const backCompat = JSON.stringify(revived) === JSON.stringify(live);
console.log(`${backCompat ? 'PASS' : 'FAIL'}  older file missing 'printCheck' still compares equal`);
ok = ok && backCompat;
console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
process.exit(ok ? 0 : 1);
