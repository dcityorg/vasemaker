'use client';

import { useRef, useEffect } from 'react';
import { DimensionControls } from '@/components/parameters/DimensionControls';
import { useVaseStore } from '@/store/vase-store';
import { useHistoryStore, skipNextHistoryRecord } from '@/store/history';
import { BUILT_IN_PRESETS } from '@/presets';
import { downloadSTL } from '@/engine/stl-export';
import { generateMesh } from '@/engine/mesh-generator';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';

export function Sidebar() {
  const { loadPreset, getParams, undo: doUndo, redo: doRedo } = useVaseStore();
  const { canUndo, canRedo } = useHistoryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleExportSTL = () => {
    const params = getParams();
    const mesh = generateMesh(params);
    downloadSTL(mesh, 'vasemaker-export.stl');
  };

  const handleSaveDesign = () => {
    const params = getParams();
    const json = JSON.stringify(params, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vase-design.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadDesign = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const loaded = JSON.parse(reader.result as string);
        const params = { ...DEFAULT_PARAMETERS, ...loaded };
        skipNextHistoryRecord();
        useHistoryStore.getState().clear();
        useVaseStore.setState({ params });
      } catch {
        alert('Invalid design file.');
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be loaded again
    e.target.value = '';
  };

  return (
    <div className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col">
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
        </div>
        <p className="text-xs text-[var(--text-secondary)]">Parametric 3D Vase Designer</p>
      </div>

      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-[var(--border-color)] flex flex-col gap-2">
        <select
          onChange={(e) => {
            const preset = BUILT_IN_PRESETS[parseInt(e.target.value)];
            if (preset) loadPreset(preset);
            e.target.value = '';
          }}
          value=""
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="" disabled>Select a starting vase</option>
          {BUILT_IN_PRESETS.map((p, i) => (
            <option key={i} value={i}>{p.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            onClick={handleSaveDesign}
            className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
            title="Save design as JSON"
          >
            Save Design
          </button>
          <button
            onClick={handleLoadDesign}
            className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
            title="Load design from JSON"
          >
            Load Design
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
      <div className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3">
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
    </div>
  );
}
