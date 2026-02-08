/**
 * Viewport configuration — camera, lighting, grid, axes, and controls.
 * Edit this file to tweak visual settings without touching components.
 */

export const CAMERA = {
  position: [80, 80, 120] as [number, number, number],
  fov: 50,
  near: 0.1,
  far: 2000,
  target: [0, 0, 50] as [number, number, number],
} as const;

export const ORBIT_CONTROLS = {
  dampingFactor: 0.1,
  minDistance: 30,
  maxDistance: 500,
} as const;

export const LIGHTING = {
  ambient: { intensity: 0.4 },
  main: { position: [100, 150, 100] as [number, number, number], intensity: 1 },
  fill: { position: [-50, 80, -50] as [number, number, number], intensity: 0.3 },
} as const;

export const GRID = {
  size: 200,
  cellSize: 10,
  sectionSize: 50,
  minorColor: '#282828',
  majorColor: '#3a3a3a',
} as const;

export const AXIS_RULERS = {
  length: 200,
  tickSpacing: 10,
  tickSize: 2,
  majorTickMultiplier: 2,
  opacity: 0.4,
  colors: {
    x: '#ff4444',
    y: '#44ff44',
    z: '#4488ff',
  },
} as const;

export const AXIS_LABELS = {
  spacing: 50,
  offset: 5,
  fontSize: 48,
  fontStyle: 'bold',
  fontFamily: 'monospace',
  /** Dimmed label colors (25% of full axis colors) */
  colors: {
    x: '#662222',
    y: '#226622',
    z: '#223366',
  },
} as const;

export const AXIS_GIZMO = {
  scale: 15,
  colors: {
    x: '#ff4444',
    y: '#44ff44',
    z: '#4488ff',
  },
} as const;
