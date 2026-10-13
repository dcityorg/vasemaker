'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Section, SliderRow, Toggle, GroupHeader } from '@/components/parameters/ui';
import { BezierCurveEditor, EDITOR_CHROME } from '@/components/parameters/BezierCurveEditor';
import { evaluatePiecewiseBezier } from '@/engine/bezier';
import { useHandleStore, useHandleHistory, handleHistory, DEFAULT_HANDLE_SETTINGS_NAME } from '@/store/handle-store';
import { HANDLE_PARAMS } from '@/config/handle-params';
import { HANDLE_PRESETS } from '@/config/handle-presets';
import { PLASTER_MATERIALS } from '@/config/mold-params';
import { GROUP_COLORS, UI_MUTED } from '@/config/colors';
import { generateSTL } from '@/engine/stl-export';
import { saveSTLFile, saveDesignFile, saveTextFile, openDesignFile } from '@/lib/image-capture';
import { dcCountExport } from '@/lib/analytics';
import { estimatePlaster } from '@/engine/mold/mold-stats';
import { buildPrintReport } from '@/lib/print-report';
import { mergeHandleParameters } from '@/engine/handle/handle-types';
import { measureSpine } from '@/engine/handle/spine';
import { useMoldStore } from '@/store/mold-store';
import { MOLD_PARAMS } from '@/config/mold-params';
import { worldToHandle, clipPolyline } from '@/engine/mold/split-handle';
import { useMugPlacement } from '@/hooks/use-mug-placement';
import { translateMesh } from '@/engine/handle/mesh3';
import type { HandleMeshes } from '@/engine/handle/handle-generator';
import type { HandleParameters, WindowExtents } from '@/engine/handle/handle-types';
import type { PlasterType } from '@/engine/mold/mold-types';
import type { VaseMesh } from '@/engine/types';

