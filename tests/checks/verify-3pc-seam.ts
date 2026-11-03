/**
 * Geometry probe for the aligned-V Pour 3-Pc seam (2026-07-30).
 *
 * Default circular vase, seamAngle 0 → the seam plane at station 0 is y = 0 and
 * the tangential offset w maps to y exactly: shellA (ridge end) sits at y < 0,
 * shellB (groove end) at y > 0. Asserts:
 *   1. ridge tips cross the seam by vh − clearance, grooves recede by vh + clr
 *   2. ridge tip and groove apex never collide (positive clearance)
 *   3. vertical V radii == ring-groove radii  ← the whole point of the change
 *   4. the Vs run from the ring-groove apex height up to the wall top
 *   5. the swept arc keeps clear of the seam plane
 */
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { DEFAULT_MOLD_PARAMETERS } from '@/engine/mold/mold-types';
import { generatePourThreePieceMold } from '@/engine/mold/pour-three-piece-generator';

const vase = structuredClone(DEFAULT_PARAMETERS);
const mold = structuredClone(DEFAULT_MOLD_PARAMETERS);
const m = generatePourThreePieceMold(vase, mold);

const ffT = mold.footFlangeThickness;
const clr = mold.notchClearance;
const vh = Math.max(0.3, Math.min(mold.notchHeight, ffT - 0.6 - clr));
const gd = Math.min(vh + clr, ffT - 0.6);
const SEAM_CLEARANCE = 0.1;
const zB = ffT;

/**
 * Vertices on the station-0 seam FACE, as [x, y, z]. The seam plane is y = 0 and
 * x > 0 there. `lo`/`hi` bound y tightly enough to exclude the swept arc, whose
 * nearest vertices sit `drop` stations away (≥ ~2 mm at the default resolution).
 */
function seamFace(mesh: { positions: Float32Array; vertexCount: number }, lo: number, hi: number) {
  const out: [number, number, number][] = [];
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = mesh.positions[i * 3], y = mesh.positions[i * 3 + 1], z = mesh.positions[i * 3 + 2];
    if (x > 0 && y >= lo && y <= hi) out.push([x, y, z]);
  }
  return out;
}

/** Cluster a sorted list of numbers with a tolerance, returning cluster means. */
function cluster(vals: number[], tol = 0.15): number[] {
  const s = [...vals].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of s) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1] <= tol) g.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
}

let ok = true;
const say = (pass: boolean, msg: string) => { if (!pass) ok = false; console.log(`${pass ? 'PASS' : 'FAIL'}  ${msg}`); };

// shellA meets the station-0 seam with its RIDGE end (material at y < 0, ridges
// poking to y > 0); shellB meets it with its GROOVE end (material at y > 0).
// Bounds are derived, not hardcoded — they move with the V dimensions.
const grooveApex = SEAM_CLEARANCE + vh + clr;
const A = seamFace(m.shellA, -0.15, 99);
const B = seamFace(m.shellB, 0, grooveApex + 0.05);

// 1. Extremes across the seam plane.
const aMaxY = Math.max(...A.map((p) => p[1]));
const bMaxY = Math.max(...B.map((p) => p[1]));
const bMinY = Math.min(...B.map((p) => p[1]));
say(Math.abs(aMaxY - (vh - SEAM_CLEARANCE)) < 1e-3,
  `ridge tip crosses seam by ${aMaxY.toFixed(3)} mm (expect ${(vh - SEAM_CLEARANCE).toFixed(3)})`);
say(Math.abs(bMaxY - (SEAM_CLEARANCE + vh + clr)) < 1e-3,
  `groove apex recedes to ${bMaxY.toFixed(3)} mm (expect ${(SEAM_CLEARANCE + vh + clr).toFixed(3)})`);
say(Math.abs(bMinY - SEAM_CLEARANCE) < 1e-3,
  `groove-half seam face sits at ${bMinY.toFixed(3)} mm (expect ${SEAM_CLEARANCE})`);

// 2. Ridge-vs-groove clearance (both measured from the seam plane, same side).
say(bMaxY - aMaxY > 0.05, `ridge/groove clearance at the apex = ${(bMaxY - aMaxY).toFixed(3)} mm`);

// 3. Alignment: vertical-V radii vs ring-groove radii, on the SAME part.
//    Compared at the bottom — the corner where the two barriers meet. Higher up
//    the Vs lean inward with the drafted wall, which is intended.
const isTip = (p: [number, number, number]) => p[1] > vh - SEAM_CLEARANCE - 0.01;
const atCorner = (p: [number, number, number]) => Math.abs(p[2] - (zB + gd)) < 1e-3;
const vRadii = cluster(A.filter((p) => isTip(p) && atCorner(p)).map((p) => p[0]));
const ringRadii = cluster(A.filter(atCorner).map((p) => p[0]));
say(vRadii.length === 3, `3 vertical Vs found at x = ${vRadii.map((v) => v.toFixed(2)).join(', ')}`);
say(ringRadii.length === 3, `3 ring grooves found at x = ${ringRadii.map((v) => v.toFixed(2)).join(', ')}`);
say(vRadii.length === ringRadii.length && vRadii.every((v, i) => Math.abs(v - ringRadii[i]) < 1e-3),
  'vertical Vs are at the SAME radii as the ring grooves');

// 4. Vertical extent of the Vs: from the ring-groove apex up to the wall top.
const tipZ = A.filter((p) => p[1] > vh - SEAM_CLEARANCE - 0.01).map((p) => p[2]);
const zTop = Math.max(...A.map((p) => p[2]));
say(Math.abs(Math.min(...tipZ) - (zB + gd)) < 1e-3,
  `V ridge starts at z = ${Math.min(...tipZ).toFixed(3)} (ring-groove apex ${(zB + gd).toFixed(3)})`);
say(Math.abs(Math.max(...tipZ) - zTop) < 1e-3, `V ridge runs to the wall top z = ${zTop.toFixed(2)}`);

// 5. Shell bottom sits on the center flange.
say(Math.abs(Math.min(...A.map((p) => p[2])) - zB) < 1e-6, `shell bottom at z = ${zB}`);

// 6. The swept arc keeps clear of the seam plane: on shellB (whose grooves recede
//    to +1.3 at the seam) nothing may sit between the groove apex and the arc.
const seamKeepOut = SEAM_CLEARANCE + vh + clr + 0.4;
const arcNear = Math.min(...seamFace(m.shellB, grooveApex + 0.05, 99).map((p) => p[1]));
say(arcNear >= seamKeepOut - 1e-6,
  `nearest swept-arc material to the seam plane = ${arcNear.toFixed(3)} mm (needs ≥ ${seamKeepOut.toFixed(2)})`);

console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
process.exit(ok ? 0 : 1);
