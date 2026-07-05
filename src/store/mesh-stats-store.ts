/**
 * Small store for mesh statistics, written by the viewport (which owns the
 * generated mesh) and read by the Print Check panel in the sidebar. Kept
 * separate from vase-store because stats are derived output, not parameters —
 * they must not participate in undo/redo, dirty tracking, or save files.
 */

import { create } from 'zustand';
import type { MeshStats } from '@/engine/mesh-stats';

interface MeshStatsStore {
  stats: MeshStats | null;
  setStats: (stats: MeshStats) => void;
}

export const useMeshStatsStore = create<MeshStatsStore>((set) => ({
  stats: null,
  setStats: (stats) => set({ stats }),
}));
