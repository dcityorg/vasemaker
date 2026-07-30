'use client';

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
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

/**
 * Grazing lights that follow the camera's orbit azimuth. Fixed rakes only read
 * at the angles they happen to graze — orbit 90° and the V features wash out
 * again. These re-aim every frame like a hand-held inspection lamp: a key rake
 * low and ~35° to the camera's left, and a softer counter-rake from high
 * behind-right. Position-only updates in useFrame (no viewport/scissor work,
 * which is the pattern this project avoids).
 */
function CameraRakes() {
  const key = useRef<THREE.DirectionalLight>(null);
  const counter = useRef<THREE.DirectionalLight>(null);
  useFrame(({ camera }) => {
    const az = Math.atan2(camera.position.y, camera.position.x);
    const aim = (light: THREE.DirectionalLight | null, dAz: number, elevDeg: number) => {
      if (!light) return;
      const a = az + dAz;
      const e = (elevDeg * Math.PI) / 180;
      light.position.set(400 * Math.cos(e) * Math.cos(a), 400 * Math.cos(e) * Math.sin(a), 400 * Math.sin(e));
    };
    aim(key.current, 0.6, 8);
    aim(counter.current, -2.5, 25);
  });
  return (
    <>
      <directionalLight ref={key} position={[220, -140, 12]} intensity={0.75} />
      <directionalLight ref={counter} position={[-200, 160, 20]} intensity={0.45} />
    </>
  );
}

function Part({ geometry, color, opacity, clip, positionZ, vertexColors, flat }: {
  geometry: THREE.BufferGeometry;
  color: string;
  opacity: number;
  clip: THREE.Plane[] | null;
  positionZ?: number;
  vertexColors?: boolean;
  flat?: boolean;
}) {
  return (
    <mesh geometry={geometry} position={[0, 0, positionZ ?? 0]}>
      {/* key forces a new material when vertexColors flips — three.js doesn't rebuild the shader program for that flag on an existing material (renders black) */}
      <meshStandardMaterial
        key={`${vertexColors ? 'vc' : 'plain'}-${flat ? 'flat' : 'smooth'}`}
        color={vertexColors ? '#ffffff' : color}
        vertexColors={vertexColors ?? false}
        flatShading={flat ?? false}
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

  // The master slot renders whichever part carries the vase form (master /
  // one-piece mold / pour-2pc center) with the undercut tint; the cottle slot
  // renders the container part (cottle / — / shell).
  const mainMesh = mold.style === 'twoPart' ? mold.master
    : mold.style === 'pourTwoPiece' || mold.style === 'pourThreePiece' ? mold.center
    : mold.mold;
  const masterGeo = useGeometry(mainMesh, view.showUndercuts ? mold.undercutFlags : undefined, view.showUndercuts ? MASTER_COLOR : undefined);
  const cottleGeo = useGeometry(
    mold.style === 'twoPart' ? mold.cottle
    : mold.style === 'pourTwoPiece' ? mold.shell
    : mold.style === 'pourThreePiece' ? mold.shellA
    : null,
  );
  // Pour 3-Pc's second half: null when one printed half serves both positions,
  // but it is still DISPLAYED so you see the assembled cottle.
  const cottleBGeo = useGeometry(mold.style === 'pourThreePiece' ? mold.shellB : null);
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
        {/* Ambient is pulled down and GRAZING lights added: a 1.2 mm groove only
            reads when its two interior faces catch different light, and the
            stock three-lamp rig lights them almost equally, so V features
            vanished near the bottom of the flange. A near-horizontal rake is
            what a real inspection lamp does — cheaper and clearer than SSAO,
            which would mean pulling in a postprocessing dependency. The rakes
            follow the camera (CameraRakes) so they graze at every orbit angle. */}
        <ambientLight intensity={LIGHTING.ambient.intensity * 0.55} />
        <directionalLight position={LIGHTING.main.position} intensity={LIGHTING.main.intensity} />
        <directionalLight position={LIGHTING.fill.position} intensity={LIGHTING.fill.intensity} />
        <directionalLight position={LIGHTING.back.position} intensity={LIGHTING.back.intensity} />
        <CameraRakes />

        <GroundGrid radius={radius + 40} height={height + 40} />

        {view.showPlaster && plasterGeo && <Part geometry={plasterGeo} color={PLASTER_COLOR} opacity={0.45} clip={clip} flat={view.flatShading} />}
        {/* The shell is OPAQUE by default. Translucency was the only way to see
            inside before the halves toggled separately, and stacking four or
            five transparent surfaces at the seam makes the renderer sort faces
            per-object — the hard triangular bands that made the V ridges
            unreadable. Ghost Shell puts it back for whole-assembly views. */}
        {view.showCottle && cottleGeo && <Part geometry={cottleGeo} color={COTTLE_COLOR} opacity={view.ghostShell ? 0.4 : 1} clip={clip} flat={view.flatShading} />}
        {view.showCottleB && cottleBGeo && <Part geometry={cottleBGeo} color={COTTLE_COLOR} opacity={view.ghostShell ? 0.4 : 1} clip={clip} flat={view.flatShading} />}
        {view.showMaster && masterGeo && (
          <Part
            geometry={masterGeo}
            color={MASTER_COLOR}
            flat={view.flatShading}
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
