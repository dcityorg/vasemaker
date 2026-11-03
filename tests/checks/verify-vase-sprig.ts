/**
 * The Sprig texture (engine/sprig/vase-sprig.ts), 2026-10-28.
 *  A. off / no field / textures off: the mesh is byte-identical to no sprig;
 *  B. raised: the wall at the sprig's centre stands out by Height; far from it,
 *     unchanged; pressed: sunk by Depth;
 *  C. placement agrees with the On Vase preview (wrapSprig): the preview's
 *     centre cell lands on the vase point the texture raises most;
 *  D. Copies 3: three bumps 120° apart; Tilt 90 turns a tall bar sideways;
 *  E. notes: off the top, too many copies, pressed through a thin wall with
 *     Smooth Inner; CONTROL: none for a sensible placement;
 *  F. the molds keep it, grown by Shrink (prepareVaseParams): bump and reach
 *     ×1.12 (CONTROL: the unscaled numbers fail); Pour 3-Pc flags undercuts
 *     with it and not without; Split Halves / Thirds clean at a piece centre
 *     and on a seam, red in between.
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-vase-sprig.ts
 */
import { generateMesh } from '@/engine/mesh-generator';
import { setVaseSprigField, vaseSprigNotes } from '@/engine/sprig/vase-sprig';
import { buildRelief, type SprigSource } from '@/engine/sprig/relief';
import { DEFAULT_SPRIG_PARAMETERS, type SprigParameters } from '@/engine/sprig/sprig-types';
import { buildVaseSurface, wrapSprig } from '@/engine/sprig/on-vase';
import { prepareVaseParams } from '@/engine/mold/mold-generator';
import { DEFAULT_MOLD_PARAMETERS } from '@/engine/mold/mold-types';
import { generatePourThreePieceMold } from '@/engine/mold/pour-three-piece-generator';
import { generateSplitHalvesMold } from '@/engine/mold/split-halves-generator';
import { generateSplitThirdsMold } from '@/engine/mold/split-thirds-generator';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import type { VaseParameters, VaseMesh } from '@/engine/types';

let ok = true, passes = 0;
const check = (c: boolean, m: string) => { if (c) { passes++; console.log(`PASS  ${m}`); } else { ok = false; console.log(`FAIL  ${m}`); } };

function image(w: number, h: number, ink: (x: number, y: number) => number): SprigSource {
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = Math.round(255 * (1 - ink(x + 0.5, y + 0.5)));
  return { pixels: px, width: w, height: h };
}
const disc = image(200, 200, (x, y) => (Math.hypot(x - 100, y - 100) < 99 ? 1 : 0));
const bar = image(40, 200, () => 1); // tall bar, 1:5
const sp: SprigParameters = { ...DEFAULT_SPRIG_PARAMETERS, width: 20, length: 20, heightMode: 'flat', maxHeight: 2, edgeSoftness: 0 };
const discField = buildRelief(disc, sp, 0.2);
const barSp = { ...sp, width: 8, length: 40 };
const barField = buildRelief(bar, barSp, 0.2);

const vase = (over: Partial<NonNullable<VaseParameters['textures']['sprig']>> = {}, extra: Partial<VaseParameters> = {}): VaseParameters => {
  const p: VaseParameters = JSON.parse(JSON.stringify({ ...DEFAULT_PARAMETERS, profileEnabled: false, ...extra }));
  p.textures.enabled = true;
  p.textures.sprig = { ...p.textures.sprig!, enabled: true, sprig: sp, sprigName: 'disc', depth: 2, heightPct: 50, angle: -90, ...over };
  return p;
};
const bytes = (m: VaseMesh) => Buffer.from(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength);

/** Same vertex order with and without the sprig, so the bump at a vertex is
 *  its radius difference. Vertex nearest (z, angle°) on the OUTER wall (the
 *  largest-radius one of those close to it). */
