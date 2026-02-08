'use client';

import { useVaseStore } from '@/store/vase-store';
import type { ShapeType } from '@/engine/types';
import {
  SHAPE_OPTIONS, SHAPE_PARAM_CONFIG, UNIVERSAL_PARAMS,
  DIMENSIONS, RADIAL_RIPPLE, VERTICAL_RIPPLE, BEZIER_TWIST,
  SINE_TWIST, VERTICAL_SMOOTHING, RADIAL_SMOOTHING,
} from '@/config/shape-params';

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

export function DimensionControls() {
  const params = useVaseStore((s) => s.params);
  const {
    setRadius, setHeight, setBottomShape, setTopShape, setMorphEnabled,
    setRadialRipple, setVerticalRipple, setBezierTwist, setSineTwist,
    setVerticalSmoothing, setRadialSmoothing,
  } = useVaseStore();

  return (
    <>
      <Section title="Dimensions">
        <SliderRow label="Radius" value={params.radius} {...DIMENSIONS.radius} onChange={setRadius} />
        <SliderRow label="Height" value={params.height} {...DIMENSIONS.height} onChange={setHeight} />
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

      <Section title="Bezier Twist" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.bezierTwist.enabled} onChange={(v) => setBezierTwist({ enabled: v })} />
        {params.bezierTwist.enabled && params.bezierTwist.points.map((val, i) => (
          <SliderRow
            key={i}
            label={i === 0 ? 'Bottom' : i === params.bezierTwist.points.length - 1 ? 'Top' : `${Math.round(i / (params.bezierTwist.points.length - 1) * 100)}%`}
            value={val}
            {...BEZIER_TWIST.point}
            onChange={(v) => {
              const points = [...params.bezierTwist.points];
              points[i] = v;
              setBezierTwist({ points });
            }}
          />
        ))}
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
