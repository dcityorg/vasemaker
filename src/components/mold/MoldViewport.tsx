'use client';

import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GroundGrid } from '@/components/viewport/SceneHelpers';
import { LIGHTING } from '@/config/viewport';

// The mold assembly (cottle + plaster margin + well) is much larger than a bare
// vase, so it needs a wider default framing than the vase viewport.
const MOLD_CAMERA = { position: [220, 220, 240] as [number, number, number], fov: 50, near: 0.1, far: 6000, target: [0, 0, 110] as [number, number, number] };
const MOLD_ORBIT = { dampingFactor: 0.1, minDistance: 40, maxDistance: 3000 };
import { useVaseStore } from '@/store/vase-store';
import { useMoldStore } from '@/store/mold-store';
import type { VaseMesh } from '@/engine/types';
import type { AnyMoldMeshes } from '@/hooks/use-mold-meshes';

const MASTER_COLOR = '#d9d2c5';
const COTTLE_COLOR = '#7ea6d6';
const PLASTER_COLOR = '#e7dfca';
const UNDERCUT_COLOR = new THREE.Color('#ff2b2b');

/** Build a THREE.BufferGeometry from a VaseMesh (memoized, disposed on change).
 * When `undercutFlags` (per-vertex 0..1 from the mold generator's straight-pull
 * analysis) and a base color are given, a vertex-color attribute tints flagged
 * vertices red. */
function useGeometry(mesh: VaseMesh | null, undercutFlags?: Float32Array, baseColor?: string): THREE.BufferGeometry | null {
  const geo = useMemo(() => {
    if (!mesh) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

    if (undercutFlags && baseColor) {
      const base = new THREE.Color(baseColor);
      const colors = new Float32Array(mesh.vertexCount * 3);
      for (let i = 0; i < mesh.vertexCount; i++) {
        const f = undercutFlags[i];
        colors[i * 3] = base.r + (UNDERCUT_COLOR.r - base.r) * f;
        colors[i * 3 + 1] = base.g + (UNDERCUT_COLOR.g - base.g) * f;
        colors[i * 3 + 2] = base.b + (UNDERCUT_COLOR.b - base.b) * f;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    geo.computeBoundingSphere();
    return geo;
  }, [mesh, undercutFlags, baseColor]);
  // The parent hook owns the geometry lifetime — dispose the old one when a new
  // one is built or the viewport unmounts (Parts must NOT dispose, since they
  // toggle in/out of the tree while the geometry stays alive here).
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

function Part({ geometry, color, opacity, clip, positionZ, vertexColors }: {
  geometry: THREE.BufferGeometry;
  color: string;
  opacity: number;
  clip: THREE.Plane[] | null;
  positionZ?: number;
  vertexColors?: boolean;
}) {
  return (
    <mesh geometry={geometry} position={[0, 0, positionZ ?? 0]}>
      {/* key forces a new material when vertexColors flips — three.js doesn't rebuild the shader program for that flag on an existing material (renders black) */}
      <meshStandardMaterial
        key={vertexColors ? 'vc' : 'plain'}
        color={vertexColors ? '#ffffff' : color}
        vertexColors={vertexColors ?? false}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={0.5}
        metalness={0.05}
        side={THREE.DoubleSide}
        clippingPlanes={clip}
        clipShadows
      />
    </mesh>
  );
}

export function MoldViewport({ mold }: { mold: AnyMoldMeshes }) {
  const radius = useVaseStore((s) => s.params.radius);
  const height = useVaseStore((s) => s.params.height);
  const view = useMoldStore((s) => s.view);

  const clipPlanes = useMemo(() => [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)], []);
  const clip = view.crossSection ? clipPlanes : null;

  // In one-piece mode the single printed part takes the master's slot (same
  // color + undercut tint); the cottle slot is empty.
  const mainMesh = mold.style === 'twoPart' ? mold.master : mold.mold;
  const masterGeo = useGeometry(mainMesh, view.showUndercuts ? mold.undercutFlags : undefined, view.showUndercuts ? MASTER_COLOR : undefined);
  const cottleGeo = useGeometry(mold.style === 'twoPart' ? mold.cottle : null);
  const plasterGeo = useGeometry(mold.plaster);

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: MOLD_CAMERA.position, fov: MOLD_CAMERA.fov, near: MOLD_CAMERA.near, far: MOLD_CAMERA.far }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl, camera, scene }) => {
          gl.localClippingEnabled = true;
          camera.up.set(0, 0, 1);
          scene.up.set(0, 0, 1);
          camera.lookAt(...MOLD_CAMERA.target);
        }}
      >
        <ambientLight intensity={LIGHTING.ambient.intensity} />
        <directionalLight position={LIGHTING.main.position} intensity={LIGHTING.main.intensity} />
        <directionalLight position={LIGHTING.fill.position} intensity={LIGHTING.fill.intensity} />
        <directionalLight position={LIGHTING.back.position} intensity={LIGHTING.back.intensity} />

        <GroundGrid radius={radius + 40} height={height + 40} />

        {view.showPlaster && plasterGeo && <Part geometry={plasterGeo} color={PLASTER_COLOR} opacity={0.45} clip={clip} />}
        {view.showCottle && cottleGeo && <Part geometry={cottleGeo} color={COTTLE_COLOR} opacity={0.4} clip={clip} />}
        {view.showMaster && masterGeo && (
          <Part
            geometry={masterGeo}
            color={MASTER_COLOR}
            opacity={1}
            clip={clip}
            positionZ={mold.style === 'twoPart' ? mold.bottomGap : 0}
            vertexColors={view.showUndercuts}
          />
        )}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={MOLD_ORBIT.dampingFactor}
          target={MOLD_CAMERA.target}
          minDistance={MOLD_ORBIT.minDistance}
          maxDistance={MOLD_ORBIT.maxDistance}
        />
      </Canvas>
    </div>
  );
}
