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
 */

import { useMugPlacement } from '@/hooks/use-mug-placement';
import type { P2 } from '@/engine/handle/mesh3';
import { outlineAt } from '@/engine/mold/split-handle';

const BG = '#1c1e22';
const CLAY = '#d9cfc0';
const CLAY_EDGE = '#8a7f70';
const PAD = 12; // mm round the drawing

export function MugSideView() {
  const m = useMugPlacement();
  if (!m.outline) return null;
  const { sil, silFar, rimZ } = m.outline;

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
  const vbX = x0 - PAD, vbW = x1 - x0 + 2 * PAD;
  const vbY = -(y1 + PAD), vbH = y1 + 2 * PAD;   // y is flipped: SVG y = −z
  const pts = (p: P2[]) => p.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join(' ');

  // How far the handle reaches beyond the mug, measured level with each point.
  let reach = 0;
  if (strap) for (const [x, y] of strap) reach = Math.max(reach, x - outlineAt(sil, y));
  const gridX: number[] = [], gridY: number[] = [];
  // The SVG letterboxes to the window, so run the grid well past the viewBox
  // (it overflows visibly) rather than stopping at its edges.
  const G = 3 * Math.max(vbW, vbH);
  for (let g = Math.ceil((vbX - G) / 10) * 10; g <= vbX + vbW + G; g += 10) gridX.push(g);
  for (let g = Math.ceil((-G) / 10) * 10; g <= y1 + G; g += 10) gridY.push(g);
  const pl = m.placement;

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: BG }}>
      <svg className="w-full h-full overflow-visible" viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet">
        {gridX.map((g) => <line key={`gx${g}`} x1={g} y1={vbY - G} x2={g} y2={vbY + vbH + G} stroke="#2a2d33" strokeWidth={0.25} />)}
        {gridY.map((g) => <line key={`gy${g}`} x1={vbX - G} y1={-g} x2={vbX + vbW + G} y2={-g} stroke="#2a2d33" strokeWidth={0.25} />)}
        <line x1={vbX - G} y1={0} x2={vbX + vbW + G} y2={0} stroke="#4a4f58" strokeWidth={0.5} />
        {strap && <polygon points={pts(strap)} fill={CLAY} stroke={CLAY_EDGE} strokeWidth={0.5} strokeLinejoin="round" />}
        <polygon points={pts(body)} fill={CLAY} stroke={CLAY_EDGE} strokeWidth={0.5} strokeLinejoin="round" />
        {center.length > 1 && (
          <polyline points={pts(center)} fill="none" stroke="#e05555" strokeWidth={0.35} strokeDasharray="1.5 1.5" opacity={0.8} />
        )}
        {/* 10 mm scale bar */}
        <g transform={`translate(${vbX + 4}, ${-3})`}>
          <line x1={0} y1={0} x2={10} y2={0} stroke="#9aa3ad" strokeWidth={0.6} />
          <line x1={0} y1={-1} x2={0} y2={1} stroke="#9aa3ad" strokeWidth={0.6} />
          <line x1={10} y1={-1} x2={10} y2={1} stroke="#9aa3ad" strokeWidth={0.6} />
        </g>
      </svg>

      <div className="absolute bottom-3 right-3 text-xs leading-relaxed px-3 py-2 rounded"
        style={{ backgroundColor: 'rgba(28, 30, 34, 0.85)', color: '#c9ced6' }}>
        <div className="font-semibold mb-0.5">Finished mug, side view</div>
        <div>Mug {rimZ.toFixed(0)} mm tall</div>
        {pl && <>
          <div>Handle top {pl.T[0].toFixed(0)} mm up ({m.topDrop} below the rim)</div>
          <div>Handle bottom {pl.B[0].toFixed(0)} mm up · ends {pl.span.toFixed(0)} mm apart</div>
          <div>Reaches {reach.toFixed(0)} mm out from the mug</div>
        </>}
        <div className="mt-1 opacity-70">Cut through the handle at Split Angle {m.seamAngle}° · grid 10 mm · bar = 10 mm</div>
        <div className="opacity-70">Turn off Show Mug for the 3-D mold view</div>
      </div>

      {m.error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-red-400 px-3 py-2 rounded max-w-md text-center"
          style={{ backgroundColor: 'rgba(28, 30, 34, 0.9)' }}>
          {m.error}
        </div>
      )}
    </div>
  );
}
