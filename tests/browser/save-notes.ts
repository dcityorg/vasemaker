/**
 * Browser: what each Save saves, said under the button (Gary, 2026-11-11), and
 * the Mold tab's Bottom Plug (was "Foot Piece").
 *  - every page has the grey line under Load / Save Design, with its own words,
 *    in grey (not amber: it describes, it doesn't warn);
 *  - Split Halves and Split Thirds, vase with a foot, Bottom Plug off: an amber
 *    note says the mold casts a flat bottom; CONTROL: with the plug on, or the
 *    vase's foot off, no note;
 *  - the section is called Bottom Plug and "Foot Piece" is gone from the page.
 * Run: npm run test:browser -- save-notes
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { type Browser, type Page } from '@playwright/test';
import { FIXTURES, skip } from '../lib/designs';
import { BASE, openWatched, loadFile, launchBrowser } from '../lib/browser';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';

const NOTES: [string, string, string?][] = [
  ['/', 'Saves the vase only. To keep its mold and handle too, save on the Mold tab.'],
  ['/mold', 'Saves this mold style with its vase and handle. A sprig or mark is saved only if it is on the vase; save other sprigs and marks on the Sprig/Mark page.'],
  ['/handle', 'Saves this handle only.'],
  ['/sprig', 'Saves this sprig only.'],
  ['/sprig', 'Saves this mark only.', 'Mark'],
];

const note = (page: Page) => page.locator('[data-save-note]').first();

async function testNote(browser: Browser, [route, text, tab]: typeof NOTES[number]): Promise<string[]> {
  const lines: string[] = [];
  const check = (ok: boolean, msg: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  const { context, page, errors } = await openWatched(browser);
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  if (tab) await page.getByRole('button', { name: tab, exact: true }).first().click();
  await page.waitForTimeout(300);
  const got = (await note(page).innerText().catch(() => '')).trim();
  const colour = await note(page).evaluate((el) => getComputedStyle(el).color).catch(() => '');
  const [r, g, b] = (colour.match(/\d+/g) ?? []).map(Number);
  const amberish = r > 200 && g > 120 && b < 80;
  check(got === text, `${route}${tab ? ` ${tab}` : ''}: "${got}"`);
  check(!!colour && !amberish, `${route}${tab ? ` ${tab}` : ''}: the line is grey, not amber (${colour})`);
  check(errors.length === 0, `${route}${tab ? ` ${tab}` : ''}: no page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await context.close();
  return lines;
}

async function testFoot(browser: Browser, dir: string): Promise<string[]> {
  const lines: string[] = [];
  const check = (ok: boolean, msg: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  const { context, page, errors } = await openWatched(browser);
  await page.goto(BASE + '/mold', { waitUntil: 'networkidle' });
  const src = JSON.parse(readFileSync(join(FIXTURES, 'molds/tumbler3-halves.mold.json'), 'utf8'));
  const cases: [string, 'splitHalves' | 'splitThirds', boolean, boolean, boolean][] = [
    // label, style, vase foot, plug, note expected
    ['Split Halves, foot, plug off', 'splitHalves', true, false, true],
    ['CONTROL Split Halves, foot, plug on', 'splitHalves', true, true, false],
    ['Split Thirds, foot, plug off', 'splitThirds', true, false, true],
    ['CONTROL Split Thirds, no foot, plug off', 'splitThirds', false, false, false],
  ];
  for (const [label, style, footOn, plug, want] of cases) {
    const f = structuredClone(src);
    f.vase.bottom = { ...DEFAULT_PARAMETERS.bottom, footOn };
    f.settings.moldStyle = style;
    f.settings.halvesFootPiece = plug;
    f.settings.thirdsFootPiece = plug;
    const file = join(dir, `${label.replace(/[^a-z]+/gi, '-')}.json`);
    writeFileSync(file, JSON.stringify(f));
    await loadFile(page, file);
    await page.waitForTimeout(2500);
    const shown = await page.locator('[data-foot-note]').isVisible().catch(() => false);
    check(shown === want, `${label}: amber flat-bottom note ${want ? 'shown' : 'not shown'}${shown === want ? '' : ` (it was ${shown ? '' : 'not '}shown)`}`);
  }
  const body = await page.locator('[data-sidebar], body').first().innerText();
  check(/Bottom Plug/.test(body) && !/Foot Piece/.test(body), 'the section is "Bottom Plug"; "Foot Piece" is gone');
  check(errors.length === 0, `foot note: no page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await context.close();
  return lines;
}

async function main() {
  if (!BASE) { skip('browser: no app to test (run it through npm test, or set VASEMAKER_URL)'); console.log('\nALL PASS'); return; }
  const browser = await launchBrowser();
  const dir = mkdtempSync(join(tmpdir(), 'vasemaker-notes-'));
  const results = await Promise.all([
    ...NOTES.map((n) => testNote(browser, n).catch((e: Error) => [`FAIL  ${n[0]}: THREW ${e.message.split('\n')[0]}`])),
    testFoot(browser, dir).catch((e: Error) => [`FAIL  foot note: THREW ${e.message.split('\n')[0]}`]),
  ]);
  const lines = results.flat();
  for (const l of lines) console.log(l);
  const fails = lines.filter((l) => l.startsWith('FAIL')).length;
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
main();
