'use client';

/**
 * Side view of the finished mug with the handle on it — what HandleMaker's main
 * window shows while Show Mug is on. The mug stands upright at true size and
 * the handle is placed exactly as the Split 2-Pc mold will place it (same
 * placement function), so Sher can judge proportions the way she does when she
 * draws them by hand, while still editing in the profile editor.
 *
 * The profile is the vase cut through the handle's plane (the Split Angle), in
 * FINISHED mm — no shrink. The handle is drawn under the mug body, so the part
 * buried in the wall disappears into it the way it will in clay.
 *
 * Zoom: the mouse wheel zooms about the cursor and dragging pans. Once zoomed
 * the view holds a fixed screen scale (px per mm) instead of re-fitting, so a
 * mug zoomed to roughly real size STAYS real size while the handle is edited —
 * that is the point of zooming here. The scale is remembered per browser; Fit
 * returns to the automatic framing.
 */

import { useEffect, useRef, useState } from 'react';
import { useMugPlacement } from '@/hooks/use-mug-placement';
import type { P2 } from '@/engine/handle/mesh3';
import { outlineAt } from '@/engine/mold/split-handle';

const BG = '#1c1e22';
const CLAY = '#d9cfc0';
const CLAY_EDGE = '#8a7f70';
const PAD = 12; // mm round the drawing
const ZOOM_KEY = 'vasemaker-mug-view-zoom';
const MIN_PX_PER_MM = 0.5, MAX_PX_PER_MM = 40;

/** A zoomed view: screen scale plus the drawing point (SVG units) at the window centre. */
interface Zoom { pxPerMm: number; cx: number; cy: number }

function loadScale(): number | null {
  try {
    const v = parseFloat(localStorage.getItem(ZOOM_KEY) ?? '');
    return v >= MIN_PX_PER_MM && v <= MAX_PX_PER_MM ? v : null;
  } catch { return null; }
}
function saveScale(v: number | null) {
  try {
    if (v === null) localStorage.removeItem(ZOOM_KEY);
    else localStorage.setItem(ZOOM_KEY, v.toFixed(4));
  } catch { /* storage unavailable — zoom just isn't remembered */ }
}

