'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { GRID, AXIS_RULERS, AXIS_LABELS, AXIS_GIZMO } from '@/config/viewport';

/**
 * Ground grid on the XY plane at Z=0.
 */
export function GroundGrid() {
  const { minor, major } = useMemo(() => {
    const minorPos: number[] = [];
    const majorPos: number[] = [];
    const half = GRID.size / 2;

    for (let v = -half; v <= half + 0.001; v += GRID.cellSize) {
      const isMajor = Math.abs(v % GRID.sectionSize) < 0.001;
      const arr = isMajor ? majorPos : minorPos;
      // Line parallel to X at this Y
      arr.push(-half, v, 0, half, v, 0);
      // Line parallel to Y at this X
      arr.push(v, -half, 0, v, half, 0);
    }

    const minorGeo = new THREE.BufferGeometry();
    minorGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorPos, 3));
    const majorGeo = new THREE.BufferGeometry();
    majorGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorPos, 3));
    return { minor: minorGeo, major: majorGeo };
  }, []);

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
 * Pure geometry — no Html overlays.
 */
export function AxisRulers() {
  const axes = useMemo(() => {
    const result: { geometry: THREE.BufferGeometry; color: string }[] = [];

    const configs: { axis: 'x' | 'y' | 'z'; color: string }[] = [
      { axis: 'x', color: AXIS_RULERS.colors.x },
      { axis: 'y', color: AXIS_RULERS.colors.y },
      { axis: 'z', color: AXIS_RULERS.colors.z },
    ];

    for (const { axis, color } of configs) {
      const positions: number[] = [];
      const half = AXIS_RULERS.length / 2;
      const start = axis === 'z' ? 0 : -half;
      const end = axis === 'z' ? AXIS_RULERS.length : half;

      // Main axis line
      if (axis === 'x') positions.push(start, 0, 0, end, 0, 0);
      else if (axis === 'y') positions.push(0, start, 0, 0, end, 0);
      else positions.push(0, 0, start, 0, 0, end);

      // Tick marks
      for (let v = start; v <= end + 0.001; v += AXIS_RULERS.tickSpacing) {
        if (Math.abs(v) < 0.001) continue;
        const isMajor = Math.abs(v % (AXIS_RULERS.tickSpacing * 5)) < 0.001;
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
  }, []);

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
 * Red on X, green on Y, blue on Z — like OpenSCAD.
 */
export function AxisLabels() {
  const labels = useMemo(() => {
    const result: { text: string; position: [number, number, number]; color: string }[] = [];
    const half = AXIS_RULERS.length / 2;

    // X axis (red) — labels along X, offset in Z
    for (let v = -half; v <= half + 0.001; v += AXIS_LABELS.spacing) {
      if (Math.abs(v) < 0.001) continue;
      result.push({ text: `${v}`, position: [v, 0, -AXIS_LABELS.offset], color: AXIS_LABELS.colors.x });
    }

    // Y axis (green) — labels along Y, offset in Z
    for (let v = -half; v <= half + 0.001; v += AXIS_LABELS.spacing) {
      if (Math.abs(v) < 0.001) continue;
      result.push({ text: `${v}`, position: [0, v, -AXIS_LABELS.offset], color: AXIS_LABELS.colors.y });
    }

    // Z axis (blue) — labels along Z, offset in X
    for (let v = AXIS_LABELS.spacing; v <= AXIS_RULERS.length + 0.001; v += AXIS_LABELS.spacing) {
      result.push({ text: `${v}`, position: [-AXIS_LABELS.offset, 0, v], color: AXIS_LABELS.colors.z });
    }

    return result;
  }, []);

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
