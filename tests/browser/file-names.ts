/**
 * Browser: saved file names say what they are (Gary, 2026-11-11). On each page,
 * a design loaded from a file already named "<name> – <Ending>.json":
 *  - the page's name row shows just <name> (Load took the ending off);
 *  - Save Design offers "<name> – <Ending>.json", not doubled, and the bench
 *    sheet the same name as .txt (Mold, Handle, Sprig);
 *  - the Mold file's ending is its style (the fixture is Split Halves).
 * Chrome's save dialog is replaced by a stand-in that records the name.
 * Run: npm run test:browser -- file-names
 */
import { copyFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { type Browser } from '@playwright/test';
import { FIXTURES, skip } from '../lib/designs';
import { BASE, openWatched, loadFile, launchBrowser } from '../lib/browser';

const PAGES: { route: string; what: string; fixture: string; ending: string; txt: boolean }[] = [
  { route: '/', what: 'Vase', fixture: 'vases/2026-02-swirl1.json', ending: 'Vase', txt: false },
  { route: '/mold', what: 'Mold', fixture: 'molds/tumbler3-halves.mold.json', ending: 'Split Halves', txt: true },
  { route: '/handle', what: 'Handle', fixture: 'handles/tumbler3.json', ending: 'Handle', txt: true },
  { route: '/sprig', what: 'Sprig', fixture: 'sprigs/dcitylogo1-43x41.json', ending: 'Sprig', txt: true },
];

async function testPage(browser: Browser, p: typeof PAGES[number], dir: string): Promise<string[]> {
  const lines: string[] = [];
  const check = (ok: boolean, msg: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  const { context, page, errors, alerts } = await openWatched(browser);
  await context.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & { __names: string[] };
    w.__names = [];
    w.showSaveFilePicker = async (opts: { suggestedName: string }) => {
      w.__names.push(opts.suggestedName);
      return { kind: 'file', name: opts.suggestedName, createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
    };
  });
  const base = `Test ${p.what}`;
  const file = join(dir, `${base} – ${p.ending}.json`);
  copyFileSync(join(FIXTURES, p.fixture), file);

  await page.goto(BASE + p.route, { waitUntil: 'networkidle' });
  await loadFile(page, file);
  await page.waitForTimeout(500);
  const row = (await page.locator('div', { has: page.getByText(`${p.what} Name:`, { exact: true }) }).last().innerText()).replace(/\s+/g, ' ');
  check(row.includes(base) && !row.includes(`– ${p.ending}`), `${p.what}: loading "${base} – ${p.ending}.json" names it "${base}" (row: "${row.trim()}")`);

  await page.getByRole('button', { name: 'Save Design', exact: true }).click();
  const next = page.getByRole('button', { name: 'Save…' });
  await next.waitFor({ timeout: 3000 }).then(() => next.click(), () => {});
  await page.waitForTimeout(800);
  const names = await page.evaluate(() => (window as unknown as { __names: string[] }).__names);
  const want = `${base} – ${p.ending}`;
  check(names[0] === `${want}.json`, `${p.what}: Save Design offers "${want}.json" (got "${names[0]}")`);
  if (p.txt) check(names[1] === `${want}.txt`, `${p.what}: the bench sheet is "${want}.txt" (got "${names[1]}")`);
  check(errors.length === 0 && alerts.length === 0, `${p.what}: no page errors or alerts${errors.length + alerts.length ? ` — ${[...errors, ...alerts].slice(0, 3).join(' | ')}` : ''}`);
  await context.close();
  return lines;
}

async function main() {
  if (!BASE) { skip('browser: no app to test (run it through npm test, or set VASEMAKER_URL)'); console.log('\nALL PASS'); return; }
  const browser = await launchBrowser();
  const dir = mkdtempSync(join(tmpdir(), 'vasemaker-names-'));
  const results = await Promise.all(PAGES.map((p) => testPage(browser, p, dir).catch((e: Error) => [`FAIL  ${p.what}: THREW ${e.message.split('\n')[0]}`])));
  const lines = results.flat();
  for (const l of lines) console.log(l);
  const fails = lines.filter((l) => l.startsWith('FAIL')).length;
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
main();
