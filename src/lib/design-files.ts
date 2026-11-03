/**
 * Reading saved design files: the steps the Load buttons take, kept out of
 * the components so the tests (tests/lib/load.ts) run this same code.
 * Pure — no stores, no dialogs; the sidebars decide what to ask and set.
 */
import { applyPreset } from '@/presets';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import type { VaseParameters } from '@/engine/types';
import { mergeMoldParameters, retireMoldStyle } from '@/engine/mold/mold-types';
import { footFromMoldSettings, isLegacyFootFile } from '@/engine/mold/vase-foot';
import { mergeHandleParameters, type HandleParameters } from '@/engine/handle/handle-types';
import { mergeSprigParameters, type SprigParameters } from '@/engine/sprig/sprig-types';

export type DesignKind = 'vase' | 'mold' | 'handle' | 'sprig' | 'mark' | 'unknown';

/** What kind of design a parsed file is. A vase file is a bare parameters object. */
export function designKind(parsed: unknown): DesignKind {
  if (!parsed || typeof parsed !== 'object') return 'unknown';
  const t = (parsed as { type?: unknown }).type;
  if (t === 'mold-settings') return 'mold';
  if (t === 'handle-settings') return 'handle';
  if (t === 'sprig-settings') return 'sprig';
  if (t === 'mark-settings') return 'mark';
  if ('radius' in parsed || 'profilePoints' in parsed) return 'vase';
  return 'unknown';
}

/** A vase file (Vase tab → Load Design): every setting it lacks takes its default. */
export function vaseFromFile(raw: unknown): VaseParameters {
  return applyPreset({ parameters: (raw ?? {}) as Partial<VaseParameters> });
}

export interface MoldFile {
  /** The mold settings as saved (merge them with moldFromSettings). */
  settings: unknown;
  /** A file from before the foot moved to the vase keeps its foot in the mold
   *  settings: this is that foot, to carry onto the vase. */
  legacyFoot: ReturnType<typeof footFromMoldSettings> | null;
  /** The file's vase, with its legacy foot put back; null for an old file without one. */
  vase: Partial<VaseParameters> | null;
  vaseName: string | null;
  /** The file's handle, merged; null when it has none. */
  handle: HandleParameters | null;
  handleName: string | null;
}

/** A mold file (Mold tab → Load Design), parsed. */
export function readMoldFile(parsed: { settings?: unknown; vase?: unknown; handle?: unknown; vaseName?: unknown; handleName?: unknown }): MoldFile {
  const legacyFoot = isLegacyFootFile(parsed.vase) ? footFromMoldSettings(parsed.settings) : null;
  const rawVase = parsed.vase && typeof parsed.vase === 'object' ? parsed.vase as Partial<VaseParameters> : null;
  return {
    settings: parsed.settings,
    legacyFoot,
    vase: rawVase && legacyFoot ? { ...rawVase, bottom: { ...DEFAULT_PARAMETERS.bottom, ...legacyFoot } } : rawVase,
    vaseName: typeof parsed.vaseName === 'string' ? parsed.vaseName : null,
    handle: parsed.handle && typeof parsed.handle === 'object' ? mergeHandleParameters(parsed.handle) : null,
    handleName: typeof parsed.handleName === 'string' ? parsed.handleName : null,
  };
}

/** Saved mold settings → the settings to open: merged, and a hidden style moved to its successor. */
export function moldFromSettings(settings: unknown) {
  return retireMoldStyle(mergeMoldParameters(settings));
}

/** A handle file (Handle tab → Load Settings). */
export function handleFromFile(parsed: { settings?: unknown }): HandleParameters {
  return mergeHandleParameters(parsed.settings);
}

/** A sprig or mark file (Sprig / Mark tab → Load Settings), over that tab's defaults. */
export function sprigFromFile(parsed: { settings?: unknown }, defaults?: SprigParameters): SprigParameters {
  return mergeSprigParameters(parsed.settings, defaults);
}
