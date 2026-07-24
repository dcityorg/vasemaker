'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Section, SliderRow, Toggle, GroupHeader } from '@/components/parameters/ui';
import { useMoldStore, DEFAULT_SETTINGS_NAME } from '@/store/mold-store';
import { useVaseStore } from '@/store/vase-store';
import { MOLD_PARAMS, PLASTER_MATERIALS } from '@/config/mold-params';
import { GROUP_COLORS, UI_MUTED } from '@/config/colors';
import { generateSTL } from '@/engine/stl-export';
import { saveSTLFile, saveDesignFile, openDesignFile } from '@/lib/image-capture';
import { estimatePlaster } from '@/engine/mold/mold-stats';
import { mergeMoldParameters } from '@/engine/mold/mold-types';
import type { AnyMoldMeshes } from '@/hooks/use-mold-meshes';
import type { MoldParameters, MoldStyle, PlasterType } from '@/engine/mold/mold-types';
import type { VaseMesh } from '@/engine/types';

type MoldNumKey = {
  [K in keyof MoldParameters]: MoldParameters[K] extends number ? K : never;
}[keyof MoldParameters];

const MOLD_STYLE_TABS: { value: MoldStyle; label: string; tooltip: string }[] = [
  { value: 'twoPart', label: 'Two-Piece', tooltip: 'Master + cottle printed separately — press the master into plaster poured in the cottle' },
  { value: 'onePiece', label: 'One-Piece', tooltip: 'Single print with the vase inverted inside — pour plaster in through the open top' },
];

