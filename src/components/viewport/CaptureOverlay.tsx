'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CaptureOverlayProps {
  aspectRatio: number; // width / height
  containerRef: React.RefObject<HTMLDivElement | null>;
  onFrameChange?: (frame: FrameRect, containerWidth: number, containerHeight: number) => void;
}

/**
 * Capture frame overlay — centered rectangle with correct aspect ratio.
 * Dims the area outside the frame. Corner handles allow aspect-locked resizing.
 * pointer-events: none on the overlay lets orbit/zoom pass through to the Canvas.
 */
export function CaptureOverlay({ aspectRatio, containerRef, onFrameChange }: CaptureOverlayProps) {
  const [frameScale, setFrameScale] = useState(0.8); // 0.15–0.95 of viewport
  const dragRef = useRef<{ startDist: number; startScale: number } | null>(null);

  // Compute frame dimensions from container size and aspect ratio
  const getFrameRect = useCallback((): FrameRect => {
    const container = containerRef.current;
    if (!container) return { left: 0, top: 0, width: 0, height: 0 };

    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // Max frame that fits at current scale, maintaining aspect ratio
    const maxW = cw * frameScale;
    const maxH = ch * frameScale;

    let fw: number, fh: number;
    if (maxW / maxH > aspectRatio) {
      // Height-constrained
      fh = maxH;
      fw = fh * aspectRatio;
    } else {
      // Width-constrained
      fw = maxW;
      fh = fw / aspectRatio;
    }

    return {
      left: (cw - fw) / 2,
      top: (ch - fh) / 2,
      width: fw,
      height: fh,
    };
  }, [aspectRatio, frameScale, containerRef]);

  const [frameRect, setFrameRect] = useState<FrameRect>({ left: 0, top: 0, width: 0, height: 0 });

  // Recalculate on mount, resize, or param change
  useEffect(() => {
    const update = () => {
      const rect = getFrameRect();
      setFrameRect(rect);
      const container = containerRef.current;
      if (container && onFrameChange) {
        onFrameChange(rect, container.clientWidth, container.clientHeight);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [getFrameRect, containerRef, onFrameChange]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const startDist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2);
      dragRef.current = { startDist, startScale: frameScale };
    },
    [frameScale, containerRef]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const diag = Math.sqrt(rect.width ** 2 + rect.height ** 2) / 2;

      // Distance from viewport center — farther = bigger frame
      const curDist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2);
      const distDelta = curDist - dragRef.current.startDist;
      const scaleDelta = (distDelta / diag) * 1.5;
      const newScale = Math.min(0.95, Math.max(0.15, dragRef.current.startScale + scaleDelta));
      setFrameScale(newScale);
    },
    [containerRef]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const { left, top, width, height } = frameRect;
  const handleSize = 10;

  // Corner handle positions (offset so they sit on the frame corners)
  const corners = [
    { x: left - handleSize / 2, y: top - handleSize / 2, cursor: 'nwse-resize' },
    { x: left + width - handleSize / 2, y: top - handleSize / 2, cursor: 'nesw-resize' },
    { x: left - handleSize / 2, y: top + height - handleSize / 2, cursor: 'nesw-resize' },
    { x: left + width - handleSize / 2, y: top + height - handleSize / 2, cursor: 'nwse-resize' },
  ];

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: 'none', zIndex: 10 }}
    >
      {/* Dimmed overlay with cutout — using box-shadow trick */}
      <div
        style={{
          position: 'absolute',
          left: left,
          top: top,
          width: width,
          height: height,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          pointerEvents: 'none',
        }}
      />

      {/* Corner resize handles */}
      {corners.map((corner, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: corner.x,
            top: corner.y,
            width: handleSize,
            height: handleSize,
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            border: '1px solid rgba(0, 0, 0, 0.3)',
            cursor: corner.cursor,
            pointerEvents: 'auto',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      ))}
    </div>
  );
}
