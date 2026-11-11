/**
 * Load the ticked pieces of a design file into their stores, from any tab
 * (the Load list, Gary 2026-11-11). Each piece loads the way its own tab
 * loads a file: its name comes with it and its undo history starts fresh.
 *
 * 🔑 Each store is read back from browser storage FIRST (hydrate). A page only
 * hydrates the stores it shows, so a piece set into a store this page never
 * read would be overwritten from storage when its own page opens — and a
 * store that hasn't been read refuses to save (the 2026-10-16 trap).
 */
import { useVaseStore, hydrateVaseDesignFromStorage } from '@/store/vase-store';
import { useMoldStore, useMoldHistory, moldHistory, retiredStyleNotice, hydrateMoldSettingsFromStorage, moldResetParams } from '@/store/mold-store';
import { useHandleStore, useHandleHistory, handleHistory, DEFAULT_HANDLE_SETTINGS_NAME, hydrateHandleSettingsFromStorage } from '@/store/handle-store';
import { sprigDesign, markDesign, asMark, type SprigDesign } from '@/store/sprig-store';
import { mergeHandleParameters, DEFAULT_HANDLE_PARAMETERS } from '@/engine/handle/handle-types';
import type { SprigParameters } from '@/engine/sprig/sprig-types';
import { sameFoot, type FootSettings } from '@/engine/mold/vase-foot';
import { moldFromSettings, vaseFromFile } from '@/lib/design-files';
import type { FileContents, PieceKey } from '@/lib/load-pieces';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The mold half of a file: only its own style changes; the other styles keep theirs.
 *  `legacyFoot`: a file from before the foot moved to the vase — what was poured,
 *  so it goes onto the open vase. */
export function applyMold(settings: unknown, name: string, legacyFoot: FootSettings | null = null) {
  hydrateMoldSettingsFromStorage();
  const { params: loaded, retired } = moldFromSettings(settings);
  let footNotice: string | null = null;
  const vb = useVaseStore.getState().params.bottom;
  if (legacyFoot && vb && !sameFoot(legacyFoot, vb)) {
    useVaseStore.getState().setBottom(legacyFoot);
    footNotice = legacyFoot.footOn
      ? `This mold's foot (${legacyFoot.footWidth} / ${legacyFoot.footSlopeWidth} / ${legacyFoot.footHeight} mm) is now the vase's foot — the foot is set on the Vase tab.`
      : 'This mold had a flat bottom, so the vase\'s Foot is now off — the foot is set on the Vase tab.';
  }
  useMoldStore.getState().setStyleNotice([retired ? retiredStyleNotice(retired) : null, footNotice].filter(Boolean).join(' ') || null);
  moldHistory.skipNextRecord();
  useMoldHistory.getState().clear();
  useMoldStore.setState((st) => ({ params: loaded, savedByStyle: { ...st.savedByStyle, [loaded.moldStyle]: loaded }, settingsName: name }));
}

export function applyVase(vase: unknown, name: string | null) {
  hydrateVaseDesignFromStorage();
  useVaseStore.getState().loadDesign(vase, name);
}

export function applyHandle(handle: unknown, name: string | null) {
  hydrateHandleSettingsFromStorage();
  const params = mergeHandleParameters(handle);
  handleHistory.skipNextRecord();
  useHandleHistory.getState().clear();
  useHandleStore.setState({ params, savedParams: params, settingsName: name?.trim() || DEFAULT_HANDLE_SETTINGS_NAME });
}

function applySprigDesign(design: SprigDesign, params: SprigParameters, name: string | null) {
  design.hydrate();
  const loaded = design.kind === 'mark' ? asMark(params) : params;
  design.history.skipNextRecord();
  design.useHistory.getState().clear();
  design.useStore.setState({ params: loaded, savedParams: loaded, settingsName: name?.trim() || design.defaultName, carried: null });
}

/** Load the ticked pieces, vase first (a mold's legacy foot goes onto it). */
export function applyPieces(c: FileContents, ticked: Set<PieceKey>) {
  if (ticked.has('vase') && c.vase) applyVase(c.vase, c.vaseName);
  if (ticked.has('mold') && c.mold) applyMold(c.mold.settings, c.mold.name, ticked.has('vase') ? null : c.mold.legacyFoot);
  if (ticked.has('handle') && c.handle) applyHandle(c.handle, c.handleName);
  if (ticked.has('sprig') && c.sprig) applySprigDesign(sprigDesign, c.sprig, c.sprigName);
  if (ticked.has('mark') && c.mark) applySprigDesign(markDesign, c.mark, c.markName);
}

/** Pieces open now with changes not in any file (read after hydrating, so a
 *  store this page never showed is judged by what is really stored). */
export function unsavedPieces(): Set<PieceKey> {
  hydrateVaseDesignFromStorage(); hydrateMoldSettingsFromStorage(); hydrateHandleSettingsFromStorage();
  sprigDesign.hydrate(); markDesign.hydrate();
  const out = new Set<PieceKey>();
  if (useVaseStore.getState().isDirty) out.add('vase');
  const m = useMoldStore.getState();
  if (!same(m.params, m.savedParams ?? moldResetParams(m.params))) out.add('mold');
  const h = useHandleStore.getState();
  if (!same(h.params, h.savedParams ?? mergeHandleParameters(DEFAULT_HANDLE_PARAMETERS))) out.add('handle');
  for (const [key, d] of [['sprig', sprigDesign], ['mark', markDesign]] as const) {
    const s = d.useStore.getState();
    if (!same(s.params, s.savedParams ?? d.defaults)) out.add(key);
  }
  return out;
}

/** The file's vase differs from the one open (merged both sides, so a file
 *  from an older version isn't "different" just for a setting added since). */
export function vaseDiffers(c: FileContents): boolean {
  return !!c.vase && !same(vaseFromFile(c.vase), useVaseStore.getState().params);
}
