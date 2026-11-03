/**
 * Browser: every public test design loads through its page's Load button, in
 * a real Chromium (Playwright's own throwaway profile — never the user's).
 * What the page then stores must equal what src/lib/design-files.ts makes of
 * the file in Node; no page error, no alert; and it survives a reload.
 *
 * Needs a running app: VASEMAKER_URL=http://localhost:3101 (a production
 * build, never the dev server a person is using). Without it: SKIPPED.
 *
 * The page's showOpenFilePicker is removed first, so Load falls back to the
 * hidden file input (the Firefox path) that a test can fill. Both paths hand
 * the text to the same function; the native dialog itself is not tested.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { chromium, type Page } from '@playwright/test';
import { FIXTURES, skip } from '../lib/designs';
import { designKind, vaseFromFile, readMoldFile, moldFromSettings, handleFromFile, sprigFromFile } from '@/lib/design-files';

const BASE = process.env.VASEMAKER_URL;
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

/** Deep equality through JSON (what the stores write is JSON). */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function firstDiff(a: Record<string, unknown>, b: Record<string, unknown>): string {
  const k = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].find((x) => !same(a?.[x], b?.[x]));
  return k ? `${k}: page ${JSON.stringify(a?.[k])?.slice(0, 60)} vs expected ${JSON.stringify(b?.[k])?.slice(0, 60)}` : '';
}

async function stored(page: Page, key: string) {
  // The stores save on a short debounce.
  await page.waitForTimeout(1200);
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
}

async function main() {
  if (!BASE) { skip('browser: VASEMAKER_URL not set (start a production build on a spare port)'); console.log('\nALL PASS'); return; }
  const browser = await chromium.launch();
  const all = ['vases', 'molds', 'handles', 'sprigs'].flatMap((d) =>
    readdirSync(join(FIXTURES, d)).filter((f) => f.endsWith('.json') && !f.endsWith('.vase.json')).map((f) => join(FIXTURES, d, f)));

  for (const file of all) {
    const name = basename(file);
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const kind = designKind(parsed);
    const route = { vase: '/', mold: '/mold', handle: '/handle', sprig: '/sprig', mark: '/sprig', unknown: '/' }[kind];
    const context = await browser.newContext();             // fresh storage for every file
    await context.addInitScript(() => { delete (window as unknown as Record<string, unknown>).showOpenFilePicker; });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
    // A failed request is reported by URL below; the console's copy has none.
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console: ${m.text().slice(0, 160)}`); });
    // Vercel's analytics scripts exist only on Vercel; any other failed request counts.
    page.on('response', (r) => { if (r.status() >= 400 && !new URL(r.url()).pathname.startsWith('/_vercel/')) errors.push(`HTTP ${r.status()} ${r.url()}`); });
    page.on('dialog', (d) => { errors.push(`alert: ${d.message()}`); void d.dismiss(); });

    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.locator('input[type=file][accept=".json"]').setInputFiles(file);

    if (kind === 'vase') {
      const s = await stored(page, 'vasemaker-vase-design');
      const want = vaseFromFile(parsed);
      check(same(s?.params, want), `${name}: Vase page stores the design as loaded${same(s?.params, want) ? '' : ` — ${firstDiff(s?.params, want as unknown as Record<string, unknown>)}`}`);
    } else if (kind === 'mold') {
      // A file whose vase differs from the open one asks; take the file's.
      if (readMoldFile(parsed).vase) {
        const take = page.getByRole('button', { name: /^Load that|^Load anyway/ });
        await take.first().waitFor({ timeout: 5000 }).then(() => take.first().click(), () => {});
      }
      const s = await stored(page, 'vasemaker-mold-settings');
      const f = readMoldFile(parsed);
      const want = moldFromSettings(f.settings).params;
      check(same(s?.params, want), `${name}: Mold page stores the ${want.moldStyle} settings${same(s?.params, want) ? '' : ` — ${firstDiff(s?.params, want as unknown as Record<string, unknown>)}`}`);
      if (f.vase) {
        const v = await stored(page, 'vasemaker-vase-design');
        check(same(v?.params, vaseFromFile(f.vase)), `${name}: …and the vase saved inside it`);
      }
    } else if (kind === 'handle') {
      const s = await stored(page, 'vasemaker-handle-settings');
      check(same(s?.params, handleFromFile(parsed)), `${name}: Handle page stores the handle as loaded`);
    } else if (kind === 'sprig') {
      const s = await stored(page, 'vasemaker-sprig-settings');
      check(same(s?.params, sprigFromFile(parsed)), `${name}: Sprig page stores the sprig as loaded`);
    }
    const key = { vase: 'vasemaker-vase-design', mold: 'vasemaker-mold-settings', handle: 'vasemaker-handle-settings', sprig: 'vasemaker-sprig-settings', mark: 'vasemaker-mark-settings', unknown: '' }[kind];
    const before = await stored(page, key);
    await page.reload({ waitUntil: 'networkidle' });
    const after = await stored(page, key);
    check(same(before?.params, after?.params), `${name}: still loaded after a reload`);
    check(await page.locator('canvas').count() > 0, `${name}: the 3D view is on the page`);
    check(errors.length === 0, `${name}: no page errors or alerts${errors.length ? ` — ${errors.slice(0, 3).join(' | ')}` : ''}`);
    await context.close();
  }
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
main();
