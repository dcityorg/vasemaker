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
import { generatePourTwoPieceMold } from '@/engine/mold/pour-two-piece-generator';
import { generatePourThreePieceMold } from '@/engine/mold/pour-three-piece-generator';
import type { MoldMeshes } from '@/engine/mold/mold-generator';
import type { OnePieceMoldMeshes } from '@/engine/mold/one-piece-generator';
import type { PourTwoPieceMoldMeshes } from '@/engine/mold/pour-two-piece-generator';
import type { PourThreePieceMoldMeshes } from '@/engine/mold/pour-three-piece-generator';

/** Any mold style's generated meshes — discriminated by `style`. */
export type AnyMoldMeshes = MoldMeshes | OnePieceMoldMeshes | PourTwoPieceMoldMeshes | PourThreePieceMoldMeshes;

export function useMoldMeshes(): AnyMoldMeshes {
  const vaseParams = useVaseStore((s) => s.params);
  const moldParams = useMoldStore((s) => s.params);
  return useMemo(() => {
    switch (moldParams.moldStyle) {
      case 'onePiece':
        return generateOnePieceMold(vaseParams, moldParams);
      case 'pourTwoPiece':
        return generatePourTwoPieceMold(vaseParams, moldParams);
      case 'pourThreePiece':
        return generatePourThreePieceMold(vaseParams, moldParams);
      default:
        return generateMoldMeshes(vaseParams, moldParams);
    }
  }, [vaseParams, moldParams]);
}
