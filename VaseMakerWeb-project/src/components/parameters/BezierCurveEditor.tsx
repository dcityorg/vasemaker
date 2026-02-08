'use client';

import { useCallback, useRef, useMemo } from 'react';
import { evaluateBezier } from '@/engine/bezier';
import type { BezierPoint } from '@/engine/types';

interface BezierCurveEditorProps {
  points: BezierPoint[];
  onPointChange: (index: number, point: BezierPoint) => void;
  onPointAdd?: (point: BezierPoint) => void;
  onPointRemove?: (index: number) => void;
  maxPoints?: number;
  minPoints?: number;
  /** Data range for x axis [min, max] */
  xRange: [number, number];
  /** Data range for y axis [min, max] */
  yRange: [number, number];
  xLabel?: string;
  yLabel?: string;
  width?: number;
  height?: number;
}

// Layout constants
const PADDING = { top: 8, right: 12, bottom: 24, left: 32 };
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
  maxPoints = 8,
  minPoints = 2,
  xRange,
  yRange,
  xLabel,
  yLabel,
  width = 260,
  height = 180,
}: BezierCurveEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);

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

  // Sample the Bezier curve for display
  const curvePath = useMemo(() => {
    if (points.length < 2) return '';
    const parts: string[] = [];
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const t = i / CURVE_SAMPLES;
      const [val, hFrac] = evaluateBezier(t, points);
      const sx = toSvgX(val);
      const sy = toSvgY(hFrac);
      parts.push(`${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    return parts.join(' ');
  }, [points, toSvgX, toSvgY]);

  // Control polygon path (lines connecting points in order)
  const polygonPath = useMemo(() => {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${toSvgX(p[0]).toFixed(1)},${toSvgY(p[1]).toFixed(1)}`)
      .join(' ');
  }, [points, toSvgX, toSvgY]);

  // Pointer handlers for dragging
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      dragging.current = index;
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging.current === null || !svgRef.current) return;
      const index = dragging.current;
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = e.clientX - rect.left;
      const svgY = e.clientY - rect.top;

      let dataX = toDataX(svgX);
      let dataY = toDataY(svgY);

      // Clamp to ranges
      dataX = Math.max(xRange[0], Math.min(xRange[1], dataX));
      dataY = Math.max(yRange[0], Math.min(yRange[1], dataY));

      // Round for cleaner values
      dataX = Math.round(dataX * 20) / 20; // 0.05 precision
      dataY = Math.round(dataY * 40) / 40; // 0.025 precision

      // Lock first/last point Y values
      if (index === 0) dataY = yRange[0];
      if (index === points.length - 1) dataY = yRange[1];

      onPointChange(index, [dataX, dataY]);
    },
    [toDataX, toDataY, xRange, yRange, points.length, onPointChange]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

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
    const step = range <= 3 ? 0.5 : range <= 10 ? 1 : 5;
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
      className="select-none"
      style={{ touchAction: 'none' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDoubleClick={handleDoubleClick}
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
        return (
          <g key={i}>
            {/* Invisible larger hit area */}
            <circle
              cx={cx}
              cy={cy}
              r={POINT_HIT_RADIUS}
              fill="transparent"
              cursor={canRemove ? 'grab' : 'ew-resize'}
              onPointerDown={(e) => handlePointerDown(e, i)}
              onContextMenu={canRemove ? (e) => handleContextMenu(e, i) : undefined}
            />
            {/* Visible point */}
            <circle
              cx={cx}
              cy={cy}
              r={isEndpoint ? POINT_RADIUS - 1 : POINT_RADIUS}
              fill={isEndpoint ? 'var(--text-secondary)' : 'var(--accent)'}
              stroke="var(--bg-primary)"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          </g>
        );
      })}
    </svg>
  );
}
