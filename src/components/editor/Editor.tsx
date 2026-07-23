'use client';

import { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { HelpPanel } from './HelpPanel';
import { Viewport } from '@/components/viewport/Viewport';
import { useVaseStore } from '@/store/vase-store';
import { CAPTURE_SIZE_PRESETS, CUSTOM_SIZE_INDEX } from '@/config/capture';
import type { CaptureFormat } from '@/config/capture';

/**
 * Main editor layout — sidebar on left, 3D viewport filling the rest,
 * optional help panel on right.
 */
export function Editor() {
  const [helpOpen, setHelpOpen] = useState(false);

  // Design name — lives in the vase store so capture, exports, and the /mold
  // route all share it (and it survives Vase ↔ Mold navigation)
  const designName = useVaseStore((s) => s.designName);
  const setDesignName = useVaseStore((s) => s.setDesignName);

  // Capture state — ephemeral UI state, not saved with design
  const [captureActive, setCaptureActive] = useState(false);
  const [captureSizeIndex, setCaptureSizeIndex] = useState(1); // default 960×1280
  const [customWidth, setCustomWidth] = useState(800);
  const [customHeight, setCustomHeight] = useState(600);
  const [captureFormat, setCaptureFormat] = useState<CaptureFormat>('png');
  const [captureRequested, setCaptureRequested] = useState(false);

  // Compute actual capture dimensions
  const isCustom = captureSizeIndex === CUSTOM_SIZE_INDEX;
  const captureWidth = isCustom ? customWidth : CAPTURE_SIZE_PRESETS[captureSizeIndex]?.width ?? 1280;
  const captureHeight = isCustom ? customHeight : CAPTURE_SIZE_PRESETS[captureSizeIndex]?.height ?? 960;

  const handleStartCapture = useCallback(() => {
    setCaptureActive(true);
  }, []);

  const handleSaveCapture = useCallback(() => {
    setCaptureRequested(true);
  }, []);

  const handleCancelCapture = useCallback(() => {
    setCaptureActive(false);
    setCaptureRequested(false);
  }, []);

  const handleCaptureComplete = useCallback(() => {
    setCaptureRequested(false);
    setCaptureActive(false);
  }, []);

  const captureFilename = designName || 'vasemaker-capture';

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        helpOpen={helpOpen}
        onToggleHelp={() => setHelpOpen(h => !h)}
        designName={designName}
        onDesignNameChange={setDesignName}
        captureActive={captureActive}
        captureSizeIndex={captureSizeIndex}
        customWidth={customWidth}
        customHeight={customHeight}
        captureFormat={captureFormat}
        onCaptureSizeIndexChange={setCaptureSizeIndex}
        onCustomWidthChange={setCustomWidth}
        onCustomHeightChange={setCustomHeight}
        onCaptureFormatChange={setCaptureFormat}
        onStartCapture={handleStartCapture}
        onSaveCapture={handleSaveCapture}
        onCancelCapture={handleCancelCapture}
      />
      <div className="flex-1 min-w-0">
        <Viewport
          captureActive={captureActive}
          captureRequested={captureRequested}
          captureWidth={captureWidth}
          captureHeight={captureHeight}
          captureFormat={captureFormat}
          captureFilename={captureFilename}
          onCaptureComplete={handleCaptureComplete}
        />
      </div>
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
