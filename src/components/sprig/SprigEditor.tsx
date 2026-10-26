'use client';

import { useState, useEffect } from 'react';
import { SprigSidebar } from './SprigSidebar';
import { SprigViewport } from './SprigViewport';
import { SprigDesignContext } from './sprig-design-context';
import { HelpPanel } from '@/components/editor/HelpPanel';
import { SPRIG_HELP_SECTIONS } from '@/content/sprig-help-content';
import { useSprigMeshes } from '@/hooks/use-sprig-meshes';
import { sprigDesign, markDesign } from '@/store/sprig-store';
import { hydrateVaseDesignFromStorage } from '@/store/vase-store';
import { hydrateHandleSettingsFromStorage } from '@/store/handle-store';
import { hydrateMoldSettingsFromStorage } from '@/store/mold-store';

type Tab = 'sprig' | 'mark';
/** Which tab was open, per browser tab — a convenience, like the cameras. */
const TAB_KEY = 'vasemaker-sprig-tab';

/** SprigMaker layout — sidebar left, 3D preview middle, optional help right. */
export function SprigEditor() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [tab, setTabState] = useState<Tab>('sprig');
  const setTab = (t: Tab) => {
    setTabState(t);
    try { window.sessionStorage.setItem(TAB_KEY, t); } catch { /* storage blocked — not remembered */ }
  };
  // Restore the persisted sprig and mark after mount (post-hydration, client
  // only) — and the vase, the handle and the mold settings (where the handle
  // sits), which the On Vase view shows.
  useEffect(() => {
    sprigDesign.hydrate(); markDesign.hydrate();
    hydrateVaseDesignFromStorage(); hydrateHandleSettingsFromStorage(); hydrateMoldSettingsFromStorage();
    try { if (window.sessionStorage.getItem(TAB_KEY) === 'mark') setTabState('mark'); } catch { /* storage blocked */ }
  }, []);
  const design = tab === 'mark' ? markDesign : sprigDesign;
  return (
    <SprigDesignContext.Provider value={design}>
      {/* key: a tab switch remounts the page body, so nothing (prepared drawing,
          text render, selection) carries from one design to the other. */}
      <SprigBody key={tab} tab={tab} setTab={setTab} helpOpen={helpOpen} setHelpOpen={setHelpOpen} />
    </SprigDesignContext.Provider>
  );
}

function SprigBody({ tab, setTab, helpOpen, setHelpOpen }: {
  tab: Tab; setTab: (t: Tab) => void; helpOpen: boolean; setHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const sprig = useSprigMeshes();
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SprigSidebar sprig={sprig} tab={tab} onTab={setTab} helpOpen={helpOpen} onToggleHelp={() => setHelpOpen((v) => !v)} />
      <div className="flex-1 min-w-0">
        <SprigViewport sprig={sprig.meshes} />
      </div>
      {helpOpen && <HelpPanel sections={SPRIG_HELP_SECTIONS} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
