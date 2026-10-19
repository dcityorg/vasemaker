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
 * - 'pourThreePiece' — "Pour 3-Pc": Pour 2-Pc with the shell split vertically.
 * - 'splitTwoPiece' — "Split 2-Pc": TWO plaster halves split through the vase
 *   axis, each poured in its own throwaway printed tray. The halves pull
 *   sideways, so the vase may narrow going up (necks, bellies, rolled rims).
 * - 'splitHalves' — "Split Halves": the same two plaster halves, poured in
 *   REUSABLE parts (plate + two clip-on walls + a separate hollow master),
 *   HandleMaker style — after the throwaway tray proved too hard to remove.
 * - 'splitThirds' — "Split Thirds": three plaster pieces split by seams 120°
 *   apart, each poured on a V-shaped plate with tilted walls (2026-10-15). A
 *   seam leans 30° the safe way, so softer flutes and 3-fold shapes release.
 */
export type MoldStyle = 'twoPart' | 'onePiece' | 'pourTwoPiece' | 'pourThreePiece' | 'splitTwoPiece' | 'splitHalves' | 'splitThirds';

/** The styles offered in the UI. Press 2-Pc, Pour 1-Pc and Pour 2-Pc were
 *  HIDDEN on 2026-10-10 (Gary: too hard to get the plaster out of, and five
 *  choices confused people). Split 2-Pc was hidden on 2026-10-14: its
 *  throwaway tray was very hard to get off, and Split Halves pours the same
 *  two halves in reusable parts. Their code stays: Pour 3-Pc is built on Pour
 *  2-Pc's center, every style shares Press 2-Pc's helpers, and Split Halves
 *  shares Split 2-Pc's floor/natch/handle helpers; hiding is reversible in one
 *  line. Settings that name a hidden style are moved by `retireMoldStyle`. */
export const ACTIVE_MOLD_STYLES: readonly MoldStyle[] = ['pourThreePiece', 'splitHalves', 'splitThirds'];

/** Where settings for a hidden style go: Split 2-Pc → Split Halves (same two
 *  halves, same handle), everything else → Pour 3-Pc. */
export function retiredSuccessor(style: MoldStyle): MoldStyle {
  return style === 'splitTwoPiece' ? 'splitHalves' : 'pourThreePiece';
}

/** Move settings that name a hidden style onto its successor. Returns the
 *  style that was replaced (for a notice), or null if nothing changed. */
/** Split Halves' cast-on handle. Hidden 2026-10-16 (getting handle + vase out
 *  together was chipping the plaster); back 2026-10-18 — Gary let the next pour
 *  set much longer and the handle came out fine. */
export const HALVES_HANDLE_OFFERED = true;

/** Does this mold cast the HandleMaker handle with the vase? */
export function moldUsesHandle(p: MoldParameters): boolean {
  return p.splitHandle && (p.moldStyle === 'splitTwoPiece' || (p.moldStyle === 'splitHalves' && HALVES_HANDLE_OFFERED));
}

