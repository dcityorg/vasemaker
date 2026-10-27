'use client';

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { partGeometry } from '@/components/viewport/crease';
import { useShowFacets } from '@/store/view-prefs';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GroundGrid } from '@/components/viewport/SceneHelpers';
import { LIGHTING } from '@/config/viewport';
import { useSprigDesign } from './sprig-design-context';
import type { VaseMesh } from '@/engine/types';
import type { SprigMoldMeshes } from '@/engine/sprig/sprig-generator';
import { RememberCamera } from '@/components/viewport/RememberCamera';
import { OnVaseView } from '@/components/viewport/OnVase';

const PLATE_COLOR = '#d98a4a';
const WALL_COLOR = '#c97f45';
const PLASTER_COLOR = '#e7dfca';
const THIN_COLOR = '#e53935';

/** `tint` (per vertex 0..1) blends the base colour to red — the thin-part marks. */
function useGeometry(mesh: VaseMesh | null, facets: boolean, tint?: Float32Array | null, base?: string): THREE.BufferGeometry | null {
  const geo = useMemo(() => {
    if (!mesh) return null;
    let col: Float32Array | null = null;
    if (tint && base) {
      const a = new THREE.Color(base), b = new THREE.Color(THIN_COLOR);
      col = new Float32Array(mesh.vertexCount * 3);
      for (let i = 0; i < mesh.vertexCount; i++) {
        const t = tint[i] ?? 0;
        col[i * 3] = a.r + (b.r - a.r) * t;
        col[i * 3 + 1] = a.g + (b.g - a.g) * t;
        col[i * 3 + 2] = a.b + (b.b - a.b) * t;
      }
    }
    const g = partGeometry(mesh, facets, col);
    g.computeBoundingSphere();
    return g;
  }, [mesh, facets, tint, base]);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

function Part({ geometry, color, opacity, flat, vertexColors = false }: {
  geometry: THREE.BufferGeometry; color: string; opacity: number; flat: boolean; vertexColors?: boolean;
}) {
  return (
    <mesh geometry={geometry}>
      {/* key: three.js bakes flat shading and vertex colours into the compiled
          shader, so switching either needs a fresh material. */}
      <meshStandardMaterial
        key={`${flat ? 'flat' : 'smooth'}-${vertexColors ? 'vc' : 'plain'}`}
        flatShading={flat}
        color={vertexColors ? '#ffffff' : color}
        vertexColors={vertexColors}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={0.55}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function SprigViewport({ sprig }: { sprig: SprigMoldMeshes | null }) {
  const design = useSprigDesign();
  const useSprigStore = design.useStore;
  // The mark has no On Vase view (the Vase tab will show it on the bottom).
  const onVase = useSprigStore((s) => s.view.onVase);
  const showHandle = useSprigStore((s) => s.params.onVaseHandle);
  const flat = useShowFacets();
  return onVase && design.kind === 'sprig'
    ? <OnVaseView sprig={sprig} showHandle={showHandle} cameraId="sprig-vase" flat={flat} />
    : <MoldView sprig={sprig} />;
}

function MoldView({ sprig }: { sprig: SprigMoldMeshes | null }) {
  const design = useSprigDesign();
  const isMark = design.kind === 'mark';
  const view = design.useStore((s) => s.view);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const tint = view.showThin && sprig && sprig.relief.thinSpots > 0 ? sprig.thinFlags : null;
  const facets = useShowFacets();
  const plateGeo = useGeometry(sprig?.plate ?? null, facets, tint, PLATE_COLOR);
  const wallGeo = useGeometry(sprig?.wall ?? null, facets);
  const wallBGeo = useGeometry(sprig?.wallB ?? null, facets);
  const plasterGeo = useGeometry(sprig?.plaster ?? null, true);

  /** Square the view to `dir`, keeping distance and target (HandleMaker's snap). */
  const snapView = (dir: THREE.Vector3) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cam = controls.object;
    const dist = cam.position.distanceTo(controls.target);
    const d = dir.clone().normalize();
    if (Math.abs(d.z) > 0.9) {
      // Straight down/up with +y up the screen: tilt a hair toward −y rather
      // than changing the camera's up-vector, which makes orbiting feel wrong.
      const tilt = 0.027;
      d.set(0, -tilt, Math.sign(d.z) * Math.sqrt(1 - tilt * tilt));
    }
    cam.up.set(0, 0, 1);
    cam.position.copy(controls.target.clone().add(d.multiplyScalar(dist)));
    controls.update();
  };

  const lift = sprig?.layout.plateThk ?? 5;
  const gridR = Math.max(sprig?.layout.plateW ?? 100, sprig?.layout.plateD ?? 100) / 2 + 20;
  const target: [number, number, number] = [0, 0, lift];

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [0, -110, 150], fov: 50, near: 0.1, far: 6000 }}
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
          {!isMark && view.showPlaster && plasterGeo && <Part geometry={plasterGeo} color={PLASTER_COLOR} opacity={0.4} flat={facets} />}
          {view.showPlate && plateGeo && <Part geometry={plateGeo} color={PLATE_COLOR} opacity={1} flat={facets} vertexColors={!!tint} />}
          {!isMark && view.showWallA && wallGeo && <Part geometry={wallGeo} color={WALL_COLOR} opacity={1} flat={facets} />}
          {!isMark && view.showWallB && wallBGeo && <Part geometry={wallBGeo} color={WALL_COLOR} opacity={1} flat={facets} />}
        </group>

        <GizmoHelper alignment="top-right" margin={[70, 70]}>
          <GizmoViewcube
            faces={['Right', 'Left', 'Back', 'Front', 'Top', 'Bottom']}
            color="#3a3f46"
            hoverColor="#5a80c0"
            textColor="#cfd4da"
            strokeColor="#22252a"
            opacity={0.95}
            onClick={(e) => {
              e.stopPropagation();
              if (e.face) snapView(new THREE.Vector3(e.face.normal.x, e.face.normal.y, e.face.normal.z));
              return null;
            }}
          />
        </GizmoHelper>

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.1}
          target={target}
          minDistance={20}
          maxDistance={2500}
        />
        <RememberCamera id={isMark ? 'mark' : 'sprig'} />
      </Canvas>

      {/* Home — straight down, the drawing the right way up */}
      <button
        onClick={() => snapView(new THREE.Vector3(0, 0, 1))}
        className="absolute top-[104px] right-[26px] w-8 h-8 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors text-base leading-none"
        style={{ backgroundColor: 'rgba(28, 30, 34, 0.85)' }}
        title={`Home: look straight down on the ${isMark ? 'mark' : 'sprig'}, the right way up (keeps your zoom)`}
      >
        ⌂
      </button>
    </div>
  );
}
