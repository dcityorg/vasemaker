/**
 * Built-in handle spine presets. Each preset overrides the handle SHAPE (spine
 * + its cross-section); mold settings are deliberately left untouched, so
 * trying a different handle never discards a tuned flange, margin or seal.
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

import type { HandleParameters } from '@/engine/handle/handle-types';

export interface HandlePreset {
  id: string;
  name: string;
  description: string;
  params: Partial<HandleParameters>;
}

export const HANDLE_PRESETS: HandlePreset[] = [
  {
    id: 'c-handle',
    name: 'C',
    description: 'Round C-curve, 64 × 36 mm — even bulge, widest at mid-height',
    params: {
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
