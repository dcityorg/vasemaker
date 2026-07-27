'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Section, SliderRow, Toggle, GroupHeader } from '@/components/parameters/ui';
import { BezierCurveEditor } from '@/components/parameters/BezierCurveEditor';
import { evaluatePiecewiseBezier } from '@/engine/bezier';
import { useHandleStore, DEFAULT_HANDLE_SETTINGS_NAME } from '@/store/handle-store';
import { HANDLE_PARAMS } from '@/config/handle-params';
import { HANDLE_PRESETS } from '@/config/handle-presets';
import { PLASTER_MATERIALS } from '@/config/mold-params';
import { GROUP_COLORS, UI_MUTED } from '@/config/colors';
import { generateSTL } from '@/engine/stl-export';
import { saveSTLFile, saveDesignFile, openDesignFile } from '@/lib/image-capture';
import { estimatePlaster } from '@/engine/mold/mold-stats';
import { mergeHandleParameters } from '@/engine/handle/handle-types';
import { translateMesh } from '@/engine/handle/mesh3';
import type { HandleMeshes } from '@/engine/handle/handle-generator';
import type { HandleParameters } from '@/engine/handle/handle-types';
import type { PlasterType } from '@/engine/mold/mold-types';
import type { VaseMesh, BezierPoint } from '@/engine/types';

type HandleNumKey = {
  [K in keyof HandleParameters]: HandleParameters[K] extends number ? K : never;
}[keyof HandleParameters];

