'use client';

/**
 * The finished piece, shared by every tool that shows it (Gary, 2026-10-25):
 * the current VaseMaker vase with the sprig draped on it and/or the
 * HandleMaker handle. One component, so the Vase, Handle and Sprig pages can
 * never show it differently.
 *
 * Who owns what: the SPRIG preview's placement (Height / Around / Tilt /
 * Repeat) is set in SprigMaker; the HANDLE's (Around, Top Below Rim) is the
 * vase's, set on the Vase tab (2026-11-11). Every other page only shows them.
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { creasedGeometry } from './crease';
import { useShowFacets, useSeamsView, type SeamsView } from '@/store/view-prefs';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { create } from 'zustand';
import { GroundGrid } from '@/components/viewport/SceneHelpers';
import { RememberCamera } from '@/components/viewport/RememberCamera';
import { LIGHTING } from '@/config/viewport';
import { useVaseMesh } from '@/hooks/use-vase-mesh';
import { useSprigMeshes } from '@/hooks/use-sprig-meshes';
import { useVaseStore } from '@/store/vase-store';
import { useSprigStore } from '@/store/sprig-store';
import { buildVaseSurface, wrapSprig, handleOnVase } from '@/engine/sprig/on-vase';
import type { VaseMesh } from '@/engine/types';
import type { HandleParameters } from '@/engine/handle/handle-types';
import { vaseHandle, handleOnMug } from '@/engine/mold/handle-on-vase';
import { seamAngles, pieceCentreAngles, seamLinesOnVase, type SeamMold } from '@/engine/mold/seams';
import { useSeamAngle } from '@/hooks/use-seam-angle';
import { ViewCube, ViewButtons, useVaseViewButtons, handleProfileBearing } from './ViewButtons';
import type { SprigMoldMeshes } from '@/engine/sprig/sprig-generator';

export const SPRIG_COLOR = '#d98a4a';

/** The vase's own Sprig texture is on. */
export function useSprigTextureOn(): boolean {
  return useVaseStore((s) => s.params.textures.enabled !== false && !!s.params.textures.sprig?.enabled);
}

/** VaseMaker: the vase's handle and the seam lines inside the vase view's own
 *  canvas. (Show Sprig went 2026-11-11: the sprig is Textures → Sprig, part of
 *  the vase mesh itself.) */
export function VasePageExtras() {
  const handle = useVaseStore((s) => handleOnMug(s.params));
  const flat = useShowFacets();
  const seams = useSeamsView();
  const vaseMesh = useVaseMesh();
  return <MugExtras vaseMesh={vaseMesh} sprig={null} handle={handle} flat={flat} seams={seams} />;
}

export const SEAM_COLOR = '#38bdf8';

/**
 * A split mold's seams as solid lines up the vase, and each piece's centre
 * dashed (Gary, 2026-11-09), at the Seam Angle that style was given on the
 * Mold page. `vaseMesh` is only a rebuild trigger, as in MugExtras.
 */
function SeamLines({ mold, vaseMesh }: { mold: SeamMold; vaseMesh: VaseMesh }) {
  const vase = useVaseStore((s) => s.params);
  const angle = useSeamAngle(mold);
  const lines = useMemo(() => {
    void vaseMesh;
    const seams = seamAngles(mold, angle), centres = pieceCentreAngles(mold, angle);
    const all = seamLinesOnVase(vase, [...seams, ...centres], 0.4);
    return { seams: all.slice(0, seams.length), centres: all.slice(seams.length) };
  }, [vase, vaseMesh, mold, angle]);
  return (
    <group name="__capture_seams">{/* a guide: left out of Capture Image, like the rulers */}
      {lines.seams.map((pts, i) => pts.length > 1 && <Line key={`s${i}`} points={pts} color={SEAM_COLOR} lineWidth={2.5} />)}
      {lines.centres.map((pts, i) => pts.length > 1 && (
        <Line key={`c${i}`} points={pts} color={SEAM_COLOR} lineWidth={1.5} dashed dashSize={3} gapSize={2.5} transparent opacity={0.7} />
      ))}
    </group>
  );
}

/** Notes about what is shown (off the vase, overlap, the handle will not fit). */
export const useMugNotes = create<{ notes: string[] }>(() => ({ notes: [] }));

/** Facets showing: the mesh as is (flat shaded). Off: crease shading, which
 *  makes its own normals, so `computeNormals` only matters with facets on. */
