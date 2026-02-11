'use client';

import { useState, useRef, useEffect } from 'react';
import { useVaseStore } from '@/store/vase-store';
import type { ShapeType } from '@/engine/types';
import {
  SHAPE_OPTIONS, SHAPE_PARAM_CONFIG,
  DIMENSIONS, SHELL, APPEARANCE, RESOLUTION, TEXTURES, RADIAL_RIPPLE, VERTICAL_RIPPLE, BEZIER_TWIST,
  SINE_TWIST, VERTICAL_SMOOTHING, RADIAL_SMOOTHING, BEZIER_OFFSET,
} from '@/config/shape-params';
import type { BezierPoint } from '@/engine/types';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { BezierCurveEditor } from './BezierCurveEditor';
import { parseSvgInput } from '@/engine/svg-rasterizer';

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
    <div className="flex items-center gap-2 mb-2">
      <label className="text-sm text-[var(--text-secondary)] w-20 shrink-0">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 min-w-0 h-1.5 accent-[var(--accent)]"
      />
      <span className="text-xs text-[var(--text-secondary)] w-10 shrink-0 text-right tabular-nums">
        {value}
      </span>
    </div>
  );
}

/** Collapsible section wrapper — supports optional header toggle */
function Section({ title, children, defaultOpen = true, active, checked, onToggle }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
  active?: boolean; checked?: boolean; onToggle?: (v: boolean) => void;
}) {
  return (
    <details open={defaultOpen} className="mb-4">
      <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] py-2 px-3 bg-[var(--bg-secondary)] rounded select-none hover:bg-[var(--border-color)] transition-colors flex items-center gap-2">
        <span className="flex-1">{title}</span>
        {onToggle ? (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(!checked); }}
            className={`w-8 h-4 rounded-full transition-colors shrink-0 ${checked ? 'bg-[var(--accent)]' : 'bg-[#888]'}`}
          />
        ) : (
          active && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        )}
      </summary>
      <div className="pt-3 px-4 ml-2 border-l-2 border-[var(--border-color)]">
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

