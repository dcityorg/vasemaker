'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * Ground grid on the XY plane at Z=0.
 */
export function GroundGrid({ size = 200, cellSize = 10, sectionSize = 50 }: {
  size?: number;
  cellSize?: number;
  sectionSize?: number;
}) {
  const { minor, major } = useMemo(() => {
    const minorPos: number[] = [];
    const majorPos: number[] = [];
    const half = size / 2;

    for (let v = -half; v <= half + 0.001; v += cellSize) {
      const isMajor = Math.abs(v % sectionSize) < 0.001;
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
  }, [size, cellSize, sectionSize]);

  return (
    <group>
      <lineSegments geometry={minor}>
        <lineBasicMaterial color="#282828" />
      </lineSegments>
      <lineSegments geometry={major}>
        <lineBasicMaterial color="#3a3a3a" />
      </lineSegments>
    </group>
  );
}

/**
 * Axis rulers with tick marks along X, Y, Z.
 * Pure geometry — no Html overlays.
 */
export function AxisRulers({ length = 200, tickSpacing = 10 }: {
  length?: number;
  tickSpacing?: number;
}) {
  const axes = useMemo(() => {
    const result: { geometry: THREE.BufferGeometry; color: string }[] = [];

    const configs: { axis: 'x' | 'y' | 'z'; color: string }[] = [
      { axis: 'x', color: '#ff4444' },
      { axis: 'y', color: '#44ff44' },
      { axis: 'z', color: '#4488ff' },
    ];

    for (const { axis, color } of configs) {
      const positions: number[] = [];
      const tickSize = 2;
      const half = length / 2;
      const start = axis === 'z' ? 0 : -half;
      const end = axis === 'z' ? length : half;

      // Main axis line
      if (axis === 'x') positions.push(start, 0, 0, end, 0, 0);
      else if (axis === 'y') positions.push(0, start, 0, 0, end, 0);
      else positions.push(0, 0, start, 0, 0, end);

      // Tick marks
      for (let v = start; v <= end + 0.001; v += tickSpacing) {
        if (Math.abs(v) < 0.001) continue;
        const isMajor = Math.abs(v % (tickSpacing * 5)) < 0.001;
        const sz = isMajor ? tickSize * 2 : tickSize;

        if (axis === 'x') positions.push(v, 0, -sz, v, 0, sz);
        else if (axis === 'y') positions.push(0, v, -sz, 0, v, sz);
        else positions.push(-sz, 0, v, sz, 0, v);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      result.push({ geometry: geo, color });
    }

    return result;
  }, [length, tickSpacing]);

  return (
    <group>
      {axes.map(({ geometry, color }, i) => (
        <lineSegments key={i} geometry={geometry}>
          <lineBasicMaterial color={color} transparent opacity={0.4} />
        </lineSegments>
      ))}
    </group>
  );
}

/**
 * Numeric labels at major grid lines (every 50mm) along the grid edges.
 * Uses canvas-textured sprites so they always face the camera.
 */
export function GridLabels({ size = 200, spacing = 50 }: {
  size?: number;
  spacing?: number;
}) {
  const sprites = useMemo(() => {
    const labels: { text: string; position: [number, number, number] }[] = [];
    const half = size / 2;

    for (let v = -half; v <= half + 0.001; v += spacing) {
      if (Math.abs(v) < 0.001) continue;
      const label = `${v}`;
      // X axis labels along the -Y edge of the grid
      labels.push({ text: label, position: [v, -half - 6, 0] });
      // Y axis labels along the -X edge of the grid
      labels.push({ text: label, position: [-half - 6, v, 0] });
    }

    // Z axis labels (0 to size, every spacing)
    for (let v = spacing; v <= size + 0.001; v += spacing) {
      labels.push({ text: `${v}`, position: [-6, -6, v] });
    }

    return labels;
  }, [size, spacing]);

  return (
    <group>
      {sprites.map(({ text, position }, i) => (
        <TextSprite key={i} text={text} position={position} />
      ))}
    </group>
  );
}

/** A single text label rendered as a sprite with a canvas texture. */
function TextSprite({ text, position }: {
  text: string;
  position: [number, number, number];
}) {
  const { map, scale } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const fontSize = 48;
    ctx.font = `${fontSize}px monospace`;
    const metrics = ctx.measureText(text);
    const w = Math.ceil(metrics.width) + 8;
    const h = fontSize + 8;
    canvas.width = w;
    canvas.height = h;
    // Redraw after resize
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = '#888888';
    ctx.textBaseline = 'top';
    ctx.fillText(text, 4, 4);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    // Scale sprite to world units (roughly 1 world unit per 8px)
    const worldScale: [number, number, number] = [w / 8, h / 8, 1];
    return { map: texture, scale: worldScale };
  }, [text]);

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
      { dir: [1, 0, 0] as const, color: '#ff4444' },
      { dir: [0, 1, 0] as const, color: '#44ff44' },
      { dir: [0, 0, 1] as const, color: '#4488ff' },
    ];

    const geos: { lineGeo: THREE.BufferGeometry; color: string }[] = [];
    for (const { dir, color } of axes) {
      const scale = 15;
      const positions = [0, 0, 0, dir[0] * scale, dir[1] * scale, dir[2] * scale];
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
