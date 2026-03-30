'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { GRID, AXIS_RULERS, AXIS_LABELS, AXIS_GIZMO } from '@/config/viewport';

/**
 * Pick a "nice" round number for tick/label spacing.
 * Returns a value from [1, 2, 5] * 10^n that gives roughly targetCount divisions.
 */
function niceSpacing(extent: number, targetCount: number): number {
  const rough = extent / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  let nice: number;
  if (normalized < 1.5) nice = 1;
  else if (normalized < 3.5) nice = 2;
  else if (normalized < 7.5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

/**
 * Ground grid on the XY plane at Z=0.
 */
export function GroundGrid({ radius, height }: { radius?: number; height?: number }) {
  const maxExtent = Math.max((radius ?? 50) * 2, height ?? 100);

  const { minor, major } = useMemo(() => {
    // Grid size covers the vase with margin, snapped to a nice number
    const rawSize = Math.max(maxExtent * 1.5, 100);
    const cellSize = niceSpacing(rawSize, 20);
    const sectionSize = cellSize * 5;
    const gridHalf = Math.ceil(rawSize / sectionSize) * sectionSize;

    const minorPos: number[] = [];
    const majorPos: number[] = [];

    for (let v = -gridHalf; v <= gridHalf + 0.001; v += cellSize) {
      const isMajor = Math.abs(v % sectionSize) < 0.001 || Math.abs(v % sectionSize - sectionSize) < 0.001;
      const arr = isMajor ? majorPos : minorPos;
      arr.push(-gridHalf, v, 0, gridHalf, v, 0);
      arr.push(v, -gridHalf, 0, v, gridHalf, 0);
    }

    const minorGeo = new THREE.BufferGeometry();
    minorGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorPos, 3));
    const majorGeo = new THREE.BufferGeometry();
    majorGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorPos, 3));
    return { minor: minorGeo, major: majorGeo };
  }, [maxExtent]);

  return (
    <group>
      <lineSegments geometry={minor}>
        <lineBasicMaterial color={GRID.minorColor} />
      </lineSegments>
      <lineSegments geometry={major}>
        <lineBasicMaterial color={GRID.majorColor} />
      </lineSegments>
    </group>
  );
}

/**
 * Axis rulers with tick marks along X, Y, Z.
 * Tick spacing adapts to vase size for readable increments at any zoom level.
 */
