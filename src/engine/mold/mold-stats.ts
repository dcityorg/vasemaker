/**
 * Material estimates for MoldMaker — converts the mold's plaster volume into
 * approximate plaster-powder and water weights for a chosen plaster material.
 */

import { PLASTER_MATERIALS } from '@/config/mold-params';
import type { PlasterType } from './mold-types';

export interface PlasterEstimate {
  volumeCm3: number;
  /** Total set (cured) plaster mass, grams. */
  totalGrams: number;
  /** Approximate dry plaster powder needed, grams. */
  powderGrams: number;
  /** Approximate water needed, grams (≈ mL). */
  waterGrams: number;
}

/**
 * Split a set-plaster volume into powder + water by weight using the material's
 * cured density and water:plaster mix ratio. Rough by nature — plaster density
 * varies with mixing — but good enough to size a batch.
 */
export function estimatePlaster(volumeMm3: number, material: PlasterType): PlasterEstimate {
  const m = PLASTER_MATERIALS[material];
  const volumeCm3 = volumeMm3 / 1000;
  const totalGrams = volumeCm3 * m.setDensity;
  // waterRatio = water parts per 100 parts plaster (by weight)
  const powderFraction = 100 / (100 + m.waterRatio);
  const powderGrams = totalGrams * powderFraction;
  const waterGrams = totalGrams - powderGrams;
  return { volumeCm3, totalGrams, powderGrams, waterGrams };
}
