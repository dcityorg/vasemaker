'use client';

/**
 * Keep each tool's camera where the user left it. Vase, Mold and Handle are
 * separate routes, so every switch unmounts the Canvas and the next visit
 * starts again from the default framing — which is a slightly different size
 * every time you come back. This saves the orbit camera (position + target)
 * whenever it moves and puts it back on mount.
 *
 * Stored in sessionStorage: it survives tab switches and reloads, but a new
 * browser tab starts from the default framing rather than from wherever some
 * other design was last looked at.
 *
 * Place it INSIDE the Canvas, AFTER anything else that frames the camera on
 * mount (sibling effects run in tree order, so the later one wins).
 */

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';

type Saved = { p: [number, number, number]; t: [number, number, number] };
type Controls = THREE.EventDispatcher<{ change: object }> & { target: THREE.Vector3; update: () => void };

const KEY = (id: string) => `vasemaker-camera-${id}`;

function load(id: string): Saved | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY(id)) ?? 'null');
    const ok = (a: unknown) => Array.isArray(a) && a.length === 3 && a.every((n) => Number.isFinite(n));
    return v && ok(v.p) && ok(v.t) ? v : null;
  } catch { return null; }
}

export function RememberCamera({ id }: { id: string }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const restored = useRef(false);

  useEffect(() => {
    // Wait for OrbitControls to register, or its own target prop would win.
    if (!controls) return;
    if (!restored.current) {
      restored.current = true;
      const s = load(id);
      if (s) {
        camera.position.set(...s.p);
        controls.target.set(...s.t);
        camera.lookAt(controls.target);
        controls.update();
      }
    }
    const save = () => {
      const p = camera.position, t = controls.target;
      try {
        sessionStorage.setItem(KEY(id), JSON.stringify({ p: [p.x, p.y, p.z], t: [t.x, t.y, t.z] }));
      } catch { /* storage unavailable — the view just isn't remembered */ }
    };
    controls.addEventListener('change', save);
    return () => controls.removeEventListener('change', save);
  }, [camera, controls, id]);

  return null;
}