export function HandleSidebar({ handle, helpOpen, onToggleHelp }: {
  handle: HandleMeshes;
  helpOpen: boolean;
  onToggleHelp: () => void;
}) {
  const params = useHandleStore((s) => s.params);
  const view = useHandleStore((s) => s.view);
  const settingsName = useHandleStore((s) => s.settingsName);
  const setParam = useHandleStore((s) => s.setParam);
  const setView = useHandleStore((s) => s.setView);
  const setSettingsName = useHandleStore((s) => s.setSettingsName);
  const setSpinePoint = useHandleStore((s) => s.setSpinePoint);
  const addSpinePoint = useHandleStore((s) => s.addSpinePoint);
  const removeSpinePoint = useHandleStore((s) => s.removeSpinePoint);
  const toggleSpineType = useHandleStore((s) => s.toggleSpineType);
  const applyPreset = useHandleStore((s) => s.applyPreset);
  const reset = useHandleStore((s) => s.reset);

  const [presetId, setPresetId] = useState('');
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportMesh = async (mesh: VaseMesh, lift: number, part: string) => {
    const positioned = lift !== 0 ? translateMesh(mesh, 0, 0, lift) : mesh;
    const blob = new Blob([generateSTL(positioned)], { type: 'application/octet-stream' });
    await saveSTLFile(blob, `${settingsName || 'handle'} ${part}.stl`);
  };

  // ── Settings files (the full handle design + mold settings) ──

  const handleSaveSettings = async () => {
    const json = JSON.stringify({ app: 'VaseMaker', type: 'handle-settings', settings: params }, null, 2);
    const chosenName = await saveDesignFile(json, settingsName || DEFAULT_HANDLE_SETTINGS_NAME);
    if (chosenName !== null) setSettingsName(chosenName);
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
      useHandleStore.setState({ params: mergeHandleParameters(parsed.settings) });
      setSettingsName(baseName);
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

  // ── Spine editor in real mm with true aspect ratio ──
  // Points are stored normalized [0..1]²; the editor shows/edits them in mm
  // (x: 0..Depth, y: 0..Height) so what you draw is what you get. The plot
  // box is sized to the actual depth:height ratio (tall and narrow, like a
  // real handle) within sidebar limits.
  const spineMm = params.spinePoints.map(([x, y]) => [x * params.depth, y * params.height] as BezierPoint);
  const ratio = params.depth / params.height;
  let plotH = 280;
  let plotW = Math.max(70, plotH * ratio);
  if (plotW > 225) {
    plotW = 225;
    plotH = Math.max(120, plotW / ratio);
  }
  const spineW = Math.round(plotW) + 44; // + horizontal padding
  const spineH = Math.round(plotH) + 37; // + vertical padding

  // Thin red guide: the handle's CENTER line (the exact swept path), clamped
  // to the drawing area.
  const outlinePaths = (() => {
    const pts = params.spinePoints;
    const y0 = pts[0][1];
    const y1 = pts[pts.length - 1][1];
    const n = 48;
    const c: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = y0 + (y1 - y0) * (i / n);
      const [xf, yf] = evaluatePiecewiseBezier(t, pts, params.spineTypes);
      c.push([
        Math.min(params.depth, Math.max(0, xf * params.depth)),
        Math.min(params.height, Math.max(0, yf * params.height)),
      ]);
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
                onClick={() => exportMesh(handle.master, handle.layout.masterLift, 'handle')}
                className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                style={{ color: UI_MUTED }}
                title="Export the half-handle master (prints flat side down, no supports)"
              >
                Export Handle STL
              </button>
              <button
                onClick={() => exportMesh(handle.plate, handle.layout.plateLift, 'plate')}
                className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                style={{ color: UI_MUTED }}
                title="Export the bottom plate"
              >
                Export Plate STL
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
          <Toggle label="Walls" checked={view.showWalls} onChange={(v) => setView({ showWalls: v })} tooltip="Both wall copies in their assembled positions" />
          <Toggle label="Plaster" checked={view.showPlaster} onChange={(v) => setView({ showPlaster: v })} tooltip="Translucent block showing the pour volume" />

          {/* Handle */}
          <GroupHeader label="Handle" color={GROUP_COLORS.structure} />
          <Section title="Handle Profile" titleColor={GROUP_COLORS.structure} tooltip="The handle's centerline in side view, in real mm — left edge is the vase wall. End points slide up/down the wall for hook shapes. The red line shows the exact center line the handle sweeps along">
            <BezierCurveEditor
              points={spineMm}
              pointTypes={params.spineTypes}
              onPointChange={(i, [xm, ym]) => setSpinePoint(i, [xm / params.depth, ym / params.height])}
              onPointAdd={([xm, ym]) => addSpinePoint([xm / params.depth, ym / params.height])}
              onPointRemove={removeSpinePoint}
              onPointTypeToggle={toggleSpineType}
              maxPoints={8}
              minPoints={3}
              xRange={[0, params.depth]}
              yRange={[0, params.height]}
              arrowStepX={1}
              arrowStepY={1}
              xLabel="stick-out (mm)"
              width={spineW}
              height={spineH}
              showReadout
              freeEndpointY
              overlayPaths={outlinePaths}
            />
          </Section>
          <Section title="Dimensions" titleColor={GROUP_COLORS.structure}>
            {sl('height', 'Height', 'mm', 'Height of the drawing area — the whole curve scales with it')}
            {sl('depth', 'Depth', 'mm', 'Width of the drawing area (max stick-out) — the whole curve scales with it')}
            {sl('width', 'Width', 'mm', 'Cross-section width in the parting plane')}
            {sl('thickness', 'Thickness', 'mm', 'Cross-section thickness perpendicular to the parting plane')}
            {sl('shrinkPercent', 'Shrink', '%', 'Clay shrinkage — the master prints this much larger than the designed size')}
            <Toggle label="Hollow" checked={params.masterHollow} onChange={(v) => setParam('masterHollow', v)} tooltip="Hollow the master from its flat side to save plastic" />
            {params.masterHollow && sl('masterShellThickness', 'Shell', 'mm', 'Printed wall thickness of the hollow master')}
          </Section>
          <Section title="Wells" titleColor={GROUP_COLORS.structure}>
            {sl('openingDiameter', 'Opening', 'mm', 'Diameter of the pour opening / cylinder at each end')}
            {sl('cylinderLength', 'Cylinder', 'mm', 'Straight cylinder section at the mold wall — always perpendicular to the wall')}
            {sl('coneLength', 'Transition', 'mm', 'Length of the transition from the cylinder to the handle\u2019s flat wall-plane cut')}
          </Section>

          {/* Mold */}
          <GroupHeader label="Mold" color={GROUP_COLORS.surface} />
          <Section title="Plate" titleColor={GROUP_COLORS.surface} defaultOpen={false}>
            {sl('seatDepth', 'Seat Depth', 'mm', 'How deep the half-handle’s flat skirt sits into the plate (the parting plane stays at the plate top)')}
            {sl('lipWidth', 'Lip Width', 'mm', 'Support-lip ring the handle rests on — inside it the plate is open so you can tape the handle from below')}
            {sl('plateFloor', 'Lip Thickness', 'mm', 'Plate material under the seat pocket')}
            {sl('recessClearance', 'Fit Clearance', 'mm', 'Gap between the handle and the pocket walls — tune to your printer')}
            {sl('domeDiameter', 'Dome Diameter', 'mm', 'Registration bump/dimple pair size')}
            {sl('domeHeight', 'Dome Height', 'mm')}
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
            {sl('wellSealDepth', 'Well Seal', 'mm', 'How far the collar around each well opening stands proud of the wall (leak seal)')}
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
            <StatRow label="Powder" value={`≈ ${fmt(est.powderGrams)} g`} />
            <StatRow label="Water" value={`≈ ${fmt(est.waterGrams)} g`} />
          </Section>
          <Section title="Printer Fit" titleColor={GROUP_COLORS.settings}>
            <StatRow label="Plate" value={`${handle.layout.plateW.toFixed(0)} × ${handle.layout.plateD.toFixed(0)} mm`} tooltip="Plate footprint — the biggest part; compare to your printer bed" />
            <StatRow
              label="Wall set"
              value={`${handle.layout.cavW.toFixed(0)} × ${handle.layout.cavD.toFixed(0)} × ${handle.layout.wallH.toFixed(0)} mm`}
              tooltip="Wall interior size (W × D × H) — a printed wall pair fits any handle with the same numbers"
            />
            <StatRow label="Handle size" value={`${handle.masterStats.sizeX.toFixed(0)} × ${handle.masterStats.sizeY.toFixed(0)} × ${handle.masterStats.sizeZ.toFixed(0)} mm`} tooltip="Master bounding box including well cones (shrink-scaled)" />
            <StatRow label="Handle plastic" value={`${(handle.masterStats.volumeMm3 / 1000).toFixed(0)} cm³`} />
          </Section>

          <button
            onClick={reset}
            className="mt-2 w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
          >
            Reset Handle Settings
          </button>
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
