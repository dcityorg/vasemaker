/**
 * Vase page Revert to Saved (2026-10-26): what it goes back to.
 *   npx tsx --tsconfig tsconfig.json tests/checks/verify-vase-revert.ts
 */
import { useVaseStore } from '@/store/vase-store';
import { BUILT_IN_PRESETS } from '@/config/presets';
let fails = 0;
const check = (ok: boolean, m: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) fails++; };
const S = () => useVaseStore.getState();
const p0 = S().params;
check(S().savedParams === p0 && !S().isDirty, 'start: clean, saved = the starting design');
S().setColor?.('#123456');
check(S().isDirty && S().savedParams === p0, 'an edit: dirty, saved unchanged');
S().revertToSaved();
check(!S().isDirty && S().params === p0 && S().params.color !== '#123456', 'Revert: back to the start, clean');
S().setColor('#222222'); S().markClean();
const p1 = S().params;
check(!S().isDirty && S().savedParams === p1, 'Save (markClean): saved = what was saved');
S().setColor('#333333');
S().revertToSaved();
check(S().params.color === '#222222', 'Revert after Save: back to the saved colour, not the start');
S().loadPreset(BUILT_IN_PRESETS[1]);
check(!S().isDirty && S().savedParams === S().params, 'a preset: saved = the preset');
S().loadDesign({ radius: 41 }, 'x');
check(S().savedParams === S().params && S().params.radius === 41, 'Load Design: saved = the loaded design');
S().setColor('#444444'); S().undo();
check(S().savedParams?.radius === 41, 'undo does not move the saved design');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
