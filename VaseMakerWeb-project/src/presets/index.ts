/**
 * Preset registry — logic for loading and applying presets.
 * Preset data lives in @/config/presets.ts for easy editing.
 */

import type { VaseParameters } from '@/engine/types';
import { DEFAULT_PARAMETERS } from './defaults';

// Re-export preset data and types from config
export type { Preset } from '@/config/presets';
export { BUILT_IN_PRESETS } from '@/config/presets';

/**
 * Deep merge a partial parameter set with defaults.
 */
export function applyPreset(preset: { parameters: Partial<VaseParameters> }): VaseParameters {
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
