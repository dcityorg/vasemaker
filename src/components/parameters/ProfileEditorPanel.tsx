'use client';

/**
 * A large, floating copy of the Profile curve editor, for tight curves where
 * the sidebar's 260 px chart crowds the control points together.
 *
 * Deliberately NOT a modal: it floats over the 3-D view, so the vase updates
 * beside it while you edit. Drag it by the title bar, resize it from the
 * bottom-right corner; its size and position are remembered per browser. It
 * edits the same store as the sidebar chart, so the two stay in step and undo
 * covers both.
 *
 * X range: the vase profile's x is a radius multiple on 0–5, but most designs
 * live between about 0.5 and 2, so the full range spends most of the width on
 * empty space. "Fit X" narrows the axis to just past the widest point; "0–5"
 * puts it back. The fit is taken when clicked and then held still — a range
 * that followed the points would run away from the cursor while you dragged.
 * Points can't be dragged past the visible range, so widen it to go further.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BezierCurveEditor, EDITOR_CHROME } from './BezierCurveEditor';
import type { BezierPoint, CurvePointType } from '@/engine/types';

const GEOM_KEY = 'vasemaker-profile-panel';
const TITLE_H = 32;
const FOOT_H = 34; // the readout row under the chart
const MIN_W = 320, MIN_H = 300;
const FULL_X: [number, number] = [0, 5];

interface Geom { x: number; y: number; w: number; h: number }

function loadGeom(): Geom | null {
  try {
    const g = JSON.parse(localStorage.getItem(GEOM_KEY) ?? 'null');
    return g && [g.x, g.y, g.w, g.h].every((n) => typeof n === 'number') ? g : null;
  } catch { return null; }
}
function saveGeom(g: Geom) {
  try { localStorage.setItem(GEOM_KEY, JSON.stringify(g)); } catch { /* not remembered */ }
}
/** Keep the panel on screen (the window may have shrunk since it was saved). */
function clampGeom(g: Geom): Geom {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.max(MIN_W, Math.min(g.w, vw - 16));
  const h = Math.max(MIN_H, Math.min(g.h, vh - 16));
  return { w, h, x: Math.max(8, Math.min(g.x, vw - w - 8)), y: Math.max(8, Math.min(g.y, vh - h - 8)) };
}

export function ProfileEditorPanel({
  points, pointTypes, onPointChange, onPointAdd, onPointRemove, onPointTypeToggle, onClose,
}: {
  points: BezierPoint[];
  pointTypes: CurvePointType[];
  onPointChange: (i: number, p: BezierPoint) => void;
  onPointAdd: (p: BezierPoint) => void;
  onPointRemove: (i: number) => void;
  onPointTypeToggle: (i: number) => void;
  onClose: () => void;
}) {
  const [geom, setGeom] = useState<Geom | null>(null);
  const [xRange, setXRange] = useState<[number, number]>(FULL_X);
  const op = useRef<{ kind: 'move' | 'size'; px: number; py: number; g: Geom } | null>(null);

  useEffect(() => {
    // Default: most of the window, leaving the sidebar (left) visible.
    const vw = window.innerWidth, vh = window.innerHeight;
    setGeom(clampGeom(loadGeom() ?? { x: 340, y: 40, w: Math.min(700, vw - 360), h: vh - 80 }));
    const onResize = () => setGeom((g) => (g ? clampGeom(g) : g));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!geom) return null;

  const begin = (kind: 'move' | 'size') => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    op.current = { kind, px: e.clientX, py: e.clientY, g: geom };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const o = op.current;
    if (!o) return;
    const dx = e.clientX - o.px, dy = e.clientY - o.py;
    setGeom(clampGeom(o.kind === 'move'
      ? { ...o.g, x: o.g.x + dx, y: o.g.y + dy }
      : { ...o.g, w: o.g.w + dx, h: o.g.h + dy }));
  };
  const end = () => {
    if (op.current) saveGeom(geom);
    op.current = null;
  };

  const fitX = () => {
    const maxX = Math.max(...points.map((p) => p[0]));
    // Half-unit steps, with room past the widest point to drag outward.
    setXRange([0, Math.min(5, Math.max(1, Math.ceil((maxX * 1.15 + 0.1) * 2) / 2))]);
  };
  const full = xRange[1] === FULL_X[1];
  const btn = 'text-xs px-2 py-0.5 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] disabled:opacity-40';

  return createPortal(
    <div
      className="fixed z-50 flex flex-col rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl"
      style={{ left: geom.x, top: geom.y, width: geom.w, height: geom.h }}
    >
      <div
        className="flex items-center gap-2 px-3 border-b border-[var(--border-color)] cursor-move select-none shrink-0"
        style={{ height: TITLE_H }}
        onPointerDown={begin('move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      >
        <span className="text-sm font-semibold text-[var(--text-primary)]">Profile</span>
        <span className="text-[11px] text-[var(--text-secondary)] opacity-70 truncate">
          ⌘↑ / ⌘↓ step points · arrows nudge
        </span>
        <span className="flex-1" />
        <div className="flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <button className={btn} onClick={fitX} title="Narrow the X axis to just past the widest point, so the curve fills the width">Fit X</button>
          <button className={btn} onClick={() => setXRange(FULL_X)} disabled={full} title="Show the full X range (0–5)">0–5</button>
          <button className={btn} onClick={onClose} title="Close the large editor">✕</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 p-2">
        <BezierCurveEditor
          points={points}
          onPointChange={onPointChange}
          onPointAdd={onPointAdd}
          onPointRemove={onPointRemove}
          pointTypes={pointTypes}
          onPointTypeToggle={onPointTypeToggle}
          xRange={xRange}
          yRange={[0, 1]}
          xLabel="Radius Multiplier"
          width={geom.w - 16}
          height={Math.max(EDITOR_CHROME.y + 40, geom.h - TITLE_H - FOOT_H - 16)}
          showReadout
        />
      </div>
      <div
        className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize"
        style={{ background: 'linear-gradient(135deg, transparent 50%, var(--border-color) 50%)', borderBottomRightRadius: 8 }}
        title="Drag to resize"
        onPointerDown={begin('size')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      />
    </div>,
    document.body,
  );
}