type HandleNumKey = {
  [K in keyof HandleParameters]: HandleParameters[K] extends number ? K : never;
}[keyof HandleParameters];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Binary STL is an 84-byte header plus 50 bytes per triangle. */
const stlSize = (tris: number) => {
  const mb = (84 + tris * 50) / (1024 * 1024);
  return `${tris >= 1000 ? `${(tris / 1000).toFixed(0)}k` : tris} tris · ${mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`}`;
};

const miniBtn =
  'flex-1 py-1 text-[11px] rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] ' +
  'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)] transition-colors';

export function HandleSidebar({ handle, helpOpen, onToggleHelp }: {
  handle: HandleMeshes;
  helpOpen: boolean;
  onToggleHelp: () => void;
}) {
  const params = useHandleStore((s) => s.params);
  /** Clay-shrink upscale — the master prints this much larger than the cast. */
  const shrinkS = 1 + params.shrinkPercent / 100;
  const view = useHandleStore((s) => s.view);
  const settingsName = useHandleStore((s) => s.settingsName);
  const setParam = useHandleStore((s) => s.setParam);
  const setView = useHandleStore((s) => s.setView);
  const setSettingsName = useHandleStore((s) => s.setSettingsName);
  const setSpinePoint = useHandleStore((s) => s.setSpinePoint);
  const addSpinePoint = useHandleStore((s) => s.addSpinePoint);
  const removeSpinePoint = useHandleStore((s) => s.removeSpinePoint);
  const setSpineSpan = useHandleStore((s) => s.setSpineSpan);
  const setSpineDepth = useHandleStore((s) => s.setSpineDepth);
  const setWindowEdge = useHandleStore((s) => s.setWindowEdge);
  const fitWindow = useHandleStore((s) => s.fitWindow);
  const reOriginSpine = useHandleStore((s) => s.reOriginSpine);
  const toggleSpineType = useHandleStore((s) => s.toggleSpineType);
  const applyPreset = useHandleStore((s) => s.applyPreset);
  const reset = useHandleStore((s) => s.reset);
  const markSaved = useHandleStore((s) => s.markSaved);
  const savedParams = useHandleStore((s) => s.savedParams);
  const revertToSaved = useHandleStore((s) => s.revertToSaved);
  const doUndo = useHandleStore((s) => s.undo);
  const doRedo = useHandleStore((s) => s.redo);
  const { canUndo, canRedo } = useHandleHistory();

  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z, matching the Vase tab.
  const onKey = useCallback((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    if (e.shiftKey) doRedo(); else doUndo();
  }, [doUndo, doRedo]);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const [presetId, setPresetId] = useState('');
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** `count`: only the handle master counts as an export (DCity/ANALYTICS.md §2 —
   *  one event per design, not per file), so plate, wall and the B parts pass false. */
  const exportMesh = async (mesh: VaseMesh, lift: number, part: string, count = false) => {
    const positioned = lift !== 0 ? translateMesh(mesh, 0, 0, lift) : mesh;
    const blob = new Blob([generateSTL(positioned)], { type: 'application/octet-stream' });
    if ((await saveSTLFile(blob, `${settingsName || 'handle'} ${part}.stl`)) && count) dcCountExport();
  };

  // ── Settings files (the full handle design + mold settings) ──

  const handleSaveSettings = async () => {
    const json = JSON.stringify({ app: 'VaseMaker', type: 'handle-settings', settings: params }, null, 2);
    const chosenName = await saveDesignFile(json, settingsName || DEFAULT_HANDLE_SETTINGS_NAME);
    if (chosenName === null) return; // cancelled — don't offer the text file either
    markSaved(params, chosenName);
    // Companion bench sheet, same as MoldMaker: plaster batch + printer fit so
    // the numbers are at hand without opening the app.
    const L = handle.layout;
    const dim = (n: number) => `${n.toFixed(0)} mm`;
    await saveTextFile(buildPrintReport({
      title: chosenName,
      identity: [
        { label: 'Design', value: chosenName },
        { label: 'Mold style', value: 'Handle — two-part plaster' },
        { label: 'Parts to print', value: handle.isSymmetric ? '3 STLs (wall prints twice)' : '5 STLs (A + B kits, wall twice)' },
        { label: 'Saved', value: new Date().toLocaleString() },
      ],
      material: params.material,
      plasterVolumeMm3: handle.plasterVolumeMm3,
      bothHalves: true,
      parts: [
        { label: 'Plate', note: handle.isSymmetric ? 'pour twice' : 'A + B', rows: [
          { label: 'footprint', value: `${dim(L.plateW)} x ${dim(L.plateD)}` },
          { label: 'triangles', value: handle.plateStats.triangleCount.toLocaleString('en-US') },
        ] },
        { label: 'Wall', note: 'print 2', rows: [
          { label: 'cavity W x D x H', value: `${dim(L.cavW)} x ${dim(L.cavD)} x ${dim(L.wallH)}` },
          { label: 'triangles', value: handle.wallStats.triangleCount.toLocaleString('en-US') },
        ] },
        { label: 'Handle master', note: handle.isSymmetric ? undefined : 'A + B', rows: [
          { label: 'printed size', value: `${dim(handle.masterStats.sizeX)} x ${dim(handle.masterStats.sizeY)} x ${dim(handle.masterStats.sizeZ)}` },
          { label: 'plastic', value: `${(handle.masterStats.volumeMm3 / 1000).toFixed(0)} cm3` },
          { label: 'triangles', value: handle.masterStats.triangleCount.toLocaleString('en-US') },
        ] },
      ],
      keySettings: [
        { label: 'Shrink', value: `${params.shrinkPercent}%` },
        { label: 'Plaster margin', value: `${params.plasterMargin} mm` },
        { label: 'Plaster above', value: `${params.plasterAbove} mm` },
        { label: 'Wall thickness', value: `${params.wallThickness} mm` },
        { label: 'Mesh resolution', value: `${params.spineSamples} along x ${params.sectionSegments} around` },
      ],
    }), chosenName);
  };

  const applySettingsText = (text: string, baseName: string) => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || parsed.type !== 'handle-settings') {
        if (parsed && typeof parsed === 'object' && ('radius' in parsed || 'profilePoints' in parsed)) {
          alert('That file is a vase design. Load expects a handle settings file — use Load Design on the Vase tab for vases.');
        } else if (parsed && typeof parsed === 'object' && parsed.type === 'mold-settings') {
          alert('That file is a mold settings file. Load it on the Mold tab.');
        } else {
          alert('Invalid handle settings file.');
        }
        return;
      }
      const loaded = mergeHandleParameters(parsed.settings);
      handleHistory.skipNextRecord();
      useHandleHistory.getState().clear();
      useHandleStore.setState({ params: loaded, savedParams: loaded, settingsName: baseName });
    } catch {
      alert('Invalid handle settings file.');
    }
  };

  const handleLoadSettings = async () => {
    if ('showOpenFilePicker' in window) {
      const result = await openDesignFile();
      if (result) applySettingsText(result.text, result.name);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const baseName = file.name.replace(/\.json$/i, '');
    const reader = new FileReader();
    reader.onload = () => applySettingsText(reader.result as string, baseName);
    reader.readAsText(file);
    e.target.value = '';
  };

  const win = (k: keyof WindowExtents, label: string, tooltip: string) => (
    <SliderRow
      label={label}
      value={params[k]}
      min={HANDLE_PARAMS[k].min}
      max={HANDLE_PARAMS[k].max}
      step={HANDLE_PARAMS[k].step}
      tooltip={tooltip}
      onChange={(v) => setWindowEdge(k, v)}
    />
  );

  const sl = (k: HandleNumKey, label: string, suffix?: string, tooltip?: string) => (
    <SliderRow
      label={label}
      value={params[k]}
      min={HANDLE_PARAMS[k].min}
      max={HANDLE_PARAMS[k].max}
      step={HANDLE_PARAMS[k].step}
      suffix={suffix}
      tooltip={tooltip}
      onChange={(v) => setParam(k, v)}
    />
  );

  const est = estimatePlaster(handle.plasterVolumeMm3, params.material);
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} k` : n.toFixed(0));
  const selectedPreset = HANDLE_PRESETS.find((p) => p.id === presetId);

  // ── Spine editor ──
  // Points are stored in mm and drawn straight into a window whose extents are
  // their own params, so resizing the drawing area never touches the handle.
  // The plot box keeps the two axes at the SAME mm-per-pixel — a handle drawn
  // out of proportion is worse than one drawn small — so the box follows the
  // window's ratio, and a tall narrow window grows the box's height rather
  // than stretching its width.
  // ── Mug overlay (Split 2-Pc Phase 2) ──
  // The vase from VaseMaker, placed exactly as the Split 2-Pc mold will place
  // this handle (same function), so Sher draws against the real mug. The view
  // opens MUG_MARGIN mm left of the wall so the body shows; points still can't
  // go there (the store clamps x ≥ 0).
  const mugInfo = useMugPlacement();
  const showMug = mugInfo.showMug;
  const moldParams = useMoldStore((s) => s.params);
  const setMoldParam = useMoldStore((s) => s.setParam);
  const MUG_MARGIN = showMug ? 20 : 0;
  const mug = (() => {
    if (!mugInfo.outline) return null;
    const pl = mugInfo.placement;
    if (!pl) return { error: mugInfo.error, paths: [] as [number, number][][] };
    const local = mugInfo.outline.sil.map(([z, u]) => worldToHandle(pl, z, u));
    return { error: mugInfo.error, paths: clipPolyline(local, -MUG_MARGIN, params.winRight, params.winBottom, params.winTop) };
  })();

  const winW = params.winRight + MUG_MARGIN;
  const winH = params.winTop - params.winBottom;
  const ratio = winW / winH;
  const MAX_PLOT_W = 215; // keeps the whole editor inside the sidebar
  let plotH = Math.min(360, Math.max(200, MAX_PLOT_W / ratio));
  let plotW = plotH * ratio;
  if (plotW > MAX_PLOT_W) {
    plotW = MAX_PLOT_W;
    plotH = plotW / ratio;
  }
  const spineW = Math.round(plotW) + EDITOR_CHROME.x;
  const spineH = Math.round(plotH) + EDITOR_CHROME.y;

  // Measured off the centerline — what the Height/Depth sliders report and set.
  const measure = measureSpine(params.spinePoints, params.spineTypes);

  // Thin red guide: the handle's CENTER line (the exact swept path).
  const outlinePaths = (() => {
    const pts = params.spinePoints;
    const y0 = pts[0][1];
    const y1 = pts[pts.length - 1][1];
    const n = 48;
    const c: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = y0 + (y1 - y0) * (i / n);
      const [xf, yf] = evaluatePiecewiseBezier(t, pts, params.spineTypes);
      c.push([Math.max(0, xf), yf]);
    }
    return [c];
  })();

  return (
    <div className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] flex-1">HandleMaker</h1>
          <Link
            href="/"
            className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
            title="Back to the vase designer"
          >
            ◂ Vase
          </Link>
          <button
            onClick={doUndo}
            disabled={!canUndo}
            className="text-sm leading-none w-6 h-6 rounded flex items-center justify-center transition-colors text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:hover:bg-transparent"
            title="Undo (Cmd/Ctrl+Z)"
          >
            ↶
          </button>
          <button
            onClick={doRedo}
            disabled={!canRedo}
            className="text-sm leading-none w-6 h-6 rounded flex items-center justify-center transition-colors text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:hover:bg-transparent"
            title="Redo (Cmd/Ctrl+Shift+Z)"
          >
            ↷
          </button>
          <button
            onClick={onToggleHelp}
            className={`text-sm font-bold leading-none w-6 h-6 rounded-full flex items-center justify-center transition-colors ${helpOpen ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'}`}
            title="Toggle help panel"
          >
            ?
          </button>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">Handle + two-part plaster mold</p>
        {/* Design/settings name — click to rename, used as the export filename */}
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-[var(--text-secondary)] shrink-0">Design Name:</span>
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              defaultValue={settingsName}
              placeholder={DEFAULT_HANDLE_SETTINGS_NAME}
              className="text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1 py-0.5 flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSettingsName(e.currentTarget.value);
                  setEditingName(false);
                } else if (e.key === 'Escape') {
                  setEditingName(false);
                }
              }}
              onBlur={(e) => {
                setSettingsName(e.currentTarget.value);
                setEditingName(false);
              }}
            />
          ) : (
            <p
              className="text-xs text-[var(--text-secondary)] truncate cursor-pointer hover:text-[var(--text-primary)] transition-colors flex-1 min-w-0"
              title="Click to rename this handle design"
              onClick={() => {
                setEditingName(true);
                requestAnimationFrame(() => {
                  nameInputRef.current?.focus();
                  nameInputRef.current?.select();
                });
              }}
            >
              {settingsName}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-[var(--border-color)] flex flex-col gap-2">
          {/* Preset selector */}
          <div className="flex items-center gap-2">
            <select
              value={presetId}
              onChange={(e) => {
                const p = HANDLE_PRESETS.find((x) => x.id === e.target.value);
                setPresetId(e.target.value);
                if (p) applyPreset(p);
              }}
              className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs"
              style={{ color: UI_MUTED }}
              title="Load a starter handle shape (spine + suggested dimensions; mold settings are kept)"
            >
              <option value="" disabled>Handle presets…</option>
              {HANDLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {selectedPreset && (
            <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 -mt-1">{selectedPreset.description}</p>
          )}

          {/* Settings files */}
          <div className="border-t-[3px] border-[#555] pt-2 flex gap-2">
            <button
              onClick={handleLoadSettings}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Load a handle design + mold settings from JSON"
            >
              Load Settings
            </button>
            <button
              onClick={handleSaveSettings}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Save the handle design + mold settings as JSON"
            >
              Save Settings
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelected} className="hidden" />
          </div>

          {/* STL exports */}
          <div className="border-t-[3px] border-[#555] pt-2 flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => exportMesh(handle.master, handle.layout.masterLift, handle.masterB ? 'handle A' : 'handle', true)}
                className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                style={{ color: UI_MUTED }}
                title="Export the half-handle master (prints flat side down, no supports)"
              >
                Export Handle{handle.masterB ? ' A' : ''} STL
              </button>
              <button
                onClick={() => exportMesh(handle.plate, handle.layout.plateLift, handle.plateB ? 'plate A' : 'plate')}
                className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                style={{ color: UI_MUTED }}
                title="Export the bottom plate"
              >
                Export Plate{handle.plateB ? ' A' : ''} STL
              </button>
            </div>
            {handle.masterB && handle.plateB && (
              <div className="flex gap-2">
                <button
                  onClick={() => exportMesh(handle.masterB!, handle.layout.masterLift, 'handle B')}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                  style={{ color: UI_MUTED }}
                  title="Mirrored master for the second mold half (asymmetric handle)"
                >
                  Export Handle B STL
                </button>
                <button
                  onClick={() => exportMesh(handle.plateB!, handle.layout.plateLift, 'plate B')}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                  style={{ color: UI_MUTED }}
                  title="Mirrored plate for the second mold half (asymmetric handle)"
                >
                  Export Plate B STL
                </button>
              </div>
            )}
            <button
              onClick={() => exportMesh(handle.wall, 0, 'wall')}
              className="w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Export the side wall — print 2 copies; the second is the same part rotated 180°"
            >
              Export Wall STL (print 2 copies)
            </button>
            <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
              {handle.isSymmetric
                ? 'Symmetric handle: one plate — pour it twice for the two mold halves.'
                : 'Asymmetric handle: pour half A with the A parts, half B with the mirrored B parts.'}
            </p>
          </div>
        </div>

        <div className="px-3 py-3">
          {handle.hasSelfIntersection && (
            <div className="mb-3 px-2 py-1.5 rounded border border-red-700 bg-red-950/40 text-xs text-red-300">
              The handle curls back over itself — the mold plate cutout would overlap.
              Reduce the curve depth or spread the spine points apart.
            </div>
          )}

          {/* View toggles */}
          <GroupHeader label="View" color={GROUP_COLORS.settings} />
          <Toggle label="Handle" checked={view.showHandle} onChange={(v) => setView({ showHandle: v })} />
          <Toggle label="Wells" checked={view.showWells} onChange={(v) => setView({ showWells: v })} tooltip="Hide to see the finished handle — its ends cut flat and parallel to the vase wall" />
          <Toggle label="Plate" checked={view.showPlate} onChange={(v) => setView({ showPlate: v })} />
          <Toggle label="Wall A" checked={view.showWallA} onChange={(v) => setView({ showWallA: v })} tooltip="First wall in its assembled position — turn one wall off to inspect the wall-to-plate joint" />
          <Toggle label="Wall B" checked={view.showWallB} onChange={(v) => setView({ showWallB: v })} tooltip="Second wall copy (same print, rotated 180°)" />
          <Toggle label="Plaster" checked={view.showPlaster} onChange={(v) => setView({ showPlaster: v })} tooltip="Translucent block showing the pour volume" />
          <Toggle label="Flat Shading" checked={view.flatShading} onChange={(v) => setView({ flatShading: v })} tooltip="Per-face normals. Smooth shading averages across a V ridge's three faces and renders the sharp apex as a rounded tube — flat shading gives it a crease and puts a hard shadow line in each groove" />
          <Toggle label="Cross-section" checked={view.crossSection} onChange={(v) => setView({ crossSection: v })} tooltip="Slice everything with a movable plane — the clearest way to read the master's shell thickness and the open channel inside it" />
          {view.crossSection && (
            <div className="ml-2 pl-3 border-l-2 border-[var(--border-color)]">
              <div className="flex items-center gap-1 my-1">
                <span className="w-28 text-xs" style={{ color: UI_MUTED }}>Cut across</span>
                {([
                  ['x', 'X', 'Across the strap — shows the section: shell wall and the open channel between'],
                  ['y', 'Y', 'Along the mold the other way'],
                  ['z', 'Z', 'Parallel to the plate — shows the channel running the length of the master in plan'],
                ] as const).map(([ax, label, tip]) => (
                  <button
                    key={ax}
                    onClick={() => setView({ crossAxis: ax })}
                    title={tip}
                    className={`flex-1 py-1 text-[11px] rounded border transition-colors ${
                      view.crossAxis === ax
                        ? 'bg-[var(--border-color)] border-[var(--text-secondary)] text-[var(--text-primary)]'
                        : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <SliderRow
                label="Position"
                value={view.crossPos}
                min={0}
                max={1}
                step={0.005}
                onChange={(v) => setView({ crossPos: v })}
                tooltip="Slide the cutting plane through the mold. Arrow keys step it; Alt for fine, Shift for coarse"
              />
            </div>
          )}

          {/* Handle */}
          <GroupHeader label="Handle" color={GROUP_COLORS.structure} />
          <Section title="Drawing Area" titleColor={GROUP_COLORS.structure} defaultOpen={false} tooltip="Size of the profile editor's window only — moving these never changes the handle. Widen one to give yourself room to drag a control point further out">
            {win('winTop', 'Top (mm)', 'Top edge of the drawing area')}
            {win('winBottom', 'Bottom (mm)', 'Bottom edge — go negative for room below the handle')}
            {win('winRight', 'Right (mm)', 'Right edge. The left edge is always 0 — the vase wall')}
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
              An edge stops at the outermost control point, so nothing can be hidden.
            </p>
          </Section>
          <Section title="Handle Profile" titleColor={GROUP_COLORS.structure} tooltip="The handle's centerline in side view, in real mm — left edge is the vase wall. End points slide up/down the wall for hook shapes. The red line shows the exact center line the handle sweeps along">
            <BezierCurveEditor
              points={params.spinePoints}
              pointTypes={params.spineTypes}
              onPointChange={setSpinePoint}
              onPointAdd={addSpinePoint}
              onPointRemove={removeSpinePoint}
              onPointTypeToggle={toggleSpineType}
              minPoints={3}
              xRange={[-MUG_MARGIN, params.winRight]}
              yRange={[params.winBottom, params.winTop]}
              showUnitRefLine={false}
              arrowStepX={1}
              arrowStepY={1}
              /* This editor works in mm, so it needs a mm-scale drag grid —
                 the 0.05 default is far below one pixel here, which made a
                 drag effectively unsnapped and Alt-drag indistinguishable
                 from a plain one. 0.5 mm normally, 0.1 mm with Alt. */
              dragStepX={0.5}
              dragStepY={0.5}
              xLabel="stick-out (mm)"
              width={spineW}
              height={spineH}
              showReadout
              freeEndpointY
              overlayPaths={[...outlinePaths, ...(mug?.paths ?? [])]}
              overlayColors={[...outlinePaths.map(() => '#e05555'), ...(mug?.paths ?? []).map(() => '#9fb3c8')]}
            />
            <Toggle
              label="Show Mug"
              checked={showMug}
              onChange={(v) => setView({ showMug: v })}
              tooltip="Show the mug from VaseMaker: a grey outline here, and the main window becomes a side view of the finished mug with this handle on it — placed the way the Split 2-Pc mold will put it. Keep editing the handle here; the side view follows live"
            />
            {showMug && (
              <>
                <SliderRow
                  label="Top Below Rim"
                  value={moldParams.handleTopDrop}
                  min={MOLD_PARAMS.handleTopDrop.min}
                  max={MOLD_PARAMS.handleTopDrop.max}
                  step={MOLD_PARAMS.handleTopDrop.step}
                  suffix="mm"
                  tooltip="Where the top of the handle meets the vase, down from the rim. Shared with the Mold tab's Split 2-Pc Handle section"
                  onChange={(v) => setMoldParam('handleTopDrop', v)}
                />
                {mug?.error && <p className="text-[11px] text-red-400 mt-1 leading-snug">{mug.error}</p>}
              </>
            )}
            <div className="flex gap-1 mt-1">
              <button className={miniBtn} onClick={reOriginSpine}
                title="Slide the whole design so the lower attachment end sits at 0 — the drawing doesn't move, only the numbers on the axis">
                Re-origin
              </button>
              <button className={miniBtn} onClick={fitWindow}
                title="Shrink the drawing area back onto the handle. It can only close in as far as the outermost control point, so some empty space stays wherever a handle reaches out past the curve">
                Fit
              </button>
            </div>
          </Section>
          <Section title="Handle Dimensions" titleColor={GROUP_COLORS.structure}>
            <SliderRow
              label="Height (mm)"
              value={round1(measure.span)}
              min={HANDLE_PARAMS.height.min}
              max={HANDLE_PARAMS.height.max}
              step={HANDLE_PARAMS.height.step}
              valueLabel={`${round1(measure.span)} / ${round1(measure.overallHeight)}`}
              tooltip="Handle height, measured on the centerline: distance between the two attachment ends / overall tallest-to-lowest. The slider sets the attachment distance and the overall follows. Scales the curve vertically only, anchored at the lower end — stick-out is unchanged"
              onChange={setSpineSpan}
            />
            <SliderRow
              label="Depth (mm)"
              value={round1(measure.maxX)}
              min={HANDLE_PARAMS.depth.min}
              max={HANDLE_PARAMS.depth.max}
              step={HANDLE_PARAMS.depth.step}
              tooltip="How far the centerline reaches from the vase wall at its furthest. Scales the curve horizontally only"
              onChange={setSpineDepth}
            />
            {/* Width/Thickness are deliberately crossed: the stored fields keep
                their original meaning (`width` = in-plane, `thickness` =
                out-of-plane) so existing settings files and presets describe
                the same physical handle, but the LABELS were swapped in
                v1.16.0 to match how people actually describe a handle — width
                is what you see looking at the mug head-on, thickness is how
                thick the strap looks in profile. Same pattern as the mold's
                'perpendicular' value behind the "Parallel" label. */}
            {sl('thickness', 'Width (mm)', undefined, 'FINISHED handle width — both halves together, after shrink. The dimension you see looking at the mug head-on. The printed master carries HALF of it, because the parting plane splits this direction')}
            {sl('width', 'Thickness (mm)', undefined, 'FINISHED handle thickness, after shrink — measured IN the parting plane, so the master carries ALL of it. How thick the strap looks in the profile view')}
            {sl('shrinkPercent', 'Shrink (%)', undefined, 'Clay shrinkage — the master prints this much larger than the designed size')}
            {sl('masterShellThickness', 'Shell (mm)', undefined, 'Printed wall thickness of the master. The master is always hollow and OPEN along its underside — the shell is all there is — so you can get a tool into the channel to pry it out of the set plaster. Clamped automatically so the cavity stays open on a thin strap')}
            {sl('ribWidth', 'Pull Ribs (mm)', undefined, 'Width of the solid ribs bridging the open channel. The channel is open either side of one, so long-nose jaws drop in and close on it — that is what you pull on to lever the master out of the set plaster. 0 turns them off. They sit inside the shell, so the cast handle never sees them')}
            {params.ribWidth > 0.2 &&
              sl('ribCount', 'Rib Count', undefined, 'How many along the strap, evenly spaced by distance along the handle. Each well gets one as well, just inside its open end — those are the stiffest things on the master to pull against')}
            {/* Resolution lives HERE, not in a Settings section (Gary, 2026-08-01):
                he printed a master and only then saw the facets, having forgotten
                to raise it. It belongs where you are already thinking about the
                handle's shape. Sub-titled and indented so "Along"/"Around" read
                as mesh density rather than as two more dimensions. */}
            <div
              className="mt-3 mb-1 px-1 text-[10px] font-semibold tracking-[0.15em] uppercase"
              style={{ color: UI_MUTED }}
              title="Mesh density of the exported parts — how finely the curves are faceted. Raise it for a large handle; the only cost is file size"
            >
              Resolution
            </div>
            <div className="ml-2 pl-3 border-l-2 border-[var(--border-color)]">
              {sl('spineSamples', 'Along', undefined, 'Stations sampled along the spine — controls smoothness around the bend')}
              {sl('sectionSegments', 'Around', undefined, 'Segments around HALF the cross-section — how round the strap prints. Also drives the well collar\u2019s bore and the registration natches, so the sealing surfaces stay as smooth as the handle')}
            </div>
          </Section>
          <Section title="Wells" titleColor={GROUP_COLORS.structure}>
            {sl('openingDiameter', 'Opening', 'mm', 'Diameter of the pour opening / cylinder at each end')}
            {sl('cylinderLength', 'Cylinder', 'mm', 'Straight cylinder section at the mold wall — always perpendicular to the wall')}
            {sl('coneLength', 'Transition', 'mm', 'Length of the transition from the cylinder to the handle\u2019s flat wall-plane cut')}
          </Section>

          {/* Mold */}
          <GroupHeader label="Mold" color={GROUP_COLORS.surface} />
          <Section title="Plate" titleColor={GROUP_COLORS.surface} defaultOpen={false}>
            {sl('seatDepth', 'Seat Depth', 'mm', 'How deep the half-handle’s flat skirt sits into the plate (the parting plane stays at the plate top). This IS the seal: a deeper skirt is a longer path at Fit Clearance for plaster to travel. It is also the lip you grab with long-nose pliers to lift the master out of the set plaster, so do not go shallow')}
            {sl('lipWidth', 'Lip Width', 'mm', 'Support-lip ring the handle rests on — inside it the plate is open so you can tape the handle from below')}
            {sl('plateFloor', 'Lip Thickness', 'mm', 'Plate material under the seat pocket. Added to Seat Depth it is the plate’s total thickness, and stiffness goes as the CUBE of that — this is the first slider to raise if a plate flexes during the pour. Stepped in 0.2 mm so it stays a whole number of layers')}
            {sl('tieBarWidth', 'Tie Bars', 'mm', 'Width of the bars that bridge the tape hole, turning it from a continuous slot into a ladder. Without them the plate inside the handle’s curve is a long tongue joined to the rest only at the mold wall, and setting plaster — which expands, hot — has nothing else to push against there. They sit below the master in a space the plaster never reaches, so they cost the casting nothing. 0 turns them off')}
            {params.tieBarWidth > 0.2 &&
              sl('tieBarCount', 'Bar Count', undefined, 'How many along the strap, evenly spaced by distance along the handle and nudged clear of the pull-ribs. Bars too near a well are dropped — the hole is as wide as the pour opening out there')}
            {sl('recessClearance', 'Fit Clearance', 'mm', 'Gap around the master everywhere it meets a printed part: the plate pocket AND the wall’s well-collar bore. Tighter holds the master in place and gives plaster less to creep through; too tight and the parts will not go together. Tune to your printer')}
            {sl('domeDiameter', 'Dome Diameter', 'mm', 'Registration bump/dimple pair size — clamped to the plaster band between the wall and the handle pocket, so a small Plaster Margin limits it')}
            {sl('domeHeight', 'Dome Height', 'mm', 'How far the registration bump stands proud. Engagement is limited by Seat Depth: the plate recess that molds the mating bump is only that deep, so raising this past Seat Depth deepens the dimple without deepening the bump')}
          </Section>
          <Section title="V Ridge" titleColor={GROUP_COLORS.surface} defaultOpen={false}>
            {sl('vWidth', 'Width', 'mm', 'Base width of the V ridge/groove (45° slopes)')}
            {sl('vHeight', 'Height', 'mm')}
            {sl('vClearance', 'Clearance', 'mm', 'Groove oversize so the walls seat — a loose V still seals')}
          </Section>
          <Section title="Box & Walls" titleColor={GROUP_COLORS.surface} defaultOpen={false}>
            {sl('plasterMargin', 'Plaster Margin', 'mm', 'Plaster between the handle and the walls')}
            {sl('plasterAbove', 'Plaster Above', 'mm', 'Plaster above the highest point of the handle — sets the wall height')}
            {sl('wallThickness', 'Wall Thickness', 'mm')}
            {sl('wellSealDepth', 'Well Seal', 'mm', 'How far the collar around each well opening stands proud of the wall — that depth of engagement over the well cylinder is what keeps plaster out from under the handle. Clamped to the Cylinder length')}
            {sl('flangeWidth', 'Clip Flange', 'mm', 'Binder-clip flange width — plate border and wall seam tabs')}
          </Section>

          {/* Analysis */}
          <GroupHeader label="Analysis" color={GROUP_COLORS.settings} />
          <Section title="Plaster Estimate" titleColor={GROUP_COLORS.settings}>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Material</label>
              <select
                value={params.material}
                onChange={(e) => setParam('material', e.target.value as PlasterType)}
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs"
                style={{ color: UI_MUTED }}
              >
                {(Object.keys(PLASTER_MATERIALS) as PlasterType[]).map((m) => (
                  <option key={m} value={m}>{PLASTER_MATERIALS[m].label}</option>
                ))}
              </select>
            </div>
            <StatRow label="Plaster (both halves)" value={`≈ ${est.volumeCm3.toFixed(0)} cm³`} />
            <StatRow label="Powder (both halves)" value={`≈ ${fmt(est.powderGrams)} g`} />
            <StatRow label="Water (both halves)" value={`≈ ${fmt(est.waterGrams)} g`} />
          </Section>
          <Section title="Printer Fit" titleColor={GROUP_COLORS.settings}>
            <StatRow label="Plate" value={`${handle.layout.plateW.toFixed(0)} × ${handle.layout.plateD.toFixed(0)} mm`} tooltip="Plate footprint — the biggest part; compare to your printer bed" />
            <StatRow
              label="Plate thickness"
              value={`${handle.layout.plateThk.toFixed(1)} mm`
                + (params.tieBarWidth > 0.2
                  ? `, ${handle.tieBars.length} tie bar${handle.tieBars.length === 1 ? '' : 's'}`
                    + (handle.tieBars.length < Math.round(params.tieBarCount) ? ` of ${Math.round(params.tieBarCount)} — no room for the rest` : '')
                  : ', no tie bars')}
              tooltip="Seat Depth + Lip Thickness, and how many tie bars actually landed. A bar too near a well is dropped: the tape hole is as wide as the pour opening out there, so a bar sized to the strap would end inside it"
            />
            <StatRow
              label="Wall set"
              value={`${handle.layout.cavW.toFixed(0)} × ${handle.layout.cavD.toFixed(0)} × ${handle.layout.wallH.toFixed(0)} mm`}
              tooltip="Wall interior size (W × D × H) — a printed wall pair fits any handle with the same numbers"
            />
            <StatRow
              label="Strap section"
              value={`${params.thickness} × ${params.width} cast → ${(params.thickness * shrinkS / 2).toFixed(1)} × ${(params.width * shrinkS).toFixed(1)} printed`}
              tooltip="Width × Thickness of the FINISHED handle, then the half-section actually printed on the master: half the Width (the parting plane splits that direction) and the full Thickness, both scaled up by Shrink"
            />
            <StatRow
              label="Hollow cavity"
              value={`${handle.channel[0].toFixed(1)} × ${handle.channel[1].toFixed(1)} mm`
                + (handle.shellUsed < params.masterShellThickness - 0.01 ? `  (shell clamped to ${handle.shellUsed.toFixed(2)})` : '')}
              tooltip="Open void inside the master, measured from the flat bottom up. It runs the whole underside — deliberately, so you can get a tool in to pry the master out of the plaster. Never allowed to close: Shell is clamped down on a thin strap rather than filling it in"
            />
            <StatRow label="Master size (printed)" value={`${handle.masterStats.sizeX.toFixed(0)} × ${handle.masterStats.sizeY.toFixed(0)} × ${handle.masterStats.sizeZ.toFixed(0)} mm`} tooltip="Bounding box of the printed master — bigger than the Height/Depth you designed, because it includes the well cones and the shrink upscale" />
            <StatRow label="Handle plastic" value={`${(handle.masterStats.volumeMm3 / 1000).toFixed(0)} cm³`} />
            <StatRow label="Mesh" value={`${params.spineSamples} × ${params.sectionSegments}`} tooltip="Along × around mesh resolution, set in Handle Dimensions" />
            <StatRow label="Handle STL" value={stlSize(handle.masterStats.triangleCount)} tooltip="Triangle count and approximate binary STL size" />
            <StatRow label="Plate STL" value={stlSize(handle.plateStats.triangleCount)} />
            <StatRow label="Wall STL" value={stlSize(handle.wallStats.triangleCount)} />
          </Section>

          {savedParams && savedParams !== params && (
            <button
              onClick={revertToSaved}
              className="mt-2 w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Put everything back to the last Save/Load Settings — the whole design, shape included"
            >
              Revert to Saved
            </button>
          )}
          <button
            onClick={reset}
            className="mt-2 w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
            title="Restore the default mold settings. Your handle shape is not touched"
          >
            Reset Handle Settings
          </button>
          <p className="mt-1 text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
            Keeps your handle shape — pick a preset to change that. Undoable with ↶.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="flex items-center justify-between mb-1.5 text-xs" title={tooltip}>
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--text-primary)] tabular-nums">{value}</span>
    </div>
  );
}
