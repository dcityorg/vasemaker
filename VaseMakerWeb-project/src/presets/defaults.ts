/**
 * Default parameter values for all shapes and vase settings.
 * These match the defaults from VaseMaker13 A.scad.
 */

import type { VaseParameters, ShapeType, ShapeParams } from '@/engine/types';
import { RESOLUTION, APPEARANCE } from '@/config/shape-params';

/** Default shape params for each shape type */
function defaultShapeParams(): Record<ShapeType, ShapeParams> {
  return {
    Butterfly1:    { scaleFactor: 0.2,  offsetX: 0,   offsetY: 0 },
    Cardioid1:     { scaleFactor: 0.7,  offsetX: 0,   offsetY: 17 },
    Cardioid2:     { scaleFactor: 0.3,  offsetX: 12,  offsetY: 0 },
    Cardioid3:     { scaleFactor: 0.3,  offsetX: 0,   offsetY: -6 },
    Circle1:       { scaleFactor: 1,    offsetX: 0,   offsetY: 0 },
    Diamond1:      { scaleFactor: 1,    offsetX: 0,   offsetY: 0, scaleX: 1, scaleY: 1 },
    Egg1:          { scaleFactor: 1,    offsetX: 0,   offsetY: -30, width: 2.5 },
    Egg2:          { scaleFactor: 0.3,  offsetX: 0,   offsetY: 0, a: 0.9, b: 2.4 },
    Ellipse1:      { scaleFactor: 1,    offsetX: 0,   offsetY: 0, scaleX: 0.6, scaleY: 1.2 },
    Heart1:        { scaleFactor: 1.7,  offsetX: -12, offsetY: 0 },
    Infinity1:     { scaleFactor: 1,    offsetX: 0,   offsetY: 0, parameter1: 1.02 },
    Misc1:         { scaleFactor: 1,    offsetX: 0,   offsetY: 0, a: 3, b: 1 },
    Polygon1:      { scaleFactor: 1,    offsetX: 0,   offsetY: 0, sides: 5 },
    Rectangle1:    { scaleFactor: 1,    offsetX: 0,   offsetY: 0, scaleX: 1, scaleY: 1.5 },
    Rose1:         { scaleFactor: 1,    offsetX: 0,   offsetY: 0, centerSize: 1.5, petalNumber: 4 },
    Square1:       { scaleFactor: 1,    offsetX: 0,   offsetY: 0 },
    Astroid1:      { scaleFactor: 0.61, offsetX: 0,   offsetY: 0, power: 0.667 },
    Folium1:       { scaleFactor: 1,    offsetX: 0,   offsetY: 0 },
    Gear1:         { scaleFactor: 0.77, offsetX: 0,   offsetY: 0, teeth: 8, depth: 0.3, steepness: 4 },
    Limacon1:      { scaleFactor: 1.44, offsetX: -33, offsetY: 0, a: 1.5, b: 1 },
    Lissajous1:    { scaleFactor: 1,    offsetX: 0,   offsetY: 0, a: 3, b: 2, phase: 90 },
    RationalRose1: { scaleFactor: 1,    offsetX: 0,   offsetY: 0, p: 3, q: 2, centerSize: 0.5 },
    Spirograph1:   { scaleFactor: 1,    offsetX: 0,   offsetY: 0, bigR: 3, smallR: 1, d: 0.5 },
    SuperEllipse1: { scaleFactor: 1,    offsetX: 0,   offsetY: 0, n: 2.8, scaleX: 0.6, scaleY: 1 },
    SuperFormula1: { scaleFactor: 1,    offsetX: 0,   offsetY: 0, a: 1, b: 1, m: 2, n1: 0.4, n2: 1, n3: 2 },
  };
}

