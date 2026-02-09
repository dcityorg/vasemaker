'use client';

import { useVaseStore } from '@/store/vase-store';
import type { ShapeType } from '@/engine/types';
import {
  SHAPE_OPTIONS, SHAPE_PARAM_CONFIG,
  DIMENSIONS, SHELL, APPEARANCE, RESOLUTION, RADIAL_RIPPLE, VERTICAL_RIPPLE, BEZIER_TWIST,
  SINE_TWIST, VERTICAL_SMOOTHING, RADIAL_SMOOTHING, BEZIER_OFFSET,
} from '@/config/shape-params';
import type { BezierPoint } from '@/engine/types';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
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
function Section({ title, children, defaultOpen = true, active }: { title: string; children: React.ReactNode; defaultOpen?: boolean; active?: boolean }) {
  return (
    <details open={defaultOpen} className="mb-4">
      <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] py-2 px-3 bg-[var(--bg-secondary)] rounded select-none hover:bg-[var(--border-color)] transition-colors flex items-center gap-2">
        <span className="flex-1">{title}</span>
        {active && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
      </summary>
      <div className="pt-3 px-1">
        {children}
      </div>
    </details>
  );
}

/** Toggle switch with optional reset button */
function Toggle({ label, checked, onChange, onReset }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; onReset?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'
        }`}
      />
      {onReset && checked && (
        <button
          onClick={onReset}
          className="ml-auto text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
          title="Reset to defaults"
        >
          Reset
        </button>
      )}
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

  if (!specificParams || specificParams.length === 0) return null;

  return (
    <div className="ml-2 mt-1 mb-2">
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
    setColor, setResolution, setFlatShading,
  } = useVaseStore();

  // Reset helpers — patch specific param groups back to defaults
  const resetProfile = () => {
    useVaseStore.setState((s) => ({
      params: { ...s.params, profilePoints: [...DEFAULT_PARAMETERS.profilePoints.map(p => [...p] as BezierPoint)] },
    }));
  };
  const resetShape = () => {
    useVaseStore.setState((s) => ({
      params: {
        ...s.params,
        bottomShapeParams: { ...s.params.bottomShapeParams, [s.params.bottomShape]: { ...DEFAULT_PARAMETERS.bottomShapeParams[s.params.bottomShape] } },
        topShapeParams: { ...s.params.topShapeParams, [s.params.topShape]: { ...DEFAULT_PARAMETERS.topShapeParams[s.params.topShape] } },
      },
    }));
  };
  const resetRadialRipple = () => setRadialRipple({ count: DEFAULT_PARAMETERS.radialRipple.count, depth: DEFAULT_PARAMETERS.radialRipple.depth });
  const resetVerticalRipple = () => setVerticalRipple({ count: DEFAULT_PARAMETERS.verticalRipple.count, depth: DEFAULT_PARAMETERS.verticalRipple.depth });
  const resetBezierTwist = () => setBezierTwist({ points: [...DEFAULT_PARAMETERS.bezierTwist.points] });
  const resetSineTwist = () => setSineTwist({ cycles: DEFAULT_PARAMETERS.sineTwist.cycles, maxDegrees: DEFAULT_PARAMETERS.sineTwist.maxDegrees });
  const resetBezierOffset = () => setBezierOffset({
    scaleX: DEFAULT_PARAMETERS.bezierOffset.scaleX,
    scaleY: DEFAULT_PARAMETERS.bezierOffset.scaleY,
    points: DEFAULT_PARAMETERS.bezierOffset.points.map(p => [...p] as [number, number]),
  });
  const resetVerticalSmoothing = () => setVerticalSmoothing({ cycles: DEFAULT_PARAMETERS.verticalSmoothing.cycles, startPercent: DEFAULT_PARAMETERS.verticalSmoothing.startPercent });
  const resetRadialSmoothing = () => setRadialSmoothing({ cycles: DEFAULT_PARAMETERS.radialSmoothing.cycles, offsetAngle: DEFAULT_PARAMETERS.radialSmoothing.offsetAngle });

  return (
    <>
      <Section title="Appearance" active={params.color !== APPEARANCE.defaultColor}>
        <div className="flex items-center gap-3 mb-2">
          <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Color</label>
          <input
            type="color"
            value={params.color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-[var(--border-color)] bg-transparent p-0"
          />
          {params.color !== APPEARANCE.defaultColor && (
            <button
              onClick={() => setColor(APPEARANCE.defaultColor)}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
              title="Reset to default color"
            >
              Reset
            </button>
          )}
        </div>
      </Section>

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

      <Section title="Profile" active={params.profileEnabled}>
        <Toggle label="Enabled" checked={params.profileEnabled} onChange={setProfileEnabled} onReset={resetProfile} />
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

      <Section title="Shape" active={params.morphEnabled}>
        <div className="flex items-center gap-3 mb-2">
          <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0">Bottom</label>
          <select
            value={params.bottomShape}
            onChange={(e) => setBottomShape(e.target.value as ShapeType)}
            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-sm text-[var(--text-primary)] min-w-0"
          >
            {SHAPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={resetShape}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors shrink-0"
            title="Reset shape params to defaults"
          >
            Reset
          </button>
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

      <Section title="Radial Ripples" defaultOpen={false} active={params.radialRipple.enabled}>
        <Toggle label="Enabled" checked={params.radialRipple.enabled} onChange={(v) => setRadialRipple({ enabled: v })} onReset={resetRadialRipple} />
        {params.radialRipple.enabled && (
          <>
            <SliderRow label="Count" value={params.radialRipple.count} {...RADIAL_RIPPLE.count} onChange={(v) => setRadialRipple({ count: v })} />
            <SliderRow label="Depth" value={params.radialRipple.depth} {...RADIAL_RIPPLE.depth} onChange={(v) => setRadialRipple({ depth: v })} />
          </>
        )}
      </Section>

      <Section title="Vertical Ripples" defaultOpen={false} active={params.verticalRipple.enabled}>
        <Toggle label="Enabled" checked={params.verticalRipple.enabled} onChange={(v) => setVerticalRipple({ enabled: v })} onReset={resetVerticalRipple} />
        {params.verticalRipple.enabled && (
          <>
            <SliderRow label="Count" value={params.verticalRipple.count} {...VERTICAL_RIPPLE.count} onChange={(v) => setVerticalRipple({ count: v })} />
            <SliderRow label="Depth" value={params.verticalRipple.depth} {...VERTICAL_RIPPLE.depth} onChange={(v) => setVerticalRipple({ depth: v })} />
          </>
        )}
      </Section>

      <Section title="Custom Twist" defaultOpen={false} active={params.bezierTwist.enabled}>
        <Toggle label="Enabled" checked={params.bezierTwist.enabled} onChange={(v) => setBezierTwist({ enabled: v })} onReset={resetBezierTwist} />
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

      <Section title="Sine Twist" defaultOpen={false} active={params.sineTwist.enabled}>
        <Toggle label="Enabled" checked={params.sineTwist.enabled} onChange={(v) => setSineTwist({ enabled: v })} onReset={resetSineTwist} />
        {params.sineTwist.enabled && (
          <>
            <SliderRow label="Cycles" value={params.sineTwist.cycles} {...SINE_TWIST.cycles} onChange={(v) => setSineTwist({ cycles: v })} />
            <SliderRow label="Max Deg" value={params.sineTwist.maxDegrees} {...SINE_TWIST.maxDegrees} onChange={(v) => setSineTwist({ maxDegrees: v })} />
          </>
        )}
      </Section>

      <Section title="XY Sway" defaultOpen={false} active={params.bezierOffset.enabled}>
        <Toggle label="Enabled" checked={params.bezierOffset.enabled} onChange={(v) => setBezierOffset({ enabled: v })} onReset={resetBezierOffset} />
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

      <Section title="Vertical Smoothing" defaultOpen={false} active={params.verticalSmoothing.enabled}>
        <Toggle label="Enabled" checked={params.verticalSmoothing.enabled} onChange={(v) => setVerticalSmoothing({ enabled: v })} onReset={resetVerticalSmoothing} />
        {params.verticalSmoothing.enabled && (
          <>
            <SliderRow label="Cycles" value={params.verticalSmoothing.cycles} {...VERTICAL_SMOOTHING.cycles} onChange={(v) => setVerticalSmoothing({ cycles: v })} />
            <SliderRow label="Start %" value={params.verticalSmoothing.startPercent} {...VERTICAL_SMOOTHING.startPercent} onChange={(v) => setVerticalSmoothing({ startPercent: v })} />
          </>
        )}
      </Section>

      <Section title="Radial Smoothing" defaultOpen={false} active={params.radialSmoothing.enabled}>
        <Toggle label="Enabled" checked={params.radialSmoothing.enabled} onChange={(v) => setRadialSmoothing({ enabled: v })} onReset={resetRadialSmoothing} />
        {params.radialSmoothing.enabled && (
          <>
            <SliderRow label="Cycles" value={params.radialSmoothing.cycles} {...RADIAL_SMOOTHING.cycles} onChange={(v) => setRadialSmoothing({ cycles: v })} />
            <SliderRow label="Offset" value={params.radialSmoothing.offsetAngle} {...RADIAL_SMOOTHING.offsetAngle} onChange={(v) => setRadialSmoothing({ offsetAngle: v })} />
          </>
        )}
      </Section>

      <Section title="Resolution" defaultOpen={false} active={
        params.resolution.vertical !== RESOLUTION.defaults.vertical ||
        params.resolution.radial !== RESOLUTION.defaults.radial ||
        params.flatShading
      }>
        {(params.resolution.vertical !== RESOLUTION.defaults.vertical ||
          params.resolution.radial !== RESOLUTION.defaults.radial ||
          params.flatShading) && (
          <div className="flex justify-end mb-1">
            <button
              onClick={() => { setResolution({ ...RESOLUTION.defaults }); setFlatShading(false); }}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
              title="Reset to defaults"
            >
              Reset
            </button>
          </div>
        )}
        <SliderRow label="Vertical" value={params.resolution.vertical} {...RESOLUTION.vertical} onChange={(v) => setResolution({ vertical: v })} />
        <SliderRow label="Radial" value={params.resolution.radial} {...RESOLUTION.radial} onChange={(v) => setResolution({ radial: v })} />
        <Toggle label="Show Facets" checked={params.flatShading} onChange={setFlatShading} />
      </Section>
    </>
  );
}
