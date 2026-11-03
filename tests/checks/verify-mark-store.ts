import { sprigDesign, markDesign, asMark, DEFAULT_MARK_PARAMETERS } from '@/store/sprig-store';
import { DEFAULT_SPRIG_PARAMETERS, mergeSprigParameters } from '@/engine/sprig/sprig-types';
let fail = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const S = sprigDesign.useStore, M = markDesign.useStore;
  ok(S !== M, 'two distinct stores');
  ok(M.getState().params.width === 20 && M.getState().params.heightMode === 'flat', 'mark starts at mark defaults');
  ok(S.getState().params.width === DEFAULT_SPRIG_PARAMETERS.width, 'sprig starts at sprig defaults');
  const sprigBefore = S.getState().params;
  M.getState().setParam('maxHeight', 1.7); await wait(400);
  M.getState().setParam('text', 'GM'); await wait(400);
  ok(S.getState().params === sprigBefore, 'editing the mark leaves the sprig object untouched');
  ok(markDesign.useHistory.getState().canUndo && !sprigDesign.useHistory.getState().canUndo, 'only the mark history has steps');
  M.getState().undo();
  ok(M.getState().params.text === '' && M.getState().params.maxHeight === 1.7, 'mark undo steps back one');
  ok(S.getState().params === sprigBefore, 'mark undo leaves the sprig alone');
  // Control: the same check MUST fail when the sprig is edited.
  S.getState().setParam('maxHeight', 4.4);
  ok(S.getState().params !== sprigBefore, 'CONTROL: editing the sprig IS seen by the check');
  M.getState().reset();
  ok(M.getState().params.heightMode === 'flat' && M.getState().params.maxHeight === DEFAULT_MARK_PARAMETERS.maxHeight, 'mark Reset goes to MARK defaults');
  ok(S.getState().params.maxHeight === 4.4, 'mark Reset leaves the sprig alone');
  const fromSprigFile = asMark(mergeSprigParameters({ backing: 'plaque', textStyle: 'cut', width: 30 }, DEFAULT_MARK_PARAMETERS));
  ok(fromSprigFile.backing === 'none' && fromSprigFile.textStyle === 'raised' && fromSprigFile.width === 30, 'sprig file loaded as a mark: backing off, letters raised, size kept');
  const partial = mergeSprigParameters({ width: 25 }, DEFAULT_MARK_PARAMETERS);
  ok(partial.heightMode === 'flat', 'missing fields in a mark file fall back to MARK defaults');
  console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
