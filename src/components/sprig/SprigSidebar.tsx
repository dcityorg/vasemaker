'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Section, SliderRow, Toggle, GroupHeader } from '@/components/parameters/ui';
import { useSprigStore, useSprigHistory, sprigHistory, DEFAULT_SPRIG_SETTINGS_NAME } from '@/store/sprig-store';
import { SPRIG_PARAMS } from '@/config/sprig-params';
import { SPRIG_SAMPLES } from '@/config/sprig-samples';
import { PLASTER_MATERIALS } from '@/config/mold-params';
import { GROUP_COLORS, UI_MUTED } from '@/config/colors';
import { generateSTL } from '@/engine/stl-export';
import { parseSvgInput } from '@/engine/svg-rasterizer';
import { saveSTLFile, saveDesignFile, saveTextFile, openDesignFile } from '@/lib/image-capture';
import { dcCountExport } from '@/lib/analytics';
import { estimatePlaster } from '@/engine/mold/mold-stats';
import { buildPrintReport } from '@/lib/print-report';
import { loadSprigSource } from '@/lib/sprig-source';
import { translateMesh } from '@/engine/handle/mesh3';
import { fitsBox, MIN_PLASTER_BEHIND } from '@/engine/sprig/sprig-generator';
import {
  mergeSprigParameters, sizeLabel, SPRIG_SIZES, STANDARD_ORDER,
  type SprigParameters, type SprigHeightMode, type SprigProfile, type SprigMoldSize,
} from '@/engine/sprig/sprig-types';
import type { SprigMeshState } from '@/hooks/use-sprig-meshes';
import type { PlasterType } from '@/engine/mold/mold-types';
import type { VaseMesh } from '@/engine/types';

type SprigNumKey = {
  [K in keyof SprigParameters]: SprigParameters[K] extends number ? K : never;
}[keyof SprigParameters] & keyof typeof SPRIG_PARAMS;

