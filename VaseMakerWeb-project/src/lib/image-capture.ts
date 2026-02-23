/**
 * Image capture utilities — canvas-to-blob conversion and download trigger.
 * Same pattern as stl-export.ts: pure functions, browser-only.
 */

import type { CaptureFormat } from '@/config/capture';

/**
 * Convert a canvas element to a Blob in the specified format.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: CaptureFormat,
  quality = 0.92
): Promise<Blob> {
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create image blob'));
      },
      mimeType,
      quality
    );
  });
}

/**
 * Trigger a download of an image blob in the browser.
 */
export function downloadImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
