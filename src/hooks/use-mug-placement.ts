/**
 * The VaseMaker mug, placed against the current HandleMaker handle exactly as
 * the Split 2-Pc mold will place it. Shared by the profile editor's grey
 * overlay and the big side view, so the two can never disagree.
 * Finished mm throughout (no shrink): placement commutes with uniform scale.
 */

import { useMemo } from 'react';
import { useHandleStore } from '@/store/handle-store';
import { moldUsesHandle } from '@/engine/mold/mold-types';
import { useVaseStore } from '@/store/vase-store';
import { useMoldStore } from '@/store/mold-store';
import { sampleSpine } from '@/engine/handle/spine';
import { vaseOutlineForHandle, placeHandle, strapOutline2D, type HandlePlacement } from '@/engine/mold/split-handle';
import type { P2 } from '@/engine/handle/mesh3';

export interface MugPlacement {
  showMug: boolean;
  outline: { sil: P2[]; silFar: P2[]; rimZ: number } | null;
  placement: HandlePlacement | null;
  /** Handle outline in (z, u), or null when it can't be placed. */
  strap: P2[] | null;
  /** Handle centerline in (z, u). */
  centerline: P2[];
  error: string | null;
  topDrop: number;
  seamAngle: number;
}

/** Just the on/off decision — for callers that only switch views. */
export function useShowMug(): boolean {
  const viewPref = useHandleStore((s) => s.view.showMug);
  const auto = useMoldStore((s) => moldUsesHandle(s.params));
  return viewPref ?? auto;
}

export function useMugPlacement(): MugPlacement {
  const params = useHandleStore((s) => s.params);
  const vase = useVaseStore((s) => s.params);
  const mold = useMoldStore((s) => s.params);
  const showMug = useShowMug();

  const outline = useMemo(
    () => (showMug ? vaseOutlineForHandle(vase, mold.seamAngle, mold.keepTexture) : null),
    [showMug, vase, mold.seamAngle, mold.keepTexture],
  );

  const placed = useMemo(() => {
    if (!outline) return { placement: null, strap: null, centerline: [] as P2[], error: null };
    const stations = sampleSpine(params.spinePoints, params.spineTypes, 160, 1);
    const pl = placeHandle(outline.sil, stations, outline.rimZ - mold.handleTopDrop);
    if (typeof pl === 'string') return { placement: null, strap: null, centerline: [] as P2[], error: pl };
    const centerline = stations.map((st): P2 => {
      const s = st.y - pl.yBot;
      return [pl.B[0] + s * pl.c[0] + st.x * pl.n[0], pl.B[1] + s * pl.c[1] + st.x * pl.n[1]];
    });
    // Stored `width` is the strap IN the parting plane — what you see side-on.
    const strap = strapOutline2D(stations, pl, params.width / 2, outline.sil);
    return { placement: pl, strap, centerline, error: strap ? null : 'The handle ends could not be joined to the mug wall.' };
  }, [outline, params.spinePoints, params.spineTypes, params.width, mold.handleTopDrop]);

  return { showMug, outline, ...placed, topDrop: mold.handleTopDrop, seamAngle: mold.seamAngle };
}
