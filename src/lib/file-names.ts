/**
 * Saved file names say what they are (Gary, 2026-11-11, local-docs/save-design-plan.md):
 * "Tall Tumbler – Vase.json", "Tall Tumbler – Split Halves.json", "D Handle – Handle.json",
 * "DragonFly1 – Sprig.json", "GM Mark – Mark.json". So files from different tabs can never
 * replace each other, and a folder shows what each one is. The ending is never added twice
 * and is taken off again on Load, so the design's own name stays "Tall Tumbler".
 * Old files load whatever they are called: Load reads what a file is from its contents.
 */
import type { MoldStyle } from '@/engine/mold/mold-types';

/** What each tab adds. */
export const ENDING = { vase: 'Vase', handle: 'Handle', sprig: 'Sprig', mark: 'Mark' } as const;

/** Every mold style's name as shown on its tab (hidden styles too, for old files). */
export const MOLD_STYLE_NAMES: Record<MoldStyle, string> = {
  twoPart: 'Press 2-Pc', onePiece: 'Pour 1-Pc', pourTwoPiece: 'Pour 2-Pc', pourThreePiece: 'Pour 3-Pc',
  splitTwoPiece: 'Split 2-Pc', splitHalves: 'Split Halves', splitThirds: 'Split Thirds',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** " – Ending" at the very end, with any dash (-, –, —) and any case. */
const endingAt = (ending: string) => new RegExp(`\\s+[-–—]\\s+${escape(ending)}$`, 'i');

/**
 * `name` with " – ending" added, unless it is already there. `ifNamed`: also
 * leave it off when the name already says it anywhere (a mold named "Tall
 * Tumbler Split Halves" doesn't need "– Split Halves").
 */
export function withEnding(name: string, ending: string, ifNamed = false): string {
  const n = name.trim();
  if (endingAt(ending).test(n)) return n;
  if (ifNamed && n.toLowerCase().includes(ending.toLowerCase())) return n;
  return `${n} – ${ending}`;
}

/** `name` with one of these endings taken off (the first that matches), for the design's own name on Load. */
export function withoutEnding(name: string, endings: readonly string[]): string {
  const n = name.trim();
  for (const e of endings) {
    const re = endingAt(e);
    if (re.test(n)) {
      const base = n.replace(re, '').trim();
      return base || n;
    }
  }
  return n;
}

/** A mold file's name: the mold's name with its style. */
export const moldFileName = (name: string, style: MoldStyle) => withEnding(name, MOLD_STYLE_NAMES[style], true);
/** The mold's own name from a mold file's name. */
export const moldNameFromFile = (fileName: string) => withoutEnding(fileName, Object.values(MOLD_STYLE_NAMES));
