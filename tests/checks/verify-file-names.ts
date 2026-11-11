/**
 * Saved file names say what they are (src/lib/file-names.ts, Gary 2026-11-11):
 *  - each tab adds its ending once ("Tall Tumbler – Vase"), never twice;
 *  - a mold adds its style, unless the name already says it;
 *  - Load takes the ending off again, with any dash and any case;
 *  - files from two tabs with the same name come out different;
 *  - CONTROL: a plain " Handle" (no dash) is part of the name, not an ending.
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-file-names.ts
 */
import { withEnding, withoutEnding, moldFileName, moldNameFromFile, ENDING } from '@/lib/file-names';

let ok = true, passes = 0;
const check = (c: boolean, m: string) => { if (c) { passes++; console.log(`PASS  ${m}`); } else { ok = false; console.log(`FAIL  ${m}`); } };
const eq = (got: string, want: string, m: string) => check(got === want, `${m}: "${got}"${got === want ? '' : ` (wanted "${want}")`}`);

eq(withEnding('Tall Tumbler', ENDING.vase), 'Tall Tumbler – Vase', 'vase ending added');
eq(withEnding('Tall Tumbler – Vase', ENDING.vase), 'Tall Tumbler – Vase', 'vase ending not added twice');
eq(withEnding('Tall Tumbler - vase', ENDING.vase), 'Tall Tumbler - vase', 'a typed "- vase" counts as the ending');
eq(withEnding('D Handle', ENDING.handle), 'D Handle – Handle', 'CONTROL: "D Handle" is a name, so the ending is still added');
eq(withEnding('  DragonFly1 ', ENDING.sprig), 'DragonFly1 – Sprig', 'sprig ending added, spaces trimmed');
eq(withEnding('GM Mark', ENDING.mark), 'GM Mark – Mark', 'mark ending added');

eq(moldFileName('Tall Tumbler', 'splitHalves'), 'Tall Tumbler – Split Halves', 'mold style added');
eq(moldFileName('Tall Tumbler – Split Halves', 'splitHalves'), 'Tall Tumbler – Split Halves', 'mold style not added twice');
eq(moldFileName('Tall Tumbler split halves v2', 'splitHalves'), 'Tall Tumbler split halves v2', 'style already in the name: left alone');
eq(moldFileName('Tall Tumbler – Split Halves', 'splitThirds'), 'Tall Tumbler – Split Halves – Split Thirds', 'a different style IS added');

eq(withoutEnding('Tall Tumbler – Vase', [ENDING.vase]), 'Tall Tumbler', 'Load takes the vase ending off');
eq(withoutEnding('D Handle – Handle', [ENDING.handle]), 'D Handle', 'Load takes the handle ending off, keeps "D Handle"');
eq(withoutEnding('D Handle', [ENDING.handle]), 'D Handle', 'CONTROL: no dash, nothing taken off');
eq(withoutEnding('Leaf — sprig', [ENDING.sprig, ENDING.mark]), 'Leaf', 'em dash, lower case');
eq(withoutEnding('– Vase', [ENDING.vase]), '– Vase', 'a name that is only the ending is kept');
eq(moldNameFromFile('Tall Tumbler – Pour 3-Pc'), 'Tall Tumbler', 'mold name from a Pour 3-Pc file');
eq(moldNameFromFile('Old Mug - Press 2-Pc'), 'Old Mug', 'mold name from a hidden style\'s file');
eq(moldNameFromFile('Tall Tumbler mold'), 'Tall Tumbler mold', 'an old file named without a style keeps its name');

// Round trip: save, load, save again gives the same file name.
for (const [name, end] of [['Tall Tumbler', ENDING.vase], ['D Handle', ENDING.handle]] as const) {
  const file = withEnding(name, end);
  eq(withEnding(withoutEnding(file, [end]), end), file, `round trip ${end}`);
}
const m = moldFileName('Tall Tumbler', 'splitThirds');
eq(moldFileName(moldNameFromFile(m), 'splitThirds'), m, 'round trip mold');

// The headline: the same name on different tabs can't clash.
const files = [withEnding('Tall Tumbler', ENDING.vase), withEnding('Tall Tumbler', ENDING.sprig), withEnding('Tall Tumbler', ENDING.handle),
  withEnding('Tall Tumbler', ENDING.mark), moldFileName('Tall Tumbler', 'splitHalves'), moldFileName('Tall Tumbler', 'splitThirds')];
check(new Set(files).size === files.length, `"Tall Tumbler" on every tab gives ${files.length} different files`);

console.log(`\n${ok ? 'ALL PASS' : 'SOME CHECKS FAILED'} (${passes} passed)`);
process.exit(ok ? 0 : 1);
