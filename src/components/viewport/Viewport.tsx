'use client';

import { useRef, useCallback, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { VaseMeshComponent } from './VaseMesh';
import { GroundGrid, AxisRulers, AxisGizmo, AxisLabels } from './SceneHelpers';
import { CaptureOverlay } from './CaptureOverlay';
import type { FrameRect } from './CaptureOverlay';
import { CaptureRenderer } from './CaptureRenderer';
import { CAMERA, ORBIT_CONTROLS, LIGHTING } from '@/config/viewport';
import { useVaseStore } from '@/store/vase-store';
import type { CaptureFormat } from '@/config/capture';
import { RememberCamera } from '@/components/viewport/RememberCamera';
import { useSeamsView } from '@/store/view-prefs';
import { VasePageExtras, MugNotes, useVaseExtras, useSprigTextureOn } from '@/components/viewport/OnVase';
import { ViewCube, ViewButtons, useVaseViewButtons } from '@/components/viewport/ViewButtons';
import { useMoldStore } from '@/store/mold-store';
import { useSprigStore } from '@/store/sprig-store';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

const HOME_DIR = (() => {
  const [x, y, z] = CAMERA.position, [, , tz] = CAMERA.target;
  return new THREE.Vector3(0, -Math.hypot(x, y), z - tz);
})();

interface ViewportProps {
  captureActive?: boolean;
  captureRequested?: boolean;
  captureWidth?: number;
  captureHeight?: number;
  captureFormat?: CaptureFormat;
  captureFilename?: string;
  onCaptureComplete?: () => void;
}

/**
 * 3D viewport — renders the vase in a Three.js scene with orbit controls.
 * Uses Z-up convention to match OpenSCAD and the mesh generator.
 */
export function Viewport({
  captureActive = false,
  captureRequested = false,
  captureWidth = 1280,
  captureHeight = 960,
  captureFormat = 'png',
  captureFilename = 'vasemaker-capture',
  onCaptureComplete,
}: ViewportProps) {
  const showRulers = useVaseStore((s) => s.params.showRulers ?? false);
  const radius = useVaseStore((s) => s.params.radius);
  const height = useVaseStore((s) => s.params.height);
  const containerRef = useRef<HTMLDivElement>(null);
  const seams = useSeamsView();
  const extras = useVaseExtras((s) => s.showHandle || s.showSprig) || seams !== 'off';
  const controlsRef = useRef<OrbitControlsImpl>(null);
  // The view buttons follow what is shown: the handle with Show Handle, the
  // vase's own Sprig texture, else Show Sprig's sprig (they are never both).
  const showHandle = useVaseExtras((s) => s.showHandle);
  const showSprig = useVaseExtras((s) => s.showSprig);
  const handleAngle = useMoldStore((s) => s.params.seamAngle);
  const textureOn = useSprigTextureOn();
  const texSprig = useVaseStore((s) => s.params.textures.sprig);
  const onVaseAngle = useSprigStore((s) => s.params.onVaseAngle);
  const onVaseHeight = useSprigStore((s) => s.params.onVaseHeight);
  const buttons = useVaseViewButtons({
    controls: controlsRef,
    // Home is straight on from the front (−y, the cube's Front), tilted down as
    // much as the starting view so the top shows a little (Gary, 2026-11-09).
    home: { dir: HOME_DIR, target: [...CAMERA.target], title: 'Home: the vase from the front, a little above (keeps your zoom)' },
    height,
    handle: showHandle ? handleAngle : null,
    sprig: textureOn && texSprig ? { angle: texSprig.angle, heightPct: texSprig.heightPct }
      : showSprig ? { angle: onVaseAngle, heightPct: onVaseHeight } : null,
    seams,
  });

  // Frame rect reported by CaptureOverlay — used by CaptureRenderer for cropping
  const [frameInfo, setFrameInfo] = useState({
    left: 0, top: 0, width: 0, height: 0,
    containerWidth: 1, containerHeight: 1,
  });

  const handleFrameChange = useCallback((frame: FrameRect, cw: number, ch: number) => {
    setFrameInfo({ ...frame, containerWidth: cw, containerHeight: ch });
  }, []);

  const handleCaptureComplete = useCallback(() => {
    onCaptureComplete?.();
  }, [onCaptureComplete]);

  const aspectRatio = captureWidth / captureHeight;

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <Canvas
        camera={{ position: CAMERA.position, fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
        onCreated={({ camera, scene }) => {
          camera.up.set(0, 0, 1);
          scene.up.set(0, 0, 1);
          camera.lookAt(...CAMERA.target);
        }}
      >
        {/* Lighting */}
        <ambientLight intensity={LIGHTING.ambient.intensity} />
        <directionalLight
          position={LIGHTING.main.position}
          intensity={LIGHTING.main.intensity}
        />
        <directionalLight position={LIGHTING.fill.position} intensity={LIGHTING.fill.intensity} />
        <directionalLight position={LIGHTING.back.position} intensity={LIGHTING.back.intensity} />

        {/* Ground grid on XY plane at Z=0 */}
        <GroundGrid radius={radius} height={height} />

        {/* Axis rulers with tick marks */}
        {showRulers && <group name="__capture_rulers"><AxisRulers radius={radius} height={height} /></group>}

        {/* Colored numeric labels on each axis */}
        {showRulers && <group name="__capture_labels"><AxisLabels radius={radius} height={height} /></group>}

        {/* The vase */}
        <VaseMeshComponent />
        {extras && <VasePageExtras />}

        {/* XYZ orientation gizmo */}
        {showRulers && <group name="__capture_gizmo"><AxisGizmo /></group>}

        {/* Offscreen capture renderer */}
        <CaptureRenderer
          captureRequested={captureRequested}
          targetWidth={captureWidth}
          targetHeight={captureHeight}
          format={captureFormat}
          filename={captureFilename}
          showRulers={showRulers}
          frameLeft={frameInfo.left}
          frameTop={frameInfo.top}
          frameWidth={frameInfo.width}
          frameHeight={frameInfo.height}
          containerWidth={frameInfo.containerWidth}
          containerHeight={frameInfo.containerHeight}
          onCaptureComplete={handleCaptureComplete}
        />

        {/* Camera controls */}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={ORBIT_CONTROLS.dampingFactor}
          target={CAMERA.target}
          minDistance={ORBIT_CONTROLS.minDistance}
          maxDistance={ORBIT_CONTROLS.maxDistance}
        />
        <ViewCube controls={controlsRef} />
        <RememberCamera id="vase" />
      </Canvas>

      <ViewButtons buttons={buttons} />
      {extras && <MugNotes />}

      {/* Capture frame overlay (HTML layer, outside Canvas) */}
      {captureActive && (
        <CaptureOverlay
          aspectRatio={aspectRatio}
          containerRef={containerRef}
          onFrameChange={handleFrameChange}
        />
      )}
    </div>
  );
}
