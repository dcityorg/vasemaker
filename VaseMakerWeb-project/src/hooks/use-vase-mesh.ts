/**
 * Hook that connects the Zustand store to the mesh generator.
 * Rebuilds the mesh whenever parameters change (with debouncing).
 */

import { useMemo } from 'react';
import { useVaseStore } from '@/store/vase-store';
import { generateMesh } from '@/engine/mesh-generator';
import type { VaseMesh } from '@/engine/types';

/**
 * Returns the generated vase mesh, recomputed when parameters change.
 * Uses useMemo for automatic memoization — mesh only rebuilds when params change.
 */
export function useVaseMesh(): VaseMesh {
  const params = useVaseStore((state) => state.params);

  const mesh = useMemo(() => {
    return generateMesh(params, false); // preview resolution
  }, [params]);

  return mesh;
}
