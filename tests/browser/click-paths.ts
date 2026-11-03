/**
 * Deep, browser: seeded random walks across the four tools, the kind of
 * clicking that found v1.57.1's crash. Each walk starts with empty storage
 * and takes STEPS random actions: flip a switch, move a slider, pick from a
 * menu, open or close a box, press a button (style tabs, view buttons,
 * Reset, the Sprig/Mark tabs …), ⌘Z, ⌘⇧Z, Revert to Saved, load a public
 * test design, go to another tool, reload.
 *
 * After every step: no page error, console error, failed request or alert,
 * and the page still shows its side panel and 3D view. At the end of a walk:
 * everything saved survives a reload.
 *
 * Buttons that open a file or save dialog (Load, Save, Export, Capture,
 * Paste) are never pressed — Load goes through the hidden file input.
 * A failure prints its seed and every step; replay one walk with
 *   CLICK_SEEDS=7 npm run test:browser -- click-paths
 */
import { readdirSync } from 'fs';
import { join } from 'path';
import { type Browser, type Locator, type Page } from '@playwright/test';
import { FIXTURES, skip } from '../lib/designs';
import { BASE, PAGES, openWatched, storedState, same, firstDiff, pageAlive, loadFile, rng, launchBrowser } from '../lib/browser';

const SEEDS = (process.env.CLICK_SEEDS ?? '1,2,3,4,5,6').split(',').map(Number);
const STEPS = Number(process.env.CLICK_STEPS ?? 40);
const NEVER = /^(Load|Save|Export|Capture|Paste|💡)|Enlarge/;

const FILES: Record<string, string[]> = Object.fromEntries(Object.entries({
  '/': 'vases', '/mold': 'molds', '/handle': 'handles', '/sprig': 'sprigs',
}).map(([route, dir]) => [route, readdirSync(join(FIXTURES, dir)).filter((f) => f.endsWith('.json') && !f.endsWith('.vase.json')).map((f) => join(FIXTURES, dir, f))]));

/** Visible controls that can be used now (not greyed). */
async function usable(page: Page, selector: string): Promise<Locator[]> {
  const out: Locator[] = [];
  for (const l of await page.locator(selector).all()) {
    if (await l.isVisible().catch(() => false) && await l.evaluate((e) =>
      !e.closest('fieldset[disabled]') && !(e as HTMLButtonElement).disabled && e.getAttribute('aria-disabled') !== 'true').catch(() => false)) out.push(l);
  }
  return out;
}

const route = (page: Page) => new URL(page.url()).pathname;

type Action = (page: Page, r: ReturnType<typeof rng>) => Promise<string>;
const ACTIONS: [number, string, Action][] = [
  [6, 'switch', async (page, r) => {
    const s = await usable(page, 'button.w-8.h-4.rounded-full');
    if (!s.length) return 'no switch';
    const i = r.int(s.length);
    await s[i].click();
    return `switch #${i} "${(await s[i].getAttribute('title'))?.slice(0, 40)}"`;
  }],
  [5, 'slider', async (page, r) => {
    const s = await usable(page, 'input[type=range]');
    if (!s.length) return 'no slider';
    const i = r.int(s.length);
    const [min, max] = [Number(await s[i].getAttribute('min') ?? 0), Number(await s[i].getAttribute('max') ?? 100)];
    const v = +(min + r.next() * (max - min)).toPrecision(3);
    await s[i].fill(String(v));
    return `slider #${i} → ${v}`;
  }],
  [3, 'menu', async (page, r) => {
    const s = await usable(page, 'select');
    if (!s.length) return 'no menu';
    const i = r.int(s.length);
    const opts = await s[i].locator('option:not([disabled])').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    if (!opts.length) return 'no menu option';
    const v = r.pick(opts);
    await s[i].selectOption(v);
    return `menu #${i} → ${v}`;
  }],
  [2, 'box', async (page, r) => {
    const s = await usable(page, 'summary');
    if (!s.length) return 'no box';
    const i = r.int(s.length);
    await s[i].click({ position: { x: 8, y: 8 } });   // the title, not its switch
    return `box "${(await s[i].textContent())?.trim().slice(0, 30)}"`;
  }],
  [4, 'button', async (page, r) => {
    const s = [];
    for (const b of await usable(page, 'button')) {
      const t = (await b.textContent())?.trim() ?? '';
      if (t && !NEVER.test(t) && !(await b.getAttribute('class'))?.includes('rounded-full')) s.push([b, t] as const);
    }
    if (!s.length) return 'no button';
    const [b, t] = r.pick(s);
    await b.click();
    return `button "${t.slice(0, 30)}"`;
  }],
  [2, 'undo', async (page) => { await page.keyboard.press('ControlOrMeta+z'); return '⌘Z'; }],
  [1, 'redo', async (page) => { await page.keyboard.press('ControlOrMeta+Shift+z'); return '⌘⇧Z'; }],
  [1, 'revert', async (page) => { await page.getByRole('button', { name: 'Revert to Saved' }).click(); return 'Revert to Saved'; }],
  [1, 'load', async (page, r) => {
    const f = r.pick(FILES[route(page)] ?? FILES['/']);
    await loadFile(page, f);
    return `load ${f.split('/').pop()}`;
  }],
  [3, 'tool', async (page, r) => {
    const label = r.pick(['Vase', 'Handle', 'Mold', 'Sprig/Mark'].filter((l) => !page.url().endsWith({ Vase: '/', Handle: '/handle', Mold: '/mold', 'Sprig/Mark': '/sprig' }[l]!)));
    await page.getByRole('link', { name: label, exact: true }).click();
    await page.waitForLoadState('networkidle');
    return `go to ${label}`;
  }],
  [1, 'reload', async (page) => { await page.reload({ waitUntil: 'networkidle' }); return 'reload'; }],
];
const TOTAL = ACTIONS.reduce((s, [w]) => s + w, 0);

