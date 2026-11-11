/**
 * Shared pieces for tests/browser/: a fresh Chromium context per run with
 * every kind of page failure collected, and the app's saved state read back.
 * The runner serves the app and sets VASEMAKER_URL (tests/lib/app.ts).
 */
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const BASE = process.env.VASEMAKER_URL;
export const PAGES = ['/', '/mold', '/handle', '/sprig'] as const;

/** Headless Chromium on the machine's GPU. Its default software renderer
 *  (SwiftShader) draws the Mold page at 7 frames/s and a click there takes
 *  2 s; on an M-series Mac's Metal it is 60 frames/s and 40 ms (measured
 *  2026-11-02). Elsewhere the flags are ignored and it falls back. */
export function launchBrowser(): Promise<Browser> {
  return chromium.launch({ args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
}

export interface Watched { context: BrowserContext; page: Page; errors: string[]; alerts: string[] }

/** A fresh profile (empty storage), with page errors, console errors, failed
 *  requests and alerts collected. Native confirms are accepted and counted
 *  as nothing; alerts are kept apart so a test can expect one. */
export async function openWatched(browser: Browser): Promise<Watched> {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // tsx wraps named functions in __name(); code passed to page.evaluate needs it.
  await context.addInitScript('window.__name = (f) => f');
  // No native file picker: Load falls back to the hidden <input type=file>.
  await context.addInitScript(() => { delete (window as unknown as Record<string, unknown>).showOpenFilePicker; });
  // A control that cannot be used fails in 20 s, not Playwright's 30. Not
  // less: a Mold switch that rebuilds the mold holds the page 5–10 s headless.
  context.setDefaultTimeout(20_000);
  const page = await context.newPage();
  const errors: string[] = [], alerts: string[] = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  // A failed request is reported by URL below; the console's copy has none.
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console: ${m.text().slice(0, 160)}`); });
  // Vercel's analytics scripts exist only on Vercel; any other failed request counts.
  page.on('response', (r) => { if (r.status() >= 400 && !new URL(r.url()).pathname.startsWith('/_vercel/')) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('dialog', (d) => { if (d.type() === 'alert') alerts.push(d.message()); void (d.type() === 'confirm' ? d.accept() : d.dismiss()); });
  return { context, page, errors, alerts };
}

/** Every vasemaker-* localStorage entry, after the stores' save debounce. */
export async function storedState(page: Page, waitMs = 1200): Promise<Record<string, unknown>> {
  await page.waitForTimeout(waitMs);
  return page.evaluate(() => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(localStorage).sort()) if (k.startsWith('vasemaker-')) {
      try { out[k] = JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { out[k] = localStorage.getItem(k); }
    }
    return out;
  });
}

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The first key (and nested field) where two stored states differ, for a FAIL line. */
export function firstDiff(a: unknown, b: unknown, path = ''): string {
  if (same(a, b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = a as Record<string, unknown>, kb = b as Record<string, unknown>;
    for (const k of [...new Set([...Object.keys(ka), ...Object.keys(kb)])]) {
      const d = firstDiff(ka[k], kb[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
  }
  return `${path || '(root)'}: ${JSON.stringify(a)?.slice(0, 50)} vs ${JSON.stringify(b)?.slice(0, 50)}`;
}

/** The page drew its side panel and a view: the 3D canvas, or a flat drawing
 *  (the Handle page's Side view is an SVG) — not a white screen. */
export async function pageAlive(page: Page): Promise<boolean> {
  if (!await page.getByRole('button', { name: 'Revert to Saved' }).count()) return false;
  return page.evaluate(() => [...document.querySelectorAll('canvas, svg')].some((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 200 && r.height > 200;
  }));
}

/** Load a design file through the page's Load button. A file that opens the
 *  Load list (a mold file; another tab's file) is loaded as ticked: for a mold
 *  file, its vase, mold and handle. */
export async function loadFile(page: Page, file: string): Promise<void> {
  await page.locator('input[type=file][accept=".json"]').first().setInputFiles(file);
  const take = page.locator('[data-load-list] button', { hasText: /^(Load|Load anyway)$/ });
  await take.first().waitFor({ timeout: 3000 }).then(() => take.first().click(), () => {});
}

/** Each page's own storage key. */
export const KEY: Record<string, string> = {
  '/': 'vasemaker-vase-design', '/mold': 'vasemaker-mold-settings',
  '/handle': 'vasemaker-handle-settings', '/sprig': 'vasemaker-sprig-settings',
};

/** Seeded random numbers (mulberry32), so a failing walk can be replayed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] };
}
