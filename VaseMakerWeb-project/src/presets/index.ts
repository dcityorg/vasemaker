/**
 * Preset registry — built-in vase presets.
 * Includes defaults and presets ported from the OpenSCAD JSON files.
 */

import type { VaseParameters } from '@/engine/types';
import { DEFAULT_PARAMETERS } from './defaults';

export interface Preset {
  name: string;
  description: string;
  parameters: Partial<VaseParameters>;
}

/**
 * Built-in presets. Each is a partial override of DEFAULT_PARAMETERS.
 * We deep-merge these with defaults when loading.
 */
export const BUILT_IN_PRESETS: Preset[] = [
  {
    name: 'Simple Vase',
    description: 'A classic circle-based vase with gentle curves',
    parameters: {}, // just the defaults
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

/**
 * Deep merge a partial parameter set with defaults.
 */
export function applyPreset(preset: Preset): VaseParameters {
  return deepMerge(DEFAULT_PARAMETERS, preset.parameters);
}

/** Simple deep merge (source overrides target) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
      targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }
  return result;
}
