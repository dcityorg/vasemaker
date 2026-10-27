'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useVaseMesh } from '@/hooks/use-vase-mesh';
import { useVaseStore } from '@/store/vase-store';
import { useMeshStatsStore } from '@/store/mesh-stats-store';
import { computeMeshStats } from '@/engine/mesh-stats';
import { partGeometry } from './crease';
import { useShowFacets } from '@/store/view-prefs';

/** Overhang highlight color */
const OVERHANG_COLOR = new THREE.Color('#ff2b2b');
/** Ramp width in degrees past the threshold over which the tint reaches full red */
const OVERHANG_RAMP_DEG = 5;
/** Vertices at or below this z (mm) sit on the build plate and are never flagged */
const BUILD_PLATE_Z = 0.05;

/**
 * Renders the vase mesh in the Three.js scene.
 * A fresh BufferGeometry per mesh (crease shading needs its own, unindexed).
 */
export function VaseMeshComponent() {
  const vaseMesh = useVaseMesh();
  const color = useVaseStore((s) => s.params.color);
  const facets = useShowFacets();
  const showOverhangs = useVaseStore((s) => s.params.printCheck?.showOverhangs ?? false);
  const overhangAngle = useVaseStore((s) => s.params.printCheck?.overhangAngle ?? 45);

  useEffect(() => {
    useMeshStatsStore.getState().setStats(computeMeshStats(vaseMesh));
    useMeshStatsStore.setState({ bottomNotes: vaseMesh.bottomNotes ?? [] });
  }, [vaseMesh]);

  // Overhang highlighting — per-vertex colors blending vase color → red where the
  // surface faces downward more steeply than the threshold angle (from vertical).
  const colors = useMemo(() => {
    if (!showOverhangs) return null;
    const { positions, normals, vertexCount } = vaseMesh;
    // The foot recess and the mark face down by design (a short bridge the
    // slicer handles); tinting them only hides the mark (Gary).
    const bottomStart = vaseMesh.bottomStart ?? vertexCount;
    const base = new THREE.Color(color);
    const out = new Float32Array(vertexCount * 3);
    const rampStart = (overhangAngle * Math.PI) / 180;
    const rampWidth = (OVERHANG_RAMP_DEG * Math.PI) / 180;

    for (let i = 0; i < vertexCount; i++) {
      const nz = normals[i * 3 + 2];
      const z = positions[i * 3 + 2];
      let f = 0;
      if (nz < 0 && z > BUILD_PLATE_Z && i < bottomStart) {
        // angle the surface tilts past vertical, measured via the downward normal
        const tilt = Math.asin(Math.min(1, -nz));
        f = Math.min(1, Math.max(0, (tilt - rampStart) / rampWidth));
      }
      out[i * 3] = base.r + (OVERHANG_COLOR.r - base.r) * f;
      out[i * 3 + 1] = base.g + (OVERHANG_COLOR.g - base.g) * f;
      out[i * 3 + 2] = base.b + (OVERHANG_COLOR.b - base.b) * f;
    }
    return out;
  }, [vaseMesh, showOverhangs, overhangAngle, color]);

  // Show Facets off = crease shading (its own unindexed geometry).
  const geometry = useMemo(() => {
    const g = partGeometry(vaseMesh, facets, colors);
    g.computeBoundingSphere();
    return g;
  }, [vaseMesh, facets, colors]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        key={`${facets ? 'flat' : 'smooth'}-${showOverhangs ? 'vc' : 'plain'}`}
        color={showOverhangs ? '#ffffff' : color}
        vertexColors={showOverhangs}
        roughness={0.4}
        metalness={0.1}
        side={THREE.DoubleSide}
        flatShading={facets}
      />
    </mesh>
  );
}
