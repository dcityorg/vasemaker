/**
 * Hook connecting the vase store + mold store to the mold geometry generators.
 * Rebuilds the mold meshes whenever the vase design or the mold settings
 * change, dispatching on the selected mold style.
 */

import { useMemo } from 'react';
import { useVaseStore } from '@/store/vase-store';
import { useMoldStore } from '@/store/mold-store';
import { generateMoldMeshes } from '@/engine/mold/mold-generator';
import { generateOnePieceMold } from '@/engine/mold/one-piece-generator';
import type { MoldMeshes } from '@/engine/mold/mold-generator';
import type { OnePieceMoldMeshes } from '@/engine/mold/one-piece-generator';

/** Either mold style's generated meshes — discriminated by `style`. */
export type AnyMoldMeshes = MoldMeshes | OnePieceMoldMeshes;

export function useMoldMeshes(): AnyMoldMeshes {
  const vaseParams = useVaseStore((s) => s.params);
  const moldParams = useMoldStore((s) => s.params);
  return useMemo(
    () =>
      moldParams.moldStyle === 'onePiece'
        ? generateOnePieceMold(vaseParams, moldParams)
        : generateMoldMeshes(vaseParams, moldParams),
    [vaseParams, moldParams]
  );
}
