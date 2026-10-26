'use client';

/**
 * The finished piece, shared by every tool that shows it (Gary, 2026-10-25):
 * the current VaseMaker vase with the sprig draped on it and/or the
 * HandleMaker handle. One component, so the Vase, Handle and Sprig pages can
 * never show it differently.
 *
 * Who owns what: the SPRIG's placement (Height / Around / Tilt / Repeat) is
 * set in SprigMaker; the HANDLE's (Top Below Rim + the split angle) in
 * HandleMaker / the Mold page. Every other page only shows them.
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { create } from 'zustand';
import { GroundGrid } from '@/components/viewport/SceneHelpers';
import { RememberCamera } from '@/components/viewport/RememberCamera';
import { LIGHTING } from '@/config/viewport';
import { useVaseMesh } from '@/hooks/use-vase-mesh';
import { useSprigMeshes } from '@/hooks/use-sprig-meshes';
import { useVaseStore } from '@/store/vase-store';
import { useHandleStore } from '@/store/handle-store';
import { useMoldStore } from '@/store/mold-store';
import { useSprigStore } from '@/store/sprig-store';
import { buildVaseSurface, wrapSprig, handleOnVase } from '@/engine/sprig/on-vase';
import type { VaseMesh } from '@/engine/types';
import type { SprigMoldMeshes } from '@/engine/sprig/sprig-generator';

export const SPRIG_COLOR = '#d98a4a';

/** VaseMaker's own switches: show the handle / the sprig on the vase. View
 *  state only — not saved in the design file. */
export const useVaseExtras = create<{ showHandle: boolean; showSprig: boolean }>(() => ({ showHandle: false, showSprig: false }));

/** VaseMaker: the handle and/or sprig inside the vase view's own canvas. */
export function VasePageExtras() {
  const { showHandle, showSprig } = useVaseExtras();
  const flat = useVaseStore((s) => s.params.flatShading ?? false);
  const vaseMesh = useVaseMesh();
  return showSprig
    ? <SprigSource>{(sprig) => <MugExtras vaseMesh={vaseMesh} sprig={sprig} showHandle={showHandle} flat={flat} />}</SprigSource>
    : <MugExtras vaseMesh={vaseMesh} sprig={null} showHandle={showHandle} flat={flat} />;
}

/** Notes about what is shown (off the vase, overlap, the handle will not fit). */
export const useMugNotes = create<{ notes: string[] }>(() => ({ notes: [] }));

