/**
 * Built-in handle spine presets. Each preset overrides the handle SHAPE (spine
 * + suggested dimensions); mold settings are left untouched.
 *
 * Spine design note: a middle 'fixed' point is tangent-smooth only when its
 * neighboring handles share its x — otherwise the curve kinks there and the
 * swept surface pinches on the inside of the bend.
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
    },
  },
  {
    id: 'ear',
    name: 'Ear',
    description: 'Organic ear / question-mark shape — fuller at the top, tucks in below',
    params: {
      spinePoints: [
        [0, 0],
        [0.55, 0.1],
        [1, 0.45],
        [1, 0.62],
        [0.85, 0.9],
        [0, 1],
      ],
      spineTypes: ['fixed', 'handle', 'handle', 'handle', 'handle', 'fixed'],
      height: 90,
      depth: 38,
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
        [0.9, 0.04],
        [1, 0.22],
        [1, 0.5],
        [1, 0.78],
        [0.9, 0.96],
        [0, 1],
      ],
      spineTypes: ['fixed', 'handle', 'fixed', 'handle', 'fixed', 'handle', 'fixed'],
      height: 110,
      depth: 30,
      width: 16,
      thickness: 9,
    },
  },
];