/** Extract native w/h from SVG string for aspect-correct preview tiling */
function getSvgAspect(svgMarkup: string): number {
  const svgTag = svgMarkup.match(/<svg\b([^>]*)>/);
  if (!svgTag) return 1;
  const attrs = svgTag[1];
  const wMatch = attrs.match(/\bwidth\s*=\s*['"]?([\d.]+)/);
  const hMatch = attrs.match(/\bheight\s*=\s*['"]?([\d.]+)/);
  if (wMatch && hMatch) return parseFloat(wMatch[1]) / parseFloat(hMatch[1]);
  const vbMatch = attrs.match(/viewBox\s*=\s*["']?\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/);
  if (vbMatch) return parseFloat(vbMatch[1]) / parseFloat(vbMatch[2]);
  return 1;
}

/** Dialog for loading SVG pattern text — only mounted when open */
function SvgLoadDialog({ onClose, onApply, initialSvg }: {
  onClose: () => void; onApply: (svg: string) => void; initialSvg: string;
}) {
  const [text, setText] = useState(initialSvg);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAspect, setPreviewAspect] = useState(1);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open modal on mount
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Update preview when text changes
  useEffect(() => {
    if (!text.trim()) {
      setPreviewUrl(null);
      return;
    }
    let revoke: string | null = null;
    try {
      const markup = parseSvgInput(text);
      const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      revoke = url;
      setPreviewUrl(url);
      setPreviewAspect(getSvgAspect(markup));
    } catch {
      setPreviewUrl(null);
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [text]);

  const handleApply = () => {
    if (text.trim()) {
      onApply(text.trim());
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-lg p-0 w-[480px] max-w-[90vw] max-h-[80vh] bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-color)] shadow-xl backdrop:bg-black/50"
    >
      <div className="p-4 flex flex-col gap-3">
        <h3 className="text-sm font-medium">Load SVG Pattern</h3>
        <p className="text-xs text-[var(--text-secondary)]">
          Paste SVG code, a data URL, or a CSS background-image line (e.g. from Hero Patterns).
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='<svg xmlns="http://www.w3.org/2000/svg" ...>...</svg>'
          className="w-full h-40 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-primary)] resize-y"
          spellCheck={false}
        />
        {previewUrl && (() => {
          const tileW = 64;
          const tileH = Math.max(4, Math.round(tileW / previewAspect));
          return (
            <div className="flex justify-center">
              <div
                className="w-48 h-48 border border-[var(--border-color)] rounded bg-white"
                style={{
                  backgroundImage: `url(${previewUrl})`,
                  backgroundSize: `${tileW}px ${tileH}px`,
                  backgroundRepeat: 'repeat',
                }}
              />
            </div>
          );
        })()}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!text.trim()}
            className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 transition-colors disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Small inline SVG preview thumbnail */
function SvgPreviewThumb({ svgText }: { svgText: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState(1);

  useEffect(() => {
    if (!svgText) { setUrl(null); return; }
    let revoke: string | null = null;
    try {
      const markup = parseSvgInput(svgText);
      const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      revoke = blobUrl;
      setUrl(blobUrl);
      setAspect(getSvgAspect(markup));
    } catch {
      setUrl(null);
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [svgText]);

  if (!url) return null;
  const tileW = 24;
  const tileH = Math.max(2, Math.round(tileW / aspect));
  return (
    <div
      className="w-12 h-12 border border-[var(--border-color)] rounded shrink-0 bg-white"
      style={{
        backgroundImage: `url(${url})`,
        backgroundSize: `${tileW}px ${tileH}px`,
        backgroundRepeat: 'repeat',
      }}
    />
  );
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
    setWallThickness, setBottomThickness, setRimShape, setSmoothInner, setMinWallThickness,
    setColor, setResolution, setFlatShading,
    setTexturesEnabled, setFluting, setBasketWeave, setVoronoi, setSimplex, setWoodGrain, setSvgPattern,
  } = useVaseStore();

  // Reset helpers — patch specific param groups back to defaults
  const resetProfile = () => {
    const flat: BezierPoint[] = [[1.0, 0], [1.0, 0.2], [1.0, 0.4], [1.0, 0.6], [1.0, 0.8], [1.0, 1.0]];
    useVaseStore.setState((s) => ({
      params: { ...s.params, profilePoints: flat },
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
  const resetFluting = () => setFluting({ count: DEFAULT_PARAMETERS.textures.fluting.count, depth: DEFAULT_PARAMETERS.textures.fluting.depth });
  const resetBasketWeave = () => setBasketWeave({ bands: DEFAULT_PARAMETERS.textures.basketWeave.bands, waves: DEFAULT_PARAMETERS.textures.basketWeave.waves, depth: DEFAULT_PARAMETERS.textures.basketWeave.depth });
  const resetVoronoi = () => setVoronoi({ scale: DEFAULT_PARAMETERS.textures.voronoi.scale, depth: DEFAULT_PARAMETERS.textures.voronoi.depth, edgeWidth: DEFAULT_PARAMETERS.textures.voronoi.edgeWidth, seed: DEFAULT_PARAMETERS.textures.voronoi.seed });
  const resetSimplex = () => setSimplex({ scale: DEFAULT_PARAMETERS.textures.simplex.scale, depth: DEFAULT_PARAMETERS.textures.simplex.depth, octaves: DEFAULT_PARAMETERS.textures.simplex.octaves, persistence: DEFAULT_PARAMETERS.textures.simplex.persistence, lacunarity: DEFAULT_PARAMETERS.textures.simplex.lacunarity, seed: DEFAULT_PARAMETERS.textures.simplex.seed });
  const resetWoodGrain = () => setWoodGrain({ count: DEFAULT_PARAMETERS.textures.woodGrain.count, depth: DEFAULT_PARAMETERS.textures.woodGrain.depth, wobble: DEFAULT_PARAMETERS.textures.woodGrain.wobble, sharpness: DEFAULT_PARAMETERS.textures.woodGrain.sharpness, seed: DEFAULT_PARAMETERS.textures.woodGrain.seed });
  const resetSvgPattern = () => setSvgPattern({ repeatX: DEFAULT_PARAMETERS.textures.svgPattern.repeatX, repeatY: DEFAULT_PARAMETERS.textures.svgPattern.repeatY, depth: DEFAULT_PARAMETERS.textures.svgPattern.depth, invert: DEFAULT_PARAMETERS.textures.svgPattern.invert });

  const [svgDialogOpen, setSvgDialogOpen] = useState(false);

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
        <div className="flex justify-end mb-1">
          <button onClick={() => { setRadius(DEFAULT_PARAMETERS.radius); setHeight(DEFAULT_PARAMETERS.height); }} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Radius" value={params.radius} {...DIMENSIONS.radius} onChange={setRadius} />
        <SliderRow label="Height" value={params.height} {...DIMENSIONS.height} onChange={setHeight} />
      </Section>

      <Section title="Shell">
        <div className="flex justify-end mb-1">
          <button onClick={() => { setWallThickness(DEFAULT_PARAMETERS.wallThickness); setBottomThickness(DEFAULT_PARAMETERS.bottomThickness); setRimShape(DEFAULT_PARAMETERS.rimShape); setSmoothInner(DEFAULT_PARAMETERS.smoothInner); setMinWallThickness(DEFAULT_PARAMETERS.minWallThickness); }} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Base" value={params.bottomThickness} {...SHELL.bottomThickness} onChange={setBottomThickness} />
        <SliderRow label="Wall" value={params.wallThickness} {...SHELL.wallThickness} onChange={setWallThickness} />
        {params.wallThickness > 0 && (
          <>
            <SliderRow label="Min Wall" value={params.minWallThickness ?? DEFAULT_PARAMETERS.minWallThickness} {...SHELL.minWallThickness} max={params.wallThickness} onChange={(v) => setMinWallThickness(Math.min(v, params.wallThickness))} />
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
            <Toggle label="Smooth Inner" checked={params.smoothInner ?? false} onChange={setSmoothInner} />
            {(params.smoothInner ?? false) && (
              <div className="text-xs text-[var(--text-secondary)] mb-2 ml-[calc(6rem+0.75rem)] opacity-60">
                Inner wall ignores textures
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Profile" checked={params.profileEnabled} onToggle={setProfileEnabled}>
        <div className="flex justify-end mb-1">
          <button onClick={resetProfile} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
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
      </Section>

      <Section title="Bottom Shape">
        <div className="flex items-center gap-2 mb-2">
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
      </Section>

      <Section title="Top Shape" defaultOpen={false} checked={params.morphEnabled} onToggle={setMorphEnabled}>
        <div className="flex items-center gap-2 mb-2">
          <select
            value={params.topShape}
            onChange={(e) => setTopShape(e.target.value as ShapeType)}
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
        <ShapeParamControls shape={params.topShape} isTop={true} />
      </Section>

      <Section title="Radial Ripples" defaultOpen={false} checked={params.radialRipple.enabled} onToggle={(v) => setRadialRipple({ enabled: v })}>
        <div className="flex justify-end mb-1">
          <button onClick={resetRadialRipple} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Count" value={params.radialRipple.count} {...RADIAL_RIPPLE.count} onChange={(v) => setRadialRipple({ count: v })} />
        <SliderRow label="Depth" value={params.radialRipple.depth} {...RADIAL_RIPPLE.depth} onChange={(v) => setRadialRipple({ depth: v })} />
      </Section>

      <Section title="Vertical Ripples" defaultOpen={false} checked={params.verticalRipple.enabled} onToggle={(v) => setVerticalRipple({ enabled: v })}>
        <div className="flex justify-end mb-1">
          <button onClick={resetVerticalRipple} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Count" value={params.verticalRipple.count} {...VERTICAL_RIPPLE.count} onChange={(v) => setVerticalRipple({ count: v })} />
        <SliderRow label="Depth" value={params.verticalRipple.depth} {...VERTICAL_RIPPLE.depth} onChange={(v) => setVerticalRipple({ depth: v })} />
      </Section>

      <Section title="Custom Twist" defaultOpen={false} checked={params.bezierTwist.enabled} onToggle={(v) => setBezierTwist({ enabled: v })}>
        <div className="flex justify-end mb-1">
          <button onClick={resetBezierTwist} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
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
      </Section>

      <Section title="Wave Twist" defaultOpen={false} checked={params.sineTwist.enabled} onToggle={(v) => setSineTwist({ enabled: v })}>
        <div className="flex justify-end mb-1">
          <button onClick={resetSineTwist} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Cycles" value={params.sineTwist.cycles} {...SINE_TWIST.cycles} onChange={(v) => setSineTwist({ cycles: v })} />
        <SliderRow label="Max Deg" value={params.sineTwist.maxDegrees} {...SINE_TWIST.maxDegrees} onChange={(v) => setSineTwist({ maxDegrees: v })} />
      </Section>

      <Section title="XY Sway" defaultOpen={false} checked={params.bezierOffset.enabled} onToggle={(v) => setBezierOffset({ enabled: v })}>
        <div className="flex justify-end mb-1">
          <button onClick={resetBezierOffset} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
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
      </Section>

      <Section title="Vertical Smoothing" defaultOpen={false} checked={params.verticalSmoothing.enabled} onToggle={(v) => setVerticalSmoothing({ enabled: v })}>
        <div className="flex justify-end mb-1">
          <button onClick={resetVerticalSmoothing} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Cycles" value={params.verticalSmoothing.cycles} {...VERTICAL_SMOOTHING.cycles} onChange={(v) => setVerticalSmoothing({ cycles: v })} />
        <SliderRow label="Start %" value={params.verticalSmoothing.startPercent} {...VERTICAL_SMOOTHING.startPercent} onChange={(v) => setVerticalSmoothing({ startPercent: v })} />
      </Section>

      <Section title="Radial Smoothing" defaultOpen={false} checked={params.radialSmoothing.enabled} onToggle={(v) => setRadialSmoothing({ enabled: v })}>
        <div className="flex justify-end mb-1">
          <button onClick={resetRadialSmoothing} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Cycles" value={params.radialSmoothing.cycles} {...RADIAL_SMOOTHING.cycles} onChange={(v) => setRadialSmoothing({ cycles: v })} />
        <SliderRow label="Offset" value={params.radialSmoothing.offsetAngle} {...RADIAL_SMOOTHING.offsetAngle} onChange={(v) => setRadialSmoothing({ offsetAngle: v })} />
      </Section>

      <Section title="Textures" defaultOpen={false} checked={params.textures.enabled !== false} onToggle={(v) => setTexturesEnabled(v)}>
        <Toggle label="Fluting" checked={params.textures.fluting.enabled} onChange={(v) => setFluting({ enabled: v })} onReset={resetFluting} />
        {params.textures.fluting.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.fluting.count} {...TEXTURES.fluting.count} onChange={(v) => setFluting({ count: v })} />
            <SliderRow label="Depth" value={params.textures.fluting.depth} {...TEXTURES.fluting.depth} onChange={(v) => setFluting({ depth: v })} />
          </div>
        )}
        <Toggle label="Basket Weave" checked={params.textures.basketWeave.enabled} onChange={(v) => setBasketWeave({ enabled: v })} onReset={resetBasketWeave} />
        {params.textures.basketWeave.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Bands" value={params.textures.basketWeave.bands} {...TEXTURES.basketWeave.bands} onChange={(v) => setBasketWeave({ bands: v })} />
            <SliderRow label="Waves" value={params.textures.basketWeave.waves} {...TEXTURES.basketWeave.waves} onChange={(v) => setBasketWeave({ waves: v })} />
            <SliderRow label="Depth" value={params.textures.basketWeave.depth} {...TEXTURES.basketWeave.depth} onChange={(v) => setBasketWeave({ depth: v })} />
          </div>
        )}
        <Toggle label="Voronoi" checked={params.textures.voronoi?.enabled ?? false} onChange={(v) => setVoronoi({ enabled: v })} onReset={resetVoronoi} />
        {params.textures.voronoi?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Scale" value={params.textures.voronoi.scale} {...TEXTURES.voronoi.scale} onChange={(v) => setVoronoi({ scale: v })} />
            <SliderRow label="Depth" value={params.textures.voronoi.depth} {...TEXTURES.voronoi.depth} onChange={(v) => setVoronoi({ depth: v })} />
            <SliderRow label="Edge" value={params.textures.voronoi.edgeWidth} {...TEXTURES.voronoi.edgeWidth} onChange={(v) => setVoronoi({ edgeWidth: v })} />
            <SliderRow label="Seed" value={params.textures.voronoi.seed} {...TEXTURES.voronoi.seed} onChange={(v) => setVoronoi({ seed: v })} />
          </div>
        )}
        <Toggle label="Simplex" checked={params.textures.simplex?.enabled ?? false} onChange={(v) => setSimplex({ enabled: v })} onReset={resetSimplex} />
        {params.textures.simplex?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Scale" value={params.textures.simplex.scale} {...TEXTURES.simplex.scale} onChange={(v) => setSimplex({ scale: v })} />
            <SliderRow label="Depth" value={params.textures.simplex.depth} {...TEXTURES.simplex.depth} onChange={(v) => setSimplex({ depth: v })} />
            <SliderRow label="Octaves" value={params.textures.simplex.octaves} {...TEXTURES.simplex.octaves} onChange={(v) => setSimplex({ octaves: v })} />
            <SliderRow label="Persistence" value={params.textures.simplex.persistence} {...TEXTURES.simplex.persistence} onChange={(v) => setSimplex({ persistence: v })} />
            <SliderRow label="Lacunarity" value={params.textures.simplex.lacunarity} {...TEXTURES.simplex.lacunarity} onChange={(v) => setSimplex({ lacunarity: v })} />
            <SliderRow label="Seed" value={params.textures.simplex.seed} {...TEXTURES.simplex.seed} onChange={(v) => setSimplex({ seed: v })} />
          </div>
        )}
        <Toggle label="Wood Grain" checked={params.textures.woodGrain?.enabled ?? false} onChange={(v) => setWoodGrain({ enabled: v })} onReset={resetWoodGrain} />
        {params.textures.woodGrain?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.woodGrain.count} {...TEXTURES.woodGrain.count} onChange={(v) => setWoodGrain({ count: v })} />
            <SliderRow label="Depth" value={params.textures.woodGrain.depth} {...TEXTURES.woodGrain.depth} onChange={(v) => setWoodGrain({ depth: v })} />
            <SliderRow label="Wobble" value={params.textures.woodGrain.wobble} {...TEXTURES.woodGrain.wobble} onChange={(v) => setWoodGrain({ wobble: v })} />
            <SliderRow label="Sharpness" value={params.textures.woodGrain.sharpness} {...TEXTURES.woodGrain.sharpness} onChange={(v) => setWoodGrain({ sharpness: v })} />
            <SliderRow label="Seed" value={params.textures.woodGrain.seed} {...TEXTURES.woodGrain.seed} onChange={(v) => setWoodGrain({ seed: v })} />
          </div>
        )}
        <Toggle label="SVG Pattern" checked={params.textures.svgPattern?.enabled ?? false} onChange={(v) => setSvgPattern({ enabled: v })} onReset={resetSvgPattern} />
        {params.textures.svgPattern?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <div className="flex items-center gap-2 mb-2">
              {params.textures.svgPattern.svgText && (
                <SvgPreviewThumb svgText={params.textures.svgPattern.svgText} />
              )}
              <button
                onClick={() => setSvgDialogOpen(true)}
                className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-primary)] transition-colors"
              >
                {params.textures.svgPattern.svgText ? 'Change SVG' : 'Load SVG'}
              </button>
              {params.textures.svgPattern.svgText && (
                <button
                  onClick={() => setSvgPattern({ svgText: '' })}
                  className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            {params.textures.svgPattern.svgText && (
              <>
                <SliderRow label="Repeat X" value={params.textures.svgPattern.repeatX} {...TEXTURES.svgPattern.repeatX} onChange={(v) => setSvgPattern({ repeatX: v })} />
                <SliderRow label="Repeat Y" value={params.textures.svgPattern.repeatY} {...TEXTURES.svgPattern.repeatY} onChange={(v) => setSvgPattern({ repeatY: v })} />
                <SliderRow label="Depth" value={params.textures.svgPattern.depth} {...TEXTURES.svgPattern.depth} onChange={(v) => setSvgPattern({ depth: v })} />
                <Toggle label="Invert" checked={params.textures.svgPattern.invert ?? false} onChange={(v) => setSvgPattern({ invert: v })} />
                <div className="text-xs text-[var(--text-secondary)] mt-1 opacity-60">
                  Increase Resolution for finer detail
                </div>
              </>
            )}
          </div>
        )}
        {svgDialogOpen && (
          <SvgLoadDialog
            onClose={() => setSvgDialogOpen(false)}
            onApply={(svg) => setSvgPattern({ svgText: svg })}
            initialSvg={params.textures.svgPattern?.svgText ?? ''}
          />
        )}
      </Section>

      <Section title="Resolution" defaultOpen={false} active={
        params.resolution.vertical !== RESOLUTION.defaults.vertical ||
        params.resolution.radial !== RESOLUTION.defaults.radial ||
        params.flatShading
      }>
        <div className="flex justify-end mb-1">
          <button onClick={() => { setResolution({ ...RESOLUTION.defaults }); setFlatShading(false); }} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Vertical" value={params.resolution.vertical} {...RESOLUTION.vertical} onChange={(v) => setResolution({ vertical: v })} />
        <SliderRow label="Radial" value={params.resolution.radial} {...RESOLUTION.radial} onChange={(v) => setResolution({ radial: v })} />
        <Toggle label="Show Facets" checked={params.flatShading} onChange={setFlatShading} />
      </Section>
    </>
  );
}
