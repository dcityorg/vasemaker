'use client';

import { useVaseStore } from '@/store/vase-store';
import { BEZIER_TWIST, SINE_TWIST } from '@/config/shape-params';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { BezierCurveEditor } from './BezierCurveEditor';
import { GROUP_COLORS } from '@/config/colors';
import { SliderRow, Section, GroupHeader } from './ui';

export function TwistControls() {
  const params = useVaseStore((s) => s.params);
  const {
    setBezierTwist, setBezierTwistPoint,
    addBezierTwistPoint, removeBezierTwistPoint, setBezierTwistPointType, setSineTwist,
  } = useVaseStore();

  const resetBezierTwist = () => setBezierTwist({
    points: DEFAULT_PARAMETERS.bezierTwist.points.map(p => [...p] as [number, number]),
    pointTypes: [...DEFAULT_PARAMETERS.bezierTwist.pointTypes],
  });
  const resetSineTwist = () => setSineTwist({ cycles: DEFAULT_PARAMETERS.sineTwist.cycles, maxDegrees: DEFAULT_PARAMETERS.sineTwist.maxDegrees });

  return (
    <>
      <GroupHeader label="Twist" color={GROUP_COLORS.twist} />

      <Section title="Custom Twist" defaultOpen={false} checked={params.bezierTwist.enabled} onToggle={(v) => setBezierTwist({ enabled: v })} tooltip="Bezier curve controlling twist angle at each height" titleColor={GROUP_COLORS.twist}>
        <div className="flex justify-end mb-1">
          <button onClick={resetBezierTwist} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <BezierCurveEditor
          points={params.bezierTwist.points}
          onPointChange={(index, point) => {
            setBezierTwistPoint(index, [Math.round(point[0] * 10) / 10, point[1]]);
          }}
          onPointAdd={(point) => addBezierTwistPoint([Math.round(point[0] * 10) / 10, point[1]])}
          onPointRemove={removeBezierTwistPoint}
          pointTypes={params.bezierTwist.pointTypes}
          onPointTypeToggle={(i) => setBezierTwistPointType(i, params.bezierTwist.pointTypes[i] === 'fixed' ? 'handle' : 'fixed')}
          xRange={[BEZIER_TWIST.point.min, BEZIER_TWIST.point.max]}
          yRange={[0, 1]}
          arrowStepX={1}
          xLabel="Twist (degrees)"
        />
        <div className="text-xs text-[var(--text-secondary)] mt-1 px-1 opacity-60">
          Drag/double-click/right-click as above. Shift-click toggles Fixed (□) / Handle (○). Click to select, then arrow keys nudge (Shift = ×5, Alt = fine). Alt-drag = fine; Shift-drag locks to one axis.
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
