/**
 * Verify MoldMaker's undo/redo and Revert to Saved.
 *
 * Same reason as `verify-handle-store.ts`: the failure mode is invisible. Every
 * programmatic `set` has to call `skipNextRecord`, and missing one leaves a
 * phantom step that takes you somewhere you were never at.
 *
 * The mold's own wrinkle: `moldStyle` lives in params, so switching Press 2-Pc
 * to Pour 3-Pc is an undoable step — deliberate, but worth pinning down so it
 * cannot change by accident.
 *
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-mold-store.ts
 */
import { useMoldStore, useMoldHistory } from '@/store/mold-store';
import { DEFAULT_MOLD_PARAMETERS } from '@/engine/mold/mold-types';

let ok = true;
const say = (pass: boolean, msg: string) => { if (!pass) ok = false; console.log(`${pass ? 'PASS' : 'FAIL'}  ${msg}`); };
const S = () => useMoldStore.getState();
const settle = () => new Promise((r) => setTimeout(r, 420));

async function main() {
  useMoldHistory.getState().clear();
  S().setParam('plasterThickness', 10); await settle();
  S().setParam('plasterThickness', 14); await settle();
  S().setParam('plasterThickness', 18); await settle();
  say(useMoldHistory.getState().canUndo, 'undo becomes available after edits');

  S().undo();
  say(S().params.plasterThickness === 14, `undo steps back one value (got ${S().params.plasterThickness}, want 14)`);
  S().undo();
  say(S().params.plasterThickness === 10, `undo steps back again (got ${S().params.plasterThickness}, want 10)`);
  S().redo();
  say(S().params.plasterThickness === 14, `redo steps forward (got ${S().params.plasterThickness}, want 14)`);
  await settle();
  S().redo();
  say(S().params.plasterThickness === 18, `undo is not itself recorded — redo still reaches the top (got ${S().params.plasterThickness}, want 18)`);
  say(!useMoldHistory.getState().canRedo, 'redo is exhausted at the top of the stack');

  // moldStyle is a param, so switching styles is one undoable step.
  useMoldHistory.getState().clear();
  S().setParam('moldStyle', 'pourThreePiece'); await settle();
  S().setParam('moldStyle', 'twoPart'); await settle();
  S().undo();
  say(S().params.moldStyle === 'pourThreePiece', `switching mold style is undoable (got ${S().params.moldStyle})`);

  // Reset keeps the STYLE (a mode, not a setting) and is one undoable step.
  await settle();
  S().setParam('plasterThickness', 21); await settle();
  const styleBefore = S().params.moldStyle;
  S().reset(); await settle();
  say(S().params.moldStyle === styleBefore, 'reset keeps the current mold style');
  say(S().params.plasterThickness === DEFAULT_MOLD_PARAMETERS.plasterThickness, 'reset restores the other settings');
  S().undo();
  say(S().params.plasterThickness === 21, `Reset is undoable in ONE step (got ${S().params.plasterThickness}, want 21)`);

  // Revert to Saved.
  await settle();
  const baseline = S().params;
  S().markSaved(baseline, 'Test Profile');
  S().setParam('plasterThickness', 7);
  S().setParam('shrinkPercent', 5);
  await settle();
  say(S().settingsName === 'Test Profile', 'markSaved keeps the settings-file name');
  S().revertToSaved();
  say(S().params === baseline, 'Revert to Saved restores the whole settings block');
  await settle();
  S().undo();
  say(S().params.plasterThickness === 7, `Revert is itself undoable (got ${S().params.plasterThickness}, want 7)`);

  // Per-style settings (Gary, 2026-10-16): each tab keeps its own numbers;
  // Reset, Revert and loading touch only the current tab.
  await settle();
  S().setStyle('splitHalves'); await settle();
  S().setParam('plasterThickness', 31); await settle();
  S().setStyle('splitThirds'); await settle();
  say(S().params.moldStyle === 'splitThirds', 'setStyle switches the tab');
  S().setParam('plasterThickness', 27); await settle();
  S().setStyle('splitHalves'); await settle();
  say(S().params.plasterThickness === 31, `Split Halves kept its own Plaster (got ${S().params.plasterThickness}, want 31)`);
  S().setStyle('splitThirds'); await settle();
  say(S().params.plasterThickness === 27, `Split Thirds kept its own Plaster (got ${S().params.plasterThickness}, want 27)`);
  S().setParam('thirdsFootPiece', true); S().setParam('thirdsPlugHeight', 30); await settle();
  S().reset(); await settle();
  say(S().params.plasterThickness === DEFAULT_MOLD_PARAMETERS.plasterThickness && S().params.moldStyle === 'splitThirds', 'Reset resets the current tab and stays on it');
  say(S().params.thirdsFootPiece === true, 'Reset keeps a foot piece that was on');
  say(S().params.thirdsPlugHeight === DEFAULT_MOLD_PARAMETERS.thirdsPlugHeight, `Reset restores the foot settings (Plug Height ${S().params.thirdsPlugHeight})`);
  say(S().styleParams.splitHalves?.plasterThickness === 31, `Reset leaves the other tabs alone (Split Halves ${S().styleParams.splitHalves?.plasterThickness}, want 31)`);
  S().undo();
  say(S().params.thirdsPlugHeight === 30, `undo brings the Plug Height back (got ${S().params.thirdsPlugHeight})`);
  say(S().params.plasterThickness === 27, `Reset is undoable (got ${S().params.plasterThickness}, want 27)`);
  // Undo back across a tab switch: the later tab's edits are kept in its own slot.
  await settle();
  S().setStyle('pourThreePiece'); await settle();
  S().setParam('plasterThickness', 19); await settle();
  S().undo(); S().undo();
  say(S().params.moldStyle === 'splitThirds', `undo steps back across the tab switch (on ${S().params.moldStyle})`);
  say(S().styleParams.pourThreePiece?.plasterThickness !== undefined, 'the tab left by undo still has an entry');
  await settle();
  // Loading a file of one style leaves the others alone (MoldSidebar's applyMoldOnly does exactly this setState).
  const file = { ...DEFAULT_MOLD_PARAMETERS, moldStyle: 'splitThirds' as const, plasterThickness: 23 };
  useMoldStore.setState((st) => ({ params: file, savedByStyle: { ...st.savedByStyle, splitThirds: file } }));
  await settle();
  say(S().params.plasterThickness === 23 && S().styleParams.splitHalves?.plasterThickness === 31, `loading a Split Thirds file leaves Split Halves alone (${S().styleParams.splitHalves?.plasterThickness})`);
  say(S().savedParams === file, 'the loaded file is this tab\'s Revert baseline');
  S().setStyle('splitHalves'); await settle();
  say(S().savedParams !== file, 'switching tabs switches the Revert baseline');
  // setParam('moldStyle') is a tab switch, not a relabel.
  S().setParam('moldStyle', 'splitThirds'); await settle();
  say(S().params.plasterThickness === 23, `setParam('moldStyle') switches tabs (Plaster ${S().params.plasterThickness}, want 23)`);

  console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
  process.exit(ok ? 0 : 1);
}

main();
