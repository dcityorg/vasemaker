/**
 * Slider ranges and material data for MoldMaker controls.
 * Mirrors config/shape-params.ts — data only, no UI.
 */

import type { PlasterType } from '@/engine/mold/mold-types';

export type SliderRange = { min: number; max: number; step: number };

export const MOLD_PARAMS = {
  shrinkPercent:       { min: 0, max: 25, step: 0.5 } as SliderRange,
  masterWallThickness: { min: 1, max: 10, step: 0.5 } as SliderRange,

  wellWidth:      { min: 0, max: 40, step: 0.5 } as SliderRange,
  wellHeight:     { min: 0, max: 40, step: 0.5 } as SliderRange,
  wellDraftAngle: { min: 0, max: 30, step: 0.5 } as SliderRange,

  flangeWidth:     { min: 5, max: 80, step: 1 } as SliderRange,
  flangeThickness: { min: 2, max: 15, step: 0.5 } as SliderRange,
  pourHoleCount:   { min: 0, max: 8, step: 1 } as SliderRange,
  pourHoleDiameter:{ min: 5, max: 40, step: 1 } as SliderRange,

  footWidth:      { min: 0, max: 20, step: 0.5 } as SliderRange,
  footSlopeWidth: { min: 0.2, max: 10, step: 0.1 } as SliderRange,
  footHeight:     { min: 0, max: 5, step: 0.1 } as SliderRange,

  plasterThickness:    { min: 5, max: 50, step: 1 } as SliderRange,
  cottleWallThickness: { min: 1, max: 10, step: 0.5 } as SliderRange,
  cottleDraftAngle:    { min: 0, max: 15, step: 0.5 } as SliderRange,
  airHoleDiameter:     { min: 2, max: 20, step: 0.5 } as SliderRange,

  flangeOverlap:       { min: 6, max: 25, step: 1 } as SliderRange,
  footFlangeThickness: { min: 1.5, max: 8, step: 0.5 } as SliderRange,
  notchHeight:         { min: 0.5, max: 2, step: 0.1 } as SliderRange,
  notchWidth:          { min: 1, max: 3, step: 0.1 } as SliderRange,
  notchClearance:      { min: 0, max: 0.5, step: 0.05 } as SliderRange,
  seamAngle:           { min: 0, max: 360, step: 1 } as SliderRange,
  seamFinWidth:        { min: 2, max: 8, step: 0.5 } as SliderRange,
  flangeLip:           { min: 0, max: 10, step: 0.5 } as SliderRange,
  shellGrabHeight:     { min: 0, max: 30, step: 1 } as SliderRange,

  trayWallThickness:   { min: 0.8, max: 3, step: 0.1 } as SliderRange,
  trayFloorThickness:  { min: 1.2, max: 6, step: 0.2 } as SliderRange,
  natchDiameter:       { min: 6, max: 30, step: 0.5 } as SliderRange,
  natchHeight:         { min: 0.5, max: 3, step: 0.1 } as SliderRange,
  handleTopDrop:       { min: 0, max: 80, step: 0.5 } as SliderRange,
  castWallThickness:   { min: 1.5, max: 8, step: 0.1 } as SliderRange,

  halvesSeatDepth:      { min: 1, max: 8, step: 0.5 } as SliderRange,
  halvesFitClearance:   { min: 0, max: 0.6, step: 0.05 } as SliderRange,
  halvesPlateFloor:     { min: 2, max: 10, step: 0.2 } as SliderRange,
  halvesWallThickness:  { min: 2, max: 8, step: 0.5 } as SliderRange,
  halvesFlangeWidth:    { min: 10, max: 30, step: 0.5 } as SliderRange,
  thirdsPlateFloor:     { min: 2, max: 10, step: 0.2 } as SliderRange,
  thirdsWallThickness:  { min: 2, max: 8, step: 0.5 } as SliderRange,
  thirdsFlangeWidth:    { min: 10, max: 30, step: 0.5 } as SliderRange,
  thirdsPlugHeight:     { min: 12, max: 40, step: 0.5 } as SliderRange,
  halvesWellSeal:       { min: 1, max: 10, step: 0.5 } as SliderRange,
  halvesPlugHeight:     { min: 12, max: 40, step: 0.5 } as SliderRange,
} as const;

/**
 * Plaster materials — set (cured) density in g/cm³ and the water:plaster mix
 * ratio by weight (water parts per 100 parts plaster). Used to split the mold
 * volume into approximate plaster powder + water weights.
 */
export const PLASTER_MATERIALS: Record<PlasterType, { label: string; setDensity: number; waterRatio: number }> = {
  pottery:    { label: 'Pottery Plaster (No.1)', setDensity: 1.60, waterRatio: 70 },
  hydrocal:   { label: 'Hydrocal',               setDensity: 1.75, waterRatio: 45 },
  hydrostone: { label: 'Hydrostone',             setDensity: 1.90, waterRatio: 32 },
};
