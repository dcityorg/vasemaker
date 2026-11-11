/**
 * The Load list (Gary, 2026-11-11, local-docs/save-design-plan.md): what a
 * design file holds, piece by piece, and whether the tab it is loaded on needs
 * to ask. Pure — no stores; the list component and apply-pieces.ts use it, and
 * the tests call it directly.
 *
 *  - A mold file (several pieces) always shows the list, on any tab.
 *  - A one-piece file on another tab (a handle file on the Vase tab) shows it
 *    with its one line, instead of being refused.
 *  - A one-piece file on its own tab loads straight away, as before. Sprig and
 *    mark files are at home on either of the Sprig page's tabs.
 */
import type { VaseParameters } from '@/engine/types';
import type { HandleParameters } from '@/engine/handle/handle-types';
import { mergeHandleParameters } from '@/engine/handle/handle-types';
import { mergeSprigParameters, DEFAULT_MARK_PARAMETERS, type SprigParameters } from '@/engine/sprig/sprig-types';
import type { FootSettings } from '@/engine/mold/vase-foot';
import { ACTIVE_MOLD_STYLES, retiredSuccessor, type MoldStyle } from '@/engine/mold/mold-types';
import { designKind, readMoldFile, type DesignKind } from '@/lib/design-files';
import { withoutEnding, moldNameFromFile, ENDING, MOLD_STYLE_NAMES } from '@/lib/file-names';

export type Tab = 'vase' | 'mold' | 'handle' | 'sprig' | 'mark';
export type PieceKey = 'vase' | 'mold' | 'handle' | 'sprig' | 'mark';
export const PIECE_ORDER: PieceKey[] = ['vase', 'mold', 'handle', 'sprig', 'mark'];

export interface Piece {
  key: PieceKey;
  /** "Vase", "Mold", "Sprig → Sprig page" … */
  label: string;
  /** What it is: the vase's name, the mold style, the sprig's name; or why it is missing. */
  detail: string;
  /** In the file. A missing piece is shown greyed and can't be ticked. */
  present: boolean;
  /** Ticked when the list opens. */
  ticked: boolean;
}

export interface FileContents {
  kind: DesignKind;
  /** The file's name without .json (and without its ending, per piece below). */
  fileName: string;
  pieces: Piece[];
  vase: Partial<VaseParameters> | null;
  vaseName: string | null;
  mold: { settings: unknown; style: MoldStyle | null; name: string; legacyFoot: FootSettings | null } | null;
  handle: HandleParameters | null;
  handleName: string | null;
  sprig: SprigParameters | null;
  sprigName: string | null;
  mark: SprigParameters | null;
  markName: string | null;
  /** Sprig / mark pieces are the copies placed ON the file's vase (not a sprig or mark file). */
  fromVase: boolean;
}

const styleOf = (settings: unknown): MoldStyle | null => {
  const s = (settings as { moldStyle?: unknown } | null)?.moldStyle;
  return typeof s === 'string' && s in MOLD_STYLE_NAMES ? s as MoldStyle : null;
};

/** The sprig and the mark placed on a vase, if any. */
function vaseCopies(vase: Partial<VaseParameters> | null) {
  const t = vase?.textures?.sprig;
  const b = vase?.bottom;
  return {
    sprig: t?.sprig ? mergeSprigParameters(t.sprig) : null, sprigName: t?.sprig ? (t.sprigName || 'sprig') : null,
    mark: b?.mark ? mergeSprigParameters(b.mark, DEFAULT_MARK_PARAMETERS) : null, markName: b?.mark ? (b.markName || 'mark') : null,
  };
}

