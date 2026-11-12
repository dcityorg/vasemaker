'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ShowFacetsToggle } from '@/components/parameters/ShowFacetsToggle';
import { Section, SliderRow, Toggle, GroupHeader, ResetRow, RevertResetRow, ToggleAllSectionsButton, useRememberedScroll, resetDot, CHANGED_TIP, Greyed } from '@/components/parameters/ui';
import { setShowFacets } from '@/store/view-prefs';
import { useMoldStore, useMoldHistory, DEFAULT_PART_COLOR, DEFAULT_VIEW, isMoldUnnamed, moldResetParams } from '@/store/mold-store';
import { ToolNav } from '@/components/parameters/ToolNav';
import { DesignNameRow, NamePromptHost, ensureNamed, SaveNote } from '@/components/parameters/DesignName';
import { useVaseStore } from '@/store/vase-store';
import { useHandleStore } from '@/store/handle-store';
import { vaseHandle, moldCastsHandle } from '@/engine/mold/handle-on-vase';
import { useHandleTabDiffers, useHandleTab } from '@/components/parameters/HandleControls';
import { SplitTopView } from './SplitTopView';
import { MOLD_PARAMS, PLASTER_MATERIALS } from '@/config/mold-params';
import { GROUP_COLORS, UI_MUTED } from '@/config/colors';
import { generateSTL } from '@/engine/stl-export';
import { saveSTLFile, saveDesignFile, saveTextFile, openDesignFile } from '@/lib/image-capture';
import { dcCountExport } from '@/lib/analytics';
import { estimatePlaster } from '@/engine/mold/mold-stats';
import { buildPrintReport, type ReportPart } from '@/lib/print-report';
import { ACTIVE_MOLD_STYLES, HALVES_HANDLE_OFFERED } from '@/engine/mold/mold-types';
import { readDesignFile } from '@/lib/load-pieces';
import { saveCurrentVase } from '@/lib/save-pieces';
import { showLoadList, LoadListHost } from '@/components/parameters/LoadList';
import { moldFileName, moldNameFromFile } from '@/lib/file-names';
import { translateMesh } from '@/engine/handle/mesh3';
import { moldWithVaseFoot } from '@/engine/mold/vase-foot';
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
  const sidebarScroll = useRememberedScroll();
  const designName = useVaseStore((s) => s.designName);
  const vaseParams = useVaseStore((s) => s.params);
  const vaseDirty = useVaseStore((s) => s.isDirty);
  const markSaved = useMoldStore((s) => s.markSaved);
  const savedParams = useMoldStore((s) => s.savedParams);
  const revertToSaved = useMoldStore((s) => s.revertToSaved);
  const doUndo = useMoldStore((s) => s.undo);
  const doRedo = useMoldStore((s) => s.redo);
  const { canUndo, canRedo } = useMoldHistory();

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
  /** The handle is the vase's (Vase tab → Handle, 2026-11-11): its copy, Around
   *  and Top Below Rim. This mold casts it when the style can and its switch is on. */
  const vaseHandleNow = useVaseStore((s) => vaseHandle(s.params));
  const usesHandle = useVaseStore((s) => moldCastsHandle(params, s.params));
  const handleTabDiffers = useHandleTabDiffers();
  const useHandleTabNow = useHandleTab();
  const handleTabName = useHandleStore((s) => s.settingsName);
  const reset = useMoldStore((s) => s.reset);
  const [warnExport, setWarnExport] = useState(false);
  /** Split 2-Pc / Split Halves have two gated exports; which one the warning dialog continues. */
  const splitTarget = useRef<'A' | 'B'>('A');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** The mold's OWN name (Gary, 2026-10-25). Until then it borrowed the vase's
   *  («vase» mold), so two molds of one vase saved under the same name; now it
   *  stays "mold design", in yellow, until named, and Save/Export ask first. */
  const fileName = settingsName;
  /** This mold's name for a file, asking for one first if it has none. */
  const moldName = () => {
    const n = useMoldStore.getState().settingsName;
    return ensureNamed('Mold', isMoldUnnamed(n), n, setSettingsName);
  };
  /** Save Settings' "also save the vase / handle?" box — which boxes are ticked. */
  const [saveAll, setSaveAll] = useState<{ vase: boolean } | null>(null);

  /** `count`: only the main part counts as an export (DCity/ANALYTICS.md §2 — one
   *  event per mold, not per file), so shells, cottle and tray B pass false. */
  const exportMesh = async (mesh: VaseMesh, part: string, count = false) => {
    const mn = await moldName();
    if (!mn) return;
    const name = `${mn} ${part}.stl`;
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
  const halvesExport = (which: 'masterL' | 'masterR' | 'plateL' | 'plateR' | 'wellWallL' | 'baseWallL' | 'wellWallR' | 'baseWallR' | 'footPlate' | 'footWall', k = 0) => {
    if (mold.style !== 'splitHalves') return;
    if (which === 'footPlate' || which === 'footWall') {
      if (!mold.foot) return;
      const f = mold.foot;
      if (which === 'footPlate') exportMesh(f.plate, stlName('plug disk'));
      else exportMesh(f.walls[k], stlName(f.wallsSame ? 'plug wall' : `plug wall ${'ABCD'[k]}`));
      return;
    }
    const one = mold.oneKit;
    const name: Record<typeof which, string> = {
      masterL: one ? 'master' : 'master L', masterR: 'master R',
      plateL: one ? 'plate' : 'plate L', plateR: 'plate R',
      wellWallL: one ? 'well wall' : 'well wall L', baseWallL: one ? 'base wall' : 'base wall L',
      wellWallR: 'well wall R', baseWallR: 'base wall R',
    };
    const lift = which.startsWith('master') ? mold.layout.masterLift : which.startsWith('plate') ? mold.layout.plateLift : 0;
    exportMesh(translateMesh(mold[which], 0, 0, lift), stlName(name[which]), which === 'masterL');
  };
  /** Binary STL is an 84-byte header plus 50 bytes per triangle. */
  const stlSize = (tris: number) => {
    const mb = (84 + tris * 50) / (1024 * 1024);
    return `${tris >= 1000 ? `${(tris / 1000).toFixed(0)}k` : tris} tris · ${mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`}`;
  };
  /** Part label; exportMesh puts the mold's name in front. */
  const stlName = (part: string) => part;

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
        box(k ? 'Well wall' : 'Well wall L + Well wall R', mold.wallStats, 'the well end + half of each side' + (k ? '; goes round both pours' : ', each')),
        box(k ? 'Base wall' : 'Base wall L + Base wall R', mold.baseWallStats, 'the base end + the other half of each side' + (k ? '; goes round both pours' : ', each')),
        ...(mold.foot ? [
          box('Plug disk', mold.foot.plateStats, 'the plug cup\'s bottom: the vase\'s foot, recess up'),
          box(mold.foot.wallsSame ? `Plug wall ×${mold.foot.walls.length}` : `Plug walls (${mold.foot.walls.length})`, mold.foot.wallStats, `${mold.foot.wallsSame ? `print ${mold.foot.walls.length}` : 'each'}; clip together round the disk, printed standing on their ledge`),
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

  /** Save Settings. When the vase has unsaved changes, first offer to save it
   *  too, so one click leaves everything on disk, under its OWN name. (The
   *  handle is the vase's copy since 2026-11-11, so it goes with the vase.) */
  const handleSaveSettings = () => {
    if (vaseDirty) setSaveAll({ vase: true });
    else void saveMoldFiles();
  };

  /** Run the ticked save, then the mold. The vase goes FIRST so the mold file
   *  records the name it was actually saved under (Chrome can rename in its
   *  dialog). Cancelling its dialog stops the rest. */
  const runSaveAll = async (choice: { vase: boolean }) => {
    setSaveAll(null);
    if (choice.vase && !(await saveCurrentVase())) return;
    await saveMoldFiles();
  };

  const saveMoldFiles = async () => {
    // Read the names fresh: a save just before this may have renamed them.
    const designName = useVaseStore.getState().designName;
    const fileName = await moldName();
    if (!fileName) return;
    // The vase is EMBEDDED, not referenced (2026-08-09). A mold is derived from
    // a vase — the master IS the vase, scaled — so mold settings alone can never
    // reproduce a mold. Before this, reopening a mold file a day later silently
    // wrapped your numbers around whatever vase happened to be loaded, which
    // after a reload was the default Classic Vase. Old files have no `vase` key
    // and still load settings-only.
    const json = JSON.stringify({
      app: 'VaseMaker',
      type: 'mold-settings',
      // The foot fields carry the VASE's foot (what this mold actually uses),
      // so an older copy of the app reading this file builds the same bottom.
      settings: moldWithVaseFoot(params, vaseParams),
      vase: vaseParams,
      vaseName: designName,
      // The handle travels ON the vase (vase.handle, 2026-11-11): its copy and
      // where it goes. Files before that kept it here, beside the vase, with its
      // place in the mold settings; readMoldFile moves it onto the vase.
    }, null, 2);
    // "Tall Tumbler – Split Halves.json" + .txt (Gary, 2026-11-11): a second style
    // gets its own pair instead of replacing this one; the mold keeps its own name.
    const chosenName = await saveDesignFile(json, moldFileName(fileName, params.moldStyle));
    if (chosenName === null) return; // cancelled — don't offer the text file either
    markSaved(params, moldNameFromFile(chosenName));
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
      extraPours: mold.style === 'splitHalves' && mold.foot ? [{ label: 'PLUG (its own pour, in its cup)', volumeMm3: mold.foot.plasterVolumeMm3 }]
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

  /** Load Design: every file goes through the Load list (Gary, 2026-11-11) —
   *  it shows what the file holds and loads the ticked pieces. */
  const applySettingsText = (text: string, fileBase: string) => {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { alert('Not a design file.'); return; }
    const contents = readDesignFile(parsed, fileBase);
    if (!contents) { alert('Not a design file.'); return; }
    showLoadList(contents);
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

  // The amber "changed" dots (Gary, 2026-11-01, as on the Sprig page). Measured
  // against what Reset gives for this style, so the foot switches it keeps
  // never show, and a dot's click sets just that one value as Reset would.
  const def = moldResetParams(params);
  const ch = (k: keyof MoldParameters) => params[k] !== def[k];
  const dot = <K extends keyof MoldParameters>(k: K, shown: string) => resetDot(ch(k), () => setParam(k, def[k]), shown);
  const onOff = (k: keyof MoldParameters) => dot(k, def[k] ? 'on' : 'off');
  /** A section's title dot: any of its shown settings changed (`false` = not shown for this style). */
  const any = (...keys: (keyof MoldParameters | false)[]) => keys.some((k) => k !== false && ch(k));

  // Plain render function (not a nested component) so the range inputs aren't
  // remounted on every store update mid-drag.
  const sl = (k: MoldNumKey, label: string, suffix?: string, tooltip?: string, color?: string) => (
    <SliderRow
      label={label}
      after={dot(k, `${def[k]}${suffix ?? ''}`)}
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
    <div data-sidebar className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b-[3px] border-[#555]">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-[var(--text-primary)] flex-1">MoldMaker</h1>
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
          <ToggleAllSectionsButton />
        </div>
        <ToolNav current="mold" helpOpen={helpOpen} onToggleHelp={onToggleHelp} />
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
        <DesignNameRow what="Mold" name={settingsName} unnamed={isMoldUnnamed(settingsName)} onRename={setSettingsName} />
        <NamePromptHost />
        <LoadListHost />
      </div>

      <div {...sidebarScroll} className="flex-1 overflow-y-auto sidebar-scroll">
        {/* Toolbar — settings files + STL exports */}
        <div className="px-3 py-2 border-b-[3px] border-[#555] flex flex-col gap-2">
          {/* ── Settings files ── */}
          <div className="flex gap-2">
            <button
              onClick={handleLoadSettings}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title="Load a design file (.json). A list shows what it holds (the vase, this mold style, the handle, and the sprig and mark on the vase) so you can tick what to load"
            >
              Load Design
            </button>
            <button
              onClick={handleSaveSettings}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
              style={{ color: UI_MUTED }}
              title={`Save this mold style (.json, named “… – ${MOLD_STYLE_TABS.find((t) => t.value === params.moldStyle)?.label ?? 'style'}”) with its vase and handle, and the sprig and mark only if they are on the vase, plus a .txt bench sheet. Another style saves its own pair of files`}
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
          <SaveNote>Saves this mold style with its vase and handle. A sprig or mark is saved only if it is on the vase; save other sprigs and marks on the Sprig/Mark page.</SaveNote>
          <RevertResetRow
            canRevert={!!savedParams && savedParams !== params}
            onRevert={revertToSaved}
            revertTitle="Put this mold style's settings back to the last Save Design / Load Design. Undoable with ↶"
            resetLabel="Reset Mold Settings"
            onReset={reset}
            resetTitle="Every setting of THIS mold style (the tab you are on) back to its default — an amber dot shows which have changed. The other mold styles keep their own settings, a Bottom Plug that is on stays on (its settings reset), and your vase design isn't touched. The design's name goes back to “mold design”. Undoable with ↶"
          />

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
                {(mold.oneKit
                  ? [['wellWallL', 'Well Wall', 'The well end + half of each side; the well runs into its collar. V ridges at its two seams. Goes round both pours'],
                     ['baseWallL', 'Base Wall', 'The base end + the other half of each side. V grooves at its two seams. Goes round both pours'],
                    ] as const
                  : [['wellWallL', 'Well Wall L', 'Left half: the well end + half of each side; the well runs into its collar. V ridges at its seams'],
                     ['baseWallL', 'Base Wall L', 'Left half: the base end + the other half of each side. V grooves at its seams'],
                     ['wellWallR', 'Well Wall R', 'Right half: the well end + half of each side. The halves are mirror images, so its walls are its own'],
                     ['baseWallR', 'Base Wall R', 'Right half: the base end + the other half of each side'],
                    ] as const
                ).map(([k, label, tip]) => (
                  <button key={k} disabled={!!mold.error} title={tip} style={{ color: UI_MUTED }} onClick={() => halvesExport(k)}
                    className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                    Export {label} STL
                  </button>
                ))}
                {mold.foot && (
                  <>
                    <button disabled={!!mold.error} onClick={() => halvesExport('footPlate')} style={{ color: UI_MUTED }}
                      title="The plug cup's bottom disk: the vase bottom's foot ring and recessed middle, recess up. It drops into the cup walls and rests on their ledge; the plug is poured onto it, vase face down"
                      className="flex-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs font-medium rounded hover:bg-[var(--border-color)] transition-colors disabled:opacity-40">
                      Export Plug Disk STL
                    </button>
                    {(mold.foot.wallsSame ? [0] : mold.foot.walls.map((_, k) => k)).map((k) => (
                      <button key={k} disabled={!!mold.error} onClick={() => halvesExport('footWall', k)} style={{ color: UI_MUTED }}
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
          <Section title="Display" titleColor={GROUP_COLORS.settings} tooltip="How the preview looks. Nothing here changes what you print">
          <ResetRow title="Everything in Display back to its default" onClick={() => { setView({ ...DEFAULT_VIEW }); setPartColor(DEFAULT_PART_COLOR); setShowFacets(true); }} />
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
              <Toggle label="Walls" checked={view.showCottleB} onChange={(v) => setView({ showCottleB: v })} tooltip="The well wall and base wall round each half" />
            </>
          )}
          <Toggle label="Plaster" checked={view.showPlaster} onChange={(v) => setView({ showPlaster: v })} />
          {(mold.style === 'pourTwoPiece' || mold.style === 'pourThreePiece' || isHalves || isThirds) && (
            <Toggle label={isHalves || isThirds ? 'Ghost Walls' : 'Ghost Shell'} checked={view.ghostShell} onChange={(v) => setView({ ghostShell: v })} tooltip="Draw the shell translucent to see how the whole assembly fits together. Opaque is clearer for inspecting the flange features — stacked transparent surfaces sort badly at the seam" />
          )}
          {/* Same control as the vase's View → Color. Colours the main
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
          <ShowFacetsToggle />
          <Toggle label="Undercuts" checked={view.showUndercuts} onChange={(v) => setView({ showUndercuts: v })} tooltip={isThirds
            ? "Highlight areas (red) where a piece can't pull straight out along its own centre line — a surface facing back toward a seam by more than the piece allows (30° at a seam, more toward the middle). Turn the Seam Angle to put the seams on ridges"
            : isSplitAny
            ? "Highlight areas (red) that face back toward the split line — the plaster half locks onto them and can't pull straight off sideways. Flutes, twist and concave shapes crossing the split do this; necks and bellies don't"
            : "Highlight areas (red) where the master narrows as it rises — the plaster above locks them in, so the master can't pull straight up"} />

          {!isSplitAny && !isThirds && <Toggle label="Cross-section" checked={view.crossSection} onChange={(v) => setView({ crossSection: v })} tooltip="Slice the assembly to reveal the plaster, well, and cavity" />}
          </Section>
          {/* Master */}
          <GroupHeader label="Master" color={GROUP_COLORS.structure} />
          {/* Named for what is in it; the MASTER heading above covers this and the Foot box (Gary, 2026-10-26: "Master / Master"). */}
          <Section title="Shrink & Wall" titleColor={GROUP_COLORS.structure} changed={any('shrinkPercent', !isSplit && 'masterWallThickness', 'keepTexture')} changedTip={CHANGED_TIP}>
            {sl('shrinkPercent', 'Shrink', '%', 'Clay slip shrinkage — master is scaled up by this to compensate. In red because a wrong value is silent: every pot comes out the wrong size', '#f87171')}
            {!isSplit && sl('masterWallThickness', 'Wall', 'mm', isThirds ? 'Printed shell of the hollow master (one piece\'s slice of the vase). It is open on its cut faces so cold water can go in to shrink it free' : isHalves ? 'Printed shell of the hollow half-vase master. It is open on its cut face so cold water can go in to shrink it free' : 'Printed shell thickness of the hollow master')}
            <Toggle label="Keep Texture" checked={params.keepTexture} onChange={(v) => setParam('keepTexture', v)} after={onOff('keepTexture')} tooltip="Carry the vase's surface texture onto the master" />
            {/* A sprig on the side always locks a mold that lifts straight off
                (Gary, 2026-10-28: say so even with Undercuts switched off). */}
            {!isSplitAny && !isThirds && params.keepTexture && vaseParams.textures.enabled !== false && vaseParams.textures.sprig?.enabled && vaseParams.textures.sprig.sprig && (
              <p className="text-[11px] text-amber-400 mt-1 leading-snug">
                The vase has a Sprig texture. This mold lifts straight off the vase, so a sprig on the side will lock in the plaster. Use Split Halves or Split Thirds, or turn Keep Texture off.
              </p>
            )}
            {/* The mold has no Resolution of its own; say where it is (Gary,
                2026-10-26: every page names Resolution in the same way). */}
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug" title="The master is the vase, so its facets are the vase's. Raise Vertical / Radial on the Vase tab for a smoother master">
              Resolution: {vaseParams.resolution.vertical} × {vaseParams.resolution.radial}, from the Vase tab (Settings → Resolution). <Link href="/" className="underline hover:text-[var(--text-primary)]">Vase ▸</Link>
            </p>
          </Section>
          {(isHalves || isThirds) && (() => {
            // One plaster PLUG foot for both split styles (Split Halves since
            // 2026-10-18); each keeps its own switch and Plug Height.
            const on = isThirds ? params.thirdsFootPiece : params.halvesFootPiece;
            const onKey = isThirds ? 'thirdsFootPiece' : 'halvesFootPiece';
            const plug = mold.style === 'splitThirds' || mold.style === 'splitHalves' ? mold.foot : null;
            // The switch itself is kept by Reset, so only Plug Height can show a dot.
            return <Section title="Bottom Plug" titleColor={GROUP_COLORS.structure} changed={on && any(isThirds ? 'thirdsPlugHeight' : 'halvesPlugHeight')} changedTip={CHANGED_TIP}>
            <Toggle label="Enabled" checked={on} onChange={(v) => setParam(onKey, v)} tooltip={`How this mold casts the vase's bottom (the vase's foot itself is set on the Vase tab, Foot & Mark). Cast the bottom as a separate plaster piece: a PLUG the shape of the vase bottom that sits inside the ${isThirds ? 'three pieces' : 'two halves'}, held in by a rounded ring. It gives the mug a foot ring and a recessed centre, with no thin plaster wedge where a curled-in bottom meets a ledge. The plug is poured in its own small cup (a bottom disk and clip-together walls)`} />
            {/* Plug Height stays in view, greyed, while the switch is off (Gary, 2026-11-01); the notes below go. */}
            <Greyed off={!on} hint="Turn on Enabled (above) to use this">
              {sl(isThirds ? 'thirdsPlugHeight' : 'halvesPlugHeight', 'Plug Height', 'mm', 'How tall the plug is, from the vase bottom down to the bottom of the mold. The ring sits in the middle. The plug is the mold wall for the bottom of the vase, so keep it near the Plaster thickness so it soaks up water like the sides')}
            </Greyed>
            {on && (
              <>
                <VaseBottomNote where="plug" />
                {plug?.markNote && (
                  <p className="text-[11px] text-amber-400 mt-1 leading-snug">{plug.markNote}</p>
                )}
                {plug && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug"
                    title="The plug is cast in a cup of clip-together walls. A textured bottom edge can grip them where its ribs point along a wall's pull, so the app uses the fewest walls (2 to 4) that all pull straight off, and turns the seams to suit">
                    Plug cup: {plug.walls.length} walls{plug.wallsSame ? `, all the same (print ${plug.walls.length})` : ', each different'}.
                  </p>
                )}
                {plug?.plugNote && (
                  <p className="text-[11px] text-amber-400 mt-1 leading-snug">{plug.plugNote}</p>
                )}
              </>
            )}
          </Section>;
          })()}
          {!isSplitAny && !isThirds && <Section title="Foot" titleColor={GROUP_COLORS.structure}>
            <VaseBottomNote where="master" />
            {mold.style === 'pourThreePiece' && mold.floorNote && <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">{mold.floorNote}</p>}
            {mold.style === 'pourThreePiece' && mold.markNotes.map((n) => (
              <p key={n} className="text-[11px] text-amber-400 mt-1 leading-snug">{n}</p>
            ))}
          </Section>}
          {/* Without the plug a split mold has nothing to mould a recess or a mark from, so
              the master's bottom is flat (split-halves-generator.ts). Say so (Gary, 2026-11-11). */}
          {/* The vase has a handle this mold does not cast (Gary, 2026-11-11, plan Part 2). */}
          {vaseHandleNow.enabled && !usesHandle && (
            <p data-own-mold-note className="text-[11px] text-[var(--text-secondary)] mx-3 mb-2 leading-snug">
              The vase&apos;s handle is not cast in this mold: cast it in its own mold on the{' '}
              <Link href="/handle" className="underline hover:text-[var(--text-primary)]">Handle tab ▸</Link>
              {isHalves ? ', or turn on Handle below to cast it with the mug' : ''}.
            </p>
          )}
          {(isHalves || isThirds) && !(isThirds ? params.thirdsFootPiece : params.halvesFootPiece) && vaseParams.bottom?.footOn && (
            <p data-foot-note className="text-[11px] text-amber-400 mx-3 mb-2 leading-snug">The vase has a foot. Without the Bottom Plug this mold casts a flat bottom; turn Bottom Plug on to cast the foot.</p>
          )}
          {(isHalves || isThirds) && !(isThirds ? params.thirdsFootPiece : params.halvesFootPiece) && vaseParams.bottom?.markOn && (
            <p className="text-[11px] text-amber-400 mx-3 mb-2 leading-snug">The vase has a mark; turn Bottom Plug on to put it on the plug.</p>
          )}

          {/* Well */}
          <GroupHeader label="Well & Flange" color={GROUP_COLORS.surface} />
          <Section title="Well" titleColor={GROUP_COLORS.surface} changed={any('wellWidth', 'wellHeight', 'wellDraftAngle', (isHalves || isThirds) && 'halvesWellSeal')} changedTip={CHANGED_TIP}>
            {sl('wellWidth', 'Width', 'mm', 'Horizontal step out at the rim (the 90° razor-trim ledge)')}
            {sl('wellHeight', 'Height', 'mm', 'Height of the well wall above the vase rim')}
            {sl('wellDraftAngle', 'Draft', '°', 'Outward taper of the well wall for easy release')}
            {(isHalves || isThirds) && sl('halvesWellSeal', 'Well Seal', 'mm', 'How far the well runs into the wall\'s collar. The well ends in a straight section exactly this long (a collar can only seal on a straight section, not a taper), capped at the end so the master holds ice water')}
          </Section>
          {mold.style === 'twoPart' && (
            <Section title="Flange" titleColor={GROUP_COLORS.surface} defaultOpen={false} changed={any('flangeWidth', 'flangeThickness')} changedTip={CHANGED_TIP}>
              {sl('flangeWidth', 'Width', 'mm', 'Flange overhang beyond the well — should rest on the cottle rim')}
              {sl('flangeThickness', 'Thickness', 'mm')}
            </Section>
          )}

          {isSplitAny && (
            <>
              <GroupHeader label={isHalves ? 'Plate & Walls' : 'Trays'} color={GROUP_COLORS.smoothing} />
              <Section title={isHalves ? 'Plate & Walls' : 'Trays'} titleColor={GROUP_COLORS.smoothing} changedTip={CHANGED_TIP}
                changed={any('plasterThickness', 'seamAngle', isSplit && 'trayWallThickness', isSplit && 'trayFloorThickness',
                  isHalves && 'halvesSeatDepth', isHalves && 'halvesFitClearance', isHalves && 'halvesPlateFloor', isHalves && 'halvesWallThickness', isHalves && 'halvesFlangeWidth')}
                tooltip={isHalves
                ? 'Reusable parts, the handle-mold way: the master sits in a pocket in the plate, two walls clip on round it. After the plaster sets: walls off, plate off, then cold water into the master and pull it out'
                : 'One throwaway printed tray per plaster half. Pour plaster into each, let it set, then soften the plastic with a heat gun and peel it off'}>
                {sl('plasterThickness', 'Plaster', 'mm', 'Plaster around the vase: the margin each side of it, below its base, and behind it')}
                {usesHandle ? (
                  // The seam runs through the cast handle, so the handle's place decides it (2026-11-11).
                  <p data-split-follows className="text-[11px] text-[var(--text-secondary)] mb-1 leading-snug">
                    Split Angle {vaseHandleNow.around}°: the seam runs through the handle, so it follows the handle&apos;s Around (Vase tab → Handle).
                  </p>
                ) : sl('seamAngle', 'Split Angle', '°', 'Where the split plane runs through the vase. On a square or polygon it decides where the seam lines fall — watch the Undercuts view. When this mold casts the handle, the seam runs through it instead, at the handle\'s Around (Vase tab)')}
                <SplitTopView
                  vase={vaseParams}
                  keepTexture={params.keepTexture}
                  seamAngle={usesHandle ? vaseHandleNow.around : params.seamAngle}
                  handleOn={usesHandle}
                  zFrac={usesHandle ? Math.max(0, 1 - vaseHandleNow.topDrop / Math.max(1, vaseParams.height)) : 0.5}
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
              <Section title="Natches" titleColor={GROUP_COLORS.smoothing} changed={any(isHalves && 'halvesNatchCount', 'natchDiameter', 'natchHeight')} changedTip={CHANGED_TIP} tooltip={isHalves
                ? 'Bumps and dimples on each plaster half so the halves only go together one way. Each is placed automatically in the biggest free plaster near its corner'
                : 'Two bumps and two dimples on each plaster half, on diagonals, so the halves only go together one way'}>
                {isHalves && (
                  <div className="flex items-center gap-2 mb-2" title="How many natches per plaster half. Three still line the halves up; a vase that pours one plate twice always uses four">
                    <span className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Count{dot('halvesNatchCount', String(def.halvesNatchCount))}</span>
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
                {mold.style === 'splitHalves' && mold.natchInfo && !mold.natchNote && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-snug">{mold.natchInfo}</p>
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
                changed={any('splitHandle', 'castWallThickness', isHalves && 'halvesRibSlot')}
                changedTip={CHANGED_TIP}
                offHint="Turn on Handle to cast the vase's handle in this mold"
                tooltip="Cast the vase's handle with the mug, in this mold. The handle and where it goes are the vase's (Vase tab → Handle); the seam runs through it. Off: cast the handle in its own mold on the Handle tab"
              >
                {vaseHandleNow.enabled && vaseHandleNow.handle ? (
                  <>
                    <p className="text-[11px] text-[var(--text-secondary)] mb-1 leading-snug">
                      The vase&apos;s handle: <span className="text-[var(--text-primary)]">{vaseHandleNow.handleName || 'handle'}</span>, {vaseHandleNow.around}° round, {vaseHandleNow.topDrop} mm below the rim{' '}
                      <Link href="/" className="underline hover:text-[var(--text-primary)]">Vase tab ▸</Link>
                    </p>
                    {handleTabDiffers && (
                      <button onClick={useHandleTabNow} data-use-handle-tab
                        className="w-full mb-2 text-xs px-2 py-1 rounded border border-amber-700 text-amber-200 hover:bg-amber-950/50"
                        title="The Handle tab's handle differs from the one on the vase. Copy it onto the vase (and so into this mold)">
                        Use the Handle tab&apos;s “{handleTabName}”
                      </button>
                    )}
                  </>
                ) : (
                  <p data-no-vase-handle className="text-[11px] text-[var(--text-secondary)] mb-1 leading-snug">
                    The vase has no handle. Turn one on on the Vase tab (Handle), then this mold casts it.{' '}
                    <Link href="/" className="underline hover:text-[var(--text-primary)]">Vase tab ▸</Link>
                  </p>
                )}
                {sl('castWallThickness', 'Cast Wall', 'mm', 'How thick you usually cast your slip pieces: the wall you let build up in the mold before you drain it. Nothing on your display changes when you move this, and the mold you print stays the same. It is only used to warn you (an amber note) when the handle is thicker than about twice this, because it may not fill solid before you drain')}
                {isHalves && sl('halvesRibSlot', 'Rib Slot', 'mm', 'A gap down the middle of each of the 3 pull-ribs in the handle\'s master. Squeezing the strap with pliers closes it, to start the master moving; to pull, grip both halves of a rib together. Ice water runs along the handle through it. 0 = solid ribs')}
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
              <Section title="Plaster & Seams" titleColor={GROUP_COLORS.smoothing} changedTip={CHANGED_TIP}
                changed={any('plasterThickness', 'seamAngle', 'halvesSeatDepth', 'halvesFitClearance', 'thirdsPlateFloor', 'thirdsWallThickness', 'thirdsFlangeWidth')} tooltip="Each piece is poured on its own: the master sits in a pocket in a V-shaped plate, and two walls clip on round it. After the plaster sets: walls off, plate off, then cold water into the master and lift it out">
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
              <Section title="Natches" titleColor={GROUP_COLORS.smoothing} changed={any('natchDiameter', 'natchHeight')} changedTip={CHANGED_TIP} tooltip="Two per seam, so neighbouring pieces only go together one way. Each piece has bumps on one parting face and dimples on the other, so any piece mates with the next">
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
          <Section title={isPourClip ? 'Shell' : 'Cottle'} titleColor={GROUP_COLORS.smoothing} changedTip={CHANGED_TIP}
            changed={any('plasterThickness', 'cottleWallThickness', 'cottleDraftAngle', mold.style === 'pourTwoPiece' && 'shellGrabHeight',
              mold.style !== 'pourThreePiece' && 'airHoleEnabled', mold.style !== 'pourThreePiece' && params.airHoleEnabled && 'airHoleDiameter')}>
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
              <Toggle label="Air Hole" checked={params.airHoleEnabled} onChange={(v) => setParam('airHoleEnabled', v)} after={onOff('airHoleEnabled')} tooltip="Hole through the cottle floor center — lets air in behind the plaster block so suction doesn't fight you when pulling it out" />
            )}
            {(mold.style === 'onePiece' || mold.style === 'pourTwoPiece') && (
              <Toggle label="Air Holes (4)" checked={params.airHoleEnabled} onChange={(v) => setParam('airHoleEnabled', v)} after={onOff('airHoleEnabled')} tooltip={mold.style === 'pourTwoPiece'
                ? 'Four round holes through the plaster-floor ring (tape or clay them over while pouring) — break the suction, inject compressed air, or push rods through to eject'
                : 'Four holes through the floor ring (tape or clay them over while pouring) — break the suction when pulling the plaster block, or inject compressed air / push rods through to eject'} />
            )}
            {mold.style !== 'pourThreePiece' && params.airHoleEnabled && sl('airHoleDiameter', 'Diameter', 'mm', mold.style === 'twoPart' ? 'Diameter of the air-relief hole' : 'Approximate size of each of the four air-relief holes')}
          </Section>
          </>}
          {(mold.style === 'pourTwoPiece' || mold.style === 'pourThreePiece') && (
            <Section title="Foot Flange" titleColor={GROUP_COLORS.smoothing} changedTip={CHANGED_TIP}
              changed={any('flangeOverlap', 'footFlangeThickness', 'notchHeight', 'notchWidth', 'notchClearance', 'flangeLip')} tooltip="Where the center piece and shell binder-clip together. The three V ridges and their grooves are the same seal as the handle mold, which poured leak-free">
              {sl('flangeOverlap', 'Overlap', 'mm', 'How far both flanges extend beyond the shell wall — the binder-clip grab zone, containing all three V rings')}
              {sl('footFlangeThickness', 'Thickness', 'mm', 'Thickness of EACH flange (clips clamp the doubled stack)')}
              {sl('notchHeight', 'V Height', 'mm', 'Height of the three V ridge rings on the center flange (clamped so the groove can always swallow the ridge)')}
              {sl('notchWidth', 'V Width', 'mm', 'Base width of each V ridge (clamped so adjacent grooves cannot run into each other)')}
              {sl('notchClearance', 'V Fit', 'mm', 'Groove oversize around each V so the shell seats — tune to your printer. A loose V still seals')}
              {sl('flangeLip', 'Center Lip', 'mm', 'Exposed rim of the center flange beyond the shell flange — press down here while pulling the shell up')}
            </Section>
          )}
          {mold.style === 'pourThreePiece' && (
            <Section title="Split Cottle" titleColor={GROUP_COLORS.smoothing} changed={any('seamAngle', 'seamFinWidth', 'roundShell')} changedTip={CHANGED_TIP} tooltip="The vertical split that turns the shell into two clip-together halves">
              {sl('seamAngle', 'Seam Angle', '°', 'Where the vertical split runs. Put it on a flat part of the cross-section rather than a corner — a seam block at a sharp corner has to lie in the plane bisecting it')}
              {sl('seamFinWidth', 'Seam Block', 'mm', 'How far each half is solid back from the split plane, carrying the vertical Vs. Clips grab both blocks, so they clamp twice this')}
              <Toggle
                label="Round Shell"
                checked={params.roundShell}
                onChange={(v) => setParam('roundShell', v)}
                after={onOff('roundShell')}
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
          <Section title="Plaster Estimate" titleColor={GROUP_COLORS.settings} changed={any('material')} changedTip={CHANGED_TIP}>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Material{dot('material', PLASTER_MATERIALS[def.material].label)}</label>
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
                <StatRow label="Well wall" value={`${mold.wallStats.sizeX.toFixed(0)} x ${mold.wallStats.sizeY.toFixed(0)} x ${mold.wallStats.sizeZ.toFixed(0)} mm`} tooltip="L-shaped, so it can also go diagonally on the bed" />
                <StatRow label="Base wall" value={`${mold.baseWallStats.sizeX.toFixed(0)} x ${mold.baseWallStats.sizeY.toFixed(0)} x ${mold.baseWallStats.sizeZ.toFixed(0)} mm`} />
                <StatRow label="Plastic" value={`${((mold.masterStats.volumeMm3 + mold.plateStats.volumeMm3 + mold.wallStats.volumeMm3 + mold.baseWallStats.volumeMm3) / 1000).toFixed(0)} cm³ per half`} tooltip="Master + plate + both walls. Before supports" />
                <StatRow label="Master STL" value={stlSize(mold.masterStats.triangleCount)} tooltip="Triangle count and approximate binary STL size, each master" />
                {mold.foot && (
                  <>
                    <StatRow label="Plug disk" value={`${mold.foot.plateStats.sizeX.toFixed(0)} x ${mold.foot.plateStats.sizeY.toFixed(0)} x ${mold.foot.plateStats.sizeZ.toFixed(0)} mm`} tooltip="The plug cup's bottom disk" />
                    <StatRow label="Plug wall" value={`${mold.foot.wallStats.sizeX.toFixed(0)} x ${mold.foot.wallStats.sizeY.toFixed(0)} x ${mold.foot.wallStats.sizeZ.toFixed(0)} mm`} tooltip="Each plug cup wall, standing on its ledge" />
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

/**
 * The foot and the mark are set on the Vase tab (Foot & Mark) since
 * 2026-10-26; the Mold tab only says what they are and where to change them.
 * `where`: the plug disk (Halves / Thirds) or a style's master.
 */
function VaseBottomNote({ where }: { where: 'plug' | 'master' }) {
  const b = useVaseStore((s) => s.params.bottom);
  if (!b) return null;
  const foot = b.footOn
    ? `Foot: ${b.footWidth} mm ring, ${b.footSlopeWidth} mm slope, ${b.footHeight} mm recess${b.footSmoothInner ? ', smooth inside' : ''}.`
    : 'Foot: off — a flat bottom.';
  const mark = !b.markOn ? null
    : where === 'plug'
      ? `Mark: ${b.markName || 'mark'}, ${b.markStyle} ${b.markDepth} mm, on the plug disk.`
      : `Mark: ${b.markName || 'mark'}, ${b.markStyle} ${b.markDepth} mm, on the master's bottom.`;
  return (
    <div className="text-[11px] text-[var(--text-secondary)] mt-1 mb-1 leading-snug">
      <p>{foot}{mark && <><br />{mark}</>}</p>
      <p className="mt-0.5">Set on the Vase tab, Foot &amp; Mark. <Link href="/" className="underline hover:text-[var(--text-primary)]">Vase ▸</Link></p>
    </div>
  );
}
