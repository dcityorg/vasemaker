/**
 * Hook connecting the sprig store to the sprig mold generator. The drawing is
 * rasterized (SVG) or decoded and prepared (picture) asynchronously; until the
 * current one is ready
 * the previous drawing's meshes stay on screen rather than flashing empty.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSprigStore } from '@/store/sprig-store';
import { generateSprigMold, type SprigMoldMeshes } from '@/engine/sprig/sprig-generator';
import { loadSprigSource } from '@/lib/sprig-source';
import type { SprigSource } from '@/engine/sprig/relief';
import { isPictureDrawing, pictureKey, svgKey } from '@/engine/sprig/sprig-types';

export interface SprigMeshState {
  meshes: SprigMoldMeshes | null;
  /** Set when the drawing cannot be drawn, or draws nothing. */
  error: string | null;
  /** The prepared image the relief is built from (the picture preview shows it). */
  source: SprigSource | null;
}

export function useSprigMeshes(): SprigMeshState {
  const params = useSprigStore((s) => s.params);
  const picture = isPictureDrawing(params.svg);
  // Only the drawing's own kind of settings re-prepare it.
  const key = picture ? `${params.svg.length}:${pictureKey(params)}` : svgKey(params);
  const [loaded, setLoaded] = useState<{ svg: string; key: string; source: SprigSource | null; error: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    const svg = params.svg;
    const p = useSprigStore.getState().params;
    loadSprigSource(svg, { background: p.imageBackground, closeGaps: p.imageCloseGaps, smooth: p.imageSmooth, tones: p.imageTones },
      { fill: p.svgFill, closeGaps: p.svgCloseGaps, tones: p.svgTones })
      .then((r) => {
        if (!live) return;
        setLoaded(r
          ? { svg, key, source: r.source, error: null }
          : { svg, key, source: null, error: picture
            ? 'Everything in this picture counts as background. Lower Background in the Picture section.'
            : 'This SVG draws nothing darker than white — there is no shape to raise.' });
      })
      .catch(() => {
        if (live) setLoaded({ svg, key, source: null, error: picture
          ? 'This picture could not be opened. Try saving it as PNG or JPG.'
          : 'This SVG could not be drawn. Check it opens in a browser.' });
      });
    return () => { live = false; };
  }, [params.svg, key, picture]);

  const source = loaded?.source ?? null;
  const meshes = useMemo(() => (source ? generateSprigMold(params, source) : null), [params, source]);
  const current = loaded?.svg === params.svg && loaded.key === key;
  return { meshes, error: current ? loaded.error : null, source };
}
