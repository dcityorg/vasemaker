'use client';

/**
 * Top-down diagram for the Split 2-Pc mold: one slice of the vase, the split
 * line, and where the handle attaches. Answers "is the handle on a lobe or in a
 * groove?" at a glance, which the 3-D view makes hard on a gently shaped vase
 * (Gary, 2026-10-09: four 2 mm flutes on a 40 mm tumbler).
 *
 * Looking DOWN on the vase: world +x to the right, +y up the drawing, so 0° is
 * at three o'clock and angles run counter-clockwise, as Split Angle does.
 */

import { useMemo } from 'react';
import type { VaseParameters } from '@/engine/types';
import { vaseSliceForDiagram } from '@/engine/mold/split-handle';

const SIZE = 150;

export function SplitTopView({ vase, keepTexture, seamAngle, handleOn, zFrac }: {
  vase: VaseParameters; keepTexture: boolean; seamAngle: number; handleOn: boolean; zFrac: number;
}) {
  const slice = useMemo(() => vaseSliceForDiagram(vase, keepTexture, zFrac), [vase, keepTexture, zFrac]);
  let rMax = 1;
  for (const [x, y] of slice) rMax = Math.max(rMax, Math.hypot(x, y));
  const c = SIZE / 2;
  const k = (SIZE / 2 - 22) / rMax;               // leave room for the handle stub
  const X = (x: number) => c + x * k, Y = (y: number) => c - y * k;
  const path = slice.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ') + ' Z';

  const a = (seamAngle * Math.PI) / 180;
  const sx = Math.cos(a), sy = Math.sin(a);
  const L = rMax + 14;
  // Where the outline crosses the +s ray — the handle's attachment side.
  let rEdge = rMax;
  for (let i = 0; i < slice.length; i++) {
    const [ax, ay] = slice[i], [bx, by] = slice[(i + 1) % slice.length];
    const ha = ax * -sy + ay * sx, hb = bx * -sy + by * sx;
    if ((ha <= 0) !== (hb <= 0)) {
      const f = ha / (ha - hb);
      const u = (ax + (bx - ax) * f) * sx + (ay + (by - ay) * f) * sy;
      if (u > 0) rEdge = u;
    }
  }

  return (
    <svg width={SIZE} height={SIZE} className="block mx-auto my-1" role="img"
      aria-label={`Top view: split at ${seamAngle} degrees`}>
      <title>Looking down on the vase. Dashed: the split line. 0° is to the right; Split Angle turns counter-clockwise.</title>
      <circle cx={c} cy={c} r={rMax * k} fill="none" stroke="var(--border-color)" strokeDasharray="2 3" />
      <line x1={c + rMax * k + 2} y1={c} x2={c + rMax * k + 8} y2={c} stroke="var(--text-secondary)" />
      <text x={SIZE - 2} y={c - 4} fontSize={9} textAnchor="end" fill="var(--text-secondary)">0°</text>
      <path d={path} fill="rgba(159,179,200,0.18)" stroke="#9fb3c8" strokeWidth={1.5} />
      <line x1={X(-L * sx)} y1={Y(-L * sy)} x2={X(L * sx)} y2={Y(L * sy)}
        stroke="var(--text-primary)" strokeWidth={1} strokeDasharray="5 3" />
      {handleOn && (
        <line x1={X(rEdge * sx)} y1={Y(rEdge * sy)} x2={X((rEdge + 13) * sx)} y2={Y((rEdge + 13) * sy)}
          stroke="#e05555" strokeWidth={5} strokeLinecap="round" />
      )}
    </svg>
  );
}
