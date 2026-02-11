/**
 * Built-in vase presets — data only.
 * Edit this file to add, remove, or tweak presets.
 */

import type { VaseParameters } from '@/engine/types';

export interface Preset {
  name: string;
  description: string;
  parameters: Partial<VaseParameters>;
}

export const BUILT_IN_PRESETS: Preset[] = [
  {
    name: 'Simple Vase',
    description: 'A classic circle-based vase with gentle curves',
    parameters: {},
  },
  {
    name: 'Vase Twins 1',
    description: 'Cardioid-to-Infinity morph with Bezier twist (from OpenSCAD)',
    parameters: {
      bottomShape: 'Cardioid2',
      topShape: 'Infinity1',
      morphEnabled: true,
      profilePoints: [
        [1.0, 0],
        [1.6, 0.2],
        [1.1, 0.4],
        [1.0, 0.6],
        [0.6, 0.8],
        [0.6, 1.0],
      ],
      bezierTwist: { enabled: true, points: [0, 0, 167, 0, 0] },
    },
  },
  {
    name: 'Rippled Star',
    description: 'Rose shape with radial ripples and vertical smoothing',
    parameters: {
      bottomShape: 'Rose1',
      radialRipple: { enabled: true, count: 6, depth: 4 },
      verticalSmoothing: { enabled: true, cycles: 3, startPercent: 0 },
    },
  },
  {
    name: 'Twisted Pentagon',
    description: 'Pentagon base with gentle twist',
    parameters: {
      bottomShape: 'Polygon1',
      bezierTwist: { enabled: true, points: [0, 30, 60, 90, 120] },
    },
  },
  {
    name: 'SuperFormula Exotic',
    description: 'Explore the Gielis superformula',
    parameters: {
      bottomShape: 'SuperFormula1',
    },
  },
  {
    name: 'Wood Grain 1',
    description: 'Organic vertical grain texture',
    parameters: {
      profilePoints: [
        [1.0, 0], [1.0, 0.2], [1.0, 0.4], [1.0, 0.6], [1.0, 0.8], [1.0, 1.0],
      ],
      textures: {
        enabled: true,
        fluting: { enabled: false, count: 12, depth: 2 },
        basketWeave: { enabled: false, bands: 8, waves: 12, depth: 1.5 },
        voronoi: { enabled: false, scale: 20, depth: 0.5, edgeWidth: 0.5, seed: 0 },
        simplex: { enabled: false, scale: 10, depth: 1.0, octaves: 3, persistence: 0.5, lacunarity: 2.0, seed: 0 },
        woodGrain: { enabled: true, count: 43, depth: 2.2, wobble: 0.05, sharpness: 0.1, seed: 32 },
        svgPattern: { enabled: false, svgText: '', repeatX: 12, repeatY: 8, depth: 1.0, invert: false },
      },
      resolution: { vertical: 100, radial: 200 },
    },
  },
];
