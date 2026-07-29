/**
 * Slider ranges for HandleMaker controls. Data only, no UI.
 */

import type { SliderRange } from './mold-params';

export const HANDLE_PARAMS = {
  // Height/Depth are measurements of the centerline that the sliders scale the
  // spine to hit — not stored params (see HandleParameters).
  height:    { min: 30, max: 250, step: 1 } as SliderRange,
  depth:     { min: 10, max: 100, step: 0.5 } as SliderRange,
  width:     { min: 5, max: 40, step: 0.5 } as SliderRange,
  thickness: { min: 4, max: 30, step: 0.5 } as SliderRange,

  // Drawing area (view only). Ranges are generous because the window exists
  // precisely to give you somewhere to drag a control point to.
  winRight:  { min: 10, max: 200, step: 1 } as SliderRange,
  winTop:    { min: -100, max: 400, step: 1 } as SliderRange,
  winBottom: { min: -200, max: 100, step: 1 } as SliderRange,

  openingDiameter: { min: 8, max: 40, step: 0.5 } as SliderRange,
  cylinderLength:  { min: 3, max: 30, step: 0.5 } as SliderRange,
  coneLength:      { min: 4, max: 40, step: 0.5 } as SliderRange,
  shrinkPercent:   { min: 0, max: 25, step: 0.5 } as SliderRange,
  masterShellThickness: { min: 1, max: 4, step: 0.25 } as SliderRange,

  seatDepth:       { min: 0.5, max: 3, step: 0.1 } as SliderRange,
  plateFloor:      { min: 1, max: 4, step: 0.5 } as SliderRange,
  recessClearance: { min: 0, max: 0.6, step: 0.05 } as SliderRange,
  lipWidth:        { min: 1, max: 5, step: 0.5 } as SliderRange,

  vWidth:     { min: 1, max: 4, step: 0.1 } as SliderRange,
  vHeight:    { min: 0.4, max: 2, step: 0.1 } as SliderRange,
  vClearance: { min: 0, max: 0.6, step: 0.05 } as SliderRange,

  domeDiameter: { min: 4, max: 14, step: 0.5 } as SliderRange,
  domeHeight:   { min: 0.5, max: 3, step: 0.1 } as SliderRange,

  flangeWidth: { min: 6, max: 30, step: 1 } as SliderRange,

  plasterMargin: { min: 10, max: 50, step: 1 } as SliderRange,
  plasterAbove:  { min: 5, max: 40, step: 1 } as SliderRange,
  wallThickness: { min: 3, max: 8, step: 0.5 } as SliderRange,
  wellSealDepth: { min: 0, max: 3, step: 0.5 } as SliderRange,
} as const;
