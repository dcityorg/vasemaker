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
   * Spine centerline control points in MILLIMETRES: [stickOut, height]. x=0 is
   * the vase-wall plane and the first/last points are locked there (the two
   * attachment ends); their heights are free so hook shapes can attach at any
   * level, and y may be negative.
   *
   * Before v1.16.0 these were normalized 0–1 and scaled by `height`/`depth`
   * params — see mergeHandleParameters for the one-way migration.
   */
  spinePoints: BezierPoint[];
  /** Per-point fixed/handle types (same convention as the vase Profile curve). */
  spineTypes: CurvePointType[];

  // ── Drawing area (view only — never affects the exported geometry) ──
  /** Right edge of the profile editor, mm. x always starts at 0 (the wall). */
  winRight: number;
  /** Top edge of the profile editor, mm. */
  winTop: number;
  /** Bottom edge of the profile editor, mm — usually 0 or negative. */
  winBottom: number;

  // ── Handle size (finished, pre-shrink, mm) ──
  /**
   * Cross-section size in the parting plane. Surfaced in the UI as
   * **Thickness** (v1.16.0) — the field name is kept so existing settings
   * files and presets keep describing the same handle.
   */
  width: number;
  /** Cross-section size perpendicular to the parting plane. Surfaced in the UI as **Width**. */
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
    [35, 15],
    [35, 50],
    [35, 85],
    [0, 100],
  ],
  spineTypes: ['fixed', 'handle', 'fixed', 'handle', 'fixed'],

  // Matches fitWindowTo() of the spine above, so the app opens already fitted.
  winRight: 40,
  winTop: 105,
  winBottom: -5,

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

/** Breathing room "Fit" leaves around the control points, mm. */
export const WINDOW_MARGIN = 5;
/** Smallest usable drawing area, mm — guards degenerate spines. */
const MIN_WINDOW = 10;

export interface WindowExtents {
  winRight: number;
  winTop: number;
  winBottom: number;
}

/**
 * Bounding box of the CONTROL POINTS — deliberately not the curve. A Bezier
 * always lies inside the convex hull of its control points, so a window that
 * shows every control point is guaranteed to show the whole curve too.
 */
export function controlBounds(points: BezierPoint[]): { maxX: number; minY: number; maxY: number } {
  let maxX = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Number.isFinite(minY) ? { maxX, minY, maxY } : { maxX: 0, minY: 0, maxY: 0 };
}

/** Window extents are user-facing slider values — keep them to 0.1 mm. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The snuggest window that still shows every control point, plus a margin. */
export function fitWindowTo(points: BezierPoint[]): WindowExtents {
  const b = controlBounds(points);
  return {
    winRight: r1(Math.max(MIN_WINDOW, b.maxX + WINDOW_MARGIN)),
    winTop: r1(b.maxY + WINDOW_MARGIN),
    winBottom: r1(b.minY - WINDOW_MARGIN),
  };
}

/**
 * Expand a window — never shrink it — until no control point is hidden. Used
 * after scaling, which is the one operation that can push points out of view
 * (dragging can't: the editor clamps to the window).
 */
export function growWindowFor(points: BezierPoint[], win: WindowExtents): WindowExtents {
  const b = controlBounds(points);
  const out = {
    winRight: r1(Math.max(win.winRight, b.maxX + WINDOW_MARGIN, MIN_WINDOW)),
    winTop: r1(Math.max(win.winTop, b.maxY + WINDOW_MARGIN)),
    winBottom: r1(Math.min(win.winBottom, b.minY - WINDOW_MARGIN)),
  };
  return out.winTop - out.winBottom >= MIN_WINDOW ? out : fitWindowTo(points);
}

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

  let migrated = false;
  if (isBezierPointArray(src.spinePoints)) {
    let pts = src.spinePoints.map((p) => [p[0], p[1]] as BezierPoint);
    // v1.16.0 migration: the spine used to be stored normalized 0–1 and scaled
    // by the old `height`/`depth` params. Detect that shape — every coordinate
    // inside the unit square — and bake the scale in once. A millimetre spine
    // of a real handle is tens of mm across, so it can't be mistaken for one.
    const legacyH = src.height;
    const legacyD = src.depth;
    if (
      typeof legacyH === 'number' &&
      typeof legacyD === 'number' &&
      pts.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)
    ) {
      pts = pts.map(([x, y]) => [x * legacyD, y * legacyH] as BezierPoint);
      migrated = true;
    }
    // Endpoints always anchor to the vase-wall plane (x=0); their heights are
    // free, and may be negative.
    pts[0] = [0, pts[0][1]];
    pts[pts.length - 1] = [0, pts[pts.length - 1][1]];
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

  // A legacy file has no window of its own, and any file could name one that
  // hides a control point (making it ungrabbable), so settle the window last.
  Object.assign(out, migrated ? fitWindowTo(out.spinePoints) : growWindowFor(out.spinePoints, out));
  return out;
}
