/**
 * A production build of the app for the browser tests, so nobody has to set
 * VASEMAKER_URL by hand and nothing touches a dev server a person is using.
 *
 * The files git would commit (tracked + untracked, minus .gitignore'd — so
 * uncommitted edits ARE tested) are copied to a folder in the system temp
 * directory (never a synced folder), with this repo's node_modules symlinked. It is
 * rebuilt only when those files changed (a hash of their contents), then
 * `next start` serves it on a free port.
 */
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const ROOT = process.cwd();
export const APP_DIR = join(tmpdir(), 'vasemaker-test-app');
const NEXT = join(ROOT, 'node_modules/.bin/next');

function sourceFiles(): string[] {
  const r = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr}`);
  // Only what the app is built from: tests, docs and scratch do not change it.
  return r.stdout.split('\0').filter((f) => f && !/^(tests|docs|test-results)\//.test(f) && existsSync(join(ROOT, f))).sort();
}

function hashOf(files: string[]): string {
  const h = createHash('sha256');
  for (const f of files) h.update(f).update('\0').update(readFileSync(join(ROOT, f)));
  return h.digest('hex').slice(0, 16);
}

/** Build the copy if its sources changed. Returns how long it took (0 = reused). */
export function buildApp(log: (s: string) => void = () => {}): number {
  const files = sourceFiles();
  const hash = hashOf(files);
  const stamp = join(APP_DIR, '.test-build-hash');
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === hash && existsSync(join(APP_DIR, '.next/BUILD_ID'))) return 0;
  const t0 = Date.now();
  log(`building the app in ${APP_DIR} (sources changed) …`);
  rmSync(APP_DIR, { recursive: true, force: true });
  mkdirSync(APP_DIR, { recursive: true });
  for (const f of files) { mkdirSync(dirname(join(APP_DIR, f)), { recursive: true }); cpSync(join(ROOT, f), join(APP_DIR, f)); }
  symlinkSync(join(ROOT, 'node_modules'), join(APP_DIR, 'node_modules'));
  const b = spawnSync(NEXT, ['build'], { cwd: APP_DIR, encoding: 'utf8', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  if (b.status !== 0) throw new Error(`next build failed:\n${(b.stdout + b.stderr).split('\n').slice(-30).join('\n')}`);
  writeFileSync(stamp, hash);
  return (Date.now() - t0) / 1000;
}

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.unref();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); });
  });
}

/** Serve the built copy. Resolves once it answers. */
export async function serveApp(): Promise<{ url: string; stop: () => void }> {
  const port = await freePort();
  const p: ChildProcess = spawn(NEXT, ['start', '-p', String(port), '-H', '127.0.0.1'], { cwd: APP_DIR, stdio: 'ignore', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  const url = `http://127.0.0.1:${port}`;
  const stop = () => { if (p.exitCode === null) p.kill('SIGTERM'); };
  process.on('exit', stop);
  for (let i = 0; i < 100; i++) {
    if (p.exitCode !== null) throw new Error(`next start exited (${p.exitCode})`);
    try { if ((await fetch(url)).ok) return { url, stop }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  stop();
  throw new Error(`next start did not answer on ${url} within 20 s`);
}
