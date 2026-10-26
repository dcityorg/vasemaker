/**
 * Hook that connects the Zustand store to the mesh generator.
 * Rebuilds the mesh whenever parameters change (with debouncing).
 */

import { useMemo, useEffect, useState } from 'react';
import { useVaseStore } from '@/store/vase-store';
import { generateMesh, setSvgPatternData } from '@/engine/mesh-generator';
import { parseSvgInput, rasterizeSvg } from '@/engine/svg-rasterizer';
import type { VaseMesh } from '@/engine/types';
import { setBottomMarkField } from '@/engine/bottom';
import { buildRelief } from '@/engine/sprig/relief';
import { useSprigInputs } from './use-sprig-inputs';

/**
 * Returns the generated vase mesh, recomputed when parameters change.
 * Uses useMemo for automatic memoization — mesh only rebuilds when params change.
 */
export function useVaseMesh(): VaseMesh {
  const params = useVaseStore((state) => state.params);
  const [svgVersion, setSvgVersion] = useState(0);

  // Async rasterize SVG when svgText or padding changes
  const svgText = params.textures.svgPattern?.svgText ?? '';
  const svgEnabled = params.textures.svgPattern?.enabled ?? false;
  const svgPadding = params.textures.svgPattern?.padding ?? 0;

  useEffect(() => {
    if (!svgText || !svgEnabled) {
      setSvgPatternData(null);
      setSvgVersion((v) => v + 1);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const markup = parseSvgInput(svgText);
        const data = await rasterizeSvg(markup, 512, svgPadding);
        if (!cancelled) {
          setSvgPatternData(data);
          setSvgVersion((v) => v + 1);
        }
      } catch (err) {
        console.warn('SVG rasterization failed:', err);
        if (!cancelled) {
          setSvgPatternData(null);
          setSvgVersion((v) => v + 1);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [svgText, svgEnabled, svgPadding]);

  const markField = useBottomMark();

  const mesh = useMemo(() => {
    // svgVersion is included to trigger rebuild after async rasterization
    void svgVersion;
    setBottomMarkField(markField);
    return generateMesh(params);
  }, [params, svgVersion, markField]);

  return mesh;
}

/**
 * The bottom mark's relief, from the vase's own copy of the Mark design, at
 * its finished size (no Shrink — a mold scales the whole master). Null when
 * the mark is off, there is no base to put it in, or it is still drawing.
 */
function useBottomMark() {
  const b = useVaseStore((s) => s.params.bottom);
  const hasBase = useVaseStore((s) => s.params.wallThickness > 0 && s.params.bottomThickness > 0);
  const mark = b?.markOn && hasBase ? b.mark : null;
  const { source, text } = useSprigInputs(mark);
  return useMemo(
    () => (mark && source && (mark.drawingOn || text) ? buildRelief(source, mark, Math.max(0.05, mark.resolution), text) : null),
    [mark, source, text],
  );
}
