/**
 * Hook connecting the vase store + mold store to the mold geometry generators.
 * Rebuilds the mold meshes whenever the vase design or the mold settings
 * change, dispatching on the selected mold style.
 *
 * Slow builds (Gary, 2026-11-01: Split Thirds with a sprig on the vase, ~3 s
 * a step, ~6 s in dev where Strict Mode builds twice) used to queue one build
 * per slider step, ~20 s for one drag. Now a build waits two frames, so the
 * "Building…" spinner is on screen before the page freezes, and always uses
 * the LATEST settings, so the steps in between are skipped. A quick build
 * (under 100 ms last time) still follows the slider live.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVaseStore } from '@/store/vase-store';
import { useMoldStore } from '@/store/mold-store';
import { useHandleStore } from '@/store/handle-store';
import { moldUsesHandle, type MoldParameters } from '@/engine/mold/mold-types';
import type { VaseParameters } from '@/engine/types';
import type { HandleParameters } from '@/engine/handle/handle-types';
import { moldWithVaseFoot } from '@/engine/mold/vase-foot';
import { setBottomMarkField } from '@/engine/bottom';
import { setVaseSprigField } from '@/engine/sprig/vase-sprig';
import { useBottomMark, useVaseSprig } from './use-vase-mesh';
import { generateMold, type AnyMoldMeshes } from '@/engine/mold/build-mold';

export type { AnyMoldMeshes };

/** The mold, and whether newer settings are waiting to be built. */
export function useMoldMeshes(): { mold: AnyMoldMeshes; building: boolean } {
  const vaseParams = useVaseStore((s) => s.params);
  // The foot is the vase's (Vase tab, Foot & Mark); the mold's own foot
  // fields only carry old files in.
  const storedMold = useMoldStore((s) => s.params);
  const moldParams = useMemo(() => moldWithVaseFoot(storedMold, vaseParams), [storedMold, vaseParams]);
  const markField = useBottomMark();
  const sprigField = useVaseSprig();
  // The Split 2-Pc handle is HandleMaker's live design. Only depend on it when
  // it is used, so editing a handle doesn't rebuild every other style.
  const handleParams = useHandleStore((s) => s.params);
  const handleDep = moldUsesHandle(moldParams) ? handleParams : null;

  const wanted = useMemo(() => ({ vaseParams, moldParams, handleDep, markField, sprigField }),
    [vaseParams, moldParams, handleDep, markField, sprigField]);
  const [built, setBuilt] = useState(wanted);
  const lastMs = useRef(0);
  useEffect(() => {
    if (built === wanted) return;
    if (lastMs.current < 100) { setBuilt(wanted); return; }
    let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => setBuilt(wanted)); });
    return () => cancelAnimationFrame(raf);
  }, [wanted, built]);

  const mold = useMemo(() => {
    const t0 = performance.now();
    const m = buildMold(built);
    lastMs.current = performance.now() - t0;
    return m;
  }, [built]);
  // Only a build that was slow last time shows the note: a quick one is
  // started straight away and would just flicker it.
  return { mold, building: built !== wanted && lastMs.current >= 100 };
}

function buildMold({ vaseParams, moldParams, handleDep, markField, sprigField }: {
  vaseParams: VaseParameters; moldParams: MoldParameters; handleDep: HandleParameters | null;
  markField: ReturnType<typeof useBottomMark>; sprigField: ReturnType<typeof useVaseSprig>;
}): AnyMoldMeshes {
  setBottomMarkField(markField);
  setVaseSprigField(sprigField); // scaled for shrink in prepareVaseParams
  return generateMold(vaseParams, moldParams, handleDep);
}
