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
export type SprigMoldSize = 's20' | 's40' | 's60' | 's80' | 's100' | 's120' | 's140' | 'long' | 'custom';
/** Sheet under the drawing that joins separate pieces into one cast. */
export type SprigBacking = 'none' | 'plaque' | 'outline';
/** Built-in fonts (lib/sprig-fonts.ts), or a font installed on this computer. */
export type SprigFont = 'rounded' | 'slab' | 'chunky' | 'classic' | 'script' | 'script2' | 'system';
/** Letters stand up, or are sunk into what is under them (a backing sheet). */
export type SprigTextStyle = 'raised' | 'cut';
/** Where the text sits relative to the drawing. */
export type SprigTextPosition = 'below' | 'above' | 'left' | 'right' | 'over';

export interface SprigParameters {
  // ── The drawing (embedded, so a settings file reproduces the sprig on its own) ──
  /** SVG markup — or, for a picture, a data:image/… URL (see isPictureDrawing). */
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

  // ── Picture (PNG/JPG only; an SVG ignores these) ──
  /** How far a colour may be from the background's and still count as background, 0–100. */
  imageBackground: number;
  /** Close gaps in an outline before filling, picture pixels. */
  imageCloseGaps: number;
  /** Blur inside the shape, picture pixels (JPEG speckle). */
  imageSmooth: number;
  /** 0 = smooth tones; 2–5 = that many flat height levels. */
  imageTones: number;
  /** Height of the lightest tone as a % of the darkest's (Gray modes). */
  imageLightest: number;

  // ── SVG (an SVG with both of these off is read as drawn, as before) ──
  /** Fill closed outlines solid (flood fill from the edge, like a picture). */
  svgFill: boolean;
  /** Close gaps in an outline before filling, pixels of a 1024 px drawing. */
  svgCloseGaps: number;
  /** 0 = greys as drawn; 2–5 = that many flat height levels. */
  svgTones: number;

  // ── Text ('' = none). Up to two lines, separated by \n ──
  text: string;
  textFont: SprigFont;
  /** The installed font's name, when textFont is 'system'. */
  textFontName: string;
  /** Capital-letter height, finished mm. */
  textHeight: number;
  textStyle: SprigTextStyle;
  /** Raised: how high the letters stand. Cut: how deep they sink. mm. */
  textDepth: number;
  textPosition: SprigTextPosition;
  /** Space between the drawing and the text, mm (not used for 'over'). */
  textGap: number;
  /** Nudge, mm: + = right / up (as seen from above). */
  textOffsetX: number;
  textOffsetY: number;
  /** Off = the text alone, no drawing. */
  drawingOn: boolean;

  // ── Edges ──
  /** Width of the ramp from the edge up to full height, mm. 0 = as steep as the grid allows. */
  edgeSoftness: number;
  /** Height the edge stops at instead of tapering to nothing, mm. 0 allowed (Gary, to test). */
  minEdgeThickness: number;

  // ── Backing (Max Height sits ON TOP of it — Gary 2026-10-24) ──
  backing: SprigBacking;
  /** Sheet thickness, mm. 0 = no sheet: separate pieces. */
  backingThickness: number;
  /** How far the sheet reaches past the drawing, mm (plaque: past its box). */
  backingBorder: number;
  /** Plaque corner radius, mm. */
  backingCorner: number;
  /** Width of the slope at the sheet's outer edge, mm. 0 = a straight step. */
  backingEdge: number;

  // ── Checks ──
  /** Parts narrower than this are flagged red, mm, finished size. */
  minFeatureWidth: number;
  /** Drop pieces smaller than Min Feature squared (clipped slivers). */
  removeTiny: boolean;
  /** Drop pieces that touch the edge of the drawing (cut-off pattern cells). */
  wholeShapesOnly: boolean;
  /** Shave off everything narrower than Min Feature (sharp tips, hairlines). */
  roundThin: boolean;

  // ── Mold ──
  moldSize: SprigMoldSize;
  /** Plaster between the sprig and the walls, mm. Only decides whether it FITS
   *  — it never changes the walls, so it is free to adjust on a standard size. */
  plasterMargin: number;
  shrinkPercent: number;
  /** Relief grid spacing on the PRINTED plate, mm. */
  resolution: number;
  material: PlasterType;
  /** Printed plate under its top face, mm — every size. The walls stand on the
   *  plate's top face and never read this, so it does not break a standard
   *  size's shared wall pair. */
  plateThickness: number;

  // ── Custom box (ignored for the standard sizes, whose box is fixed) ──
  customCavW: number;
  customCavL: number;
  customWallH: number;
  customWallThickness: number;
  customFlangeWidth: number;
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
} as const;

/** Default plate thickness: a plain slab under plaster, thicker than
 *  HandleMaker's 3.6 because nothing else stiffens it, and the Long plate is
 *  196 mm across. Gary can thin it (Plate Thickness, down to 1 mm). */
export const DEFAULT_PLATE_THICKNESS = 5;

/** Named by their inside size (Gary 2026-10-25: a full set kept on hand) — a
 *  number says which box to reach for; a word ladder (smaller, larger…) does not.
 *  Menu order is this order. */
