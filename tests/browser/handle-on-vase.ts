/**
 * Browser: the handle on the Vase tab (Gary, 2026-11-11; save-design-plan.md Part 2).
 *  A. Work saved in the browser before the move (the handle in the Mold page's
 *     Split Halves settings + the Handle tab) comes over onto the vase once:
 *     on, at the old Split Angle and Top Below Rim, a copy of the Handle tab's
 *     handle. The Mold tab casts it, and says Split Angle follows the handle.
 *     CONTROL: Split Halves' Handle switch off → the vase's handle is off and
 *     Split Angle is a slider again.
 *  B. Around moved on the Vase tab → the Mold tab's split follows it.
 *  C. The Handle tab's handle differs from the vase's copy → the Mold tab
 *     offers "Use the Handle tab's …"; pressing it copies the handle onto the
 *     vase and the button goes.
 *  D. Split Halves with its Handle switch on but no handle on the vase: a grey
 *     line says to turn one on on the Vase tab; nothing is cast.
 * Run: npm run test:browser -- handle-on-vase
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { type Browser, type Page } from '@playwright/test';
import { FIXTURES, skip } from '../lib/designs';
import { BASE, KEY, openWatched, launchBrowser, storedState } from '../lib/browser';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

const moldFile = JSON.parse(readFileSync(join(FIXTURES, 'molds/tumbler3-halves.mold.json'), 'utf8'));
const loop = JSON.parse(readFileSync(join(FIXTURES, 'handles/c1.json'), 'utf8')).settings;
type VH = { enabled?: boolean; around?: number; topDrop?: number; handle?: Record<string, unknown> | null; handleName?: string };
const vaseHandle = async (page: Page) => ((await storedState(page))[KEY['/']] as { params?: { handle?: VH } } | undefined)?.params?.handle;

/** Storage as an older version left it: no handle on the vase. */
async function seedOld(page: Page, splitHandle: boolean, handle: unknown = loop) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const { handle: _none, ...vase } = moldFile.vase;
  void _none;
  await page.evaluate(([vk, mk, hk, v, h, sh]) => {
    localStorage.clear();
    localStorage.setItem(vk, JSON.stringify({ params: v, designName: 'Tall Tumbler', isDirty: false }));
    const halves = { moldStyle: 'splitHalves', splitHandle: sh, seamAngle: 40, handleTopDrop: 20 };
    localStorage.setItem(mk, JSON.stringify({ settingsName: 'Tall', params: halves, styleParams: { splitHalves: halves } }));
    localStorage.setItem(hk, JSON.stringify({ settingsName: 'Loop', params: h, savedParams: h }));
  }, [KEY['/'], KEY['/mold'], 'vasemaker-handle-settings', vase, handle, splitHandle] as const);
}

async function openMold(page: Page) {
  await page.goto(BASE + '/mold', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);   // the Split Halves build with a handle
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
}

async function caseA_B_C(browser: Browser) {
  const { context, page, errors } = await openWatched(browser);
  await seedOld(page, true);
  await openMold(page);
  const h = await vaseHandle(page);
  check(!!h?.enabled && h.around === 40 && h.topDrop === 20 && h.handleName === 'Loop' && JSON.stringify(h.handle?.spinePoints) === JSON.stringify(loop.spinePoints),
    `A: old browser work → the vase's handle is on at ${h?.around}°, ${h?.topDrop} mm, a copy of "${h?.handleName}"`);
  const follows = await page.locator('[data-split-follows]').innerText().catch(() => '');
  check(/Split Angle 40°/.test(follows), `A: Mold tab: "${follows.slice(0, 60)}…"`);
  const strap = await page.getByText(/^Strap .* mm finished/).isVisible().catch(() => false);
  check(strap, 'A: Split Halves casts the handle (its strap size is shown)');

  // B. Around on the Vase tab → the split follows.
  await page.getByRole('link', { name: 'Vase', exact: true }).click();
  await page.waitForURL(/\/$/);
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  // The Handle section's Around slider (Textures → Sprig has an Around too; it is greyed and earlier).
  const around = page.locator('label', { hasText: /^Around/ }).last().locator('xpath=following-sibling::input[@type="range"][1]');
  await around.fill('90');
  await page.waitForTimeout(800);
  check((await vaseHandle(page))?.around === 90, `B: Around set to 90 on the Vase tab (${(await vaseHandle(page))?.around})`);
  await page.getByRole('link', { name: 'Mold', exact: true }).click();
  await page.waitForURL('**/mold');
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  const follows2 = await page.locator('[data-split-follows]').innerText().catch(() => '');
  check(/Split Angle 90°/.test(follows2), `B: the Mold tab's split follows: "${follows2.slice(0, 40)}…"`);

  // C. The Handle tab's handle changes → the Mold tab offers it.
  check(!(await page.locator('[data-use-handle-tab]').isVisible().catch(() => false)), 'C: CONTROL the same handle on both → no "Use the Handle tab\'s" button');
  await page.evaluate((hk) => {
    const d = JSON.parse(localStorage.getItem(hk) ?? '{}');
    d.params = { ...d.params, width: (d.params.width ?? 10) + 2 }; d.settingsName = 'Wider';
    localStorage.setItem(hk, JSON.stringify(d));
  }, 'vasemaker-handle-settings');
  await openMold(page);
  const btn = page.locator('[data-use-handle-tab]');
  check(await btn.isVisible().catch(() => false), `C: the Handle tab differs → "${(await btn.innerText().catch(() => '')).trim()}"`);
  await btn.click().catch(() => {});
  await page.waitForTimeout(1500);
  const h2 = await vaseHandle(page);
  check(h2?.handleName === 'Wider' && h2.handle?.width === (loop.width ?? 10) + 2 && !(await btn.isVisible().catch(() => false)),
    `C: pressed → the vase's handle is "${h2?.handleName}" (width ${h2?.handle?.width}), the button is gone`);
  check(errors.length === 0, `A–C: no page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await context.close();
}

async function controlsAndD(browser: Browser) {
  const { context, page, errors } = await openWatched(browser);
  await seedOld(page, false);
  await openMold(page);
  const h = await vaseHandle(page);
  check(h?.enabled === false, `A CONTROL: Split Halves' Handle switch was off → the vase's handle is off (${JSON.stringify(h)?.slice(0, 60)})`);
  const slider = await page.locator('label', { hasText: /^Split Angle/ }).count();
  check(slider > 0 && !(await page.locator('[data-split-follows]').count()), 'A CONTROL: Split Angle is a slider again');
  // D. Turn on Split Halves' Handle switch: the vase has none.
  await page.locator('summary', { hasText: /^Handle/ }).locator('button[title^="Off"]').click();
  await page.waitForTimeout(2500);
  check(await page.locator('[data-no-vase-handle]').isVisible().catch(() => false), 'D: Handle on, no handle on the vase → the grey "turn one on on the Vase tab" line');
  check(!(await page.getByText(/^Strap .* mm finished/).isVisible().catch(() => false)), 'D: nothing is cast');
  check(errors.length === 0, `controls/D: no page errors${errors.length ? ` — ${errors[0]}` : ''}`);
  await context.close();
}

async function main() {
  if (!BASE) { skip('browser: no app to test (run it through npm test, or set VASEMAKER_URL)'); console.log('\nALL PASS'); return; }
  const browser = await launchBrowser();
  await caseA_B_C(browser);
  await controlsAndD(browser);
  await browser.close();
  console.log(`\n${fails ? `${fails} FAILED` : 'ALL PASS'}`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
