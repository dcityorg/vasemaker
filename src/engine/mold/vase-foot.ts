/**
 * The foot belongs to the VASE since 2026-10-26 (Bottom Mark phase 3, Gary):
 * one Foot switch and four numbers on the Vase tab decide the bottom of the
 * plastic print and of every mold style. MoldParameters keeps its foot fields
 * so old files still load, but generators are handed the vase's values here.
 *
 * Old mold files carried their own foot — what was actually poured — and it
 * WINS when such a file loads (`footFromMoldSettings` → the vase). That is
 * what lets an existing Halves/Thirds plug mold be retrofitted with a mark:
 * load its file, add the mark, and only the plug disk changes.
 */

import type { BottomSettings, VaseParameters } from '../types';
import { mergeMoldParameters, type MoldParameters, type MoldStyle } from './mold-types';

export type FootSettings = Pick<BottomSettings, 'footOn' | 'footWidth' | 'footSlopeWidth' | 'footHeight' | 'footSmoothInner'>;

/** Styles whose foot was the plug disk's recess (no on/off switch: depth 0 = flat). */
const PLUG_STYLES: MoldStyle[] = ['splitHalves', 'splitThirds'];

/** Mold settings with the foot taken from the vase. Foot off = a flat bottom:
 *  footEnabled false for the master styles, depth 0 for the plug disk. */
export function moldWithVaseFoot(m: MoldParameters, v: VaseParameters): MoldParameters {
  const b = v.bottom;
  if (!b) return m;
  return {
    ...m,
    footEnabled: b.footOn,
    footWidth: b.footWidth,
    footSlopeWidth: b.footSlopeWidth,
    footHeight: b.footOn ? b.footHeight : 0,
    footSmoothInner: b.footSmoothInner,
  };
}

/** The foot an OLD mold settings object describes, as the vase's foot. */
export function footFromMoldSettings(raw: unknown): FootSettings {
  const m = mergeMoldParameters(raw);
  const recessed = m.footHeight > 0 && m.footSlopeWidth > 0;
  const on = m.moldStyle === 'splitTwoPiece' ? false
    : PLUG_STYLES.includes(m.moldStyle) ? recessed
      : m.footEnabled && recessed;
  return {
    footOn: on, footWidth: m.footWidth, footSlopeWidth: m.footSlopeWidth,
    footHeight: m.footHeight, footSmoothInner: m.footSmoothInner,
  };
}

/** A mold file from before the foot moved: its vase copy (if any) has no
 *  `bottom`, so its foot lives only in the mold settings. */
export function isLegacyFootFile(fileVase: unknown): boolean {
  return !fileVase || typeof fileVase !== 'object' || !('bottom' in (fileVase as object));
}

/** Same foot? (Compared on the numbers that shape it.) */
export function sameFoot(a: FootSettings, b: FootSettings): boolean {
  if (a.footOn !== b.footOn) return false;
  if (!a.footOn) return true;
  return a.footWidth === b.footWidth && a.footSlopeWidth === b.footSlopeWidth
    && a.footHeight === b.footHeight && a.footSmoothInner === b.footSmoothInner;
}
