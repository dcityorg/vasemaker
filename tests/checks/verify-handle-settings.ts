/**
 * Settings round-trip: Save → JSON → Load must return every parameter.
 *
 * `mergeHandleParameters` copies keys by walking DEFAULT_HANDLE_PARAMETERS and
 * type-checking each one, so a new parameter is covered automatically — as long
 * as it is actually added to that default object. A field declared on the
 * interface but missing from the defaults would be dropped on load SILENTLY:
 * the file keeps it, the app ignores it, and the design quietly reverts. This
 * check builds a design where every field differs from its default and asserts
 * all of them survive.
 *
 * Two exemptions are legitimate: the drawing-window edges may GROW on load (a
 * window is never allowed to hide a control point), and `masterHollow` is
 * forced true (a solid master has no seat-lip seal — see v1.24.0).
 *
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-handle-settings.ts
 */
import { DEFAULT_HANDLE_PARAMETERS as D, mergeHandleParameters, type HandleParameters } from '@/engine/handle/handle-types';
import { HANDLE_PARAMS } from '@/config/handle-params';

const ranges = HANDLE_PARAMS as Record<string, { min: number; max: number; step: number }>;

// Build a design where EVERY field differs from its default.
const probe: HandleParameters = JSON.parse(JSON.stringify(D));
probe.spinePoints = [[0, 3], [37, 20], [44, 55], [31, 88], [0, 96]];
probe.spineTypes = ['fixed', 'handle', 'fixed', 'handle', 'fixed'];
probe.material = D.material === 'pottery' ? 'hydrocal' : 'pottery';
for (const k of Object.keys(D) as (keyof HandleParameters)[]) {
  if (typeof D[k] !== 'number') continue;
  const r = ranges[k as string];
  const cur = D[k] as number;
  // pick a legal, different value
  let v = r ? (cur + r.step * 3 <= r.max ? cur + r.step * 3 : cur - r.step * 3) : cur + 7;
  if (v === cur) v = cur + 1;
  (probe as unknown as Record<string, number>)[k as string] = v;
}

const json = JSON.stringify({ app: 'VaseMaker', type: 'handle-settings', settings: probe });
const back = mergeHandleParameters(JSON.parse(json).settings);

const WINDOW = new Set(['winRight', 'winTop', 'winBottom']); // may legally grow
const FORCED = new Set(['masterHollow']);                    // deliberately forced true
const lost: string[] = [];
for (const k of Object.keys(D) as (keyof HandleParameters)[]) {
  const a = JSON.stringify((probe as any)[k]);
  const b = JSON.stringify((back as any)[k]);
  if (a === b) continue;
  const note = WINDOW.has(k as string) ? '(window may grow to show control points — OK)'
    : FORCED.has(k as string) ? '(forced true by design — OK)'
    : '<<< LOST';
  console.log(`  ${String(k).padEnd(22)} saved ${a.padEnd(34)} loaded ${b.padEnd(20)} ${note}`);
  if (note === '<<< LOST') lost.push(k as string);
}
console.log(`\nfields checked: ${Object.keys(D).length}`);
console.log(lost.length ? `FAIL — LOST ON LOAD: ${lost.join(', ')}` : 'PASS — every field survives the round trip');

// Every interface field must exist in the defaults, or it can never be saved.
const declared = Object.keys(probe);
const defaulted = new Set(Object.keys(D));
const undeclared = declared.filter((k) => !defaulted.has(k));
if (undeclared.length) console.log(`FAIL — not in DEFAULT_HANDLE_PARAMETERS (never saved): ${undeclared.join(', ')}`);

process.exit(lost.length || undeclared.length ? 1 : 0);
