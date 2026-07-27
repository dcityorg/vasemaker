/**
 * HandleMaker parameter types — a mug/vase handle design plus the settings for
 * its two-part plaster mold (bottom plate + two identical side walls + master).
 *
 * Kept separate from VaseParameters/MoldParameters: HandleMaker is self-contained
 * (the handle design lives here too, unlike MoldMaker which reads the vase).
 */

import type { BezierPoint, CurvePointType } from '../types';
import type { PlasterType } from '../mold/mold-types';

export interface HandleParameters {
  /**
   * Spine centerline control points as [depthFraction 0–1, heightFraction 0–1].
   * The left edge (x=0) is the vase-wall plane; first/last points are locked
   * to x=0 (the attachment ends) and y=0 / y=1. Scaled by depth/height mm.
   */
  spinePoints: BezierPoint[];
  /** Per-point fixed/handle types (same convention as the vase Profile curve). */
  spineTypes: CurvePointType[];

  // ── Handle size (finished, pre-shrink, mm) ──
  /** Overall height — distance between the two attachment points. */
  height: number;
  /** Stick-out from the vase wall at spine x=1. */
  depth: number;
  /** Cross-section width, measured in the parting plane. */
  width: number;
  /** Cross-section thickness, perpendicular to the parting plane. */
  thickness: number;

  // ── Wells (slip reservoirs — cut off the cast handle). Each well runs
  // perpendicular to the vase-wall plane: a straight cylinder at the mold wall,
  // then a transition lofting to the handle's flat wall-plane cut. ──
  /** Diameter of the pour opening / cylinder. */
  openingDiameter: number;
  /** Length of the straight cylinder section at the mold wall. */
  cylinderLength: number;
  /** Length of the transition from the cylinder to the handle cut face. */
  coneLength: number;
  /** Clay shrinkage compensation % — the master body is scaled up by this. */
  shrinkPercent: number;

  // ── Master shelling ──
  /** Hollow the master from its flat side (saves plastic). */
  masterHollow: boolean;
  /** Printed shell wall thickness when hollow (mm). */
  masterShellThickness: number;

  // ── Bottom plate ──
  /** Depth of the seat pocket — the master's flat-bottomed skirt sits this far
   * into the plate, resting on the lip (mm). The parting plane is the plate top. */
  seatDepth: number;
  /** Thickness of the support lip under the seat (the plate material between
   * the pocket floor and the plate bottom, mm). */
  plateFloor: number;
  /** XY clearance between master silhouette and the pocket walls (mm). */
  recessClearance: number;
  /** Width of the support lip ring the master rests on — inside it, the plate
   * is cut through so the master can be taped from below (mm). */
  lipWidth: number;

  // ── V ridge/groove (plate↔wall alignment + leak dam; also the seam Vs) ──
  vWidth: number;
  vHeight: number;
  vClearance: number;

  // ── Registration domes (spherical caps: one proud, one recessed) ──
  domeDiameter: number;
  domeHeight: number;

  /** Clip flange width — plate border beyond the walls AND the wall seam tabs. */
  flangeWidth: number;

  // ── Box ──
  /** Plaster margin between the handle silhouette and the walls (mm). */
  plasterMargin: number;
  /** Plaster above the highest point of the master (sets wall height, mm). */
  plasterAbove: number;
  /** Printed wall panel thickness (mm). */
  wallThickness: number;
  /** How far the collar around each well opening stands proud of the wall face (leak seal, mm). */
  wellSealDepth: number;

  // ── Analysis ──
  material: PlasterType;
}

export const DEFAULT_HANDLE_PARAMETERS: HandleParameters = {
  // Handles vertically aligned with the mid fixed point keep the curve
  // tangent-smooth there (no kink → no offset cusp) and make Depth literal.
  spinePoints: [
    [0, 0],
    [1, 0.15],
    [1, 0.5],
    [1, 0.85],
    [0, 1],
  ],
  spineTypes: ['fixed', 'handle', 'fixed', 'handle', 'fixed'],

  height: 100,
  depth: 35,
  width: 14,
  thickness: 10,

  openingDiameter: 18,
  cylinderLength: 8,
  coneLength: 12,
  shrinkPercent: 12,

  masterHollow: true,
  masterShellThickness: 2,

  seatDepth: 1,
  plateFloor: 2,
  recessClearance: 0.15,
  lipWidth: 2,

  vWidth: 2,
  vHeight: 1,
  vClearance: 0.2,

  domeDiameter: 10,
  domeHeight: 2,

  flangeWidth: 12,

  plasterMargin: 25,
  plasterAbove: 10,
  wallThickness: 4,
  wellSealDepth: 1,

  material: 'pottery',
};

function isBezierPointArray(v: unknown): v is BezierPoint[] {
  return (
    Array.isArray(v) &&
    v.length >= 2 &&
    v.every(
      (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number'
    )
  );
}

/**
 * Merge unknown/partial data onto DEFAULT_HANDLE_PARAMETERS, keeping only known
 * keys with matching types (same forward/backward-compat contract as
 * mergeMoldParameters). Spine arrays are validated structurally.
 */
export function mergeHandleParameters(loaded: unknown): HandleParameters {
  const out: HandleParameters = {
    ...DEFAULT_HANDLE_PARAMETERS,
    spinePoints: DEFAULT_HANDLE_PARAMETERS.spinePoints.map((p) => [...p] as BezierPoint),
    spineTypes: [...DEFAULT_HANDLE_PARAMETERS.spineTypes],
  };
  if (!loaded || typeof loaded !== 'object') return out;
  const src = loaded as Record<string, unknown>;

  if (isBezierPointArray(src.spinePoints)) {
    const pts = src.spinePoints.map((p) => [p[0], p[1]] as BezierPoint);
    // Endpoints always anchor to the vase-wall plane (x=0); their heights are
    // free (hook-shaped handles) but clamped to the drawing area.
    const clampY = (y: number) => Math.max(0, Math.min(1, y));
    pts[0] = [0, clampY(pts[0][1])];
    pts[pts.length - 1] = [0, clampY(pts[pts.length - 1][1])];
    out.spinePoints = pts;
    const t = src.spineTypes;
    out.spineTypes =
      Array.isArray(t) && t.length === pts.length && t.every((x) => x === 'fixed' || x === 'handle')
        ? (t as CurvePointType[]).slice()
        : pts.map((_, i) => (i === 0 || i === pts.length - 1 ? 'fixed' : 'handle'));
    out.spineTypes[0] = 'fixed';
    out.spineTypes[out.spineTypes.length - 1] = 'fixed';
  }

  for (const key of Object.keys(DEFAULT_HANDLE_PARAMETERS) as (keyof HandleParameters)[]) {
    if (key === 'spinePoints' || key === 'spineTypes') continue;
    const v = src[key];
    if (key === 'material') {
      if (v === 'pottery' || v === 'hydrocal' || v === 'hydrostone') out.material = v;
    } else if (typeof v === typeof DEFAULT_HANDLE_PARAMETERS[key]) {
      (out as unknown as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}