/** Binary STL is an 84-byte header plus 50 bytes per triangle. */
const stlSize = (tris: number) => {
  const mb = (84 + tris * 50) / (1024 * 1024);
  return `${tris >= 1000 ? `${(tris / 1000).toFixed(0)}k` : tris} tris · ${mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`}`;
};

const btn = 'flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors';
const bigBtn = 'flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors';
const miniBtn =
  'flex-1 py-1 text-[11px] rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] ' +
  'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)] transition-colors';
const selectCls = 'flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs';

const HEIGHT_MODES: { value: SprigHeightMode; label: string; tooltip: string }[] = [
  { value: 'flat', label: 'Flat', tooltip: 'One height for the whole shape — only the edge is shaped' },
  { value: 'gray', label: 'Gray', tooltip: 'Black is Max Height, white is the plate, grays in between. For an SVG drawn with shading' },
  { value: 'inflate', label: 'Inflate', tooltip: 'Blow the flat outline up like a balloon: the further a point is from the edge the higher it rises, up to Max Height. Thick parts reach full height, thin legs and tails stay lower' },
  { value: 'inflateGray', label: 'Inflate + Gray detail', tooltip: 'Inflate, and lighter-gray marks inside the shape (eyes, scales, veins) cut in by up to Detail Depth. Pure white counts as background, so draw details in gray' },
];

export function SprigSidebar({ sprig, helpOpen, onToggleHelp }: {
  sprig: SprigMeshState;
  helpOpen: boolean;
  onToggleHelp: () => void;
}) {
  const m = sprig.meshes;
  const params = useSprigStore((s) => s.params);
  const view = useSprigStore((s) => s.view);
  const settingsName = useSprigStore((s) => s.settingsName);
  const setParam = useSprigStore((s) => s.setParam);
  const setView = useSprigStore((s) => s.setView);
  const setSettingsName = useSprigStore((s) => s.setSettingsName);
  const setWidth = useSprigStore((s) => s.setWidth);
  const setLength = useSprigStore((s) => s.setLength);
  const rotateCW = useSprigStore((s) => s.rotateCW);
  const loadSvg = useSprigStore((s) => s.loadSvg);
  const reset = useSprigStore((s) => s.reset);
  const markSaved = useSprigStore((s) => s.markSaved);
  const savedParams = useSprigStore((s) => s.savedParams);
  const revertToSaved = useSprigStore((s) => s.revertToSaved);
  const doUndo = useSprigStore((s) => s.undo);
  const doRedo = useSprigStore((s) => s.redo);
  const { canUndo, canRedo } = useSprigHistory();
  const S = 1 + params.shrinkPercent / 100;

  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z, matching the other tabs.
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

  const [editingName, setEditingName] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [svgError, setSvgError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const settingsInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);

  // ── SVG in ──

  /** Measure the drawing, then hand it to the store as ONE undoable step.
   *  Returns the problem in plain words, or null when it worked. */
  const applySvg = async (raw: string, name: string): Promise<string | null> => {
    const problem = await (async () => {
      let markup: string;
      try {
        markup = parseSvgInput(raw);
        if (!/<svg\b/i.test(markup)) return 'That does not look like SVG code.';
      } catch {
        return 'That does not look like SVG code.';
      }
      try {
        const r = await loadSprigSource(markup);
        if (!r) return 'That SVG draws nothing darker than white — there is no shape to raise.';
        loadSvg(markup, name, r.aspect);
        return null;
      } catch {
        return 'That SVG could not be drawn. Check it opens in a browser.';
      }
    })();
    setSvgError(problem);
    return problem;
  };

  const handleSvgFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.svg$/i, '');
    const reader = new FileReader();
    reader.onload = () => void applySvg(reader.result as string, name);
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Exports ──

  /** `count`: only the plate counts as an export (DCity/ANALYTICS.md §2 — one
   *  event per design, not per file). The wall is the same for every sprig. */
  const exportMesh = async (mesh: VaseMesh, lift: number, fileName: string, count = false) => {
    const positioned = lift !== 0 ? translateMesh(mesh, 0, 0, lift) : mesh;
    const blob = new Blob([generateSTL(positioned)], { type: 'application/octet-stream' });
    if ((await saveSTLFile(blob, `${fileName}.stl`)) && count) dcCountExport();
  };
  const wallFileName = `SprigMaker ${sizeLabel(params)} wall`;

  // ── Settings files ──

  const handleSaveSettings = async () => {
    const json = JSON.stringify({ app: 'VaseMaker', type: 'sprig-settings', settings: params }, null, 2);
    const chosenName = await saveDesignFile(json, settingsName || DEFAULT_SPRIG_SETTINGS_NAME);
    if (chosenName === null) return;
    markSaved(params, chosenName);
    if (!m) return;
    const dim = (n: number) => `${n.toFixed(0)} mm`;
    const L = m.layout;
    await saveTextFile(buildPrintReport({
      title: chosenName,
      identity: [
        { label: 'Design', value: chosenName },
        { label: 'Drawing', value: params.svgName },
        { label: 'Mold style', value: `Sprig — one-piece open mold, ${sizeLabel(params)}` },
        { label: 'Parts to print', value: 'Plate, plus the size’s wall twice (once ever per size)' },
        { label: 'Saved', value: new Date().toLocaleString() },
      ],
      material: params.material,
      plasterVolumeMm3: m.plasterVolumeMm3,
      parts: [
        { label: 'Plate', rows: [
          { label: 'footprint', value: `${dim(L.plateW)} x ${dim(L.plateD)}` },
          { label: 'sprig (printed)', value: `${m.masterW.toFixed(1)} x ${m.masterL.toFixed(1)} x ${m.masterH.toFixed(1)} mm` },
          { label: 'triangles', value: m.plateStats.triangleCount.toLocaleString('en-US') },
        ] },
        { label: 'Wall', note: 'print 2', rows: [
          { label: 'cavity W x D x H', value: `${dim(m.box.cavW)} x ${dim(m.box.cavL)} x ${dim(m.box.wallH)}` },
          { label: 'file', value: `${wallFileName}.stl` },
        ] },
      ],
      keySettings: [
        { label: 'Finished sprig', value: `${params.width} x ${params.length} mm, ${params.maxHeight} mm high` },
        { label: 'Shrink', value: `${params.shrinkPercent}%` },
        { label: 'Plaster behind', value: `${m.plasterBehind.toFixed(1)} mm` },
        { label: 'Height', value: HEIGHT_MODES.find((h) => h.value === params.heightMode)?.label ?? params.heightMode },
        { label: 'Grid', value: `${params.resolution} mm` },
      ],
    }), chosenName);
  };

  const applySettingsText = (text: string, baseName: string) => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || parsed.type !== 'sprig-settings') {
        if (parsed && typeof parsed === 'object' && ('radius' in parsed || 'profilePoints' in parsed)) {
          alert('That file is a vase design. Load it with Load Design on the Vase tab.');
        } else if (parsed && typeof parsed === 'object' && (parsed.type === 'mold-settings' || parsed.type === 'handle-settings')) {
          alert(`That file is a ${parsed.type === 'mold-settings' ? 'mold' : 'handle'} settings file. Load it on the ${parsed.type === 'mold-settings' ? 'Mold' : 'Handle'} tab.`);
        } else {
          alert('Invalid sprig settings file.');
        }
        return;
      }
      const loaded = mergeSprigParameters(parsed.settings);
      sprigHistory.skipNextRecord();
      useSprigHistory.getState().clear();
      useSprigStore.setState({ params: loaded, savedParams: loaded, settingsName: baseName });
    } catch {
      alert('Invalid sprig settings file.');
    }
  };

  const handleLoadSettings = async () => {
    if ('showOpenFilePicker' in window) {
      const result = await openDesignFile();
      if (result) applySettingsText(result.text, result.name);
      return;
    }
    settingsInputRef.current?.click();
  };

  const handleSettingsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const baseName = file.name.replace(/\.json$/i, '');
    const reader = new FileReader();
    reader.onload = () => applySettingsText(reader.result as string, baseName);
    reader.readAsText(file);
    e.target.value = '';
  };

  const sl = (k: SprigNumKey, label: string, suffix?: string, tooltip?: string, color?: string) => (
    <SliderRow
      label={label}
      value={params[k]}
      min={SPRIG_PARAMS[k].min}
      max={SPRIG_PARAMS[k].max}
      step={SPRIG_PARAMS[k].step}
      suffix={suffix}
      tooltip={tooltip}
      color={color}
      onChange={(v) => setParam(k, v)}
    />
  );

  const est = estimatePlaster(m?.plasterVolumeMm3 ?? 0, params.material);
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} k` : n.toFixed(0));
  const inflate = params.heightMode === 'inflate' || params.heightMode === 'inflateGray';
  const sizeFits = (k: Exclude<SprigMoldSize, 'custom'>) =>
    fitsBox(params.width * S, params.length * S, SPRIG_SIZES[k].cavW, SPRIG_SIZES[k].cavL, params.plasterMargin);
  const warnings = [...(sprig.error ? [sprig.error] : []), ...(svgError ? [svgError] : []), ...(m?.warnings ?? [])];

  return (
    <div className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] flex-1">SprigMaker</h1>
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
        <p className="text-xs text-[var(--text-secondary)]">SVG sprig + one-piece plaster mold</p>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-xs text-[var(--text-secondary)] shrink-0">Design Name:</span>
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              defaultValue={settingsName}
              placeholder={DEFAULT_SPRIG_SETTINGS_NAME}
              className="text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1 py-0.5 flex-1 min-w-0 outline-none focus:border-[var(--accent)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') { setSettingsName(e.currentTarget.value); setEditingName(false); }
                else if (e.key === 'Escape') setEditingName(false);
              }}
              onBlur={(e) => { setSettingsName(e.currentTarget.value); setEditingName(false); }}
            />
          ) : (
            <p
              className="text-xs text-[var(--text-secondary)] truncate cursor-pointer hover:text-[var(--text-primary)] transition-colors flex-1 min-w-0"
              title="Click to rename this sprig design — it names the settings and plate files"
              onClick={() => {
                setEditingName(true);
                requestAnimationFrame(() => { nameInputRef.current?.focus(); nameInputRef.current?.select(); });
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
          {/* Drawing */}
          <select
            value=""
            onChange={(e) => {
              const s = SPRIG_SAMPLES.find((x) => x.id === e.target.value);
              if (s) void applySvg(s.svg, s.name);
            }}
            className={selectCls}
            style={{ color: UI_MUTED }}
            title="Start from a built-in drawing"
          >
            <option value="" disabled>Sample drawings…</option>
            {SPRIG_SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — {s.description}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={() => svgInputRef.current?.click()} className={btn} style={{ color: UI_MUTED }} title="Load an .svg file — black is the shape, white is background">
              Load SVG
            </button>
            <button onClick={() => setPasteOpen(true)} className={btn} style={{ color: UI_MUTED }} title="Paste SVG code into a box">
              Paste SVG
            </button>
            <input ref={svgInputRef} type="file" accept=".svg,image/svg+xml" onChange={handleSvgFile} className="hidden" />
          </div>
          <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 -mt-1 truncate" title={params.svgName}>
            Drawing: {params.svgName}
          </p>

          {/* Settings files */}
          <div className="border-t-[3px] border-[#555] pt-2 flex gap-2">
            <button onClick={handleLoadSettings} className={btn} style={{ color: UI_MUTED }} title="Load a sprig design (drawing included) from JSON">
              Load Settings
            </button>
            <button onClick={handleSaveSettings} className={btn} style={{ color: UI_MUTED }} title="Save the sprig design — the drawing is stored inside the file — plus a .txt bench sheet">
              Save Settings
            </button>
            <input ref={settingsInputRef} type="file" accept=".json" onChange={handleSettingsFile} className="hidden" />
          </div>

          {/* STL exports */}
          <div className="border-t-[3px] border-[#555] pt-2 flex flex-col gap-2">
            <button
              onClick={() => m && exportMesh(m.plate, m.layout.plateThk, `${settingsName || 'sprig'} plate`, true)}
              disabled={!m}
              className={bigBtn + ' disabled:opacity-40'}
              style={{ color: UI_MUTED }}
              title="Export the plate — the sprig relief on its base, one print"
            >
              Export Plate STL
            </button>
            <button
              onClick={() => m && exportMesh(m.wall, 0, wallFileName)}
              disabled={!m}
              className={bigBtn + ' disabled:opacity-40'}
              style={{ color: UI_MUTED }}
              title="The wall for this mold size — print 2 copies, once. Every plate of this size uses the same pair"
            >
              Export Wall STL — {sizeLabel(params)} (print 2)
            </button>
            {params.moldSize !== 'custom' && (
              <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
                Standard size: print this wall pair once — every {SPRIG_SIZES[params.moldSize].label} plate fits it.
              </p>
            )}
          </div>
        </div>

        <div className="px-3 py-3">
          {warnings.map((w, i) => (
            <div key={i} className="mb-2 px-2 py-1.5 rounded border border-amber-700 bg-amber-950/40 text-xs text-amber-200">
              {w}
            </div>
          ))}

          {/* View */}
          <GroupHeader label="View" color={GROUP_COLORS.settings} />
          <Toggle label="Plate" checked={view.showPlate} onChange={(v) => setView({ showPlate: v })} />
          <Toggle label="Wall A" checked={view.showWallA} onChange={(v) => setView({ showWallA: v })} tooltip="First wall in its assembled position" />
          <Toggle label="Wall B" checked={view.showWallB} onChange={(v) => setView({ showWallB: v })} tooltip="Second copy of the same wall, turned 180°" />
          <Toggle label="Plaster" checked={view.showPlaster} onChange={(v) => setView({ showPlaster: v })} tooltip="Translucent block showing the pour" />
          <Toggle label="Thin Parts" checked={view.showThin} onChange={(v) => setView({ showThin: v })} tooltip="Paint parts narrower than Min Feature Width red" />
          <Toggle label="Flat Shading" checked={view.flatShading} onChange={(v) => setView({ flatShading: v })} tooltip="Per-face normals — shows the grid the plate will actually print, and the V ridges as creases" />

          {/* Sprig */}
          <GroupHeader label="Sprig" color={GROUP_COLORS.structure} />
          <Section title="Size" titleColor={GROUP_COLORS.structure}>
            <SliderRow label="Width" value={params.width} {...SPRIG_PARAMS.width} suffix="mm" onChange={setWidth}
              tooltip="FINISHED width, left to right, after the clay shrinks. The printed relief is scaled up by Shrink" />
            <SliderRow label="Length" value={params.length} {...SPRIG_PARAMS.length} suffix="mm" onChange={setLength}
              tooltip="FINISHED length, bottom to top, after the clay shrinks" />
            <Toggle label="🔗 Keep Shape" checked={params.lockAspect} onChange={(v) => setParam('lockAspect', v)}
              tooltip="On: Width and Length move together and the drawing keeps its proportions. Off: stretch it" />
            <div className="flex gap-1.5 my-1">
              <button className={miniBtn} onClick={rotateCW} title="Turn a quarter clockwise">↻ 90°</button>
              <button className={miniBtn} onClick={() => setParam('flipX', !params.flipX)} title="Mirror left to right">⇋ Flip H</button>
              <button className={miniBtn} onClick={() => setParam('flipY', !params.flipY)} title="Mirror top to bottom">⇵ Flip V</button>
            </div>
            <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
              {params.rotation ? `Turned ${params.rotation}°. ` : ''}{params.flipX ? 'Flipped H. ' : ''}{params.flipY ? 'Flipped V. ' : ''}
              The cast faces the same way as the plate seen from above.
            </p>
          </Section>
          <Section title="Height" titleColor={GROUP_COLORS.structure}>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">From</label>
              <select
                value={params.heightMode}
                onChange={(e) => setParam('heightMode', e.target.value as SprigHeightMode)}
                className={selectCls}
                style={{ color: UI_MUTED }}
                title={HEIGHT_MODES.find((h) => h.value === params.heightMode)?.tooltip}
              >
                {HEIGHT_MODES.map((h) => <option key={h.value} value={h.value} title={h.tooltip}>{h.label}</option>)}
              </select>
            </div>
            {sl('maxHeight', 'Max Height', 'mm', 'Height of the tallest point of the FINISHED sprig')}
            {inflate && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Profile</label>
                  <select
                    value={params.profile}
                    onChange={(e) => setParam('profile', e.target.value as SprigProfile)}
                    className={selectCls}
                    style={{ color: UI_MUTED }}
                    title="Shape of the rise from the edge: Round = a dome, Pillow = steep sides and a flat top, Angular = a straight slope to a ridge"
                  >
                    <option value="round">Round</option>
                    <option value="pillow">Pillow</option>
                    <option value="angular">Angular</option>
                  </select>
                </div>
                {sl('roundness', 'Roundness', 'mm', 'How far in from the edge it takes to reach Max Height. Small = a flat-topped pillow; large = a full dome. Parts narrower than twice this never reach full height — that is what keeps legs and tails lower than the body')}
              </>
            )}
            {params.heightMode === 'inflateGray' && sl('detailDepth', 'Detail Depth', 'mm', 'How deep lighter-gray marks inside the shape cut in. Black is untouched; pure white is background, not detail')}
            <Toggle label="Invert" checked={params.invert} onChange={(v) => setParam('invert', v)}
              tooltip="Swap black and white inside the drawing's area — the background becomes the raised part" />
          </Section>
          <Section title="Edges" titleColor={GROUP_COLORS.structure}>
            {sl('edgeSoftness', 'Edge Softness', 'mm', 'Width of the slope from the edge up to full height. Higher blends into the vase and helps the cast drop out; 0 = as steep as the grid allows')}
            {sl('minEdgeThickness', 'Min Edge', 'mm', 'The edge stops at this thickness instead of tapering to nothing — a feathered edge at 0 is ragged and fragile, but you can test it')}
          </Section>
          <Section title="Checks" titleColor={GROUP_COLORS.structure}>
            {sl('minFeatureWidth', 'Min Feature', 'mm', 'Parts of the FINISHED sprig narrower than this are painted red: they may tear coming out of the mold or crack drying')}
            {m && (
              <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
                {m.relief.thinSpots === 0
                  ? 'Nothing narrower than this.'
                  : `${m.relief.thinSpots} thin part${m.relief.thinSpots === 1 ? '' : 's'}, thinnest ≈ ${m.relief.thinnestWidth.toFixed(1)} mm.`}
              </p>
            )}
          </Section>

          {/* Mold */}
          <GroupHeader label="Mold" color={GROUP_COLORS.surface} />
          <Section title="Mold Size" titleColor={GROUP_COLORS.surface}>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Size</label>
              <select
                value={params.moldSize}
                onChange={(e) => setParam('moldSize', e.target.value as SprigMoldSize)}
                className={selectCls}
                style={{ color: UI_MUTED }}
                title="Standard sizes share one wall pair each — print it once. ✓ = this sprig fits"
              >
                {STANDARD_ORDER.map((k) => (
                  <option key={k} value={k}>{SPRIG_SIZES[k].label}{sizeFits(k) ? ' ✓' : ' — too small'}</option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </div>
            {sl('plasterMargin', 'Plaster Margin', 'mm', 'Plaster between the sprig and the walls. Only decides whether the sprig fits — it never changes the walls')}
            {params.moldSize === 'custom' && (
              <div className="ml-2 pl-3 border-l-2 border-[var(--border-color)]">
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mt-1 mb-1">Custom box</p>
                {sl('customCavW', 'Inside Width', 'mm', 'Inside of the walls, left to right')}
                {sl('customCavL', 'Inside Length', 'mm', 'Inside of the walls, bottom to top')}
                {sl('customWallH', 'Wall Height', 'mm', 'Plaster depth — pour to the top of the walls')}
                {sl('customWallThickness', 'Wall Thickness', 'mm')}
                {sl('customFlangeWidth', 'Clip Flange', 'mm', 'Binder-clip flange — also carries the three V seals')}
                {sl('customPlateFloor', 'Plate Thickness', 'mm', 'Plate under its top face. Stiffness goes as the cube of this')}
                <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
                  A custom box needs its own walls. Changing any of these makes a new wall.
                </p>
              </div>
            )}
          </Section>
          <Section title="Print" titleColor={GROUP_COLORS.surface}>
            {sl('shrinkPercent', 'Shrink', '%', 'Clay shrinkage — the printed relief is scaled up by this so the FINISHED sprig comes out at the size above. In red because a wrong value is silent', '#f87171')}
            {sl('resolution', 'Grid', 'mm', 'Spacing of the relief grid on the printed plate. Finer = smoother and a bigger file')}
          </Section>

          {/* Analysis */}
          <GroupHeader label="Analysis" color={GROUP_COLORS.settings} />
          <Section title="Plaster Estimate" titleColor={GROUP_COLORS.settings}>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Material</label>
              <select
                value={params.material}
                onChange={(e) => setParam('material', e.target.value as PlasterType)}
                className={selectCls}
                style={{ color: UI_MUTED }}
              >
                {(Object.keys(PLASTER_MATERIALS) as PlasterType[]).map((k) => (
                  <option key={k} value={k}>{PLASTER_MATERIALS[k].label}</option>
                ))}
              </select>
            </div>
            <StatRow label="Plaster" value={`≈ ${est.volumeCm3.toFixed(0)} cm³`} />
            <StatRow label="Powder" value={`≈ ${fmt(est.powderGrams)} g`} />
            <StatRow label="Water" value={`≈ ${fmt(est.waterGrams)} g`} />
          </Section>
          {m && (
            <Section title="Printer Fit" titleColor={GROUP_COLORS.settings}>
              <StatRow label="Plate" value={`${m.layout.plateW.toFixed(0)} × ${m.layout.plateD.toFixed(0)} mm`} tooltip="Plate footprint — compare to your printer bed" />
              <StatRow label="Sprig (printed)" value={`${m.masterW.toFixed(1)} × ${m.masterL.toFixed(1)} × ${m.masterH.toFixed(1)} mm`} tooltip="The relief as printed — Shrink bigger than the finished sprig" />
              <StatRow
                label="Plaster behind"
                value={`${m.plasterBehind.toFixed(1)} mm`}
                tooltip={`Plaster between the tallest point of the sprig and the back of the mold. Under ${MIN_PLASTER_BEHIND} mm it can crack`}
              />
              <StatRow label="Wall set" value={`${m.box.cavW} × ${m.box.cavL} × ${m.box.wallH} mm`} tooltip="Inside of the walls (W × L × H)" />
              <StatRow label="Plate STL" value={stlSize(m.plateStats.triangleCount)} />
              <StatRow label="Wall STL" value={stlSize(m.wallStats.triangleCount)} />
            </Section>
          )}

          {savedParams && savedParams !== params && (
            <button
              onClick={revertToSaved}
              className="mt-2 w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Put everything back to the last Save/Load Settings, drawing included"
            >
              Revert to Saved
            </button>
          )}
          <button
            onClick={reset}
            className="mt-2 w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
            title="Restore the default settings. Your drawing, its size and which way it faces are not touched"
          >
            Reset Sprig Settings
          </button>
          <p className="mt-1 text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
            Keeps your drawing and its size. Undoable with ↶.
          </p>
        </div>
      </div>

      {pasteOpen && <PasteDialog onClose={() => setPasteOpen(false)} onApply={(text) => applySvg(text, 'pasted SVG')} />}
    </div>
  );
}

/** Paste box: SVG code (or a data URL / CSS url() line), with a live preview. */
function PasteDialog({ onClose, onApply }: { onClose: () => void; onApply: (text: string) => Promise<string | null> }) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  useEffect(() => {
    if (!text.trim()) { setPreviewUrl(null); return; }
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([parseSvgInput(text)], { type: 'image/svg+xml;charset=utf-8' }));
      setPreviewUrl(url);
    } catch {
      setPreviewUrl(null);
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [text]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-lg p-0 w-[480px] max-w-[90vw] max-h-[80vh] bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-color)] shadow-xl backdrop:bg-black/50"
    >
      <div className="p-4 flex flex-col gap-3">
        <h3 className="text-sm font-medium">Paste SVG</h3>
        <p className="text-xs text-[var(--text-secondary)]">Black is the shape, white is background, grays are in between.</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='<svg xmlns="http://www.w3.org/2000/svg" ...>...</svg>'
          className="w-full h-40 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-primary)] resize-y"
          spellCheck={false}
        />
        {previewUrl && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" className="w-48 h-48 object-contain border border-[var(--border-color)] rounded bg-white" />
          </div>
        )}
        {problem && <p className="text-xs text-amber-300">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors">
            Cancel
          </button>
          <button
            onClick={async () => {
              const p = await onApply(text.trim());
              if (p) setProblem(p); else onClose();
            }}
            disabled={!text.trim()}
            className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 transition-colors disabled:opacity-40"
          >
            Use It
          </button>
        </div>
      </div>
    </dialog>
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
