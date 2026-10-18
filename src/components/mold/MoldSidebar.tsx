'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Section, SliderRow, Toggle, GroupHeader } from '@/components/parameters/ui';
import { useMoldStore, useMoldHistory, moldHistory, DEFAULT_SETTINGS_NAME, DEFAULT_PART_COLOR, retiredStyleNotice } from '@/store/mold-store';
import { useVaseStore } from '@/store/vase-store';
import { useHandleStore, useHandleHistory, handleHistory, DEFAULT_HANDLE_SETTINGS_NAME } from '@/store/handle-store';
import { mergeHandleParameters, DEFAULT_HANDLE_PARAMETERS } from '@/engine/handle/handle-types';
import type { HandleParameters } from '@/engine/handle/handle-types';
import { SplitTopView } from './SplitTopView';
import { applyPreset } from '@/presets';
import type { VaseParameters } from '@/engine/types';
import { MOLD_PARAMS, PLASTER_MATERIALS } from '@/config/mold-params';
import { GROUP_COLORS, UI_MUTED } from '@/config/colors';
import { generateSTL } from '@/engine/stl-export';
import { saveSTLFile, saveDesignFile, saveTextFile, openDesignFile } from '@/lib/image-capture';
import { dcCountExport } from '@/lib/analytics';
import { estimatePlaster } from '@/engine/mold/mold-stats';
import { buildPrintReport, type ReportPart } from '@/lib/print-report';
import { mergeMoldParameters, retireMoldStyle, ACTIVE_MOLD_STYLES, moldUsesHandle, HALVES_HANDLE_OFFERED } from '@/engine/mold/mold-types';
import { translateMesh } from '@/engine/handle/mesh3';
import type { AnyMoldMeshes } from '@/hooks/use-mold-meshes';
import type { MoldParameters, MoldStyle, PlasterType } from '@/engine/mold/mold-types';
import type { VaseMesh } from '@/engine/types';
import type { MeshStats } from '@/engine/mesh-stats';

type MoldNumKey = Exclude<{
  [K in keyof MoldParameters]: MoldParameters[K] extends number ? K : never;
}[keyof MoldParameters], 'halvesNatchCount'>;   // a 3 / 4 switch, not a slider

/** Every style's tab. Only ACTIVE_MOLD_STYLES are shown (see mold-types);
 *  the rest stay defined so their labels still read right in reports. */
const ALL_MOLD_STYLE_TABS: { value: MoldStyle; label: string; tooltip: string }[] = [
  { value: 'twoPart', label: 'Press 2-Pc', tooltip: 'Master + cottle printed separately — press the master into plaster poured in the cottle' },
  { value: 'onePiece', label: 'Pour 1-Pc', tooltip: 'Single print with the vase inverted inside — pour plaster in through the open top' },
  { value: 'pourTwoPiece', label: 'Pour 2-Pc', tooltip: 'Pour mold split in two: center piece + removable outer shell that binder-clips to its foot flange — much easier release' },
  { value: 'pourThreePiece', label: 'Pour 3-Pc', tooltip: 'Pour 2-Pc with the shell split vertically into two clip-together halves — part them sideways instead of lifting the shell off the whole block' },
  { value: 'splitTwoPiece', label: 'Split 2-Pc', tooltip: 'Two plaster halves split through the vase, each poured in its own throwaway printed tray. The halves pull apart sideways, so the vase may narrow going up — necks, bellies, rolled rims, cast-on handles. The tray proved very hard to get off the plaster — try Split Halves' },
  { value: 'splitThirds', label: 'Split Thirds', tooltip: 'Three plaster pieces split by seams 120° apart, each poured on its master + V plate (one print) with clip-on walls. At a seam the wall already leans 30° the safe way (halves: 0°), so softer flutes, waves and 3- or 6-sided shapes release. No handle; an optional plaster plug makes the bottom. First set poured Oct 2026; this version not yet poured' },
  { value: 'splitHalves', label: 'Split Halves', tooltip: 'Two plaster halves split through the vase, poured in REUSABLE parts like the handle mold: a plate, two clip-on walls and a separate hollow master you pull out of the plaster. The halves pull apart sideways, so the vase may narrow going up, and an optional third piece makes a foot. No cast-on handle. Being tested now' },
];
const MOLD_STYLE_TABS = ACTIVE_MOLD_STYLES.map((v) => ALL_MOLD_STYLE_TABS.find((t) => t.value === v)!);

