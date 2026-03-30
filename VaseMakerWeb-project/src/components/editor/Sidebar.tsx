'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { DimensionControls } from '@/components/parameters/DimensionControls';
import { useVaseStore } from '@/store/vase-store';
import { useHistoryStore, skipNextHistoryRecord } from '@/store/history';
import { skipNextDirtyMark } from '@/store/vase-store';
import { BUILT_IN_PRESETS, applyPreset } from '@/presets';
import { generateSTL } from '@/engine/stl-export';
import { generateMesh } from '@/engine/mesh-generator';
import { UI_MUTED } from '@/config/colors';
import { saveDesignFile, openDesignFile, saveSTLFile } from '@/lib/image-capture';
import { CAPTURE_SIZE_PRESETS, CUSTOM_SIZE_INDEX } from '@/config/capture';
import type { CaptureFormat } from '@/config/capture';

interface SidebarProps {
  helpOpen: boolean;
  onToggleHelp: () => void;
  designName: string | null;
  onDesignNameChange: (name: string | null) => void;
  captureActive: boolean;
  captureSizeIndex: number;
  customWidth: number;
  customHeight: number;
  captureFormat: CaptureFormat;
  onCaptureSizeIndexChange: (i: number) => void;
  onCustomWidthChange: (w: number) => void;
  onCustomHeightChange: (h: number) => void;
  onCaptureFormatChange: (f: CaptureFormat) => void;
  onStartCapture: () => void;
  onSaveCapture: () => void;
  onCancelCapture: () => void;
}

