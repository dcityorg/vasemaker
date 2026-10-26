/**
 * Hook connecting the sprig store to the sprig mold generator. The drawing is
 * rasterized (SVG) or decoded and prepared (picture) asynchronously; until the
 * current one is ready
 * the previous drawing's meshes stay on screen rather than flashing empty.
 */

import { useMemo } from 'react';
import { useSprigDesign } from '@/components/sprig/sprig-design-context';
import { generateSprigMold, type SprigMoldMeshes } from '@/engine/sprig/sprig-generator';
import type { SprigSource } from '@/engine/sprig/relief';
import { sprigFootprint, type SprigParameters } from '@/engine/sprig/sprig-types';
import { useSprigInputs } from './use-sprig-inputs';

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
  const params = design.useStore((s) => s.params);
  const { source, text, error } = useSprigInputs(params);
  const isMark = design.kind === 'mark';
  const meshes = useMemo(
    () => (source && (params.drawingOn || text)
      ? (isMark
        ? generateSprigMold(markDisplayParams(params, text ? { w: text.mmW, h: text.mmH } : null), source, text, { bare: true })
        : generateSprigMold(params, source, text))
      : null),
    [params, source, text, isMark],
  );
  return { meshes, error, source, textSize: text ? { w: text.mmW, h: text.mmH } : null };
}