const rad = (m: VaseMesh, i: number) => Math.hypot(m.positions[i * 3], m.positions[i * 3 + 1]);
let plainRef: VaseMesh;
function bumpNear(m: VaseMesh, z: number, angDeg: number): number {
  const a = (angDeg * Math.PI) / 180;
  let best = Infinity, k = -1;
  for (let i = 0; i < m.vertexCount; i++) {
    const x = plainRef.positions[i * 3], y = plainRef.positions[i * 3 + 1];
    const da = Math.abs(Math.atan2(Math.sin(Math.atan2(y, x) - a), Math.cos(Math.atan2(y, x) - a)));
    const d = Math.abs(plainRef.positions[i * 3 + 2] - z) * 3 + da * 40 - rad(plainRef, i) * 1e-3;
    if (d < best) { best = d; k = i; }
  }
  return rad(m, k) - rad(plainRef, k);
}
/** Vertex with the biggest bump: its angle and height. */
function peak(m: VaseMesh): { ang: number; z: number; h: number } {
  let h = 0, k = 0;
  for (let i = 0; i < m.vertexCount; i++) { const b = rad(m, i) - rad(plainRef, i); if (b > h) { h = b; k = i; } }
  return { ang: (Math.atan2(m.positions[k * 3 + 1], m.positions[k * 3]) * 180) / Math.PI, z: m.positions[k * 3 + 2], h };
}

// A
setVaseSprigField(null);
const plain = generateMesh({ ...vase(), textures: { ...vase().textures, sprig: { ...vase().textures.sprig!, enabled: false } } });
plainRef = plain;
check(bytes(generateMesh(vase())).equals(bytes(plain)), 'A: no relief field → identical to no sprig');
setVaseSprigField(discField);
check(bytes(generateMesh({ ...vase(), textures: { ...vase().textures, sprig: { ...vase().textures.sprig!, enabled: false } } })).equals(bytes(plain)), 'A: texture off → identical');
const texOff = vase(); texOff.textures.enabled = false;
const plainTexOff = vase(); plainTexOff.textures.enabled = false; plainTexOff.textures.sprig!.enabled = false;
check(bytes(generateMesh(texOff)).equals(bytes(generateMesh(plainTexOff))), 'A: Textures master off → identical');

// B
const H = DEFAULT_PARAMETERS.height, R0 = DEFAULT_PARAMETERS.radius;
const raised = generateMesh(vase());
check(Math.abs(bumpNear(raised, H / 2, -90) - 2) < 0.05, `B: raised centre stands out ${bumpNear(raised, H / 2, -90).toFixed(3)} mm (Height 2)`);
check(Math.abs(bumpNear(raised, H / 2, 90)) < 1e-6, 'B: opposite side unchanged');
const pressed = generateMesh(vase({ style: 'pressed', depth: 0.5 }));
check(Math.abs(bumpNear(pressed, H / 2, -90) + 0.5) < 0.05, `B: pressed centre sunk ${(-bumpNear(pressed, H / 2, -90)).toFixed(3)} mm (Depth 0.5)`);
const big = generateMesh(vase({ size: 200 }));
// The 20 mm disc reaches 10 mm up; at 200 % it reaches 20.
check(bumpNear(raised, H / 2 + 15, -90) < 0.05 && bumpNear(big, H / 2 + 15, -90) > 1.9, 'B: Size 200 % reaches 15 mm up where 100 % does not');

