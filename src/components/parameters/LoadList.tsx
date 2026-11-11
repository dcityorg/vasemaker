'use client';

/**
 * The Load list (Gary, 2026-11-11, local-docs/save-design-plan.md): what a
 * design file holds, each piece with a tick. Pieces the file doesn't have are
 * shown greyed, with what happens instead, so an old file shows what is in it
 * and what is missing. Shown by any tab's Load Design when it helps
 * (needsList in lib/load-pieces.ts). Replaces the Mold tab's old "This mold
 * was saved with a different vase" box, keeping its "Save mine, then load".
 */

import { useState } from 'react';
import { create } from 'zustand';
import type { FileContents, PieceKey } from '@/lib/load-pieces';
import { applyPieces, unsavedPieces, vaseDiffers } from '@/lib/apply-pieces';
import { saveCurrentVase, saveCurrentHandle } from '@/lib/save-pieces';

interface Pending { contents: FileContents; unsaved: Set<PieceKey>; vaseDiffers: boolean; done?: () => void }
const useLoadList = create<{ pending: Pending | null }>(() => ({ pending: null }));

/** Open the list for a file. `done` runs after a Load (not after Cancel). */
export function showLoadList(contents: FileContents, done?: () => void) {
  useLoadList.setState({ pending: { contents, unsaved: unsavedPieces(), vaseDiffers: vaseDiffers(contents), done } });
}

const PIECE_WORD: Record<PieceKey, string> = { vase: 'vase', mold: 'mold', handle: 'handle', sprig: 'sprig', mark: 'mark' };

export function LoadListHost() {
  const pending = useLoadList((s) => s.pending);
  if (!pending) return null;
  // Keyed on the file, so a second file opens with its own fresh ticks.
  return <LoadListBox key={pending.contents.fileName + pending.contents.kind} pending={pending} />;
}

function LoadListBox({ pending }: { pending: Pending }) {
  const { contents: c, unsaved } = pending;
  const [ticked, setTicked] = useState<Set<PieceKey>>(() => new Set(c.pieces.filter((p) => p.ticked).map((p) => p.key)));
  const close = () => useLoadList.setState({ pending: null });
  const load = () => { close(); applyPieces(c, ticked); pending.done?.(); };
  const flip = (k: PieceKey) => setTicked((t) => { const n = new Set(t); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const losing = c.pieces.filter((p) => p.present && ticked.has(p.key) && unsaved.has(p.key)).map((p) => p.key);
  const canSaveFirst = losing.filter((k) => k === 'vase' || k === 'handle');
  const moldOnOtherVase = ticked.has('mold') && !ticked.has('vase') && pending.vaseDiffers;
  const list = (ks: PieceKey[]) => ks.map((k) => PIECE_WORD[k]).join(ks.length > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={close}>
      <div data-load-list className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg p-5 w-[26rem] max-w-[calc(100vw-2rem)] shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-sm text-[var(--text-primary)] mb-1 font-medium break-words">Load Design: “{c.fileName}”</h2>
        <p className="text-xs text-[var(--text-secondary)] mb-3">Tick what to load. An unticked piece keeps what you have open.</p>
        <div className="flex flex-col gap-1.5 mb-3">
          {c.pieces.map((p) => (
            <label key={p.key} data-piece={p.key} data-present={p.present ? '1' : '0'}
              className={`flex items-start gap-2 text-xs ${p.present ? 'cursor-pointer text-[var(--text-primary)]' : 'opacity-45 cursor-default text-[var(--text-secondary)]'}`}>
              <input type="checkbox" className="mt-0.5" disabled={!p.present} checked={p.present && ticked.has(p.key)} onChange={() => flip(p.key)} />
              <span className="w-36 shrink-0">{p.label}</span>
              <span className="text-[var(--text-secondary)] break-words min-w-0">{p.detail}</span>
            </label>
          ))}
        </div>
        {losing.length > 0 && (
          <p data-amber className="text-xs text-amber-300 mb-2">Your open {list(losing)} {losing.length > 1 ? 'have' : 'has'} unsaved changes.</p>
        )}
        {moldOnOtherVase && (
          <p data-amber className="text-xs text-amber-300 mb-2">This mold was made for {c.vaseName || 'the vase in the file'}; it will be fitted to the vase you have open.</p>
        )}
        <div className="flex flex-wrap gap-2 mt-3">
          {canSaveFirst.length > 0 && (
            <button
              onClick={async () => {
                // One save dialog per unsaved design; cancelling either stops the load.
                if (canSaveFirst.includes('vase') && !(await saveCurrentVase())) return;
                if (canSaveFirst.includes('handle') && !(await saveCurrentHandle(canSaveFirst.includes('vase')))) return;
                load();
              }}
              className="flex-1 px-3 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded transition-colors"
              title={`Save your open ${list(canSaveFirst)} to a file first, then load`}
            >
              Save mine, then load
            </button>
          )}
          <button
            onClick={load}
            disabled={ticked.size === 0}
            className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors disabled:opacity-40 ${canSaveFirst.length
              ? 'bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-primary)]'
              : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white'}`}
            title={losing.length ? 'Load the ticked pieces, dropping your unsaved changes to them' : 'Load the ticked pieces'}
          >
            {losing.length ? 'Load anyway' : 'Load'}
          </button>
          <button onClick={close} className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