function useGeo(mesh: VaseMesh | null, computeNormals: boolean, flat: boolean): THREE.BufferGeometry | null {
  const geo = useMemo(() => {
    if (!mesh) return null;
    let g: THREE.BufferGeometry;
    if (!flat) g = creasedGeometry(mesh, null);
    else {
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
      g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      if (computeNormals) g.computeVertexNormals();
      else g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    }
    g.computeBoundingSphere();
    return g;
  }, [mesh, computeNormals, flat]);
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
export function MugExtras({ vaseMesh, sprig, handle: handleParams, flat, seams = 'off' }: {
  vaseMesh: VaseMesh; sprig: SprigMoldMeshes | null;
  /** The handle to draw (the vase's copy, or on the Handle tab the one being drawn), placed where the vase says. */
  handle: HandleParameters | null; flat: boolean; seams?: SeamsView;
}) {
  const vase = useVaseStore((s) => s.params);
  const { around: handleAngle, topDrop } = vaseHandle(vase);
  const p = useSprigStore((s) => s.params);

  const hasSprig = !!sprig;
  const surface = useMemo(() => { void vaseMesh; return hasSprig ? buildVaseSurface(vase) : null; }, [vase, vaseMesh, hasSprig]);
  const wrap = useMemo(
    () => (surface && sprig ? wrapSprig(surface, sprig.relief, { heightPct: p.onVaseHeight, angle: p.onVaseAngle, tilt: p.onVaseTilt, copies: p.onVaseCopies }) : null),
    [surface, sprig, p.onVaseHeight, p.onVaseAngle, p.onVaseTilt, p.onVaseCopies],
  );
  const handle = useMemo(
    () => (handleParams ? handleOnVase(vase, handleParams, handleAngle, topDrop) : null),
    [vase, handleParams, handleAngle, topDrop],
  );
  const sprigGeo = useGeo(wrap?.mesh ?? null, true, flat);
  const handleGeo = useGeo(handle && typeof handle !== 'string' ? handle : null, true, flat);

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
      {seams !== 'off' && <SeamLines mold={seams} vaseMesh={vaseMesh} />}
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
 * remembered camera (`cameraId`), and the cube and view buttons
 * (ViewButtons.tsx). It starts facing the sprig (or, with no sprig, the mug
 * side-on with the handle to the right); Home goes back there.
 */
export function OnVaseView({ sprig, handle, cameraId, flat, seams = 'off' }: {
  sprig: SprigMoldMeshes | null; handle: HandleParameters | null; cameraId: string; flat: boolean; seams?: SeamsView;
}) {
  const vase = useVaseStore((s) => s.params);
  const sprigAngle = useSprigStore((s) => s.params.onVaseAngle);
  const sprigHeight = useSprigStore((s) => s.params.onVaseHeight);
  const handleAngle = vaseHandle(vase).around;
  const vaseMesh = useVaseMesh();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const vaseGeo = useGeo(vaseMesh, false, flat);

  const H = vase.height;
  const reach = useMemo(() => {
    let r = vase.radius;
    for (let i = 0; i < vaseMesh.positions.length; i += 3) r = Math.max(r, Math.hypot(vaseMesh.positions[i], vaseMesh.positions[i + 1]));
    return r;
  }, [vaseMesh, vase.radius]);
  const target: [number, number, number] = [0, 0, H / 2];
  const dist = 1.6 * Math.max(H, 2 * reach) + 40;
  // Start facing the sprig; with none, where the handle is on your right.
  const faceAngle = sprig ? sprigAngle : handleProfileBearing(handleAngle);
  const fa = (faceAngle * Math.PI) / 180;
  const buttons = useVaseViewButtons({
    controls: controlsRef,
    home: { dir: new THREE.Vector3(dist * Math.cos(fa), dist * Math.sin(fa), H * 0.6 - H / 2), target },
    height: H,
    handle: handle ? handleAngle : null,
    sprig: sprig ? { angle: sprigAngle, heightPct: sprigHeight } : null,
    seams,
  });

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
        <MugExtras vaseMesh={vaseMesh} sprig={sprig} handle={handle} flat={flat} seams={seams} />
        <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.1} target={target} minDistance={20} maxDistance={4000} />
        <ViewCube controls={controlsRef} />
        <RememberCamera id={cameraId} />
      </Canvas>
      <ViewButtons buttons={buttons} />
      <MugNotes />
    </div>
  );
}
