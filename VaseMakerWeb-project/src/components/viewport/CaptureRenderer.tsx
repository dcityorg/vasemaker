'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { canvasToBlob, downloadImage } from '@/lib/image-capture';
import type { CaptureFormat } from '@/config/capture';

interface CaptureRendererProps {
  captureRequested: boolean;
  targetWidth: number;
  targetHeight: number;
  format: CaptureFormat;
  filename: string;
  showRulers: boolean;
  frameLeft: number;
  frameTop: number;
  frameWidth: number;
  frameHeight: number;
  containerWidth: number;
  containerHeight: number;
  onCaptureComplete: () => void;
}

/**
 * Capture by screenshotting the main canvas and cropping to the frame region.
 * Uses preserveDrawingBuffer on the main Canvas (set in Viewport.tsx).
 * This guarantees pixel-perfect color match since we read the exact same
 * pixels that are displayed on screen — no render targets, no gamma issues.
 */
export function CaptureRenderer({
  captureRequested,
  targetWidth,
  targetHeight,
  format,
  filename,
  showRulers,
  frameLeft,
  frameTop,
  frameWidth,
  frameHeight,
  containerWidth,
  containerHeight,
  onCaptureComplete,
}: CaptureRendererProps) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    if (!captureRequested) return;
    if (frameWidth <= 0 || frameHeight <= 0) return;

    const doCapture = async () => {
      // Hide rulers for the capture render
      const hiddenGroups: THREE.Object3D[] = [];
      scene.traverse((obj: THREE.Object3D) => {
        if (
          obj.name === '__capture_rulers' ||
          obj.name === '__capture_labels' ||
          obj.name === '__capture_gizmo'
        ) {
          if (obj.visible) {
            hiddenGroups.push(obj);
            obj.visible = false;
          }
        }
      });

      // Force a render with rulers hidden (preserveDrawingBuffer keeps pixels)
      gl.render(scene, camera);

      // The WebGL canvas has device-pixel-ratio scaling.
      // CSS pixels → actual canvas pixels
      const dpr = gl.getPixelRatio();
      const canvasW = gl.domElement.width;   // actual pixel width
      const canvasH = gl.domElement.height;  // actual pixel height

      // Frame rect is in CSS pixels relative to the container.
      // The container matches the canvas CSS size. Scale to actual pixels.
      const srcX = Math.round(frameLeft * dpr);
      const srcY = Math.round(frameTop * dpr);
      const srcW = Math.round(frameWidth * dpr);
      const srcH = Math.round(frameHeight * dpr);

      // Crop from the main canvas and scale to target resolution
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = targetWidth;
      cropCanvas.height = targetHeight;
      const ctx = cropCanvas.getContext('2d')!;

      // drawImage(source, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH)
      ctx.drawImage(
        gl.domElement,
        srcX, srcY, srcW, srcH,
        0, 0, targetWidth, targetHeight
      );

      // Export
      try {
        const blob = await canvasToBlob(cropCanvas, format);
        const ext = format === 'jpg' ? 'jpg' : 'png';
        downloadImage(blob, `${filename}.${ext}`);
      } catch (err) {
        console.error('Image capture failed:', err);
      }

      // Restore rulers
      for (const obj of hiddenGroups) {
        obj.visible = true;
      }
      // Re-render with rulers restored
      gl.render(scene, camera);

      onCaptureComplete();
    };

    doCapture();
  }, [captureRequested, targetWidth, targetHeight, format, filename, showRulers,
      frameLeft, frameTop, frameWidth, frameHeight, containerWidth, containerHeight,
      gl, scene, camera, onCaptureComplete]);

  return null;
}

// Type import for traverse callback
import type * as THREE from 'three';