/** Default top shape params (same structure, some values differ) */
function defaultTopShapeParams(): Record<ShapeType, ShapeParams> {
  return {
    Butterfly1:    { scaleFactor: 0.2,  offsetX: 0, offsetY: 0 },
    Cardioid1:     { scaleFactor: 0.7,  offsetX: 0, offsetY: 0 },
    Cardioid2:     { scaleFactor: 0.3,  offsetX: 0, offsetY: 0 },
    Cardioid3:     { scaleFactor: 0.3,  offsetX: 0, offsetY: 0 },
    Circle1:       { scaleFactor: 1,    offsetX: 0, offsetY: 0 },
    Diamond1:      { scaleFactor: 1,    offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
    Egg1:          { scaleFactor: 1,    offsetX: 0, offsetY: 0, width: 2.5 },
    Egg2:          { scaleFactor: 0.3,  offsetX: 0, offsetY: 0, a: 0.9, b: 2.4 },
    Ellipse1:      { scaleFactor: 1,    offsetX: 0, offsetY: 0, scaleX: 0.6, scaleY: 1.2 },
    Heart1:        { scaleFactor: 1.7,  offsetX: 0, offsetY: 0 },
    Infinity1:     { scaleFactor: 1,    offsetX: 0, offsetY: 0, parameter1: 1.02 },
    Misc1:         { scaleFactor: 1,    offsetX: 0, offsetY: 0, a: 3, b: 1 },
    Polygon1:      { scaleFactor: 1,    offsetX: 0, offsetY: 0, sides: 5 },
    Rectangle1:    { scaleFactor: 1,    offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1.5 },
    Rose1:         { scaleFactor: 1,    offsetX: 0, offsetY: 0, centerSize: 1.5, petalNumber: 4 },
    Square1:       { scaleFactor: 1,    offsetX: 0, offsetY: 0 },
    Astroid1:      { scaleFactor: 0.61, offsetX: 0, offsetY: 0, power: 0.667 },
    Folium1:       { scaleFactor: 1,    offsetX: 0, offsetY: 0 },
    Gear1:         { scaleFactor: 0.77, offsetX: 0, offsetY: 0, teeth: 8, depth: 0.3, steepness: 4 },
    Limacon1:      { scaleFactor: 1.44, offsetX: -33, offsetY: 0, a: 1.5, b: 1 },
    Lissajous1:    { scaleFactor: 1,    offsetX: 0, offsetY: 0, a: 3, b: 2, phase: 90 },
    RationalRose1: { scaleFactor: 1,    offsetX: 0, offsetY: 0, p: 3, q: 2, centerSize: 0.5 },
    Spirograph1:   { scaleFactor: 1,    offsetX: 0, offsetY: 0, bigR: 3, smallR: 1, d: 0.5 },
    SuperEllipse1: { scaleFactor: 1,    offsetX: 0, offsetY: 0, n: 2.8, scaleX: 0.6, scaleY: 1 },
    SuperFormula1: { scaleFactor: 1,    offsetX: 0, offsetY: 0, a: 1, b: 1, m: 2, n1: 0.4, n2: 1, n3: 2 },
  };
}

export const DEFAULT_PARAMETERS: VaseParameters = {
  radius: 30,
  height: 100,

  profileEnabled: true,
  profilePoints: [
    [0.8, 0],     // bottom — slightly narrower base
    [1.2, 0.2],   // widens out
    [0.7, 0.5],   // narrows at waist
    [0.9, 0.75],  // flares toward top
    [1.1, 0.9],   // wide opening
    [1.0, 1.0],   // top — clean rim
  ],

  bottomShape: 'Circle1',
  topShape: 'Circle1',
  morphEnabled: false,

  bottomShapeParams: defaultShapeParams(),
  topShapeParams: defaultTopShapeParams(),

  radialRipple: { enabled: false, count: 6, depth: 4 },
  verticalRipple: { enabled: false, count: 20, depth: 1 },

  bezierTwist: { enabled: false, points: [0, 0, 0, 0, 0] },
  sineTwist: { enabled: false, cycles: 2, maxDegrees: 50 },

  verticalSmoothing: { enabled: false, cycles: 3, startPercent: 0 },
  radialSmoothing: { enabled: false, cycles: 3, offsetAngle: 0 },

  fixedOffset: { x: 0, y: 0 },
  bezierOffset: {
    enabled: false,
    scaleX: 10,
    scaleY: 10,
    points: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  },

  textures: {
    enabled: true,
    fluting: { enabled: false, count: 12, depth: 2 },
    basketWeave: { enabled: false, bands: 8, waves: 12, depth: 1.5 },
    voronoi: { enabled: false, scale: 20, depth: 0.5, edgeWidth: 0.5, seed: 0 },
    simplex: { enabled: false, scale: 10, depth: 1.0, octaves: 3, persistence: 0.5, lacunarity: 2.0, seed: 0 },
  },

  resolution: { ...RESOLUTION.defaults },
  flatShading: false,

  wallThickness: 0.8,
  bottomThickness: 2,
  rimShape: 'rounded',
  smoothInner: false,
  minWallThickness: 0.4,

  color: APPEARANCE.defaultColor,
};
