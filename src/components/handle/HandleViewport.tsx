'use client';

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GroundGrid } from '@/components/viewport/SceneHelpers';
import { LIGHTING } from '@/config/viewport';
import { useHandleStore } from '@/store/handle-store';
import type { VaseMesh } from '@/engine/types';
import type { HandleMeshes } from '@/engine/handle/handle-generator';

const MASTER_COLOR = '#8fa8d8';
const WELL_COLOR = '#a8bce0';
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

function Part({ geometry, color, opacity, flat, clip }: {
  geometry: THREE.BufferGeometry; color: string; opacity: number; flat: boolean;
  clip: THREE.Plane[] | null;
}) {
  return (
    <mesh geometry={geometry}>
      {/* key forces a fresh material: three.js bakes BOTH flat shading and the
          NUMBER of clipping planes into the compiled shader — neither is a live
          uniform, so switching either one without a new material silently does
          nothing. (Moving an existing plane IS live, hence only the count.) */}
      <meshStandardMaterial
        key={`${flat ? 'flat' : 'smooth'}-${clip ? 'clip' : 'whole'}`}
        flatShading={flat}
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={0.55}
        metalness={0.05}
        side={THREE.DoubleSide}
        // NEVER undefined — three.js's WebGLClipping dereferences this every
        // frame and throws on undefined. null is the "no clipping" value.
        clippingPlanes={clip}
      />
    </mesh>
  );
}

