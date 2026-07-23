'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Section, SliderRow, Toggle, GroupHeader } from '@/components/parameters/ui';
import { useMoldStore } from '@/store/mold-store';
import { useVaseStore } from '@/store/vase-store';
import { MOLD_PARAMS, PLASTER_MATERIALS } from '@/config/mold-params';
import { GROUP_COLORS, UI_MUTED } from '@/config/colors';
import { generateSTL } from '@/engine/stl-export';
import { saveSTLFile } from '@/lib/image-capture';
import { estimatePlaster } from '@/engine/mold/mold-stats';
import type { MoldMeshes } from '@/engine/mold/mold-generator';
import type { MoldParameters, PlasterType } from '@/engine/mold/mold-types';
import type { VaseMesh } from '@/engine/types';

type MoldNumKey = {
  [K in keyof MoldParameters]: MoldParameters[K] extends number ? K : never;
}[keyof MoldParameters];

/** True if any surface tilts downward past the undercut threshold (would trap plaster). Vertices at or below minZ (build plate + foot recess) are exempt. */
function hasUndercuts(mesh: VaseMesh, angleDeg: number, minZ: number): boolean {
  const limit = -Math.sin((angleDeg * Math.PI) / 180);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const nz = mesh.normals[i * 3 + 2];
    const z = mesh.positions[i * 3 + 2];
    if (z > minZ && nz < limit) return true;
  }
  return false;
}

export function MoldSidebar({ mold }: { mold: MoldMeshes }) {
  const designName = useVaseStore((s) => s.designName);
  const params = useMoldStore((s) => s.params);
  const view = useMoldStore((s) => s.view);
  const setParam = useMoldStore((s) => s.setParam);
  const setView = useMoldStore((s) => s.setView);
  const reset = useMoldStore((s) => s.reset);
  const [warnExport, setWarnExport] = useState(false);

  const exportMesh = async (mesh: VaseMesh, name: string) => {
    const buffer = generateSTL(mesh);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    await saveSTLFile(blob, name);
  };

  const stlName = (part: string) => (designName ? `${designName} ${part}.stl` : `${part}.stl`);

  const handleExportMaster = () => {
    if (hasUndercuts(mold.master, params.undercutAngle, mold.footTopZ + 0.05)) {
      setWarnExport(true);
      return;
    }
    exportMesh(mold.master, stlName('master'));
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
        </div>
        <p className="text-xs text-[var(--text-secondary)]">Plaster slip-casting mold from your vase</p>
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {/* Toolbar — exports */}
        <div className="px-3 py-2 border-b border-[var(--border-color)] flex gap-2">
          <button
            onClick={handleExportMaster}
            className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
            title="Export the master (positive) as an STL"
          >
            Export Master
          </button>
          <button
            onClick={() => exportMesh(mold.cottle, stlName('cottle'))}
            className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
            title="Export the cottle (container) as an STL"
          >
            Export Cottle
          </button>
        </div>

        <div className="px-3 py-3">
          {/* View toggles */}
          <GroupHeader label="View" color={GROUP_COLORS.settings} />
          <Toggle label="Master" checked={view.showMaster} onChange={(v) => setView({ showMaster: v })} />
          <Toggle label="Cottle" checked={view.showCottle} onChange={(v) => setView({ showCottle: v })} />
          <Toggle label="Plaster" checked={view.showPlaster} onChange={(v) => setView({ showPlaster: v })} />
          <Toggle label="Cross-section" checked={view.crossSection} onChange={(v) => setView({ crossSection: v })} tooltip="Slice the assembly to reveal the plaster, well, and cavity" />
          <Toggle label="Undercuts" checked={view.showUndercuts} onChange={(v) => setView({ showUndercuts: v })} tooltip="Highlight surfaces (red) that would trap the plaster when pulling the master" />

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
          <Section title="Flange" titleColor={GROUP_COLORS.surface} defaultOpen={false}>
            {sl('flangeWidth', 'Width', 'mm', 'Flange overhang beyond the well — should rest on the cottle rim')}
            {sl('flangeThickness', 'Thickness', 'mm')}
          </Section>

          {/* Cottle */}
          <GroupHeader label="Cottle" color={GROUP_COLORS.smoothing} />
          <Section title="Cottle" titleColor={GROUP_COLORS.smoothing}>
            {sl('plasterThickness', 'Plaster', 'mm', 'Plaster thickness — gap between master and cottle wall')}
            {sl('cottleWallThickness', 'Wall', 'mm', 'Printed wall thickness of the cottle')}
            {sl('cottleDraftAngle', 'Draft', '°', 'Cottle taper (wider at top) so the set plaster releases')}
          </Section>

          {/* Analysis */}
          <GroupHeader label="Analysis" color={GROUP_COLORS.settings} />
          <Section title="Undercut Check" titleColor={GROUP_COLORS.settings}>
            {sl('undercutAngle', 'Max Angle', '°', 'Surfaces tilting below this from vertical are flagged red')}
          </Section>
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
            <StatRow label="Master ⌀ max" value={`${mold.masterMaxDiameter.toFixed(0)} mm`} />
            <StatRow label="Master height" value={`${mold.masterStats.sizeZ.toFixed(0)} mm`} />
            <StatRow label="Cottle ⌀ max" value={`${mold.cottleMaxDiameter.toFixed(0)} mm`} />
            <StatRow label="Cottle height" value={`${mold.cottleStats.sizeZ.toFixed(0)} mm`} />
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
              The master has surfaces (shown in red) that tilt below {params.undercutAngle}° from vertical. These may trap the plaster and make the master hard to pull. Export anyway?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setWarnExport(false); exportMesh(mold.master, stlName('master')); }}
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

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between mb-1.5 text-xs">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--text-primary)] tabular-nums">{value}</span>
    </div>
  );
}