export const SPRIG_SIZES: Record<Exclude<SprigMoldSize, 'custom'>, { label: string; cavW: number; cavL: number }> = {
  s20: { label: '20×20', cavW: 20, cavL: 20 },
  s40: { label: '40×40', cavW: 40, cavL: 40 },
  s60: { label: '60×60', cavW: 60, cavL: 60 },
  s80: { label: '80×80', cavW: 80, cavL: 80 },
  s100: { label: '100×100', cavW: 100, cavL: 100 },
  s120: { label: '120×120', cavW: 120, cavL: 120 },
  s140: { label: '140×140', cavW: 140, cavL: 140 },
  long: { label: 'Long 160×60', cavW: 160, cavL: 60 },
};

/** Sizes before 2026-10-25, for old files and stored settings. */
const LEGACY_SIZES: Record<string, SprigMoldSize> = { small: 's60', medium: 's100' };

/** Standard sizes in menu order. */
export const SIZE_MENU = Object.keys(SPRIG_SIZES) as Exclude<SprigMoldSize, 'custom'>[];

/** Standard sizes, smallest PLATE first (the walls and flange add the same
 *  border to each) — the order auto-pick tries them in. Long sits between
 *  100×100 and 120×120. */
export const STANDARD_ORDER = [...SIZE_MENU].sort((a, b) => {
  const border = 2 * (STANDARD_BOX.wallThickness + STANDARD_BOX.flangeWidth);
  const area = (k: typeof a) => (SPRIG_SIZES[k].cavW + border) * (SPRIG_SIZES[k].cavL + border);
  return area(a) - area(b);
});

export function sprigBox(p: SprigParameters): SprigBox {
  if (p.moldSize === 'custom') {
    return {
      cavW: p.customCavW,
      cavL: p.customCavL,
      wallH: p.customWallH,
      wallThickness: p.customWallThickness,
      flangeWidth: p.customFlangeWidth,
      plateFloor: p.plateThickness,
    };
  }
  const s = SPRIG_SIZES[p.moldSize];
  return { cavW: s.cavW, cavL: s.cavL, ...STANDARD_BOX, plateFloor: p.plateThickness };
}

export function sizeLabel(p: SprigParameters): string {
  if (p.moldSize === 'custom') return `Custom ${p.customCavW}x${p.customCavL}`;
  const s = SPRIG_SIZES[p.moldSize];
  return `${p.moldSize === 'long' ? 'Long ' : ''}${s.cavW}x${s.cavL}`;
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

  imageBackground: 20,
  imageCloseGaps: 0,
  imageSmooth: 1,
  imageTones: 3,
  imageLightest: 40,

  svgFill: false,
  svgCloseGaps: 0,
  svgTones: 0,

  text: '',
  textFont: 'rounded',
  textFontName: '',
  textHeight: 8,
  textStyle: 'raised',
  textDepth: 1,
  textPosition: 'below',
  textGap: 3,
  textOffsetX: 0,
  textOffsetY: 0,
  drawingOn: true,

  edgeSoftness: 1,
  // 0 (Gary 2026-10-25): a lip raises every part thinner than it, and flattens
  // the shape. Untested whether a feathered edge tears in the cast.
  minEdgeThickness: 0,

  backing: 'none',
  backingThickness: 1.5,
  backingBorder: 3,
  backingCorner: 3,
  backingEdge: 1.5,

  minFeatureWidth: 1.5,
  removeTiny: false,
  wholeShapesOnly: false,
  roundThin: false,

  moldSize: 's60',
  plasterMargin: 8,
  shrinkPercent: 12,
  resolution: 0.2,
  material: 'pottery',
  plateThickness: DEFAULT_PLATE_THICKNESS,

  customCavW: 120,
  customCavL: 80,
  customWallH: STANDARD_BOX.wallH,
  customWallThickness: STANDARD_BOX.wallThickness,
  customFlangeWidth: STANDARD_BOX.flangeWidth,
};

const ENUMS: Partial<Record<keyof SprigParameters, readonly unknown[]>> = {
  heightMode: ['flat', 'gray', 'inflate', 'inflateGray'],
  profile: ['round', 'pillow', 'angular'],
  rotation: [0, 90, 180, 270],
  moldSize: ['s20', 's40', 's60', 's80', 's100', 's120', 's140', 'long', 'custom'],
  backing: ['none', 'plaque', 'outline'],
  material: ['pottery', 'hydrocal', 'hydrostone'],
  textFont: ['rounded', 'slab', 'chunky', 'classic', 'script', 'script2', 'system'],
  textStyle: ['raised', 'cut'],
  textPosition: ['below', 'above', 'left', 'right', 'over'],
};

/**
 * Merge stored/loaded data onto the defaults: known keys with matching types
 * only (and enum values from their list), so an old file gains new defaults
 * and stale fields are dropped — the mergeHandleParameters pattern.
 */
