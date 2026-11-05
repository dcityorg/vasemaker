/**
 * Deep: every tool in tests/tools/ still runs on the default design and makes
 * something real. These are not pass/fail checks, so nothing else exercises
 * them, and that is how render-master and probe-fins went stale (a new
 * required option, so NaN geometry, for weeks). A renderer must draw a
 * non-blank picture; no tool may print NaN.
 */
import { spawnSync } from 'child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
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
// A stale tool can HANG rather than fail (NaN geometry looped render-master
// forever), so each gets 30 s; they take 1–3. One node process with tsx as a
// loader, not the tsx command: that runs the tool in a CHILD node that the
// timeout's kill never reaches and that ignores SIGTERM, so a hung tool spun
// at 100 % CPU for 2½ days after its test had ended (2026-11-05).
const runTool = (file: string, args: string[], timeout = 30_000) =>
  spawnSync(process.execPath, ['--import', 'tsx', file, ...args], { encoding: 'utf8', timeout, killSignal: 'SIGKILL' });

{
  const spin = join(OUT, 'smoke-spin.ts');
  writeFileSync(spin, 'for (;;) { /* a hung tool */ }\n');
  const r = runTool(spin, [], 2000);
  const left = spawnSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.includes(spin));
  check(!!r.error && left.length === 0, `a hung tool is stopped at its timeout and leaves no process behind${left.length ? ` — still running: ${left.join(' | ')}` : ''}`);
  for (const l of left) try { process.kill(Number(l.trim().split(' ')[0]), 'SIGKILL'); } catch { /* gone */ }
}

for (const [name, args, picture] of tools) {
  const r = runTool(`tests/tools/${name}.ts`, args);
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
