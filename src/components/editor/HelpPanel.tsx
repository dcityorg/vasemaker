'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { HELP_SECTIONS, type HelpBlock } from '@/content/help-content';

function renderBlock(block: HelpBlock, index: number) {
  switch (block.type) {
    case 'paragraph':
      return <p key={index} className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">{block.text}</p>;

    case 'heading':
      return <h3 key={index} className="text-sm font-semibold text-[var(--text-primary)] mt-4 mb-2">{block.text}</h3>;

    case 'list':
      return (
        <ul key={index} className="text-sm text-[var(--text-secondary)] mb-3 pl-4 space-y-1">
          {block.items.map((item, i) => (
            <li key={i} className="list-disc leading-relaxed">{item}</li>
          ))}
        </ul>
      );

    case 'tip':
      return (
        <div key={index} className="text-sm mb-3 px-3 py-2 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--text-secondary)] leading-relaxed">
          <span className="font-medium text-[var(--accent)]">Tip: </span>{block.text}
        </div>
      );

    case 'table':
      return (
        <div key={index} className="mb-3 overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="text-left py-1 px-2 border-b border-[var(--border-color)] text-[var(--text-primary)] font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="py-1 px-2 border-b border-[var(--border-color)]/50 text-[var(--text-secondary)]">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'keyvalue':
      return (
        <div key={index} className="mb-3 space-y-1">
          {block.items.map((item, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-[var(--text-primary)] font-medium shrink-0">{item.key}</span>
              <span className="text-[var(--text-secondary)]">{item.value}</span>
            </div>
          ))}
        </div>
      );
  }
}

const MIN_WIDTH = 240;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 320;

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      // Dragging left edge: moving mouse left = wider panel
      const delta = startX.current - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div
      className="h-full bg-[var(--bg-panel)] border-l border-[var(--border-color)] flex flex-col help-panel-enter shrink-0 relative"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50 transition-colors z-10"
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      />
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex-1">Help</h2>
        <button
          onClick={onClose}
          className="text-lg leading-none px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          title="Close help"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3">
        {HELP_SECTIONS.map((section, si) => (
          <details key={section.id} open={si === 0} className="mb-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] py-2 px-3 bg-[var(--bg-secondary)] rounded select-none hover:bg-[var(--border-color)] transition-colors">
              {section.title}
            </summary>
            <div className="pt-3 px-3 ml-2 border-l-2 border-[var(--border-color)]">
              {section.blocks.map((block, bi) => renderBlock(block, bi))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
