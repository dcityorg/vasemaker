/**
 * Hook that connects the Zustand store to the mesh generator.
 * Rebuilds the mesh whenever parameters change (with debouncing).
 */

import { useMemo, useEffect, useState } from 'react';
import { useVaseStore } from '@/store/vase-store';
import { generateMesh, setSvgPatternData } from '@/engine/mesh-generator';
import { parseSvgInput, rasterizeSvg } from '@/engine/svg-rasterizer';
import type { VaseMesh } from '@/engine/types';

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

  const mesh = useMemo(() => {
    // svgVersion is included to trigger rebuild after async rasterization
    void svgVersion;
    return generateMesh(params);
  }, [params, svgVersion]);

  return mesh;
}
