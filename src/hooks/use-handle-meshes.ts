/**
 * Hook connecting the handle store to the handle mold generator.
 */

import { useMemo } from 'react';
import { useHandleStore } from '@/store/handle-store';
import { generateHandleMold } from '@/engine/handle/handle-generator';
import type { HandleMeshes } from '@/engine/handle/handle-generator';

export function useHandleMeshes(): HandleMeshes {
  const params = useHandleStore((s) => s.params);
  return useMemo(() => generateHandleMold(params), [params]);
}
