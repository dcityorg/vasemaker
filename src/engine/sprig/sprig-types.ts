/**
 * SprigMaker parameters — a flat SVG turned into a thin relief (a sprig) on a
 * plate, inside a one-piece open plaster mold. Design doc:
 * local-docs/sprigmaker-plan.md.
 *
 * Every size here is the FINISHED sprig (after the clay shrinks), like
 * HandleMaker's Width/Thickness. The printed relief is scaled up by Shrink.
 */

import type { PlasterType } from '../mold/mold-types';
import { DEFAULT_SPRIG_SVG, DEFAULT_SPRIG_SVG_NAME, DEFAULT_SPRIG_ASPECT } from '@/config/sprig-samples';

/** Where the height comes from. */
export type SprigHeightMode = 'flat' | 'gray' | 'inflate' | 'inflateGray';
/** Cross-section of an inflated shape, edge to middle. */
export type SprigProfile = 'round' | 'pillow' | 'angular';
export type SprigRotation = 0 | 90 | 180 | 270;
export type SprigMoldSize = 'small' | 'medium' | 'long' | 'custom';

export interface SprigParameters {
  // ── The SVG (embedded, so a settings file reproduces the sprig on its own) ──
  svg: string;
  svgName: string;
  /** Width / height of the SVG's DRAWN content (whitespace cropped), in the
   *  SVG's own orientation. Measured when the SVG is loaded; drives the 🔗 lock. */
  svgAspect: number;

  // ── Size (finished mm, after rotation: Width runs along x, Length along y) ──
  width: number;
  length: number;
  lockAspect: boolean;
  rotation: SprigRotation;
  flipX: boolean;
  flipY: boolean;

  // ── Height ──
  heightMode: SprigHeightMode;
  /** Height of the tallest point (black, or the thickest part when inflated). */
  maxHeight: number;
  profile: SprigProfile;
  /** Inflate: how far in from the edge it takes to reach Max Height, mm. */
  roundness: number;
  /** Inflate + Gray detail: how deep lighter-gray marks inside the shape cut in, mm. */
  detailDepth: number;
  /** Swap black and white inside the SVG's area. */
  invert: boolean;

  // ── Edges ──
  /** Width of the ramp from the edge up to full height, mm. 0 = as steep as the grid allows. */
  edgeSoftness: number;
  /** Height the edge stops at instead of tapering to nothing, mm. 0 allowed (Gary, to test). */
  minEdgeThickness: number;

  // ── Checks ──
  /** Parts narrower than this are flagged red, mm, finished size. */
  minFeatureWidth: number;

  // ── Mold ──
  moldSize: SprigMoldSize;
  /** Plaster between the sprig and the walls, mm. Only decides whether it FITS
   *  — it never changes the walls, so it is free to adjust on a standard size. */
  plasterMargin: number;
  shrinkPercent: number;
  /** Relief grid spacing on the PRINTED plate, mm. */
  resolution: number;
  material: PlasterType;

  // ── Custom box (ignored for the standard sizes, whose box is fixed) ──
  customCavW: number;
  customCavL: number;
  customWallH: number;
  customWallThickness: number;
  customFlangeWidth: number;
  customPlateFloor: number;
}

/** The box a mold is built in. Plate and walls both read this one object, so
 *  they cannot drift apart. */
export interface SprigBox {
  /** Inside of the walls = the plaster block, mm. */
  cavW: number;
  cavL: number;
  /** Wall height = plaster depth (pour to the top). */
  wallH: number;
  wallThickness: number;
  flangeWidth: number;
  /** Plate thickness under its top face. */
  plateFloor: number;
}

/**
 * Box numbers every standard size shares. FIXED, deliberately — no slider: the
 * whole point of a standard size is that its walls are printed once and fit
 * every plate made for it, so nothing that shapes a wall may vary between two
 * sprigs of the same size. Wall/flange/V numbers are HandleMaker's poured ones.
 */
export const STANDARD_BOX = {
  /** 8 mm Max Height × 12% shrink leaves 16 mm of plaster behind the sprig. */
  wallH: 25,
  wallThickness: 4,
  flangeWidth: 14,
  /** A plain slab under plaster — thicker than HandleMaker's 3.6 because nothing
   *  else stiffens it, and the Long plate is 196 mm across. */
  plateFloor: 5,
} as const;

