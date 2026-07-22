/**
 * Hook connecting the vase store + mold store to the mold geometry generator.
 * Rebuilds the master/cottle/plaster meshes whenever the vase design or the
 * mold settings change.
 */

import { useMemo } from 'react';
import { useVaseStore } from '@/store/vase-store';
import { useMoldStore } from '@/store/mold-store';
import { generateMoldMeshes } from '@/engine/mold/mold-generator';
import type { MoldMeshes } from '@/engine/mold/mold-generator';

export function useMoldMeshes(): MoldMeshes {
  const vaseParams = useVaseStore((s) => s.params);
  const moldParams = useMoldStore((s) => s.params);
  return useMemo(() => generateMoldMeshes(vaseParams, moldParams), [vaseParams, moldParams]);
}
