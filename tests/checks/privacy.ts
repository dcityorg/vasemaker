/**
 * Nothing private in what gets published: every file git would push (tracked,
 * plus new files that are not ignored) is scanned for personal paths, and for
 * the private patterns in local-docs/test-designs/private-patterns.txt —
 * names that must not appear. That list is private on purpose: a public list
 * of them would publish them. Without it, that half is SKIPPED, not passed.
 *
 * A text scan cannot read a picture: a sprig settings file carries its whole
 * image. Public fixtures are looked at by eye before they go in
 * (local-docs/testing-plan.md).
 */
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PRIVATE_DESIGNS, skip } from '../lib/designs';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

const PUBLIC_PATTERNS = [/\/Users\/[a-z]/i, /\/home\/[a-z]/i, /C:\\Users\\/i, /Dropbox/i];
const privateFile = join(PRIVATE_DESIGNS, 'private-patterns.txt');
const PRIVATE_PATTERNS = existsSync(privateFile)
  ? readFileSync(privateFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => new RegExp(l, 'i'))
  : null;
if (!PRIVATE_PATTERNS) skip('private name patterns: local-docs/test-designs/private-patterns.txt not present');

/** The files git would publish (no git, e.g. a downloaded copy: the whole check is skipped). */
let files: string[] = [];
try {
  files = execSync('git ls-files -z --cached --others --exclude-standard', { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
} catch {
  skip('not a git checkout, so there is no list of published files');
}

// Control: the scanner must see a planted path, or a clean result means nothing.
check(PUBLIC_PATTERNS.some((p) => p.test('see /Users/someone/Dropbox/x.json')), 'control: a planted home path is caught');

let scanned = 0;
for (const f of files) {
  if (!existsSync(f)) continue;                               // deleted, not yet committed
  if (f === 'tests/checks/privacy.ts') continue;              // holds the patterns themselves
  const buf = readFileSync(f);
  if (buf.subarray(0, 8000).includes(0)) continue;            // binary
  const text = buf.toString('utf8');
  scanned++;
  const lines = text.split('\n');
  for (const [set, kind] of [[PUBLIC_PATTERNS, 'personal path'], [PRIVATE_PATTERNS ?? [], 'private name']] as const) {
    for (const p of set) {
      const n = lines.findIndex((l) => p.test(l));
      // The private pattern itself is not printed: the log may be shared.
      if (n >= 0) check(false, `${f}:${n + 1}: ${kind}${kind === 'personal path' ? ` (${p})` : ''}`);
    }
  }
}
check(files.length === 0 || scanned > 50, `scanned ${scanned} text files of ${files.length} published`);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
