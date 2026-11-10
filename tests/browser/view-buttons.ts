/**
 * Browser: the camera's cube and view buttons on the whole-vase views (Gary,
 * 2026-11-09). The camera is read back from where RememberCamera keeps it.
 *  - Vase page: only Home until something is shown; Show Handle, the Sprig
 *    texture and Seams bring Handle, Sprig and Seam. Handle stands 90°
 *    clockwise of the handle (Mold page Seam Angle 30° → bearing -60°), so it
 *    sticks out to the right; Sprig is level with the sprig at its Around and
 *    Height; Seam goes to the nearest Thirds seam, then the next one round;
 *    Home looks from the front (−y), tilted down as the starting view, at its target;
 *  - the cube: clicked from the Sprig view (bearing -150°) it squares the view
 *    to the nearest face, Left (-x);
 *  - Sprig page, On Vase: the same buttons, with its own Around.
 * Run: npm run test:browser -- view-buttons
 */
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { type Page } from '@playwright/test';
import { FIXTURES, skip } from '../lib/designs';
import { BASE, KEY, openWatched, loadFile, launchBrowser } from '../lib/browser';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

type Cam = { p: [number, number, number]; t: [number, number, number] };
async function camera(page: Page, id: string): Promise<{ bearing: number; rise: number; t: number[]; dist: number }> {
  await page.waitForTimeout(400);
  const c = await page.evaluate((k) => JSON.parse(sessionStorage.getItem(k) ?? 'null'), `vasemaker-camera-${id}`) as Cam | null;
  if (!c) return { bearing: NaN, rise: NaN, t: [], dist: NaN };
  const o = c.p.map((v, i) => v - c.t[i]);
  const flat = Math.hypot(o[0], o[1]);
  return { bearing: Math.round((Math.atan2(o[1], o[0]) * 180) / Math.PI * 10) / 10, rise: o[2] / flat, t: c.t.map((v) => Math.round(v * 10) / 10), dist: Math.hypot(...o) };
}
const near = (a: number, b: number, tol = 0.2) => Math.abs(((a - b + 540) % 360) - 180) < tol;
const buttons = async (page: Page) => (await page.locator('button[aria-label]').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label'))))
  .filter((l) => ['Home', 'Handle', 'Sprig', 'Seam'].includes(l ?? ''));
const press = (page: Page, name: string) => page.locator(`button[aria-label="${name}"]`).click();

async function main() {
  if (!BASE) { skip('browser: no app to test (run it through npm test, or set VASEMAKER_URL)'); console.log('\nALL PASS'); return; }
  const browser = await launchBrowser();
  const { context, page, errors, alerts } = await openWatched(browser);

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  // The handle's angle is the Mold page's current style's Seam Angle.
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({
    settingsName: 'mold design', params: { moldStyle: 'splitHalves', seamAngle: 30 },
    styleParams: { splitHalves: { moldStyle: 'splitHalves', seamAngle: 30 }, splitThirds: { moldStyle: 'splitThirds', seamAngle: 25 } },
  })), KEY['/mold']);
  await page.reload({ waitUntil: 'networkidle' });
  const v = JSON.parse(readFileSync(join(FIXTURES, 'vases/2026-07-tumbler3.json'), 'utf8'));
  v.textures = { ...(v.textures ?? {}), enabled: true, sprig: { enabled: false, style: 'raised', depth: 2, size: 100, heightPct: 40, angle: -150, tilt: 0, copies: 1, sprig: null, sprigName: '' } };
  const file = join(tmpdir(), 'vasemaker-view-buttons-test.json');
  writeFileSync(file, JSON.stringify(v));
  await loadFile(page, file);
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  const H = v.height as number;

  const b0 = await buttons(page);
  check(b0.join() === 'Home', `Vase page, nothing shown: only Home (${b0})`);

  await page.locator('div', { has: page.getByText('Show Handle', { exact: true }) }).last().locator('button').first().click();
  const seams = page.locator('select', { has: page.locator('option[value="thirds"]') }).first();
  await seams.selectOption('thirds');
  const b1 = await buttons(page);
  check(b1.join() === 'Home,Handle,Seam', `Vase page, Show Handle + Seams: Home, Handle, Seam (${b1})`);

  // Nothing has moved the camera yet, so nothing is stored: the page's starting
  // camera is [80, 80, 120] looking at [0, 0, 50].
  const start = { dist: Math.hypot(80, 80, 70) };
  await press(page, 'Handle');
  const h = await camera(page, 'vase');
  await page.screenshot({ path: 'test-results/view-buttons-handle.png' }); // to look at: the handle on the right
  check(near(h.bearing, -60) && Math.abs(h.dist - start.dist) < 0.5 && Math.abs(h.t[2] - H / 2) < 0.2,
    `Handle: bearing ${h.bearing}° (handle at 30°, so -60° puts it on the right), zoom kept (${start.dist.toFixed(1)} → ${h.dist.toFixed(1)}), centred at ${h.t[2]} = H/2`);

  await press(page, 'Seam');
  const s1 = await camera(page, 'vase');
  // Thirds seams at 25°: 25, 145, -95. From -60 the nearest is -95; then 25, then 145.
  await press(page, 'Seam');
  const s2 = await camera(page, 'vase');
  await press(page, 'Seam');
  const s3 = await camera(page, 'vase');
  check(near(s1.bearing, -95) && near(s2.bearing, 25) && near(s3.bearing, 145),
    `Seam: nearest -95°, then round to 25°, 145° (${s1.bearing}, ${s2.bearing}, ${s3.bearing})`);

  // Sprig texture on (Around -150, Height 40 %): the Sprig button comes.
  const loaded = { ...v, textures: { ...v.textures, sprig: { ...v.textures.sprig, enabled: true } } };
  writeFileSync(file, JSON.stringify(loaded));
  await loadFile(page, file);
  await page.waitForTimeout(800);
  const b2 = await buttons(page);
  check(b2.join() === 'Home,Handle,Sprig,Seam', `Vase page, + Sprig texture: Home, Handle, Sprig, Seam (${b2})`);
  await press(page, 'Sprig');
  const sp = await camera(page, 'vase');
  check(near(sp.bearing, -150) && Math.abs(sp.rise) < 1e-3 && Math.abs(sp.t[2] - 0.4 * H) < 0.2,
    `Sprig: bearing ${sp.bearing}° = Around, level (rise ${sp.rise.toFixed(4)}), looking at z ${sp.t[2]} = 40 % of ${H}`);

  // The cube: click its middle, which faces the camera; -150° is nearest the Left face (-x).
  const canvas = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(canvas!.x + canvas!.width - 70, canvas!.y + 70);
  const cube = await camera(page, 'vase');
  check(near(cube.bearing, 180, 0.5) && Math.abs(cube.rise) < 1e-3, `Cube from -150°: squared to the Left face (bearing ${cube.bearing}°, rise ${cube.rise.toFixed(4)})`);

  await press(page, 'Home');
  const home = await camera(page, 'vase');
  // From the front (−y), tilted down as the starting view [80, 80, 120] → [0, 0, 50] is: rise 70/113.1.
  check(near(home.bearing, -90) && Math.abs(home.rise - 70 / Math.hypot(80, 80)) < 0.01 && home.t.join() === '0,0,50',
    `Home: from the front, bearing ${home.bearing}°, rise ${home.rise.toFixed(3)}, target ${home.t}`);

  // Sprig page, On Vase
  await page.getByRole('link', { name: 'Sprig/Mark', exact: true }).click();
  await page.waitForURL('**/sprig');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'On Vase', exact: true }).click();
  await page.waitForTimeout(800);
  const b3 = await buttons(page);
  check(b3.join() === 'Home,Sprig,Seam', `Sprig page, On Vase: Home, Sprig, Seam (no handle shown there) (${b3})`);
  // Its own Around, set by the sidebar's snap: Thirds at 25° from -90 → the piece centre -35.
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  await page.getByRole('button', { name: 'Centre on a piece' }).click();
  await press(page, 'Seam');
  await press(page, 'Sprig');
  const ss = await camera(page, 'sprig-vase');
  check(near(ss.bearing, -35) && Math.abs(ss.rise) < 1e-3, `Sprig page: Sprig faces its own Around, -35° after Centre on a piece (bearing ${ss.bearing}°, level)`);

  check(errors.length === 0 && alerts.length === 0, `no page errors or alerts${errors.length + alerts.length ? ` — ${[...errors, ...alerts].slice(0, 3).join(' | ')}` : ''}`);
  await context.close();
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
main();
