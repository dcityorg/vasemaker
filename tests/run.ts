/**
 * The test runner.
 *   npm test                  quick suite: type-check the tests, then every check, in parallel
 *   npm run test:deep         quick suite + the deep checks (sweeps, tool smoke runs)
 *   npm test -- halves sprig  only the checks whose file name contains a word given
 *
 * Every check is a plain script that prints PASS / FAIL / SKIPPED lines and
 * exits 0 or 1. A check fails if it exits non-zero OR prints a FAIL line, so a
 * script that forgets its exit code still cannot pass. A SKIPPED line (a
 * private design that is not present) is counted and shown, never hidden.
 * Full output of every check: test-results/<name>.log.
 */
import { spawn, spawnSync } from 'child_process';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { cpus } from 'os';
import { join, basename } from 'path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'test-results');
const TSX = join(ROOT, 'node_modules/.bin/tsx');
const TSC = join(ROOT, 'node_modules/.bin/tsc');

const args = process.argv.slice(2);
const deep = args.includes('--deep');
const only = args.filter((a) => !a.startsWith('--'));

const list = (dir: string) => existsSync(join(ROOT, dir))
  ? readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.ts')).sort().map((f) => join(dir, f))
  : [];
let files = [...list('tests/checks'), ...(deep ? list('tests/deep') : [])];
if (only.length) files = files.filter((f) => only.some((w) => basename(f).includes(w)));

interface Result { name: string; rc: number; secs: number; pass: number; fail: number; skip: number }

function count(out: string, word: string) {
  return out.split('\n').filter((l) => l.trimStart().startsWith(word)).length;
}

function run(file: string): Promise<Result> {
  const name = basename(file, '.ts');
  const t0 = Date.now();
  return new Promise((done) => {
    const p = spawn(TSX, ['--tsconfig', 'tsconfig.json', file], { cwd: ROOT });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      writeFileSync(join(OUT, `${name}.log`), out);
      done({ name, rc: code ?? 1, secs: (Date.now() - t0) / 1000, pass: count(out, 'PASS'), fail: count(out, 'FAIL'), skip: count(out, 'SKIPPED') });
    });
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();

  // Type-check the tests first: a script left behind by an API change (a new
  // required option) fails here by name instead of building NaN geometry.
  const tc = spawnSync(TSC, ['-p', 'tests/tsconfig.json', '--noEmit'], { cwd: ROOT, encoding: 'utf8' });
  writeFileSync(join(OUT, 'typecheck.log'), tc.stdout + tc.stderr);
  const typesOk = tc.status === 0;
  console.log(`${typesOk ? 'ok  ' : 'FAIL'}  typecheck (tests/)${typesOk ? '' : '\n' + tc.stdout.trim()}`);

  // Slowest first (by the last run's times), so a long check does not start last.
  const timesFile = join(OUT, 'timings.json');
  const last: Record<string, number> = existsSync(timesFile) ? JSON.parse(readFileSync(timesFile, 'utf8')) : {};
  const queue = [...files].sort((x, y) => (last[basename(y, '.ts')] ?? 0) - (last[basename(x, '.ts')] ?? 0));
  const results: Result[] = [];
  const workers = Math.max(1, Math.min(cpus().length - 2, 12));
  await Promise.all(Array.from({ length: workers }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const r = await run(f);
      const bad = r.rc !== 0 || r.fail > 0;
      console.log(`${bad ? 'FAIL' : 'ok  '}  ${r.name.padEnd(28)} ${r.secs.toFixed(0).padStart(3)} s  ${r.pass} passed${r.fail ? `, ${r.fail} FAILED` : ''}${r.skip ? `, ${r.skip} SKIPPED` : ''}${r.rc && !r.fail ? `  (exit ${r.rc} — see test-results/${r.name}.log)` : ''}`);
      results.push(r);
    }
  }));

  writeFileSync(timesFile, JSON.stringify({ ...last, ...Object.fromEntries(results.map((r) => [r.name, r.secs])) }, null, 1));
  const failed = results.filter((r) => r.rc !== 0 || r.fail > 0);
  const skipped = results.reduce((s, r) => s + r.skip, 0);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n${results.length} checks in ${secs} s: ${failed.length ? `${failed.length} FAILED (${failed.map((r) => r.name).join(', ')})` : 'all passed'}`
    + `${typesOk ? '' : ', TYPECHECK FAILED'}${skipped ? `, ${skipped} SKIPPED (private designs not present)` : ''}`);
  console.log(`logs: test-results/`);
  process.exit(failed.length || !typesOk ? 1 : 0);
}

main();
