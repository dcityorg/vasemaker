/**
 * Zustand store for MoldMaker settings. Independent of vase-store — MoldMaker
 * reads the live vase design from vase-store and layers these mold settings on top.
 * Deliberately simple: no undo/dirty/save (mold settings are lightweight and
 * ephemeral relative to the vase design, which owns persistence).
 */

import { create } from 'zustand';
import type { MoldParameters } from '@/engine/mold/mold-types';
import { DEFAULT_MOLD_PARAMETERS } from '@/engine/mold/mold-types';

/** Which parts are visible in the mold viewport. */
export interface MoldView {
  showMaster: boolean;
  showCottle: boolean;
  showPlaster: boolean;
  crossSection: boolean;
  showUndercuts: boolean;
}

const DEFAULT_VIEW: MoldView = {
  showMaster: true,
  showCottle: true,
  showPlaster: false,
  crossSection: false,
  showUndercuts: true,
};

interface MoldStore {
  params: MoldParameters;
  view: MoldView;
  setParam: <K extends keyof MoldParameters>(key: K, value: MoldParameters[K]) => void;
  setView: (update: Partial<MoldView>) => void;
  reset: () => void;
}

export const useMoldStore = create<MoldStore>((set) => ({
  params: { ...DEFAULT_MOLD_PARAMETERS },
  view: { ...DEFAULT_VIEW },
  setParam: (key, value) =>
    set((state) => ({ params: { ...state.params, [key]: value } })),
  setView: (update) =>
    set((state) => ({ view: { ...state.view, ...update } })),
  reset: () => set({ params: { ...DEFAULT_MOLD_PARAMETERS } }),
}));
