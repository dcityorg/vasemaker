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
];
