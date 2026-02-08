'use client';

import { useVaseStore } from '@/store/vase-store';
import type { ShapeType } from '@/engine/types';

const SHAPE_OPTIONS: { value: ShapeType; label: string }[] = [
  { value: 'Circle1', label: 'Circle' },
  { value: 'Butterfly1', label: 'Butterfly' },
  { value: 'Cardioid1', label: 'Cardioid (sharp)' },
  { value: 'Cardioid2', label: 'Cardioid (smooth)' },
  { value: 'Cardioid3', label: 'Cardioid (offset)' },
  { value: 'Diamond1', label: 'Diamond' },
  { value: 'Egg1', label: 'Egg 1' },
  { value: 'Egg2', label: 'Egg 2' },
  { value: 'Ellipse1', label: 'Ellipse' },
  { value: 'Heart1', label: 'Heart' },
  { value: 'Infinity1', label: 'Infinity' },
  { value: 'Misc1', label: 'Misc' },
  { value: 'Polygon1', label: 'Polygon' },
  { value: 'Rectangle1', label: 'Rectangle' },
  { value: 'Rose1', label: 'Rose' },
  { value: 'Square1', label: 'Square' },
  { value: 'SuperEllipse1', label: 'SuperEllipse' },
  { value: 'SuperFormula1', label: 'SuperFormula' },
];

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
        <SliderRow label="Radius" value={params.radius} min={10} max={100} step={1} onChange={setRadius} />
        <SliderRow label="Height" value={params.height} min={10} max={300} step={1} onChange={setHeight} />
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

        <Toggle label="Morph" checked={params.morphEnabled} onChange={setMorphEnabled} />

        {params.morphEnabled && (
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
        )}
      </Section>

      <Section title="Radial Ripples" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.radialRipple.enabled} onChange={(v) => setRadialRipple({ enabled: v })} />
        {params.radialRipple.enabled && (
          <>
            <SliderRow label="Count" value={params.radialRipple.count} min={1} max={60} step={1} onChange={(v) => setRadialRipple({ count: v })} />
            <SliderRow label="Depth" value={params.radialRipple.depth} min={0} max={20} step={0.1} onChange={(v) => setRadialRipple({ depth: v })} />
          </>
        )}
      </Section>

      <Section title="Vertical Ripples" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.verticalRipple.enabled} onChange={(v) => setVerticalRipple({ enabled: v })} />
        {params.verticalRipple.enabled && (
          <>
            <SliderRow label="Count" value={params.verticalRipple.count} min={1} max={60} step={0.2} onChange={(v) => setVerticalRipple({ count: v })} />
            <SliderRow label="Depth" value={params.verticalRipple.depth} min={0} max={20} step={0.1} onChange={(v) => setVerticalRipple({ depth: v })} />
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
            min={-180}
            max={180}
            step={1}
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
            <SliderRow label="Cycles" value={params.sineTwist.cycles} min={0} max={6} step={1} onChange={(v) => setSineTwist({ cycles: v })} />
            <SliderRow label="Max Deg" value={params.sineTwist.maxDegrees} min={-180} max={180} step={1} onChange={(v) => setSineTwist({ maxDegrees: v })} />
          </>
        )}
      </Section>

      <Section title="Vertical Smoothing" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.verticalSmoothing.enabled} onChange={(v) => setVerticalSmoothing({ enabled: v })} />
        {params.verticalSmoothing.enabled && (
          <>
            <SliderRow label="Cycles" value={params.verticalSmoothing.cycles} min={0} max={10} step={1} onChange={(v) => setVerticalSmoothing({ cycles: v })} />
            <SliderRow label="Start %" value={params.verticalSmoothing.startPercent} min={0} max={100} step={1} onChange={(v) => setVerticalSmoothing({ startPercent: v })} />
          </>
        )}
      </Section>

      <Section title="Radial Smoothing" defaultOpen={false}>
        <Toggle label="Enabled" checked={params.radialSmoothing.enabled} onChange={(v) => setRadialSmoothing({ enabled: v })} />
        {params.radialSmoothing.enabled && (
          <>
            <SliderRow label="Cycles" value={params.radialSmoothing.cycles} min={0} max={10} step={1} onChange={(v) => setRadialSmoothing({ cycles: v })} />
            <SliderRow label="Offset" value={params.radialSmoothing.offsetAngle} min={-180} max={180} step={1} onChange={(v) => setRadialSmoothing({ offsetAngle: v })} />
          </>
        )}
      </Section>
    </>
  );
}