export function HandleViewport({ handle }: { handle: HandleMeshes }) {
  const view = useHandleStore((s) => s.view);

  /**
   * Cutting plane. Its travel is derived from the WHOLE assembly's bounds, not
   * from whatever happens to be visible — otherwise toggling a part off would
   * move the plane out from under the slider.
   */
  const bounds = useMemo(() => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const m of [handle.master, handle.plate, handle.wall, handle.wallB]) {
      for (let i = 0; i < m.vertexCount; i++) {
        for (let k = 0; k < 3; k++) {
          const v = m.positions[i * 3 + k];
          if (v < lo[k]) lo[k] = v;
          if (v > hi[k]) hi[k] = v;
        }
      }
    }
    return { lo, hi };
  }, [handle]);

  const clip = useMemo(() => {
    if (!view.crossSection) return null;
    const k = view.crossAxis === 'x' ? 0 : view.crossAxis === 'y' ? 1 : 2;
    // Clipping planes live in WORLD space, but the parts are rendered inside a
    // group lifted by `plateThk` — so a plane placed from raw mesh bounds lands
    // that far off. Nothing errors; the slider just addresses the wrong band,
    // which looks like "the cut doesn't reach the handle".
    const shift = k === 2 ? handle.layout.plateThk : 0;
    // A hair of margin each end so the extremes still show a sliver rather
    // than clipping the whole model away.
    const pad = 0.02 * (bounds.hi[k] - bounds.lo[k]);
    const at = shift + bounds.lo[k] - pad + view.crossPos * (bounds.hi[k] - bounds.lo[k] + 2 * pad);
    // Normal points along -axis: everything ABOVE `at` is kept, so raising the
    // slider eats into the model from the low side.
    const n = new THREE.Vector3(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0);
    return [new THREE.Plane(n, -at)];
  }, [view.crossSection, view.crossAxis, view.crossPos, bounds, handle.layout.plateThk]);

  const controlsRef = useRef<OrbitControlsImpl>(null);

  /**
   * Square the view up: keep the current distance and target, snap the view
   * direction to `dir` (or, if omitted, to the world axis nearest the current
   * direction). Side views get z-up; top/bottom views keep the screen-up
   * closest to the current one, snapped to an axis — so clicking a cube face
   * near your current view only nudges it square instead of spinning the
   * handle 90°. `azimuth` overrides that "keep what you had" behaviour with a
   * fixed horizontal bearing (see homeView).
   */
  const snapView = (dir?: THREE.Vector3, azimuth?: [number, number]) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cam = controls.object;
    const offset = cam.position.clone().sub(controls.target);
    const dist = offset.length();
    let d = dir?.clone();
    if (!d) {
      const ax = Math.abs(offset.x), ay = Math.abs(offset.y), az = Math.abs(offset.z);
      d = ax >= ay && ax >= az
        ? new THREE.Vector3(Math.sign(offset.x) || 1, 0, 0)
        : ay >= az
          ? new THREE.Vector3(0, Math.sign(offset.y) || 1, 0)
          : new THREE.Vector3(0, 0, Math.sign(offset.z) || 1);
    }
    d.normalize();
    if (Math.abs(d.z) > 0.9) {
      // Top/bottom: tilt ~1.5° off vertical toward the current azimuth instead
      // of changing the camera's up-vector — OrbitControls orbits relative to
      // `up`, so changing it made the mouse feel completely different after a
      // snap. With a constant z-up the view is visually straight down and the
      // controls keep behaving normally.
      let hx = azimuth ? azimuth[0] : offset.x;
      let hy = azimuth ? azimuth[1] : offset.y;
      const hLen = Math.hypot(hx, hy);
      if (hLen < 1e-6) { hx = 0; hy = -1; } else { hx /= hLen; hy /= hLen; }
      const tilt = 0.027;
      d.set(hx * tilt, hy * tilt, Math.sign(d.z) * Math.sqrt(1 - tilt * tilt));
    }
    cam.up.set(0, 0, 1); // always — never leave a snapped up-vector behind
    cam.position.copy(controls.target.clone().add(d.multiplyScalar(dist)));
    controls.update();
  };

  /**
   * Home — the view you want while drawing the profile: straight down on the
   * parting plane, oriented exactly like the Handle Profile editor. World +x
   * (stick-out depth) runs screen-RIGHT and world +y (height along the vase
   * wall) runs screen-UP, so the wall plane and the well openings — which run
   * out to −x — land on the LEFT, matching the editor whose left edge is the
   * wall. Deliberately NOT the 3/4 view most apps home to.
   *
   * Why azimuth (0, −1): with a z-up camera, screen-up ends up being the
   * negated horizontal bearing, so parking the camera on the −y side puts
   * world +y up the screen. Zoom and pan are left untouched.
   */
  const homeView = () => snapView(new THREE.Vector3(0, 0, 1), [0, -1]);
  const bodyGeo = useGeometry(handle.masterBody);
  const wellsGeo = useGeometry(handle.masterWells);
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
        onCreated={({ camera, scene, gl }) => {
          camera.up.set(0, 0, 1);
          scene.up.set(0, 0, 1);
          camera.lookAt(...target);
          // Required for per-material `clippingPlanes`; without it the cross
          // section silently does nothing at all.
          gl.localClippingEnabled = true;
        }}
      >
        <ambientLight intensity={LIGHTING.ambient.intensity} />
        <directionalLight position={LIGHTING.main.position} intensity={LIGHTING.main.intensity} />
        <directionalLight position={LIGHTING.fill.position} intensity={LIGHTING.fill.intensity} />
        <directionalLight position={LIGHTING.back.position} intensity={LIGHTING.back.intensity} />

        <GroundGrid radius={gridR} height={gridR} />

        <group position={[0, 0, lift]}>
          {view.showPlaster && plasterGeo && <Part geometry={plasterGeo} color={PLASTER_COLOR} opacity={0.4} flat={view.flatShading} clip={clip} />}
          {view.showPlate && plateGeo && <Part geometry={plateGeo} color={PLATE_COLOR} opacity={1} flat={view.flatShading} clip={clip} />}
          {view.showWallA && wallGeo && <Part geometry={wallGeo} color={WALL_COLOR} opacity={1} flat={view.flatShading} clip={clip} />}
          {view.showWallB && wallBGeo && <Part geometry={wallBGeo} color={WALL_COLOR} opacity={1} flat={view.flatShading} clip={clip} />}
          {view.showHandle && bodyGeo && <Part geometry={bodyGeo} color={MASTER_COLOR} opacity={1} flat={view.flatShading} clip={clip} />}
          {view.showHandle && view.showWells && wellsGeo && <Part geometry={wellsGeo} color={WELL_COLOR} opacity={1} flat={view.flatShading} clip={clip} />}
        </group>

        {/* Clickable orientation cube — snap the view square to the world.
            Custom onClick replaces drei's default (which re-rolls the camera
            up-vector and spins the handle 90° on Top). */}
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
          minDistance={30}
          maxDistance={2500}
        />
      </Canvas>

      {/* Home — top view matching the Handle Profile editor */}
      <button
        onClick={homeView}
        className="absolute top-[104px] right-[26px] w-8 h-8 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors text-base leading-none"
        style={{ backgroundColor: 'rgba(28, 30, 34, 0.85)' }}
        title="Home: look straight down on the handle, oriented like the Handle Profile editor — openings to the left (keeps your zoom)"
      >
        ⌂
      </button>
    </div>
  );
}