export function AxisRulers({ radius, height }: { radius?: number; height?: number }) {
  const r = radius ?? 50;
  const h = height ?? 100;
  const maxExtent = Math.max(r * 2, h);

  const axes = useMemo(() => {
    const tickSpacing = niceSpacing(maxExtent, 20);
    const majorTickEvery = tickSpacing * 5;
    const xyHalf = Math.ceil((r * 1.3) / majorTickEvery) * majorTickEvery;
    const zEnd = Math.ceil((h * 1.2) / majorTickEvery) * majorTickEvery;

    const result: { geometry: THREE.BufferGeometry; color: string }[] = [];

    const configs: { axis: 'x' | 'y' | 'z'; color: string }[] = [
      { axis: 'x', color: AXIS_RULERS.colors.x },
      { axis: 'y', color: AXIS_RULERS.colors.y },
      { axis: 'z', color: AXIS_RULERS.colors.z },
    ];

    for (const { axis, color } of configs) {
      const positions: number[] = [];
      const start = axis === 'z' ? 0 : -xyHalf;
      const end = axis === 'z' ? zEnd : xyHalf;

      // Main axis line
      if (axis === 'x') positions.push(start, 0, 0, end, 0, 0);
      else if (axis === 'y') positions.push(0, start, 0, 0, end, 0);
      else positions.push(0, 0, start, 0, 0, end);

      // Tick marks
      for (let v = start; v <= end + 0.001; v += tickSpacing) {
        if (Math.abs(v) < 0.001) continue;
        const isMajor = Math.abs(v % majorTickEvery) < 0.001 || Math.abs(v % majorTickEvery - majorTickEvery) < 0.001;
        const sz = isMajor ? AXIS_RULERS.tickSize * AXIS_RULERS.majorTickMultiplier : AXIS_RULERS.tickSize;

        if (axis === 'x') positions.push(v, 0, -sz, v, 0, sz);
        else if (axis === 'y') positions.push(0, v, -sz, 0, v, sz);
        else positions.push(-sz, 0, v, sz, 0, v);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      result.push({ geometry: geo, color });
    }

    return result;
  }, [maxExtent, r, h]);

  return (
    <group>
      {axes.map(({ geometry, color }, i) => (
        <lineSegments key={i} geometry={geometry}>
          <lineBasicMaterial color={color} transparent opacity={AXIS_RULERS.opacity} />
        </lineSegments>
      ))}
    </group>
  );
}

/**
 * Numeric labels along each axis at major ticks, colored to match the axis.
 * Spacing adapts to vase size for readable labels at any scale.
 */
export function AxisLabels({ radius, height }: { radius?: number; height?: number }) {
  const r = radius ?? 50;
  const h = height ?? 100;
  const maxExtent = Math.max(r * 2, h);

  const labels = useMemo(() => {
    const labelSpacing = niceSpacing(maxExtent, 4);
    const xyHalf = Math.ceil((r * 1.3) / labelSpacing) * labelSpacing;
    const zEnd = Math.ceil((h * 1.2) / labelSpacing) * labelSpacing;

    const result: { text: string; position: [number, number, number]; color: string }[] = [];

    // X axis (red) — labels along X, offset in Z
    for (let v = -xyHalf; v <= xyHalf + 0.001; v += labelSpacing) {
      if (Math.abs(v) < 0.001) continue;
      result.push({ text: `${v}`, position: [v, 0, -AXIS_LABELS.offset], color: AXIS_LABELS.colors.x });
    }

    // Y axis (green) — labels along Y, offset in Z
    for (let v = -xyHalf; v <= xyHalf + 0.001; v += labelSpacing) {
      if (Math.abs(v) < 0.001) continue;
      result.push({ text: `${v}`, position: [0, v, -AXIS_LABELS.offset], color: AXIS_LABELS.colors.y });
    }

    // Z axis (blue) — labels along Z, offset in X
    for (let v = labelSpacing; v <= zEnd + 0.001; v += labelSpacing) {
      result.push({ text: `${v}`, position: [-AXIS_LABELS.offset, 0, v], color: AXIS_LABELS.colors.z });
    }

    return result;
  }, [maxExtent, r, h]);

  return (
    <group>
      {labels.map(({ text, position, color }, i) => (
        <TextSprite key={i} text={text} position={position} color={color} />
      ))}
    </group>
  );
}

/** A single text label rendered as a sprite with a canvas texture. */
function TextSprite({ text, position, color = '#888888' }: {
  text: string;
  position: [number, number, number];
  color?: string;
}) {
  const { map, scale } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = `${AXIS_LABELS.fontStyle} ${AXIS_LABELS.fontSize}px ${AXIS_LABELS.fontFamily}`;
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width) + 8;
    const h = AXIS_LABELS.fontSize + 8;
    canvas.width = w;
    canvas.height = h;
    // Redraw after resize (canvas resize clears context state)
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.fillText(text, 4, 4);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    // Scale sprite to world units (roughly 1 world unit per 8px)
    const worldScale: [number, number, number] = [w / 8, h / 8, 1];
    return { map: texture, scale: worldScale };
  }, [text, color]);

  return (
    <sprite position={position} scale={scale}>
      <spriteMaterial map={map} transparent depthTest={false} />
    </sprite>
  );
}

/**
 * Small XYZ axis indicator at the origin — colored arrows showing orientation.
 * This sits in the 3D scene (not a fixed-position overlay).
 */
export function AxisGizmo() {
  const group = useMemo(() => {
    const axes = [
      { dir: [1, 0, 0] as const, color: AXIS_GIZMO.colors.x },
      { dir: [0, 1, 0] as const, color: AXIS_GIZMO.colors.y },
      { dir: [0, 0, 1] as const, color: AXIS_GIZMO.colors.z },
    ];

    const geos: { lineGeo: THREE.BufferGeometry; color: string }[] = [];
    for (const { dir, color } of axes) {
      const positions = [0, 0, 0, dir[0] * AXIS_GIZMO.scale, dir[1] * AXIS_GIZMO.scale, dir[2] * AXIS_GIZMO.scale];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geos.push({ lineGeo: geo, color });
    }
    return geos;
  }, []);

  return (
    <group>
      {group.map(({ lineGeo, color }, i) => (
        <lineSegments key={i} geometry={lineGeo}>
          <lineBasicMaterial color={color} linewidth={2} />
        </lineSegments>
      ))}
    </group>
  );
}