export function MoldSidebar({ mold, helpOpen, onToggleHelp }: { mold: AnyMoldMeshes; helpOpen: boolean; onToggleHelp: () => void }) {
  const designName = useVaseStore((s) => s.designName);
  const vaseParams = useVaseStore((s) => s.params);
  const vaseDirty = useVaseStore((s) => s.isDirty);
  const loadVaseDesign = useVaseStore((s) => s.loadDesign);
  const markSaved = useMoldStore((s) => s.markSaved);
  const savedParams = useMoldStore((s) => s.savedParams);
  const revertToSaved = useMoldStore((s) => s.revertToSaved);
  const doUndo = useMoldStore((s) => s.undo);
  const doRedo = useMoldStore((s) => s.redo);
  const { canUndo, canRedo } = useMoldHistory();

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
  /** Pending "this mold was saved with a different vase / handle" decision.
   *  Only the designs that DIFFER from what is open are carried — a matching
   *  one needs no decision and is left alone. */
  const [vaseChoice, setVaseChoice] = useState<{
    settings: unknown; fileName: string;
    vase: unknown | null; vaseName: string | null;
    handle: HandleParameters | null; handleName: string | null;
    /** The file carries a handle at all (to show "same as open" for it). */
    fileHasHandle: boolean;
  } | null>(null);
  const handleParams = useHandleStore((s) => s.params);
  const handleSaved = useHandleStore((s) => s.savedParams);
  const vaseRes = useVaseStore((s) => s.params.resolution);
  const params = useMoldStore((s) => s.params);
  const view = useMoldStore((s) => s.view);
  const settingsName = useMoldStore((s) => s.settingsName);
  const setParam = useMoldStore((s) => s.setParam);
  const setStyle = useMoldStore((s) => s.setStyle);
  const setView = useMoldStore((s) => s.setView);
  const styleNotice = useMoldStore((s) => s.styleNotice);
  const setStyleNotice = useMoldStore((s) => s.setStyleNotice);
  const partColor = useMoldStore((s) => s.partColor);
  const setPartColor = useMoldStore((s) => s.setPartColor);
  const setSettingsName = useMoldStore((s) => s.setSettingsName);
  const handleName = useHandleStore((s) => s.settingsName);
  /** The handle has changes not in any file. The handle store keeps no dirty
   *  flag, so compare with the last Save/Load (or the defaults, if never saved). */
  const handleDirty = JSON.stringify(handleParams) !== JSON.stringify(handleSaved ?? mergeHandleParameters(DEFAULT_HANDLE_PARAMETERS));
  /** The mold actually uses the HandleMaker design (so the file must carry it). */
  const usesHandle = moldUsesHandle(params);
  const reset = useMoldStore((s) => s.reset);
  const [warnExport, setWarnExport] = useState(false);
  /** Split 2-Pc / Split Halves have two gated exports; which one the warning dialog continues. */
  const splitTarget = useRef<'A' | 'B'>('A');
  const [editingName, setEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Name used for the settings + bench-sheet files. Until the user names the
   * profile themselves it follows the VASE design name, so Save Settings lands
   * beside the STL exports instead of a generic "mold settings" (Gary, 2026-07-30).
   * With " mold" on the end (2026-10-10): the vase's own file is «vase».json, and
   * once Save Settings can save the vase too, the two would overwrite each other.
   */
  const moldFileName = (vaseName: string | null) =>
    (settingsName === DEFAULT_SETTINGS_NAME && vaseName ? `${vaseName} mold` : settingsName) || DEFAULT_SETTINGS_NAME;
  const fileName = moldFileName(designName);
  /** Save Settings' "also save the vase / handle?" box — which boxes are ticked. */
  const [saveAll, setSaveAll] = useState<{ vase: boolean; handle: boolean } | null>(null);

  /** `count`: only the main part counts as an export (DCity/ANALYTICS.md §2 — one
   *  event per mold, not per file), so shells, cottle and tray B pass false. */
  const exportMesh = async (mesh: VaseMesh, name: string, count = false) => {
    const buffer = generateSTL(mesh);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    if ((await saveSTLFile(blob, name)) && count) dcCountExport();
  };

  // Both pour-and-clip styles share every label, slider and stat below.
  const isPourClip = mold.style === 'pourTwoPiece' || mold.style === 'pourThreePiece';
  const isSplit = mold.style === 'splitTwoPiece';
  const isHalves = mold.style === 'splitHalves';
  /** Either split style — they share the split plane, natches and handle. */
  const isSplitAny = isSplit || isHalves;
  /** Split Thirds: three pieces on V plates — shares the plate & wall numbers with Split Halves, not the handle. */
  const isThirds = mold.style === 'splitThirds';
  /** Which Split Thirds kit the undercut warning's "Export anyway" continues. */
  const thirdsTarget = useRef(0);
  /** Split Thirds: print-ready parts (master upright, plate on its end). */
  const thirdsExport = (which: 'master' | 'plate' | 'wellWall' | 'baseWall' | 'footPlate' | 'footWall', k = 0) => {
    if (mold.style !== 'splitThirds') return;
    if (which === 'footPlate' || which === 'footWall') {
      if (!mold.foot) return;
      const f = mold.foot;
      if (which === 'footPlate') exportMesh(f.plate, stlName('plug disk'));
      else exportMesh(f.walls[k], stlName(f.wallsSame ? 'plug wall' : `plug wall ${'ABCD'[k]}`));
      return;
    }
    if (which === 'baseWall' && mold.sharedBaseWall) { exportMesh(mold.baseWallPrint, stlName('base wall')); return; }
    const kit = mold.kits[k];
    if (!kit) return;
    const suffix = mold.oneKit ? '' : ` ${k + 1}`;
    const mesh = which === 'master' || which === 'plate' ? kit.partPrint : which === 'baseWall' ? kit.baseWallPrint : kit.wellWallPrint;
    const label = which === 'wellWall' ? 'well wall' : which === 'baseWall' ? 'base wall' : 'master';
    exportMesh(mesh, stlName(`${label}${suffix}`), which === 'master' && k === 0);
  };
  /** Split Halves: print-ready parts, lifted so each sits on the bed. */
  const halvesExport = (which: 'masterL' | 'masterR' | 'plateL' | 'plateR' | 'wall1' | 'wall2' | 'footPlate' | 'footWall') => {
    if (mold.style !== 'splitHalves') return;
    if (which === 'footPlate' || which === 'footWall') {
      if (!mold.foot) return;
      const plate = which === 'footPlate';
      exportMesh(translateMesh(plate ? mold.foot.plate : mold.foot.wall, 0, 0, plate ? mold.foot.plateLift : 0), stlName(plate ? 'foot plate' : 'foot wall'));
      return;
    }
    const one = mold.oneKit;
    const name: Record<typeof which, string> = {
      masterL: one ? 'master' : 'master L', masterR: 'master R',
      plateL: one ? 'plate' : 'plate L', plateR: 'plate R',
      wall1: 'wall 1', wall2: 'wall 2',
    };
    const lift = which.startsWith('master') ? mold.layout.masterLift : which.startsWith('plate') ? mold.layout.plateLift : 0;
    exportMesh(translateMesh(mold[which], 0, 0, lift), stlName(name[which]), which === 'masterL');
  };
  /** Binary STL is an 84-byte header plus 50 bytes per triangle. */
  const stlSize = (tris: number) => {
    const mb = (84 + tris * 50) / (1024 * 1024);
    return `${tris >= 1000 ? `${(tris / 1000).toFixed(0)}k` : tris} tris · ${mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`}`;
  };
  const stlName = (part: string) => (designName ? `${designName} ${part}.stl` : `${part}.stl`);

  // Main export: the part carrying the vase form — gated by the undercut warning.
  const doExportMain = () => {
    if (mold.style === 'splitTwoPiece') {
      if (splitTarget.current === 'A') exportMesh(mold.trayA, stlName('split A'), true);
      else exportMesh(mold.trayB, stlName('split B'));
    }
    else if (mold.style === 'splitHalves') halvesExport(splitTarget.current === 'A' ? 'masterL' : 'masterR');
    else if (mold.style === 'splitThirds') thirdsExport('master', thirdsTarget.current);
    else if (mold.style === 'onePiece') exportMesh(mold.mold, stlName('mold'), true);
    else if (mold.style === 'pourTwoPiece' || mold.style === 'pourThreePiece') exportMesh(mold.center, stlName('center'), true);
    else exportMesh(mold.master, stlName('master'), true);
  };
  const handleExportMain = (target: 'A' | 'B' = 'A', kit = 0) => {
    splitTarget.current = target;
    thirdsTarget.current = kit;
    if (mold.hasUndercuts) {
      setWarnExport(true);
      return;
    }
    doExportMain();
  };

  // ── Settings files (mold params only — the vase design has its own files) ──

  /** Printed parts for the bench sheet — same rows as the Printer Fit section. */
  const reportParts = (): ReportPart[] => {
    const part = (label: string, maxDiameter: number, stats: MeshStats, note?: string): ReportPart => ({
      label,
      note,
      rows: [
        { label: 'max diameter', value: `${maxDiameter.toFixed(0)} mm` },
        { label: 'height', value: `${stats.sizeZ.toFixed(0)} mm` },
        { label: 'footprint', value: `${stats.sizeX.toFixed(0)} x ${stats.sizeY.toFixed(0)} mm` },
        { label: 'triangles', value: stats.triangleCount.toLocaleString('en-US') },
      ],
    });
    if (mold.style === 'twoPart') return [
      part('Master', mold.masterMaxDiameter, mold.masterStats),
      part('Cottle', mold.cottleMaxDiameter, mold.cottleStats),
    ];
    if (mold.style === 'onePiece') return [part('Mold', mold.moldMaxDiameter, mold.moldStats)];
    if (mold.style === 'splitTwoPiece') return [{
      label: 'Tray A + Tray B',
      note: 'each — throwaway, peeled off with a heat gun',
      rows: [
        { label: 'footprint', value: `${mold.trayStats.sizeX.toFixed(0)} x ${mold.trayStats.sizeY.toFixed(0)} mm` },
        { label: 'height', value: `${mold.trayStats.sizeZ.toFixed(0)} mm` },
        { label: 'plastic', value: `${(mold.trayStats.volumeMm3 / 1000).toFixed(0)} cm3` },
        { label: 'triangles', value: mold.trayStats.triangleCount.toLocaleString('en-US') },
      ],
    }];
    if (mold.style === 'splitHalves') {
      const box = (label: string, s: MeshStats, note?: string): ReportPart => ({
        label, note,
        rows: [
          { label: 'footprint', value: `${s.sizeX.toFixed(0)} x ${s.sizeY.toFixed(0)} mm` },
          { label: 'height', value: `${s.sizeZ.toFixed(0)} mm` },
          { label: 'plastic', value: `${(s.volumeMm3 / 1000).toFixed(0)} cm3` },
          { label: 'triangles', value: s.triangleCount.toLocaleString('en-US') },
        ],
      });
      const k = mold.oneKit;
      return [
        box(k ? 'Master' : 'Master L + Master R', mold.masterStats, k ? 'one master, poured twice' : 'mirror images, each'),
        box(k ? 'Plate' : 'Plate L + Plate R', mold.plateStats, k ? 'one plate, poured twice' : 'each'),
        box('Wall 1 + Wall 2', mold.wallStats, 'each; both walls go round every pour, swapping ends'),
        ...(mold.foot ? [
          box('Foot plate', mold.foot.plateStats, 'the foot piece, poured once'),
          box('Foot wall', mold.foot.wallStats, 'print 2'),
        ] : []),
      ];
    }
    if (mold.style === 'splitThirds') {
      const box = (label: string, s: MeshStats, note?: string): ReportPart => ({
        label, note,
        rows: [
          { label: 'footprint', value: `${s.sizeX.toFixed(0)} x ${s.sizeY.toFixed(0)} mm` },
          { label: 'height', value: `${s.sizeZ.toFixed(0)} mm` },
          { label: 'plastic', value: `${(s.volumeMm3 / 1000).toFixed(0)} cm3` },
          { label: 'triangles', value: s.triangleCount.toLocaleString('en-US') },
        ],
      });
      const k = mold.oneKit, N = mold.pieceCount;
      return [
        box(k ? 'Master + plate' : `Master + plate 1-${N}`, mold.masterStats, `${k ? `one print, poured ${N} times` : 'one print per piece, each'}; lying down, V underside on the bed; support inside the two water cavities`),
        box(k ? 'Well wall' : `Well walls 1-${N}`, mold.wallStats, 'the well end + half of each side'),
        box(mold.sharedBaseWall ? 'Base wall' : `Base walls 1-${N}`, mold.baseWallStats, mold.sharedBaseWall ? 'the base end + the other halves; goes round every pour' : 'one per piece (its boss fits that piece\'s foot disc)'),
        ...(mold.foot ? [
          box('Plug disk', mold.foot.plateStats, 'the plug cup\'s bottom: the vase\'s foot, recess up'),
          box(mold.foot.wallsSame ? `Plug wall ×${mold.foot.walls.length}` : `Plug walls (${mold.foot.walls.length})`, mold.foot.wallStats, `${mold.foot.wallsSame ? `print ${mold.foot.walls.length}` : 'each'}; clip together round the disk, printed standing on their ledge`),
        ] : []),
      ];
    }
    if (mold.style === 'pourThreePiece') return [
      part('Center', mold.centerMaxDiameter, mold.centerStats),
      part(
        mold.halvesIdentical ? 'Shell' : 'Shell A + Shell B',
        mold.shellMaxDiameter, mold.shellStats,
        mold.halvesIdentical ? 'print 2' : 'each',
      ),
    ];
    return [
      part('Center', mold.centerMaxDiameter, mold.centerStats),
      part('Shell', mold.shellMaxDiameter, mold.shellStats),
    ];
  };

  /** Save Settings. When the vase (or the handle this mold uses) has unsaved
   *  changes, first offer to save those too, so one click leaves everything on
   *  disk. Each design is saved under its OWN name — the mold's name would make
   *  all three «name».json and they would overwrite each other. */
  const handleSaveSettings = () => {
    const vaseUnsaved = vaseDirty;
    const handleUnsaved = usesHandle && handleDirty;
    if (vaseUnsaved || handleUnsaved) setSaveAll({ vase: vaseUnsaved, handle: handleUnsaved });
    else void saveMoldFiles();
  };

  /** Run the ticked saves, then the mold. The vase and handle go FIRST so the
   *  mold file records the names they were actually saved under (Chrome can
   *  rename in its dialog). Cancelling any dialog stops the rest. */
  const runSaveAll = async (choice: { vase: boolean; handle: boolean }) => {
    setSaveAll(null);
    if (choice.vase && !(await saveCurrentVase())) return;
    if (choice.handle && !(await saveCurrentHandle())) return;
    await saveMoldFiles();
  };

  const saveMoldFiles = async () => {
    // Read the names fresh: a save just before this may have renamed them.
    const designName = useVaseStore.getState().designName;
    const handleName = useHandleStore.getState().settingsName;
    const fileName = moldFileName(designName);
    // The vase is EMBEDDED, not referenced (2026-08-09). A mold is derived from
    // a vase — the master IS the vase, scaled — so mold settings alone can never
    // reproduce a mold. Before this, reopening a mold file a day later silently
    // wrapped your numbers around whatever vase happened to be loaded, which
    // after a reload was the default Classic Vase. Old files have no `vase` key
    // and still load settings-only.
    const json = JSON.stringify({
      app: 'VaseMaker',
      type: 'mold-settings',
      settings: params,
      vase: vaseParams,
      vaseName: designName,
      // The handle travels too, but only when this mold uses it (Split 2-Pc
      // with the handle on) — in any other style it has no effect on the mold,
      // and asking about it on load would be noise (Gary, 2026-10-10).
      ...(usesHandle ? { handle: handleParams, handleName } : {}),
    }, null, 2);
    const chosenName = await saveDesignFile(json, fileName);
    if (chosenName === null) return; // cancelled — don't offer the text file either
    markSaved(params, chosenName);
    // Companion bench sheet: plaster batch + printer fit, so the numbers are at
    // hand without opening the app. Second dialog is unavoidable — see saveTextFile.
    await saveTextFile(buildPrintReport({
      title: chosenName,
      identity: [
        { label: 'Vase design', value: designName || '(unnamed)' },
        { label: 'Mold style', value: MOLD_STYLE_TABS.find((t) => t.value === mold.style)?.label ?? mold.style },
        { label: 'Saved', value: new Date().toLocaleString() },
      ],
      material: params.material,
      plasterVolumeMm3: mold.plasterVolumeMm3,
      bothHalves: isSplitAny,
      totalsFor: isThirds ? 'all three pieces' : undefined,
      extraPours: mold.style === 'splitHalves' && mold.foot ? [{ label: 'FOOT PIECE (its own pour)', volumeMm3: mold.foot.plasterVolumeMm3 }]
        : mold.style === 'splitThirds' ? (mold.oneKit
          ? [{ label: `EACH PIECE (one pour of ${mold.pieceCount})`, volumeMm3: mold.kits[0]?.plasterVolumeMm3 ?? 0 }]
          : mold.kits.map((kt) => ({ label: `PIECE ${kt.piece + 1} (its own pour)`, volumeMm3: kt.plasterVolumeMm3 }))).concat(
            mold.foot ? [{ label: 'PLUG (its own pour, in its cup)', volumeMm3: mold.foot.plasterVolumeMm3 }] : [])
        : undefined,
      parts: reportParts(),
      keySettings: [
        { label: 'Shrink', value: `${params.shrinkPercent}%` },
        { label: 'Master wall', value: `${params.masterWallThickness} mm` },
        { label: 'Plaster thickness', value: `${params.plasterThickness} mm` },
        { label: 'Well', value: `${params.wellWidth} mm wide x ${params.wellHeight} mm tall` },
        { label: 'Mesh resolution', value: `${vaseRes.radial} radial x ${vaseRes.vertical} vertical` },
      ],
    }), chosenName);
  };

  /** Apply the mold half of a settings file. */
  const applyMoldOnly = (settings: unknown, baseName: string) => {
    const { params: loaded, retired } = retireMoldStyle(mergeMoldParameters(settings));
    setStyleNotice(retired ? retiredStyleNotice(retired) : null);
    moldHistory.skipNextRecord();
    useMoldHistory.getState().clear();
    // Only the file's own style changes; the other tabs keep their settings.
    useMoldStore.setState((st) => ({ params: loaded, savedByStyle: { ...st.savedByStyle, [loaded.moldStyle]: loaded }, settingsName: baseName }));
  };

  /** Save the CURRENT vase design to a file (same format as the Vase tab's
   *  Save Design — a bare params object) before it is replaced. */
  const saveCurrentVase = async (): Promise<boolean> => {
    const chosen = await saveDesignFile(JSON.stringify(vaseParams, null, 2), designName || 'vase-design');
    if (chosen === null) return false;
    useVaseStore.setState({ designName: chosen, isDirty: false });
    return true;
  };

  /** Save the CURRENT handle as a handle settings file (the HandleMaker
   *  format, without its bench sheet) before it is replaced. */
  const saveCurrentHandle = async (): Promise<boolean> => {
    const json = JSON.stringify({ app: 'VaseMaker', type: 'handle-settings', settings: handleParams }, null, 2);
    const chosen = await saveDesignFile(json, handleName || DEFAULT_HANDLE_SETTINGS_NAME);
    if (chosen === null) return false;
    useHandleStore.getState().markSaved(handleParams, chosen);
    return true;
  };

  /** Take the file's vase and/or handle as well as its mold settings. Each is
   *  loaded the way its own tab loads a file: names come with it, and its
   *  undo history starts fresh. */
  const takeFileVase = (c: NonNullable<typeof vaseChoice>) => {
    if (c.vase) loadVaseDesign(c.vase, c.vaseName);
    if (c.handle) {
      handleHistory.skipNextRecord();
      useHandleHistory.getState().clear();
      useHandleStore.setState({
        params: c.handle, savedParams: c.handle,
        settingsName: c.handleName?.trim() || DEFAULT_HANDLE_SETTINGS_NAME,
      });
    }
    applyMoldOnly(c.settings, c.fileName);
    setVaseChoice(null);
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
      // Only ask when there is genuinely something to decide: no embedded vase
      // (an old file), or one that already matches what is open, both load
      // straight through. Comparison runs both sides through the same merge so
      // a file written by an older version isn't reported as "different" purely
      // for missing a parameter added since.
      // Same rule for the handle (files since 2026-10-10, Split 2-Pc with the
      // handle on): merged before comparing, and only a difference is asked about.
      const fileVase = parsed.vase && typeof parsed.vase === 'object' ? parsed.vase : null;
      const vaseDiffers = !!fileVase &&
        JSON.stringify(applyPreset({ parameters: fileVase as Partial<VaseParameters> })) !== JSON.stringify(vaseParams);
      const fileHandle = parsed.handle && typeof parsed.handle === 'object' ? mergeHandleParameters(parsed.handle) : null;
      const handleDiffers = !!fileHandle && JSON.stringify(fileHandle) !== JSON.stringify(handleParams);
      if (!vaseDiffers && !handleDiffers) {
        applyMoldOnly(parsed.settings, baseName);
        return;
      }
      setVaseChoice({
        settings: parsed.settings,
        fileName: baseName,
        vase: vaseDiffers ? fileVase : null,
        vaseName: typeof parsed.vaseName === 'string' ? parsed.vaseName : null,
        handle: handleDiffers ? fileHandle : null,
        handleName: typeof parsed.handleName === 'string' ? parsed.handleName : null,
        fileHasHandle: !!fileHandle,
      });
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
  const sl = (k: MoldNumKey, label: string, suffix?: string, tooltip?: string, color?: string) => (
    <SliderRow
      label={label}
      color={color}
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
            onClick={doUndo}
            disabled={!canUndo}
            className="text-sm leading-none w-6 h-6 rounded flex items-center justify-center transition-colors text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30 disabled:hover:bg-transparent"
            title="Undo (Cmd/Ctrl+Z) — mold settings only; the vase has its own undo on the Vase tab"
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
        <p className="text-xs text-[var(--text-secondary)]">Plaster slip-casting mold from your vase</p>
        {/* Mold style switcher — only ACTIVE_MOLD_STYLES (Pour 3-Pc, Split Halves) since 2026-10-14. */}
        <div className="grid grid-cols-3 gap-1 mt-2">
          {MOLD_STYLE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStyle(tab.value); setStyleNotice(null); }}
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
        {styleNotice && (
          <p className="mt-1 text-[11px] leading-snug text-amber-300 flex gap-1">
            <span className="flex-1">{styleNotice}</span>
            <button onClick={() => setStyleNotice(null)} title="Dismiss" className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">✕</button>
          </p>
        )}
        {/* Settings profile name — filled by Load/Save Settings, click to rename */}
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-[var(--text-secondary)] shrink-0">Settings File:</span>
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              defaultValue={fileName}
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
              {fileName}
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
            {mold.style === 'twoPart' && (
              <>
                <button
                  onClick={() => handleExportMain()}
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
            )}
            {mold.style === 'onePiece' && (
              <button
                onClick={() => handleExportMain()}
                className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                style={{ color: UI_MUTED }}
                title="Export the one-piece mold as an STL"
              >
                Export Mold STL
              </button>
            )}
            {mold.style === 'pourTwoPiece' && (
              <>
                <button
                  onClick={() => handleExportMain()}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                  style={{ color: UI_MUTED }}
                  title="Export the center piece (vase + well + notched foot flange)"
                >
                  Export Center STL
                </button>
                <button
                  onClick={() => exportMesh(translateMesh(mold.shell, 0, 0, -mold.shellExportDrop), stlName('shell'))}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                  style={{ color: UI_MUTED }}
                  title="Export the outer shell (flange lands on the print bed)"
                >
                  Export Shell STL
                </button>
              </>
            )}
            {mold.style === 'splitTwoPiece' && (
              <>
                <button
                  onClick={() => handleExportMain('A')}
                  disabled={!!mold.error}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40"
                  style={{ color: UI_MUTED }}
                  title="Export tray A — prints floor-down; allow tree supports inside the hollow relief"
                >
                  Export Tray A STL
                </button>
                <button
                  onClick={() => handleExportMain('B')}
                  disabled={!!mold.error}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40"
                  style={{ color: UI_MUTED }}
                  title="Export tray B — the other half; its natches are the opposite of tray A's so the plaster halves interlock"
                >
                  Export Tray B STL
                </button>
              </>
            )}
            {mold.style === 'splitHalves' && (
              <div className="grid grid-cols-2 gap-2 flex-1">
                {(mold.oneKit
                  ? [['A', 'Master', 'The hollow half-vase — print once, pour twice. Allow supports inside the hollow if your slicer wants them'],
                     ['plateL', 'Plate', 'The parting plate — print once, pour twice'],
                    ] as const
                  : [['A', 'Master L', 'Left half master (the handle points one way) — the right half is its mirror'],
                     ['B', 'Master R', 'Right half master'],
                     ['plateL', 'Plate L', 'Plate for the left half'],
                     ['plateR', 'Plate R', 'Plate for the right half'],
                    ] as const
                ).map(([k, label, tip]) => (
                  <button key={k} disabled={!!mold.error} title={tip} style={{ color: UI_MUTED }}
                    onClick={() => (k === 'A' || k === 'B' ? handleExportMain(k) : halvesExport(k))}
                    className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                    Export {label} STL
                  </button>
                ))}
                <button disabled={!!mold.error} onClick={() => halvesExport('wall1')} style={{ color: UI_MUTED }}
                  title="Wall 1 — the left half's well end (it carries the collar the well runs into). On the right half's pour it goes on the base end"
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                  Export Wall 1 STL
                </button>
                <button disabled={!!mold.error} onClick={() => halvesExport('wall2')} style={{ color: UI_MUTED }}
                  title="Wall 2 — the right half's well end; the base end on the left half's pour. Wall 1 has ridges at its seams, wall 2 grooves, so they always mate"
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                  Export Wall 2 STL
                </button>
                {mold.foot && (
                  <>
                    <button disabled={!!mold.error} onClick={() => halvesExport('footPlate')} style={{ color: UI_MUTED }}
                      title="The foot piece's plate: the step pocket and the foot ring + recess, upside down. Plaster is poured onto it"
                      className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                      Export Foot Plate STL
                    </button>
                    <button disabled={!!mold.error} onClick={() => halvesExport('footWall')} style={{ color: UI_MUTED }}
                      title="The foot piece's wall — print it TWICE; the second copy goes on turned end for end"
                      className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                      Export Foot Wall STL (print 2)
                    </button>
                  </>
                )}
              </div>
            )}
            {mold.style === 'splitThirds' && (
              <div className="grid grid-cols-2 gap-2 flex-1">
                {mold.kits.flatMap((kt, k) => {
                  const n = mold.oneKit ? '' : ` ${k + 1}`;
                  return [
                    <button key={`m${k}`} disabled={!!mold.error} style={{ color: UI_MUTED }}
                      title={`${mold.oneKit ? `The master and V plate as ONE print — print once, pour all ${mold.pieceCount} pieces` : `Master + V plate for piece ${k + 1}, one print`}. Exported lying down, the V's underside on the bed. Two water cavities under the master (support goes in them), and a hinge gap between them that runs through the ends, so the two halves swing apart to break the plaster loose`}
                      onClick={() => handleExportMain('A', k)}
                      className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                      Export Master + Plate{n} STL
                    </button>,
                    <button key={`w${k}`} disabled={!!mold.error} style={{ color: UI_MUTED }}
                      title={`Well wall${mold.oneKit ? '' : ` for piece ${k + 1}`}: the well end (its boss holds the well) + half of each side. Ridges at its two seams`}
                      onClick={() => thirdsExport('wellWall', k)}
                      className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                      Export Well Wall{n} STL
                    </button>,
                  ];
                })}
                {(mold.sharedBaseWall ? [0] : mold.kits.map((_, k) => k)).map((k) => (
                  <button key={`b${k}`} disabled={!!mold.error} style={{ color: UI_MUTED }}
                    title={mold.sharedBaseWall
                      ? 'Base wall: the base end + the other half of each side, for every pour. Grooves at its two seams'
                      : `Base wall for piece ${k + 1}: the base end + the other half of each side. Its boss fits that piece's foot disc, so each piece has its own. Grooves at its two seams`}
                    onClick={() => thirdsExport('baseWall', k)}
                    className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                    Export Base Wall{mold.sharedBaseWall ? '' : ` ${k + 1}`} STL
                  </button>
                ))}
                {mold.foot && (
                  <>
                    <button disabled={!!mold.error} onClick={() => thirdsExport('footPlate')} style={{ color: UI_MUTED }}
                      title="The plug cup's bottom disk: the vase bottom's foot ring and recessed middle, recess up. It drops into the two walls and rests on their ledge; the plug is poured onto it, vase face down"
                      className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                      Export Plug Disk STL
                    </button>
                    {(mold.foot.wallsSame ? [0] : mold.foot.walls.map((_, k) => k)).map((k) => (
                      <button key={k} disabled={!!mold.error} onClick={() => thirdsExport('footWall', k)} style={{ color: UI_MUTED }}
                        title={mold.foot!.wallsSame
                          ? `Plug cup wall — PRINT ${mold.foot!.walls.length}: one of the ${mold.foot!.walls.length} walls that clip round the disk, with the groove that gives the plug its ridge and a ledge for the disk. V ridges on one clip flange, grooves on the other. Prints standing on its ledge`
                          : `Plug cup wall ${'ABCD'[k]} of ${mold.foot!.walls.length}: the walls differ because the bottom outline does not repeat from wall to wall. V ridges on one clip flange, grooves on the other. Prints standing on its ledge`}
                        className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                        {mold.foot!.wallsSame ? `Export Plug Wall STL (×${mold.foot!.walls.length})` : `Export Plug Wall ${'ABCD'[k]} STL`}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
            {mold.style === 'pourThreePiece' && (
              <>
                <button
                  onClick={() => handleExportMain()}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                  style={{ color: UI_MUTED }}
                  title="Export the center piece (vase + well + V-ridged foot flange)"
                >
                  Export Center STL
                </button>
                <button
                  onClick={() => exportMesh(translateMesh(mold.shellA, 0, 0, -mold.shellExportDrop), stlName(mold.halvesIdentical ? 'shell' : 'shell A'))}
                  className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                  style={{ color: UI_MUTED }}
                  title={mold.halvesIdentical ? 'Export one shell half — print it twice' : 'Export shell half A'}
                >
                  {mold.halvesIdentical ? 'Export Shell STL (print 2)' : 'Export Shell A STL'}
                </button>
                {!mold.halvesIdentical && (
                  <button
                    onClick={() => exportMesh(translateMesh(mold.shellB, 0, 0, -mold.shellExportDrop), stlName('shell B'))}
                    className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors"
                    style={{ color: UI_MUTED }}
                    title="Export shell half B (mirror-position half — this cross-section is not half-turn symmetric)"
                  >
                    Export Shell B STL
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="px-3 py-3">
          {/* View toggles */}
          <GroupHeader label="View" color={GROUP_COLORS.settings} />
          {(isSplitAny || isThirds) && mold.error && (
            <p className="text-[11px] text-red-400 mb-2 leading-snug">{mold.error}</p>
          )}
          <Toggle
            label={mold.style === 'onePiece' ? 'Mold' : isPourClip ? 'Center' : isSplit ? 'Trays' : isHalves || isThirds ? 'Masters' : 'Master'}
            checked={view.showMaster}
            onChange={(v) => setView({ showMaster: v })}
          />
          {mold.style === 'twoPart' && (
            <Toggle label="Cottle" checked={view.showCottle} onChange={(v) => setView({ showCottle: v })} />
          )}
          {mold.style === 'pourTwoPiece' && (
            <Toggle label="Shell" checked={view.showCottle} onChange={(v) => setView({ showCottle: v })} tooltip="The removable outer shell, shown clipped in place" />
          )}
          {/* Two toggles, not one: hiding a half is how you get a clear look
              down the flange edges and the seam Vs. */}
          {mold.style === 'pourThreePiece' && (
            <>
              <Toggle label="Shell A" checked={view.showCottle} onChange={(v) => setView({ showCottle: v })} tooltip="First shell half — turn one off to inspect the flange edges and seam Vs" />
              <Toggle label="Shell B" checked={view.showCottleB} onChange={(v) => setView({ showCottleB: v })} tooltip="Second shell half" />
            </>
          )}
          {isThirds && (
            <>
              <Toggle label="Plates" checked={view.showCottle} onChange={(v) => setView({ showCottle: v })} />
              <Toggle label="Walls" checked={view.showCottleB} onChange={(v) => setView({ showCottleB: v })} tooltip="The well wall and the base wall round each pour" />
            </>
          )}
          {isHalves && (
            <>
              <Toggle label="Plates" checked={view.showCottle} onChange={(v) => setView({ showCottle: v })} />
              <Toggle label="Walls" checked={view.showCottleB} onChange={(v) => setView({ showCottleB: v })} tooltip="Wall 1 and wall 2 round each half. Note they swap ends between the two pours" />
            </>
          )}
          <Toggle label="Plaster" checked={view.showPlaster} onChange={(v) => setView({ showPlaster: v })} />
          {!isSplitAny && !isThirds && <Toggle label="Cross-section" checked={view.crossSection} onChange={(v) => setView({ crossSection: v })} tooltip="Slice the assembly to reveal the plaster, well, and cavity" />}
          {/* Same control as the vase's Appearance → Color. Colours the main
              part only; the shell keeps its blue so the two stay distinct. */}
          <div className="flex items-center gap-3 mb-2">
            <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title="Preview colour of the main part (master, center, mold or trays). The shell stays blue. Undercuts still show red, so avoid a red here">Color</label>
            <input
              type="color"
              value={partColor}
              onChange={(e) => setPartColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-[var(--border-color)] bg-transparent p-0"
            />
            {partColor !== DEFAULT_PART_COLOR && (
              <button onClick={() => setPartColor(DEFAULT_PART_COLOR)} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Back to the default colour">Reset</button>
            )}
          </div>
          <Toggle label="Flat Shading" checked={view.flatShading} onChange={(v) => setView({ flatShading: v })} tooltip="Per-face normals. Smooth shading averages across a V ridge's three faces and renders the sharp apex as a rounded tube — flat shading gives it a crease and puts a hard shadow line in each groove" />
          {(mold.style === 'pourTwoPiece' || mold.style === 'pourThreePiece' || isHalves || isThirds) && (
            <Toggle label={isHalves || isThirds ? 'Ghost Walls' : 'Ghost Shell'} checked={view.ghostShell} onChange={(v) => setView({ ghostShell: v })} tooltip="Draw the shell translucent to see how the whole assembly fits together. Opaque is clearer for inspecting the flange features — stacked transparent surfaces sort badly at the seam" />
          )}
          <Toggle label="Undercuts" checked={view.showUndercuts} onChange={(v) => setView({ showUndercuts: v })} tooltip={isThirds
            ? "Highlight areas (red) where a piece can't pull straight out along its own centre line — a surface facing back toward a seam by more than the piece allows (30° at a seam, more toward the middle). Turn the Seam Angle to put the seams on ridges"
            : isSplitAny
            ? "Highlight areas (red) that face back toward the split line — the plaster half locks onto them and can't pull straight off sideways. Flutes, twist and concave shapes crossing the split do this; necks and bellies don't"
            : "Highlight areas (red) where the master narrows as it rises — the plaster above locks them in, so the master can't pull straight up"} />

          {/* Master */}
          <GroupHeader label="Master" color={GROUP_COLORS.structure} />
          <Section title="Master" titleColor={GROUP_COLORS.structure}>
            {sl('shrinkPercent', 'Shrink', '%', 'Clay slip shrinkage — master is scaled up by this to compensate. In red because a wrong value is silent: every pot comes out the wrong size', '#f87171')}
            {!isSplit && sl('masterWallThickness', 'Wall', 'mm', isThirds ? 'Printed shell of the hollow master (one piece\'s slice of the vase). It is open on its cut faces so cold water can go in to shrink it free' : isHalves ? 'Printed shell of the hollow half-vase master. It is open on its cut face so cold water can go in to shrink it free' : 'Printed shell thickness of the hollow master')}
            <Toggle label="Keep Texture" checked={params.keepTexture} onChange={(v) => setParam('keepTexture', v)} tooltip="Carry the vase's surface texture onto the master" />
          </Section>
          {isHalves && <Section title="Foot Piece" titleColor={GROUP_COLORS.structure}>
            <Toggle label="Enabled" checked={params.halvesFootPiece} onChange={(v) => setParam('halvesFootPiece', v)} tooltip="Cast a third plaster piece for the bottom, so the mug gets a foot ring and a recessed centre. The halves get a shallow counterbore in their bottom end; the foot piece's step plugs into it and pulls off straight down" />
            {params.halvesFootPiece && (
              <>
                {sl('halvesFootMargin', 'Margin', 'mm', 'How much wider than the vase bottom the step is, all round. This band is the ledge the halves sit on, which seals the slip in')}
                {sl('footWidth', 'Foot Width', 'mm', 'The flat ring at the outer edge of the bottom — what the mug stands on')}
                {sl('footSlopeWidth', 'Slope Width', 'mm', 'Width of the sloped ramp from the foot up to the recessed centre')}
                {sl('footHeight', 'Depth', 'mm', 'How far the centre is recessed. 0 gives a flat bottom on its own piece')}
                <Toggle label="Smooth Inside" checked={params.footSmoothInner} onChange={(v) => setParam('footSmoothInner', v)} tooltip="Build the ramp and recessed centre from the smooth contour so surface texture doesn't carry into the recess" />
              </>
            )}
          </Section>}
          {isThirds && <Section title="Foot Piece" titleColor={GROUP_COLORS.structure}>
            <Toggle label="Enabled" checked={params.thirdsFootPiece} onChange={(v) => setParam('thirdsFootPiece', v)} tooltip="Cast the bottom as a fourth plaster piece: a PLUG the shape of the vase bottom that sits inside the three pieces, held in by a rounded ring. It gives the mug a foot ring and a recessed centre, with no thin plaster wedge where a curled-in bottom meets a ledge. The plug is poured in its own small cup (a bottom disk and two clip-together walls)" />
            {params.thirdsFootPiece && (
              <>
                {sl('thirdsPlugHeight', 'Plug Height', 'mm', 'How tall the plug is, from the vase bottom down to the bottom of the mold. The ring sits in the middle. The plug is the mold wall for the bottom of the vase, so keep it near the Plaster thickness so it soaks up water like the sides')}
                {sl('footWidth', 'Foot Width', 'mm', 'The flat ring at the outer edge of the bottom — what the mug stands on')}
                {sl('footSlopeWidth', 'Slope Width', 'mm', 'Width of the sloped ramp from the foot up to the recessed centre')}
                {sl('footHeight', 'Depth', 'mm', 'How far the centre is recessed. 0 gives a flat bottom on its own piece')}
                <Toggle label="Smooth Inside" checked={params.footSmoothInner} onChange={(v) => setParam('footSmoothInner', v)} tooltip="Build the ramp and recessed centre from the smooth contour so surface texture doesn't carry into the recess" />
                {mold.style === 'splitThirds' && mold.foot && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug"
                    title="The plug is cast in a cup of clip-together walls. A textured bottom edge can grip them where its ribs point along a wall's pull, so the app uses the fewest walls (2 to 4) that all pull straight off, and turns the seams to suit">
                    Plug cup: {mold.foot.walls.length} walls{mold.foot.wallsSame ? `, all the same (print ${mold.foot.walls.length})` : ', each different'}.
                  </p>
                )}
                {mold.style === 'splitThirds' && mold.foot?.plugNote && (
                  <p className="text-[11px] text-amber-400 mt-1 leading-snug">{mold.foot.plugNote}</p>
                )}
              </>
            )}
          </Section>}
          {!isSplitAny && !isThirds && <Section title="Foot Recess" titleColor={GROUP_COLORS.structure}>
            <Toggle label="Enabled" checked={params.footEnabled} onChange={(v) => setParam('footEnabled', v)} tooltip="Recess the master's bottom so cast pieces get a foot ring and a recessed center for glaze" />
            {params.footEnabled && (
              <>
                {sl('footWidth', 'Foot Width', 'mm', 'w1 — flat foot ring at the outer edge of the bottom')}
                {sl('footSlopeWidth', 'Slope Width', 'mm', 'w2 — width of the sloped ramp from the foot up to the recessed center')}
                {sl('footHeight', 'Depth', 'mm', 'h — how far the center is recessed above the foot plane')}
                <Toggle label="Smooth Inside" checked={params.footSmoothInner} onChange={(v) => setParam('footSmoothInner', v)} tooltip="Build the ramp and recessed center from the smooth contour so surface texture doesn't carry into the recess" />
              </>
            )}
          </Section>}

          {/* Well */}
          <GroupHeader label="Well & Flange" color={GROUP_COLORS.surface} />
          <Section title="Well" titleColor={GROUP_COLORS.surface}>
            {sl('wellWidth', 'Width', 'mm', 'Horizontal step out at the rim (the 90° razor-trim ledge)')}
            {sl('wellHeight', 'Height', 'mm', 'Height of the well wall above the vase rim')}
            {sl('wellDraftAngle', 'Draft', '°', 'Outward taper of the well wall for easy release')}
            {(isHalves || isThirds) && sl('halvesWellSeal', 'Well Seal', 'mm', 'How far the well runs into the wall\'s collar. The well ends in a straight section exactly this long (a collar can only seal on a straight section, not a taper), capped at the end so the master holds ice water')}
          </Section>
          {mold.style === 'twoPart' && (
            <Section title="Flange" titleColor={GROUP_COLORS.surface} defaultOpen={false}>
              {sl('flangeWidth', 'Width', 'mm', 'Flange overhang beyond the well — should rest on the cottle rim')}
              {sl('flangeThickness', 'Thickness', 'mm')}
            </Section>
          )}

          {isSplitAny && (
            <>
              <GroupHeader label={isHalves ? 'Plate & Walls' : 'Trays'} color={GROUP_COLORS.smoothing} />
              <Section title={isHalves ? 'Plate & Walls' : 'Trays'} titleColor={GROUP_COLORS.smoothing} tooltip={isHalves
                ? 'Reusable parts, the handle-mold way: the master sits in a pocket in the plate, two walls clip on round it. After the plaster sets: walls off, plate off, then cold water into the master and pull it out'
                : 'One throwaway printed tray per plaster half. Pour plaster into each, let it set, then soften the plastic with a heat gun and peel it off'}>
                {sl('plasterThickness', 'Plaster', 'mm', 'Plaster around the vase: the margin each side of it, below its base, and behind it')}
                {sl('seamAngle', 'Split Angle', '°', 'Where the split plane runs through the vase. On a square or polygon it decides where the seam lines fall — watch the Undercuts view. It also decides which side the handle is on')}
                <SplitTopView
                  vase={vaseParams}
                  keepTexture={params.keepTexture}
                  seamAngle={params.seamAngle}
                  handleOn={usesHandle}
                  zFrac={usesHandle ? Math.max(0, 1 - params.handleTopDrop / Math.max(1, vaseParams.height)) : 0.5}
                />
                <p className="text-[11px] text-[var(--text-secondary)] mb-1 leading-snug">
                  Looking down{usesHandle ? ', sliced where the handle\'s top attaches' : ', sliced half way up'}. Dashed = the split{usesHandle ? '; red = the handle' : ''}.
                </p>
                {isSplit && sl('trayWallThickness', 'Skin', 'mm', 'Printed thickness of the half-vase relief and the tray walls. Thin on purpose: the tray is peeled off and thrown away')}
                {isSplit && sl('trayFloorThickness', 'Floor', 'mm', 'Thickness of the tray floor, which is the parting face. Never thinner than Natch Height + 0.8, so a natch pocket can\'t reach the print bed')}
                {isHalves && (
                  <>
                    {sl('halvesSeatDepth', 'Seat Depth', 'mm', 'How deep the master\'s skirt sits in the plate pocket. This is the seal: a deeper skirt is a longer path for plaster to creep. Also what you grip to lift the master')}
                    {sl('halvesFitClearance', 'Fit Clearance', 'mm', 'Gap between the printed master and its pocket (and the collar bore). Raise it if the master binds going in')}
                    {sl('halvesPlateFloor', 'Plate Floor', 'mm', 'Solid plate under the pocket. The plate is solid — no tape holes — so this is all that keeps it flat under setting plaster')}
                    {sl('halvesWallThickness', 'Wall', 'mm', 'Side wall thickness')}
                    {sl('halvesFlangeWidth', 'Clip Flange', 'mm', 'The flange along the bottom of each wall, which clips to the plate edge. It carries the three V seals, so it can\'t go much below ~11 mm')}
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
                      {mold.style === 'splitHalves' && (mold.oneKit
                        ? 'This vase is the same on both halves: one master and one plate, poured twice (4 STLs).'
                        : 'The halves are mirror images: a master and plate for each, L and R (6 STLs). The two walls serve both, swapping ends between pours.')}
                    </p>
                  </>
                )}
              </Section>
              <Section title="Natches" titleColor={GROUP_COLORS.smoothing} tooltip={isHalves
                ? 'Bumps and dimples on each plaster half so the halves only go together one way. Each is placed automatically in the biggest free plaster near its corner'
                : 'Two bumps and two dimples on each plaster half, on diagonals, so the halves only go together one way'}>
                {isHalves && (
                  <div className="flex items-center gap-2 mb-2" title="How many natches per plaster half. Three still line the halves up; a vase that pours one plate twice always uses four">
                    <span className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Count</span>
                    {[3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setParam('halvesNatchCount', n)}
                        className={`px-3 py-0.5 text-xs rounded border ${Math.round(params.halvesNatchCount) === n ? 'border-[var(--accent)] text-[var(--text-primary)]' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}
                      >{n}</button>
                    ))}
                  </div>
                )}
                {sl('natchDiameter', isHalves ? 'Max Diameter' : 'Diameter', 'mm', isHalves
                  ? 'Largest size for each bump and dimple. Each one is made as big as its corner allows, up to this, with at least 4 mm of plaster all round — a thinner wall chips when the halves are parted'
                  : 'Size of each bump and dimple. Clamped so at least 4 mm of plaster stays between a natch and the block edge — a thinner wall chips when the halves are parted')}
                {sl('natchHeight', 'Height', 'mm', 'How far each plaster bump stands proud (and each dimple sinks)')}
                {mold.style === 'splitHalves' && mold.natches.length > 0 && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
                    {mold.natches.length} natches: {mold.natches.map((n) => (2 * n.r).toFixed(0)).join(' / ')} mm.
                    {mold.natches.some((n) => n.r * 2 < params.natchDiameter - 0.05) && ' Some are smaller to fit their corner.'}
                  </p>
                )}
                {mold.style === 'splitHalves' && mold.natchNote && (
                  <p className="text-[11px] text-amber-400 mt-1 leading-snug">{mold.natchNote}</p>
                )}
                {mold.style === 'splitTwoPiece' && mold.natchRadius * 2 < params.natchDiameter - 0.01 && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
                    Clamped to {(mold.natchRadius * 2).toFixed(1)} mm by the plaster margin — raise Plaster to allow bigger natches.
                  </p>
                )}
              </Section>
              {(mold.style === 'splitTwoPiece' || HALVES_HANDLE_OFFERED) && (
              <Section
                title="Handle"
                titleColor={GROUP_COLORS.smoothing}
                checked={params.splitHandle}
                onToggle={(v) => setParam('splitHandle', v)}
                tooltip="Cast the handle with the vase: the current HandleMaker design, turned so both ends sit on the vase. It goes on the Split Angle side — add 180° to move it to the other side"
              >
                <p className="text-[11px] text-[var(--text-secondary)] mb-1 leading-snug">
                  From HandleMaker: <span className="text-[var(--text-primary)]">{handleName}</span>{' '}
                  <Link href="/handle" className="underline hover:text-[var(--text-primary)]">edit ▸</Link>
                </p>
                {sl('handleTopDrop', 'Top Below Rim', 'mm', 'Where the top of the handle meets the vase, measured down from the rim (finished size). The bottom end lands wherever the handle\'s span reaches the vase below it')}
                {sl('castWallThickness', 'Cast Wall', 'mm', 'Your usual fired wall thickness. A handle much thicker than twice this may not fill solid before you drain the mold')}
                {(mold.style === 'splitTwoPiece' || mold.style === 'splitHalves') && mold.handleError && (
                  <p className="text-[11px] text-red-400 mt-1 leading-snug">{mold.handleError} The {isHalves ? 'mold is' : 'trays are'} built without the handle.</p>
                )}
                {(mold.style === 'splitTwoPiece' || mold.style === 'splitHalves') && mold.handle && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
                    Strap {mold.handle.sectionMm[0].toFixed(1)} × {mold.handle.sectionMm[1].toFixed(1)} mm finished; ends {(mold.handle.placement.span / (1 + params.shrinkPercent / 100)).toFixed(0)} mm apart.
                  </p>
                )}
                {(mold.style === 'splitTwoPiece' || mold.style === 'splitHalves') && mold.handleWarning && (
                  <p className="text-[11px] text-amber-400 mt-1 leading-snug">{mold.handleWarning}</p>
                )}
                {mold.style === 'splitHalves' && mold.gapWarning && (
                  <p className="text-[11px] text-amber-400 mt-1 leading-snug">{mold.gapWarning}</p>
                )}
              </Section>
              )}
            </>
          )}

          {isThirds && (
            <>
              <GroupHeader label="Plate & Walls" color={GROUP_COLORS.smoothing} />
              <Section title="Plate & Walls" titleColor={GROUP_COLORS.smoothing} tooltip="Each piece is poured on its own: the master sits in a pocket in a V-shaped plate, and two walls clip on round it. After the plaster sets: walls off, plate off, then cold water into the master and lift it out">
                {sl('plasterThickness', 'Plaster', 'mm', 'Plaster round the vase: up to the top of each piece, out to its side walls, and below the base')}
                {sl('seamAngle', 'Seam Angle', '°', 'Turns all three seams together round the vase — they always stay 120° apart. Put them on the ridges of a texture (or the corners of a 3- or 6-sided shape) and watch the Undercuts view')}
                <SplitTopView
                  vase={vaseParams}
                  keepTexture={params.keepTexture}
                  seamAngle={params.seamAngle}
                  handleOn={false}
                  zFrac={0.5}
                  seams={3}
                />
                <p className="text-[11px] text-[var(--text-secondary)] mb-1 leading-snug">
                  Looking down, sliced half way up. Dashed = the three seams.
                </p>
                {sl('halvesSeatDepth', 'Seat Depth', 'mm', 'How deep the master\'s skirts drop into the plate pocket (measured straight down). This is the seal: a deeper skirt is a longer path for plaster to creep')}
                {sl('halvesFitClearance', 'Fit Clearance', 'mm', 'Gap between the printed master and its pocket (and the well-end bore). Raise it if the master binds going in')}
                {sl('thirdsPlateFloor', 'Plate Floor', 'mm', 'Solid plate under the pocket, measured square to the faces')}
                {sl('thirdsWallThickness', 'Wall', 'mm', 'Wall thickness. The side walls stand square to the plate\'s faces, so they lean in 30°')}
                {sl('thirdsFlangeWidth', 'Clip Flange', 'mm', 'The flange along the bottom of each wall, which clips to the plate edge. It carries the three V seals, so below ~11 mm the V\'s get narrower')}
                <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
                  {mold.style === 'splitThirds' && (mold.oneKit
                    ? `Every piece is the same: one master, one plate and one well wall, poured ${mold.pieceCount} times (4 STLs).`
                    : mold.sharedBaseWall
                      ? `The pieces differ: a master, plate and well wall for each (${mold.kits.length * 3 + 1} STLs). One base wall serves them all.`
                      : `The pieces differ: a master, plate, well wall and base wall for each (${mold.kits.length * 4} STLs).`)}
                </p>
              </Section>
              <Section title="Natches" titleColor={GROUP_COLORS.smoothing} tooltip="Two per seam, so neighbouring pieces only go together one way. Each piece has bumps on one parting face and dimples on the other, so any piece mates with the next">
                {sl('natchDiameter', 'Max Diameter', 'mm', 'Largest size for each bump and dimple. Each is made as big as its spot allows, up to this, with at least 4 mm of plaster all round')}
                {sl('natchHeight', 'Height', 'mm', 'How far each plaster bump stands proud (and each dimple sinks). Kept inside the plate\'s top layer')}
                {mold.style === 'splitThirds' && mold.natches.length > 0 && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
                    {mold.natches.length} per seam: {mold.natches.map((n) => (2 * n.r).toFixed(0)).join(' / ')} mm.
                  </p>
                )}
                {mold.style === 'splitThirds' && mold.natchNote && (
                  <p className="text-[11px] text-amber-400 mt-1 leading-snug">{mold.natchNote}</p>
                )}
                {mold.style === 'splitThirds' && mold.hingeNote && (
                  <p className="text-[11px] text-amber-400 mt-1 leading-snug">{mold.hingeNote}</p>
                )}
              </Section>
            </>
          )}

          {/* Cottle / Shell */}
          {!isSplitAny && !isThirds && <>
          <GroupHeader label={isPourClip ? 'Shell' : 'Cottle'} color={GROUP_COLORS.smoothing} />
          <Section title={isPourClip ? 'Shell' : 'Cottle'} titleColor={GROUP_COLORS.smoothing}>
            {sl('plasterThickness', 'Plaster', 'mm', isPourClip ? 'Plaster thickness at the widest point — gap between master and shell wall' : 'Plaster thickness — gap between master and cottle wall')}
            {sl('cottleWallThickness', 'Wall', 'mm', isPourClip ? 'Printed wall thickness of the shell' : 'Printed wall thickness of the cottle')}
            {sl('cottleDraftAngle', 'Draft', '°', isPourClip
              ? 'Inward taper going up — the plaster is narrower at the top, so the shell lifts up and off easily (also saves plaster)'
              : 'Cottle taper (wider toward the opening) so the set plaster releases')}
            {mold.style === 'pourTwoPiece' && sl('shellGrabHeight', 'Grab Height', 'mm', 'Empty wall above the plaster fill line — the rim you grab to pull the shell off. Fill only to the line, not the brim')}
            {/* Pour 3-Pc has no air holes: the halves part sideways, so there is
                no suction pull to break. Every other style lifts a part off the
                set plaster and still needs them. */}
            {mold.style === 'twoPart' && (
              <Toggle label="Air Hole" checked={params.airHoleEnabled} onChange={(v) => setParam('airHoleEnabled', v)} tooltip="Hole through the cottle floor center — lets air in behind the plaster block so suction doesn't fight you when pulling it out" />
            )}
            {(mold.style === 'onePiece' || mold.style === 'pourTwoPiece') && (
              <Toggle label="Air Holes (4)" checked={params.airHoleEnabled} onChange={(v) => setParam('airHoleEnabled', v)} tooltip={mold.style === 'pourTwoPiece'
                ? 'Four round holes through the plaster-floor ring (tape or clay them over while pouring) — break the suction, inject compressed air, or push rods through to eject'
                : 'Four holes through the floor ring (tape or clay them over while pouring) — break the suction when pulling the plaster block, or inject compressed air / push rods through to eject'} />
            )}
            {mold.style !== 'pourThreePiece' && params.airHoleEnabled && sl('airHoleDiameter', 'Diameter', 'mm', mold.style === 'twoPart' ? 'Diameter of the air-relief hole' : 'Approximate size of each of the four air-relief holes')}
          </Section>
          </>}
          {(mold.style === 'pourTwoPiece' || mold.style === 'pourThreePiece') && (
            <Section title="Foot Flange" titleColor={GROUP_COLORS.smoothing} tooltip="Where the center piece and shell binder-clip together. The three V ridges and their grooves are the same seal as the handle mold, which poured leak-free">
              {sl('flangeOverlap', 'Overlap', 'mm', 'How far both flanges extend beyond the shell wall — the binder-clip grab zone, containing all three V rings')}
              {sl('footFlangeThickness', 'Thickness', 'mm', 'Thickness of EACH flange (clips clamp the doubled stack)')}
              {sl('notchHeight', 'V Height', 'mm', 'Height of the three V ridge rings on the center flange (clamped so the groove can always swallow the ridge)')}
              {sl('notchWidth', 'V Width', 'mm', 'Base width of each V ridge (clamped so adjacent grooves cannot run into each other)')}
              {sl('notchClearance', 'V Fit', 'mm', 'Groove oversize around each V so the shell seats — tune to your printer. A loose V still seals')}
              {sl('flangeLip', 'Center Lip', 'mm', 'Exposed rim of the center flange beyond the shell flange — press down here while pulling the shell up')}
            </Section>
          )}
          {mold.style === 'pourThreePiece' && (
            <Section title="Split Cottle" titleColor={GROUP_COLORS.smoothing} tooltip="The vertical split that turns the shell into two clip-together halves">
              {sl('seamAngle', 'Seam Angle', '°', 'Where the vertical split runs. Put it on a flat part of the cross-section rather than a corner — a seam block at a sharp corner has to lie in the plane bisecting it')}
              {sl('seamFinWidth', 'Seam Block', 'mm', 'How far each half is solid back from the split plane, carrying the vertical Vs. Clips grab both blocks, so they clamp twice this')}
              <Toggle
                label="Round Shell"
                checked={params.roundShell}
                onChange={(v) => setParam('roundShell', v)}
                tooltip="Force a round shell instead of following the cross-section. Uses more plaster on non-round vases, but one printed shell can serve many designs"
              />
              {mold.style === 'pourThreePiece' && mold.forcedRound && (
                <p className="text-[11px] text-[var(--accent)] mt-1 leading-snug">
                  Shell forced round: this cross-section is too concave to part sideways at any seam angle.
                </p>
              )}
              {mold.style === 'pourThreePiece' && (
                <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">
                  {mold.halvesIdentical
                    ? 'Halves are identical — print Shell STL twice.'
                    : 'Cross-section is not half-turn symmetric — print Shell A and Shell B.'}
                </p>
              )}
            </Section>
          )}

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
            {isSplitAny && <div className="text-xs mb-1.5" style={{ color: UI_MUTED }}>Totals for BOTH halves of the mold</div>}
            {isThirds && <div className="text-xs mb-1.5" style={{ color: UI_MUTED }}>Totals for ALL THREE pieces — each is its own pour</div>}
            <StatRow label={isSplitAny ? 'Plaster (both halves)' : isThirds ? 'Plaster (all pieces)' : 'Plaster'} value={`${est.volumeCm3.toFixed(0)} cm³`} />
            <StatRow label={isSplitAny ? 'Powder (both halves)' : isThirds ? 'Powder (all pieces)' : 'Powder'} value={`≈ ${fmt(est.powderGrams)} g`} />
            <StatRow label={isSplitAny ? 'Water (both halves)' : isThirds ? 'Water (all pieces)' : 'Water'} value={`≈ ${fmt(est.waterGrams)} g`} />
            {mold.style === 'splitThirds' && mold.kits.length > 0 && (() => {
              const per = mold.kits.map((kt) => estimatePlaster(kt.plasterVolumeMm3, params.material));
              return (
                <>
                  <div className="text-xs mt-2 mb-1.5" style={{ color: UI_MUTED }}>{mold.oneKit ? 'Each pour (one piece)' : 'Each pour'}</div>
                  {per.map((e, i) => (
                    <StatRow key={i} label={mold.oneKit ? 'Plaster / powder' : `Piece ${i + 1}`} value={`${e.volumeCm3.toFixed(0)} cm³ · ≈ ${fmt(e.powderGrams)} g`} />
                  ))}
                </>
              );
            })()}
            {(mold.style === 'splitHalves' || mold.style === 'splitThirds') && mold.foot && (() => {
              const f = estimatePlaster(mold.foot.plasterVolumeMm3, params.material);
              return (
                <>
                  <div className="text-xs mt-2 mb-1.5" style={{ color: UI_MUTED }}>{mold.style === 'splitThirds' ? 'Plug' : 'Foot piece'} — its own pour</div>
                  <StatRow label="Plaster (foot)" value={`${f.volumeCm3.toFixed(0)} cm³`} />
                  <StatRow label="Powder (foot)" value={`≈ ${fmt(f.powderGrams)} g`} />
                  <StatRow label="Water (foot)" value={`≈ ${fmt(f.waterGrams)} g`} />
                </>
              );
            })()}
          </Section>
          <Section title="Printer Fit" titleColor={GROUP_COLORS.settings}>
            {mold.style === 'twoPart' && (
              <>
                <StatRow label="Master max diameter" value={`${mold.masterMaxDiameter.toFixed(0)} mm`} tooltip="Diameter of the smallest circle the master fits inside — compare to your printer bed" />
                <StatRow label="Master height" value={`${mold.masterStats.sizeZ.toFixed(0)} mm`} />
                <StatRow label="Cottle max diameter" value={`${mold.cottleMaxDiameter.toFixed(0)} mm`} tooltip="Diameter of the smallest circle the cottle fits inside — compare to your printer bed" />
                <StatRow label="Cottle height" value={`${mold.cottleStats.sizeZ.toFixed(0)} mm`} />
              </>
            )}
            {mold.style === 'onePiece' && (
              <>
                <StatRow label="Mold max diameter" value={`${mold.moldMaxDiameter.toFixed(0)} mm`} tooltip="Diameter of the smallest circle the mold fits inside — compare to your printer bed" />
                <StatRow label="Mold height" value={`${mold.moldStats.sizeZ.toFixed(0)} mm`} />
              </>
            )}
            {isPourClip && (
              <>
                <StatRow label="Center max diameter" value={`${mold.centerMaxDiameter.toFixed(0)} mm`} tooltip="Diameter of the smallest circle the center piece fits inside (includes the foot flange) — compare to your printer bed" />
                <StatRow label="Center height" value={`${mold.centerStats.sizeZ.toFixed(0)} mm`} />
                <StatRow label="Shell max diameter" value={`${mold.shellMaxDiameter.toFixed(0)} mm`} tooltip="Diameter of the smallest circle the shell fits inside — compare to your printer bed" />
                <StatRow label="Shell height" value={`${mold.shellStats.sizeZ.toFixed(0)} mm`} />
              </>
            )}
            {mold.style === 'splitTwoPiece' && (
              <>
                <StatRow label="Tray footprint" value={`${mold.trayStats.sizeX.toFixed(0)} x ${mold.trayStats.sizeY.toFixed(0)} mm`} tooltip="Each tray's size on the print bed (both trays are the same size)" />
                <StatRow label="Tray height" value={`${mold.trayStats.sizeZ.toFixed(0)} mm`} />
                <StatRow label="Plastic per tray" value={`${(mold.trayStats.volumeMm3 / 1000).toFixed(0)} cm³`} tooltip="Before supports. The hollow relief needs tree supports inside it" />
              </>
            )}
            {/* Mesh density is inherited from the vase — there is deliberately no
                duplicate slider here, so show it as a reminder before exporting. */}
            <StatRow
              label="Mesh"
              value={`${vaseRes.radial} × ${vaseRes.vertical}`}
              tooltip="Radial × vertical mesh resolution, inherited from the Vase tab's Resolution section — change it there. The defaults are already far finer than a 0.4 mm nozzle can print; the cost is file size. High radial only earns its keep when Keep Texture is on and the vase is textured"
            />
            {mold.style === 'twoPart' && (
              <>
                <StatRow label="Master STL" value={stlSize(mold.masterStats.triangleCount)} tooltip="Triangle count and approximate binary STL size" />
                <StatRow label="Cottle STL" value={stlSize(mold.cottleStats.triangleCount)} />
              </>
            )}
            {mold.style === 'onePiece' && (
              <StatRow label="Mold STL" value={stlSize(mold.moldStats.triangleCount)} tooltip="Triangle count and approximate binary STL size" />
            )}
            {isPourClip && (
              <>
                <StatRow label="Center STL" value={stlSize(mold.centerStats.triangleCount)} tooltip="Triangle count and approximate binary STL size. The center carries the vase surface twice — outer and cavity — so it dominates the file" />
                <StatRow label="Shell STL" value={stlSize(mold.shellStats.triangleCount)} />
              </>
            )}
            {mold.style === 'splitHalves' && (
              <>
                <StatRow label="Master" value={`${mold.masterStats.sizeX.toFixed(0)} x ${mold.masterStats.sizeY.toFixed(0)} x ${mold.masterStats.sizeZ.toFixed(0)} mm`} tooltip="Bounding box lying cut-face down (each master)" />
                <StatRow label="Plate" value={`${mold.plateStats.sizeX.toFixed(0)} x ${mold.plateStats.sizeY.toFixed(0)} x ${mold.plateStats.sizeZ.toFixed(0)} mm`} tooltip="Each plate. Too big for the bed? Lower Plaster or Clip Flange" />
                <StatRow label="Wall" value={`${mold.wallStats.sizeX.toFixed(0)} x ${mold.wallStats.sizeY.toFixed(0)} x ${mold.wallStats.sizeZ.toFixed(0)} mm`} tooltip="Each wall — L-shaped, so it can also go diagonally on the bed" />
                <StatRow label="Plastic" value={`${((mold.masterStats.volumeMm3 + mold.plateStats.volumeMm3 + mold.wallStats.volumeMm3) / 1000).toFixed(0)} cm³ per half`} tooltip="Master + plate + one wall. Before supports" />
                <StatRow label="Master STL" value={stlSize(mold.masterStats.triangleCount)} tooltip="Triangle count and approximate binary STL size, each master" />
                {mold.foot && (
                  <>
                    <StatRow label="Foot plate" value={`${mold.foot.plateStats.sizeX.toFixed(0)} x ${mold.foot.plateStats.sizeY.toFixed(0)} x ${mold.foot.plateStats.sizeZ.toFixed(0)} mm`} tooltip="The foot piece's plate" />
                    <StatRow label="Foot wall" value={`${mold.foot.wallStats.sizeX.toFixed(0)} x ${mold.foot.wallStats.sizeY.toFixed(0)} x ${mold.foot.wallStats.sizeZ.toFixed(0)} mm`} tooltip="Each foot wall — print two" />
                  </>
                )}
              </>
            )}
            {mold.style === 'splitThirds' && (
              <>
                <StatRow label="Master + plate" value={`${mold.masterStats.sizeX.toFixed(0)} x ${mold.masterStats.sizeY.toFixed(0)} x ${mold.masterStats.sizeZ.toFixed(0)} mm`} tooltip="One print, lying down as exported (the V's underside on the bed)" />
                <StatRow label="Well wall" value={`${mold.wallStats.sizeX.toFixed(0)} x ${mold.wallStats.sizeY.toFixed(0)} x ${mold.wallStats.sizeZ.toFixed(0)} mm`} tooltip="As assembled; turn it in the slicer as suits your printer" />
                <StatRow label="Base wall" value={`${mold.baseWallStats.sizeX.toFixed(0)} x ${mold.baseWallStats.sizeY.toFixed(0)} x ${mold.baseWallStats.sizeZ.toFixed(0)} mm`} />
                <StatRow label="Plastic" value={`${((mold.masterStats.volumeMm3 + mold.wallStats.volumeMm3 + mold.baseWallStats.volumeMm3) / 1000).toFixed(0)} cm³ per kit`} tooltip="Master + plate (solid, so this is an upper bound — your infill sets the real figure) + both walls. Before supports" />
                <StatRow label="Master STL" value={stlSize(mold.masterStats.triangleCount)} tooltip="Triangle count and approximate binary STL size" />
                {mold.foot && (
                  <>
                    <StatRow label="Plug disk" value={`${mold.foot.plateStats.sizeX.toFixed(0)} x ${mold.foot.plateStats.sizeY.toFixed(0)} x ${mold.foot.plateStats.sizeZ.toFixed(0)} mm`} tooltip="The plug cup's bottom disk" />
                    <StatRow label="Plug wall" value={`${mold.foot.wallStats.sizeX.toFixed(0)} x ${mold.foot.wallStats.sizeY.toFixed(0)} x ${mold.foot.wallStats.sizeZ.toFixed(0)} mm`} tooltip="Each plug cup wall, standing on its ledge" />
                  </>
                )}
              </>
            )}
            {mold.style === 'splitTwoPiece' && (
              <StatRow label="Tray STL" value={stlSize(mold.trayStats.triangleCount)} tooltip="Triangle count and approximate binary STL size, each tray" />
            )}
          </Section>

          {savedParams && savedParams !== params && (
            <button
              onClick={revertToSaved}
              className="mt-2 w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Put the mold settings back to the last Save/Load Settings"
            >
              Revert to Saved
            </button>
          )}
          <button
            onClick={reset}
            className="mt-2 w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs rounded hover:bg-[var(--border-color)] transition-colors"
            style={{ color: UI_MUTED }}
            title="Put this tab's mold settings back to their defaults. A foot that is on stays on (its settings reset). The other mold styles keep their own settings, and your vase design isn't touched. Undo (⌘Z) brings them back"
          >
            Reset Mold Settings to Defaults
          </button>
        </div>
      </div>

      {saveAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg p-5 max-w-md mx-4 shadow-xl">
            <p className="text-sm text-[var(--text-primary)] mb-1 font-medium">Save the designs too?</p>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Each is saved as its own file under its own name, then the mold.
            </p>
            {([
              ['vase', 'Vase', designName || 'vase-design', vaseDirty, true],
              ['handle', 'Handle', handleName, handleDirty, usesHandle],
            ] as const).map(([key, label, name, dirty, show]) => show && (
              <label key={key} className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-1.5 cursor-pointer">
                <input type="checkbox" checked={saveAll[key]}
                  onChange={(e) => setSaveAll({ ...saveAll, [key]: e.target.checked })} />
                {label} <span className="text-[var(--text-primary)]">{name}</span>
                <span className={dirty ? 'text-amber-300' : 'opacity-70'}>{dirty ? '(unsaved changes)' : '(saved, no changes)'}</span>
              </label>
            ))}
            <div className="flex gap-2 mt-3">
              <button onClick={() => runSaveAll(saveAll)} title="Save the ticked designs first, then the mold settings"
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded transition-colors">
                Save
              </button>
              <button onClick={() => setSaveAll(null)}
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undercut warning dialog */}
      {/* "This mold was saved with a different vase / handle" — only ever shown
          when the file carries a design that differs from the one open, so the
          common path (your own mold, your own vase and handle) has no dialog at
          all. One dialog covers both, so you can't take one and miss the other. */}
      {vaseChoice && (() => {
        const c = vaseChoice;
        const what = c.vase && c.handle ? 'vase and handle' : c.vase ? 'vase' : 'handle';
        // Unsaved work that loading would replace — only the parts that differ.
        const unsavedVase = !!c.vase && vaseDirty;
        const unsavedHandle = !!c.handle && handleDirty;
        const unsaved = unsavedVase || unsavedHandle;
        const row = (label: string, file: string | null, open: string | null, differs: boolean) => (
          <p className="text-xs text-[var(--text-secondary)] mb-1">
            {label}:{' '}
            {differs ? (
              <>
                <span className="text-[var(--text-primary)]">{file || '(unnamed)'}</span> in the file · open now{' '}
                <span className="text-[var(--text-primary)]">{open || '(unnamed)'}</span>
              </>
            ) : (
              <span className="text-[var(--text-primary)]">same as open</span>
            )}
          </p>
        );
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg p-5 max-w-md mx-4 shadow-xl">
            <p className="text-sm text-[var(--text-primary)] mb-2 font-medium">
              This mold was saved with a different {what}
            </p>
            {row('Vase', c.vaseName, designName, !!c.vase)}
            {c.fileHasHandle && row('Handle', c.handleName, handleName, !!c.handle)}
            <div className="mb-3" />
            {unsaved && (
              <p className="text-xs text-amber-300 mb-3">
                Your current {unsavedVase && unsavedHandle ? 'vase and handle have' : unsavedVase ? 'vase has' : 'handle has'} unsaved changes.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {unsaved && (
                <button
                  onClick={async () => {
                    // One save dialog per unsaved design; cancelling either stops the load.
                    if (unsavedVase && !(await saveCurrentVase())) return;
                    if (unsavedHandle && !(await saveCurrentHandle())) return;
                    takeFileVase(c);
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded transition-colors"
                  title="Save your open design to a file first, then load the mold file and the design inside it"
                >
                  Save mine, then load
                </button>
              )}
              <button
                onClick={() => takeFileVase(c)}
                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
                  unsaved
                    ? 'bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-primary)]'
                    : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white'
                }`}
                title={unsaved ? `Load the mold file and its ${what}, dropping your unsaved changes` : `Load the mold settings and the ${what} saved inside the file`}
              >
                {unsaved ? 'Load anyway' : `Load that ${what} too`}
              </button>
              <button
                onClick={() => { applyMoldOnly(c.settings, c.fileName); setVaseChoice(null); }}
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] text-[var(--text-primary)] transition-colors"
                title={`Use this mold's numbers on the ${what} you already have open`}
              >
                Settings only
              </button>
              <button
                onClick={() => setVaseChoice(null)}
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {warnExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg p-5 max-w-sm mx-4 shadow-xl">
            <p className="text-sm text-[var(--text-primary)] mb-2 font-medium">Undercuts detected</p>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              {mold.style === 'splitThirds'
                ? <>In the areas shown in red, the surface faces back toward a seam by more than the piece allows, so that plaster piece locks onto the master. Try another Seam Angle — seams on the ridges of a texture release best. Export anyway?</>
                : mold.style === 'splitTwoPiece' || mold.style === 'splitHalves'
                ? <>In the areas shown in red, the surface faces back toward the split line, so the plaster half locks onto it and won&apos;t pull straight off sideways. Try another Split Angle. Export anyway?</>
                : mold.style === 'twoPart'
                ? <>In the areas shown in red, the master gets narrower as it rises, so the plaster above locks it in — it won&apos;t pull straight up out of the mold. Export anyway?</>
                : <>In the areas shown in red, the vase narrows toward its own top, so the set plaster locks around it — the plaster block won&apos;t pull off the center form. Export anyway?</>}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setWarnExport(false); doExportMain(); }}
                className="flex-1 px-3 py-1.5 text-xs bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded transition-colors"
                title="Save the STL even though the red areas may lock in the plaster"
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
