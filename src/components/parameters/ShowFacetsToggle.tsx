'use client';

/** The Show Facets switch, the same on all four pages (store/view-prefs.ts). */

import { useShowFacets, setShowFacets } from '@/store/view-prefs';
import { Toggle } from './ui';

export function ShowFacetsToggle() {
  const on = useShowFacets();
  return (
    <>
      <Toggle label="Show Facets" checked={on} onChange={setShowFacets}
        tooltip="On: every flat triangle shows, as the printer will make it — check here that Resolution is high enough. Off: curves drawn smooth and sharp edges kept sharp; nicer to look at, but it hides the facets. Display only, the STL is the same. Remembered in this browser, on every page" />
      {!on && (
        <p className="text-[11px] text-[var(--text-secondary)] -mt-1 mb-2 leading-snug">Facets hidden — turn on to check Resolution before printing.</p>
      )}
    </>
  );
}
