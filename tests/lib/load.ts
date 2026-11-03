/**
 * Load a saved design file the way the app's Load buttons do, and build it
 * the way its pages do. The app does this inside React components
 * (MoldSidebar.applySettingsText / applyMoldOnly, HandleSidebar and
 * SprigSidebar.applySettingsText, vase-store.loadDesign, use-mold-meshes.ts
 * buildMold), so these lines MIRROR that code: change one, change the other.
 */
import { applyPreset } from '@/presets';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import type { VaseParameters } from '@/engine/types';
import { mergeMoldParameters, retireMoldStyle, moldUsesHandle, type MoldParameters } from '@/engine/mold/mold-types';
import { moldWithVaseFoot, footFromMoldSettings, isLegacyFootFile } from '@/engine/mold/vase-foot';
import { mergeHandleParameters, type HandleParameters } from '@/engine/handle/handle-types';
import { mergeSprigParameters, type SprigParameters } from '@/engine/sprig/sprig-types';
import { generateMoldMeshes } from '@/engine/mold/mold-generator';
import { generateOnePieceMold } from '@/engine/mold/one-piece-generator';
import { generatePourTwoPieceMold } from '@/engine/mold/pour-two-piece-generator';
import { generatePourThreePieceMold } from '@/engine/mold/pour-three-piece-generator';
import { generateSplitTwoPieceMold } from '@/engine/mold/split-two-piece-generator';
import { generateSplitHalvesMold } from '@/engine/mold/split-halves-generator';
import { generateSplitThirdsMold } from '@/engine/mold/split-thirds-generator';

export type Kind = 'vase' | 'mold' | 'handle' | 'sprig' | 'mark' | 'unknown';

/** What a Load button would make of the file (the same tests the sidebars use). */
export function kindOf(parsed: unknown): Kind {
  if (!parsed || typeof parsed !== 'object') return 'unknown';
  const t = (parsed as { type?: unknown }).type;
  if (t === 'mold-settings') return 'mold';
  if (t === 'handle-settings') return 'handle';
  if (t === 'sprig-settings') return 'sprig';
  if (t === 'mark-settings') return 'mark';
  if ('radius' in parsed || 'profilePoints' in parsed) return 'vase';
  return 'unknown';
}

/** Vase tab → Load Design (vase-store.loadDesign). */
export const loadVase = (raw: unknown): VaseParameters => applyPreset({ parameters: (raw ?? {}) as Partial<VaseParameters> });

/** Mold tab → Load Design, taking the file's vase and handle (the "use the file's" answer). */
export function loadMold(parsed: { settings?: unknown; vase?: unknown; handle?: unknown }, openVase: VaseParameters = loadVase({})) {
  const legacyFoot = isLegacyFootFile(parsed.vase) ? footFromMoldSettings(parsed.settings) : null;
  const rawVase = parsed.vase && typeof parsed.vase === 'object' ? parsed.vase : null;
  const fileVase = rawVase && legacyFoot ? { ...rawVase, bottom: { ...DEFAULT_PARAMETERS.bottom, ...legacyFoot } } : rawVase;
  let vase = fileVase ? loadVase(fileVase) : openVase;
  if (!fileVase && legacyFoot) vase = { ...vase, bottom: { ...vase.bottom, ...legacyFoot } };
  const { params: stored, retired } = retireMoldStyle(mergeMoldParameters(parsed.settings));
  const handle = parsed.handle && typeof parsed.handle === 'object' ? mergeHandleParameters(parsed.handle) : null;
  return { vase, stored, mold: moldWithVaseFoot(stored, vase), handle, retired };
}

/** The Mold page's build (use-mold-meshes.ts buildMold), without a mark or sprig field. */
export function buildMold(vase: VaseParameters, mold: MoldParameters, handleIfUsed: HandleParameters | null) {
  const handle = moldUsesHandle(mold) ? handleIfUsed : null;
  switch (mold.moldStyle) {
    case 'onePiece': return generateOnePieceMold(vase, mold);
    case 'pourTwoPiece': return generatePourTwoPieceMold(vase, mold);
    case 'pourThreePiece': return generatePourThreePieceMold(vase, mold);
    case 'splitTwoPiece': return generateSplitTwoPieceMold(vase, mold, handle);
    case 'splitHalves': return generateSplitHalvesMold(vase, mold, handle);
    case 'splitThirds': return generateSplitThirdsMold(vase, mold);
    default: return generateMoldMeshes(vase, mold);
  }
}

/** Handle tab → Load Settings. */
export const loadHandle = (parsed: { settings?: unknown }): HandleParameters => mergeHandleParameters(parsed.settings);

/** Sprig / Mark tab → Load Settings (merged over the tab's defaults; the Sprig tab's here). */
export const loadSprig = (parsed: { settings?: unknown }): SprigParameters => mergeSprigParameters(parsed.settings);
