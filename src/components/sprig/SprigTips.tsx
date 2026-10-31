'use client';

/**
 * "Tips for best results": a button above Sample drawings and the box it
 * opens (Gary, 2026-10-30). The wording is in content/sprig-tips-content.ts.
 */

import { useEffect, useState } from 'react';
import { RELIEF_MAKER_URL, SPRIG_TIPS, SPRIG_TIPS_INTRO, SPRIG_TIPS_TITLE } from '@/content/sprig-tips-content';

export function SprigTipsButton({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}
        title="What to expect from SVGs, pictures and relief STLs, and how to get a good sprig">
        💡 Tips for best results
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onMouseDown={() => setOpen(false)}>
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[var(--border-color)]">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">{SPRIG_TIPS_TITLE}</h2>
              <button onClick={() => setOpen(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1" title="Close (Esc)">✕</button>
            </div>
            <div className="overflow-y-auto px-4 py-3 text-xs leading-relaxed text-[var(--text-secondary)]">
              <p className="mb-3">{SPRIG_TIPS_INTRO}</p>
              {SPRIG_TIPS.map((s, i) => (
                <div key={s.title} className="mb-3">
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">{s.title}</h3>
                  {s.body.map((t) => (t.startsWith('• ')
                    ? <p key={t} className="pl-3 -indent-2 mb-0.5">{t}</p>
                    : <p key={t} className="mb-1.5">{t}</p>))}
                  {i === 0 && RELIEF_MAKER_URL && (
                    <a href={RELIEF_MAKER_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">
                      Open MakerWorld’s Relief Sculpture Maker ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end px-4 py-2 border-t border-[var(--border-color)]">
              <button onClick={() => setOpen(false)} className="text-xs px-3 py-1 rounded bg-[var(--accent)] text-white">Got it</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
