/**
 * Slider configuration — ranges for all sidebar controls.
 * Edit this file to tweak slider min/max/step values without touching components.
 */

import type { ShapeType, ShapeParams } from '@/engine/types';

/** Specification for a single slider control */
export type ParamSpec = {
  key: keyof ShapeParams;
  label: string;
  min: number;
  max: number;
  step: number;
};

/** Shape dropdown options (order matches the UI) */
export const SHAPE_OPTIONS: { value: ShapeType; label: string }[] = [
  { value: 'Astroid1', label: 'Astroid' },
  { value: 'Butterfly1', label: 'Butterfly' },
  { value: 'Cardioid1', label: 'Cardioid (sharp)' },
  { value: 'Cardioid2', label: 'Cardioid (smooth)' },
  { value: 'Cardioid3', label: 'Cardioid (offset)' },
  { value: 'Cassini1', label: 'Cassini Oval' },
  { value: 'Circle1', label: 'Circle' },
  { value: 'Cycloid1', label: 'Cycloid' },
  { value: 'Diamond1', label: 'Diamond' },
  { value: 'Egg1', label: 'Egg 1' },
  { value: 'Egg2', label: 'Egg 2' },
  { value: 'Ellipse1', label: 'Ellipse' },
  { value: 'Folium1', label: 'Folium' },
  { value: 'Gear1', label: 'Gear' },
  { value: 'Heart1', label: 'Heart' },
  { value: 'Infinity1', label: 'Infinity' },
  { value: 'Limacon1', label: 'Limacon' },
  { value: 'Lissajous1', label: 'Lissajous' },
  { value: 'Misc1', label: 'Misc' },
  { value: 'Nephroid1', label: 'Nephroid' },
  { value: 'Polygon1', label: 'Polygon' },
  { value: 'RationalRose1', label: 'Rational Rose' },
  { value: 'Rectangle1', label: 'Rectangle' },
  { value: 'Rose1', label: 'Rose' },
  { value: 'Spirograph1', label: 'Spirograph' },
  { value: 'Square1', label: 'Square' },
  { value: 'SuperEllipse1', label: 'SuperEllipse' },
  { value: 'SuperFormula1', label: 'SuperFormula' },
  { value: 'Teardrop1', label: 'Teardrop' },
];

/**
 * Shape-specific parameter slider ranges.
 * Only shapes with extra parameters beyond scaleFactor/offset are listed.
 */
export const SHAPE_PARAM_CONFIG: Partial<Record<ShapeType, ParamSpec[]>> = {
  Diamond1: [
    { key: 'scaleX', label: 'Scale X', min: 0.1, max: 3, step: 0.1 },
    { key: 'scaleY', label: 'Scale Y', min: 0.1, max: 3, step: 0.1 },
  ],
  Egg1: [
    { key: 'width', label: 'Width', min: 0.5, max: 5, step: 0.1 },
  ],
  Egg2: [
    { key: 'a', label: 'a', min: 0.1, max: 5, step: 0.1 },
    { key: 'b', label: 'b', min: 0.1, max: 5, step: 0.1 },
  ],
  Ellipse1: [
    { key: 'scaleX', label: 'Scale X', min: 0.1, max: 3, step: 0.1 },
    { key: 'scaleY', label: 'Scale Y', min: 0.1, max: 3, step: 0.1 },
  ],
  Infinity1: [
    { key: 'parameter1', label: 'Parameter', min: 1, max: 2, step: 0.01 },
  ],
  Misc1: [
    { key: 'a', label: 'a', min: 0.1, max: 5, step: 0.1 },
    { key: 'b', label: 'b', min: 0.1, max: 5, step: 0.1 },
  ],
  Polygon1: [
    { key: 'sides', label: 'Sides', min: 3, max: 12, step: 1 },
  ],
  Rectangle1: [
    { key: 'scaleX', label: 'Scale X', min: 0.1, max: 3, step: 0.1 },
    { key: 'scaleY', label: 'Scale Y', min: 0.1, max: 3, step: 0.1 },
  ],
  Rose1: [
    { key: 'centerSize', label: 'Center', min: 0, max: 3, step: 0.1 },
    { key: 'petalNumber', label: 'Petals', min: 2, max: 12, step: 1 },
  ],
  SuperEllipse1: [
    { key: 'n', label: 'Exponent', min: 0.5, max: 5, step: 0.1 },
    { key: 'scaleX', label: 'Scale X', min: 0.1, max: 3, step: 0.1 },
    { key: 'scaleY', label: 'Scale Y', min: 0.1, max: 3, step: 0.1 },
  ],
  SuperFormula1: [
    { key: 'a', label: 'a', min: 0.1, max: 5, step: 0.1 },
    { key: 'b', label: 'b', min: 0.1, max: 5, step: 0.1 },
    { key: 'm', label: 'm', min: 1, max: 12, step: 1 },
    { key: 'n1', label: 'n1', min: 0.1, max: 3, step: 0.1 },
    { key: 'n2', label: 'n2', min: 0.1, max: 3, step: 0.1 },
    { key: 'n3', label: 'n3', min: 0.1, max: 3, step: 0.1 },
  ],
  Astroid1: [
    { key: 'power', label: 'Power', min: 0.1, max: 2, step: 0.01 },
  ],
  Gear1: [
    { key: 'teeth', label: 'Teeth', min: 3, max: 60, step: 1 },
    { key: 'depth', label: 'Depth', min: 0.05, max: 1, step: 0.05 },
    { key: 'steepness', label: 'Steepness', min: 1, max: 10, step: 0.5 },
  ],
  Limacon1: [
    { key: 'a', label: 'a', min: 0.1, max: 5, step: 0.1 },
    { key: 'b', label: 'b', min: 0.1, max: 5, step: 0.1 },
  ],
  Lissajous1: [
    { key: 'a', label: 'Freq A', min: 1, max: 8, step: 1 },
    { key: 'b', label: 'Freq B', min: 1, max: 8, step: 1 },
    { key: 'phase', label: 'Phase', min: 0, max: 360, step: 5 },
  ],
  RationalRose1: [
    { key: 'p', label: 'p (num)', min: 1, max: 12, step: 1 },
    { key: 'q', label: 'q (den)', min: 1, max: 12, step: 1 },
    { key: 'centerSize', label: 'Center', min: 0, max: 3, step: 0.1 },
  ],
  Spirograph1: [
    { key: 'bigR', label: 'Big R', min: 1, max: 8, step: 0.5 },
    { key: 'smallR', label: 'Small R', min: 0.5, max: 5, step: 0.5 },
    { key: 'd', label: 'Pen Dist', min: 0.1, max: 2, step: 0.1 },
  ],
  Cassini1: [
    { key: 'eccentricity', label: 'Pinch', min: 1.05, max: 3, step: 0.05 },
  ],
  Cycloid1: [
    { key: 'cusps', label: 'Cusps', min: 2, max: 8, step: 1 },
    { key: 'mode', label: 'Epi/Hypo', min: 0, max: 1, step: 0.05 },
  ],
  Teardrop1: [
    { key: 'pointiness', label: 'Pointiness', min: 0.5, max: 5, step: 0.1 },
  ],
  Nephroid1: [
    { key: 'indent', label: 'Indent', min: 0, max: 1, step: 0.05 },
  ],
};

