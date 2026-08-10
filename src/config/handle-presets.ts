/**
 * Built-in handle presets: a shape PLUS the mold settings Gary has printed and
 * poured successfully (2026-08-09).
 *
 * They used to be shape-only, deliberately, so that trying another handle never
 * discarded a tuned flange or margin. He asked for the settings to come along —
 * the point of a preset is now "a known-good handle", not just "a silhouette" —
 * and the trade that made shape-only right has since changed: Reset keeps your
 * shape, undo covers a preset in one step, and Revert to Saved gets you back to
 * your own file. So the settings a preset overwrites are all recoverable.
 *
 * `SHARED` is spread into every preset rather than left to the defaults, so
 * picking one RESTORES the proven numbers instead of inheriting whatever you had
 * tuned. It duplicates `DEFAULT_HANDLE_PARAMETERS` on purpose: the defaults are
 * what a new user starts with, these are what a preset asserts.
 *
 * Spine design note: a middle 'fixed' point is tangent-smooth only when its
 * neighboring handles share its x — otherwise the curve kinks there and the
 * swept surface pinches on the inside of the bend. These three use all-'handle'
 * middles, which is smooth everywhere by construction.
 *
 * Spine points are in mm (v1.16.0). Presets carry no drawing-area extents —
 * applyPreset fits the window to the shape on arrival.
 *
 * The three shapes are Gary's own designs, printed and poured 2026-08-01;
 * the source settings files live beside their STLs in
 * `~/Dropbox/SharedSherGary/Molds/Handles/`. Only spine + section are taken
 * from those files — every other setting in them already matches the defaults.
 */

import { DEFAULT_HANDLE_PARAMETERS } from '@/engine/handle/handle-types';
import type { HandleParameters } from '@/engine/handle/handle-types';

export interface HandlePreset {
  id: string;
  name: string;
  description: string;
  params: Partial<HandleParameters>;
}

/** The settings block every built-in preset carries. */
const SHARED: Partial<HandleParameters> = {
  shrinkPercent: 12,
  masterShellThickness: 2,
  ribWidth: 3,
  ribCount: 4,
  spineSamples: 300,
  sectionSegments: 80,
  openingDiameter: 22,
  cylinderLength: 10,
  coneLength: 12,
  seatDepth: 3,
  lipWidth: 2,
  plateFloor: 2,
  recessClearance: 0.1,
  domeDiameter: 16,
  domeHeight: 2,
  vWidth: 2,
  vHeight: 1.4,
  vClearance: 0.2,
  plasterMargin: 25,
  plasterAbove: 15,
  wallThickness: 4,
  wellSealDepth: 3,
  flangeWidth: 14,
};

export const HANDLE_PRESETS: HandlePreset[] = [
  {
    // The shape the app starts with. It is here so the built-in handle stays
    // reachable now that Reset keeps your shape instead of replacing it — the
    // preset list IS the shape-reset. Named for its role rather than its
    // silhouette: "U" or "C" would both collide with the C preset below.
    // Deliberately references the defaults, so it follows them if they change.
    id: 'basic',
    name: 'Basic',
    description: 'The built-in starting shape, 84 × 40 mm — a plain three-finger arch',
    params: {
      ...SHARED,
      spinePoints: DEFAULT_HANDLE_PARAMETERS.spinePoints.map((p) => [...p] as [number, number]),
      spineTypes: [...DEFAULT_HANDLE_PARAMETERS.spineTypes],
      width: DEFAULT_HANDLE_PARAMETERS.width,       // UI "Thickness" 10
      thickness: DEFAULT_HANDLE_PARAMETERS.thickness, // UI "Width" 16
    },
  },
  {
    id: 'c-handle',
    name: 'C',
    description: 'Round C-curve, 64 × 36 mm — even bulge, widest at mid-height',
    params: {
      ...SHARED,
      spinePoints: [
        [0, 0],
        [25.74, -9],
        [60.95, 32.1],
        [25.74, 73],
        [0, 64],
      ],
      spineTypes: ['fixed', 'handle', 'handle', 'handle', 'fixed'],
      // Stored fields, NOT the UI labels: `thickness` is the UI's Width
      // (across the parting plane) and `width` is the UI's Thickness.
      width: 9,
      thickness: 16,
    },
  },
  {
    id: 'd-handle',
    name: 'D',
    description: 'Squared D, 65 × 34 mm — leaves the wall flat, straight mid-section',
    params: {
      ...SHARED,
      spinePoints: [
        [0, 0],
        [50, 0],
        [30, 5],
        [30, 60],
        [50, 65],
        [0, 65],
      ],
      spineTypes: ['fixed', 'handle', 'handle', 'handle', 'handle', 'fixed'],
      width: 10,
      thickness: 16,
    },
  },
  {
    id: 'ear',
    name: 'Ear',
    description: 'Asymmetric ear, 63 × 35 mm — fuller at the top; needs an A + B kit',
    params: {
      ...SHARED,
      spinePoints: [
        [0, 0],
        [30.02, 11],
        [54.04, 41],
        [28.92, 82.5],
        [0, 63],
      ],
      spineTypes: ['fixed', 'handle', 'handle', 'handle', 'fixed'],
      width: 9,
      thickness: 16,
    },
  },
];