export const SPRIG_SIZES: Record<Exclude<SprigMoldSize, 'custom'>, { label: string; cavW: number; cavL: number }> = {
  small: { label: 'Small 60×60', cavW: 60, cavL: 60 },
  medium: { label: 'Medium 100×100', cavW: 100, cavL: 100 },
  long: { label: 'Long 160×60', cavW: 160, cavL: 60 },
};

/** Standard sizes, smallest plate first — the order auto-pick tries them in. */
export const STANDARD_ORDER: Exclude<SprigMoldSize, 'custom'>[] = ['small', 'long', 'medium'];

export function sprigBox(p: SprigParameters): SprigBox {
  if (p.moldSize === 'custom') {
    return {
      cavW: p.customCavW,
      cavL: p.customCavL,
      wallH: p.customWallH,
      wallThickness: p.customWallThickness,
      flangeWidth: p.customFlangeWidth,
      plateFloor: p.customPlateFloor,
    };
  }
  const s = SPRIG_SIZES[p.moldSize];
  return { cavW: s.cavW, cavL: s.cavL, ...STANDARD_BOX };
}

export function sizeLabel(p: SprigParameters): string {
  if (p.moldSize === 'custom') return `Custom ${p.customCavW}x${p.customCavL}`;
  const s = SPRIG_SIZES[p.moldSize];
  return `${p.moldSize[0].toUpperCase()}${p.moldSize.slice(1)} ${s.cavW}x${s.cavL}`;
}

export const DEFAULT_SPRIG_PARAMETERS: SprigParameters = {
  svg: DEFAULT_SPRIG_SVG,
  svgName: DEFAULT_SPRIG_SVG_NAME,
  svgAspect: DEFAULT_SPRIG_ASPECT,

  width: 38,
  length: Math.round((38 / DEFAULT_SPRIG_ASPECT) * 2) / 2,
  lockAspect: true,
  rotation: 0,
  flipX: false,
  flipY: false,

  heightMode: 'inflate',
  maxHeight: 3,
  profile: 'round',
  roundness: 3,
  detailDepth: 0.6,
  invert: false,

  edgeSoftness: 1,
  minEdgeThickness: 0.4,

  minFeatureWidth: 1.5,

  moldSize: 'small',
  plasterMargin: 8,
  shrinkPercent: 12,
  resolution: 0.2,
  material: 'pottery',

  customCavW: 120,
  customCavL: 80,
  customWallH: STANDARD_BOX.wallH,
  customWallThickness: STANDARD_BOX.wallThickness,
  customFlangeWidth: STANDARD_BOX.flangeWidth,
  customPlateFloor: STANDARD_BOX.plateFloor,
};

const ENUMS: Partial<Record<keyof SprigParameters, readonly unknown[]>> = {
  heightMode: ['flat', 'gray', 'inflate', 'inflateGray'],
  profile: ['round', 'pillow', 'angular'],
  rotation: [0, 90, 180, 270],
  moldSize: ['small', 'medium', 'long', 'custom'],
  material: ['pottery', 'hydrocal', 'hydrostone'],
};

/**
 * Merge stored/loaded data onto the defaults: known keys with matching types
 * only (and enum values from their list), so an old file gains new defaults
 * and stale fields are dropped — the mergeHandleParameters pattern.
 */
export function mergeSprigParameters(raw: unknown): SprigParameters {
  const out: SprigParameters = { ...DEFAULT_SPRIG_PARAMETERS };
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SPRIG_PARAMETERS) as (keyof SprigParameters)[]) {
    const v = src[key];
    if (v === undefined || typeof v !== typeof DEFAULT_SPRIG_PARAMETERS[key]) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    const allowed = ENUMS[key];
    if (allowed && !allowed.includes(v)) continue;
    (out as unknown as Record<string, unknown>)[key] = v;
  }
  if (!(out.svgAspect > 0)) out.svgAspect = 1;
  return out;
}

/** Aspect (width / length) of the shape as it lies in the mold, after rotation. */
export function orientedAspect(p: Pick<SprigParameters, 'svgAspect' | 'rotation'>): number {
  return p.rotation === 90 || p.rotation === 270 ? 1 / p.svgAspect : p.svgAspect;
}
