'use client';

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GroundGrid } from '@/components/viewport/SceneHelpers';
import { LIGHTING } from '@/config/viewport';
import { useSprigStore } from '@/store/sprig-store';
import type { VaseMesh } from '@/engine/types';
import type { SprigMoldMeshes } from '@/engine/sprig/sprig-generator';
import { RememberCamera } from '@/components/viewport/RememberCamera';
import { useVaseMesh } from '@/hooks/use-vase-mesh';
import { useVaseStore } from '@/store/vase-store';
import { useHandleStore } from '@/store/handle-store';
import { buildVaseSurface, wrapSprig, handleOnVase } from '@/engine/sprig/on-vase';

const PLATE_COLOR = '#d98a4a';
const WALL_COLOR = '#c97f45';
const PLASTER_COLOR = '#e7dfca';
const THIN_COLOR = '#e53935';

/** `tint` (per vertex 0..1) blends the base colour to red — the thin-part marks. */
function useGeometry(mesh: VaseMesh | null, tint?: Float32Array | null, base?: string, smoothNormals = false): THREE.BufferGeometry | null {
  const geo = useMemo(() => {
    if (!mesh) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    if (smoothNormals) g.computeVertexNormals();
    else g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    if (tint && base) {
      const a = new THREE.Color(base), b = new THREE.Color(THIN_COLOR);
      const col = new Float32Array(mesh.vertexCount * 3);
      for (let i = 0; i < mesh.vertexCount; i++) {
        const t = tint[i] ?? 0;
        col[i * 3] = a.r + (b.r - a.r) * t;
        col[i * 3 + 1] = a.g + (b.g - a.g) * t;
        col[i * 3 + 2] = a.b + (b.b - a.b) * t;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    g.computeBoundingSphere();
    return g;
  }, [mesh, tint, base, smoothNormals]);
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
  const onVase = useSprigStore((s) => s.view.onVase);
  return onVase ? <OnVaseView sprig={sprig} /> : <MoldView sprig={sprig} />;
}

/** Square the camera to `dir` about the controls' target, keeping distance (z up). */
function snapTo(controls: OrbitControlsImpl | null, dir: THREE.Vector3) {
  if (!controls) return;
  const cam = controls.object;
  const dist = cam.position.distanceTo(controls.target);
  cam.up.set(0, 0, 1);
  cam.position.copy(controls.target.clone().add(dir.clone().normalize().multiplyScalar(dist)));
  controls.update();
}

/**
 * On Vase: the current VaseMaker vase, the sprig draped onto it (Repeat
 * copies), and optionally the HandleMaker handle. Its own canvas and its own
 * remembered camera, so switching views never disturbs the mold view's.
 */
function OnVaseView({ sprig }: { sprig: SprigMoldMeshes | null }) {
  const p = useSprigStore((s) => s.params);
  const flat = useSprigStore((s) => s.view.flatShading);
  const vase = useVaseStore((s) => s.params);
  const handleParams = useHandleStore((s) => s.params);
  const vaseMesh = useVaseMesh();
  const controlsRef = useRef<OrbitControlsImpl>(null);

  // vaseMesh changes when an SVG texture finishes loading, which the surface needs too.
  const surface = useMemo(() => { void vaseMesh; return buildVaseSurface(vase); }, [vase, vaseMesh]);
  const wrap = useMemo(
    () => (sprig ? wrapSprig(surface, sprig.relief, { heightPct: p.onVaseHeight, angle: p.onVaseAngle, tilt: p.onVaseTilt, copies: p.onVaseCopies }) : null),
    [surface, sprig, p.onVaseHeight, p.onVaseAngle, p.onVaseTilt, p.onVaseCopies],
  );
  const handle = useMemo(
    () => (p.onVaseHandle ? handleOnVase(vase, handleParams, p.onVaseHandleAngle, p.onVaseHandleTop) : null),
    [p.onVaseHandle, vase, handleParams, p.onVaseHandleAngle, p.onVaseHandleTop],
  );

  const vaseGeo = useGeometry(vaseMesh);
  const sprigGeo = useGeometry(wrap?.mesh ?? null, null, undefined, true);
  const handleGeo = useGeometry(handle && typeof handle !== 'string' ? handle : null, null, undefined, true);

  const H = vase.height;
  let reach = vase.radius;
  for (let i = 0; i < vaseMesh.positions.length; i += 3) reach = Math.max(reach, Math.hypot(vaseMesh.positions[i], vaseMesh.positions[i + 1]));
  const target: [number, number, number] = [0, 0, H / 2];
  const dist = 1.6 * Math.max(H, 2 * reach) + 40;
  const front = () => {
    const a = (p.onVaseAngle * Math.PI) / 180;
    snapTo(controlsRef.current, new THREE.Vector3(Math.cos(a), Math.sin(a), 0.12));
  };

  const notes: string[] = [];
  if (!sprig) notes.push('No sprig yet — load a drawing or type some text.');
  if (wrap?.offVase) notes.push('Part of the sprig runs off the top or bottom of the vase — move it with Height.');
  if (wrap?.overlap) notes.push(`${p.onVaseCopies} copies need more room than the way round at this height — they overlap.`);
  if (surface.hasCutout) notes.push('This vase has cutout holes; the preview lays the sprig across them, but clay cannot be attached over a hole.');
  if (typeof handle === 'string') notes.push(`Handle: ${handle}`);

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [dist, 0, H * 0.6], fov: 50, near: 0.1, far: 8000 }}
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
        <GroundGrid radius={reach + 30} height={reach + 30} />
        {vaseGeo && <Part geometry={vaseGeo} color={vase.color} opacity={1} flat={flat} />}
        {sprigGeo && <Part geometry={sprigGeo} color={PLATE_COLOR} opacity={1} flat={flat} />}
        {handleGeo && <Part geometry={handleGeo} color={vase.color} opacity={1} flat={flat} />}
        <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.1} target={target} minDistance={20} maxDistance={4000} />
        <RememberCamera id="sprig-vase" />
      </Canvas>
      <button
        onClick={front}
        className="absolute top-4 right-[26px] w-8 h-8 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors text-base leading-none"
        style={{ backgroundColor: 'rgba(28, 30, 34, 0.85)' }}
        title="Look straight at the sprig (keeps your zoom)"
      >
        ⌂
      </button>
      {notes.length > 0 && (
        <div className="absolute top-4 left-4 max-w-sm flex flex-col gap-1.5">
          {notes.map((n, i) => (
            <div key={i} className="px-2 py-1.5 rounded border border-amber-700 bg-amber-950/70 text-xs text-amber-200">{n}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function MoldView({ sprig }: { sprig: SprigMoldMeshes | null }) {
  const view = useSprigStore((s) => s.view);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const tint = view.showThin && sprig && sprig.relief.thinSpots > 0 ? sprig.thinFlags : null;
  const plateGeo = useGeometry(sprig?.plate ?? null, tint, PLATE_COLOR);
  const wallGeo = useGeometry(sprig?.wall ?? null);
  const wallBGeo = useGeometry(sprig?.wallB ?? null);
  const plasterGeo = useGeometry(sprig?.plaster ?? null);

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
          {view.showPlaster && plasterGeo && <Part geometry={plasterGeo} color={PLASTER_COLOR} opacity={0.4} flat={view.flatShading} />}
          {view.showPlate && plateGeo && <Part geometry={plateGeo} color={PLATE_COLOR} opacity={1} flat={view.flatShading} vertexColors={!!tint} />}
          {view.showWallA && wallGeo && <Part geometry={wallGeo} color={WALL_COLOR} opacity={1} flat={view.flatShading} />}
          {view.showWallB && wallBGeo && <Part geometry={wallBGeo} color={WALL_COLOR} opacity={1} flat={view.flatShading} />}
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
        <RememberCamera id="sprig" />
      </Canvas>

      {/* Home — straight down, the drawing the right way up */}
      <button
        onClick={() => snapView(new THREE.Vector3(0, 0, 1))}
        className="absolute top-[104px] right-[26px] w-8 h-8 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors text-base leading-none"
        style={{ backgroundColor: 'rgba(28, 30, 34, 0.85)' }}
        title="Home: look straight down on the sprig, the right way up (keeps your zoom)"
      >
        ⌂
      </button>
    </div>
  );
}