export function MoldSidebar({ mold, helpOpen, onToggleHelp }: { mold: AnyMoldMeshes; helpOpen: boolean; onToggleHelp: () => void }) {
  const designName = useVaseStore((s) => s.designName);
  const params = useMoldStore((s) => s.params);
  const view = useMoldStore((s) => s.view);
  const settingsName = useMoldStore((s) => s.settingsName);
  const setParam = useMoldStore((s) => s.setParam);
  const setView = useMoldStore((s) => s.setView);
  const setSettingsName = useMoldStore((s) => s.setSettingsName);
  const reset = useMoldStore((s) => s.reset);
  const [warnExport, setWarnExport] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportMesh = async (mesh: VaseMesh, name: string) => {
    const buffer = generateSTL(mesh);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    await saveSTLFile(blob, name);
  };

  const stlName = (part: string) => (designName ? `${designName} ${part}.stl` : `${part}.stl`);

  // Main export: the master (two-part) or the whole mold (one-piece) — both are
  // gated by the undercut warning.
  const doExportMain = () => {
    if (mold.style === 'onePiece') exportMesh(mold.mold, stlName('mold'));
    else exportMesh(mold.master, stlName('master'));
  };
  const handleExportMain = () => {
    if (mold.hasUndercuts) {
      setWarnExport(true);
      return;
    }
    doExportMain();
  };

  // ── Settings files (mold params only — the vase design has its own files) ──

  const handleSaveSettings = async () => {
    const json = JSON.stringify({ app: 'VaseMaker', type: 'mold-settings', settings: params }, null, 2);
    const chosenName = await saveDesignFile(json, settingsName || DEFAULT_SETTINGS_NAME);
    if (chosenName !== null) setSettingsName(chosenName);
  };

  const applySettingsText = (text: string, baseName: string) => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || parsed.type !== 'mold-settings') {
        if (parsed && typeof parsed === 'object' && ('radius' in parsed || 'profilePoints' in parsed)) {
          alert('That file is a vase design. Load Settings expects a mold settings file — use Load Design on the Vase tab for designs.');
        } else {
          alert('Invalid mold settings file.');
        }
        return;
      }
      useMoldStore.setState({ params: mergeMoldParameters(parsed.settings) });
      setSettingsName(baseName);
    } catch {
      alert('Invalid mold settings file.');
    }
  };

  const handleLoadSettings = async () => {
    if ('showOpenFilePicker' in window) {
      // File System Access API (remembers directory). Null = user cancelled —
      // don't fall through to a second picker.
      const result = await openDesignFile();
      if (result) applySettingsText(result.text, result.name);
      return;
    }
    // Fallback: file input (Firefox / API not available)
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const baseName = file.name.replace(/\.json$/i, '');
    const reader = new FileReader();
    reader.onload = () => applySettingsText(reader.result as string, baseName);
    reader.readAsText(file);
    // Reset so the same file can be loaded again
    e.target.value = '';
  };

  // Plain render function (not a nested component) so the range inputs aren't
  // remounted on every store update mid-drag.
  const sl = (k: MoldNumKey, label: string, suffix?: string, tooltip?: string) => (
    <SliderRow
      label={label}
      value={params[k]}
      min={MOLD_PARAMS[k].min}
      max={MOLD_PARAMS[k].max}
      step={MOLD_PARAMS[k].step}
      suffix={suffix}
      tooltip={tooltip}
      onChange={(v) => setParam(k, v)}
    />
  );

  const est = estimatePlaster(mold.plasterVolumeMm3, params.material);
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} k` : n.toFixed(0));

  return (
    <div className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] flex-1">MoldMaker</h1>
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
        <p className="text-xs text-[var(--text-secondary)]">Plaster slip-casting mold from your vase</p>
        {/* Mold style switcher — Two-Piece (master + cottle) vs One-Piece (single pour-in print). Internal value stays 'twoPart' for settings-file compat. */}
        <div className="flex gap-1 mt-2">
          {MOLD_STYLE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setParam('moldStyle', tab.value)}
              title={tab.tooltip}
              className={`flex-1 px-2 py-1 text-xs rounded border transition-colors ${
                params.moldStyle === tab.value
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] font-medium'
                  : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Settings profile name — filled by Load/Save Settings, click to rename */}
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-[var(--text-secondary)] shrink-0">Settings File:</span>
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              defaultValue={settingsName}
              placeholder={DEFAULT_SETTINGS_NAME}
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
              title="Click to rename the settings profile"
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
        {/* Toolbar — settings files + STL exports */}
        <div className="px-3 py-2 border-b border-[var(--border-color)] flex flex-col gap-2">
          {/* ── Settings files ── */}
          <div className="flex gap-2">
            <button
              onClick={handleLoadSettings}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Load mold settings from JSON (settings only — not the vase design)"
            >
              Load Settings
            </button>
            <button
              onClick={handleSaveSettings}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Save mold settings as JSON (settings only — not the vase design)"
            >
              Save Settings
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelected}
              className="hidden"
            />
          </div>

          {/* ── STL exports ── */}
          <div className="border-t-[3px] border-[#555] pt-2 flex gap-2">
            {mold.style === 'twoPart' ? (
              <>
                <button
                  onClick={handleExportMain}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                  style={{ color: UI_MUTED }}
                  title="Export the master (positive) as an STL"
                >
                  Export Master STL
                </button>
                <button
                  onClick={() => exportMesh(mold.cottle, stlName('cottle'))}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                  style={{ color: UI_MUTED }}
                  title="Export the cottle (container) as an STL"
                >
                  Export Cottle STL
                </button>
              </>
            ) : (
              <button
                onClick={handleExportMain}
                className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                style={{ color: UI_MUTED }}
                title="Export the one-piece mold as an STL"
              >
                Export Mold STL
              </button>
            )}
          </div>
        </div>

        <div className="px-3 py-3">
          {/* View toggles */}
          <GroupHeader label="View" color={GROUP_COLORS.settings} />
          <Toggle label={mold.style === 'onePiece' ? 'Mold' : 'Master'} checked={view.showMaster} onChange={(v) => setView({ showMaster: v })} />
          {mold.style === 'twoPart' && (
            <Toggle label="Cottle" checked={view.showCottle} onChange={(v) => setView({ showCottle: v })} />
          )}
          <Toggle label="Plaster" checked={view.showPlaster} onChange={(v) => setView({ showPlaster: v })} />
          <Toggle label="Cross-section" checked={view.crossSection} onChange={(v) => setView({ crossSection: v })} tooltip="Slice the assembly to reveal the plaster, well, and cavity" />
          <Toggle label="Undercuts" checked={view.showUndercuts} onChange={(v) => setView({ showUndercuts: v })} tooltip="Highlight areas (red) where the master narrows as it rises — the plaster above locks them in, so the master can't pull straight up" />

          {/* Master */}
          <GroupHeader label="Master" color={GROUP_COLORS.structure} />
          <Section title="Master" titleColor={GROUP_COLORS.structure}>
            {sl('shrinkPercent', 'Shrink', '%', 'Clay slip shrinkage — master is scaled up by this to compensate')}
            {sl('masterWallThickness', 'Wall', 'mm', 'Printed shell thickness of the hollow master')}
            <Toggle label="Keep Texture" checked={params.keepTexture} onChange={(v) => setParam('keepTexture', v)} tooltip="Carry the vase's surface texture onto the master" />
          </Section>
          <Section title="Foot Recess" titleColor={GROUP_COLORS.structure}>
            <Toggle label="Enabled" checked={params.footEnabled} onChange={(v) => setParam('footEnabled', v)} tooltip="Recess the master's bottom so cast pieces get a foot ring and a recessed center for glaze" />
            {params.footEnabled && (
              <>
                {sl('footWidth', 'Foot Width', 'mm', 'w1 — flat foot ring at the outer edge of the bottom')}
                {sl('footSlopeWidth', 'Slope Width', 'mm', 'w2 — width of the stepped ramp from the foot up to the recessed center')}
                {sl('footHeight', 'Depth', 'mm', 'h — how far the center is recessed above the foot plane')}
                {sl('footStepHeight', 'Step Height', 'mm', 'Vertical size of each ramp step — match your printer layer height')}
                <Toggle label="Smooth Inside" checked={params.footSmoothInner} onChange={(v) => setParam('footSmoothInner', v)} tooltip="Build the ramp and recessed center from the smooth contour so surface texture doesn't carry into the recess" />
              </>
            )}
          </Section>

          {/* Well */}
          <GroupHeader label="Well & Flange" color={GROUP_COLORS.surface} />
          <Section title="Well" titleColor={GROUP_COLORS.surface}>
            {sl('wellWidth', 'Width', 'mm', 'Horizontal step out at the rim (the 90° razor-trim ledge)')}
            {sl('wellHeight', 'Height', 'mm', 'Height of the well wall above the vase rim')}
            {sl('wellDraftAngle', 'Draft', '°', 'Outward taper of the well wall for easy release')}
          </Section>
          {mold.style === 'twoPart' && (
            <Section title="Flange" titleColor={GROUP_COLORS.surface} defaultOpen={false}>
              {sl('flangeWidth', 'Width', 'mm', 'Flange overhang beyond the well — should rest on the cottle rim')}
              {sl('flangeThickness', 'Thickness', 'mm')}
            </Section>
          )}

          {/* Cottle */}
          <GroupHeader label="Cottle" color={GROUP_COLORS.smoothing} />
          <Section title="Cottle" titleColor={GROUP_COLORS.smoothing}>
            {sl('plasterThickness', 'Plaster', 'mm', 'Plaster thickness — gap between master and cottle wall')}
            {sl('cottleWallThickness', 'Wall', 'mm', 'Printed wall thickness of the cottle')}
            {sl('cottleDraftAngle', 'Draft', '°', 'Cottle taper (wider toward the opening) so the set plaster releases')}
            {mold.style === 'twoPart' ? (
              <Toggle label="Air Hole" checked={params.airHoleEnabled} onChange={(v) => setParam('airHoleEnabled', v)} tooltip="Hole through the cottle floor center — lets air in behind the plaster block so suction doesn't fight you when pulling it out" />
            ) : (
              <Toggle label="Air Holes (4)" checked={params.airHoleEnabled} onChange={(v) => setParam('airHoleEnabled', v)} tooltip="Four holes through the floor ring (tape or clay them over while pouring) — break the suction when pulling the plaster block, or inject compressed air / push rods through to eject" />
            )}
            {params.airHoleEnabled && sl('airHoleDiameter', 'Diameter', 'mm', mold.style === 'twoPart' ? 'Diameter of the air-relief hole' : 'Approximate size of each of the four air-relief holes')}
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
            <StatRow label="Plaster" value={`${est.volumeCm3.toFixed(0)} cm³`} />
            <StatRow label="Powder" value={`≈ ${fmt(est.powderGrams)} g`} />
            <StatRow label="Water" value={`≈ ${fmt(est.waterGrams)} g`} />
          </Section>
          <Section title="Printer Fit" titleColor={GROUP_COLORS.settings}>
            {mold.style === 'twoPart' ? (
              <>
                <StatRow label="Master max diameter" value={`${mold.masterMaxDiameter.toFixed(0)} mm`} tooltip="Diameter of the smallest circle the master fits inside — compare to your printer bed" />
                <StatRow label="Master height" value={`${mold.masterStats.sizeZ.toFixed(0)} mm`} />
                <StatRow label="Cottle max diameter" value={`${mold.cottleMaxDiameter.toFixed(0)} mm`} tooltip="Diameter of the smallest circle the cottle fits inside — compare to your printer bed" />
                <StatRow label="Cottle height" value={`${mold.cottleStats.sizeZ.toFixed(0)} mm`} />
              </>
            ) : (
              <>
                <StatRow label="Mold max diameter" value={`${mold.moldMaxDiameter.toFixed(0)} mm`} tooltip="Diameter of the smallest circle the mold fits inside — compare to your printer bed" />
                <StatRow label="Mold height" value={`${mold.moldStats.sizeZ.toFixed(0)} mm`} />
              </>
            )}
          </Section>

          <button
            onClick={reset}
            className="mt-2 w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
          >
            Reset Mold Settings
          </button>
        </div>
      </div>

      {/* Undercut warning dialog */}
      {warnExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg p-5 max-w-sm mx-4 shadow-xl">
            <p className="text-sm text-[var(--text-primary)] mb-2 font-medium">Undercuts detected</p>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              {mold.style === 'onePiece'
                ? <>In the areas shown in red, the vase narrows toward its own top, so the set plaster locks around it — the plaster block won&apos;t pull out of the mold. Export anyway?</>
                : <>In the areas shown in red, the master gets narrower as it rises, so the plaster above locks it in — it won&apos;t pull straight up out of the mold. Export anyway?</>}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setWarnExport(false); doExportMain(); }}
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded transition-colors"
              >
                Export Anyway
              </button>
              <button
                onClick={() => setWarnExport(false)}
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

function StatRow({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="flex items-center justify-between mb-1.5 text-xs" title={tooltip}>
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--text-primary)] tabular-nums">{value}</span>
    </div>
  );
}
