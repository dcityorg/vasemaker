'use client';

import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GroundGrid } from '@/components/viewport/SceneHelpers';
import { LIGHTING } from '@/config/viewport';
import { useHandleStore } from '@/store/handle-store';
import type { VaseMesh } from '@/engine/types';
import type { HandleMeshes } from '@/engine/handle/handle-generator';

const MASTER_COLOR = '#8fa8d8';
const PLATE_COLOR = '#d98a4a';
const WALL_COLOR = '#c97f45';
const PLASTER_COLOR = '#e7dfca';

function useGeometry(mesh: VaseMesh | null): THREE.BufferGeometry | null {
  const geo = useMemo(() => {
    if (!mesh) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [mesh]);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

function Part({ geometry, color, opacity }: { geometry: THREE.BufferGeometry; color: string; opacity: number }) {
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={0.55}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function HandleViewport({ handle }: { handle: HandleMeshes }) {
  const view = useHandleStore((s) => s.view);

  const masterGeo = useGeometry(handle.master);
  const plateGeo = useGeometry(handle.plate);
  const wallGeo = useGeometry(handle.wall);
  const wallBGeo = useGeometry(handle.wallB);
  const plasterGeo = useGeometry(handle.plaster);

  // Assembly is built with the plate top at z=0; lift everything so the plate
  // bottom rests on the ground grid.
  const lift = handle.layout.plateThk;
  const gridR = Math.max(handle.layout.plateW, handle.layout.plateD) / 2 + 20;
  const target: [number, number, number] = [0, 0, lift + 10];

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [170, -170, 150], fov: 50, near: 0.1, far: 6000 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ camera, scene }) => {
          camera.up.set(0, 0, 1);
          scene.up.set(0, 0, 1);
          camera.lookAt(...target);
        }}
      >
        <ambientLight intensity={LIGHTING.ambient.intensity} />
        <directionalLight position={LIGHTING.main.position} intensity={LIGHTING.main.intensity} />
        <directionalLight position={LIGHTING.fill.position} intensity={LIGHTING.fill.intensity} />
        <directionalLight position={LIGHTING.back.position} intensity={LIGHTING.back.intensity} />

        <GroundGrid radius={gridR} height={gridR} />

        <group position={[0, 0, lift]}>
          {view.showPlaster && plasterGeo && <Part geometry={plasterGeo} color={PLASTER_COLOR} opacity={0.4} />}
          {view.showPlate && plateGeo && <Part geometry={plateGeo} color={PLATE_COLOR} opacity={1} />}
          {view.showWalls && wallGeo && <Part geometry={wallGeo} color={WALL_COLOR} opacity={1} />}
          {view.showWalls && wallBGeo && <Part geometry={wallBGeo} color={WALL_COLOR} opacity={1} />}
          {view.showHandle && masterGeo && <Part geometry={masterGeo} color={MASTER_COLOR} opacity={1} />}
        </group>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          target={target}
          minDistance={30}
          maxDistance={2500}
        />
      </Canvas>
    </div>
  );
}
