/**
 * Browser: on each page, after loading a public test design —
 *   a switch then ⌘Z puts the page's saved settings back exactly; ⌘⇧Z redoes it;
 *   ⌘Z pressed straight after a change (inside the 300 ms history debounce) works too;
 *   three changes then Revert to Saved returns to the design as loaded;
 *   Reset leaves no amber "changed" dot, and ⌘Z undoes the Reset.
 * The page's own storage key is compared (tests/lib/browser.ts KEY).
 */
import { join } from 'path';
import { type Browser, type Page, type Locator } from '@playwright/test';
import { FIXTURES, skip } from '../lib/designs';
import { BASE, KEY, openWatched, storedState, same, firstDiff, loadFile, launchBrowser } from '../lib/browser';


const DESIGN: Record<string, string> = {
  '/': 'vases/2026-07-tumbler3.json',
  '/mold': 'molds/tumbler3-halves.mold.json',
  '/handle': 'handles/tumbler3.json',
  '/sprig': 'sprigs/dcitylogo1-43x41.json',
};

/** The page's saved settings (params only: names and flags are not undone). */
const params = async (page: Page, route: string, waitMs?: number) =>
  ((await storedState(page, waitMs))[KEY[route]] as { params?: unknown } | null)?.params;

/** Changes the design: clicks switches from the n-th usable one (visible, not
 *  greyed) until one changes the saved settings — many only change the view
 *  (all of the Handle page's do) — and failing that moves a slider to an end.
 *  Returns the settings after the change and the control, or null. */
async function changeSomething(page: Page, route: string, n = 0): Promise<{ after: unknown; redo: () => Promise<void> } | null> {
  const before = await params(page, route, 0);
  const usable = async (sel: string) => {
    const out: Locator[] = [];
    for (const s of await page.locator(sel).all()) if (await s.isVisible() && await s.evaluate((e) => !e.closest('fieldset[disabled]') && !(e as HTMLInputElement).disabled)) out.push(s);
    return out;
  };
  const switches = await usable('button.w-8.h-4.rounded-full');
  for (let i = 0; i < switches.length; i++) {
    const s = switches[(n + i) % switches.length];
    if (!await s.isVisible()) continue;
    await s.click();
    const after = await params(page, route, 700);
    if (!same(after, before)) return { after, redo: () => s.click() };
    await s.click();               // a view switch: put it back, try the next
    await page.waitForTimeout(400);
  }
  const sliders = await usable('input[type=range]');
  for (let i = 0; i < sliders.length; i++) {
    const s = sliders[(n + i) % sliders.length];
    const v = await s.inputValue(), lo = await s.getAttribute('min') ?? '0', hi = await s.getAttribute('max') ?? '1';
    const to = Number(v) === Number(hi) ? lo : hi;
    await s.fill(to);
    const after = await params(page, route, 700);
    if (!same(after, before)) return { after, redo: () => s.fill(to) };
  }
  return null;
}

/** One page's checks; the four pages run at once, their lines printed in order. */
async function testPage(browser: Browser, route: string): Promise<string[]> {
  const lines: string[] = [];
  const check = (ok: boolean, msg: string) => lines.push(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  const undoKey = 'ControlOrMeta+z', redoKey = 'ControlOrMeta+Shift+z';
  const { context, page, errors, alerts } = await openWatched(browser);
  const at = route === '/' ? 'Vase' : route.slice(1, 2).toUpperCase() + route.slice(2);
  const t0 = Date.now();
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await loadFile(page, join(FIXTURES, DESIGN[route]));
  const loaded = await params(page, route);
  check(loaded != null, `${at}: the design loaded and was saved`);

  // ⌘Z / ⌘⇧Z after a pause (the normal case).
  const found = await changeSomething(page, route);
  check(found != null, `${at}: a switch or slider changes the settings`);
  if (!found) { await context.close(); return lines; }
  const changed = found.after;
  await page.waitForTimeout(500);
  await page.keyboard.press(undoKey);
  const undone = await params(page, route);
  check(same(undone, loaded), `${at}: ⌘Z puts them back${same(undone, loaded) ? '' : ` — ${firstDiff(undone, loaded)}`}`);
  await page.keyboard.press(redoKey);
  const redone = await params(page, route);
  check(same(redone, changed), `${at}: ⌘⇧Z redoes it${same(redone, changed) ? '' : ` — ${firstDiff(redone, changed)}`}`);
  // The ↷ button too: a key event made by Playwright may differ from a real keyboard's.
  await page.keyboard.press(undoKey);
  await params(page, route);
  await page.getByRole('button', { name: '↷' }).click();
  const byButton = await params(page, route);
  check(same(byButton, changed), `${at}: the ↷ button redoes it${same(byButton, changed) ? '' : ` — ${firstDiff(byButton, changed)}`}`);
  await page.keyboard.press(undoKey);
  await params(page, route);

  // ⌘Z straight after a change, before the history has recorded it.
  await found.redo();
  await page.waitForTimeout(50);
  await page.keyboard.press(undoKey);
  const quick = await params(page, route);
  check(same(quick, loaded), `${at}: ⌘Z straight after a change undoes it${same(quick, loaded) ? '' : ` — ${firstDiff(quick, loaded)}`}`);

  // Three changes, then Revert to Saved.
  await changeSomething(page, route, 0);
  await changeSomething(page, route, 3);
  const slider = page.locator('input[type=range]:visible:enabled').first();
  const max = Number(await slider.getAttribute('max') ?? 1);
  await slider.fill(String(max));
  const messy = await params(page, route);
  check(!same(messy, loaded), `${at}: three changes made`);
  await page.getByRole('button', { name: 'Revert to Saved' }).click();
  const reverted = await params(page, route);
  check(same(reverted, loaded), `${at}: Revert to Saved returns to the design as loaded${same(reverted, loaded) ? '' : ` — ${firstDiff(reverted, loaded)}`}`);

  // Reset: no amber dot left, and ⌘Z undoes it. (The Vase page has no Reset.)
  const reset = page.getByRole('button', { name: /^Reset (All|Mold) Settings$/ });
  if (await reset.count()) {
    await changeSomething(page, route, 0);
    const before = await params(page, route);
    await reset.first().click();
    await page.waitForTimeout(800);
    const dots = await page.locator('.bg-amber-400:visible').evaluateAll((es) =>
      es.map((e) => `${(e.closest('summary') ?? e.closest('div'))?.textContent?.trim().slice(0, 30)} (${e.getAttribute('title')?.slice(0, 50)})`));
    check(dots.length === 0, `${at}: after ${await reset.first().textContent()}, no amber "changed" dot is left${dots.length ? ` — still on: ${dots.join(', ')}` : ''}`);
    await page.keyboard.press(undoKey);
    const back = await params(page, route);
    check(same(back, before), `${at}: ⌘Z undoes the Reset${same(back, before) ? '' : ` — ${firstDiff(back, before)}`}`);
  }

  check(errors.length === 0 && alerts.length === 0, `${at}: no page errors or alerts (${((Date.now() - t0) / 1000).toFixed(0)} s)${errors.length + alerts.length ? ` — ${[...errors, ...alerts].slice(0, 3).join(' | ')}` : ''}`);
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
