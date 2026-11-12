/**
 * The handle moved onto the vase (Gary, 2026-11-11; save-design-plan.md Part 2).
 * Split Halves is poured and proven, so the one thing that must not happen is
 * a different mold. For every test design that casts a handle, and for
 * variants with the seam and the handle somewhere other than the defaults:
 *  - OLD path: the mold settings' Split Angle + Top Below Rim + the file's
 *    handle, handed to the generator as before;
 *  - NEW path: the file loaded (the handle goes onto the vase), built from
 *    the vase's handle (src/engine/mold/handle-on-vase.ts);
 *  - every mesh of the two molds must match (fingerprints, 1 µm).
 * Also: an old file's handle lands on the vase with its place; a mold that
 * does not cast one leaves the handle off; a new file reads the vase's copy;
 * the mold casts nothing when the vase's handle is off.
 * CONTROLS: Around moved 5° → the mold differs (so a match means something);
 * a migration that forgot the angle (Around 0) → differs on the 37° variant.
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-handle-on-vase.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { FIXTURES, privateDesign } from '../lib/designs';
import { fingerprint, compare, meshesOf } from '../lib/fingerprint';
import { loadMold, buildMold } from '../lib/load';
import { generateMold } from '@/engine/mold/build-mold';
import { moldUsesHandle } from '@/engine/mold/mold-types';
import { moldWithVaseFoot } from '@/engine/mold/vase-foot';
import { moldCastsHandle, moldBuildInputs } from '@/engine/mold/handle-on-vase';
import { readMoldFile, vaseFromFile, moldFromSettings } from '@/lib/design-files';
import type { VaseParameters } from '@/engine/types';

let ok = true, passes = 0;
const check = (c: boolean, m: string) => { if (c) { passes++; console.log(`PASS  ${m}`); } else { ok = false; console.log(`FAIL  ${m}`); } };

type Parsed = Parameters<typeof readMoldFile>[0] & { settings: Record<string, unknown>; vase: Record<string, unknown> };

/** Every mesh of two molds, compared; '' when all match. */
function differ(a: unknown, b: unknown): string {
  const ma = meshesOf(a), mb = meshesOf(b);
  if (ma.length !== mb.length) return `${ma.length} vs ${mb.length} meshes`;
  for (let i = 0; i < ma.length; i++) {
    const d = compare(fingerprint(mb[i][1]), fingerprint(ma[i][1]));
    if (d.length) return `${ma[i][0]}: ${d[0]}`;
  }
  return '';
}

/** The mold as it was built before 2026-11-11: the place from the mold settings, the handle beside the vase. */
function oldBuild(parsed: Parsed) {
  // As loadMold always did: an old file's foot goes onto its vase. The vase's
  // new handle field is dropped; the generators never read it anyway.
  const { handle: _new, ...fileVase } = readMoldFile(parsed).vase ?? {};
  void _new;
  const vase = vaseFromFile(fileVase);
  const stored = moldFromSettings(parsed.settings).params;
  const mold = moldWithVaseFoot(stored, vase);
  const handle = readMoldFile(parsed).handle;
  return generateMold(vase, mold, moldUsesHandle(mold) ? handle : null);
}

const files: [string, string | null][] = [
  ['fixture tumbler3-halves', join(FIXTURES, 'molds/tumbler3-halves.mold.json')],
  ...['mug-a', 'mug-b', 'tumbler3', 'tumbler4'].map((n): [string, string | null] =>
    [`private ${n}`, privateDesign(`molds/${n}.mold.json`, 'handle on the vase')]),
];

