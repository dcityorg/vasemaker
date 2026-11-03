/**
 * Real saved designs, from every era, load and build. Every .json under
 * tests/fixtures/ (public) and local-docs/test-designs/ (private; SKIPPED when
 * absent) goes through the same steps as the app's Load buttons
 * (tests/lib/load.ts), then:
 *  - nothing the merge returns is undefined or NaN — an old file gets every
 *    setting added since it was saved;
 *  - a vase builds as one closed, outward solid;
 *  - a mold builds in its own style (a retired style in its replacement), and
 *    every part is a closed, outward solid;
 *  - a handle mold builds, every part closed and outward.
 * Sprig and mark files are checked for the merge only: building one needs its
 * picture rasterized, which takes a browser.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { FIXTURES, PRIVATE_DESIGNS, skip } from '../lib/designs';
import { kindOf, loadVase, loadMold, buildMold, loadHandle, loadSprig } from '../lib/load';
import { solidReport, isSolid, describe } from '../lib/solid';
import { meshesOf } from '../lib/fingerprint';
import { generateMesh } from '@/engine/mesh-generator';
import { generateHandleMold } from '@/engine/handle/handle-generator';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

const jsonUnder = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? jsonUnder(p) : f.endsWith('.json') ? [p] : [];
});
const files = [
  ...(existsSync(FIXTURES) ? jsonUnder(FIXTURES) : []),
  ...(existsSync(PRIVATE_DESIGNS) ? jsonUnder(PRIVATE_DESIGNS) : []),
];
if (!existsSync(PRIVATE_DESIGNS)) skip('private test designs: local-docs/test-designs/ not present');

/** Paths of every undefined / NaN value in a merged settings object. */
function holes(x: unknown, path = ''): string[] {
  if (x === undefined) return [path || '(root)'];
  if (typeof x === 'number') return Number.isNaN(x) ? [path] : [];
  if (!x || typeof x !== 'object' || ArrayBuffer.isView(x)) return [];
  return Object.entries(x).flatMap(([k, v]) => holes(v, path ? `${path}.${k}` : k));
}

function solids(label: string, result: unknown) {
  const parts = meshesOf(result).filter(([, m]) => m.indices.length > 0).map(([p, m]) => [p, solidReport(m)] as const);
  const bad = parts.filter(([, r]) => !isSolid(r));
  check(parts.length > 0 && bad.length === 0, `${label}: ${parts.length} parts, every one closed and outward`
    + (bad.length ? ` — NOT: ${bad.map(([p, r]) => `${p} (${describe(r)})`).join('; ')}` : ''));
}

// Controls: the solid test must see a hole and a flipped triangle, and pass the untouched mesh.
{
  const m = generateMesh(loadVase({}));
  check(isSolid(solidReport(m)), 'control: the default vase is a closed, outward solid');
  const holed = { ...m, indices: m.indices.slice(3) };
  check(!isSolid(solidReport(holed)), `control: one triangle removed is caught (${describe(solidReport(holed))})`);
  const flipped = m.indices.slice(); [flipped[1], flipped[2]] = [flipped[2], flipped[1]];
  check(!isSolid(solidReport({ ...m, indices: flipped })), 'control: one triangle flipped is caught');
}

for (const file of files) {
  const name = relative(process.cwd(), file).replace(/^local-docs\/test-designs\//, 'private/');
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { check(false, `${name}: not JSON (${(e as Error).message})`); continue; }
  const kind = kindOf(parsed);
  try {
    if (kind === 'vase') {
      const v = loadVase(parsed);
      const h = holes(v);
      check(h.length === 0, `${name}: vase loads with every setting${h.length ? ` — missing ${h.slice(0, 5).join(', ')}` : ''}`);
      const r = solidReport(generateMesh(v));
      check(isSolid(r), `${name}: vase builds a closed, outward solid (${describe(r)})`);
    } else if (kind === 'mold') {
      const { vase, stored, mold, handle, retired } = loadMold(parsed);
      const h = [...holes(stored).map((p) => `mold.${p}`), ...holes(vase).map((p) => `vase.${p}`), ...(handle ? holes(handle).map((p) => `handle.${p}`) : [])];
      check(h.length === 0, `${name}: ${(parsed.settings as { moldStyle?: string })?.moldStyle ?? '?'} mold loads${retired ? ` (retired → ${mold.moldStyle})` : ''} with every setting${h.length ? ` — missing ${h.slice(0, 5).join(', ')}` : ''}`);
      solids(`${name}: ${mold.moldStyle}`, buildMold(vase, mold, handle));
    } else if (kind === 'handle') {
      const p = loadHandle(parsed);
      const h = holes(p);
      check(h.length === 0, `${name}: handle loads with every setting${h.length ? ` — missing ${h.slice(0, 5).join(', ')}` : ''}`);
      solids(`${name}: handle mold`, generateHandleMold(p));
    } else if (kind === 'sprig' || kind === 'mark') {
      const h = holes(loadSprig(parsed));
      check(h.length === 0, `${name}: ${kind} loads with every setting${h.length ? ` — missing ${h.slice(0, 5).join(', ')}` : ''} (not built: needs a browser)`);
    } else {
      check(false, `${name}: no Load button would accept this file`);
    }
  } catch (e) {
    check(false, `${name}: ${kind} THREW — ${(e as Error).stack?.split('\n').slice(0, 3).join(' | ')}`);
  }
}
check(files.length > 0 || !existsSync(PRIVATE_DESIGNS), `${files.length} design files checked`);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