export function retireMoldStyle(p: MoldParameters): { params: MoldParameters; retired: MoldStyle | null } {
  if (ACTIVE_MOLD_STYLES.includes(p.moldStyle)) return { params: p, retired: null };
  return { params: { ...p, moldStyle: retiredSuccessor(p.moldStyle) }, retired: p.moldStyle };
}

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
  /** w2 — width of the sloped ramp from the foot up to the recessed center (mm). */
  footSlopeWidth: number;
  /** h — how far the center is recessed above the foot plane (mm). Clamped below the master wall thickness. */
  footHeight: number;
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
  /** How far each seam block reaches back from the split plane, mm — the clip
   *  grab thickness, and the region the swept arc hands over to the block. */
  seamFinWidth: number;
  /** Force a round shell instead of following the cross-section. */
  roundShell: boolean;
  /** How far the center flange extends past the shell flange — an exposed lip
   * to press the center down while pulling the shell up (mm). */
  flangeLip: number;
  /** Empty shell wall above the plaster fill line — the rim you grab to pull
   * the shell off (mm). */
  shellGrabHeight: number;

  // ── Split 2-Pc only: the throwaway trays (seamAngle is shared with Pour 3-Pc) ──
  /** Printed skin of each tray — the half-vase relief and the walls (mm). */
  trayWallThickness: number;
  /** Tray floor = the parting face. Clamped to ≥ natchHeight + 0.8 so a natch
   *  pocket never reaches the bed (mm). */
  trayFloorThickness: number;
  /** Diameter of each natch bump/dimple, clamped to the plaster margin (mm). */
  natchDiameter: number;
  /** How far each plaster bump stands proud / each dimple sinks (mm). */
  natchHeight: number;
  /** Cast a HandleMaker handle onto the vase (Phase 2). The handle is the
   *  current HandleMaker design, rotated so both ends sit on the vase. */
  splitHandle: boolean;
  /** Top attachment, measured down from the rim on the finished vase (mm). */
  handleTopDrop: number;
  /** Sher's fired cast wall — the handle's smaller dimension past 2× this
   *  won't fill solid before the walls are done (mm). */
  castWallThickness: number;

  // ── Split Halves only: reusable plate + two walls + separate master ──
  // (natches, handle, seamAngle and the well are shared with Split 2-Pc; the
  // master shell is masterWallThickness)
  /** How deep the master's skirt sits in the plate pocket — the seal (mm). */
  halvesSeatDepth: number;
  /** Gap between the printed master and the plate pocket / collar bore (mm). */
  halvesFitClearance: number;
  /** Solid plate under the pocket (mm). */
  halvesPlateFloor: number;
  /** Side wall thickness (mm). */
  halvesWallThickness: number;
  /** Clip flange width along the bottom of the walls (mm). */
  halvesFlangeWidth: number;
  /** Split Thirds' own plate floor / wall / clip flange (mm). Separate from
   *  Split Halves so its poured numbers stay put (Gary, 2026-10-16). */
  thirdsPlateFloor: number;
  thirdsWallThickness: number;
  thirdsFlangeWidth: number;
  /** Split Thirds' own foot switch (Gary, 2026-10-16: keep the styles'
   *  settings separate) and, since 2026-10-17, the height of the plaster PLUG
   *  that is the foot (the old step Margin went with the hexagon foot). */
  thirdsFootPiece: boolean;
  thirdsPlugHeight: number;
  /** How far the well runs into the wall collar = the length of its straight,
   *  capped end (mm). */
  halvesWellSeal: number;
  /** How many natches per plaster half, 3 or 4 (Gary, 2026-10-13). Each is
   *  placed and sized automatically in the biggest free plaster near its
   *  corner. A vase that pours one plate twice always uses 4 — it needs a
   *  bump opposite every dimple. */
  halvesNatchCount: number;
  /** Split Halves: the foot is a separate plaster PLUG (Gary, 2026-10-18, as
   *  Split Thirds'; it replaced the 10-14 counterbore + step foot piece). The
   *  halves run Plug Height below the vase bottom round a band = the bottom
   *  outline, with a ring groove; the plug, cast in its own cup, fills it and
   *  its face forms the vase bottom — foot ring + recess from the shared
   *  footWidth / footSlopeWidth / footHeight / footSmoothInner sliders. Its own
   *  switch rather than footEnabled, which defaults ON for Pour 3-Pc and would
   *  otherwise change every existing Split Halves mold. */
  halvesFootPiece: boolean;
  /** How tall the plug is, from the vase bottom to the bottom of the halves (mm). */
  halvesPlugHeight: number;

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
        if (v === 'twoPart' || v === 'onePiece' || v === 'pourTwoPiece' || v === 'pourThreePiece' || v === 'splitTwoPiece' || v === 'splitHalves' || v === 'splitThirds') out.moldStyle = v;
      } else if (typeof v === typeof DEFAULT_MOLD_PARAMETERS[key]) {
        (out as unknown as Record<string, unknown>)[key] = v;
      }
    }
  }
  return out;
}

export const DEFAULT_MOLD_PARAMETERS: MoldParameters = {
  moldStyle: 'pourThreePiece',
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
  footSmoothInner: false,

  plasterThickness: 20,
  cottleWallThickness: 3,
  cottleDraftAngle: 4,
  airHoleEnabled: true,
  airHoleDiameter: 4,

  flangeOverlap: 14,
  footFlangeThickness: 4,
  notchHeight: 1.2,
  notchWidth: 2,
  notchClearance: 0.2,
  seamAngle: 0,
  seamFinWidth: 4,
  roundShell: false,
  flangeLip: 0,
  shellGrabHeight: 10,

  // Hansen's file measures a 1.2–1.4 mm skin (his write-up says 0.8).
  trayWallThickness: 1.2,
  trayFloorThickness: 2.4,
  // HandleMaker's proven natch is 16 x 2; 1.5 keeps the floor at 2.4.
  natchDiameter: 16,
  natchHeight: 1.5,
  splitHandle: false,
  handleTopDrop: 15,
  // Gary measured their own mugs, 2026-10-09: about 3.5 mm after firing.
  castWallThickness: 3.5,

  // HandleMaker's poured numbers (seat 3, fit 0.10, wall 4, flange 14, cylinder
  // 10, well seal 3). The plate floor is thicker than HandleMaker's 3.6 because
  // it spans a mug, not a handle — Claude's guess, 2026-10-12.
  halvesSeatDepth: 3,
  halvesFitClearance: 0.1,
  halvesPlateFloor: 4,
  halvesWallThickness: 4,
  halvesFlangeWidth: 14,
  // Split Thirds: thinner plate and walls, narrower flange (Gary, 2026-10-16).
  thirdsPlateFloor: 2,
  thirdsWallThickness: 2,
  thirdsFlangeWidth: 10,
  thirdsFootPiece: false,
  thirdsPlugHeight: 21,
  halvesWellSeal: 3,
  halvesNatchCount: 4,
  halvesFootPiece: false,
  halvesPlugHeight: 21,

  material: 'pottery',
};
