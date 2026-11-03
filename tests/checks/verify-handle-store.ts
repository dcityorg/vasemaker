/**
 * Verify the Handle tab's Reset scope, undo/redo and Revert-to-Saved.
 *
 * Worth a script rather than a click-through because the risky part is
 * invisible: every place that sets params PROGRAMMATICALLY has to call
 * `skipNextRecord`, and forgetting one doesn't break anything you can see — it
 * just makes a file load undoable in pieces, or leaves a phantom step that
 * takes you somewhere you never were.
 *
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-handle-store.ts
 */
import { useHandleStore, useHandleHistory } from '@/store/handle-store';
import { DEFAULT_HANDLE_PARAMETERS } from '@/engine/handle/handle-types';
import { HANDLE_PRESETS } from '@/config/handle-presets';
import type { HandleParameters } from '@/engine/handle/handle-types';

let ok = true;
const say = (pass: boolean, msg: string) => { if (!pass) ok = false; console.log(`${pass ? 'PASS' : 'FAIL'}  ${msg}`); };
const S = () => useHandleStore.getState();
/** The debounce is 300 ms; one settled step needs more than that. */
const settle = () => new Promise((r) => setTimeout(r, 420));
const shapeOf = (p: HandleParameters) => JSON.stringify([p.spinePoints, p.spineTypes, p.width, p.thickness, p.winRight, p.winTop, p.winBottom]);

async function main() {
  // ── 1. Reset keeps the SHAPE and restores the SETTINGS ────────────────────
  const ear = HANDLE_PRESETS.find((p) => p.name === 'Ear')!;
  S().applyPreset(ear);
  await settle();
  S().setParam('seatDepth', 5.5);
  S().setParam('ribCount', 9);
  S().setParam('plasterMargin', 41);
  await settle();
  const shapeBefore = shapeOf(S().params);
  S().reset();
  await settle();

  say(shapeOf(S().params) === shapeBefore,
    'reset keeps the shape (spine, types, width, thickness, drawing window)');
  const settingsBack = (['seatDepth', 'ribCount', 'plasterMargin', 'recessClearance', 'wellSealDepth'] as const)
    .every((k) => S().params[k] === DEFAULT_HANDLE_PARAMETERS[k]);
  say(settingsBack, 'reset restores the settings to their defaults');
  // Every field is either shape-kept or default — nothing left in between.
  const KEPT = new Set(['spinePoints', 'spineTypes', 'width', 'thickness', 'winRight', 'winTop', 'winBottom']);
  const stragglers = (Object.keys(DEFAULT_HANDLE_PARAMETERS) as (keyof HandleParameters)[])
    .filter((k) => !KEPT.has(k as string))
    .filter((k) => JSON.stringify(S().params[k]) !== JSON.stringify(DEFAULT_HANDLE_PARAMETERS[k]));
  say(stragglers.length === 0, `every non-shape field is back at its default (${stragglers.join(', ') || 'none left over'})`);

  // ── 2. The Basic preset restores the built-in shape ───────────────────────
  const basic = HANDLE_PRESETS.find((p) => p.name === 'Basic');
  say(!!basic, 'a "Basic" preset exists');
  if (basic) {
    S().applyPreset(basic);
    await settle();
    const isDefaultShape = JSON.stringify(S().params.spinePoints) === JSON.stringify(DEFAULT_HANDLE_PARAMETERS.spinePoints)
      && JSON.stringify(S().params.spineTypes) === JSON.stringify(DEFAULT_HANDLE_PARAMETERS.spineTypes)
      && S().params.width === DEFAULT_HANDLE_PARAMETERS.width
      && S().params.thickness === DEFAULT_HANDLE_PARAMETERS.thickness;
    say(isDefaultShape, 'Basic restores the app\'s built-in shape — the factory handle stays reachable');
  }

  // ── 3. Undo / redo ────────────────────────────────────────────────────────
  useHandleHistory.getState().clear();
  S().setParam('seatDepth', 3); await settle();
  S().setParam('seatDepth', 4); await settle();
  S().setParam('seatDepth', 5); await settle();
  say(useHandleHistory.getState().canUndo, 'undo becomes available after edits');

  S().undo();
  say(S().params.seatDepth === 4, `undo steps back one value (got ${S().params.seatDepth}, want 4)`);
  S().undo();
  say(S().params.seatDepth === 3, `undo steps back again (got ${S().params.seatDepth}, want 3)`);
  S().redo();
  say(S().params.seatDepth === 4, `redo steps forward (got ${S().params.seatDepth}, want 4)`);

  // The killer case: an undo must not itself be recorded, or undo/redo ping-pong
  // grows the stack forever and redo can never reach the top again.
  await settle();
  S().redo();
  say(S().params.seatDepth === 5, `undo is not itself recorded — redo still reaches the top (got ${S().params.seatDepth}, want 5)`);
  say(!useHandleHistory.getState().canRedo, 'redo is exhausted at the top of the stack');

  // ── 4. Reset and preset apply are single undoable steps ───────────────────
  useHandleHistory.getState().clear();
  S().setParam('seatDepth', 4.4); await settle();
  const beforeReset = S().params;
  S().reset(); await settle();
  S().undo();
  say(S().params === beforeReset || S().params.seatDepth === 4.4,
    `Reset is undoable in ONE step (seatDepth back to ${S().params.seatDepth}, want 4.4)`);

  // ── 5. Revert to Saved ────────────────────────────────────────────────────
  await settle();
  const baseline = S().params;
  S().markSaved(baseline, 'Test Design');
  S().setParam('lipWidth', 2.5);
  S().setParam('plasterAbove', 33);
  await settle();
  say(S().params.lipWidth === 2.5 && S().settingsName === 'Test Design', 'markSaved keeps the name and lets edits continue');
  S().revertToSaved();
  say(S().params === baseline, 'Revert to Saved restores the whole design, shape included');
  await settle();
  S().undo();
  say(S().params.lipWidth === 2.5, `Revert is itself undoable (lipWidth ${S().params.lipWidth}, want 2.5)`);

  console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
  process.exit(ok ? 0 : 1);
}

main();
