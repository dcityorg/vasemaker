/**
 * Browser: seam lines and the sprig's snap buttons (Gary, 2026-11-09).
 * The Mold page's per-style Seam Angles are seeded (Split Thirds 25°), then:
 *  - Vase page: View → Display → Seams = Split Thirds draws the lines (sky-blue
 *    pixels in the 3D view; CONTROL: none with Seams off), and Textures →
 *    Sprig's "On a seam" / "Centre on a piece" set Around to the nearest
 *    seam / centre for 25° (-90 → -95, then -35 or -155). With Seams off the buttons
 *    give way to a line saying where to turn them on;
 *  - Sprig page, On Vase: the choice carried over; "Centre on a piece" sets
 *    its own Around (-90 → -35);
 *  - another browser tab sets Split Thirds to 10° in storage: this tab's
 *    "On a seam" then goes to 10°, where the stale 25° would give 25°.
 */
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { type Page } from '@playwright/test';
import { FIXTURES, skip } from '../lib/designs';
import { BASE, KEY, openWatched, loadFile, launchBrowser, storedState } from '../lib/browser';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

/** Sky-blue (SEAM_COLOR #38bdf8, shaded) pixels in the page's 3D view (the
 *  largest canvas: the Sprig page keeps a second one). */
async function seamPixels(page: Page): Promise<number> {
  await page.waitForTimeout(1500);
  const canvases = await page.locator('canvas').all();
  const areas = await Promise.all(canvases.map(async (c) => { const b = await c.boundingBox(); return b ? b.width * b.height : 0; }));
  const png = (await canvases[areas.indexOf(Math.max(...areas))].screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gr = d[i + 1], b = d[i + 2];
      if (b > 150 && b - r > 110 && gr - r > 60 && b > gr) n++;
    }
    return n;
  }, png);
}

const openAll = (page: Page) => page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
const seamsSelect = (page: Page) => page.locator('select', { has: page.locator('option[value="thirds"]') });
const stored = async (page: Page, key: string) => (await storedState(page))[key] as { params?: Record<string, unknown> } | undefined;

async function main() {
  if (!BASE) { skip('browser: no app to test (run it through npm test, or set VASEMAKER_URL)'); console.log('\nALL PASS'); return; }
  const browser = await launchBrowser();
  const { context, page, errors, alerts } = await openWatched(browser);

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({
    settingsName: 'mold design', params: { moldStyle: 'pourThreePiece' },
    styleParams: { splitThirds: { moldStyle: 'splitThirds', seamAngle: 25 }, splitHalves: { moldStyle: 'splitHalves', seamAngle: -40 } },
  })), KEY['/mold']);
  await page.reload({ waitUntil: 'networkidle' });
  // A vase with the Sprig texture on at Around -90 (no sprig in it: only the controls are tested).
  const v = JSON.parse(readFileSync(join(FIXTURES, 'vases/2026-07-tumbler3.json'), 'utf8'));
  v.textures = { ...(v.textures ?? {}), enabled: true, sprig: { enabled: true, style: 'raised', depth: 2, size: 100, heightPct: 50, angle: -90, tilt: 0, copies: 1, sprig: null, sprigName: '' } };
  const file = join(tmpdir(), 'vasemaker-seams-test.json');
  writeFileSync(file, JSON.stringify(v));
  await loadFile(page, file);
  await page.waitForTimeout(800);
  await openAll(page);

  check(await page.getByText('Turn on Seams (View → Display)').isVisible(), 'Vase, Seams off: the snap buttons give way to a line saying where to turn them on');
  const off = await seamPixels(page);
  await seamsSelect(page).first().selectOption('thirds');
  const on = await seamPixels(page);
  check(off < 20 && on > 200, `Vase: Seams = Split Thirds draws the lines (${on} seam-blue pixels; CONTROL: ${off} with Seams off)`);

  const around = async () => ((await stored(page, KEY['/']))?.params as { textures?: { sprig?: { angle?: number } } } | undefined)?.textures?.sprig?.angle;
  await page.getByRole('button', { name: 'On a seam' }).click();
  const a1 = await around();
  check(a1 === -95, `Vase: On a seam: Around -90 → ${a1} (the nearest Thirds seam for 25° is -95)`);
  await page.getByRole('button', { name: 'Centre on a piece' }).click();
  const a2 = await around();
  // From a seam the two pieces either side are equally near: either will do.
  check(a2 === -35 || a2 === -155, `Vase: Centre on a piece: → ${a2} (from the -95 seam, -35 or -155, 60° either way)`);

  // Sprig page, On Vase
  await page.getByRole('link', { name: 'Sprig/Mark', exact: true }).click();
  await page.waitForURL('**/sprig');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'On Vase', exact: true }).click();
  await page.waitForTimeout(500);
  await openAll(page);
  const carried = await seamsSelect(page).first().inputValue();
  check(carried === 'thirds', `Sprig page: Seams carried over from the Vase page (${carried})`);
  check(await seamPixels(page) > 200, 'Sprig page, On Vase: the seam lines are drawn');
  await page.getByRole('button', { name: 'Centre on a piece' }).click();
  const s1 = (await stored(page, KEY['/sprig']))?.params?.onVaseAngle;
  check(s1 === -35, `Sprig page: Centre on a piece: its own Around -90 → ${s1}`);

  // Another tab changes the Thirds Seam Angle to 10°.
  const other = await context.newPage();
  await other.goto(BASE + '/', { waitUntil: 'networkidle' });
  await other.waitForTimeout(1500);
  await other.evaluate((k) => {
    const d = JSON.parse(localStorage.getItem(k) ?? '{}');
    d.styleParams.splitThirds.seamAngle = 10;
    localStorage.setItem(k, JSON.stringify(d));
  }, KEY['/mold']);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'On a seam' }).click();
  const s2 = (await stored(page, KEY['/sprig']))?.params?.onVaseAngle;
  check(s2 === 10, `Another tab's Seam Angle 10° reaches this tab: On a seam → ${s2} (stale 25° would give 25)`);
  await other.close();

  check(errors.length === 0 && alerts.length === 0, `no page errors or alerts${errors.length + alerts.length ? ` — ${[...errors, ...alerts].slice(0, 3).join(' | ')}` : ''}`);
  await context.close();
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
main();
