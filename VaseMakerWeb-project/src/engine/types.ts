/** All available cross-section shape types */
export type ShapeType =
  | 'Butterfly1'
  | 'Cardioid1'
  | 'Cardioid2'
  | 'Cardioid3'
  | 'Circle1'
  | 'Diamond1'
  | 'Egg1'
  | 'Egg2'
  | 'Ellipse1'
  | 'Heart1'
  | 'Infinity1'
  | 'Misc1'
  | 'Polygon1'
  | 'Rectangle1'
  | 'Rose1'
  | 'Square1'
  | 'SuperEllipse1'
  | 'SuperFormula1';

/** Parameters specific to each shape */
export interface ShapeParams {
  scaleFactor: number;
  offsetX: number;
  offsetY: number;
  // Shape-specific extras
  scaleX?: number;
  scaleY?: number;
  width?: number;         // Egg1
  a?: number;             // Egg2, SuperFormula1, Misc1
  b?: number;             // Egg2, SuperFormula1, Misc1
  parameter1?: number;    // Infinity1
  sides?: number;         // Polygon1
  centerSize?: number;    // Rose1
  petalNumber?: number;   // Rose1
  n?: number;             // SuperEllipse1
  m?: number;             // SuperFormula1
  n1?: number;            // SuperFormula1
  n2?: number;            // SuperFormula1
  n3?: number;            // SuperFormula1
}

/** A Bezier control point: [value, heightFraction] */
export type BezierPoint = [number, number];

/** Complete set of vase parameters */
export interface VaseParameters {
  // Dimensions
  radius: number;
  height: number;

  // Vertical profile — Bezier control points [radiusMultiplier, heightFraction]
  profileEnabled: boolean;
  profilePoints: BezierPoint[];

  // Cross-section shapes
  bottomShape: ShapeType;
  topShape: ShapeType;
  morphEnabled: boolean;

  // Per-shape parameters for bottom and top
  bottomShapeParams: Record<ShapeType, ShapeParams>;
  topShapeParams: Record<ShapeType, ShapeParams>;

  // Radial ripples
  radialRipple: {
    enabled: boolean;
    count: number;
    depth: number;
  };

  // Vertical ripples
  verticalRipple: {
    enabled: boolean;
    count: number;
    depth: number;
  };

  // Bezier twist
  bezierTwist: {
    enabled: boolean;
    points: number[];
  };

  // Sine twist
  sineTwist: {
    enabled: boolean;
    cycles: number;
    maxDegrees: number;
  };

  // Vertical smoothing
  verticalSmoothing: {
    enabled: boolean;
    cycles: number;
    startPercent: number;
  };

  // Radial smoothing
  radialSmoothing: {
    enabled: boolean;
    cycles: number;
    offsetAngle: number;
  };

  // Fixed offset
  fixedOffset: {
    x: number;
    y: number;
  };

  // Bezier XY offset
  bezierOffset: {
    enabled: boolean;
    scaleX: number;
    scaleY: number;
    points: [number, number][];
  };

  // Resolution
  previewResolution: {
    vertical: number;
    radial: number;
  };
  exportResolution: {
    vertical: number;
    radial: number;
  };

  // Shell (new — not in OpenSCAD)
  wallThickness: number;        // mm, 0 = no shell (thin surface)
  bottomThickness: number;      // mm, 0 = no base
  rimShape: 'flat' | 'rounded'; // only used when wallThickness > 0

  // Appearance
  color: string;                // hex color for preview (e.g. '#6d9fff')
}

/** Generated mesh data ready for Three.js */
export interface VaseMesh {
  positions: Float32Array;   // xyz vertex positions (3 floats per vertex)
  normals: Float32Array;     // xyz normals (3 floats per vertex)
  indices: Uint32Array;      // triangle indices
  vertexCount: number;
  triangleCount: number;
}
