/**
 * Undo/Redo history for vase parameters.
 * Debounces rapid changes (e.g. slider drags) into single undo steps.
 */

import { create } from 'zustand';
import type { VaseParameters } from '@/engine/types';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 300;

interface HistoryStore {
  past: VaseParameters[];
  future: VaseParameters[];
  canUndo: boolean;
  canRedo: boolean;
  /** Push a snapshot (called by the debounced subscriber) */
  _push: (params: VaseParameters) => void;
  /** Clear history (e.g. on preset load) */
  clear: () => void;
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  _push: (params) =>
    set((state) => {
      const past = [...state.past, params];
      if (past.length > MAX_HISTORY) past.shift();
      return { past, future: [], canUndo: past.length > 0, canRedo: false };
    }),

  clear: () => set({ past: [], future: [], canUndo: false, canRedo: false }),
}));

/**
 * Perform undo — restores previous params snapshot.
 * Returns the restored params, or null if nothing to undo.
 */
export function undo(currentParams: VaseParameters): VaseParameters | null {
  const { past } = useHistoryStore.getState();
  if (past.length === 0) return null;

  const newPast = [...past];
  const restored = newPast.pop()!;
  const future = [currentParams, ...useHistoryStore.getState().future];

  useHistoryStore.setState({
    past: newPast,
    future,
    canUndo: newPast.length > 0,
    canRedo: true,
  });

  return restored;
}

/**
 * Perform redo — restores next params snapshot.
 * Returns the restored params, or null if nothing to redo.
 */
export function redo(currentParams: VaseParameters): VaseParameters | null {
  const { future } = useHistoryStore.getState();
  if (future.length === 0) return null;

  const newFuture = [...future];
  const restored = newFuture.shift()!;
  const past = [...useHistoryStore.getState().past, currentParams];

  useHistoryStore.setState({
    past,
    future: newFuture,
    canUndo: true,
    canRedo: newFuture.length > 0,
  });

  return restored;
}

// --- Debounced history recording ---

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRecordedParams: VaseParameters | null = null;
let skipNextChange = false;

/**
 * Call this before programmatically setting params (undo/redo/preset load)
 * so the change doesn't get recorded as a new history entry.
 */
export function skipNextHistoryRecord() {
  skipNextChange = true;
}

/**
 * Subscribe this to vase store params changes.
 * Debounces rapid changes so one slider drag = one undo step.
 */
export function recordChange(params: VaseParameters) {
  if (skipNextChange) {
    skipNextChange = false;
    lastRecordedParams = params;
    return;
  }

  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    // Only push the snapshot that was current *before* this change
    if (lastRecordedParams) {
      useHistoryStore.getState()._push(lastRecordedParams);
    }
    lastRecordedParams = params;
  }, DEBOUNCE_MS);

  // If this is the very first change, record the initial state
  if (lastRecordedParams === null) {
    lastRecordedParams = { ...DEFAULT_PARAMETERS };
  }
}
