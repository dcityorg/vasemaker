'use client';

import { useState, useEffect } from 'react';
import { MoldSidebar } from './MoldSidebar';
import { MoldViewport } from './MoldViewport';
import { HelpPanel } from '@/components/editor/HelpPanel';
import { MOLD_HELP_SECTIONS } from '@/content/mold-help-content';
import { useMoldMeshes } from '@/hooks/use-mold-meshes';
import { hydrateMoldSettingsFromStorage } from '@/store/mold-store';

/** MoldMaker layout — settings sidebar on the left, 3D mold preview in the
 * middle, optional help panel on the right (mirrors the vase Editor). */
export function MoldEditor() {
  const mold = useMoldMeshes();
  const [helpOpen, setHelpOpen] = useState(false);
  // Restore persisted mold settings after mount (post-hydration, client only).
  useEffect(() => { hydrateMoldSettingsFromStorage(); }, []);
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <MoldSidebar mold={mold} helpOpen={helpOpen} onToggleHelp={() => setHelpOpen((v) => !v)} />
      <div className="flex-1 min-w-0">
        <MoldViewport mold={mold} />
      </div>
      {helpOpen && <HelpPanel sections={MOLD_HELP_SECTIONS} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
