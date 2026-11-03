/**
 * The test runner.
 *   npm test                  quick suite: type-check the tests, then every check, in parallel
 *   npm run test:deep         quick suite + the deep checks (sweeps, tool smoke runs) + browser
 *   npm run test:browser      only tests/browser/
 *   npm test -- halves sprig  only the checks whose file name contains a word given
 *
 * Browser checks (tests/browser/; the quick suite runs only smoke*.ts) need the
 * app running: the runner builds a copy of the working tree in the temp folder
 * (only when its sources changed; ~10 s) and serves it on a free port
 * (tests/lib/app.ts). VASEMAKER_URL=<url> uses a server you started instead.
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
import { buildApp, serveApp } from './lib/app';

const ROOT = process.cwd();
const OUT = join(ROOT, 'test-results');
const TSX = join(ROOT, 'node_modules/.bin/tsx');
const TSC = join(ROOT, 'node_modules/.bin/tsc');
const TIMEOUT_S = 300;

const args = process.argv.slice(2);
const deep = args.includes('--deep');
const browser = args.includes('--browser');
const only = args.filter((a) => !a.startsWith('--'));

const list = (dir: string) => existsSync(join(ROOT, dir))
  ? readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.ts')).sort().map((f) => join(dir, f))
  : [];
const smoke = list('tests/browser').filter((f) => basename(f).startsWith('smoke'));
let files = browser ? list('tests/browser') : [...list('tests/checks'), ...(deep ? [...list('tests/deep'), ...list('tests/browser')] : smoke)];
if (only.length) files = files.filter((f) => only.some((w) => basename(f).includes(w)));

interface Result { name: string; rc: number; secs: number; pass: number; fail: number; skip: number; skips: string[] }

function count(out: string, word: string) {
  return out.split('\n').filter((l) => l.trimStart().startsWith(word)).length;
}

// Detached checks do not get the terminal's Ctrl-C, so pass it on.
const running = new Set<number>();
process.on('SIGINT', () => { for (const pid of running) try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } process.exit(130); });

function run(file: string): Promise<Result> {
  const name = basename(file, '.ts');
  const t0 = Date.now();
  return new Promise((done) => {
    // Its own process group, so a timeout kills tsx's node child (and any
    // browser it started) too, not just tsx.
    const p = spawn(TSX, ['--tsconfig', 'tsconfig.json', file], { cwd: ROOT, detached: true });
    // A check that hangs must fail, not stall the suite. The slowest takes ~45 s.
    const timer = setTimeout(() => { out += `\nFAIL  TIMED OUT after ${TIMEOUT_S} s\n`; try { process.kill(-p.pid!, 'SIGKILL'); } catch { p.kill('SIGKILL'); } }, TIMEOUT_S * 1000);
    running.add(p.pid!);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      clearTimeout(timer);
      running.delete(p.pid!);
      writeFileSync(join(OUT, `${name}.log`), out);
      done({ name, rc: code ?? 1, secs: (Date.now() - t0) / 1000, pass: count(out, 'PASS'), fail: count(out, 'FAIL'), skip: count(out, 'SKIPPED'),
        skips: out.split('\n').filter((l) => l.startsWith('SKIPPED')).map((l) => `${name}: ${l.replace(/^SKIPPED\s+/, '')}`) });
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

  // The browser checks share one production build of the app.
  let stopApp = () => {};
  if (files.some((f) => f.startsWith('tests/browser/')) && !process.env.VASEMAKER_URL) {
    try {
      const secs = buildApp((s) => console.log(`      ${s}`));
      const app = await serveApp();
      process.env.VASEMAKER_URL = app.url;
      stopApp = app.stop;
      console.log(`ok    app ${secs ? `built in ${secs.toFixed(0)} s, ` : 'unchanged, '}served at ${app.url}`);
    } catch (e) {
      console.log(`FAIL  app build — ${(e as Error).message}`);
      process.exit(1);
    }
  }

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

  stopApp();
  writeFileSync(timesFile, JSON.stringify({ ...last, ...Object.fromEntries(results.map((r) => [r.name, r.secs])) }, null, 1));
  const failed = results.filter((r) => r.rc !== 0 || r.fail > 0);
  const skipped = results.reduce((s, r) => s + r.skip, 0);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n${results.length} checks in ${secs} s: ${failed.length ? `${failed.length} FAILED (${failed.map((r) => r.name).join(', ')})` : 'all passed'}`
    + `${typesOk ? '' : ', TYPECHECK FAILED'}${skipped ? `, ${skipped} SKIPPED:` : ''}`);
  for (const r of results) for (const l of r.skips) console.log(`  SKIPPED  ${l}`);
  console.log(`logs: test-results/`);
  process.exit(failed.length || !typesOk ? 1 : 0);
}

main();
