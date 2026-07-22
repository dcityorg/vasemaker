/**
 * MoldMaker parameter types — settings for turning a vase design into the two
 * printable plastic parts (master + cottle) for a plaster slip-casting mold.
 *
 * Kept separate from VaseParameters: MoldMaker consumes a VaseParameters (the
 * live vase design) plus these mold-specific settings.
 */

/** Plaster material used for the powder/water weight estimate. */
export type PlasterType = 'pottery' | 'hydrocal' | 'hydrostone';

export interface MoldParameters {
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

  // ── Plaster / cottle ──
  /** Plaster wall thickness — the gap between the master outer surface and the cottle inner wall (mm). */
  plasterThickness: number;
  /** Printed wall thickness of the cottle container (mm). */
  cottleWallThickness: number;
  /** Outward draft of the cottle inner wall so the set plaster releases (degrees, wider toward the opening). */
  cottleDraftAngle: number;

  // ── Analysis ──
  /** Surfaces tilting below this angle from vertical are flagged as pull undercuts (degrees). */
  undercutAngle: number;
  /** Plaster material for the weight estimate. */
  material: PlasterType;
}

export const DEFAULT_MOLD_PARAMETERS: MoldParameters = {
  shrinkPercent: 12,
  masterWallThickness: 3,
  keepTexture: true,

  wellWidth: 12,
  wellHeight: 12,
  wellDraftAngle: 3,

  flangeWidth: 30,
  flangeThickness: 5,
  pourHoleCount: 6,
  pourHoleDiameter: 15,

  plasterThickness: 20,
  cottleWallThickness: 3,
  cottleDraftAngle: 3,

  undercutAngle: 45,
  material: 'pottery',
};
