'use client';

import { DimensionControls } from '@/components/parameters/DimensionControls';
import { useVaseStore } from '@/store/vase-store';
import { BUILT_IN_PRESETS } from '@/presets';
import { downloadSTL } from '@/engine/stl-export';
import { generateMesh } from '@/engine/mesh-generator';

export function Sidebar() {
  const { loadPreset, resetToDefaults, getParams } = useVaseStore();

  const handleExportSTL = () => {
    const params = getParams();
    const mesh = generateMesh(params, true); // export resolution
    downloadSTL(mesh, 'vasemaker-export.stl');
  };

  return (
    <div className="w-80 h-full bg-[var(--bg-panel)] border-r border-[var(--border-color)] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-color)]">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">VaseMaker</h1>
        <p className="text-xs text-[var(--text-secondary)]">Parametric 3D Vase Designer</p>
      </div>

      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-[var(--border-color)] flex gap-2">
        <select
          onChange={(e) => {
            const preset = BUILT_IN_PRESETS[parseInt(e.target.value)];
            if (preset) loadPreset(preset);
          }}
          defaultValue=""
          className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-[var(--text-primary)]"
        >
          <option value="" disabled>Load Preset...</option>
          {BUILT_IN_PRESETS.map((p, i) => (
            <option key={i} value={i}>{p.name}</option>
          ))}
        </select>
        <button
          onClick={resetToDefaults}
          className="px-2 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:bg-[var(--border-color)] transition-colors"
          title="Reset to defaults"
        >
          Reset
        </button>
      </div>

      {/* Parameter controls — scrollable */}
      <div className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3">
        <DimensionControls />
      </div>

      {/* Export button — fixed at bottom */}
      <div className="px-3 py-3 border-t border-[var(--border-color)]">
        <button
          onClick={handleExportSTL}
          className="w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded transition-colors"
        >
          Export STL
        </button>
      </div>
    </div>
  );
}
