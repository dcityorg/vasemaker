'use client';

import { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import { evaluatePiecewiseBezier } from '@/engine/bezier';
import type { BezierPoint, CurvePointType } from '@/engine/types';

interface BezierCurveEditorProps {
  points: BezierPoint[];
  onPointChange: (index: number, point: BezierPoint) => void;
  onPointAdd?: (point: BezierPoint) => void;
  onPointRemove?: (index: number) => void;
  /** Per-point types: 'fixed' (curve passes through) or 'handle' (pull-handle). */
  pointTypes?: CurvePointType[];
  /** Toggle a point's type. Called with the index. Endpoints (0, length-1) are ignored. */
  onPointTypeToggle?: (index: number) => void;
  maxPoints?: number;
  minPoints?: number;
  /** Data range for x axis [min, max] */
  xRange: [number, number];
  /** Data range for y axis [min, max] */
  yRange: [number, number];
  /** Base arrow-key step on x axis. Defaults to 0.05. Twist passes 1 (one degree). */
  arrowStepX?: number;
  /** Base arrow-key step on y axis. Defaults to 0.025. */
  arrowStepY?: number;
  xLabel?: string;
  yLabel?: string;
  width?: number;
  height?: number;
}

// Layout constants
const PADDING = { top: 8, right: 12, bottom: 29, left: 32 };
const CURVE_SAMPLES = 60;
const POINT_RADIUS = 6;
const POINT_HIT_RADIUS = 12;

/**
 * Reusable SVG-based Bezier curve editor.
 * Renders control points as draggable circles with the evaluated curve.
 * Y axis is flipped so 0 is at bottom and 1 is at top.
 */
export function BezierCurveEditor({
  points,
  onPointChange,
  onPointAdd,
  onPointRemove,
  pointTypes,
  onPointTypeToggle,
  maxPoints = 8,
  minPoints = 2,
  xRange,
  yRange,
  arrowStepX = 0.05,
  arrowStepY = 0.025,
  xLabel,
  yLabel,
  width = 260,
  height = 180,
}: BezierCurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const pointerDown = useRef<{
    index: number;
    x: number;          // client x at down (for drag-vs-toggle threshold)
    y: number;          // client y at down
    shift: boolean;     // shift held at down (for shift-click toggle intent)
    startDataX: number; // data-space x at down (for axis-lock)
    startDataY: number; // data-space y at down
    axisLock: 'x' | 'y' | null; // axis chosen once drag exceeds threshold with Shift held
  } | null>(null);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Clear selection if it falls out of bounds (e.g. user removed the selected point)
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= points.length) {
      setSelectedIndex(null);
    }
  }, [points.length, selectedIndex]);

  // Plot area dimensions
  const plotW = width - PADDING.left - PADDING.right;
  const plotH = height - PADDING.top - PADDING.bottom;

  // Convert data coords to SVG coords
  const toSvgX = useCallback(
    (dataX: number) => PADDING.left + ((dataX - xRange[0]) / (xRange[1] - xRange[0])) * plotW,
    [xRange, plotW]
  );
  const toSvgY = useCallback(
    (dataY: number) => PADDING.top + plotH - ((dataY - yRange[0]) / (yRange[1] - yRange[0])) * plotH,
    [yRange, plotH]
  );

  // Convert SVG coords to data coords
  const toDataX = useCallback(
    (svgX: number) => xRange[0] + ((svgX - PADDING.left) / plotW) * (xRange[1] - xRange[0]),
    [xRange, plotW]
  );
  const toDataY = useCallback(
    (svgY: number) => yRange[0] + ((PADDING.top + plotH - svgY) / plotH) * (yRange[1] - yRange[0]),
    [yRange, plotH]
  );

  // Sample the curve for display (piecewise: passes through fixed points, pulled by handles)
  const curvePath = useMemo(() => {
    if (points.length < 2) return '';
    const parts: string[] = [];
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const t = i / CURVE_SAMPLES;
      const [val, hFrac] = evaluatePiecewiseBezier(t, points, pointTypes);
      const sx = toSvgX(val);
      const sy = toSvgY(hFrac);
      parts.push(`${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    return parts.join(' ');
  }, [points, pointTypes, toSvgX, toSvgY]);

  // Control polygon path (lines connecting points in order)
  const polygonPath = useMemo(() => {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toSvgX(p[0]).toFixed(1)},${toSvgY(p[1]).toFixed(1)}`)
      .join(' ');
  }, [points, toSvgX, toSvgY]);

  // Pointer handlers for dragging + shift-click toggle + axis-lock
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      dragging.current = index;
      const p = points[index];
      pointerDown.current = {
        index,
        x: e.clientX,
        y: e.clientY,
        shift: e.shiftKey,
        startDataX: p ? p[0] : 0,
        startDataY: p ? p[1] : 0,
        axisLock: null,
      };
      setSelectedIndex(index);
      svgRef.current?.focus();
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    [points]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging.current === null || !svgRef.current) return;
      const index = dragging.current;
      const pd = pointerDown.current;
      let movedBeyondThreshold = false;
      if (pd) {
        const dx = e.clientX - pd.x;
        const dy = e.clientY - pd.y;
        if (dx * dx + dy * dy > 9) {
          movedBeyondThreshold = true;
          // Once dragging starts, the shift-click toggle intent is gone
          pd.shift = false;
          // Establish axis-lock direction the first time drag exceeds threshold while Shift held
          if (e.shiftKey && pd.axisLock === null) {
            pd.axisLock = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
          }
          // If shift released mid-drag, clear axis-lock
          if (!e.shiftKey) pd.axisLock = null;
        }
      }
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = e.clientX - rect.left;
      const svgY = e.clientY - rect.top;

      let dataX = toDataX(svgX);
      let dataY = toDataY(svgY);

      // Clamp to ranges
      dataX = Math.max(xRange[0], Math.min(xRange[1], dataX));
      dataY = Math.max(yRange[0], Math.min(yRange[1], dataY));

      // Modifier-aware rounding: Alt = finer (5×), default = current grid
      if (e.altKey) {
        dataX = Math.round(dataX * 100) / 100; // 0.01 precision
        dataY = Math.round(dataY * 200) / 200; // 0.005 precision
      } else {
        dataX = Math.round(dataX * 20) / 20;   // 0.05 precision
        dataY = Math.round(dataY * 40) / 40;   // 0.025 precision
      }

      // Axis-lock: pin the off-axis to its starting value
      if (pd && movedBeyondThreshold && pd.axisLock !== null) {
        if (pd.axisLock === 'x') dataY = pd.startDataY;
        else dataX = pd.startDataX;
      }

      // Lock first/last point Y values
      if (index === 0) dataY = yRange[0];
      if (index === points.length - 1) dataY = yRange[1];

      onPointChange(index, [dataX, dataY]);
    },
    [toDataX, toDataY, xRange, yRange, points.length, onPointChange]
  );

  const handlePointerUp = useCallback(() => {
    // If shift was held and the cursor didn't move beyond threshold, treat as toggle
    const pd = pointerDown.current;
    if (pd && pd.shift && onPointTypeToggle) {
      const isEndpoint = pd.index === 0 || pd.index === points.length - 1;
      if (!isEndpoint) onPointTypeToggle(pd.index);
    }
    pointerDown.current = null;
    dragging.current = null;
  }, [onPointTypeToggle, points.length]);

  // SVG-level pointer-down: only fires for empty-area clicks (point handlers stopPropagation).
  // Clears the current selection.
  const handleSvgPointerDown = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  // Keyboard nudging when a point is selected.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedIndex !== null) {
          e.preventDefault();
          setSelectedIndex(null);
        }
        return;
      }
      if (selectedIndex === null) return;
      if (
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowRight' &&
        e.key !== 'ArrowUp' &&
        e.key !== 'ArrowDown'
      ) {
        return;
      }
      e.preventDefault();
      const idx = selectedIndex;
      const p = points[idx];
      if (!p) return;
      const isEndpoint = idx === 0 || idx === points.length - 1;
      let stepX = arrowStepX;
      let stepY = arrowStepY;
      if (e.altKey) {
        // Alt wins over Shift if both pressed (precision over speed)
        stepX = arrowStepX * 0.2;
        stepY = arrowStepY * 0.2;
      } else if (e.shiftKey) {
        stepX = arrowStepX * 5;
        stepY = arrowStepY * 5;
      }
      let nx = p[0];
      let ny = p[1];
      if (e.key === 'ArrowLeft') nx -= stepX;
      else if (e.key === 'ArrowRight') nx += stepX;
      else if (e.key === 'ArrowUp') {
        if (isEndpoint) return;
        ny += stepY;
      } else if (e.key === 'ArrowDown') {
        if (isEndpoint) return;
        ny -= stepY;
      }
      nx = Math.max(xRange[0], Math.min(xRange[1], nx));
      ny = Math.max(yRange[0], Math.min(yRange[1], ny));
      // Endpoints stay locked to their y
      if (idx === 0) ny = yRange[0];
      if (idx === points.length - 1) ny = yRange[1];
      onPointChange(idx, [nx, ny]);
    },
    [selectedIndex, points, xRange, yRange, arrowStepX, arrowStepY, onPointChange]
  );

  // Double-click on plot area to add a point
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onPointAdd || !svgRef.current) return;
      if (points.length >= maxPoints) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = e.clientX - rect.left;
      const svgY = e.clientY - rect.top;

      // Only add if click is within the plot area
      if (svgX < PADDING.left || svgX > PADDING.left + plotW) return;
      if (svgY < PADDING.top || svgY > PADDING.top + plotH) return;

      let dataX = toDataX(svgX);
      let dataY = toDataY(svgY);
      dataX = Math.max(xRange[0], Math.min(xRange[1], dataX));
      dataY = Math.max(yRange[0], Math.min(yRange[1], dataY));
      dataX = Math.round(dataX * 20) / 20;
      dataY = Math.round(dataY * 40) / 40;

      onPointAdd([dataX, dataY]);
    },
    [onPointAdd, points.length, maxPoints, plotW, plotH, toDataX, toDataY, xRange, yRange]
  );

  // Right-click on a point to remove it
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      if (!onPointRemove) return;
      if (points.length <= minPoints) return;
      if (index === 0 || index === points.length - 1) return; // keep endpoints
      onPointRemove(index);
    },
    [onPointRemove, points.length, minPoints]
  );

  // Axis ticks
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const range = xRange[1] - xRange[0];
    const step = range <= 3 ? 0.5 : range <= 10 ? 1 : range <= 50 ? 5 : range <= 200 ? 25 : range <= 1000 ? 100 : 500;
    for (let v = xRange[0]; v <= xRange[1] + 0.001; v += step) {
      ticks.push(Math.round(v * 10) / 10);
    }
    return ticks;
  }, [xRange]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const range = yRange[1] - yRange[0];
    const step = range <= 1 ? 0.25 : range <= 5 ? 1 : 10;
    for (let v = yRange[0]; v <= yRange[1] + 0.001; v += step) {
      ticks.push(Math.round(v * 100) / 100);
    }
    return ticks;
  }, [yRange]);

  // Reference line at x=1.0 (if within range)
  const refLineX = xRange[0] <= 1 && xRange[1] >= 1 ? toSvgX(1) : null;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      tabIndex={0}
      className="select-none focus:outline-none"
      style={{ touchAction: 'none' }}
      onPointerDown={handleSvgPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Background */}
      <rect
        x={PADDING.left}
        y={PADDING.top}
        width={plotW}
        height={plotH}
        fill="var(--bg-secondary)"
        stroke="var(--border-color)"
        strokeWidth={1}
      />

      {/* Reference line at x=1.0 */}
      {refLineX !== null && (
        <line
          x1={refLineX}
          y1={PADDING.top}
          x2={refLineX}
          y2={PADDING.top + plotH}
          stroke="var(--border-color)"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      )}

      {/* X axis ticks and labels */}
      {xTicks.map((v) => {
        const sx = toSvgX(v);
        return (
          <g key={`xt-${v}`}>
            <line
              x1={sx}
              y1={PADDING.top + plotH}
              x2={sx}
              y2={PADDING.top + plotH + 4}
              stroke="var(--text-secondary)"
              strokeWidth={0.5}
            />
            <text
              x={sx}
              y={PADDING.top + plotH + 16}
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize={9}
              fontFamily="monospace"
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* Y axis ticks and labels */}
      {yTicks.map((v) => {
        const sy = toSvgY(v);
        const label = yRange[1] <= 1 ? `${Math.round(v * 100)}%` : `${v}`;
        return (
          <g key={`yt-${v}`}>
            <line
              x1={PADDING.left - 4}
              y1={sy}
              x2={PADDING.left}
              y2={sy}
              stroke="var(--text-secondary)"
              strokeWidth={0.5}
            />
            <text
              x={PADDING.left - 6}
              y={sy + 3}
              textAnchor="end"
              fill="var(--text-secondary)"
              fontSize={9}
              fontFamily="monospace"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Axis labels */}
      {xLabel && (
        <text
          x={PADDING.left + plotW / 2}
          y={height - 2}
          textAnchor="middle"
          fill="var(--text-secondary)"
          fontSize={9}
        >
          {xLabel}
        </text>
      )}

      {/* Control polygon (thin lines connecting points) */}
      {polygonPath && (
        <path
          d={polygonPath}
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth={0.5}
          strokeDasharray="2,2"
          opacity={0.5}
        />
      )}

      {/* Bezier curve */}
      {curvePath && (
        <path
          d={curvePath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
        />
      )}

      {/* Control points */}
      {points.map((p, i) => {
        const cx = toSvgX(p[0]);
        const cy = toSvgY(p[1]);
        const isEndpoint = i === 0 || i === points.length - 1;
        const canRemove = onPointRemove && !isEndpoint && points.length > minPoints;
        const type = pointTypes?.[i] ?? (isEndpoint ? 'fixed' : 'handle');
        const isFixed = type === 'fixed' || isEndpoint;
        const r = isEndpoint ? POINT_RADIUS - 1 : POINT_RADIUS;
        const fill = isEndpoint ? 'var(--text-secondary)' : 'var(--accent)';
        const tipPrefix = isFixed ? 'Fixed point.' : 'Handle.';
        const tipSuffix = isEndpoint
          ? ' Drag to move (locked to this end).'
          : ' Drag to move. Shift-click to toggle Fixed/Handle.' + (canRemove ? ' Right-click to remove.' : '');
        const isSelected = i === selectedIndex;
        return (
          <g key={i}>
            {/* Selection ring */}
            {isSelected && (
              <circle
                cx={cx}
                cy={cy}
                r={POINT_RADIUS + 4}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.5}
                opacity={0.7}
                pointerEvents="none"
              />
            )}
            {/* Invisible larger hit area */}
            <circle
              cx={cx}
              cy={cy}
              r={POINT_HIT_RADIUS}
              fill="transparent"
              cursor={canRemove ? 'grab' : 'ew-resize'}
              onPointerDown={(e) => handlePointerDown(e, i)}
              onContextMenu={canRemove ? (e) => handleContextMenu(e, i) : undefined}
            >
              <title>{tipPrefix + tipSuffix}</title>
            </circle>
            {/* Visible point — square for fixed, circle for handle */}
            {isFixed ? (
              <rect
                x={cx - r}
                y={cy - r}
                width={r * 2}
                height={r * 2}
                fill={fill}
                stroke="var(--bg-primary)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            ) : (
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={fill}
                stroke="var(--bg-primary)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
