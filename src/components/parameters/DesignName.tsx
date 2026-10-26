'use client';

/**
 * The name row under each tool's header, and the "name it first" box shown
 * when a Save or Export finds it still unnamed. Shared by the Vase, Mold,
 * Handle and Sprig sidebars (Gary, 2026-10-25: people forgot to name things
 * and saved several files under the same default name, and one "Design Name"
 * label on every page read as if the four shared one name).
 *
 * Each tool keeps its OWN name; nothing here links them.
 */

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

/** Name row: a bar above it, "<What> Name:", and the name — yellow while unnamed. */
export function DesignNameRow({ what, name, unnamed, dirty, onRename }: {
  /** 'Vase', 'Mold', 'Handle', 'Sprig'. */
  what: string;
  name: string;
  unnamed: boolean;
  /** Vase only: unsaved changes since the last save/load. */
  dirty?: boolean;
  /** Called with the trimmed text; '' means "clear it back to unnamed". */
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const finish = (val: string) => { onRename(val.trim()); setEditing(false); };
  return (
    <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-[var(--border-color)]">
      <span className="text-xs text-[var(--text-secondary)] shrink-0">{what} Name:</span>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          defaultValue={unnamed ? '' : name}
          placeholder={`Name this ${what.toLowerCase()}`}
          className="text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1 py-0.5 flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(e.currentTarget.value);
            else if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={(e) => finish(e.currentTarget.value)}
        />
      ) : (
        <p
          className={`text-xs truncate cursor-pointer transition-colors flex-1 min-w-0 ${unnamed ? 'text-amber-300 hover:text-amber-200' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          title={unnamed
            ? `This ${what.toLowerCase()} has no name yet. Click to name it — the name is used for its saved files`
            : `Click to rename this ${what.toLowerCase()}`}
          onClick={() => {
            setEditing(true);
            requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
          }}
        >
          {dirty && <span className="text-[var(--accent)]">* </span>}
          {unnamed ? 'Not named yet — click to name' : name}
        </p>
      )}
    </div>
  );
}

// ── "Name it first" box ──────────────────────────────────────────────────────

interface Ask { what: string; resolve: (name: string | null) => void }
const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }));

/** Ask for a name; resolves to the trimmed name, or null on Cancel. */
export function askForName(what: string): Promise<string | null> {
  return new Promise((resolve) => {
    useAsk.getState().ask?.resolve(null);   // only one box at a time
    useAsk.setState({ ask: { what, resolve } });
  });
}

/**
 * The name to save under: `current` if it already has one, otherwise asks
 * (and stores the answer with `setName`). Null = the user cancelled.
 */
export async function ensureNamed(what: string, unnamed: boolean, current: string, setName: (n: string) => void): Promise<string | null> {
  if (!unnamed) return current;
  const n = await askForName(what);
  if (n) setName(n);
  return n;
}

/** Mount once per page (each sidebar renders one). */
export function NamePromptHost() {
  const ask = useAsk((s) => s.ask);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!ask) return;
    setText('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [ask]);
  if (!ask) return null;
  const close = (name: string | null) => { useAsk.setState({ ask: null }); ask.resolve(name); };
  const ok = text.trim().length > 0;
  const lower = ask.what.toLowerCase();
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center" onMouseDown={() => close(null)}>
      <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg p-4 w-80 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Name this {lower} first</h2>
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          The name is used for its files, so each {lower} you save gets its own.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={text}
          placeholder={`${ask.what} name`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ok) close(text.trim());
            else if (e.key === 'Escape') close(null);
          }}
          className="w-full text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 outline-none focus:border-[var(--accent)]"
        />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={() => close(null)} className="text-xs px-3 py-1 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]">Cancel</button>
          <button onClick={() => ok && close(text.trim())} disabled={!ok} className="text-xs px-3 py-1 rounded bg-[var(--accent)] text-white disabled:opacity-40">Continue</button>
        </div>
      </div>
    </div>
  );
}