async function walk(browser: Browser, seed: number, plant = false): Promise<string[]> {
  const r = rng(seed);
  const { context, page, errors, alerts } = await openWatched(browser);
  const steps: string[] = [];
  const out: string[] = [];
  const fail = (why: string) => {
    out.push(`FAIL  walk ${seed}: ${why}`, ...steps.map((s, i) => `        ${String(i + 1).padStart(2)}. ${s}`));
  };
  try {
    const start = r.pick(PAGES);
    await page.goto(BASE + start, { waitUntil: 'networkidle' });
    steps.push(`open ${start}`);
    for (let i = 0; i < STEPS; i++) {
      let pickW = r.int(TOTAL);
      const [, , act] = ACTIONS.find(([w]) => (pickW -= w) < 0)!;
      const at = route(page);
      let did: string;
      try { did = await act(page, r); } catch (e) { did = `(could not: ${(e as Error).message.split('\n')[0].slice(0, 80)})`; }
      steps.push(`${at}: ${did}`);
      // The control: a page error half-way through must stop the walk.
      if (plant && i === Math.floor(STEPS / 2)) await page.evaluate(() => { setTimeout(() => { throw new Error('planted by the control'); }); });
      await page.waitForTimeout(300);
      if (errors.length || alerts.length) { fail([...errors, ...alerts.map((a) => `alert: ${a}`)].slice(0, 3).join(' | ')); return out; }
      if (!await pageAlive(page)) { fail('the page lost its side panel or 3D view'); return out; }
    }
    const before = await storedState(page);
    await page.reload({ waitUntil: 'networkidle' });
    const after = await storedState(page);
    if (errors.length) fail(errors.slice(0, 3).join(' | '));
    else if (!same(before, after)) fail(`a reload changed what was saved — ${firstDiff(after, before)}`);
    else {
      const visited = [...new Set(steps.slice(1).map((s) => s.split(':')[0]))].join(' ');
      const couldNot = steps.filter((s) => s.includes('(could not')).length;
      out.push(`PASS  walk ${seed}: ${STEPS} random steps (on ${visited}${couldNot ? `; ${couldNot} could not be done` : ''}), no error, all saved settings survive a reload`);
    }
  } catch (e) {
    fail(`THREW ${(e as Error).message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
  return out;
}

async function main() {
  if (!BASE) { skip('browser: no app to test (run it through npm test, or set VASEMAKER_URL)'); console.log('\nALL PASS'); return; }
  const browser = await launchBrowser();
  const [control, ...walks] = await Promise.all([walk(browser, SEEDS[0], true), ...SEEDS.map((s) => walk(browser, s))]);
  const caught = control.some((l) => l.startsWith('FAIL') && l.includes('planted by the control'));
  const lines = [`${caught ? 'PASS' : 'FAIL'}  control: a page error planted half-way through a walk is caught`, ...walks.flat()];
  for (const l of lines) console.log(l);
  const fails = lines.filter((l) => l.startsWith('FAIL')).length;
  await browser.close();
  console.log(fails ? `\n${fails} FAILED — replay one with CLICK_SEEDS=<seed>` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
main();
