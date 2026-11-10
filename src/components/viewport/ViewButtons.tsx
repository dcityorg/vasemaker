'use client';

/**
 * Camera help for the views that show the whole vase (Gary, 2026-11-09): the
 * orientation cube in the top-right corner, as on the Handle page, and under it
 * named buttons that turn the camera to what you placed — Home, Handle (in
 * profile, sticking out to the right), Sprig (straight at it, at its height)
 * and Seam (the nearest seam; again for the next one). Every one keeps your
 * zoom; Home and Handle/Seam also re-centre on the vase.
 *
 * Bearings are the vase's own (degrees, + = counter-clockwise from above, as
 * the sprig's Around): the camera stands out at that bearing looking in.
 */

import * as THREE from 'three';
import { GizmoHelper, GizmoViewcube } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { RefObject } from 'react';
import { wrapAngle, seamAngles, nextSeam, type SeamMold } from '@/engine/mold/seams';
import { useSeamAngle } from '@/hooks/use-seam-angle';

/** Where the camera stands to show a mug's handle at `handleAngle` in profile,
 *  to the right: 90° clockwise of it (screen-right is the bearing + 90°). */
export const handleProfileBearing = (handleAngle: number) => wrapAngle(handleAngle - 90);

/** The camera's bearing round its target, degrees. */
export function cameraBearing(controls: OrbitControlsImpl | null): number {
  if (!controls) return 0;
  const o = controls.object.position.clone().sub(controls.target);
  return (Math.atan2(o.y, o.x) * 180) / Math.PI;
}

/**
 * Point the camera along `dir` (from the target out to the camera), keeping
 * its distance. `target` moves the point it looks at first. Straight up/down
 * tilts a hair off vertical instead of changing the camera's up-vector, which
 * would make orbiting feel wrong afterwards (as HandleViewport's snap).
 */
export function snapCamera(controls: OrbitControlsImpl | null, dir: THREE.Vector3, target?: [number, number, number]) {
  if (!controls) return;
  const cam = controls.object;
  const dist = cam.position.distanceTo(controls.target);
  if (target) controls.target.set(...target);
  const d = dir.clone().normalize();
  if (Math.abs(d.z) > 0.9) {
    const tilt = 0.027;
    d.set(0, -tilt, Math.sign(d.z) * Math.sqrt(1 - tilt * tilt));
  }
  cam.up.set(0, 0, 1);
  cam.position.copy(controls.target.clone().add(d.multiplyScalar(dist)));
  controls.update();
}

/** Standing out at `bearing`, `rise` up for every 1 out (0 = level). */
export function bearingDir(bearing: number, rise = 0): THREE.Vector3 {
  const a = (bearing * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(a), Math.sin(a), rise);
}

/** The clickable cube, inside the Canvas. Faces are the world's axes, labelled
 *  as on the Handle page (Front = −y). */
export function ViewCube({ controls }: { controls: RefObject<OrbitControlsImpl | null> }) {
  return (
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
          if (e.face) snapCamera(controls.current, new THREE.Vector3(e.face.normal.x, e.face.normal.y, e.face.normal.z));
          return null;
        }}
      />
    </GizmoHelper>
  );
}

export interface ViewButton { label: string; title: string; onClick: () => void }

/** The named buttons, in a column under the cube (outside the Canvas). */
export function ViewButtons({ buttons }: { buttons: ViewButton[] }) {
  return (
    <div className="absolute top-[104px] right-[26px] flex flex-col items-end gap-1.5">
      {buttons.map((b) => (
        <button
          key={b.label}
          onClick={b.onClick}
          className="h-7 min-w-8 px-2 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors text-xs leading-none"
          style={{ backgroundColor: 'rgba(28, 30, 34, 0.85)' }}
          title={b.title}
          aria-label={b.label}
        >
          {b.label === 'Home' ? <span className="text-base">⌂</span> : b.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The buttons for a view of the whole vase. `home` is that view's starting
 * framing; `handle` the handle's bearing (null: no handle shown); `sprig` the
 * sprig's Around and Height % (null: none shown); `seams` the Seams choice.
 */
export function useVaseViewButtons({ controls, home, height, handle, sprig, seams }: {
  controls: RefObject<OrbitControlsImpl | null>;
  home: { dir: THREE.Vector3; target: [number, number, number] };
  height: number;
  handle: number | null;
  sprig: { angle: number; heightPct: number } | null;
  seams: SeamMold | 'off';
}): ViewButton[] {
  // Called every render (a hook): the Halves angle when seams are off.
  const seamAngle = useSeamAngle(seams === 'off' ? 'halves' : seams);
  const middle: [number, number, number] = [0, 0, height / 2];
  const b: ViewButton[] = [
    { label: 'Home', title: 'Home: back to the starting view (keeps your zoom)', onClick: () => snapCamera(controls.current, home.dir, home.target) },
  ];
  if (handle !== null) b.push({
    label: 'Handle', title: 'Look at the handle in profile, sticking out to the right (keeps your zoom)',
    onClick: () => snapCamera(controls.current, bearingDir(handleProfileBearing(handle), 0.05), middle),
  });
  if (sprig) b.push({
    label: 'Sprig', title: 'Look straight at the sprig, level with it (keeps your zoom)',
    onClick: () => snapCamera(controls.current, bearingDir(sprig.angle), [0, 0, (Math.max(0, Math.min(100, sprig.heightPct)) / 100) * height]),
  });
  if (seams !== 'off') b.push({
    label: 'Seam', title: 'Look straight at the nearest seam; press again for the next one round (keeps your zoom)',
    onClick: () => snapCamera(controls.current, bearingDir(nextSeam(cameraBearing(controls.current), seamAngles(seams, seamAngle)), 0.05), middle),
  });
  return b;
}
