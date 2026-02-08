'use client';

import { useVaseStore } from '@/store/vase-store';
import type { ShapeType } from '@/engine/types';
import {
  SHAPE_OPTIONS, SHAPE_PARAM_CONFIG, UNIVERSAL_PARAMS,
  DIMENSIONS, SHELL, RADIAL_RIPPLE, VERTICAL_RIPPLE, BEZIER_TWIST,
  SINE_TWIST, VERTICAL_SMOOTHING, RADIAL_SMOOTHING, BEZIER_OFFSET,
} from '@/config/shape-params';
import type { BezierPoint } from '@/engine/types';
import { BezierCurveEditor } from './BezierCurveEditor';

/** Reusable slider row */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5 accent-[var(--accent)]"
      />
      <span className="text-xs text-[var(--text-secondary)] w-12 text-right tabular-nums">
        {value}
      </span>
    </div>
  );
}

/** Collapsible section wrapper */
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="mb-4">
      <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] py-2 px-3 bg-[var(--bg-secondary)] rounded select-none hover:bg-[var(--border-color)] transition-colors">
        {title}
      </summary>
      <div className="pt-3 px-1">
        {children}
      </div>
    </details>
  );
}

/** Toggle switch */
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-colors relative ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

/** Shape parameter sliders for a specific shape (bottom or top) */
function ShapeParamControls({ shape, isTop }: { shape: ShapeType; isTop: boolean }) {
  const shapeParams = useVaseStore((s) =>
    isTop ? s.params.topShapeParams[shape] : s.params.bottomShapeParams[shape]
  );
  const { setBottomShapeParam, setTopShapeParam } = useVaseStore();
  const setParam = isTop ? setTopShapeParam : setBottomShapeParam;
  const specificParams = SHAPE_PARAM_CONFIG[shape];

  return (
    <div className="ml-2 mt-1 mb-2">
      {specificParams && specificParams.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1 px-1">Shape Params</div>
          {specificParams.map((spec) => (
            <SliderRow
              key={spec.key}
              label={spec.label}
              value={(shapeParams[spec.key] as number) ?? 0}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              onChange={(v) => setParam(shape, spec.key, v)}
            />
          ))}
        </div>
      )}
      <div>
        <div className="text-xs font-medium text-[var(--text-secondary)] mb-1 px-1">Transform</div>
        {UNIVERSAL_PARAMS.map((spec) => (
          <SliderRow
            key={spec.key}
            label={spec.label}
            value={(shapeParams[spec.key] as number) ?? 0}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            onChange={(v) => setParam(shape, spec.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

/** Convert scalar array (evenly spaced heights) → BezierPoint[] for curve editor */
function scalarsToPoints(values: number[]): BezierPoint[] {
  return values.map((v, i) => [v, values.length > 1 ? i / (values.length - 1) : 0]);
}

/** Extract one axis from offset [x,y][] pairs → BezierPoint[] (evenly spaced heights) */
function offsetAxisToPoints(points: [number, number][], axis: 0 | 1): BezierPoint[] {
  return points.map((p, i) => [p[axis], points.length > 1 ? i / (points.length - 1) : 0]);
}

export function DimensionControls() {
  const params = useVaseStore((s) => s.params);
  const {
    setRadius, setHeight, setProfileEnabled, setProfilePoint, addProfilePoint, removeProfilePoint,
    setBottomShape, setTopShape, setMorphEnabled,
    setRadialRipple, setVerticalRipple, setBezierTwist, setBezierTwistPoint,
    addBezierTwistPoint, removeBezierTwistPoint, setSineTwist,
    setVerticalSmoothing, setRadialSmoothing,
    setBezierOffset, setBezierOffsetPointX, setBezierOffsetPointY,
    addBezierOffsetPoint, removeBezierOffsetPoint,
    setWallThickness, setBottomThickness, setRimShape,
  } = useVaseStore();

  return (
    <>
      <Section title="Dimensions">
        <SliderRow label="Radius" value={params.radius} {...DIMENSIONS.radius} onChange={setRadius} />
        <SliderRow label="Height" value={params.height} {...DIMENSIONS.height} onChange={setHeight} />
      </Section>

      <Section title="Shell">
        <SliderRow label="Wall" value={params.wallThickness} {...SHELL.wallThickness} onChange={setWallThickness} />
        <SliderRow label="Base" value={params.bottomThickness} {...SHELL.bottomThickness} onChange={setBottomThickness} />
        {params.wallThickness > 0 && (
          <div className="flex items-center gap-3 mb-2">
            <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Rim</label>
            <div className="flex gap-3">
              {(['flat', 'rounded'] as const).map((shape) => (
                <label key={shape} className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="radio"
                    name="rimShape"
                    checked={params.rimShape === shape}
                    onChange={() => setRimShape(shape)}
                    className="accent-[var(--accent)]"
                  />
                  {shape.charAt(0).toUpperCase() + shape.slice(1)}
                </label>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Profile">
        <Toggle label="Enabled" checked={params.profileEnabled} onChange={setProfileEnabled} />
        {params.profileEnabled && (
          <>
            <BezierCurveEditor
              points={params.profilePoints}
              onPointChange={setProfilePoint}
              onPointAdd={addProfilePoint}
              onPointRemove={removeProfilePoint}
              xRange={[0, 3]}
              yRange={[0, 1]}
              xLabel="Radius Multiplier"
            />
            <div className="text-xs text-[var(--text-secondary)] mt-1 px-1 opacity-60">
              Double-click to add. Right-click to remove.
            </div>
          </>
        )}
      </Section>

      <Section title="Shape">
        <div className="flex items-center gap-3 mb-2">
          <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Bottom</label>
          <select
            value={params.bottomShape}
            onChange={(e) => setBottomShape(e.target.value as ShapeType)}
            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
          >
            {SHAPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <ShapeParamControls shape={params.bottomShape} isTop={false} />

        <Toggle label="Morph" checked={params.morphEnabled} onChange={setMorphEnabled} />

        {params.morphEnabled && (
          <>
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Top</label>
              <select
                value={params.topShape}
                onChange={(e) => setTopShape(e.target.value as ShapeType)}
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-sm text-[var(--text-primary)]"
              >
                {SHAPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <ShapeParamControls shape={params.topShape} isTop={true} />
          </>
        )}
      </Section>

      <Section title="Radial Ripples" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.radialRipple.enabled} onChange={(v) => setRadialRipple({ enabled: v })} />
        {params.radialRipple.enabled && (
          <>
            <SliderRow label="Count" value={params.radialRipple.count} {...RADIAL_RIPPLE.count} onChange={(v) => setRadialRipple({ count: v })} />
            <SliderRow label="Depth" value={params.radialRipple.depth} {...RADIAL_RIPPLE.depth} onChange={(v) => setRadialRipple({ depth: v })} />
          </>
        )}
      </Section>

      <Section title="Vertical Ripples" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.verticalRipple.enabled} onChange={(v) => setVerticalRipple({ enabled: v })} />
        {params.verticalRipple.enabled && (
          <>
            <SliderRow label="Count" value={params.verticalRipple.count} {...VERTICAL_RIPPLE.count} onChange={(v) => setVerticalRipple({ count: v })} />
            <SliderRow label="Depth" value={params.verticalRipple.depth} {...VERTICAL_RIPPLE.depth} onChange={(v) => setVerticalRipple({ depth: v })} />
          </>
        )}
      </Section>

      <Section title="Custom Twist" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.bezierTwist.enabled} onChange={(v) => setBezierTwist({ enabled: v })} />
        {params.bezierTwist.enabled && (
          <>
            <BezierCurveEditor
              points={scalarsToPoints(params.bezierTwist.points)}
              onPointChange={(index, point) => {
                setBezierTwistPoint(index, Math.round(point[0]));
              }}
              onPointAdd={(point) => {
                // Find insertion index by height fraction
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
          </>
        )}
      </Section>

      <Section title="Sine Twist" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.sineTwist.enabled} onChange={(v) => setSineTwist({ enabled: v })} />
        {params.sineTwist.enabled && (
          <>
            <SliderRow label="Cycles" value={params.sineTwist.cycles} {...SINE_TWIST.cycles} onChange={(v) => setSineTwist({ cycles: v })} />
            <SliderRow label="Max Deg" value={params.sineTwist.maxDegrees} {...SINE_TWIST.maxDegrees} onChange={(v) => setSineTwist({ maxDegrees: v })} />
          </>
        )}
      </Section>

      <Section title="XY Sway" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.bezierOffset.enabled} onChange={(v) => setBezierOffset({ enabled: v })} />
        {params.bezierOffset.enabled && (
          <>
            <SliderRow label="Scale X" value={params.bezierOffset.scaleX} {...BEZIER_OFFSET.scaleX} onChange={(v) => setBezierOffset({ scaleX: v })} />
            <SliderRow label="Scale Y" value={params.bezierOffset.scaleY} {...BEZIER_OFFSET.scaleY} onChange={(v) => setBezierOffset({ scaleY: v })} />

            <div className="text-xs font-medium text-[var(--text-secondary)] mt-2 mb-1 px-1">Offset X</div>
            <BezierCurveEditor
              points={offsetAxisToPoints(params.bezierOffset.points, 0)}
              onPointChange={(index, point) => {
                setBezierOffsetPointX(index, Math.round(point[0] * 20) / 20);
              }}
              onPointAdd={(point) => {
                const h = point[1];
                const pts = params.bezierOffset.points;
                let afterIdx = pts.length - 1;
                for (let i = 0; i < pts.length - 1; i++) {
                  const hI = pts.length > 1 ? i / (pts.length - 1) : 0;
                  const hNext = pts.length > 1 ? (i + 1) / (pts.length - 1) : 0;
                  if (h >= hI && h <= hNext) { afterIdx = i; break; }
                }
                addBezierOffsetPoint(afterIdx);
              }}
              onPointRemove={removeBezierOffsetPoint}
              xRange={[-1, 1]}
              yRange={[0, 1]}
              xLabel="X Offset"
            />

            <div className="text-xs font-medium text-[var(--text-secondary)] mt-2 mb-1 px-1">Offset Y</div>
            <BezierCurveEditor
              points={offsetAxisToPoints(params.bezierOffset.points, 1)}
              onPointChange={(index, point) => {
                setBezierOffsetPointY(index, Math.round(point[0] * 20) / 20);
              }}
              onPointAdd={(point) => {
                const h = point[1];
                const pts = params.bezierOffset.points;
                let afterIdx = pts.length - 1;
                for (let i = 0; i < pts.length - 1; i++) {
                  const hI = pts.length > 1 ? i / (pts.length - 1) : 0;
                  const hNext = pts.length > 1 ? (i + 1) / (pts.length - 1) : 0;
                  if (h >= hI && h <= hNext) { afterIdx = i; break; }
                }
                addBezierOffsetPoint(afterIdx);
              }}
              onPointRemove={removeBezierOffsetPoint}
              xRange={[-1, 1]}
              yRange={[0, 1]}
              xLabel="Y Offset"
            />
            <div className="text-xs text-[var(--text-secondary)] mt-1 px-1 opacity-60">
              Drag left/right to set offset. Scale sliders amplify the effect.
            </div>
          </>
        )}
      </Section>

      <Section title="Vertical Smoothing" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.verticalSmoothing.enabled} onChange={(v) => setVerticalSmoothing({ enabled: v })} />
        {params.verticalSmoothing.enabled && (
          <>
            <SliderRow label="Cycles" value={params.verticalSmoothing.cycles} {...VERTICAL_SMOOTHING.cycles} onChange={(v) => setVerticalSmoothing({ cycles: v })} />
            <SliderRow label="Start %" value={params.verticalSmoothing.startPercent} {...VERTICAL_SMOOTHING.startPercent} onChange={(v) => setVerticalSmoothing({ startPercent: v })} />
          </>
        )}
      </Section>

      <Section title="Radial Smoothing" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.radialSmoothing.enabled} onChange={(v) => setRadialSmoothing({ enabled: v })} />
        {params.radialSmoothing.enabled && (
          <>
            <SliderRow label="Cycles" value={params.radialSmoothing.cycles} {...RADIAL_SMOOTHING.cycles} onChange={(v) => setRadialSmoothing({ cycles: v })} />
            <SliderRow label="Offset" value={params.radialSmoothing.offsetAngle} {...RADIAL_SMOOTHING.offsetAngle} onChange={(v) => setRadialSmoothing({ offsetAngle: v })} />
          </>
        )}
      </Section>
    </>
  );
}
