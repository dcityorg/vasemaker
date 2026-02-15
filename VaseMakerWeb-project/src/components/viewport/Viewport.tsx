'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { VaseMeshComponent } from './VaseMesh';
import { GroundGrid, AxisRulers, AxisGizmo, AxisLabels } from './SceneHelpers';
import { CAMERA, ORBIT_CONTROLS, LIGHTING } from '@/config/viewport';
import { useVaseStore } from '@/store/vase-store';

/**
 * 3D viewport — renders the vase in a Three.js scene with orbit controls.
 * Uses Z-up convention to match OpenSCAD and the mesh generator.
 */
export function Viewport() {
  const showRulers = useVaseStore((s) => s.params.showRulers ?? false);
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: CAMERA.position, fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far }}
        gl={{ antialias: true }}
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
        <GroundGrid />

        {/* Axis rulers with tick marks */}
        {showRulers && <AxisRulers />}

        {/* Colored numeric labels on each axis */}
        {showRulers && <AxisLabels />}

        {/* The vase */}
        <VaseMeshComponent />

        {/* XYZ orientation gizmo */}
        {showRulers && <AxisGizmo />}

        {/* Camera controls */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={ORBIT_CONTROLS.dampingFactor}
          target={CAMERA.target}
          minDistance={ORBIT_CONTROLS.minDistance}
          maxDistance={ORBIT_CONTROLS.maxDistance}
        />
      </Canvas>
    </div>
  );
}
