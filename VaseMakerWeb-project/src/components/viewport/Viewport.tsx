'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { VaseMeshComponent } from './VaseMesh';
import { GroundGrid, AxisRulers, AxisGizmo, AxisLabels } from './SceneHelpers';
import { CAMERA, ORBIT_CONTROLS, LIGHTING } from '@/config/viewport';

/**
 * 3D viewport — renders the vase in a Three.js scene with orbit controls.
 * Uses Z-up convention to match OpenSCAD and the mesh generator.
 */
export function Viewport() {
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

        {/* Ground grid on XY plane at Z=0 */}
        <GroundGrid />

        {/* Axis rulers with tick marks */}
        <AxisRulers />

        {/* Colored numeric labels on each axis */}
        <AxisLabels />

        {/* The vase */}
        <VaseMeshComponent />

        {/* XYZ orientation gizmo in lower-left corner */}
        <AxisGizmo />

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
