'use client';

import { ShapeControls } from './ShapeControls';
import { TextureControls } from './TextureControls';
import { SmoothingControls } from './SmoothingControls';
import { TwistControls } from './TwistControls';
import { SettingsControls } from './SettingsControls';
import { BottomControls } from './BottomControls';
import { ViewControls } from './ViewControls';
import { useVaseStore } from '@/store/vase-store';
import { UI_MUTED } from '@/config/colors';

export function DimensionControls({ designName }: { designName?: string | null }) {
  return (
    <>
      <ViewControls />
      <ShapeControls />
      <TextureControls designName={designName} />
      <SmoothingControls />
      <TwistControls />
      <BottomControls />
      <SettingsControls />
      <RevertToSaved />
    </>
  );
}

/** Bottom of the panel, as on Mold / Handle / Sprig (Gary, 2026-10-26). */
function RevertToSaved() {
  const isDirty = useVaseStore((s) => s.isDirty);
  const saved = useVaseStore((s) => s.savedParams);
  const revert = useVaseStore((s) => s.revertToSaved);
  if (!isDirty || !saved) return null;
  return (
    <button
      onClick={revert}
      className="mt-4 w-full py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs rounded hover:bg-[var(--border-color)] transition-colors"
      style={{ color: UI_MUTED }}
      title="Put the vase back to the last Save Design, Load Design or preset. Undo (⌘Z) brings your changes back"
    >
      Revert to Saved
    </button>
  );
}
