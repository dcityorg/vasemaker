'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useVaseMesh } from '@/hooks/use-vase-mesh';
import { useVaseStore } from '@/store/vase-store';
import { useMeshStatsStore } from '@/store/mesh-stats-store';
import { computeMeshStats } from '@/engine/mesh-stats';

/** Overhang highlight color */
const OVERHANG_COLOR = new THREE.Color('#ff2b2b');
/** Ramp width in degrees past the threshold over which the tint reaches full red */
const OVERHANG_RAMP_DEG = 5;
/** Vertices at or below this z (mm) sit on the build plate and are never flagged */
const BUILD_PLATE_Z = 0.05;

/**
 * Renders the vase mesh in the Three.js scene.
 * Updates the BufferGeometry in place when the mesh data changes.
 */
export function VaseMeshComponent() {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const vaseMesh = useVaseMesh();
  const color = useVaseStore((s) => s.params.color);
  const flatShading = useVaseStore((s) => s.params.flatShading);
  const showOverhangs = useVaseStore((s) => s.params.printCheck?.showOverhangs ?? false);
  const overhangAngle = useVaseStore((s) => s.params.printCheck?.overhangAngle ?? 45);

  useEffect(() => {
    if (!geometryRef.current) return;

    const geo = geometryRef.current;

    // Update geometry attributes
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(vaseMesh.positions, 3)
    );
    geo.setAttribute(
      'normal',
      new THREE.BufferAttribute(vaseMesh.normals, 3)
    );
    geo.setIndex(new THREE.BufferAttribute(vaseMesh.indices, 1));

    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.computeBoundingSphere();

    useMeshStatsStore.getState().setStats(computeMeshStats(vaseMesh));
  }, [vaseMesh]);

  // Overhang highlighting — per-vertex colors blending vase color → red where the
  // surface faces downward more steeply than the threshold angle (from vertical).
  useEffect(() => {
    if (!geometryRef.current) return;
    const geo = geometryRef.current;

    if (!showOverhangs) {
      if (geo.getAttribute('color')) geo.deleteAttribute('color');
      return;
    }

    const { positions, normals, vertexCount } = vaseMesh;
    const base = new THREE.Color(color);
    const colors = new Float32Array(vertexCount * 3);
    const rampStart = (overhangAngle * Math.PI) / 180;
    const rampWidth = (OVERHANG_RAMP_DEG * Math.PI) / 180;

    for (let i = 0; i < vertexCount; i++) {
      const nz = normals[i * 3 + 2];
      const z = positions[i * 3 + 2];
      let f = 0;
      if (nz < 0 && z > BUILD_PLATE_Z) {
        // angle the surface tilts past vertical, measured via the downward normal
        const tilt = Math.asin(Math.min(1, -nz));
        f = Math.min(1, Math.max(0, (tilt - rampStart) / rampWidth));
      }
      colors[i * 3] = base.r + (OVERHANG_COLOR.r - base.r) * f;
      colors[i * 3 + 1] = base.g + (OVERHANG_COLOR.g - base.g) * f;
      colors[i * 3 + 2] = base.b + (OVERHANG_COLOR.b - base.b) * f;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.attributes.color.needsUpdate = true;
  }, [vaseMesh, showOverhangs, overhangAngle, color]);

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <bufferGeometry ref={geometryRef} />
      <meshStandardMaterial
        key={`${flatShading ? 'flat' : 'smooth'}-${showOverhangs ? 'vc' : 'plain'}`}
        color={showOverhangs ? '#ffffff' : color}
        vertexColors={showOverhangs}
        roughness={0.4}
        metalness={0.1}
        side={THREE.DoubleSide}
        flatShading={flatShading}
      />
    </mesh>
  );
}
