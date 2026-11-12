/**
 * The handle lives on the vase (Gary, 2026-11-11; local-docs/save-design-plan.md
 * Part 2). Its place on the mug, Around and Top Below Rim, is the vase's; the
 * Mold tab only decides whether Split Halves casts it.
 *
 * 🔑 The generators did not change. A cast handle reaches them exactly as
 * before: the vase's Around as the mold's seamAngle (the handle always sat on
 * the Split Angle side), its Top Below Rim as handleTopDrop, and the vase's
 * copy of the handle as the handle. Same numbers in, same mold out —
 * tests/checks/verify-handle-on-vase.ts proves it on every test design.
 */
import type { VaseParameters, VaseHandleSettings } from '../types';
import type { HandleParameters } from '../handle/handle-types';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { moldUsesHandle, type MoldParameters } from './mold-types';

/** The vase's handle, or the default (off) for a design that has none. */
export function vaseHandle(vase: Pick<VaseParameters, 'handle'>): VaseHandleSettings {
  return vase.handle ?? DEFAULT_PARAMETERS.handle!;
}

/** The handle shown on the mug: the vase's copy, when the handle is on. */
export function handleOnMug(vase: Pick<VaseParameters, 'handle'>): HandleParameters | null {
  const h = vaseHandle(vase);
  return h.enabled ? h.handle : null;
}

/** This mold casts the vase's handle: the style can, its switch is on, and the vase has one. */
export function moldCastsHandle(mold: MoldParameters, vase: Pick<VaseParameters, 'handle'>): boolean {
  return moldUsesHandle(mold) && !!handleOnMug(vase);
}

/** What the generators are given: the mold settings with a cast handle's place
 *  taken from the vase, and the handle (null when the mold does not cast one). */
export function moldBuildInputs(vase: Pick<VaseParameters, 'handle'>, mold: MoldParameters): { mold: MoldParameters; handle: HandleParameters | null } {
  if (!moldCastsHandle(mold, vase)) return { mold, handle: null };
  const h = vaseHandle(vase);
  return { mold: { ...mold, seamAngle: h.around, handleTopDrop: h.topDrop }, handle: h.handle };
}

/**
 * A design from before the handle moved: its handle was in the MOLD settings
 * (the Split switch, Split Angle, Top Below Rim) plus the Handle tab's design.
 * A mold that cast it gives a vase with that handle on, at that place, so a
 * mug already being poured builds the same mold. Otherwise the handle is off
 * and keeps the old Top Below Rim and angle for when it is turned on.
 */
export function handleFromOldMold(mold: MoldParameters, handle: HandleParameters | null, handleName: string | null): VaseHandleSettings {
  const cast = moldUsesHandle(mold) && !!handle;
  return {
    enabled: cast,
    around: mold.seamAngle,
    topDrop: mold.handleTopDrop,
    handle: cast ? handle : null,
    handleName: cast ? (handleName ?? '') : '',
  };
}