// C: preview vs texture
{
  const p = vase({ angle: 30, heightPct: 40, tilt: 0 });
  const surf = buildVaseSurface({ ...p, textures: { ...p.textures, sprig: { ...p.textures.sprig!, enabled: false } } });
  const w = wrapSprig(surf, discField, { heightPct: 40, angle: 30, tilt: 0, copies: 1 });
  let cx = 0, cy = 0, cz = 0, n = 0;
  const mp = w.mesh!;
  for (let i = 0; i < mp.vertexCount; i++) { cx += mp.positions[i * 3]; cy += mp.positions[i * 3 + 1]; cz += mp.positions[i * 3 + 2]; n++; }
  cx /= n; cy /= n; cz /= n;
  // The disc is flat-topped, so take the middle of the raised patch, not one vertex.
  const tex = generateMesh(p);
  let sx = 0, sy = 0, sz = 0, sn = 0;
  for (let i = 0; i < tex.vertexCount; i++) if (rad(tex, i) - rad(plainRef, i) > 1.9) { sx += tex.positions[i * 3]; sy += tex.positions[i * 3 + 1]; sz += tex.positions[i * 3 + 2]; sn++; }
  const angTex = (Math.atan2(sy / sn, sx / sn) * 180) / Math.PI, angPrev = (Math.atan2(cy, cx) * 180) / Math.PI;
  check(Math.abs(angTex - angPrev) < 1 && Math.abs(sz / sn - cz) < 0.6, `C: texture patch centre ${angTex.toFixed(1)}° z ${(sz / sn).toFixed(1)}; preview ${angPrev.toFixed(1)}° z ${cz.toFixed(1)}`);
  void peak;
}

// D
{
  const m = generateMesh(vase({ copies: 3, angle: 0 }));
  const bumps = [0, 120, -120].map((a) => bumpNear(m, H / 2, a));
  const between = bumpNear(m, H / 2, 60);
  check(bumps.every((b) => Math.abs(b - 2) < 0.05) && Math.abs(between) < 1e-6, `D: copies 3 → bumps ${bumps.map((b) => b.toFixed(2)).join(', ')} at 0/120/240°, ${between.toFixed(2)} at 60°`);
  setVaseSprigField(barField);
  const upright = generateMesh(vase({ sprig: barSp, angle: 0 })), turned = generateMesh(vase({ sprig: barSp, angle: 0, tilt: 90 }));
  const side = ((15 / R0) * 180) / Math.PI; // about 15 mm round
  const u15 = bumpNear(upright, H / 2 + 15, 0), s15 = bumpNear(upright, H / 2, side);
  const t15 = bumpNear(turned, H / 2 + 15, 0), ts15 = bumpNear(turned, H / 2, side);
  check(u15 > 1.9 && s15 < 0.05 && t15 < 0.05 && ts15 > 1.9, `D: a 8 × 40 bar: upright reaches 15 mm up (${u15.toFixed(2)}) not round (${s15.toFixed(2)}); Tilt 90 the other way (${t15.toFixed(2)}, ${ts15.toFixed(2)})`);
  setVaseSprigField(discField);
}

// C2: Tilt 30 on the bar — the top end of the bar lands where the preview's does
{
  setVaseSprigField(barField);
  const p = vase({ sprig: barSp, angle: 0, heightPct: 50, tilt: 30 });
  const surf = buildVaseSurface({ ...p, textures: { ...p.textures, sprig: { ...p.textures.sprig!, enabled: false } } });
  const mp = wrapSprig(surf, barField, { heightPct: 50, angle: 0, tilt: 30, copies: 1 }).mesh!;
  let pz = -Infinity, pa = 0;
  for (let i = 0; i < mp.vertexCount; i++) if (mp.positions[i * 3 + 2] > pz) { pz = mp.positions[i * 3 + 2]; pa = (Math.atan2(mp.positions[i * 3 + 1], mp.positions[i * 3]) * 180) / Math.PI; }
  const tex = generateMesh(p);
  let tz = -Infinity, ta = 0;
  for (let i = 0; i < tex.vertexCount; i++) if (rad(tex, i) - rad(plainRef, i) > 1 && tex.positions[i * 3 + 2] > tz) { tz = tex.positions[i * 3 + 2]; ta = (Math.atan2(tex.positions[i * 3 + 1], tex.positions[i * 3]) * 180) / Math.PI; }
  check(Math.abs(ta - pa) < 2.5 && Math.abs(tz - pz) < 1.5 && Math.abs(pa) > 5, `C2: Tilt 30 bar top: texture ${ta.toFixed(1)}° z ${tz.toFixed(1)}, preview ${pa.toFixed(1)}° z ${pz.toFixed(1)}`);
  setVaseSprigField(discField);
}

