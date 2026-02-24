'use client';

import { useVaseStore } from '@/store/vase-store';
import type { BezierPoint } from '@/engine/types';
import { BEZIER_TWIST, SINE_TWIST } from '@/config/shape-params';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { BezierCurveEditor } from './BezierCurveEditor';
import { GROUP_COLORS } from '@/config/colors';
import { SliderRow, Section, GroupHeader } from './ui';

/** Convert scalar array (evenly spaced heights) → BezierPoint[] for curve editor */
function scalarsToPoints(values: number[]): BezierPoint[] {
  return values.map((v, i) => [v, values.length > 1 ? i / (values.length - 1) : 0]);
}

export function TwistControls() {
  const params = useVaseStore((s) => s.params);
  const {
    setBezierTwist, setBezierTwistPoint,
    addBezierTwistPoint, removeBezierTwistPoint, setSineTwist,
  } = useVaseStore();

  const resetBezierTwist = () => setBezierTwist({ points: [...DEFAULT_PARAMETERS.bezierTwist.points] });
  const resetSineTwist = () => setSineTwist({ cycles: DEFAULT_PARAMETERS.sineTwist.cycles, maxDegrees: DEFAULT_PARAMETERS.sineTwist.maxDegrees });

  return (
    <>
      <GroupHeader label="Twist" color={GROUP_COLORS.twist} />

      <Section title="Custom Twist" defaultOpen={false} checked={params.bezierTwist.enabled} onToggle={(v) => setBezierTwist({ enabled: v })} tooltip="Bezier curve controlling twist angle at each height" titleColor={GROUP_COLORS.twist}>
        <div className="flex justify-end mb-1">
          <button onClick={resetBezierTwist} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <BezierCurveEditor
          points={scalarsToPoints(params.bezierTwist.points)}
          onPointChange={(index, point) => {
            setBezierTwistPoint(index, Math.round(point[0]));
          }}
          onPointAdd={(point) => {
            const h = point[1];
            const pts = params.bezierTwist.points;
            let afterIdx = pts.length - 1;
            for (let i = 0; i < pts.length - 1; i++) {
              const hI = pts.length > 1 ? i / (pts.length - 1) : 0;
              const hNext = pts.length > 1 ? (i + 1) / (pts.length - 1) : 0;
              if (h >= hI && h <= hNext) { afterIdx = i; break; }
            }
            addBezierTwistPoint(Math.round(point[0]), afterIdx);
          }}
          onPointRemove={removeBezierTwistPoint}
          xRange={[BEZIER_TWIST.point.min, BEZIER_TWIST.point.max]}
          yRange={[0, 1]}
          xLabel="Twist (degrees)"
        />
        <div className="text-xs text-[var(--text-secondary)] mt-1 px-1 opacity-60">
          Drag left/right to set twist. Double-click to add. Right-click to remove.
        </div>
      </Section>

      <Section title="Wave Twist" defaultOpen={false} checked={params.sineTwist.enabled} onToggle={(v) => setSineTwist({ enabled: v })} tooltip="Sinusoidal back-and-forth twist" titleColor={GROUP_COLORS.twist}>
        <div className="flex justify-end mb-1">
          <button onClick={resetSineTwist} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Cycles" value={params.sineTwist.cycles} {...SINE_TWIST.cycles} onChange={(v) => setSineTwist({ cycles: v })} tooltip="Number of back-and-forth twist cycles" />
        <SliderRow label="Max Deg" value={params.sineTwist.maxDegrees} {...SINE_TWIST.maxDegrees} onChange={(v) => setSineTwist({ maxDegrees: v })} tooltip="Maximum twist angle in degrees" />
      </Section>
    </>
  );
}
