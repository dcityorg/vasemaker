/**
 * Browser: the Load list (Gary, 2026-11-11, local-docs/save-design-plan.md).
 *  A. Mold tab, a mold file: Vase, Mold, Handle ticked; no sprig/mark on its
 *     vase, so those are greyed. Untick Handle → the open handle is untouched,
 *     the vase is the file's.
 *  B. An OLD mold file (settings only): Vase and Handle greyed "not in this file".
 *  C. A handle file on the Vase tab: the list with its one line; Load puts it on
 *     the Handle page — and it is still there when that page opens (the page
 *     reads its store from storage; a load into a store not yet read would be
 *     overwritten). CONTROL: the vase is unchanged.
 *  D. A vase carrying a sprig, on the Sprig page: Vase ticked, the sprig on it
 *     offered unticked; tick only the sprig → it lands on the Sprig tab, the
 *     vase stays.
 *  E. Unsaved work: a changed vase, then a mold file → amber "unsaved" line and
 *     "Save mine, then load"; untick Vase → instead the amber "made for …" line.
 *  F. Mold Save always carries the handle, even on Pour 3-Pc (Gary 2026-11-11).
 *  G. A vase file on the Vase tab still loads straight away (no list).
 *  H. The storage trap: the Mold page never reads the sprig store, so a sprig
 *     ticked there must still be on the Sprig page when it opens (each store
 *     is read from storage before a piece goes in). Measured with that read
 *     removed: this check fails.
 * Run: npm run test:browser -- load-list
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { type Browser, type Page } from '@playwright/test';
import { FIXTURES, skip } from '../lib/designs';
import { BASE, KEY, openWatched, launchBrowser, storedState, same } from '../lib/browser';

type Check = (ok: boolean, msg: string) => void;
const list = (page: Page) => page.locator('[data-load-list]');
const pick = (page: Page, file: string) => page.locator('input[type=file][accept=".json"]').first().setInputFiles(file);
async function rows(page: Page) {
  await list(page).waitFor({ timeout: 4000 }).catch(() => {});
  return list(page).locator('[data-piece]').evaluateAll((els) => els.map((e) => ({
    key: e.getAttribute('data-piece'), present: e.getAttribute('data-present') === '1',
    ticked: (e.querySelector('input') as HTMLInputElement).checked, text: (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
  })));
}
const fmt = (r: Awaited<ReturnType<typeof rows>>) => r.map((x) => `${x.key}${x.present ? '' : '(grey)'}${x.ticked ? '✓' : ''}`).join(' ');
const press = (page: Page, name: string) => list(page).getByRole('button', { name, exact: true }).click();
const untick = (page: Page, key: string) => list(page).locator(`[data-piece="${key}"] input`).click();
const stored = async (page: Page, route: string) => (await storedState(page))[KEY[route]] as { settingsName?: string; params?: unknown } | undefined;

async function caseA_B(browser: Browser, dir: string, check: Check) {
  const { context, page, errors } = await openWatched(browser);
  await page.goto(BASE + '/mold', { waitUntil: 'networkidle' });
  const handleBefore = await stored(page, '/handle');
  await pick(page, join(FIXTURES, 'molds/tumbler3-halves.mold.json'));
  const r = await rows(page);
  check(fmt(r) === 'vase✓ mold✓ handle✓ sprig(grey) mark(grey)', `A: mold file → ${fmt(r)}`);
  check(r.find((x) => x.key === 'mold')?.text.includes('Split Halves') ?? false, `A: the Mold line names its style ("${r.find((x) => x.key === 'mold')?.text}")`);
  await untick(page, 'handle');
  await press(page, 'Load');
  await page.waitForTimeout(800);
  const handleAfter = await stored(page, '/handle');
  check(same(handleAfter, handleBefore), 'A: Handle unticked → the open handle is untouched');
  const vase = (await storedState(page))[KEY['/']] as { designName?: string } | undefined;
  const fileVaseName = JSON.parse(readFileSync(join(FIXTURES, 'molds/tumbler3-halves.mold.json'), 'utf8')).vaseName;
  check(vase?.designName === fileVaseName, `A: the vase is the file's ("${vase?.designName}")`);

  await pick(page, join(FIXTURES, 'molds/tumbler2-onepiece.mold.json'));
  const r2 = await rows(page);
  check(fmt(r2) === 'vase(grey) mold✓ handle(grey) sprig(grey) mark(grey)', `B: old settings-only mold file → ${fmt(r2)}`);
  check(r2.filter((x) => x.key === 'vase' || x.key === 'handle').every((x) => x.text.includes('not in this file')), 'B: missing Vase and Handle say "not in this file (keeps yours)"');
  await press(page, 'Cancel');
  check(errors.length === 0, `A/B: no page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await context.close();
}

async function caseC(browser: Browser, dir: string, check: Check) {
  const { context, page, errors } = await openWatched(browser);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const vaseBefore = await stored(page, '/');
  const file = join(dir, 'Loop Test – Handle.json');
  writeFileSync(file, readFileSync(join(FIXTURES, 'handles/c1.json')));
  await pick(page, file);
  const r = await rows(page);
  check(fmt(r) === 'handle✓', `C: a handle file on the Vase tab → ${fmt(r)}`);
  await press(page, 'Load');
  await page.waitForTimeout(800);
  check(same(await stored(page, '/'), vaseBefore), 'C: CONTROL the vase is unchanged');
  await page.getByRole('link', { name: 'Handle', exact: true }).click();
  await page.waitForURL('**/handle');
  await page.waitForTimeout(1500);
  const row = (await page.locator('div', { has: page.getByText('Handle Name:', { exact: true }) }).last().innerText()).replace(/\s+/g, ' ');
  check(row.includes('Loop Test'), `C: the Handle page opens with it ("${row.trim()}")`);
  const want = JSON.parse(readFileSync(join(FIXTURES, 'handles/c1.json'), 'utf8')).settings;
  const got = (await stored(page, '/handle'))?.params as Record<string, unknown> | undefined;
  check(!!got && Object.keys(want).every((k) => same(got[k], want[k])), 'C: …with the file\'s settings, still there after the page read its storage');
  check(errors.length === 0, `C: no page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await context.close();
}

async function caseD(browser: Browser, dir: string, check: Check) {
  const { context, page, errors } = await openWatched(browser);
  await page.goto(BASE + '/sprig', { waitUntil: 'networkidle' });
  const vaseBefore = await stored(page, '/');
  const v = JSON.parse(readFileSync(join(FIXTURES, 'vases/2026-07-tumbler3.json'), 'utf8'));
  const sprig = JSON.parse(readFileSync(join(FIXTURES, 'sprigs/dcitylogo1-43x41.json'), 'utf8')).settings;
  v.textures = { ...(v.textures ?? {}), enabled: true, sprig: { enabled: true, style: 'raised', depth: 2, size: 100, heightPct: 40, angle: -90, tilt: 0, copies: 1, sprig, sprigName: 'Logo On Vase' } };
  const file = join(dir, 'Sprigged – Vase.json');
  writeFileSync(file, JSON.stringify(v));
  await pick(page, file);
  const r = await rows(page);
  check(fmt(r) === 'vase✓ sprig', `D: a vase with a sprig, on the Sprig page → ${fmt(r)}`);
  check(r.find((x) => x.key === 'sprig')?.text.includes('Logo On Vase (the one on the vase)') ?? false, `D: the sprig line names it, "the one on the vase"`);
  await untick(page, 'vase');
  await untick(page, 'sprig');
  await press(page, 'Load');
  await page.waitForTimeout(800);
  const s = await stored(page, '/sprig');
  check(s?.settingsName === 'Logo On Vase', `D: the sprig lands on the Sprig tab ("${s?.settingsName}")`);
  check(same(await stored(page, '/'), vaseBefore), 'D: CONTROL Vase unticked → the vase is unchanged');
  check(errors.length === 0, `D: no page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await context.close();
}

