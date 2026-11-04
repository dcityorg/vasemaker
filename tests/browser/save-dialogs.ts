/**
 * Browser: Save Design on Mold, Handle and Sprig saves a .json and then its
 * bench sheet .txt — two save dialogs in a row. Chrome opens one only within
 * ~5 s of a click, so once the user has spent longer choosing a folder for the
 * .json, the .txt's dialog is refused. Before 2026-11-04 the .txt then fell
 * back to a plain download into Chrome's own folder (Gary: "the .txt doesn't
 * remember that folder").
 *
 * Chrome's dialog is replaced by a stand-in that refuses without a fresh
 * click, as Chrome does, and takes 6 s over the .json (the user choosing a
 * folder). Checked: the "Save the next file" box appears, its Save… opens the
 * .txt dialog in the .json's folder, and nothing goes to plain downloads.
 */
import { join } from 'path';
import { type Browser } from '@playwright/test';
import { FIXTURES, skip } from '../lib/designs';
import { BASE, openWatched, loadFile, launchBrowser } from '../lib/browser';

const DESIGN: Record<string, string> = {
  '/mold': 'molds/tumbler3-halves.mold.json',
  '/handle': 'handles/tumbler3.json',
  '/sprig': 'sprigs/dcitylogo1-43x41.json',
};

interface Call { name: string; startIn: string | null; clicked: boolean }

async function testPage(browser: Browser, route: string): Promise<string[]> {
  const lines: string[] = [];
  const check = (ok: boolean, msg: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  const { context, page, errors, alerts } = await openWatched(browser);
  const at = route.slice(1, 2).toUpperCase() + route.slice(2);
  await context.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & { __calls: Call[] };
    w.__calls = [];
    w.showSaveFilePicker = async (opts: { suggestedName: string; startIn?: { name: string } }) => {
      const clicked = navigator.userActivation.isActive;
      w.__calls.push({ name: opts.suggestedName, startIn: opts.startIn?.name ?? null, clicked });
      if (!clicked) throw new DOMException('Must be handling a user gesture to show a file picker.', 'SecurityError');
      if (opts.suggestedName.endsWith('.json')) await new Promise((r) => setTimeout(r, 6000));
      return { kind: 'file', name: opts.suggestedName, createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
    };
  });
  const downloads: string[] = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));

  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await loadFile(page, join(FIXTURES, DESIGN[route]));
  await page.getByRole('button', { name: 'Save Design', exact: true }).click();
  // Hands off for 7 s: every Playwright look at the page (a locator's wait, an
  // evaluate) counts as a fresh click to Chrome and would keep the dialog
  // allowed, hiding the bug. Measured 2026-11-04.
  await page.waitForTimeout(7000);
  const box = page.getByRole('heading', { name: 'Save the next file' });
  const shown = await box.waitFor({ timeout: 12_000 }).then(() => true, () => false);
  check(shown, `${at}: after 6 s in the .json dialog, the "Save the next file" box appears`);
  if (shown) await page.getByRole('button', { name: 'Save…' }).click();
  await page.waitForTimeout(500);
  const calls = await page.evaluate(() => (window as unknown as { __calls: Call[] }).__calls);
  const json = calls.find((c) => c.name.endsWith('.json') && c.clicked);
  const txt = calls.filter((c) => c.name.endsWith('.txt') && c.clicked);
  check(!!json, `${at}: the .json dialog opened`);
  check(txt.length === 1 && txt[0].startIn === json?.name,
    `${at}: the .txt dialog opened once, in the .json's folder${txt.length ? ` (starts in "${txt[0].startIn}")` : ''}`);
  check(downloads.length === 0, `${at}: nothing fell back to a plain download${downloads.length ? ` — ${downloads.join(', ')}` : ''}`);
  check(errors.length === 0 && alerts.length === 0, `${at}: no page errors or alerts${errors.length + alerts.length ? ` — ${[...errors, ...alerts].slice(0, 3).join(' | ')}` : ''}`);
  await context.close();
  return lines;
}

async function main() {
  if (!BASE) { skip('browser: no app to test (run it through npm test, or set VASEMAKER_URL)'); console.log('\nALL PASS'); return; }
  const browser = await launchBrowser();
  const results = await Promise.all(Object.keys(DESIGN).map((route) => testPage(browser, route).catch((e: Error) =>
    [`FAIL  ${route}: THREW ${e.message.split('\n')[0]}`])));
  const lines = results.flat();
  for (const l of lines) console.log(l);
  const fails = lines.filter((l) => l.startsWith('FAIL')).length;
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
main();