// E
{
  const top = vaseSprigNotes(vase({ heightPct: 99 }));
  const crowd = vaseSprigNotes(vase({ copies: 12, size: 300 }));
  const thin = vaseSprigNotes(vase({ style: 'pressed', depth: 2 }, { smoothInner: true, wallThickness: 2 }));
  const fine = vaseSprigNotes(vase());
  const pressOk = vaseSprigNotes(vase({ style: 'pressed', depth: 1 }, { smoothInner: true, wallThickness: 3 }));
  check(top.some((n) => n.startsWith('Part of the sprig hangs')), 'E: Height 99 % → hangs off the top');
  check(crowd.some((n) => n.includes('overlap')), 'E: 12 copies at 300 % → overlap');
  check(thin.some((n) => n.startsWith('Pressed in 2 mm into a 2 mm wall')), 'E: pressed 2 into a 2 mm wall with Smooth Inner → warning');
  check(fine.length === 0 && pressOk.length === 0, 'E: CONTROL: a sensible placement, and pressed 1 into 3 mm, give no notes');
}

// F: the molds keep it, scaled for shrink
{
  const S = 1.12;
  const mp = prepareVaseParams(vase(), S, true);
  const mpOff = prepareVaseParams(vase({ enabled: false }), S, true);
  check(mp.textures.sprig?.enabled === true, 'F: the molds keep the Sprig texture on');
  const saved = plainRef;
  plainRef = generateMesh(mpOff);
  const m = generateMesh(mp);
  const c = bumpNear(m, (H * S) / 2, -90);
  check(Math.abs(c - 2 * S) < 0.05 && Math.abs(c - 2) > 0.15, `F: stands out ${c.toFixed(3)} mm on the master = 2 × ${S} (CONTROL: not the unscaled 2)`);
  // The 20 mm disc reaches 10 mm up; grown ×1.12 it reaches 11.2.
  const at = (dz: number) => bumpNear(m, (H * S) / 2 + dz, -90);
  check(at(10.6) > 1 && at(11.8) < 0.05, `F: reaches 11.2 mm up (${at(10.6).toFixed(2)} at 10.6, ${at(11.8).toFixed(2)} at 11.8)`);
  plainRef = saved;

  // Undercuts: a soft dome, the shape a real sprig has.
  const domeSp: SprigParameters = { ...sp, heightMode: 'inflate' };
  setVaseSprigField(buildRelief(disc, domeSp, 0.2));
  const dv = (angle: number, on = true) => vase({ sprig: domeSp, angle, enabled: on });
  const halves = { ...DEFAULT_MOLD_PARAMETERS, moldStyle: 'splitHalves' as const };
  const thirds = { ...DEFAULT_MOLD_PARAMETERS, moldStyle: 'splitThirds' as const };
  check(generatePourThreePieceMold(dv(-90), DEFAULT_MOLD_PARAMETERS).hasUndercuts
    && !generatePourThreePieceMold(dv(-90, false), DEFAULT_MOLD_PARAMETERS).hasUndercuts, 'F: Pour 3-Pc: undercuts with the sprig, none without (CONTROL)');
  check(!generateSplitHalvesMold(dv(90), halves, null).hasUndercuts && !generateSplitHalvesMold(dv(0), halves, null).hasUndercuts
    && generateSplitHalvesMold(dv(30), halves, null).hasUndercuts, 'F: Split Halves: clean at a piece centre and on the seam, red at 30°');
  check(!generateSplitThirdsMold(dv(60), thirds).hasUndercuts && !generateSplitThirdsMold(dv(0), thirds).hasUndercuts
    && generateSplitThirdsMold(dv(30), thirds).hasUndercuts, 'F: Split Thirds: clean at a piece centre and on a seam, red at 30°');
  setVaseSprigField(discField);
}

console.log(`\n${ok ? 'ALL PASS' : 'SOME CHECKS FAILED'} (${passes} passed)`);
process.exit(ok ? 0 : 1);
