'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { VaseMeshComponent } from './VaseMesh';
import { GroundGrid, AxisRulers, AxisGizmo, GridLabels } from './SceneHelpers';

/**
 * 3D viewport — renders the vase in a Three.js scene with orbit controls.
 * Uses Z-up convention to match OpenSCAD and the mesh generator.
 */
export function Viewport() {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [80, 80, 120], fov: 50, near: 0.1, far: 2000 }}
        gl={{ antialias: true }}
        onCreated={({ camera, scene }) => {
          camera.up.set(0, 0, 1);
          scene.up.set(0, 0, 1);
          camera.lookAt(0, 0, 50);
        }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[100, 150, 100]}
          intensity={1}
        />
        <directionalLight position={[-50, 80, -50]} intensity={0.3} />

        {/* Ground grid on XY plane at Z=0 */}
        <GroundGrid />

        {/* Axis rulers with tick marks */}
        <AxisRulers />

        {/* Numeric labels at major grid lines */}
        <GridLabels />

        {/* The vase */}
        <VaseMeshComponent />

        {/* XYZ orientation gizmo in lower-left corner */}
        <AxisGizmo />

        {/* Camera controls */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          target={[0, 0, 50]}
          minDistance={30}
          maxDistance={500}
        />
      </Canvas>
    </div>
  );
}