function useGeo(mesh: VaseMesh | null, computeNormals: boolean): THREE.BufferGeometry | null {
  const geo = useMemo(() => {
    if (!mesh) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    if (computeNormals) g.computeVertexNormals();
    else g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    g.computeBoundingSphere();
    return g;
  }, [mesh, computeNormals]);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

function Solid({ geometry, color, flat }: { geometry: THREE.BufferGeometry; color: string; flat: boolean }) {
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial key={flat ? 'flat' : 'smooth'} flatShading={flat} color={color}
        roughness={0.55} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * The sprig (draped, all Repeat copies) and/or the handle, as scene children
 * for any canvas that already draws the vase. `vaseMesh` is only a rebuild
 * trigger: it changes when an SVG texture finishes loading, which the drape
 * needs too.
 */
export function MugExtras({ vaseMesh, sprig, showHandle, flat }: {
  vaseMesh: VaseMesh; sprig: SprigMoldMeshes | null; showHandle: boolean; flat: boolean;
}) {
  const vase = useVaseStore((s) => s.params);
  const handleParams = useHandleStore((s) => s.params);
  const topDrop = useMoldStore((s) => s.params.handleTopDrop);
  const handleAngle = useMoldStore((s) => s.params.seamAngle);
  const p = useSprigStore((s) => s.params);

  const hasSprig = !!sprig;
  const surface = useMemo(() => { void vaseMesh; return hasSprig ? buildVaseSurface(vase) : null; }, [vase, vaseMesh, hasSprig]);
  const wrap = useMemo(
    () => (surface && sprig ? wrapSprig(surface, sprig.relief, { heightPct: p.onVaseHeight, angle: p.onVaseAngle, tilt: p.onVaseTilt, copies: p.onVaseCopies }) : null),
    [surface, sprig, p.onVaseHeight, p.onVaseAngle, p.onVaseTilt, p.onVaseCopies],
  );
  const handle = useMemo(
    () => (showHandle ? handleOnVase(vase, handleParams, handleAngle, topDrop) : null),
    [showHandle, vase, handleParams, handleAngle, topDrop],
  );
  const sprigGeo = useGeo(wrap?.mesh ?? null, true);
  const handleGeo = useGeo(handle && typeof handle !== 'string' ? handle : null, true);

  useEffect(() => {
    const notes: string[] = [];
    if (wrap?.offVase) notes.push('Part of the sprig runs off the top or bottom of the vase — move it with Height in SprigMaker.');
    if (wrap?.overlap) notes.push(`${p.onVaseCopies} copies need more room than the way round at this height — they overlap.`);
    if (surface?.hasCutout) notes.push('This vase has cutout holes; the sprig is laid across them, but clay cannot be attached over a hole.');
    if (typeof handle === 'string') notes.push(`Handle: ${handle}`);
    useMugNotes.setState({ notes });
  }, [wrap, surface, handle, p.onVaseCopies]);
  useEffect(() => () => useMugNotes.setState({ notes: [] }), []);

  return (
    <>
      {sprigGeo && <Solid geometry={sprigGeo} color={SPRIG_COLOR} flat={flat} />}
      {handleGeo && <Solid geometry={handleGeo} color={vase.color} flat={flat} />}
    </>
  );
}

/** Supplies the current sprig to a page that does not build it already (Vase, Handle). */
export function SprigSource({ children }: { children: (sprig: SprigMoldMeshes | null) => ReactNode }) {
  const s = useSprigMeshes();
  return <>{children(s.meshes)}</>;
}

/** The notes, as amber boxes over the top-left of the view. */
export function MugNotes() {
  const notes = useMugNotes((s) => s.notes);
  if (!notes.length) return null;
  return (
    <div className="absolute top-4 left-4 max-w-sm flex flex-col gap-1.5 pointer-events-none">
      {notes.map((n, i) => (
        <div key={i} className="px-2 py-1.5 rounded border border-amber-700 bg-amber-950/70 text-xs text-amber-200">{n}</div>
      ))}
    </div>
  );
}

/**
 * A whole On Vase view: the vase, the sprig and/or the handle, its own
 * remembered camera (`cameraId`), and ⌂ to face the sprig (or, with no
 * sprig, the mug side-on with the handle to the right).
 */
export function OnVaseView({ sprig, showHandle, cameraId, flat }: {
  sprig: SprigMoldMeshes | null; showHandle: boolean; cameraId: string; flat: boolean;
}) {
  const vase = useVaseStore((s) => s.params);
  const sprigAngle = useSprigStore((s) => s.params.onVaseAngle);
  const handleAngle = useMoldStore((s) => s.params.seamAngle);
  const vaseMesh = useVaseMesh();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const vaseGeo = useGeo(vaseMesh, false);

  const H = vase.height;
  const reach = useMemo(() => {
    let r = vase.radius;
    for (let i = 0; i < vaseMesh.positions.length; i += 3) r = Math.max(r, Math.hypot(vaseMesh.positions[i], vaseMesh.positions[i + 1]));
    return r;
  }, [vaseMesh, vase.radius]);
  const target: [number, number, number] = [0, 0, H / 2];
  const dist = 1.6 * Math.max(H, 2 * reach) + 40;
  // Face the sprig; with none, stand where the handle is on your right.
  const faceAngle = sprig ? sprigAngle : handleAngle - 90;
  const fa = (faceAngle * Math.PI) / 180;
  const front = () => {
    const c = controlsRef.current;
    if (!c) return;
    const d = c.object.position.distanceTo(c.target);
    c.object.up.set(0, 0, 1);
    c.object.position.copy(c.target.clone().add(new THREE.Vector3(Math.cos(fa), Math.sin(fa), 0.12).normalize().multiplyScalar(d)));
    c.update();
  };

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [dist * Math.cos(fa), dist * Math.sin(fa), H * 0.6], fov: 50, near: 0.1, far: 8000 }}
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
        {vaseGeo && <Solid geometry={vaseGeo} color={vase.color} flat={flat} />}
        <MugExtras vaseMesh={vaseMesh} sprig={sprig} showHandle={showHandle} flat={flat} />
        <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.1} target={target} minDistance={20} maxDistance={4000} />
        <RememberCamera id={cameraId} />
      </Canvas>
      <button
        onClick={front}
        className="absolute top-4 right-[26px] w-8 h-8 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors text-base leading-none"
        style={{ backgroundColor: 'rgba(28, 30, 34, 0.85)' }}
        title={sprig ? 'Look straight at the sprig (keeps your zoom)' : 'Look at the mug side-on, handle to the right (keeps your zoom)'}
      >
        ⌂
      </button>
      <MugNotes />
    </div>
  );
}
