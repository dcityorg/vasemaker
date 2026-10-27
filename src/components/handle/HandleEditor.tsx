'use client';
import { useShowFacets } from '@/store/view-prefs';

import { useState, useEffect } from 'react';
import { HandleSidebar } from './HandleSidebar';
import { HandleViewport } from './HandleViewport';
import { MugSideView } from './MugSideView';
import { useShowMug } from '@/hooks/use-mug-placement';
import { OnVaseView, SprigSource } from '@/components/viewport/OnVase';
import { useHandleStore } from '@/store/handle-store';
import { hydrateSprigSettingsFromStorage } from '@/store/sprig-store';
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
  const showMug = useShowMug();
  const onVase = useHandleStore((s) => s.view.onVase);
  const showSprig = useHandleStore((s) => s.view.showSprig);
  const flat = useShowFacets();
  // Restore persisted handle design after mount (post-hydration, client only).
  // The vase + mold settings feed the mug overlay (Split 2-Pc handle placement).
  useEffect(() => { hydrateHandleSettingsFromStorage(); hydrateVaseDesignFromStorage(); hydrateMoldSettingsFromStorage(); hydrateSprigSettingsFromStorage(); }, []);
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <HandleSidebar handle={handle} helpOpen={helpOpen} onToggleHelp={() => setHelpOpen((v) => !v)} />
      <div className="flex-1 min-w-0">
        {showMug && onVase
          ? (showSprig
            ? <SprigSource>{(sprig) => <OnVaseView sprig={sprig} showHandle cameraId="handle-vase" flat={flat} />}</SprigSource>
            : <OnVaseView sprig={null} showHandle cameraId="handle-vase" flat={flat} />)
          : showMug ? <MugSideView /> : <HandleViewport handle={handle} />}
      </div>
      {helpOpen && <HelpPanel sections={HANDLE_HELP_SECTIONS} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
