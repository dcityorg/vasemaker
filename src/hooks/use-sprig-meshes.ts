/**
 * Hook connecting the sprig store to the sprig mold generator. The drawing is
 * rasterized (SVG) or decoded and prepared (picture) asynchronously; until the
 * current one is ready
 * the previous drawing's meshes stay on screen rather than flashing empty.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSprigDesign } from '@/components/sprig/sprig-design-context';
import { generateSprigMold, type SprigMoldMeshes } from '@/engine/sprig/sprig-generator';
import { loadSprigSource } from '@/lib/sprig-source';
import type { SprigSource } from '@/engine/sprig/relief';
import { isPictureDrawing, pictureKey, svgKey, hasText, sprigFootprint, type SprigParameters } from '@/engine/sprig/sprig-types';
import { renderText, textLayerAt, type RenderedText } from '@/lib/sprig-text';

export interface SprigMeshState {
  meshes: SprigMoldMeshes | null;
  /** Set when the drawing cannot be drawn, or draws nothing. */
  error: string | null;
  /** The prepared image the relief is built from (the picture preview shows it). */
  source: SprigSource | null;
  /** Rendered text size, finished mm (null = no text), for the mold-size checks. */
  textSize: { w: number; h: number } | null;
}

/** Border of plate shown round a mark, mm. */
const MARK_PLATE_BORDER = 3;

/**
 * The Mark tab shows the mark itself, not a mold: finished size (no Shrink — the
 * vase or the mold applies its own) on a plate just bigger than it. Display
 * only; the stored mark is untouched.
 */
function markDisplayParams(p: SprigParameters, text: { w: number; h: number } | null): SprigParameters {
  const [w, l] = sprigFootprint(p, text);
  return {
    ...p, shrinkPercent: 0, moldSize: 'custom', plasterMargin: 0,
    customCavW: Math.ceil(w + 2 * MARK_PLATE_BORDER), customCavL: Math.ceil(l + 2 * MARK_PLATE_BORDER),
  };
}

export function useSprigMeshes(): SprigMeshState {
  const design = useSprigDesign();
  const useSprigStore = design.useStore;
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

  // Text is drawn once per text + font + turn; Letter Height only rescales it.
  const textKey = hasText(params) ? `${params.textFont}|${params.textFontName}|${params.textRotation}|${params.text}` : '';
  const [rendered, setRendered] = useState<{ key: string; r: RenderedText | null } | null>(null);
  useEffect(() => {
    let live = true;
    if (!textKey) { setRendered(null); return; }
    const p = useSprigStore.getState().params;
    renderText(p)
      .then((r) => { if (live) setRendered({ key: textKey, r }); })
      .catch(() => { if (live) setRendered({ key: textKey, r: null }); });
    return () => { live = false; };
  }, [textKey]);
  const textR = textKey && rendered ? rendered.r : null;
  const text = useMemo(() => (textR ? textLayerAt(textR, params.textHeight) : null), [textR, params.textHeight]);

  const source = loaded?.source ?? null;
  const isMark = design.kind === 'mark';
  const meshes = useMemo(
    () => (source && (params.drawingOn || text)
      ? (isMark
        ? generateSprigMold(markDisplayParams(params, text ? { w: text.mmW, h: text.mmH } : null), source, text, { bare: true })
        : generateSprigMold(params, source, text))
      : null),
    [params, source, text, isMark],
  );
  const current = loaded?.svg === params.svg && loaded.key === key;
  return {
    meshes, error: current ? loaded.error : null, source,
    textSize: text ? { w: text.mmW, h: text.mmH } : null,
  };
}
