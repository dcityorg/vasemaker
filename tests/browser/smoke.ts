/**
 * Browser smoke, in the quick suite (`npm test`): every page opens with a 3D
 * view and no error; the tool buttons go round Vase → Handle → Mold →
 * Sprig → Mark → Vase with a switch flipped on each; a change survives a
 * reload; and a mold file on the Vase tab opens the Load list (Gary,
 * 2026-11-11; it used to be refused), and Cancel leaves the vase alone.
 * The deeper browser checks (load-files, undo-revert, click-paths) run in
 * `npm run test:deep`.
 */
import { join } from 'path';
import { FIXTURES, skip } from '../lib/designs';
import { BASE, KEY, openWatched, storedState, same, firstDiff, pageAlive, launchBrowser } from '../lib/browser';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

async function main() {
  if (!BASE) { skip('browser: no app to test (run it through npm test, or set VASEMAKER_URL)'); console.log('\nALL PASS'); return; }
  const browser = await launchBrowser();
  const { context, page, errors, alerts } = await openWatched(browser);
  const flip = async () => {
    for (const s of await page.locator('button.w-8.h-4.rounded-full').all()) {
      if (await s.isVisible() && await s.evaluate((e) => !e.closest('fieldset[disabled]'))) { await s.click(); return; }
    }
  };

  // Round the tools by their own buttons, as a person would.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  check(await pageAlive(page), 'Vase: opens with its side panel and 3D view');
  for (const [label, route] of [['Handle', '/handle'], ['Mold', '/mold'], ['Sprig/Mark', '/sprig']] as const) {
    await flip();
    await page.getByRole('link', { name: label, exact: true }).click();
    await page.waitForURL(`**${route}`);
    await page.waitForTimeout(800);
    check(await pageAlive(page), `${label}: reached from the tool buttons, side panel and 3D view drawn`);
  }
  await page.getByRole('button', { name: 'Mark', exact: true }).click();
  await page.waitForTimeout(500);
  await flip();
  await page.getByRole('link', { name: 'Vase', exact: true }).click();
  await page.waitForURL((u) => new URL(u).pathname === '/');
  await page.waitForTimeout(800);
  check(await pageAlive(page), 'Vase: back from the Mark tab');

  // Greyed settings say what to turn on or set, in amber (the mold notes' amber-400).
  const hints = await page.locator('fieldset[disabled]').evaluateAll((fs) => fs.map((f) => {
    const h = f.previousElementSibling as HTMLElement | null;
    return { text: h?.textContent ?? '', color: h ? getComputedStyle(h).color : '' };
  }));
  const grey = hints.filter((h) => !h.text.trim() || h.color !== 'rgb(251, 191, 36)');
  check(hints.length > 0 && grey.length === 0, `Vase: ${hints.length} greyed group(s), each with an amber line saying what to turn on${grey.length ? ` — not: ${grey.map((h) => `"${h.text}" ${h.color}`).join(', ')}` : ''}`);

  // A change survives a reload.
  await flip();
  const before = await storedState(page);
  await page.reload({ waitUntil: 'networkidle' });
  const after = await storedState(page);
  check(same(before, after), `every page's settings survive a reload${same(before, after) ? '' : ` — ${firstDiff(after, before)}`}`);

  // A mold file on the Vase tab opens the Load list; Cancel keeps the vase.
  const vase = after[KEY['/']];
  await page.locator('input[type=file][accept=".json"]').setInputFiles(join(FIXTURES, 'molds/tumbler3-halves.mold.json'));
  const list = page.locator('[data-load-list]');
  const shown = await list.waitFor({ timeout: 3000 }).then(() => true, () => false);
  const rows = shown ? await list.locator('[data-piece]').evaluateAll((els) => els.map((e) => e.getAttribute('data-piece'))) : [];
  check(shown && rows.join() === 'vase,mold,handle,sprig,mark', `Vase tab: a mold file opens the Load list (${rows.join(', ') || 'no list'})`);
  if (shown) await list.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(300);
  const kept = (await storedState(page))[KEY['/']];
  check(same(kept, vase), `…and the vase is unchanged${same(kept, vase) ? '' : ` — ${firstDiff(kept, vase)}`}`);

  check(errors.length === 0 && alerts.length === 0, `no page errors or alerts${errors.length + alerts.length ? ` — ${[...errors, ...alerts].slice(0, 3).join(' | ')}` : ''}`);
  await context.close();
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
}
main();
