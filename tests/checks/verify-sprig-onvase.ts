/**
 * SprigMaker On Vase preview (engine/sprig/on-vase.ts): the wrap on a plain
 * cylinder where every point is known (arc length round, height up, relief
 * standing off the wall), Angle/Repeat/Tilt, the overlap and off-vase
 * warnings, drape on fluting, twist, and the handle placement — with
 * negative controls. Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-sprig-onvase.ts
 */
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { buildVaseSurface, wrapSprig, handleOnVase } from '@/engine/sprig/on-vase';
import { computeRowContexts, computeVertex, precomputeTextureTables } from '@/engine/surfaces';
import { mergeHandleParameters, DEFAULT_HANDLE_PARAMETERS } from '@/engine/handle/handle-types';
import type { VaseParameters } from '@/engine/types';
import type { ReliefField } from '@/engine/sprig/relief';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

// A 41×41-cell relief, step 0.5 mm: flat 2 mm square in the middle (cells 10..30), zero border.
function relief(): ReliefField {
  const nx = 41, ny = 41, step = 0.5;
  const heights = new Float32Array(nx * ny);
  for (let j = 10; j <= 30; j++) for (let i = 10; i <= 30; i++) heights[j * nx + i] = 2;
  return { nx, ny, step, x0: -10, y0: -10, heights, footW: 20, footL: 20 } as unknown as ReliefField;
}

const R = 40, H = 120;
const cyl: VaseParameters = {
  ...DEFAULT_PARAMETERS, radius: R, height: H, profileEnabled: false, morphEnabled: false,
  bottomShape: 'Circle1', textures: { ...DEFAULT_PARAMETERS.textures, enabled: false },
  bezierTwist: { ...DEFAULT_PARAMETERS.bezierTwist, enabled: false }, sineTwist: { ...DEFAULT_PARAMETERS.sineTwist, enabled: false },
  bezierOffset: { ...DEFAULT_PARAMETERS.bezierOffset, enabled: false }, fixedOffset: { x: 0, y: 0 },
  resolution: { vertical: 240, radial: 360 },
} as VaseParameters;

// Find the output vertex nearest a target and report its radius/angle/z.
function stats(pos: Float32Array) {
  let rMin = Infinity, rMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const r = Math.hypot(pos[i], pos[i + 1]);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    zMin = Math.min(zMin, pos[i + 2]); zMax = Math.max(zMax, pos[i + 2]);
  }
  return { rMin, rMax, zMin, zMax };
}
const angOf = (pos: Float32Array, i: number) => Math.atan2(pos[i + 1], pos[i]) * 180 / Math.PI;

