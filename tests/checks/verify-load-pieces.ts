/**
 * The Load list's reading of a file (src/lib/load-pieces.ts, Gary 2026-11-11):
 *  - which pieces each kind of file has, which are ticked, which greyed;
 *  - names come off the file name without its ending;
 *  - when a tab shows the list (needsList) — every tab × every kind;
 *  - a vase's sprig and mark are offered as copies, unticked;
 *  - CONTROL: JSON that is no design is refused (null).
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-load-pieces.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { readDesignFile, needsList, type FileContents, type Tab } from '@/lib/load-pieces';
import { FIXTURES } from '../lib/designs';

let ok = true, passes = 0;
const check = (c: boolean, m: string) => { if (c) { passes++; console.log(`PASS  ${m}`); } else { ok = false; console.log(`FAIL  ${m}`); } };
const fx = (f: string) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8'));
const fmt = (c: FileContents | null) => c ? c.pieces.map((p) => `${p.key}${p.present ? '' : '(grey)'}${p.ticked ? '✓' : ''}`).join(' ') : 'null';

const mold = readDesignFile(fx('molds/tumbler3-halves.mold.json'), 'Tall Tumbler – Split Halves');
check(fmt(mold) === 'vase✓ mold✓ handle✓ sprig(grey) mark(grey)', `mold file: ${fmt(mold)}`);
check(mold?.mold?.name === 'Tall Tumbler' && mold.mold.style === 'splitHalves', `mold file: mold named "${mold?.mold?.name}", style ${mold?.mold?.style}`);

const old = readDesignFile(fx('molds/tumbler2-onepiece.mold.json'), 'old mold');
check(fmt(old) === 'vase(grey) mold✓ handle(grey) sprig(grey) mark(grey)', `old settings-only mold file: ${fmt(old)}`);
check(old?.pieces.find((p) => p.key === 'vase')?.detail === 'not in this file (keeps yours)', 'old file: the missing vase says "not in this file (keeps yours)"');
const oldMold = old?.pieces.find((p) => p.key === 'mold')?.detail;
check(oldMold === 'Pour 1-Pc, no longer offered: its settings go to Pour 3-Pc', `old file of a hidden style says where it goes: "${oldMold}"`);

const vase = readDesignFile(fx('vases/2026-02-swirl1.json'), 'Swirl – Vase');
check(fmt(vase) === 'vase✓' && vase?.vaseName === 'Swirl', `vase file: ${fmt(vase)}, named "${vase?.vaseName}"`);

const v = fx('vases/2026-07-tumbler3.json');
const sprig = fx('sprigs/dcitylogo1-43x41.json').settings;
v.textures = { ...(v.textures ?? {}), sprig: { enabled: true, style: 'raised', depth: 2, size: 100, heightPct: 40, angle: 0, tilt: 0, copies: 1, sprig, sprigName: 'Logo' } };
v.bottom = { ...(v.bottom ?? {}), mark: sprig, markName: 'GM' };
const sv = readDesignFile(v, 'With Copies – Vase');
check(fmt(sv) === 'vase✓ sprig mark', `vase with a sprig and a mark: ${fmt(sv)} (copies offered, unticked)`);
check(sv?.pieces.find((p) => p.key === 'sprig')?.detail === 'Logo (the one on the vase)', 'the sprig copy says "(the one on the vase)"');

const handle = readDesignFile(fx('handles/c1.json'), 'Loop – Handle');
check(fmt(handle) === 'handle✓' && handle?.handleName === 'Loop', `handle file: ${fmt(handle)}, named "${handle?.handleName}"`);
const sp = readDesignFile(fx('sprigs/dcitylogo1-43x41.json'), 'Logo – Sprig');
check(fmt(sp) === 'sprig✓' && sp?.sprigName === 'Logo', `sprig file: ${fmt(sp)}, named "${sp?.sprigName}" (the design itself, ticked)`);
const mk = readDesignFile({ ...fx('sprigs/dcitylogo1-43x41.json'), type: 'mark-settings' }, 'GM – Mark');
check(fmt(mk) === 'mark✓' && mk?.markName === 'GM', `mark file: ${fmt(mk)}, named "${mk?.markName}"`);

check(readDesignFile({ hello: 1 }, 'x') === null && readDesignFile([1, 2], 'x') === null, 'CONTROL: JSON that is no design → null');

// When each tab shows the list.
const tabs: Tab[] = ['vase', 'mold', 'handle', 'sprig', 'mark'];
const row = (c: FileContents | null) => tabs.map((t) => (needsList(c!, t) ? 'L' : '-')).join('');
const want: [string, FileContents | null, string][] = [
  ['mold', mold, 'LLLLL'], ['vase', vase, '-LLLL'], ['handle', handle, 'LL-LL'], ['sprig', sp, 'LLL--'], ['mark', mk, 'LLL--'],
];
for (const [k, c, w] of want) check(row(c) === w, `list shown on vase/mold/handle/sprig/mark for a ${k} file: ${row(c)} (wanted ${w})`);

console.log(`\n${ok ? 'ALL PASS' : 'SOME CHECKS FAILED'} (${passes} passed)`);
process.exit(ok ? 0 : 1);