async function caseH(browser: Browser, dir: string, check: Check) {
  const { context, page, errors } = await openWatched(browser);
  const sprig = JSON.parse(readFileSync(join(FIXTURES, 'sprigs/dcitylogo1-43x41.json'), 'utf8')).settings;
  // An older sprig already stored: what a store not yet read would come back as.
  await page.goto(BASE + '/mold', { waitUntil: 'networkidle' });
  await page.evaluate((v) => localStorage.setItem('vasemaker-sprig-settings', v), JSON.stringify({ settingsName: 'Old Stored Sprig', params: sprig, savedParams: sprig }));
  await page.reload({ waitUntil: 'networkidle' });   // a full load: the Mold page reads only its own stores
  const m = JSON.parse(readFileSync(join(FIXTURES, 'molds/tumbler3-halves.mold.json'), 'utf8'));
  m.vase.textures = { ...(m.vase.textures ?? {}), sprig: { enabled: false, style: 'raised', depth: 2, size: 100, heightPct: 40, angle: -90, tilt: 0, copies: 1, sprig, sprigName: 'From The Mold Page' } };
  const file = join(dir, 'Trap – Split Halves.json');
  writeFileSync(file, JSON.stringify(m));
  await pick(page, file);
  await rows(page);
  await untick(page, 'vase'); await untick(page, 'mold'); await untick(page, 'handle'); await untick(page, 'sprig');
  await press(page, 'Load');
  await page.waitForTimeout(1200);
  await page.getByRole('link', { name: 'Sprig/Mark', exact: true }).click();
  await page.waitForURL('**/sprig');
  await page.waitForTimeout(1500);
  const row = (await page.locator('div', { has: page.getByText('Sprig Name:', { exact: true }) }).last().innerText()).replace(/\s+/g, ' ');
  check(row.includes('From The Mold Page'), `H: a sprig loaded on the Mold page is on the Sprig page when it opens ("${row.trim()}")`);
  check(errors.length === 0, `H: no page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await context.close();
}

async function caseE_G(browser: Browser, dir: string, check: Check) {
  const { context, page, errors } = await openWatched(browser);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  // G: a vase file on the Vase tab loads straight away.
  await pick(page, join(FIXTURES, 'vases/2026-02-swirl1.json'));
  await page.waitForTimeout(600);
  check(!(await list(page).isVisible()), 'G: a vase file on the Vase tab loads straight away (no list)');
  // E: change the vase (a slider nudge), then a mold file.
  const slider = page.locator('input[type=range]').first();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  await pick(page, join(FIXTURES, 'molds/tumbler3-halves.mold.json'));
  await list(page).waitFor({ timeout: 4000 }).catch(() => {});
  const amber = async () => (await list(page).locator('[data-amber]').allInnerTexts()).join(' | ');
  const a1 = await amber();
  const saveMine = await list(page).getByRole('button', { name: 'Save mine, then load' }).isVisible().catch(() => false);
  check(/open vase has unsaved changes/.test(a1) && saveMine, `E: changed vase → amber "${a1}", and Save mine, then load`);
  await untick(page, 'vase');
  const a2 = await amber();
  check(!/vase has unsaved/.test(a2) && /This mold was made for .+; it will be fitted to the vase you have open/.test(a2), `E: Vase unticked → "${a2}"`);
  await press(page, 'Cancel');
  check(errors.length === 0, `E/G: no page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await context.close();
}

async function caseF(browser: Browser, check: Check) {
  const { context, page, errors } = await openWatched(browser);
  await context.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & { __files: Record<string, string> };
    w.__files = {};
    w.showSaveFilePicker = async (opts: { suggestedName: string }) => ({
      kind: 'file', name: opts.suggestedName,
      createWritable: async () => ({ write: async (b: Blob) => { w.__files[opts.suggestedName] = await b.text(); }, close: async () => {} }),
    });
  });
  await page.goto(BASE + '/mold', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Pour 3-Pc', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Save Design', exact: true }).click();
  const named = page.getByRole('button', { name: /^Continue/ });
  if (await named.waitFor({ timeout: 1500 }).then(() => true, () => false)) {
    await page.locator('input[placeholder="Mold name"]').fill('Handle Carry');
    await named.click();
  }
  const also = page.getByRole('button', { name: /^Save mold only|^Just the mold/ });
  await also.first().waitFor({ timeout: 1500 }).then(() => also.first().click(), () => {});
  const next = page.getByRole('button', { name: 'Save…' });
  await next.waitFor({ timeout: 2500 }).then(() => next.click(), () => {});
  await page.waitForTimeout(800);
  const files = await page.evaluate(() => (window as unknown as { __files: Record<string, string> }).__files);
  const jsonName = Object.keys(files).find((n) => n.endsWith('– Pour 3-Pc.json'));
  const saved = jsonName ? JSON.parse(files[jsonName]) : null;
  check(!!saved && saved.settings?.moldStyle === 'pourThreePiece' && !!saved.handle && typeof saved.handleName === 'string',
    `F: Pour 3-Pc Save carries the handle (${jsonName ?? `no file: ${Object.keys(files).join(', ')}`})`);
  check(errors.length === 0, `F: no page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await context.close();
}

async function main() {
  if (!BASE) { skip('browser: no app to test (run it through npm test, or set VASEMAKER_URL)'); console.log('\nALL PASS'); return; }
  const browser = await launchBrowser();
  const dir = mkdtempSync(join(tmpdir(), 'vasemaker-loadlist-'));
  const results = await Promise.all([
    ['A/B', (c: Check) => caseA_B(browser, dir, c)], ['C', (c: Check) => caseC(browser, dir, c)],
    ['D', (c: Check) => caseD(browser, dir, c)], ['H', (c: Check) => caseH(browser, dir, c)], ['E/G', (c: Check) => caseE_G(browser, dir, c)], ['F', (c: Check) => caseF(browser, c)],
  ].map(async ([name, run]) => {
    const lines: string[] = [];
    const check: Check = (ok, msg) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
    await (run as (c: Check) => Promise<void>)(check).catch((e: Error) => lines.push(`FAIL  ${name}: THREW ${e.message.split('\n')[0]}`));
    return lines;
  }));
  const lines = results.flat();
  for (const l of lines) console.log(l);
  const fails = lines.filter((l) => l.startsWith('FAIL')).length;
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
main();