const s = buildVaseSurface(cyl);
const rel = relief();
{
  const out = wrapSprig(s, rel, { heightPct: 50, angle: 0, tilt: 0, copies: 1 });
  const m = out.mesh!;
  const st = stats(m.positions);
  check(Math.abs(st.rMin - (R - 0.1)) < 0.02, `zero-height edge tucked just under the wall: min radius ${st.rMin.toFixed(3)} (want ${R - 0.1})`);
  check(Math.abs(st.rMax - (R + 2)) < 0.02, `2 mm relief stands 2 mm off the wall: max radius ${st.rMax.toFixed(3)} (want ${R + 2})`);
  // Raised square spans x,y = -5..5 mm → z 55..65 and angle ±(5/R) rad.
  let zr0 = Infinity, zr1 = -Infinity, a0 = Infinity, a1 = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    if (Math.hypot(m.positions[i], m.positions[i + 1]) > R + 1) {
      zr0 = Math.min(zr0, m.positions[i + 2]); zr1 = Math.max(zr1, m.positions[i + 2]);
      a0 = Math.min(a0, angOf(m.positions, i)); a1 = Math.max(a1, angOf(m.positions, i));
    }
  }
  check(Math.abs(zr0 - 55) < 0.3 && Math.abs(zr1 - 65) < 0.3, `up = height on a straight wall: raised part z ${zr0.toFixed(2)}…${zr1.toFixed(2)} (want 55…65)`);
  const want = (5 / R) * 180 / Math.PI;
  check(Math.abs(a1 - want) < 0.3 && Math.abs(a0 + want) < 0.3, `across = arc length: raised part ±${a1.toFixed(2)}° (want ±${want.toFixed(2)}°)`);
  check(!out.offVase && !out.overlap, 'no off-vase / overlap warnings at mid height');
}
{
  // The outline's antialias ring (tiny heights just outside the edge) must not
  // show as a skin-thick skirt on the vase (Gary saw one at Edge Lip 0).
  const r3 = relief();
  for (let i = 9; i <= 31; i++) for (const j of [9, 31]) { r3.heights[j * r3.nx + i] = 0.04; r3.heights[i * r3.nx + j] = 0.04; }
  const m = wrapSprig(s, r3, { heightPct: 50, angle: 0, tilt: 0, copies: 1 }).mesh!;
  let ringMax = -Infinity, topMax = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    const r = Math.hypot(m.positions[i], m.positions[i + 1]);
    if (r < R + 1) ringMax = Math.max(ringMax, r); else topMax = Math.max(topMax, r);
  }
  check(ringMax <= R + 0.001, `0.04 mm ring stays at/below the vase skin (max radius ${ringMax.toFixed(3)})`);
  check(Math.abs(topMax - (R + 2)) < 0.02, `CONTROL: the 2 mm relief beside it is drawn at full height (${topMax.toFixed(3)})`);
}
{
  // Negative control for the arc-length check: on a vase twice as wide the same sprig spans half the angle.
  const s2 = buildVaseSurface({ ...cyl, radius: 2 * R });
  const m = wrapSprig(s2, rel, { heightPct: 50, angle: 0, tilt: 0, copies: 1 }).mesh!;
  let a1 = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) if (Math.hypot(m.positions[i], m.positions[i + 1]) > 2 * R + 1) a1 = Math.max(a1, angOf(m.positions, i));
  check(Math.abs(a1 - (5 / (2 * R)) * 180 / Math.PI) < 0.2, `CONTROL: on a ${2 * R} mm-radius vase it spans ±${a1.toFixed(2)}° (half)`);
}
{
  const m = wrapSprig(s, rel, { heightPct: 50, angle: 90, tilt: 0, copies: 1 }).mesh!;
  let sa = 0, n = 0;
  for (let i = 0; i < m.positions.length; i += 3) { sa += angOf(m.positions, i); n++; }
  check(Math.abs(sa / n - 90) < 0.5, `Angle Around 90 puts it at ${(sa / n).toFixed(2)}°`);
}
{
  const out = wrapSprig(s, rel, { heightPct: 50, angle: 0, tilt: 0, copies: 3 });
  const m = out.mesh!;
  const bins = [0, 0, 0];
  for (let i = 0; i < m.positions.length; i += 3) {
    const a = ((angOf(m.positions, i) % 360) + 360) % 360;
    for (const [k, c] of [0, 120, 240].entries()) if (Math.abs(((a - c + 540) % 360) - 180) < 20) bins[k]++;
  }
  check(bins.every((b) => b > 0) && Math.max(...bins) - Math.min(...bins) <= 2, `Repeat 3 → copies at 0/120/240°: ${bins.join(' / ')} vertices`);
  const many = wrapSprig(s, rel, { heightPct: 50, angle: 0, tilt: 0, copies: 13 });
  check(many.overlap, `13 copies of a 20 mm sprig round a ${(2 * Math.PI * R).toFixed(0)} mm perimeter → overlap warning`);
  check(!out.overlap, 'CONTROL: 3 copies → no overlap warning');
}
{
  const top = wrapSprig(s, rel, { heightPct: 100, angle: 0, tilt: 0, copies: 1 });
  check(top.offVase, 'centred at the rim → off-vase warning');
}
{
  // Tilt 90 (clockwise from outside): the relief's +x (right) goes DOWN. Use an asymmetric relief: a bump only at x>0.
  const r2 = relief();
  r2.heights.fill(0);
  for (let j = 18; j <= 22; j++) for (let i = 30; i <= 36; i++) r2.heights[j * r2.nx + i] = 2; // x = 5..8 mm, y ≈ 0
  const flat = wrapSprig(s, r2, { heightPct: 50, angle: 0, tilt: 0, copies: 1 }).mesh!;
  const tilted = wrapSprig(s, r2, { heightPct: 50, angle: 0, tilt: 90, copies: 1 }).mesh!;
  const bump = (m: typeof flat) => { let z = 0, a = 0, n = 0; for (let i = 0; i < m.positions.length; i += 3) if (Math.hypot(m.positions[i], m.positions[i + 1]) > R + 1) { z += m.positions[i + 2]; a += angOf(m.positions, i); n++; } return { z: z / n, a: a / n }; };
  const b0 = bump(flat), b1 = bump(tilted);
  check(b0.a > 5 && Math.abs(b0.z - 60) < 1, `untilted: bump to the right (+${b0.a.toFixed(1)}°) at mid height (z ${b0.z.toFixed(1)})`);
  check(Math.abs(b1.a) < 1 && b1.z < 54, `tilt 90 clockwise: bump straight below (z ${b1.z.toFixed(1)}, ${b1.a.toFixed(1)}°)`);
}
{
  // Drape on fluting: the zero-height edge follows the TEXTURED radius.
  const flute: VaseParameters = { ...cyl, textures: { ...cyl.textures, enabled: true, fluting: { ...DEFAULT_PARAMETERS.textures.fluting, enabled: true, count: 24, depth: 2 } } } as VaseParameters;
  const sf = buildVaseSurface(flute);
  const m = wrapSprig(sf, rel, { heightPct: 50, angle: 0, tilt: 0, copies: 1 }).mesh!;
  const st = stats(m.positions);
  check(st.rMax - st.rMin > 3, `on fluting the sprig's radius varies ${(st.rMax - st.rMin).toFixed(2)} mm (2 mm relief + flute bulge)`);
  // Compare one zero-height vertex with the textured surface there.
  const { simplexPerm, woodGrainPerm } = precomputeTextureTables(flute, true);
  const rows = computeRowContexts(flute, 240, 360);
  let worst = 0, n = 0;
  for (let i = 0; i < m.positions.length; i += 3) {
    const z = m.positions[i + 2], a = ((angOf(m.positions, i) % 360) + 360) % 360;
    const rr = Math.round((z / H) * 240), ts = Math.round((a / 360) * 360) % 360;
    const [sx, sy] = computeVertex(rows[rr], ts, 0, undefined, flute, 360, true, simplexPerm, woodGrainPerm);
    const surfR = Math.hypot(sx, sy), r = Math.hypot(m.positions[i], m.positions[i + 1]);
    if (r - surfR < 1) { worst = Math.max(worst, Math.abs(r - surfR + 0.1)); n++; }
  }
  check(n > 50 && worst < 0.3, `edge vertices sit on the fluted surface (worst ${worst.toFixed(3)} mm over ${n})`);
}
{
  // Twist: sprig stays at the world angle asked for.
  const tw: VaseParameters = { ...cyl, bezierTwist: { ...DEFAULT_PARAMETERS.bezierTwist, enabled: true, points: [[0, 0], [90, 1]], pointTypes: ['fixed', 'fixed'] } } as VaseParameters;
  const stw = buildVaseSurface(tw);
  const m = wrapSprig(stw, rel, { heightPct: 50, angle: 0, tilt: 0, copies: 1 }).mesh!;
  let sa = 0, n = 0;
  for (let i = 0; i < m.positions.length; i += 3) { sa += angOf(m.positions, i); n++; }
  check(Math.abs(sa / n) < 0.5, `twisted vase (45° at mid height): sprig still centred at ${(sa / n).toFixed(2)}°`);
}
{
  const vase = { ...DEFAULT_PARAMETERS, height: 140 } as VaseParameters;
  const short = handleOnVase({ ...DEFAULT_PARAMETERS, height: 90 } as VaseParameters, mergeHandleParameters(DEFAULT_HANDLE_PARAMETERS), 180, 20);
  check(typeof short === "string", `CONTROL: a 90 mm vase is too short for the 84 mm handle → message`);
  const h = handleOnVase(vase, mergeHandleParameters(DEFAULT_HANDLE_PARAMETERS), 180, 20);
  if (typeof h === 'string') check(false, `handle on the default vase: ${h}`);
  else {
    let ax = 0, n = 0, zMax = -Infinity, rMax = 0;
    for (let i = 0; i < h.positions.length; i += 3) { ax += h.positions[i]; n++; zMax = Math.max(zMax, h.positions[i + 2]); rMax = Math.max(rMax, Math.hypot(h.positions[i], h.positions[i + 1])); }
    check(ax / n < 0, `handle at 180° sits on the −x side (mean x ${(ax / n).toFixed(1)})`);
    check(zMax <= vase.height, `handle stays below the rim (top ${zMax.toFixed(1)} of ${vase.height})`);
    check(rMax > vase.radius + 20, `handle stands out from the wall (reaches r ${rMax.toFixed(1)})`);
  }
}
{
  // The handle's buried ends stay inside the wall (Gary saw one come through the
  // inside). Cylinder R 40, wall 3: nothing deeper than mid-wall (r < 38.5).
  const mug: VaseParameters = { ...cyl, height: 120, wallThickness: 3 } as VaseParameters;
  const h = handleOnVase(mug, mergeHandleParameters(DEFAULT_HANDLE_PARAMETERS), 0, 15);
  if (typeof h === 'string') check(false, `handle on the test mug: ${h}`);
  else {
    let rMin = Infinity, atFloor = 0;
    for (let i = 0; i < h.positions.length; i += 3) {
      const r = Math.hypot(h.positions[i], h.positions[i + 1]);
      rMin = Math.min(rMin, r);
      if (Math.abs(r - 38.5) < 0.02) atFloor++;
    }
    check(rMin >= 38.5 - 0.02, `handle never deeper than mid-wall: min radius ${rMin.toFixed(3)} (floor 38.5; inner wall 37)`);
    check(atFloor > 0, `CONTROL: ${atFloor} handle points were pulled back to mid-wall — without the limit they went deeper`);
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
