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
  | 'Piriform1'
  | 'Polygon1'
  | 'Rectangle1'
  | 'Rose1'
  | 'Square1'
  | 'Astroid1'
  | 'Folium1'
  | 'Gear1'
  | 'Limacon1'
  | 'Lissajous1'
  | 'RationalRose1'
  | 'Spirograph1'
  | 'SuperEllipse1'
  | 'SuperFormula1'
  | 'Cassini1'
  | 'Cycloid1'
  | 'Teardrop1'
  | 'Nephroid1';

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
  // New shapes
  bigR?: number;          // Spirograph1
  smallR?: number;        // Spirograph1
  d?: number;             // Spirograph1
  power?: number;         // Astroid1
  p?: number;             // RationalRose1
  q?: number;             // RationalRose1
  phase?: number;         // Lissajous1
  teeth?: number;         // Gear1
  depth?: number;         // Gear1
  steepness?: number;     // Gear1
  rounding?: number;      // Square1, Rectangle1
  eccentricity?: number;  // Cassini1
  cusps?: number;         // Cycloid1
  mode?: number;          // Cycloid1 (0=epicycloid, 1=hypocycloid)
  pointiness?: number;    // Teardrop1
  indent?: number;        // Nephroid1
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
  resolution: {
    vertical: number;
    radial: number;
  };
  flatShading: boolean;

  // Textures
  textures: {
    enabled: boolean;
    fluting: {
      enabled: boolean;
      count: number;    // number of flutes around circumference
      depth: number;    // groove depth in mm
      duty: number;     // groove width ratio (0=narrow grooves, 0.9=wide grooves)
    };
    basketWeave: {
      enabled: boolean;
      bands: number;    // number of horizontal bands
      waves: number;    // number of waves around circumference
      depth: number;    // weave depth in mm
    };
    voronoi: {
      enabled: boolean;
      scale: number;    // number of cells around circumference
      depth: number;    // emboss height in mm
      edgeWidth: number; // edge sharpness 0–1
      seed: number;     // pattern variation 0–99
      cutout?: boolean; // when true, punch holes through wall at cell centers
    };
    simplex: {
      enabled: boolean;
      scale: number;      // feature size (higher = more features)
      depth: number;      // displacement amplitude in mm
      octaves: number;    // detail layers (1=smooth, 6=craggy)
      persistence: number; // amplitude decay per octave
      lacunarity: number;  // frequency multiplier per octave
      seed: number;       // pattern variation 0–99
    };
    woodGrain: {
      enabled: boolean;
      count: number;      // number of grain lines around circumference
      depth: number;      // groove depth in mm
      wobble: number;     // how much lines meander (0–1)
      sharpness: number;  // edge hardness (0=soft, 1=sharp)
      seed: number;       // pattern variation 0–99
    };
    svgPattern: {
      enabled: boolean;
      svgText: string;      // raw SVG markup (stored in save files)
      repeatX: number;      // tiles around circumference (1–50)
      repeatY: number;      // tiles up height (1–30)
      depth: number;        // displacement in mm (0.1–5)
      invert: boolean;      // swap grooves/ridges
      cutout?: boolean;     // when true, punch holes through wall at dark areas
    };
    squareFlute: {
      enabled: boolean;
      count: number;        // number of flutes around circumference
      depth: number;        // groove depth in mm
      duty: number;         // ratio of flat-top width to period (0.1–0.9)
      sharpness: number;    // edge transition (0=rounded, 1=perfectly square)
    };
    waves: {
      enabled: boolean;
      count: number;        // number of wave lobes around circumference
      depth: number;        // wave height outward in mm
      duty: number;         // wave width ratio (0=touching, 0.9=narrow lobes)
    };
    rods: {
      enabled: boolean;
      count: number;        // number of semicircular rods around circumference
      depth: number;        // rod height outward in mm
      duty: number;         // gap ratio (0=touching, 0.9=narrow rods with wide gaps)
    };
    verticalFluting: {
      enabled: boolean;
      count: number;        // number of horizontal flute bands up the height
      depth: number;        // groove depth in mm
      duty: number;         // groove width ratio (0=narrow grooves, 0.9=wide grooves)
    };
    verticalSquareFlute: {
      enabled: boolean;
      count: number;        // number of horizontal square-flute bands
      depth: number;        // channel depth in mm
      duty: number;         // pillar-to-groove ratio (0.1–0.9)
      sharpness: number;    // edge transition (0=rounded, 1=perfectly square)
    };
    verticalWaves: {
      enabled: boolean;
      count: number;        // number of wave bands up the height
      depth: number;        // wave height outward in mm
      duty: number;         // wave width ratio (0=touching, 0.9=narrow lobes)
    };
    verticalRods: {
      enabled: boolean;
      count: number;        // number of rod bands up the height
      depth: number;        // rod height outward in mm
      duty: number;         // gap ratio (0=touching, 0.9=narrow rods)
    };
  };

  // Shell (new — not in OpenSCAD)
  wallThickness: number;        // mm, 0 = no shell (thin surface)
  bottomThickness: number;      // mm, 0 = no base
  rimShape: 'flat' | 'rounded'; // only used when wallThickness > 0
  smoothInner: boolean;         // when true, inner wall ignores textures
  minWallThickness: number;     // mm, minimum wall thickness when smoothInner is on

  // Smooth zones — suppress ripples & textures near base/rim
  smoothZones: {
    enabled: boolean;             // master toggle
    basePercent: number;          // 0–50: % of vase height
    rimPercent: number;           // 0–50: % of vase height
    baseFade: number;             // 0–100: % of base zone that fades (0=hard, 100=full ramp)
    rimFade: number;              // 0–100: % of rim zone that fades (0=hard, 100=full ramp)
  };

  // Appearance
  color: string;                // hex color for preview (e.g. '#6d9fff')
  showRulers: boolean;          // show axis lines, tick marks, and dimension labels
}

/** Generated mesh data ready for Three.js */
export interface VaseMesh {
  positions: Float32Array;   // xyz vertex positions (3 floats per vertex)
  normals: Float32Array;     // xyz normals (3 floats per vertex)
  indices: Uint32Array;      // triangle indices
  vertexCount: number;
  triangleCount: number;
}
