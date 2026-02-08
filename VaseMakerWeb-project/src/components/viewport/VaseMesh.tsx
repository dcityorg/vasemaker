'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useVaseMesh } from '@/hooks/use-vase-mesh';

/**
 * Renders the vase mesh in the Three.js scene.
 * Updates the BufferGeometry in place when the mesh data changes.
 */
export function VaseMeshComponent() {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const vaseMesh = useVaseMesh();

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
  }, [vaseMesh]);

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <bufferGeometry ref={geometryRef} />
      <meshStandardMaterial
        color="#6d9fff"
        roughness={0.4}
        metalness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