/** Universal transform parameters shown for all shapes */
export const UNIVERSAL_PARAMS: ParamSpec[] = [
  { key: 'scaleFactor', label: 'Scale', min: 0.1, max: 3, step: 0.1 },
  { key: 'offsetX', label: 'Offset X', min: -50, max: 50, step: 1 },
  { key: 'offsetY', label: 'Offset Y', min: -50, max: 50, step: 1 },
];

/** Generic slider range spec (not tied to ShapeParams keys) */
export type SliderRange = { min: number; max: number; step: number };

/** Vase dimensions */
export const DIMENSIONS = {
  radius: { min: 10, max: 100, step: 1 } as SliderRange,
  height: { min: 10, max: 300, step: 1 } as SliderRange,
} as const;

/** Bezier twist slider ranges */
export const BEZIER_TWIST = {
  point: { min: -180, max: 180, step: 1 } as SliderRange,
} as const;

/** Sine twist slider ranges */
export const SINE_TWIST = {
  cycles:     { min: 0, max: 6, step: 1 } as SliderRange,
  maxDegrees: { min: -180, max: 180, step: 1 } as SliderRange,
} as const;

/** Vertical smoothing slider ranges */
export const VERTICAL_SMOOTHING = {
  cycles:       { min: 0, max: 10, step: 1 } as SliderRange,
  startPercent: { min: 0, max: 100, step: 1 } as SliderRange,
} as const;

/** Radial smoothing slider ranges */
export const RADIAL_SMOOTHING = {
  cycles:      { min: 0, max: 10, step: 1 } as SliderRange,
  offsetAngle: { min: -180, max: 180, step: 1 } as SliderRange,
} as const;

