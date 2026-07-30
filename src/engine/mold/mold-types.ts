/**
 * MoldMaker parameter types — settings for turning a vase design into the two
 * printable plastic parts (master + cottle) for a plaster slip-casting mold.
 *
 * Kept separate from VaseParameters: MoldMaker consumes a VaseParameters (the
 * live vase design) plus these mold-specific settings.
 */

/** Plaster material used for the powder/water weight estimate. */
export type PlasterType = 'pottery' | 'hydrocal' | 'hydrostone';

/**
 * Which mold construction to generate:
 * - 'twoPart'      — "Press 2-Pc": master + cottle printed separately; master is
 *   pressed down into plaster poured in the cottle (the original MoldMaker).
 * - 'onePiece'     — "Pour 1-Pc": a single print with the vase inverted in the
 *   center, fused to the cottle at the well; plaster poured in the open top.
 * - 'pourTwoPiece' — "Pour 2-Pc": the one-piece split into a center piece
 *   (vase + well + notched foot flange) and a removable outer shell that
 *   binder-clips to it; plaster poured in the open top, shell lifts off first.
 */
export type MoldStyle = 'twoPart' | 'onePiece' | 'pourTwoPiece' | 'pourThreePiece';

export interface MoldParameters {
  /** Mold construction style — see MoldStyle. */
  moldStyle: MoldStyle;

  /** Clay slip shrinkage compensation, as a percent. Master is scaled by 1 + shrinkPercent/100. */
  shrinkPercent: number;

  /** Printed wall thickness of the hollow master shell (mm). */
  masterWallThickness: number;

  /** Keep the vase's surface texture on the master (mm displacement). If false, the master is smooth. */
  keepTexture: boolean;

  // ── Well (slip reservoir collar on top of the vase) ──
  /** Horizontal (radial) step outward at the vase rim — the 90° ledge for razor-trimming (mm). */
  wellWidth: number;
  /** Vertical height of the well wall above the vase rim (mm). */
  wellHeight: number;
  /** Outward draft of the well wall so it releases from plaster (degrees, wider at top). */
  wellDraftAngle: number;

  // ── Flange (registration plate at the top of the well) ──
  /** Radial width of the flange beyond the well outer wall (mm). Should exceed cottle wall so it rests on the rim. */
  flangeWidth: number;
  /** Thickness of the flange plate (mm). */
  flangeThickness: number;
  /** Number of pour holes through the flange (0 = none). Reserved — hole geometry lands in a follow-up. */
  pourHoleCount: number;
  /** Diameter of each pour hole (mm). */
  pourHoleDiameter: number;

  // ── Foot recess (bottom of the master → foot ring + glaze well on cast pieces) ──
  /** Recess the master's bottom face so cast pieces get a foot ring and recessed center. */
  footEnabled: boolean;
  /** w1 — width of the flat foot ring at the outer edge of the bottom (mm). */
  footWidth: number;
  /** w2 — width of the stepped ramp from the foot up to the recessed center (mm). */
  footSlopeWidth: number;
  /** h — how far the center is recessed above the foot plane (mm). Clamped below the master wall thickness. */
  footHeight: number;
  /** Vertical size of each ramp step (mm) — set to the printer layer height for clean prints. */
  footStepHeight: number;
  /** Build the ramp + recessed center from the smooth (untextured) base contour, so surface texture doesn't carry into the recess. */
  footSmoothInner: boolean;

  // ── Plaster / cottle ──
  /** Plaster wall thickness — the gap between the master outer surface and the cottle inner wall (mm). */
  plasterThickness: number;
  /** Printed wall thickness of the cottle container (mm). */
  cottleWallThickness: number;
  /** Outward draft of the cottle inner wall so the set plaster releases (degrees, wider toward the opening). */
  cottleDraftAngle: number;
  /** Punch an air-relief hole through the cottle floor center (lets air in when pulling the set plaster block). */
  airHoleEnabled: boolean;
  /** Diameter of the air-relief hole (mm). */
  airHoleDiameter: number;

  // ── Foot flange (Pour 2-Pc only: where center and shell clip together) ──
  /** How far both flanges extend beyond the shell wall's outer face (mm). */
  flangeOverlap: number;
  /** Thickness of EACH flange — center foot and shell flange (mm). */
  footFlangeThickness: number;
  /** Height of the two plaster-trap notch rings on the center flange (mm). */
  notchHeight: number;
  /** Width of each notch ring (mm). */
  notchWidth: number;
  /** Groove oversize around each notch so the shell seats (mm). */
  notchClearance: number;

  // ── Pour 3-Pc only: the vertically split cottle ──
  /** Azimuth of the vertical split plane, degrees. */
  seamAngle: number;
  /** Thickness of each seam fin (the clip tab at the split), mm. */
  seamFinWidth: number;
  /** Force a round shell instead of following the cross-section. */
  roundShell: boolean;
  /** How far the center flange extends past the shell flange — an exposed lip
   * to press the center down while pulling the shell up (mm). */
  flangeLip: number;
  /** Empty shell wall above the plaster fill line — the rim you grab to pull
   * the shell off (mm). */
  shellGrabHeight: number;

  // ── Analysis ──
  /** Plaster material for the weight estimate. */
  material: PlasterType;
}

/**
 * Merge unknown/partial data onto DEFAULT_MOLD_PARAMETERS, keeping only known
 * keys with matching types. Used when loading settings files and localStorage
 * entries: files saved by older versions get new defaults for missing params,
 * and stale fields from removed params are silently dropped.
 */
export function mergeMoldParameters(loaded: unknown): MoldParameters {
  const out: MoldParameters = { ...DEFAULT_MOLD_PARAMETERS };
  if (loaded && typeof loaded === 'object') {
    const src = loaded as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_MOLD_PARAMETERS) as (keyof MoldParameters)[]) {
      const v = src[key];
      if (key === 'material') {
        if (v === 'pottery' || v === 'hydrocal' || v === 'hydrostone') out.material = v;
      } else if (key === 'moldStyle') {
        if (v === 'twoPart' || v === 'onePiece' || v === 'pourTwoPiece' || v === 'pourThreePiece') out.moldStyle = v;
      } else if (typeof v === typeof DEFAULT_MOLD_PARAMETERS[key]) {
        (out as unknown as Record<string, unknown>)[key] = v;
      }
    }
  }
  return out;
}

export const DEFAULT_MOLD_PARAMETERS: MoldParameters = {
  moldStyle: 'twoPart',
  shrinkPercent: 12,
  masterWallThickness: 3,
  keepTexture: true,

  wellWidth: 12,
  wellHeight: 15,
  wellDraftAngle: 3,

  flangeWidth: 30,
  flangeThickness: 5,
  pourHoleCount: 6,
  pourHoleDiameter: 15,

  footEnabled: true,
  footWidth: 5,
  footSlopeWidth: 1,
  footHeight: 1,
  footStepHeight: 0.2,
  footSmoothInner: false,

  plasterThickness: 20,
  cottleWallThickness: 3,
  cottleDraftAngle: 4,
  airHoleEnabled: true,
  airHoleDiameter: 4,

  flangeOverlap: 10,
  footFlangeThickness: 2,
  notchHeight: 1,
  notchWidth: 2,
  notchClearance: 0.2,
  seamAngle: 0,
  seamFinWidth: 3,
  roundShell: false,
  flangeLip: 3,
  shellGrabHeight: 10,

  material: 'pottery',
};
