'use client';

import { useState, useEffect } from 'react';
import { MoldSidebar } from './MoldSidebar';
import { MoldViewport } from './MoldViewport';
import { HelpPanel } from '@/components/editor/HelpPanel';
import { MOLD_HELP_SECTIONS } from '@/content/mold-help-content';
import { useMoldMeshes } from '@/hooks/use-mold-meshes';
import { hydrateMoldSettingsFromStorage } from '@/store/mold-store';
import { hydrateVaseDesignFromStorage } from '@/store/vase-store';
import { hydrateHandleSettingsFromStorage } from '@/store/handle-store';

/** MoldMaker layout — settings sidebar on the left, 3D mold preview in the
 * middle, optional help panel on the right (mirrors the vase Editor). */
export function MoldEditor() {
  const { mold, building } = useMoldMeshes();
  const [helpOpen, setHelpOpen] = useState(false);
  // Restore persisted mold settings after mount (post-hydration, client only).
  // The mold is DERIVED from the vase, so this route needs the design restored
  // just as much as the vase route does — landing here on a reload used to show
  // your mold settings wrapped around the default Classic Vase.
  useEffect(() => { hydrateVaseDesignFromStorage(); hydrateMoldSettingsFromStorage(); hydrateHandleSettingsFromStorage(); }, []);
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <MoldSidebar mold={mold} helpOpen={helpOpen} onToggleHelp={() => setHelpOpen((v) => !v)} />
      <div className="flex-1 min-w-0 relative">
        <MoldViewport mold={mold} />
        {building && <BuildingNote />}
      </div>
      {helpOpen && <HelpPanel sections={MOLD_HELP_SECTIONS} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

/** Over the view while newer settings are being built (slow builds only,
 *  use-mold-meshes.ts). The spin is a CSS transform, which keeps turning
 *  while the build freezes the page (globals.css .mold-building-spin). */
function BuildingNote() {
  return (
    <div className="mold-building pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 text-xs text-white">
      <span className="mold-building-spin inline-block w-4 h-4 rounded-full border-2 border-white/30 border-t-white" />
      Building…
    </div>
  );
}
