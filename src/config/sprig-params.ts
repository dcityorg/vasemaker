/**
 * Slider ranges for SprigMaker controls. Data only, no UI.
 */

import type { SliderRange } from './mold-params';

export const SPRIG_PARAMS = {
  width:  { min: 3, max: 200, step: 0.5 } as SliderRange,
  length: { min: 3, max: 200, step: 0.5 } as SliderRange,

  maxHeight:   { min: 0.5, max: 8, step: 0.1 } as SliderRange,
  roundness:   { min: 0.5, max: 20, step: 0.5 } as SliderRange,
  detailDepth: { min: 0, max: 3, step: 0.1 } as SliderRange,

  imageBackground: { min: 0, max: 100, step: 1 } as SliderRange,
  imageCloseGaps:  { min: 0, max: 10, step: 0.5 } as SliderRange,
  imageSmooth:     { min: 0, max: 5, step: 1 } as SliderRange,
  imageLightest:   { min: 0, max: 100, step: 5 } as SliderRange,
  svgCloseGaps:    { min: 0, max: 10, step: 0.5 } as SliderRange,

  textHeight:  { min: 3, max: 40, step: 0.5 } as SliderRange,
  textDepth:   { min: 0.2, max: 4, step: 0.1 } as SliderRange,
  textGap:     { min: 0, max: 20, step: 0.5 } as SliderRange,
  textOffsetX: { min: -250, max: 250, step: 0.5 } as SliderRange,
  textOffsetY: { min: -250, max: 250, step: 0.5 } as SliderRange,
  textRotation: { min: -180, max: 180, step: 1 } as SliderRange,
  onVaseHeight: { min: 0, max: 100, step: 1 } as SliderRange,
  onVaseAngle: { min: -180, max: 180, step: 1 } as SliderRange,
  onVaseTilt: { min: -180, max: 180, step: 1 } as SliderRange,
  onVaseCopies: { min: 1, max: 12, step: 1 } as SliderRange,

  edgeSoftness:     { min: 0, max: 5, step: 0.1 } as SliderRange,
  // Min 0 on purpose: Gary wants to test a sprig whose edge tapers to nothing.
  minEdgeThickness: { min: 0, max: 2, step: 0.05 } as SliderRange,

  backingThickness: { min: 0, max: 4, step: 0.1 } as SliderRange,
  backingBorder:    { min: 0, max: 15, step: 0.5 } as SliderRange,
  backingCorner:    { min: 0, max: 20, step: 0.5 } as SliderRange,
  backingEdge:      { min: 0, max: 5, step: 0.1 } as SliderRange,

  minFeatureWidth: { min: 0.5, max: 5, step: 0.1 } as SliderRange,
  thickenThin:     { min: 0, max: 5, step: 0.1 } as SliderRange,
  minThickness:    { min: 0, max: 3, step: 0.1 } as SliderRange,

  plasterMargin: { min: 3, max: 25, step: 1 } as SliderRange,
  shrinkPercent: { min: 0, max: 25, step: 0.5 } as SliderRange,
  resolution:    { min: 0.1, max: 0.5, step: 0.05 } as SliderRange,
  plateThickness: { min: 1, max: 10, step: 0.2 } as SliderRange,

  customCavW:          { min: 30, max: 250, step: 5 } as SliderRange,
  customCavL:          { min: 30, max: 250, step: 5 } as SliderRange,
  customWallH:         { min: 15, max: 60, step: 1 } as SliderRange,
  customWallThickness: { min: 2, max: 8, step: 0.5 } as SliderRange,
  // Three V seals and their grooves need ~10.5 mm (seamMaxVWidth shrinks the V below that).
  customFlangeWidth:   { min: 10, max: 24, step: 1 } as SliderRange,
};