export function Sidebar({
  helpOpen, onToggleHelp,
  designName, onDesignNameChange,
  captureActive, captureSizeIndex, customWidth, customHeight, captureFormat,
  onCaptureSizeIndexChange, onCustomWidthChange, onCustomHeightChange, onCaptureFormatChange,
  onStartCapture, onSaveCapture, onCancelCapture,
}: SidebarProps) {
  const { loadPreset, getParams, isDirty, markClean, undo: doUndo, redo: doRedo } = useVaseStore();
  const { canUndo, canRedo } = useHistoryStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [editingName, setEditingName] = useState(false);

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

  const handleExportSTL = async () => {
    const params = getParams();
    const mesh = generateMesh(params);
    const stlName = designName ? `${designName}.stl` : 'vasemaker-export.stl';
    const buffer = generateSTL(mesh);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    await saveSTLFile(blob, stlName);
  };

  const handleSaveDesign = async () => {
    const params = getParams();
    const json = JSON.stringify(params, null, 2);
    const suggestedName = designName || 'vase-design';
    const chosenName = await saveDesignFile(json, suggestedName);
    if (chosenName !== null) {
      onDesignNameChange(chosenName);
      markClean();
    }
  };

  const handleLoadDesign = () => {
    guardDirty(async () => {
      // Try File System Access API first (remembers directory)
      const result = await openDesignFile();
      if (result) {
        try {
          const loaded = JSON.parse(result.text);
          const params = applyPreset({ parameters: loaded });
          skipNextHistoryRecord();
          skipNextDirtyMark();
          useHistoryStore.getState().clear();
          useVaseStore.setState({ params, isDirty: false });
          onDesignNameChange(result.name);
        } catch {
          alert('Invalid design file.');
        }
        return;
      }
      // Fallback: file input (Firefox / API not available)
      fileInputRef.current?.click();
    });
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
        onDesignNameChange(baseName);
      } catch {
        alert('Invalid design file.');
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be loaded again
    e.target.value = '';
  };

  const isCustomSize = captureSizeIndex === CUSTOM_SIZE_INDEX;

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
        <p className="text-xs text-[var(--text-secondary)]">Parametric 3D Vase Designer — v0.905</p>
        {editingName ? (
          <input
            ref={nameInputRef}
            type="text"
            defaultValue={designName || ''}
            placeholder="Untitled"
            className="text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1 py-0.5 w-full outline-none focus:border-[var(--accent)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = e.currentTarget.value.trim();
                onDesignNameChange(val || null);
                setEditingName(false);
              } else if (e.key === 'Escape') {
                setEditingName(false);
              }
            }}
            onBlur={(e) => {
              const val = e.currentTarget.value.trim();
              onDesignNameChange(val || null);
              setEditingName(false);
            }}
          />
        ) : (
          <p
            className="text-xs text-[var(--text-secondary)] truncate cursor-pointer hover:text-[var(--text-primary)] transition-colors"
            title="Click to rename design"
            onClick={() => {
              setEditingName(true);
              requestAnimationFrame(() => {
                nameInputRef.current?.focus();
                nameInputRef.current?.select();
              });
            }}
          >
            {isDirty && <span className="text-[var(--accent)]">* </span>}
            {designName || 'Untitled'}
          </p>
        )}
      </div>

      {/* Scrollable area — toolbar + parameter controls */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto sidebar-scroll">

      {/* Toolbar — all file operations grouped together */}
      <div className="px-3 py-2 border-b border-[var(--border-color)] flex flex-col gap-2">
        {/* Presets */}
        <select
          onChange={(e) => {
            const preset = BUILT_IN_PRESETS[parseInt(e.target.value)];
            if (preset) {
              guardDirty(() => {
                loadPreset(preset);
                onDesignNameChange(preset.name);
              });
            }
            e.target.value = '';
          }}
          value=''
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs"
          style={{ color: UI_MUTED }}
        >
          <option value='' disabled>Select a starting vase</option>
          {BUILT_IN_PRESETS.map((p, i) => (
            <option key={i} value={i}>{p.name}</option>
          ))}
        </select>

        {/* ── Design files ── */}
        <div className="border-t-[3px] border-[#555] pt-2 flex gap-2">
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

        {/* ── Image capture ── */}
        <div className="border-t-[3px] border-[#555] pt-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <select
              value={captureSizeIndex}
              onChange={(e) => onCaptureSizeIndexChange(parseInt(e.target.value))}
              className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs"
              style={{ color: UI_MUTED }}
              title="Image size preset"
            >
              {CAPTURE_SIZE_PRESETS.map((s, i) => (
                <option key={i} value={i}>{s.label}</option>
              ))}
              <option value={CUSTOM_SIZE_INDEX}>Custom</option>
            </select>
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)] cursor-pointer" title="PNG format (lossless)">
                <input
                  type="radio"
                  name="captureFormat"
                  checked={captureFormat === 'png'}
                  onChange={() => onCaptureFormatChange('png')}
                  className="accent-[var(--accent)]"
                />
                PNG
              </label>
              <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)] cursor-pointer" title="JPG format (smaller file)">
                <input
                  type="radio"
                  name="captureFormat"
                  checked={captureFormat === 'jpg'}
                  onChange={() => onCaptureFormatChange('jpg')}
                  className="accent-[var(--accent)]"
                />
                JPG
              </label>
            </div>
          </div>

          {/* Custom size inputs */}
          {isCustomSize && (
            <div className="flex items-center gap-2 ml-2 pl-3 border-l-2 border-[var(--border-color)]">
              <label className="text-xs text-[var(--text-secondary)]">W</label>
              <input
                type="number"
                value={customWidth}
                min={100}
                max={4096}
                onChange={(e) => onCustomWidthChange(Math.max(100, Math.min(4096, parseInt(e.target.value) || 100)))}
                className="w-16 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] tabular-nums"
              />
              <label className="text-xs text-[var(--text-secondary)]">H</label>
              <input
                type="number"
                value={customHeight}
                min={100}
                max={4096}
                onChange={(e) => onCustomHeightChange(Math.max(100, Math.min(4096, parseInt(e.target.value) || 100)))}
                className="w-16 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] tabular-nums"
              />
            </div>
          )}

          {/* Capture / Save / Cancel buttons */}
          {!captureActive ? (
            <button
              onClick={onStartCapture}
              className="w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Show capture frame on viewport, then save image"
            >
              Capture Image
            </button>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  onClick={onSaveCapture}
                  className="flex-1 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium rounded transition-colors"
                  title="Save the current view as an image"
                >
                  Save Image
                </button>
                <button
                  onClick={onCancelCapture}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                  title="Exit capture mode"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] opacity-60">
                Orbit/zoom to compose your shot. Drag corners to resize frame.
              </p>
            </>
          )}
        </div>

        {/* ── Export STL ── */}
        <div className="border-t-[3px] border-[#555] pt-2">
          <button
            onClick={handleExportSTL}
            className="w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
            title="Export 3D model as STL file for printing"
          >
            Export STL
          </button>
        </div>
      </div>

      {/* Parameter controls */}
      <div className="px-3 py-3">
        <DimensionControls designName={designName} />
      </div>

      </div>{/* end scrollable area */}

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
                Save & Continue
              </button>
              <button
                onClick={() => {
                  confirmAction();
                  setConfirmAction(null);
                }}
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] text-[var(--text-primary)] transition-colors"
              >
                Don't Save
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
