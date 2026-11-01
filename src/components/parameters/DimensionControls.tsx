'use client';

import { ShapeControls } from './ShapeControls';
import { TextureControls } from './TextureControls';
import { SmoothingControls } from './SmoothingControls';
import { TwistControls } from './TwistControls';
import { SettingsControls } from './SettingsControls';
import { BottomControls } from './BottomControls';
import { ViewControls } from './ViewControls';

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
    </>
  );
}
