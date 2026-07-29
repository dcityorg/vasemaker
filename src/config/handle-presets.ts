/**
 * Built-in handle spine presets. Each preset overrides the handle SHAPE (spine
 * + suggested dimensions); mold settings are left untouched.
 *
 * Spine design note: a middle 'fixed' point is tangent-smooth only when its
 * neighboring handles share its x — otherwise the curve kinks there and the
 * swept surface pinches on the inside of the bend.
 *
 * Spine points are in mm (v1.16.0). Presets carry no drawing-area extents —
 * applyPreset fits the window to the shape on arrival.
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
    id: 'classic-d',
    name: 'Classic D',
    description: 'Smooth D-shaped mug handle — even bulge, vertical mid-section',
    params: {
      spinePoints: [
        [0, 0],
        [35, 15],
        [35, 50],
        [35, 85],
        [0, 100],
      ],
      spineTypes: ['fixed', 'handle', 'fixed', 'handle', 'fixed'],
      width: 14,
      thickness: 10,
    },
  },
  {
    id: 'ear',
    name: 'Ear',
    description: 'Organic ear / question-mark shape — fuller at the top, tucks in below',
    params: {
      spinePoints: [
        [0, 0],
        [20.9, 9],
        [38, 40.5],
        [38, 55.8],
        [32.3, 81],
        [0, 90],
      ],
      spineTypes: ['fixed', 'handle', 'handle', 'handle', 'handle', 'fixed'],
      width: 14,
      thickness: 10,
    },
  },
  {
    id: 'squared',
    name: 'Squared',
    description: 'Angular strap handle with softened corners, like the reference video',
    params: {
      spinePoints: [
        [0, 0],
        [27, 4.4],
        [30, 24.2],
        [30, 55],
        [30, 85.8],
        [27, 105.6],
        [0, 110],
      ],
      spineTypes: ['fixed', 'handle', 'fixed', 'handle', 'fixed', 'handle', 'fixed'],
      width: 16,
      thickness: 9,
    },
  },
];
