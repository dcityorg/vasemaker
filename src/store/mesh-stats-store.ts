/**
 * Small store for mesh statistics, written by the viewport (which owns the
 * generated mesh) and read by the Print Check panel in the sidebar. Kept
 * separate from vase-store because stats are derived output, not parameters —
 * they must not participate in undo/redo, dirty tracking, or save files.
 */

import { create } from 'zustand';
import type { MeshStats } from '@/engine/mesh-stats';
import type { BottomFloor } from '@/engine/types';

interface MeshStatsStore {
  stats: MeshStats | null;
  setStats: (stats: MeshStats) => void;
  /** Foot / mark warnings from the last mesh build (Bottom section). */
  bottomNotes: string[];
  /** Sprig texture warnings from the last mesh build (Textures section). */
  sprigNotes: string[];
  /** The inside floor when a foot or mark lifts it, else null (Bottom section). */
  bottomFloor: BottomFloor | null;
}

export const useMeshStatsStore = create<MeshStatsStore>((set) => ({
  stats: null,
  setStats: (stats) => set({ stats }),
  bottomNotes: [],
  sprigNotes: [],
  bottomFloor: null,
}));