/** What a parsed design file holds; null when it is not a design file at all. */
export function readDesignFile(parsed: unknown, fileName: string): FileContents | null {
  const kind = designKind(parsed);
  if (kind === 'unknown') return null;
  const base: Omit<FileContents, 'pieces'> = {
    kind, fileName, vase: null, vaseName: null, mold: null, handle: null, handleName: null,
    sprig: null, sprigName: null, mark: null, markName: null, fromVase: false,
  };
  const p = parsed as Record<string, unknown>;
  if (kind === 'mold') {
    const f = readMoldFile(p);
    const style = styleOf(f.settings);
    const c = vaseCopies(f.vase);
    const c2: Omit<FileContents, 'pieces'> = {
      ...base, vase: f.vase, vaseName: f.vaseName, handle: f.handle, handleName: f.handleName,
      mold: { settings: f.settings, style, name: moldNameFromFile(fileName), legacyFoot: f.legacyFoot },
      ...c, fromVase: true,
    };
    return { ...c2, pieces: piecesFor(c2) };
  }
  if (kind === 'vase') {
    const vase = p as Partial<VaseParameters>;
    const c2 = { ...base, vase, vaseName: withoutEnding(fileName, [ENDING.vase]), ...vaseCopies(vase), fromVase: true };
    return { ...c2, pieces: piecesFor(c2) };
  }
  if (kind === 'handle') {
    const c2 = { ...base, handle: mergeHandleParameters((p as { settings?: unknown }).settings), handleName: withoutEnding(fileName, [ENDING.handle]) };
    return { ...c2, pieces: piecesFor(c2) };
  }
  // sprig / mark files: the design itself (its drawing inside), not a copy on a vase.
  const settings = mergeSprigParameters((p as { settings?: unknown }).settings, kind === 'mark' ? DEFAULT_MARK_PARAMETERS : undefined);
  const name = withoutEnding(fileName, [ENDING.sprig, ENDING.mark]);
  const c2 = kind === 'mark' ? { ...base, mark: settings, markName: name } : { ...base, sprig: settings, sprigName: name };
  return { ...c2, pieces: piecesFor(c2) };
}

/** The Mold line: its style, or for a hidden style, where its settings go. */
function moldDetail(style: MoldStyle | null): string {
  if (!style) return 'mold (your other styles stay as they are)';
  if (!ACTIVE_MOLD_STYLES.includes(style)) {
    return `${MOLD_STYLE_NAMES[style]}, no longer offered: its settings go to ${MOLD_STYLE_NAMES[retiredSuccessor(style)]}`;
  }
  return `${MOLD_STYLE_NAMES[style]} (your other styles stay as they are)`;
}

function piecesFor(c: Omit<FileContents, 'pieces'>): Piece[] {
  const missing = 'not in this file (keeps yours)';
  const out: Piece[] = [];
  const isMold = c.kind === 'mold';
  if (isMold || c.vase) out.push({ key: 'vase', label: 'Vase', present: !!c.vase, ticked: !!c.vase, detail: c.vase ? (c.vaseName || '(unnamed)') : missing });
  if (isMold) out.push({
    key: 'mold', label: 'Mold', present: true, ticked: true,
    detail: moldDetail(c.mold?.style ?? null),
  });
  if (isMold || c.handle) out.push({ key: 'handle', label: 'Handle', present: !!c.handle, ticked: !!c.handle, detail: c.handle ? (c.handleName || '(unnamed)') : missing });
  // On a vase the sprig and mark are COPIES: offered, unticked, for reuse on their own page.
  const copy = c.fromVase;
  if (isMold || c.sprig) out.push({
    key: 'sprig', label: 'Sprig → Sprig page', present: !!c.sprig, ticked: !!c.sprig && !copy,
    detail: c.sprig ? `${c.sprigName}${copy ? ' (the one on the vase)' : ''}` : 'no sprig on this vase',
  });
  if (isMold || c.mark) out.push({
    key: 'mark', label: 'Mark → Mark tab', present: !!c.mark, ticked: !!c.mark && !copy,
    detail: c.mark ? `${c.markName}${copy ? ' (the one on the vase)' : ''}` : 'no mark on this vase',
  });
  return out;
}

/** Does loading this file on this tab need the list? */
export function needsList(c: FileContents, tab: Tab): boolean {
  if (c.kind === 'mold') return true;
  if (c.kind === 'vase') return tab !== 'vase';
  if (c.kind === 'handle') return tab !== 'handle';
  return tab !== 'sprig' && tab !== 'mark';   // sprig and mark files
}
