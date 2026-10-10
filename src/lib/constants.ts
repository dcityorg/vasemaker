/** Default preview resolution */
export const DEFAULT_PREVIEW_VERTICAL = 60;
export const DEFAULT_PREVIEW_RADIAL = 120;

/** Default export resolution */
export const DEFAULT_EXPORT_VERTICAL = 120;
export const DEFAULT_EXPORT_RADIAL = 180;

/** Default vase dimensions in mm */
export const DEFAULT_RADIUS = 30;
export const DEFAULT_HEIGHT = 100;

/** Most control points any curve editor accepts — Profile, Custom Twist, both
 *  XY Sway curves, and the HandleMaker spine. Was 8 (inherited from the
 *  OpenSCAD original); raised to 16 on 2026-10-09 so a design has room for
 *  several tight features (a rolled lip, a foot step, bands) as fixed-handle-
 *  fixed groups. The Bezier math has no limit of its own. */
export const MAX_CURVE_POINTS = 16;

/** Debounce delay for slider changes in ms */
export const SLIDER_DEBOUNCE_MS = 50;
