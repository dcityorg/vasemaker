/**
 * Image capture configuration — size presets and types.
 */

export interface CaptureSize {
  label: string;
  width: number;
  height: number;
}

export type CaptureFormat = 'png' | 'jpg';

export const CAPTURE_SIZE_PRESETS: CaptureSize[] = [
  // Portrait (tall) — most vases are taller than wide
  { label: '480 × 640', width: 480, height: 640 },
  { label: '960 × 1280', width: 960, height: 1280 },
  { label: '1440 × 1920', width: 1440, height: 1920 },
  // Square
  { label: '640 × 640', width: 640, height: 640 },
  { label: '1024 × 1024', width: 1024, height: 1024 },
  { label: '2048 × 2048', width: 2048, height: 2048 },
  // Landscape (wide)
  { label: '640 × 480', width: 640, height: 480 },
  { label: '1280 × 960', width: 1280, height: 960 },
  { label: '1920 × 1440', width: 1920, height: 1440 },
];

/** Index for "Custom" in the size dropdown (after all presets) */
export const CUSTOM_SIZE_INDEX = CAPTURE_SIZE_PRESETS.length;
