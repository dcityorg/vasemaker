/**
 * Undo/Redo history — a snapshot stack with a debounce, so one slider drag or
 * one control-point drag becomes a single undo step.
 *
 * Generic over the parameter type (2026-08-09). It was hard-typed to
 * `VaseParameters` until the Handle tab needed its own history; nothing in it
 * was actually vase-specific, so it became a factory and the vase instance is
 * created here to keep every existing import working unchanged.
 */

import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { VaseParameters } from '@/engine/types';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 300;

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

export interface History<T> {
  /** Hook for button enable/disable. */
  useHistoryStore: UseBoundStore<StoreApi<HistoryStore<T>>>;
  /** Restore the previous snapshot, or null when there is nothing to undo. */
  undo: (current: T) => T | null;
  /** Restore the next snapshot, or null when there is nothing to redo. */
  redo: (current: T) => T | null;
  /** Subscribe this to the store's params changes. */
  recordChange: (params: T) => void;
  /**
   * Call before setting params PROGRAMMATICALLY (undo/redo, preset, file load,
   * hydrate) so the change isn't recorded as a new step. Miss one and loading a
   * file becomes undoable in pieces.
   */
  skipNextRecord: () => void;
}

interface HistoryStore<T> extends HistoryState {
  past: T[];
  future: T[];
  _push: (params: T) => void;
}

export function createHistory<T>(getInitial: () => T): History<T> {
  const useHistoryStore = create<HistoryStore<T>>((set) => ({
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

  const undo = (current: T): T | null => {
    const { past } = useHistoryStore.getState();
    if (past.length === 0) return null;
    const newPast = [...past];
    const restored = newPast.pop()!;
    const future = [current, ...useHistoryStore.getState().future];
    useHistoryStore.setState({
      past: newPast,
      future,
      canUndo: newPast.length > 0,
      canRedo: true,
    });
    return restored;
  };

  const redo = (current: T): T | null => {
    const { future } = useHistoryStore.getState();
    if (future.length === 0) return null;
    const newFuture = [...future];
    const restored = newFuture.shift()!;
    const past = [...useHistoryStore.getState().past, current];
    useHistoryStore.setState({
      past,
      future: newFuture,
      canUndo: true,
      canRedo: newFuture.length > 0,
    });
    return restored;
  };

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastRecorded: T | null = null;
  let skipNext = false;

  const skipNextRecord = () => { skipNext = true; };

  const recordChange = (params: T): void => {
    if (skipNext) {
      skipNext = false;
      lastRecorded = params;
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      // Push the snapshot that was current *before* this burst of changes.
      if (lastRecorded) useHistoryStore.getState()._push(lastRecorded);
      lastRecorded = params;
    }, DEBOUNCE_MS);
    // Very first change — the state before it is the initial one.
    if (lastRecorded === null) lastRecorded = getInitial();
  };

  return { useHistoryStore, undo, redo, recordChange, skipNextRecord };
}

// ── Vase instance (the original module-level API, unchanged for callers) ──
const vaseHistory = createHistory<VaseParameters>(() => ({ ...DEFAULT_PARAMETERS }));

export const useHistoryStore = vaseHistory.useHistoryStore;
export const undo = vaseHistory.undo;
export const redo = vaseHistory.redo;
export const recordChange = vaseHistory.recordChange;
export const skipNextHistoryRecord = vaseHistory.skipNextRecord;
