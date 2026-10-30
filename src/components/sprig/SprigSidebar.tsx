'use client';
import { ShowFacetsToggle } from '@/components/parameters/ShowFacetsToggle';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Section, SliderRow, Toggle, GroupHeader, ResetRow, ToggleAllSectionsButton } from '@/components/parameters/ui';
import { setShowFacets, useSprigColors, setSprigColors, DEFAULT_SPRIG_COLOR, DEFAULT_SPRIG_BACKGROUND } from '@/store/view-prefs';
import { asMark, DEFAULT_VIEW } from '@/store/sprig-store';
import { useSprigDesign } from './sprig-design-context';
import { SprigAdjust } from './SprigAdjust';
import { PhotoDepthHost, PhotoDepthStatusLine, askPhotoDepth } from './PhotoDepth';
import { ToolNav } from '@/components/parameters/ToolNav';
import { DesignNameRow, NamePromptHost, ensureNamed } from '@/components/parameters/DesignName';
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
import { loadSprigSource, pictureFromFile, pictureLooksLikePhoto, reliefFromStlFile } from '@/lib/sprig-source';
import { SPRIG_FONTS } from '@/lib/sprig-fonts';
import { systemFontFound } from '@/lib/sprig-text';
import { GRAY_INK, type SprigSource } from '@/engine/sprig/relief';
import { translateMesh } from '@/engine/handle/mesh3';
import { fitsBox, MIN_PLASTER_BEHIND } from '@/engine/sprig/sprig-generator';
import {
  mergeSprigParameters, sizeLabel, SPRIG_SIZES, SIZE_MENU,
  type SprigParameters, type SprigHeightMode, type SprigMoldSize,
  sprigFootprint, type SprigBacking, isPictureDrawing, hasText, backingOn, drawingDefaults,
  type SprigFont, type SprigTextStyle, type SprigTextPosition,
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
/** The vase tab's per-section Reset link, same look. */
const resetBtn = 'text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors';
const selectCls = 'flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs';

/** The Shaping buttons, in their two rows (Gary 2026-10-29: buttons are
 *  faster than a menu). `short` is the button; `label` names it elsewhere. */
const HEIGHT_MODES: { value: SprigHeightMode; label: string; short: string; tooltip: string }[] = [
  { value: 'flat', label: 'Flat', short: 'Flat', tooltip: 'One height for the whole shape — only the edge is shaped' },
  { value: 'inflate', label: 'Inflate', short: 'Inflate', tooltip: 'Blow the flat outline up like a balloon: the further a point is from the edge the higher it rises, up to Max Height. Thick parts reach full height, thin legs and tails stay lower' },
  { value: 'photoDepth', label: 'Photo depth', short: 'Photo depth', tooltip: 'For photos of real things — flowers, shells, animals: a depth model on your computer works out how near each part looks, and the shape rises with it, rounded at the outline. The first time it downloads about 55 MB, once. Little gain on flat drawings: use Inflate' },
  { value: 'gray', label: 'Gray', short: 'Gray', tooltip: 'Black is Max Height, white is the plate, grays in between. For a drawing with shading, or a height map' },
  { value: 'inflateGray', label: 'Inflate + Gray detail', short: 'Inflate + Gray', tooltip: 'Inflate, and lighter-gray marks inside the shape (eyes, scales, veins) cut in by up to Detail Depth. Pure white counts as background, so draw details in gray' },
];
/** What a picture's tones do under this Shaping, for the Picture/SVG notes. */
const modeLabel = (m: SprigHeightMode) => HEIGHT_MODES.find((h) => h.value === m)?.label ?? m;

export function SprigSidebar({ sprig, tab, onTab, helpOpen, onToggleHelp }: {
  sprig: SprigMeshState;
  /** Which design the tabs show: the sprig, or the maker's mark for the bottom. */
  tab: 'sprig' | 'mark';
  onTab: (t: 'sprig' | 'mark') => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
}) {
  const m = sprig.meshes;
  // The design these controls edit (Sprig | Mark tabs) — same controls, own store.
  const design = useSprigDesign();
  const useSprigStore = design.useStore;
  const sprigHistory = design.history;
  const useSprigHistory = design.useHistory;
  const isMark = tab === 'mark';
  /** "Sprig" or "Mark", for names, prompts and messages. */
  const What = isMark ? 'Mark' : 'Sprig';
  const what = What.toLowerCase();
  const fileType = isMark ? 'mark-settings' : 'sprig-settings';
  const params = useSprigStore((s) => s.params);
  const view = useSprigStore((s) => s.view);
  const settingsName = useSprigStore((s) => s.settingsName);
  const setParam = useSprigStore((s) => s.setParam);
  const setParams = useSprigStore((s) => s.setParams);
  const setView = useSprigStore((s) => s.setView);
  const setSettingsName = useSprigStore((s) => s.setSettingsName);
  const setWidth = useSprigStore((s) => s.setWidth);
  const setLength = useSprigStore((s) => s.setLength);
  const rotateCW = useSprigStore((s) => s.rotateCW);
  /** Text ↺/↻: a quarter turn, kept in −180…180. */
  const turnText = (by: number) =>
    setParam('textRotation', ((((useSprigStore.getState().params.textRotation + by) % 360) + 540) % 360) - 180);
  const loadSvg = useSprigStore((s) => s.loadSvg);
  const loadRelief = useSprigStore((s) => s.loadRelief);
  const reset = useSprigStore((s) => s.reset);
  const resetFields = useSprigStore((s) => s.resetFields);
  const resetOrientation = useSprigStore((s) => s.resetOrientation);
  const markSaved = useSprigStore((s) => s.markSaved);
  const savedParams = useSprigStore((s) => s.savedParams);
  const revertToSaved = useSprigStore((s) => s.revertToSaved);
  const doUndo = useSprigStore((s) => s.undo);
  const doRedo = useSprigStore((s) => s.redo);
  const { canUndo, canRedo } = useSprigHistory();
  const S = 1 + params.shrinkPercent / 100;
  /** Each section's settings: what its Reset restores, and what its
   *  "changed" dot compares with the defaults. */
  const K: Record<string, (keyof SprigParameters)[]> = {
    picture: ['imageSmooth', 'imageTones'],
    svg: ['svgTones'],
    text: ['textFont', 'textFontName', 'textHeight', 'textStyle', 'textDepth', 'textPosition', 'textGap', 'textOffsetX', 'textOffsetY', 'textRotation', 'drawingOn'],
    backing: ['backing', 'backingThickness', 'backingBorder', 'backingCorner', 'backingEdge'],
    resolution: ['resolution'],
    moldSize: ['plasterMargin', 'customCavW', 'customCavL', 'customWallH', 'customWallThickness', 'customFlangeWidth', 'plateThickness'],
    print: ['shrinkPercent'],
    plaster: ['material'],
    placement: ['onVaseHeight', 'onVaseAngle', 'onVaseTilt', 'onVaseCopies', 'onVaseHandle'],
    shaping: ['heightMode'],
    size: ['rotation', 'flipX', 'flipY'],
  };
  // Measured from THIS drawing's defaults: a relief's or a photo's own settings.
  const base = drawingDefaults(design.defaults, params);
  const changed = (keys: (keyof SprigParameters)[]) => keys.some((k) => params[k] !== base[k]);

  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z, matching the other tabs.
  const onKey = useCallback((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
    const t = e.target as HTMLElement | null;
    // Typing boxes keep their own undo; a slider or switch clicked last does not
    // (it keeps the focus, so skipping every INPUT broke Cmd+Z after a slider).
    const typing = t?.tagName === 'TEXTAREA' || (t?.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color'].includes((t as HTMLInputElement).type));
    if (typing) return;
    e.preventDefault();
    if (e.shiftKey) doRedo(); else doUndo();
  }, [doUndo, doRedo]);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [svgError, setSvgError] = useState<string | null>(null);
  const settingsInputRef = useRef<HTMLInputElement>(null);
  const svgInputRef = useRef<HTMLInputElement>(null);
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const reliefInputRef = useRef<HTMLInputElement>(null);
  const [reliefBusy, setReliefBusy] = useState(false);

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
        const r = await loadSprigSource(markup, undefined, { fill: params.svgFill, closeGaps: params.svgCloseGaps, tones: params.svgTones });
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

  // ── Picture in ──

  /** A PNG/JPG: shrink it, prepare it with the current Picture settings to
   *  measure the shape, then hand it over as one undoable step. A picture's
   *  tones are the point, so Flat/Inflate move to Inflate + Gray detail. */
  const handlePictureFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const name = file.name.replace(/\.[a-z0-9]+$/i, '');
    let problem: string | null = null;
    // After a relief or height map (Tones As made: Background 0, nothing
    // softened) a new picture starts from the default picture and edge
    // settings — Gary's photo came in as a full rectangle (2026-10-29).
    const fromRelief = params.imageTones === -1;
    const pic = fromRelief ? design.defaults : params;
    try {
      const url = await pictureFromFile(file);
      const r = await loadSprigSource(url, {
        background: pic.imageBackground, closeGaps: pic.imageCloseGaps, smooth: pic.imageSmooth, tones: pic.imageTones,
      });
      if (!r) problem = 'Everything in that picture counts as background. Try a picture with a plain background, or lower Background Cut after loading.';
      else {
        loadSvg(url, name, r.aspect);
        if (fromRelief) resetFields(['imageBackground', 'imageCloseGaps', 'imageSmooth', 'imageTones', 'imageLightest', 'edgeSoftness', 'minEdgeThickness']);
        const photo = await pictureLooksLikePhoto(url);
        // A photo is offered Photo depth (asked until the first yes); anything
        // else keeps the picture's tones in play as before.
        if (photo && await askPhotoDepth(true)) setParams({ heightMode: 'photoDepth', loadedAs: 'photoDepth' });
        else if (params.heightMode === 'flat' || params.heightMode === 'inflate' || params.heightMode === 'photoDepth') setParam('heightMode', 'inflateGray');
      }
    } catch {
      problem = 'That picture could not be opened. Try saving it as PNG or JPG.';
    }
    setSvgError(problem);
  };

  /** A relief someone else made, as an STL (e.g. MakerWorld's Relief Sculpture
   *  Maker): its top surface becomes a height map, read as made — its own
   *  size, its own height, Gray. Their plaque is dropped; ours is the plate. */
  const handleReliefFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const name = file.name.replace(/\.stl$/i, '');
    let problem: string | null = null;
    setReliefBusy(true);
    try {
      const r = await reliefFromStlFile(file);
      if (!r) problem = 'Nothing in that STL stands above its base plate — it needs to be a relief on a flat plaque.';
      else loadRelief(r.url, name, r);
    } catch {
      problem = 'That file could not be read as an STL.';
    }
    setReliefBusy(false);
    setSvgError(problem);
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
    const json = JSON.stringify({ app: 'VaseMaker', type: fileType, settings: params }, null, 2);
    const name = await ensureNamed(What, design.isUnnamed(settingsName), settingsName, setSettingsName);
    if (!name) return;
    const chosenName = await saveDesignFile(json, name);
    if (chosenName === null) return;
    markSaved(params, chosenName);
    // A mark has no mold, so no bench sheet.
    if (!m || isMark) return;
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
        { label: 'Height', value: modeLabel(params.heightMode) },
        { label: 'Resolution', value: `${params.resolution} mm` },
      ],
    }), chosenName);
  };

  const applySettingsText = (text: string, baseName: string) => {
    try {
      const parsed = JSON.parse(text);
      // Either kind loads into either tab: a sprig can become a mark, and a
      // mark can be cast as a sprig.
      if (!parsed || typeof parsed !== 'object' || (parsed.type !== 'sprig-settings' && parsed.type !== 'mark-settings')) {
        if (parsed && typeof parsed === 'object' && ('radius' in parsed || 'profilePoints' in parsed)) {
          alert('That file is a vase design. Load it with Load Design on the Vase tab.');
        } else if (parsed && typeof parsed === 'object' && (parsed.type === 'mold-settings' || parsed.type === 'handle-settings')) {
          alert(`That file is a ${parsed.type === 'mold-settings' ? 'mold' : 'handle'} design. Load it on the ${parsed.type === 'mold-settings' ? 'Mold' : 'Handle'} tab.`);
        } else {
          alert(`Not a ${what} design file.`);
        }
        return;
      }
      const merged = mergeSprigParameters(parsed.settings, design.defaults);
      const loaded = isMark ? asMark(merged) : merged;
      sprigHistory.skipNextRecord();
      useSprigHistory.getState().clear();
      useSprigStore.setState({ params: loaded, savedParams: loaded, settingsName: baseName });
    } catch {
      alert(`Not a ${what} design file.`);
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
  const [footW, footL] = sprigFootprint(params, hasText(params) ? sprig.textSize : null);
  const sizeFits = (k: Exclude<SprigMoldSize, 'custom'>) =>
    fitsBox(footW * S, footL * S, SPRIG_SIZES[k].cavW, SPRIG_SIZES[k].cavL, params.plasterMargin);
  const backingOnUI = params.backing !== 'none' && params.backingThickness > 0;
  // Warnings with a control in Adjust are shown there, above it.
  const warnings = [...(sprig.error ? [sprig.error] : []), ...(svgError ? [svgError] : []),
    ...(m?.notes ?? []).filter((n) => n.kind === 'cutText').map((n) => n.text)];

  return (
    <div data-sidebar className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] flex-1">SprigMaker</h1>
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
          <ToggleAllSectionsButton />
        </div>
        <ToolNav current="sprig" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
        <div className="grid grid-cols-2 gap-1 my-1.5">
          {([['sprig', 'Sprig', 'A sprig: a relief cast in its own one-piece plaster mold, to press onto a pot'],
             ['mark', 'Mark', 'Your maker\'s mark for the bottom of a piece — initials, a symbol, a logo. One mark, kept in this browser and saved to its own file']] as const).map(([t, label, tip]) => (
            <button key={t} onClick={() => onTab(t)} title={tip}
              className={`px-2 py-1 text-xs rounded border transition-colors ${tab === t ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-secondary)]'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          {isMark
            ? 'Maker\'s mark for the bottom of a piece. Put it on a vase in the Vase tab\'s Foot & Mark section.'
            : 'SVG or picture sprig + one-piece plaster mold'}
        </p>
        <DesignNameRow what={What} name={settingsName} unnamed={design.isUnnamed(settingsName)} onRename={setSettingsName} />
        <NamePromptHost />
      </div>

      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-[var(--border-color)] flex flex-col gap-2">
          {/* Design files, then exports, then the drawing — the other pages' order
              (Gary 2026-10-29) */}
          <div className="flex gap-2">
            <button onClick={handleLoadSettings} className={btn} style={{ color: UI_MUTED }} title={`Load a ${what} design (drawing included) from JSON. A sprig file can be loaded as a mark, and a mark as a sprig`}>
              Load Design
            </button>
            <button onClick={handleSaveSettings} className={btn} style={{ color: UI_MUTED }} title={isMark ? 'Save the mark — the drawing is stored inside the file' : 'Save the sprig design — the drawing is stored inside the file — plus a .txt bench sheet'}>
              Save Design
            </button>
            <input ref={settingsInputRef} type="file" accept=".json" onChange={handleSettingsFile} className="hidden" />
          </div>
          <div className="flex gap-2 -mt-1">
            {savedParams && savedParams !== params && (
              <button onClick={revertToSaved} className={miniBtn}
                title="Put everything back to the last Save Design / Load Design, drawing included. Undoable with ↶">
                Revert to Saved
              </button>
            )}
            <button onClick={reset} className={miniBtn}
              title={`Every ${what} setting back to its default — a dot on a section's title shows which have changed. Keeps your drawing, its size and which way it faces. A relief STL goes back to its settings as loaded, and a Photo depth photo keeps Photo depth. Undoable with ↶`}>
              Reset All Settings
            </button>
          </div>

          {/* STL exports — a mark has no mold of its own */}
          {!isMark && <div className="border-t-[3px] border-[#555] pt-2 flex flex-col gap-2">
            <button
              onClick={async () => {
                if (!m) return;
                const name = await ensureNamed('Sprig', design.isUnnamed(settingsName), settingsName, setSettingsName);
                if (name) exportMesh(m.plate, m.layout.plateThk, `${name} plate`, true);
              }}
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
          </div>}

          <div className="border-t-[3px] border-[#555] pt-2 flex flex-col gap-2">
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
              <button onClick={() => pictureInputRef.current?.click()} className={btn} style={{ color: UI_MUTED }} title="Load a PNG or JPG — a clean drawing on a plain background works best; darker tones stand higher">
                Load Image
              </button>
              <input ref={svgInputRef} type="file" accept=".svg,image/svg+xml" onChange={handleSvgFile} className="hidden" />
              <input ref={pictureInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => void handlePictureFile(e)} className="hidden" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => reliefInputRef.current?.click()} disabled={reliefBusy} className={btn} style={{ color: UI_MUTED }}
                title="Load a relief someone else made, as an STL (a shape standing on a flat plaque — e.g. MakerWorld's Relief Sculpture Maker). It comes in at its own size and height; their plaque is dropped and the sprig sits on this mold's plate">
                {reliefBusy ? 'Reading STL…' : 'Load Relief STL'}
              </button>
              <input ref={reliefInputRef} type="file" accept=".stl,model/stl,application/sla" onChange={(e) => void handleReliefFile(e)} className="hidden" />
            </div>
            <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 -mt-1 truncate" title={params.svgName}>
              Drawing: {params.svgName}
            </p>

            {/* Shaping, next to the drawing (Gary 2026-10-29: push a
                button, get a good result) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]" title="How the heights are made from the drawing">Shaping</span>
                <button onClick={() => resetFields(K.shaping)} className={resetBtn} title="Shaping back to its default">Reset</button>
              </div>
              {[HEIGHT_MODES.slice(0, 3), HEIGHT_MODES.slice(3)].map((row, r) => (
                <div key={r} className={`grid gap-1 mb-1 ${r === 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {row.map((h) => (
                    <button key={h.value} title={h.tooltip}
                      onClick={async () => {
                        if (h.value === 'photoDepth' && !(await askPhotoDepth(false))) return;
                        setParam('heightMode', h.value);
                      }}
                      className={`px-1 py-1 text-xs rounded border transition-colors ${params.heightMode === h.value ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-secondary)]'}`}>
                      {h.short}
                    </button>
                  ))}
                </div>
              ))}
              {params.heightMode === 'photoDepth' && <PhotoDepthStatusLine onTurnOn={() => void askPhotoDepth(false)} />}
              {/* Every adjustment, each with its warning (SprigAdjust.tsx) */}
              <SprigAdjust params={params} defaults={base} relief={m?.relief ?? null} notes={m?.notes ?? []}
                isMark={isMark} textSize={hasText(params) ? sprig.textSize : null}
                setParam={setParam} setParams={setParams} setWidth={setWidth} setLength={setLength} />
            </div>
          </div>
          <PhotoDepthHost />
        </div>

        <div className="px-3 py-3">
          {warnings.map((w, i) => (
            <div key={i} className="mb-2 px-2 py-1.5 rounded border border-amber-700 bg-amber-950/40 text-xs text-amber-200">
              {w}
            </div>
          ))}

          {/* View */}
          <GroupHeader label="View" color={GROUP_COLORS.settings} />
          <Section title="Display" titleColor={GROUP_COLORS.settings} tooltip="How the preview looks. Nothing here changes what you print">
          <ResetRow title="The Display switches back to their defaults (stays in this view; the On Vase placement has its own Reset)" onClick={() => { setView({ ...DEFAULT_VIEW, onVase: view.onVase }); setShowFacets(true); setSprigColors({ sprig: DEFAULT_SPRIG_COLOR, background: DEFAULT_SPRIG_BACKGROUND }); }} />
          {!isMark && <div className="grid grid-cols-2 gap-1 mb-2">
            {([[false, 'Mold', 'The plate, walls and plaster you print and pour'], [true, 'On Vase', 'The sprig laid onto your current VaseMaker vase, to judge size and placement']] as const).map(([on, label, tip]) => (
              <button key={label} onClick={() => setView({ onVase: on })} title={tip}
                className={`px-2 py-1 text-xs rounded border transition-colors ${view.onVase === on ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-secondary)]'}`}>
                {label}
              </button>
            ))}
          </div>}
          {isMark ? (
            <>
              <SprigColorRows what="mark" />
              <ShowFacetsToggle />
              <Toggle label="Thin Parts" checked={view.showThin} onChange={(v) => setView({ showThin: v })} tooltip="Paint parts narrower than Min Feature red" />
              <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 mb-2">
                The mark at its finished size, as seen on the bottom of the piece from below.
              </p>
            </>
          ) : !view.onVase ? (
            <>
              <Toggle label="Plate" checked={view.showPlate} onChange={(v) => setView({ showPlate: v })} />
              <Toggle label="Wall A" checked={view.showWallA} onChange={(v) => setView({ showWallA: v })} tooltip="First wall in its assembled position" />
              <Toggle label="Wall B" checked={view.showWallB} onChange={(v) => setView({ showWallB: v })} tooltip="Second copy of the same wall, turned 180°" />
              <Toggle label="Plaster" checked={view.showPlaster} onChange={(v) => setView({ showPlaster: v })} tooltip="Translucent block showing the pour" />
              <SprigColorRows what="sprig" />
              <ShowFacetsToggle />
              <Toggle label="Thin Parts" checked={view.showThin} onChange={(v) => setView({ showThin: v })} tooltip="Paint parts narrower than Min Feature Width red" />
            </>
          ) : (
            <>
              <ShowFacetsToggle />
              <div className="flex items-center justify-between mt-2 mb-1">
                <span className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">Placement</span>
                <button onClick={() => resetFields(K.placement)} className={resetBtn} title="On Vase placement back to its defaults">Reset</button>
              </div>
              <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 mb-2">
                The vase is the one open in VaseMaker; change it there. The sprig drapes over any texture, the way soft clay pressed on does.
              </p>
              {sl('onVaseHeight', 'Height', '%', 'Height of the sprig\'s centre on the vase, as a % of the vase\'s height')}
              {sl('onVaseAngle', 'Around', '°', 'Where round the vase the sprig sits')}
              {sl('onVaseTilt', 'Tilt', '°', 'Turn the sprig on the vase wall, clockwise (+) as you look at it')}
              {sl('onVaseCopies', 'Repeat', '', 'Copies spaced evenly round the vase')}
              <Toggle label="Show Handle" checked={params.onVaseHandle} onChange={(v) => setParam('onVaseHandle', v)}
                tooltip="Put the HandleMaker handle on the vase, to place sprigs beside it. Where it sits is set in HandleMaker (Top Below Rim)" />
              {params.onVaseHandle && (
                <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 mb-2">
                  The handle sits where HandleMaker puts it — change its height there (Top Below Rim).
                </p>
              )}
            </>
          )}
          </Section>

          {/* Sprig */}
          <GroupHeader label={What} color={GROUP_COLORS.structure} />
          {isPictureDrawing(params.svg) && (
            <Section title="Picture" changed={changed(K.picture)} titleColor={GROUP_COLORS.structure} tooltip="How the picture becomes a shape: what counts as background, and how its tones become heights">
              <div className="flex justify-end mb-1">
                <button onClick={() => resetFields(K.picture)} className={resetBtn} title="Smooth and Tones back to their defaults">Reset</button>
              </div>
              {sprig.source?.mask && <PicturePreview source={sprig.source} />}
              <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 mb-2">
                Background Cut and Close Gaps are under Adjust → Outline.
              </p>
              {sl('imageSmooth', 'Smooth', 'px', 'Blurs speckle inside the drawing before the tones are read (JPEG pictures are full of it). 0 = none')}
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Tones</label>
                <select
                  value={params.imageTones}
                  onChange={(e) => setParam('imageTones', Number(e.target.value))}
                  className={selectCls}
                  style={{ color: UI_MUTED }}
                  title="Steps = the picture's greys grouped into that many flat levels, darkest highest — clean terraces that release well. Smooth = every grey its own height (shows speckle and shading), stretched to fill Max Height. As made = the grey IS the height, unstretched: for height maps and loaded relief STLs"
                >
                  <option value={2}>2 steps</option>
                  <option value={3}>3 steps</option>
                  <option value={4}>4 steps</option>
                  <option value={5}>5 steps</option>
                  <option value={0}>Smooth</option>
                  <option value={-1}>As made (height map)</option>
                </select>
              </div>
              {params.heightMode !== 'gray' && params.heightMode !== 'inflateGray' && (
                <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
                  {params.heightMode === 'photoDepth'
                    ? 'Shaping is Photo depth, so Smooth and Tones are not used — the heights come from the depth. Background Cut still decides the outline.'
                    : `Shaping is ${modeLabel(params.heightMode)}, so the tones are not used — only the outline. Pick Gray or Inflate + Gray to use them.`}
                </p>
              )}
            </Section>
          )}
          {!isPictureDrawing(params.svg) && (
            <Section title="SVG" changed={changed(K.svg)} titleColor={GROUP_COLORS.structure} tooltip="How the SVG becomes a shape: fill outline drawings solid, and group its shades into height steps">
              <div className="flex justify-end mb-1">
                <button onClick={() => resetFields(K.svg)} className={resetBtn} title="Tones back to its default (as drawn)">Reset</button>
              </div>
              {sprig.source && <PicturePreview source={sprig.source} threshold={params.heightMode === 'gray' || params.heightMode === 'inflateGray' ? GRAY_INK : 0.5} />}
              <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 mb-2">
                Fill Outlines and Close Gaps are under Adjust, at the top.
              </p>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Tones</label>
                <select
                  value={params.svgTones}
                  onChange={(e) => setParam('svgTones', Number(e.target.value))}
                  className={selectCls}
                  style={{ color: UI_MUTED }}
                  title="As drawn = each shade's darkness is its height. Steps = the SVG's shades grouped into that many flat levels, darkest highest — clean terraces that release well. Colours count by how dark they are"
                >
                  <option value={0}>As drawn</option>
                  <option value={2}>2 steps</option>
                  <option value={3}>3 steps</option>
                  <option value={4}>4 steps</option>
                  <option value={5}>5 steps</option>
                </select>
              </div>
              {params.heightMode !== 'gray' && params.heightMode !== 'inflateGray' && (
                <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
                  {params.heightMode === 'photoDepth'
                    ? 'Shaping is Photo depth, so Tones are not used — the heights come from the depth.'
                    : `Shaping is ${modeLabel(params.heightMode)}, so shades are not used — only the outline. Pick Gray or Inflate + Gray to use them.`}
                </p>
              )}
            </Section>
          )}
          <Section title="Turn & Flip" changed={changed(K.size)} titleColor={GROUP_COLORS.structure} tooltip="Turn or mirror the drawing. Width, Length and Lock are under Adjust, at the top">
            <div className="flex justify-end mb-1">
              <button onClick={resetOrientation} className={resetBtn} title="Back to the drawing as loaded: unturned, unflipped, its own proportions (🔗 on). The longer side keeps its size">Reset</button>
            </div>
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
          <Section title="Text" changed={changed(K.text)} titleColor={GROUP_COLORS.structure} tooltip="Words on the sprig: raised letters, or letters cut into a backing sheet">
            <div className="flex justify-end mb-1">
              <button onClick={() => resetFields(K.text)} className={resetBtn} title="Text settings back to their defaults. The words are kept">Reset</button>
            </div>
            <TextBox value={params.text} onCommit={(v) => setParam('text', v)} />
            {hasText(params) && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Font</label>
                  <select
                    value={params.textFont}
                    onChange={(e) => setParam('textFont', e.target.value as SprigFont)}
                    className={selectCls}
                    style={{ color: UI_MUTED }}
                    title="Built-in fonts look the same on every computer. Bold strokes cast best; the two scripts join their letters, so a word casts in one piece"
                  >
                    {(Object.keys(SPRIG_FONTS) as (keyof typeof SPRIG_FONTS)[]).map((k) => (
                      <option key={k} value={k}>{SPRIG_FONTS[k].label}</option>
                    ))}
                    <option value="system">Installed font…</option>
                  </select>
                </div>
                {params.textFont === 'system' && <SystemFontBox value={params.textFontName} onCommit={(v) => setParam('textFontName', v)} />}
                {sl('textHeight', 'Letter Height', 'mm', 'Height of a capital letter, finished. Strokes need about 1.5 mm to cast, so about 6–8 mm is the smallest that works in a bold font')}
                {!isMark && <div className="flex items-center gap-2 mb-2">
                  <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Style</label>
                  <select
                    value={params.textStyle}
                    onChange={(e) => setParam('textStyle', e.target.value as SprigTextStyle)}
                    className={selectCls}
                    style={{ color: UI_MUTED }}
                    title="Raised = the letters stand up. Cut In = the letters are sunk into the backing sheet (turn on Plaque or Outline) — nothing small to break off"
                  >
                    <option value="raised">Raised</option>
                    <option value="cut">Cut In</option>
                  </select>
                </div>}
                {sl('textDepth', params.textStyle === 'raised' ? 'Raise' : 'Depth', 'mm', params.textStyle === 'raised'
                  ? 'How high the letters stand above what is under them'
                  : 'How deep the letters sink. At least 0.4 mm of sheet is always kept under them')}
                {params.textStyle === 'cut' && !backingOn(params) && (
                  <p className="text-[10px] leading-snug text-[#e0a040] px-0.5 mb-1">
                    Cut In letters sink into a backing sheet. Turn on Plaque or Outline under Backing.
                  </p>
                )}
                {params.drawingOn && (
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Position</label>
                    <select
                      value={params.textPosition}
                      onChange={(e) => setParam('textPosition', e.target.value as SprigTextPosition)}
                      className={selectCls}
                      style={{ color: UI_MUTED }}
                      title="Where the text sits beside the drawing. On Top = over the middle of the drawing"
                    >
                      <option value="below">Below</option>
                      <option value="above">Above</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="over">On Top</option>
                    </select>
                  </div>
                )}
                {params.drawingOn && params.textPosition !== 'over' && sl('textGap', 'Gap', 'mm', 'Space between the drawing and the text')}
                {sl('textOffsetX', 'Nudge ↔', 'mm', 'Move the text right (+) or left (−). The whole sprig stays centred in the mold, so the drawing shifts the other way by half')}
                {sl('textOffsetY', 'Nudge ↕', 'mm', 'Move the text up (+) or down (−), as seen from above. The whole sprig stays centred in the mold, so the drawing shifts the other way by half')}
                <div className="flex gap-1.5 my-1">
                  <button className={miniBtn} onClick={() => turnText(-90)} title="Turn the text a quarter to the left (counter-clockwise)">↺ 90°</button>
                  <button className={miniBtn} onClick={() => turnText(90)} title="Turn the text a quarter to the right (clockwise)">↻ 90°</button>
                </div>
                {sl('textRotation', 'Text Angle', '°', 'Turn the text to any angle, clockwise (+) or counter-clockwise (−), as seen from above. The drawing\'s Rotate does not turn the text')}
                <Toggle label="Show Drawing" checked={params.drawingOn} onChange={(v) => setParam('drawingOn', v)}
                  tooltip="Off = the text alone, with no drawing" />
                {!isMark && m && params.textStyle === 'raised' && !backingOn(params) && m.relief.pieces > 1 && (
                  <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
                    Separate letters cast as separate pieces. A Plaque or Outline backing joins them, or use a Script font.
                  </p>
                )}
                {sprig.textSize === null && (
                  <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">Drawing the text…</p>
                )}
              </>
            )}
          </Section>
          {!isMark && <Section title="Backing" changed={changed(K.backing)} titleColor={GROUP_COLORS.structure} tooltip="A thin sheet under the drawing, so separate pieces cast as one">
            <div className="flex justify-end mb-1">
              <button onClick={() => resetFields(K.backing)} className={resetBtn} title="Backing back to its defaults (none)">Reset</button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Type</label>
              <select
                value={params.backing}
                onChange={(e) => setParam('backing', e.target.value as SprigBacking)}
                className={selectCls}
                style={{ color: UI_MUTED }}
                title="None = the drawing only. Plaque = a tile behind the whole drawing. Outline = a sheet that follows the drawing and fills the gaps between its pieces"
              >
                <option value="none">None</option>
                <option value="plaque">Plaque</option>
                <option value="outline">Outline</option>
              </select>
            </div>
            {params.backing !== 'none' && (
              <>
                {sl('backingThickness', 'Thickness', 'mm', 'Sheet thickness, FINISHED. Max Height sits on top of it. 0 = no sheet: separate pieces')}
                {sl('backingBorder', 'Border', 'mm', params.backing === 'plaque'
                  ? 'How far the plaque reaches past the drawing on every side'
                  : 'How far the sheet reaches past the drawing. 0 = it only fills the gaps between pieces')}
                {params.backing === 'plaque' && sl('backingCorner', 'Corner', 'mm', 'Rounding of the plaque corners. 0 = square')}
                {sl('backingEdge', 'Backing Edge', 'mm', 'Width of the slope at the sheet\'s outer edge, so it blends onto the vase and drops out of the mold. Same as Thickness ≈ 45°; 0 = a straight step. Edge Lip applies here too')}
                {m && params.backing === 'outline' && backingOnUI && (
                  <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
                    {m.relief.bridgedGap > 0
                      ? `The sheet crosses gaps up to about ${m.relief.bridgedGap.toFixed(1)} mm to join the pieces.`
                      : 'No gaps needed filling.'}
                  </p>
                )}
                {backingOnUI && (
                  <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
                    Total thickness ≈ {m ? m.relief.maxHeight.toFixed(1) : '…'} mm.
                  </p>
                )}
              </>
            )}
          </Section>}

          {/* Resolution: its own section on both tabs, last before the Mold
              group — the same name on every page (Gary, 2026-10-26). */}
          <Section title="Resolution" changed={changed(K.resolution)} titleColor={GROUP_COLORS.structure}>
            <div className="flex justify-end mb-1">
              <button onClick={() => resetFields(K.resolution)} className={resetBtn} title="Resolution back to its default">Reset</button>
            </div>
            {isMark
              ? sl('resolution', 'Resolution', 'mm', 'Spacing of the points that make up the mark. Smaller = crisper edges but a heavier vase mesh')
              : sl('resolution', 'Resolution', 'mm', 'The spacing of the points that make up the relief on the printed plate. Smaller = a smoother surface but a larger file')}
            <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 mb-1">Smaller is finer (it is a spacing, unlike the Vase and Handle counts).</p>
          </Section>

          {!isMark && <>
          {/* Mold */}
          <GroupHeader label="Mold" color={GROUP_COLORS.surface} />
          <Section title="Mold Size" changed={changed(K.moldSize)} titleColor={GROUP_COLORS.surface}>
            <div className="flex justify-end mb-1">
              <button onClick={() => resetFields(K.moldSize)} className={resetBtn} title="Plaster Margin, Plate Thickness and the Custom box back to their defaults. The chosen size is kept">Reset</button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Size</label>
              <select
                value={params.moldSize}
                onChange={(e) => setParam('moldSize', e.target.value as SprigMoldSize)}
                className={selectCls}
                style={{ color: UI_MUTED }}
                title="Standard sizes share one wall pair each — print it once. ✓ = this sprig fits"
              >
                {SIZE_MENU.map((k) => (
                  <option key={k} value={k}>{SPRIG_SIZES[k].label}{sizeFits(k) ? ' ✓' : ' — too small'}</option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </div>
            {sl('plasterMargin', 'Plaster Margin', 'mm', 'Plaster between the sprig and the walls. Only decides whether the sprig fits — it never changes the walls')}
            {sl('plateThickness', 'Plate Thickness', 'mm', 'The printed plate under its top face. The walls sit on top of the plate, so this never changes them — any thickness fits the size\'s wall pair. Stiffness goes as the cube of this: a thin plate saves plastic but can bow under setting plaster, more on the bigger sizes')}
            {params.moldSize === 'custom' && (
              <div className="ml-2 pl-3 border-l-2 border-[var(--border-color)]">
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mt-1 mb-1">Custom box</p>
                {sl('customCavW', 'Inside Width', 'mm', 'Inside of the walls, left to right')}
                {sl('customCavL', 'Inside Length', 'mm', 'Inside of the walls, bottom to top')}
                {sl('customWallH', 'Wall Height', 'mm', 'Plaster depth — pour to the top of the walls')}
                {sl('customWallThickness', 'Wall Thickness', 'mm')}
                {sl('customFlangeWidth', 'Clip Flange', 'mm', 'Binder-clip flange — also carries the three V seals')}
                <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5">
                  A custom box needs its own walls. Changing any of these makes a new wall.
                </p>
              </div>
            )}
          </Section>
          <Section title="Print" changed={changed(K.print)} titleColor={GROUP_COLORS.surface}>
            <div className="flex justify-end mb-1">
              <button onClick={() => resetFields(K.print)} className={resetBtn} title="Shrink back to its default">Reset</button>
            </div>
            {sl('shrinkPercent', 'Shrink', '%', 'Clay shrinkage — the printed relief is scaled up by this so the FINISHED sprig comes out at the size above. In red because a wrong value is silent', '#f87171')}
          </Section>

          {/* Analysis */}
          <GroupHeader label="Analysis" color={GROUP_COLORS.settings} />
          <Section title="Plaster Estimate" changed={changed(K.plaster)} titleColor={GROUP_COLORS.settings}>
            <div className="flex justify-end mb-1">
              <button onClick={() => resetFields(K.plaster)} className={resetBtn} title="Material back to its default">Reset</button>
            </div>
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
          </>}

        </div>
      </div>

      {pasteOpen && <PasteDialog onClose={() => setPasteOpen(false)} onApply={(text) => applySvg(text, 'pasted SVG')} />}
    </div>
  );
}

/** The sprig's words: up to two lines, committed after a pause in typing so the
 *  relief is not rebuilt on every key, and on blur. */
/** The clay colour and the plate (background) colour — a spot with no clay
 *  shows the background (Sher). Per browser, shared by both tabs. */
function SprigColorRows({ what }: { what: 'sprig' | 'mark' }) {
  const { sprig, background } = useSprigColors();
  const row = (label: string, value: string, tip: string, set: (c: string) => void) => (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title={tip}>{label}</label>
      <input type="color" value={value} onChange={(e) => set(e.target.value)} title={tip}
        className="w-8 h-8 rounded cursor-pointer border border-[var(--border-color)] bg-transparent p-0" />
    </div>
  );
  return (
    <>
      {row(what === 'mark' ? 'Mark Color' : 'Sprig Color', sprig, `Colour of the clay: everything standing above the plate. Thin Parts still show red, so avoid a red here`, (c) => setSprigColors({ sprig: c }))}
      {row('Background', background, `Colour of the plate behind the ${what}. A spot inside the ${what} in this colour has no clay`, (c) => setSprigColors({ background: c }))}
    </>
  );
}

function TextBox({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  useEffect(() => { if (value !== committed.current) { committed.current = value; setDraft(value); } }, [value]);
  useEffect(() => {
    if (draft === committed.current) return;
    const t = setTimeout(() => { committed.current = draft; onCommit(draft); }, 500);
    return () => clearTimeout(t);
  }, [draft, onCommit]);
  return (
    <textarea
      value={draft}
      rows={2}
      placeholder="Type text here (up to two lines)"
      onChange={(e) => setDraft(e.target.value.split('\n').slice(0, 2).join('\n'))}
      onBlur={() => { if (draft !== committed.current) { committed.current = draft; onCommit(draft); } }}
      className="w-full mb-2 px-2 py-1 text-sm rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] resize-none"
      title="The words on the sprig. Up to two lines; each line is centred"
    />
  );
}

/** Name of a font installed on this computer, with a found / not found note. */
function SystemFontBox({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const found = value.trim() ? systemFontFound(value) : null;
  return (
    <div className="mb-2">
      <input
        value={draft}
        placeholder="Font name, e.g. Futura"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(draft); }}
        className="w-full px-2 py-1 text-sm rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)]"
        title="Type the font's name as your computer lists it (Font Book on a Mac)"
      />
      <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 mt-0.5">
        {found === false
          ? 'Not found on this computer — a fallback font is being used.'
          : 'Only looks right on a computer that has this font. A saved design opened elsewhere falls back to another font.'}
      </p>
    </div>
  );
}

/** The prepared drawing: background cut away (shown as a red tint), the shape
 *  in its height levels, darkest = highest. What the relief is built from. An
 *  SVG read as drawn has no mask: there, anything no darker than `threshold`
 *  (the relief's own cut-off) is background. */
function PicturePreview({ source, threshold = 0.5 }: { source: SprigSource; threshold?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const { width: w, height: h, pixels } = source;
    const mask = source.mask ?? pixels.map((v) => (1 - v / 255 > threshold ? 0 : 255));
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const bg = mask[i] >= 128;
      const v = pixels[i];
      img.data[i * 4] = bg ? 90 : v;
      img.data[i * 4 + 1] = bg ? 40 : v;
      img.data[i * 4 + 2] = bg ? 40 : v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [source, threshold]);
  return (
    <div className="mb-2">
      <canvas ref={ref} className="w-full max-h-40 object-contain rounded border border-[var(--border-color)]" style={{ imageRendering: 'auto' }} />
      <p className="text-[10px] leading-snug text-[var(--text-secondary)] px-0.5 mt-0.5">
        Dark red = cut away as background. Darker gray stands higher.
      </p>
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
