/**
 * Deep: every tool in tests/tools/ still runs on the default design and makes
 * something real. These are not pass/fail checks, so nothing else exercises
 * them, and that is how render-master and probe-fins went stale (a new
 * required option, so NaN geometry, for weeks). A renderer must draw a
 * non-blank picture; no tool may print NaN.
 */
import { spawnSync } from 'child_process';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };
const OUT = join(process.cwd(), 'test-results');
mkdirSync(OUT, { recursive: true });

/** Share of pixels that differ from the corner pixel (the background). */
function drawn(ppm: string): number {
  const b = readFileSync(ppm);
  const m = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(b.subarray(0, 40).toString('latin1'));
  if (!m) return 0;
  const px = b.subarray(m[0].length);
  let n = 0;
  for (let i = 0; i < px.length; i += 3) if (px[i] !== px[0] || px[i + 1] !== px[1] || px[i + 2] !== px[2]) n++;
  return n / (px.length / 3);
}

const tools: [string, string[], string | null][] = [
  ['render-master', ['-', join(OUT, 'smoke-render-master.ppm')], join(OUT, 'smoke-render-master.ppm')],
  ['probe-fins', ['-', join(OUT, 'smoke-probe-fins.ppm')], join(OUT, 'smoke-probe-fins.ppm')],
  ['probe-seam', [], null],
];
for (const [name, args, picture] of tools) {
  // A stale tool can HANG rather than fail (NaN geometry looped render-master
  // forever), so each gets 30 s; they take 1–3.
  const r = spawnSync(join(process.cwd(), 'node_modules/.bin/tsx'), ['--tsconfig', 'tsconfig.json', `tests/tools/${name}.ts`, ...args], { encoding: 'utf8', timeout: 30_000, killSignal: 'SIGKILL' });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const why = r.error ? `TIMED OUT after 30 s` : `exit ${r.status}: ${out.trim().split('\n').slice(-2).join(' | ')}`;
  check(r.status === 0, `${name}: runs on the default design${r.status === 0 ? '' : ` — ${why}`}`);
  check(!/\bNaN\b/.test(out), `${name}: prints no NaN`);
  if (picture && r.status === 0) {
    const d = drawn(picture);
    check(d > 0.02, `${name}: draws a picture (${(d * 100).toFixed(1)} % of pixels)`);
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
