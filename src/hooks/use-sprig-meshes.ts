/**
 * Hook connecting the sprig store to the sprig mold generator. The SVG is
 * rasterized asynchronously (browser canvas); until the current one is ready
 * the previous drawing's meshes stay on screen rather than flashing empty.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSprigStore } from '@/store/sprig-store';
import { generateSprigMold, type SprigMoldMeshes } from '@/engine/sprig/sprig-generator';
import { loadSprigSource } from '@/lib/sprig-source';
import type { SprigSource } from '@/engine/sprig/relief';

export interface SprigMeshState {
  meshes: SprigMoldMeshes | null;
  /** Set when the SVG cannot be drawn, or draws nothing. */
  error: string | null;
}

export function useSprigMeshes(): SprigMeshState {
  const params = useSprigStore((s) => s.params);
  const [loaded, setLoaded] = useState<{ svg: string; source: SprigSource | null; error: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    loadSprigSource(params.svg)
      .then((r) => {
        if (!live) return;
        setLoaded(r
          ? { svg: params.svg, source: r.source, error: null }
          : { svg: params.svg, source: null, error: 'This SVG draws nothing darker than white — there is no shape to raise.' });
      })
      .catch(() => {
        if (live) setLoaded({ svg: params.svg, source: null, error: 'This SVG could not be drawn. Check it opens in a browser.' });
      });
    return () => { live = false; };
  }, [params.svg]);

  const source = loaded?.source ?? null;
  const meshes = useMemo(() => (source ? generateSprigMold(params, source) : null), [params, source]);
  return { meshes, error: loaded?.svg === params.svg ? loaded.error : null };
}
