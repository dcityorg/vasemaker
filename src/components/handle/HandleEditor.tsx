'use client';

import { useState, useEffect } from 'react';
import { HandleSidebar } from './HandleSidebar';
import { HandleViewport } from './HandleViewport';
import { HelpPanel } from '@/components/editor/HelpPanel';
import { HANDLE_HELP_SECTIONS } from '@/content/handle-help-content';
import { useHandleMeshes } from '@/hooks/use-handle-meshes';
import { hydrateHandleSettingsFromStorage } from '@/store/handle-store';
import { hydrateVaseDesignFromStorage } from '@/store/vase-store';
import { hydrateMoldSettingsFromStorage } from '@/store/mold-store';

/** HandleMaker layout — sidebar left, 3D preview middle, optional help right. */
export function HandleEditor() {
  const handle = useHandleMeshes();
  const [helpOpen, setHelpOpen] = useState(false);
  // Restore persisted handle design after mount (post-hydration, client only).
  // The vase + mold settings feed the mug overlay (Split 2-Pc handle placement).
  useEffect(() => { hydrateHandleSettingsFromStorage(); hydrateVaseDesignFromStorage(); hydrateMoldSettingsFromStorage(); }, []);
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <HandleSidebar handle={handle} helpOpen={helpOpen} onToggleHelp={() => setHelpOpen((v) => !v)} />
      <div className="flex-1 min-w-0">
        <HandleViewport handle={handle} />
      </div>
      {helpOpen && <HelpPanel sections={HANDLE_HELP_SECTIONS} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
