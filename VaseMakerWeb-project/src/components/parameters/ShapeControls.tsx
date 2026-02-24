'use client';

import { useVaseStore } from '@/store/vase-store';
import type { ShapeType, BezierPoint } from '@/engine/types';
import { SHAPE_OPTIONS, SHAPE_PARAM_CONFIG, DIMENSIONS, SHELL, BEZIER_OFFSET } from '@/config/shape-params';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { BezierCurveEditor } from './BezierCurveEditor';
import { UI_MUTED, GROUP_COLORS } from '@/config/colors';
import { SliderRow, Section, GroupHeader, Toggle } from './ui';

/** Shape parameter sliders for a specific shape (bottom or top) */
function ShapeParamControls({ shape, isTop }: { shape: ShapeType; isTop: boolean }) {
  const shapeParams = useVaseStore((s) =>
    isTop ? s.params.topShapeParams[shape] : s.params.bottomShapeParams[shape]
  );
  const { setBottomShapeParam, setTopShapeParam } = useVaseStore();
  const setParam = isTop ? setTopShapeParam : setBottomShapeParam;
  const specificParams = SHAPE_PARAM_CONFIG[shape];

  if (!specificParams || specificParams.length === 0 || !shapeParams) return null;

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

/** Extract one axis from offset [x,y][] pairs → BezierPoint[] (evenly spaced heights) */
function offsetAxisToPoints(points: [number, number][], axis: 0 | 1): BezierPoint[] {
  return points.map((p, i) => [p[axis], points.length > 1 ? i / (points.length - 1) : 0]);
}

export function ShapeControls() {
  const params = useVaseStore((s) => s.params);
  const {
    setRadius, setHeight, setProfileEnabled, setProfilePoint, addProfilePoint, removeProfilePoint,
    setBottomShape, setTopShape, setMorphEnabled,
    setBezierOffset, setBezierOffsetPointX, setBezierOffsetPointY,
    addBezierOffsetPoint, removeBezierOffsetPoint,
    setWallThickness, setBottomThickness, setRimShape, setSmoothInner, setMinWallThickness,
  } = useVaseStore();

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
  const resetBezierOffset = () => setBezierOffset({
    scaleX: DEFAULT_PARAMETERS.bezierOffset.scaleX,
    scaleY: DEFAULT_PARAMETERS.bezierOffset.scaleY,
    points: DEFAULT_PARAMETERS.bezierOffset.points.map(p => [...p] as [number, number]),
  });

  return (
    <>
      <GroupHeader label="Shape & Structure" color={GROUP_COLORS.structure} />

      <Section title="Dimensions" tooltip="Overall size of the vase" titleColor={GROUP_COLORS.structure}>
        <div className="flex justify-end mb-1">
          <button onClick={() => { setRadius(DEFAULT_PARAMETERS.radius); setHeight(DEFAULT_PARAMETERS.height); }} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Radius" value={params.radius} {...DIMENSIONS.radius} onChange={setRadius} tooltip="Outer radius of the vase in mm" />
        <SliderRow label="Height" value={params.height} {...DIMENSIONS.height} onChange={setHeight} tooltip="Total height of the vase in mm" />
      </Section>

      <Section title="Shell" tooltip="Wall thickness, base, and rim for a printable hollow vase" titleColor={GROUP_COLORS.structure}>
        <div className="flex justify-end mb-1">
          <button onClick={() => { setWallThickness(DEFAULT_PARAMETERS.wallThickness); setBottomThickness(DEFAULT_PARAMETERS.bottomThickness); setRimShape(DEFAULT_PARAMETERS.rimShape); setSmoothInner(DEFAULT_PARAMETERS.smoothInner); setMinWallThickness(DEFAULT_PARAMETERS.minWallThickness); }} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Base" value={params.bottomThickness} {...SHELL.bottomThickness} onChange={setBottomThickness} tooltip="Base thickness in mm (0 = no base)" />
        <SliderRow label="Wall" value={params.wallThickness} {...SHELL.wallThickness} onChange={setWallThickness} tooltip="Wall thickness in mm (0 = thin surface)" />
        {params.wallThickness > 0 && (
          <>
            <SliderRow label="Min Wall" value={params.minWallThickness ?? DEFAULT_PARAMETERS.minWallThickness} {...SHELL.minWallThickness} max={params.wallThickness} onChange={(v) => setMinWallThickness(Math.min(v, params.wallThickness))} tooltip="Minimum wall thickness when Smooth Inner is on" />
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title="Shape of the top edge where outer meets inner wall">Rim</label>
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
            <Toggle label="Smooth Inner" checked={params.smoothInner ?? false} onChange={setSmoothInner} tooltip="Keep inner wall smooth (no ripples or textures)" />
            {(params.smoothInner ?? false) && (
              <div className="text-xs text-[var(--text-secondary)] mb-2 opacity-60">
                Inner wall is completely smooth (no ripples or textures). Deep effects may require adjusting Wall or Min Wall above.
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Bottom Shape" tooltip="Cross-section shape at the base of the vase" titleColor={GROUP_COLORS.structure}>
        <div className="flex items-center gap-2 mb-2">
          <select
            value={params.bottomShape}
            onChange={(e) => setBottomShape(e.target.value as ShapeType)}
            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-sm min-w-0" style={{ color: UI_MUTED }}
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

      <Section title="Top Shape" defaultOpen={false} checked={params.morphEnabled} onToggle={setMorphEnabled} tooltip="Enable to morph from Bottom Shape to a different Top Shape" titleColor={GROUP_COLORS.structure}>
        <div className="flex items-center gap-2 mb-2">
          <select
            value={params.topShape}
            onChange={(e) => setTopShape(e.target.value as ShapeType)}
            className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-sm min-w-0" style={{ color: UI_MUTED }}
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

      <Section title="Profile" checked={params.profileEnabled} onToggle={setProfileEnabled} tooltip="Bezier curve controlling radius from bottom to top" titleColor={GROUP_COLORS.structure}>
        <div className="flex justify-end mb-1">
          <button onClick={resetProfile} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <BezierCurveEditor
          points={params.profilePoints}
          onPointChange={setProfilePoint}
          onPointAdd={addProfilePoint}
          onPointRemove={removeProfilePoint}
          xRange={[0, 5]}
          yRange={[0, 1]}
          xLabel="Radius Multiplier"
        />
        <div className="text-xs text-[var(--text-secondary)] mt-1 px-1 opacity-60">
          Double-click to add. Right-click to remove.
        </div>
      </Section>

      <Section title="XY Sway" defaultOpen={false} checked={params.bezierOffset.enabled} onToggle={(v) => setBezierOffset({ enabled: v })} tooltip="Shift the vase center side-to-side along its height" titleColor={GROUP_COLORS.structure}>
        <div className="flex justify-end mb-1">
          <button onClick={resetBezierOffset} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Scale X" value={params.bezierOffset.scaleX} {...BEZIER_OFFSET.scaleX} onChange={(v) => setBezierOffset({ scaleX: v })} tooltip="Amplifies the X offset curve" />
        <SliderRow label="Scale Y" value={params.bezierOffset.scaleY} {...BEZIER_OFFSET.scaleY} onChange={(v) => setBezierOffset({ scaleY: v })} tooltip="Amplifies the Y offset curve" />

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
    </>
  );
}
