'use client';

import { MoldSidebar } from './MoldSidebar';
import { MoldViewport } from './MoldViewport';
import { useMoldMeshes } from '@/hooks/use-mold-meshes';

/** MoldMaker layout — settings sidebar on the left, 3D mold preview on the right. */
export function MoldEditor() {
  const mold = useMoldMeshes();
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <MoldSidebar mold={mold} />
      <div className="flex-1 min-w-0">
        <MoldViewport mold={mold} />
      </div>
    </div>
  );
}
