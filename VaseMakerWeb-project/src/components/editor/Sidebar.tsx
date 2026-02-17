'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { DimensionControls } from '@/components/parameters/DimensionControls';
import { useVaseStore } from '@/store/vase-store';
import { useHistoryStore, skipNextHistoryRecord } from '@/store/history';
import { skipNextDirtyMark } from '@/store/vase-store';
import { BUILT_IN_PRESETS, applyPreset } from '@/presets';
import { downloadSTL } from '@/engine/stl-export';
import { generateMesh } from '@/engine/mesh-generator';
import { UI_MUTED } from '@/config/colors';

export function Sidebar({ helpOpen, onToggleHelp }: { helpOpen: boolean; onToggleHelp: () => void }) {
  const { loadPreset, getParams, isDirty, markClean, undo: doUndo, redo: doRedo } = useVaseStore();
  const { canUndo, canRedo } = useHistoryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [designName, setDesignName] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  const handleToggleAll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const details = container.querySelectorAll('details');
    const allOpen = Array.from(details).every(d => d.open);
    details.forEach(d => d.open = !allOpen);
  }, []);

  // Keyboard shortcuts: Cmd+Z / Cmd+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          doRedo();
        } else {
          doUndo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doUndo, doRedo]);

  /** If dirty, show confirmation dialog; otherwise run immediately */
  const guardDirty = (action: () => void) => {
    if (isDirty) {
      setConfirmAction(() => action);
    } else {
      action();
    }
  };

  const handleExportSTL = () => {
    const params = getParams();
    const mesh = generateMesh(params);
    const stlName = designName ? `${designName}.stl` : 'vasemaker-export.stl';
    downloadSTL(mesh, stlName);
  };

  const handleSaveDesign = () => {
    const params = getParams();
    const json = JSON.stringify(params, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const saveName = designName || 'vase-design';
    a.download = `${saveName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDesignName(saveName);
    markClean();
  };

  const handleLoadDesign = () => {
    guardDirty(() => fileInputRef.current?.click());
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Extract name without .json extension for reuse in Save/Export
    const baseName = file.name.replace(/\.json$/i, '');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const loaded = JSON.parse(reader.result as string);
        const params = applyPreset({ parameters: loaded });
        skipNextHistoryRecord();
        skipNextDirtyMark();
        useHistoryStore.getState().clear();
        useVaseStore.setState({ params, isDirty: false });
        setDesignName(baseName);
      } catch {
        alert('Invalid design file.');
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be loaded again
    e.target.value = '';
  };

  return (
    <div className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] flex-1">VaseMaker</h1>
          <button
            onClick={doUndo}
            disabled={!canUndo}
            className="text-lg leading-none px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-25 disabled:cursor-default"
            title="Undo (⌘Z)"
          >
            ↶
          </button>
          <button
            onClick={doRedo}
            disabled={!canRedo}
            className="text-lg leading-none px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-25 disabled:cursor-default"
            title="Redo (⌘⇧Z)"
          >
            ↷
          </button>
          <button
            onClick={handleToggleAll}
            className="text-xs leading-none px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-secondary)]"
            title="Expand/collapse all sections"
          >
            &#x2195;
          </button>
          <button
            onClick={onToggleHelp}
            className={`text-sm font-bold leading-none w-6 h-6 rounded-full flex items-center justify-center transition-colors ${helpOpen ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
            title="Toggle help panel"
          >
            ?
          </button>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">Parametric 3D Vase Designer — v0.74</p>
      </div>

      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-[var(--border-color)] flex flex-col gap-2">
        <select
          onChange={(e) => {
            const preset = BUILT_IN_PRESETS[parseInt(e.target.value)];
            if (preset) {
              guardDirty(() => {
                loadPreset(preset);
                setDesignName(null);
              });
            }
            e.target.value = '';
          }}
          value=""
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs"
          style={{ color: UI_MUTED }}
        >
          <option value="" disabled>Select a starting vase</option>
          {BUILT_IN_PRESETS.map((p, i) => (
            <option key={i} value={i}>{p.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            onClick={handleLoadDesign}
            className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
            title="Load design from JSON"
          >
            Load Design
          </button>
          <button
            onClick={handleSaveDesign}
            className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
            title="Save design as JSON"
          >
            Save Design
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelected}
            className="hidden"
          />
        </div>
      </div>

      {/* Parameter controls — scrollable */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3">
        <DimensionControls />
      </div>

      {/* Export button — fixed at bottom */}
      <div className="px-3 py-3 border-t border-[var(--border-color)]">
        <button
          onClick={handleExportSTL}
          className="w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded transition-colors"
        >
          Export STL
        </button>
      </div>

      {/* Unsaved changes confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg p-5 max-w-sm mx-4 shadow-xl">
            <p className="text-sm text-[var(--text-primary)] mb-4">
              You have unsaved changes. Save first?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  handleSaveDesign();
                  confirmAction();
                  setConfirmAction(null);
                }}
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded transition-colors"
              >
                Save &amp; Continue
              </button>
              <button
                onClick={() => {
                  confirmAction();
                  setConfirmAction(null);
                }}
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] text-[var(--text-primary)] transition-colors"
              >
                Don&apos;t Save
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