export function mergeSprigParameters(raw: unknown): SprigParameters {
  const out: SprigParameters = { ...DEFAULT_SPRIG_PARAMETERS };
  if (!raw || typeof raw !== 'object') return out;
  const src = { ...(raw as Record<string, unknown>) };
  if (typeof src.moldSize === 'string' && LEGACY_SIZES[src.moldSize]) src.moldSize = LEGACY_SIZES[src.moldSize];
  for (const key of Object.keys(DEFAULT_SPRIG_PARAMETERS) as (keyof SprigParameters)[]) {
    const v = src[key];
    if (v === undefined || typeof v !== typeof DEFAULT_SPRIG_PARAMETERS[key]) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    const allowed = ENUMS[key];
    if (allowed && !allowed.includes(v)) continue;
    (out as unknown as Record<string, unknown>)[key] = v;
  }
  if (!(out.svgAspect > 0)) out.svgAspect = 1;
  // Before the plate thickness applied to every size it was a Custom-box field;
  // a custom design saved then keeps its plate.
  if (src.plateThickness === undefined && out.moldSize === 'custom'
    && typeof src.customPlateFloor === 'number' && Number.isFinite(src.customPlateFloor)) {
    out.plateThickness = src.customPlateFloor;
  }
  return out;
}

/** Aspect (width / length) of the shape as it lies in the mold, after rotation. */
export function orientedAspect(p: Pick<SprigParameters, 'svgAspect' | 'rotation'>): number {
  return p.rotation === 90 || p.rotation === 270 ? 1 / p.svgAspect : p.svgAspect;
}

/** Is there a sheet under the drawing? */
export function backingOn(p: Pick<SprigParameters, 'backing' | 'backingThickness'>): boolean {
  return p.backing !== 'none' && p.backingThickness > 0;
}

/** Is there text to place? */
export function hasText(p: Pick<SprigParameters, 'text'>): boolean {
  return p.text.trim().length > 0;
}

/** Size of the rendered text block, finished mm (from lib/sprig-text.ts). */
export interface TextSize { w: number; h: number }

/**
 * Where the drawing and the text sit, finished mm, with the whole sprig (both,
 * before any backing border) centred on the origin. `text` null = no text, and
 * then the drawing is centred exactly as it always was.
 */
export function sprigPlacement(p: SprigParameters, text: TextSize | null) {
  const draw = p.drawingOn;
  const W = draw ? p.width : 0, L = draw ? p.length : 0;
  let tx = 0, ty = 0;
  if (text && draw) {
    const g = Math.max(0, p.textGap);
    if (p.textPosition === 'below') ty = -(L / 2 + g + text.h / 2);
    else if (p.textPosition === 'above') ty = L / 2 + g + text.h / 2;
    else if (p.textPosition === 'left') tx = -(W / 2 + g + text.w / 2);
    else if (p.textPosition === 'right') tx = W / 2 + g + text.w / 2;
  }
  if (text) { tx += p.textOffsetX; ty += p.textOffsetY; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const add = (cx: number, cy: number, w: number, h: number) => {
    x0 = Math.min(x0, cx - w / 2); x1 = Math.max(x1, cx + w / 2);
    y0 = Math.min(y0, cy - h / 2); y1 = Math.max(y1, cy + h / 2);
  };
  if (draw) add(0, 0, W, L);
  if (text) add(tx, ty, text.w, text.h);
  if (!(x1 > x0)) { x0 = x1 = y0 = y1 = 0; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return {
    /** Drawing centre. */
    dx: -cx, dy: -cy,
    /** Text centre. */
    tx: tx - cx, ty: ty - cy,
    /** Extent of drawing ∪ text. */
    w: x1 - x0, l: y1 - y0,
  };
}

/** Finished footprint (width, length), mm: drawing and text plus any backing border. */
export function sprigFootprint(p: SprigParameters, text: TextSize | null = null): [number, number] {
  const b = backingOn(p) ? Math.max(0, p.backingBorder) : 0;
  const { w, l } = sprigPlacement(p, text);
  return [w + 2 * b, l + 2 * b];
}

/** Is the drawing a picture (PNG/JPG data URL) rather than SVG markup? */
export function isPictureDrawing(svg: string): boolean {
  return svg.startsWith('data:image/') && !svg.startsWith('data:image/svg');
}

/** Does this SVG go through the picture pipeline (fill and/or tone steps)? */
export function svgPrepared(p: Pick<SprigParameters, 'svgFill' | 'svgTones'>): boolean {
  return p.svgFill || p.svgTones >= 2;
}

/** The SVG settings that change the prepared image, as one cache key ('' = read as drawn). */
export function svgKey(p: Pick<SprigParameters, 'svgFill' | 'svgCloseGaps' | 'svgTones'>): string {
  return svgPrepared(p) ? `${p.svgFill ? 1 : 0}|${p.svgFill ? p.svgCloseGaps : 0}|${p.svgTones}` : '';
}

/** The picture settings that change the prepared image (not Lightest, which
 *  the relief applies), as one cache key. */
export function pictureKey(p: Pick<SprigParameters, 'imageBackground' | 'imageCloseGaps' | 'imageSmooth' | 'imageTones'>): string {
  return `${p.imageBackground}|${p.imageCloseGaps}|${p.imageSmooth}|${p.imageTones}`;
}