for (const [name, path] of files) {
  if (!path) continue;
  const base = JSON.parse(readFileSync(path, 'utf8')) as Parsed;
  // As saved, then the seam and handle moved off the defaults.
  const variants: [string, Parsed][] = [
    ['as saved', base],
    ['Split Angle 37°, Top Below Rim 22', { ...base, settings: { ...base.settings, seamAngle: 37, handleTopDrop: 22 } }],
    ['Split Angle 200°', { ...base, settings: { ...base.settings, seamAngle: 200 } }],
  ];
  for (const [v, parsed] of variants) {
    const was = oldBuild(parsed);
    if (!(was as { handle?: unknown }).handle) { check(false, `${name}, ${v}: the old build cast no handle (${(was as { handleError?: string }).handleError}) — nothing to compare`); continue; }
    const { vase, mold } = loadMold(parsed);
    const h = vase.handle!;
    check(h.enabled && h.around === parsed.settings.seamAngle && h.topDrop === parsed.settings.handleTopDrop && !!h.handle,
      `${name}, ${v}: the handle is on the vase at ${h.around}°, ${h.topDrop} mm (${h.handleName || 'unnamed'})`);
    const now = buildMold(vase, mold);
    const d = differ(was, now);
    check(d === '', `${name}, ${v}: the mold built from the vase's handle is the same as before${d ? ` — ${d}` : ''}`);
    if (v === 'Split Angle 37°, Top Below Rim 22') {
      const moved = buildMold({ ...vase, handle: { ...h, around: h.around + 5 } }, mold);
      check(differ(was, moved) !== '', `${name}: CONTROL Around moved 5° → the mold differs`);
      const forgot = buildMold({ ...vase, handle: { ...h, around: 0 } }, mold);
      check(differ(was, forgot) !== '', `${name}: CONTROL a migration that dropped the angle (Around 0) → the mold differs`);
    }
  }
}

// A mold that does not cast the handle: the handle stays off.
const thirds = JSON.parse(readFileSync(join(FIXTURES, 'molds/ribbed-waves-thirds.mold.json'), 'utf8')) as Parsed;
const t = loadMold(thirds);
check(t.vase.handle?.enabled === false && !moldCastsHandle(t.mold, t.vase), 'Split Thirds file: the vase\'s handle is off, nothing cast');

// Split Halves with its switch on but the vase's handle off: nothing cast, the seam is the mold's own.
const halves = JSON.parse(readFileSync(join(FIXTURES, 'molds/tumbler3-halves.mold.json'), 'utf8')) as Parsed;
const hv = loadMold({ ...halves, settings: { ...halves.settings, seamAngle: 50 } });
const off: VaseParameters = { ...hv.vase, handle: { ...hv.vase.handle!, enabled: false } };
const inOff = moldBuildInputs(off, hv.mold);
check(inOff.handle === null && inOff.mold.seamAngle === 50, `vase handle off: no handle cast, the seam stays the mold's own (${inOff.mold.seamAngle}°)`);
const inOn = moldBuildInputs({ ...hv.vase, handle: { ...hv.vase.handle!, around: 120 } }, hv.mold);
check(!!inOn.handle && inOn.mold.seamAngle === 120, `vase handle on: the seam follows Around (${inOn.mold.seamAngle}°)`);

// A new file: the handle is only on the vase; it reads back from there.
const newFile = { app: 'VaseMaker', type: 'mold-settings', settings: halves.settings, vase: { ...hv.vase, handle: { ...hv.vase.handle!, handleName: 'D Handle' } }, vaseName: 'Tall' };
const rf = readMoldFile(newFile);
check(!!rf.handle && rf.handleName === 'D Handle' && rf.vase?.handle?.around === hv.vase.handle!.around, 'new file: the handle and its name come from the vase');

// An old VASE file has no handle: off.
const oldVase = vaseFromFile(JSON.parse(readFileSync(join(FIXTURES, 'vases/2026-07-tumbler3.json'), 'utf8')));
check(oldVase.handle?.enabled === false && oldVase.handle.handle === null, 'old vase file: handle off');

console.log(`\n${ok ? 'ALL PASS' : 'SOME CHECKS FAILED'} (${passes} passed)`);
process.exit(ok ? 0 : 1);
