/**
 * The two slow, browser-only inputs to a sprig relief: the drawing (SVG
 * rasterized, or a picture decoded and prepared) and the rendered text. Shared
 * by the Sprig page (useSprigMeshes) and the vase's bottom mark
 * (useBottomMark), so a mark looks the same in both places.
 *
 * Until the current drawing is ready the previous one stays, rather than
 * flashing empty.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadSprigSource } from '@/lib/sprig-source';
import { initPhotoDepth, usePhotoDepth } from '@/lib/photo-depth';
import type { SprigSource, TextLayer } from '@/engine/sprig/relief';
import { isPictureDrawing, pictureKey, svgKey, hasText, type SprigParameters } from '@/engine/sprig/sprig-types';
import { renderText, textLayerAt, type RenderedText } from '@/lib/sprig-text';

export interface SprigInputs {
  source: SprigSource | null;
  text: TextLayer | null;
  /** Set when the drawing cannot be drawn, or draws nothing. */
  error: string | null;
}

/** `params` null = nothing to prepare (both come back null). */
export function useSprigInputs(params: SprigParameters | null): SprigInputs {
  const latest = useRef(params);
  latest.current = params;
  const svg = params?.svg ?? '';
  const picture = isPictureDrawing(svg);
  // Photo depth runs only once it is allowed in this browser; until then (and
  // while it runs) the relief is inflated from the plain drawing.
  const allowed = usePhotoDepth((s) => s.allowed);
  // Every page that builds a sprig (the vase's texture and mark too) reads the remembered yes.
  useEffect(() => { initPhotoDepth(); }, []);
  const depth = !!params && params.heightMode === 'photoDepth' && allowed;
  // Only the drawing's own kind of settings re-prepare it.
  const key = (!params ? '' : picture ? `${svg.length}:${pictureKey(params)}` : svgKey(params)) + (depth ? '#depth' : '');
  const [loaded, setLoaded] = useState<{ svg: string; key: string; source: SprigSource | null; error: string | null } | null>(null);

  useEffect(() => {
    const p = latest.current;
    if (!p) { setLoaded(null); return; }
    let live = true;
    const load = (withDepth: boolean) => loadSprigSource(svg,
      { background: p.imageBackground, closeGaps: p.imageCloseGaps, smooth: p.imageSmooth, tones: p.imageTones },
      { fill: p.fillHeight > 0, closeGaps: p.svgCloseGaps, tones: p.svgTones }, withDepth);
    let depthFailed = false;
    // If the model cannot run here, fall back to the plain drawing (inflated) and say so.
    (depth ? load(true).catch(() => { depthFailed = true; return load(false); }) : load(false))
      .then((r) => {
        if (!live) return;
        setLoaded(r
          ? { svg, key, source: r.source, error: depthFailed
            ? 'Photo depth could not run in this browser, so the shape is inflated instead. Try again after a reload, or in another browser.' : null }
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
  }, [svg, key, picture, depth]);

  // Text is drawn once per text + font + turn; Letter Height only rescales it.
  const textKey = params && hasText(params) ? `${params.textFont}|${params.textFontName}|${params.textRotation}|${params.text}` : '';
  const [rendered, setRendered] = useState<{ key: string; r: RenderedText | null } | null>(null);
  useEffect(() => {
    let live = true;
    const p = latest.current;
    if (!textKey || !p) { setRendered(null); return; }
    renderText(p)
      .then((r) => { if (live) setRendered({ key: textKey, r }); })
      .catch(() => { if (live) setRendered({ key: textKey, r: null }); });
    return () => { live = false; };
  }, [textKey]);
  const textR = textKey && rendered ? rendered.r : null;
  const textHeight = params?.textHeight ?? 0;
  const text = useMemo(() => (textR ? textLayerAt(textR, textHeight) : null), [textR, textHeight]);

  const current = !!params && loaded?.svg === svg && loaded.key === key;
  return { source: params ? loaded?.source ?? null : null, text, error: current ? loaded!.error : null };
}
