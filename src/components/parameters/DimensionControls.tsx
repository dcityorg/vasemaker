'use client';

import { ShapeControls } from './ShapeControls';
import { TextureControls } from './TextureControls';
import { SmoothingControls } from './SmoothingControls';
import { TwistControls } from './TwistControls';
import { SettingsControls } from './SettingsControls';

export function DimensionControls({ designName }: { designName?: string | null }) {
  return (
    <>
      <ShapeControls />
      <TextureControls designName={designName} />
      <SmoothingControls />
      <TwistControls />
      <SettingsControls />
    </>
  );
}