export function MugSideView() {
  const m = useMugPlacement();
  // A callback ref (state, not useRef): the view renders nothing until the mug
  // outline exists, so a plain ref is still null when the effects first run and
  // they would never attach.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<Zoom | null>(null);
  // Latest view for the native wheel listener and the drag handlers.
  const viewRef = useRef<{ x: number; y: number; ppm: number; fitCx: number; fitCy: number } | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    const el = box;
    if (!el) return;
    // Measure now as well: ResizeObserver only reports on a rendered frame.
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);

  // Wheel = zoom about the cursor. Native listener: React's onWheel is passive,
  // and without preventDefault a trackpad pinch (ctrl+wheel) zooms the page.
  useEffect(() => {
    const el = box;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      if (!v) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const px = v.x + mx / v.ppm, py = v.y + my / v.ppm; // drawing point under the cursor
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const ppm = Math.min(MAX_PX_PER_MM, Math.max(MIN_PX_PER_MM, v.ppm * k));
      setZoom({ pxPerMm: ppm, cx: px - (mx - r.width / 2) / ppm, cy: py - (my - r.height / 2) / ppm });
      saveScale(ppm);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [box]);

  const outline = m.outline;
  const sil = outline?.sil ?? [], silFar = outline?.silFar ?? [];

  // Mug body: the handle side to the right (+u), the far side mirrored left.
  const body: P2[] = [
    [0, 0],
    ...sil.map(([z, u]): P2 => [u, z]),
    ...silFar.slice().reverse().map(([z, u]): P2 => [-u, z]),
  ];
  const strap = m.strap?.map(([z, u]): P2 => [u, z]) ?? null;
  const center = m.centerline.map(([z, u]): P2 => [u, z]);

  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [...body, ...(strap ?? [])]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  // Automatic framing (SVG y = −z).
  const fitW = x1 - x0 + 2 * PAD, fitH = y1 + 2 * PAD;
  const fitCx = (x0 + x1) / 2, fitCy = -y1 / 2;
  const W = size.w || 1, H = size.h || 1;
  const fitPpm = Math.min(W / fitW, H / fitH);

  // A remembered scale comes back centred on the mug.
  useEffect(() => {
    if (restored.current || !outline || !size.w) return;
    restored.current = true;
    const s = loadScale();
    if (s) setZoom({ pxPerMm: s, cx: fitCx, cy: fitCy });
  }, [outline, size.w, fitCx, fitCy]);

  if (!outline) return null;

  const ppm = zoom?.pxPerMm ?? fitPpm;
  const cx = zoom?.cx ?? fitCx, cy = zoom?.cy ?? fitCy;
  const vbW = W / ppm, vbH = H / ppm;
  const vbX = cx - vbW / 2, vbY = cy - vbH / 2;
  viewRef.current = { x: vbX, y: vbY, ppm, fitCx, fitCy };

  const pts = (p: P2[]) => p.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join(' ');

  // How far the handle reaches beyond the mug, measured level with each point.
  let reach = 0;
  if (strap) for (const [x, y] of strap) reach = Math.max(reach, x - outlineAt(sil, y));
  const gridX: number[] = [], gridY: number[] = [];
  for (let g = Math.ceil(vbX / 10) * 10; g <= vbX + vbW; g += 10) gridX.push(g);
  for (let g = Math.ceil(-(vbY + vbH) / 10) * 10; g <= -vbY; g += 10) gridY.push(g);
  const pl = m.placement;
  const sw = 1 / ppm; // one screen pixel, in mm

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, cx, cy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setZoom({ pxPerMm: ppm, cx: d.cx - (e.clientX - d.x) / ppm, cy: d.cy - (e.clientY - d.y) / ppm });
  };
  const onPointerUp = () => { drag.current = null; };
  const fit = () => { setZoom(null); saveScale(null); };

  return (
    <div ref={setBox} className="relative w-full h-full overflow-hidden select-none"
      style={{ background: BG, cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onDoubleClick={fit}>
      <svg className="absolute inset-0 w-full h-full" viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}>
        {gridX.map((g) => <line key={`gx${g}`} x1={g} y1={vbY} x2={g} y2={vbY + vbH} stroke="#2a2d33" strokeWidth={sw} />)}
        {gridY.map((g) => <line key={`gy${g}`} x1={vbX} y1={-g} x2={vbX + vbW} y2={-g} stroke="#2a2d33" strokeWidth={sw} />)}
        <line x1={vbX} y1={0} x2={vbX + vbW} y2={0} stroke="#4a4f58" strokeWidth={2 * sw} />
        {strap && <polygon points={pts(strap)} fill={CLAY} stroke={CLAY_EDGE} strokeWidth={2 * sw} strokeLinejoin="round" />}
        <polygon points={pts(body)} fill={CLAY} stroke={CLAY_EDGE} strokeWidth={2 * sw} strokeLinejoin="round" />
        {center.length > 1 && (
          <polyline points={pts(center)} fill="none" stroke="#e05555" strokeWidth={1.5 * sw} strokeDasharray={`${6 * sw} ${6 * sw}`} opacity={0.8} />
        )}
      </svg>

      {/* 10 mm scale bar, in screen pixels — hold a ruler to it to check real size. */}
      <div className="absolute bottom-3 left-3 text-[10px]" style={{ color: '#9aa3ad' }}>
        <div style={{ width: 10 * ppm, height: 6, borderLeft: '1.5px solid', borderRight: '1.5px solid', borderBottom: '1.5px solid' }} />
        <div className="mt-0.5">10 mm</div>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-2 text-[11px]" onPointerDown={(e) => e.stopPropagation()}>
        <span style={{ color: '#9aa3ad' }}>{zoom ? `${ppm.toFixed(2)} px/mm` : 'Auto fit'}</span>
        <button onClick={fit} disabled={!zoom} title="Frame the whole mug again (or double-click the view)"
          className="px-2 py-0.5 rounded border border-[#4a4f58] text-[#c9ced6] hover:border-[#9aa3ad] disabled:opacity-40"
          style={{ backgroundColor: 'rgba(28, 30, 34, 0.85)' }}>Fit</button>
      </div>

      <div className="absolute bottom-3 right-3 text-xs leading-relaxed px-3 py-2 rounded pointer-events-none"
        style={{ backgroundColor: 'rgba(28, 30, 34, 0.85)', color: '#c9ced6' }}>
        <div className="font-semibold mb-0.5">Finished mug, side view</div>
        <div>Mug {outline.rimZ.toFixed(0)} mm tall</div>
        {pl && <>
          <div>Handle top {pl.T[0].toFixed(0)} mm up ({m.topDrop} below the rim)</div>
          <div>Handle bottom {pl.B[0].toFixed(0)} mm up · ends {pl.span.toFixed(0)} mm apart</div>
          <div>Reaches {reach.toFixed(0)} mm out from the mug</div>
        </>}
        <div className="mt-1 opacity-70">Cut through the handle at Split Angle {m.seamAngle}° · grid 10 mm</div>
        <div className="opacity-70">Scroll to zoom · drag to move · double-click to fit</div>
        <div className="opacity-70">Turn off Show Mug for the 3-D mold view</div>
      </div>

      {m.error && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 text-sm text-red-400 px-3 py-2 rounded max-w-md text-center pointer-events-none"
          style={{ backgroundColor: 'rgba(28, 30, 34, 0.9)' }}>
          {m.error}
        </div>
      )}
    </div>
  );
}
