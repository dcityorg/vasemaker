'use client';

import { useState, useEffect } from 'react';
import { SprigSidebar } from './SprigSidebar';
import { SprigViewport } from './SprigViewport';
import { HelpPanel } from '@/components/editor/HelpPanel';
import { SPRIG_HELP_SECTIONS } from '@/content/sprig-help-content';
import { useSprigMeshes } from '@/hooks/use-sprig-meshes';
import { hydrateSprigSettingsFromStorage } from '@/store/sprig-store';
import { hydrateVaseDesignFromStorage } from '@/store/vase-store';
import { hydrateHandleSettingsFromStorage } from '@/store/handle-store';
import { hydrateMoldSettingsFromStorage } from '@/store/mold-store';

/** SprigMaker layout — sidebar left, 3D preview middle, optional help right. */
export function SprigEditor() {
  const sprig = useSprigMeshes();
  const [helpOpen, setHelpOpen] = useState(false);
  // Restore the persisted sprig after mount (post-hydration, client only) — and
  // the vase, the handle and the mold settings (where the handle sits), which
  // the On Vase view shows.
  useEffect(() => { hydrateSprigSettingsFromStorage(); hydrateVaseDesignFromStorage(); hydrateHandleSettingsFromStorage(); hydrateMoldSettingsFromStorage(); }, []);
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SprigSidebar sprig={sprig} helpOpen={helpOpen} onToggleHelp={() => setHelpOpen((v) => !v)} />
      <div className="flex-1 min-w-0">
        <SprigViewport sprig={sprig.meshes} />
      </div>
      {helpOpen && <HelpPanel sections={SPRIG_HELP_SECTIONS} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
