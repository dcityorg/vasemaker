'use client';

/**
 * The second header row on every tool: all four tools in the same order on
 * every page (the current one highlighted, not a link) — Vase, Handle,
 * Mold, Sprig: the order most projects go in (Gary), and "? Help" on the
 * right. Gary, 2026-10-25: getting from Sprig to Handle meant going back to
 * Vase first; with all four always in the same place it is one click.
 */

import Link from 'next/link';

export type ToolId = 'vase' | 'mold' | 'handle' | 'sprig';

const TOOLS: { id: ToolId; label: string; href: string; title: string }[] = [
  { id: 'vase', label: 'Vase', href: '/', title: 'The vase designer' },
  { id: 'handle', label: 'Handle', href: '/handle', title: 'Design a handle and its plaster casting mold' },
  { id: 'mold', label: 'Mold', href: '/mold', title: 'Make a plaster casting mold from this vase' },
  { id: 'sprig', label: 'Sprig/Mark', href: '/sprig', title: 'Turn a drawing, picture or text into a sprig and its plaster mold, or into a maker\'s mark for the bottom of a piece' },
];

const base = 'text-xs px-1.5 py-0.5 rounded border transition-colors whitespace-nowrap';

export function ToolNav({ current, helpOpen, onToggleHelp }: {
  current: ToolId; helpOpen: boolean; onToggleHelp: () => void;
}) {
  return (
    <div className="flex items-center gap-1 mt-1.5">
      {TOOLS.map((t) => t.id === current ? (
        <span key={t.id} className={`${base} border-[var(--accent)] text-[var(--text-primary)] bg-[var(--bg-secondary)]`} title="You are here">
          {t.label}
        </span>
      ) : (
        <Link key={t.id} href={t.href} title={t.title}
          className={`${base} bg-[var(--bg-secondary)] border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-secondary)]`}>
          {t.label}
        </Link>
      ))}
      <button
        onClick={onToggleHelp}
        className={`ml-auto ${base} ${helpOpen ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-secondary)]'}`}
        title="Show or hide the help panel"
      >
        ? Help
      </button>
    </div>
  );
}