/** Texture slider ranges */
export const TEXTURES = {
  fluting: {
    count: { min: 3, max: 60, step: 1 } as SliderRange,
    depth: { min: 0.1, max: 10, step: 0.1 } as SliderRange,
    duty:  { min: 0, max: 0.9, step: 0.05 } as SliderRange,
  },
  basketWeave: {
    bands: { min: 3, max: 30, step: 1 } as SliderRange,
    waves: { min: 3, max: 30, step: 1 } as SliderRange,
    depth: { min: 0.1, max: 10, step: 0.1 } as SliderRange,
  },
  voronoi: {
    scale: { min: 5, max: 50, step: 1 } as SliderRange,
    depth: { min: 0.05, max: 5, step: 0.05 } as SliderRange,
    edgeWidth: { min: 0, max: 1, step: 0.05 } as SliderRange,
    seed: { min: 0, max: 99, step: 1 } as SliderRange,
  },
  simplex: {
    scale: { min: 1, max: 50, step: 1 } as SliderRange,
    depth: { min: 0.05, max: 5, step: 0.05 } as SliderRange,
    octaves: { min: 1, max: 6, step: 1 } as SliderRange,
    persistence: { min: 0.1, max: 0.9, step: 0.05 } as SliderRange,
    lacunarity: { min: 1.5, max: 3, step: 0.1 } as SliderRange,
    seed: { min: 0, max: 99, step: 1 } as SliderRange,
  },
  woodGrain: {
    count: { min: 5, max: 80, step: 1 } as SliderRange,
    depth: { min: 0.1, max: 5, step: 0.1 } as SliderRange,
    wobble: { min: 0, max: 1, step: 0.05 } as SliderRange,
    sharpness: { min: 0, max: 1, step: 0.05 } as SliderRange,
    seed: { min: 0, max: 99, step: 1 } as SliderRange,
  },
  svgPattern: {
    repeatX: { min: 1, max: 50, step: 1 } as SliderRange,
    repeatY: { min: 1, max: 60, step: 1 } as SliderRange,
    depth: { min: 0.1, max: 5, step: 0.1 } as SliderRange,
  },
  squareFlute: {
    count:     { min: 3, max: 80, step: 1 } as SliderRange,
    depth:     { min: 0.1, max: 10, step: 0.1 } as SliderRange,
    duty:      { min: 0.1, max: 0.9, step: 0.05 } as SliderRange,
    sharpness: { min: 0, max: 1, step: 0.05 } as SliderRange,
  },
  waves: {
    count: { min: 3, max: 60, step: 1 } as SliderRange,
    depth: { min: 0.1, max: 10, step: 0.1 } as SliderRange,
    duty:  { min: 0, max: 0.9, step: 0.05 } as SliderRange,
  },
  rods: {
    count: { min: 3, max: 60, step: 1 } as SliderRange,
    depth: { min: 0.1, max: 10, step: 0.1 } as SliderRange,
    duty:  { min: 0, max: 0.9, step: 0.05 } as SliderRange,
  },
  verticalFluting: {
    count: { min: 1, max: 60, step: 1 } as SliderRange,
    depth: { min: 0.1, max: 10, step: 0.1 } as SliderRange,
    duty:  { min: 0, max: 0.9, step: 0.05 } as SliderRange,
  },
  verticalSquareFlute: {
    count:     { min: 1, max: 80, step: 1 } as SliderRange,
    depth:     { min: 0.1, max: 10, step: 0.1 } as SliderRange,
    duty:      { min: 0.1, max: 0.9, step: 0.05 } as SliderRange,
    sharpness: { min: 0, max: 1, step: 0.05 } as SliderRange,
  },
  verticalWaves: {
    count: { min: 1, max: 60, step: 1 } as SliderRange,
    depth: { min: 0.1, max: 10, step: 0.1 } as SliderRange,
    duty:  { min: 0, max: 0.9, step: 0.05 } as SliderRange,
  },
  verticalRods: {
    count: { min: 1, max: 60, step: 1 } as SliderRange,
    depth: { min: 0.1, max: 10, step: 0.1 } as SliderRange,
    duty:  { min: 0, max: 0.9, step: 0.05 } as SliderRange,
  },
} as const;

/** Mesh resolution — defaults and slider ranges */
export const RESOLUTION = {
  defaults: { vertical: 200, radial: 360 },
  vertical: { min: 8, max: 500, step: 1 } as SliderRange,
  radial:   { min: 8, max: 720, step: 1 } as SliderRange,
} as const;

/** Smooth zones slider ranges */
export const SMOOTH_ZONES = {
  basePercent: { min: 0, max: 100, step: 1 } as SliderRange,
  rimPercent:  { min: 0, max: 100, step: 1 } as SliderRange,
  baseFade:    { min: 0, max: 100, step: 1 } as SliderRange,
  rimFade:     { min: 0, max: 100, step: 1 } as SliderRange,
} as const;

/** Shell / wall thickness slider ranges */
export const SHELL = {
  wallThickness:    { min: 0, max: 5, step: 0.1 } as SliderRange,
  bottomThickness:  { min: 0, max: 5, step: 0.1 } as SliderRange,
  minWallThickness: { min: 0.1, max: 5, step: 0.1 } as SliderRange,
} as const;

/** Default vase appearance */
export const APPEARANCE = {
  defaultColor: '#6d9fff',
} as const;

/** Bezier offset slider ranges */
export const BEZIER_OFFSET = {
  scaleX: { min: 0, max: 50, step: 1 } as SliderRange,
  scaleY: { min: 0, max: 50, step: 1 } as SliderRange,
} as const;
