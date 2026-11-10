/**
 * Seam lines and the sprig's snap buttons (engine/mold/seams.ts), 2026-11-09.
 *  A. the angles: seams and piece centres for Halves and Thirds at a Seam
 *     Angle that is not 0, the nearest one found across ±180, and the Seam
 *     view button's next seam round;
 *  B. a seam line lies in its vertical plane through the base centre, on the
 *     vase's outer wall (against generateMesh, on a fluted vase), and `out`
 *     lifts it by exactly that;
 *  C. the headline, against the real generators at Seam Angle 25: a domed
 *     sprig snapped to a piece centre or a seam gives no undercuts; CONTROL:
 *     30° off the snapped centre does, and so does where Seam Angle 0 would
 *     put a seam (Halves) or a centre (Thirds) — the Mold page's angle counts.
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-seams.ts
 */
import { seamAngles, pieceCentreAngles, nearestAngle, nextSeam, seamLinesOnVase, wrapAngle } from '@/engine/mold/seams';
import { generateMesh } from '@/engine/mesh-generator';
import { setVaseSprigField } from '@/engine/sprig/vase-sprig';
import { buildRelief, type SprigSource } from '@/engine/sprig/relief';
import { DEFAULT_SPRIG_PARAMETERS, type SprigParameters } from '@/engine/sprig/sprig-types';
import { DEFAULT_MOLD_PARAMETERS } from '@/engine/mold/mold-types';
import { generateSplitHalvesMold } from '@/engine/mold/split-halves-generator';
import { generateSplitThirdsMold } from '@/engine/mold/split-thirds-generator';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import type { VaseParameters } from '@/engine/types';

let ok = true, passes = 0;
const check = (c: boolean, m: string) => { if (c) { passes++; console.log(`PASS  ${m}`); } else { ok = false; console.log(`FAIL  ${m}`); } };
const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9);

// A
check(same(seamAngles('halves', 25), [25, -155]) && same(pieceCentreAngles('halves', 25), [115, -65]),
  `A: Halves at 25°: seams ${seamAngles('halves', 25)}, centres ${pieceCentreAngles('halves', 25)}`);
check(same(seamAngles('thirds', 25), [25, 145, -95]) && same(pieceCentreAngles('thirds', 25), [85, -155, -35]),
  `A: Thirds at 25°: seams ${seamAngles('thirds', 25)}, centres ${pieceCentreAngles('thirds', 25)}`);
check(nearestAngle(170, [-175, 90]) === -175 && nearestAngle(-170, [175, -90]) === 175 && nearestAngle(-40, [25, 145, -95]) === -95,
  'A: nearest goes round through ±180 (170 → -175, -170 → 175), -40 → -95 among the Thirds seams');
{
  // The Seam view button: nearest, then the next one counter-clockwise, round through ±180.
  const t = seamAngles('thirds', 25); // 25, 145, -95
  const walk = [nextSeam(-60, t)];
  for (let i = 0; i < 3; i++) walk.push(nextSeam(walk[walk.length - 1] + 0.3, t));
  check(same(walk, [-95, 25, 145, -95]) && nextSeam(-40, seamAngles('halves', -40)) === 140,
    `A: Seam button from -60°: ${walk} (round and back); Halves facing -40 → 140`);
}
check(wrapAngle(540) === 180 && wrapAngle(-180) === 180 && wrapAngle(-181) === 179, 'A: wrap into −180…180');

// B: a fluted vase, so the wall is not a circle and a wrong plane shows
{
  const v: VaseParameters = JSON.parse(JSON.stringify(DEFAULT_PARAMETERS));
  v.textures.enabled = true;
  const flute = (v.textures as unknown as Record<string, { enabled: boolean }>).fluting;
  if (flute) flute.enabled = true;
  const [line] = seamLinesOnVase(v, [37]);
  const [lifted] = seamLinesOnVase(v, [37], 0.4);
  const m = generateMesh(v);
  const a = (37 * Math.PI) / 180;
  let worstPlane = 0, worstWall = 0, worstLift = 0, n = 0;
  // Base centre is the origin here (no XY Sway).
  for (let i = 0; i < line.length; i += 7) {
    const [x, y, z] = line[i];
    worstPlane = Math.max(worstPlane, Math.abs(-x * Math.sin(a) + y * Math.cos(a)));
    worstLift = Math.max(worstLift, Math.abs(Math.hypot(lifted[i][0], lifted[i][1]) - Math.hypot(x, y) - 0.4));
    if (z < 3 || z > v.height - 3) continue;
    // The outer wall's radius at this height, round this angle, from the mesh itself.
    let best = -Infinity;
    for (let k = 0; k < m.vertexCount; k++) {
      const px = m.positions[k * 3], py = m.positions[k * 3 + 1], pz = m.positions[k * 3 + 2];
      if (Math.abs(pz - z) > 1.5) continue;
      if (Math.abs(Math.atan2(Math.sin(Math.atan2(py, px) - a), Math.cos(Math.atan2(py, px) - a))) > 0.02) continue;
      best = Math.max(best, Math.hypot(px, py));
    }
    if (best > 0) { worstWall = Math.max(worstWall, Math.abs(best - Math.hypot(x, y))); n++; }
  }
  check(line.length > 20 && worstPlane < 1e-6, `B: ${line.length} points, all in the 37° plane (worst ${worstPlane.toExponential(1)} mm off)`);
  check(n > 5 && worstWall < 1.2, `B: on the outer wall: within ${worstWall.toFixed(2)} mm of the mesh's radius at ${n} heights`);
  check(worstLift < 1e-6, 'B: out = 0.4 lifts every point by 0.4 mm');
}

// C: the snap buttons' answers, built for real
{
  const ink = (x: number, y: number) => (Math.hypot(x - 100, y - 100) < 99 ? 1 : 0);
  const px = new Uint8Array(200 * 200);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) px[y * 200 + x] = Math.round(255 * (1 - ink(x + 0.5, y + 0.5)));
  const disc: SprigSource = { pixels: px, width: 200, height: 200 };
  const dome: SprigParameters = { ...DEFAULT_SPRIG_PARAMETERS, width: 20, length: 20, heightMode: 'inflate', maxHeight: 2, edgeSoftness: 0 };
  setVaseSprigField(buildRelief(disc, dome, 0.2));
  const vase = (angle: number): VaseParameters => {
    const p: VaseParameters = JSON.parse(JSON.stringify({ ...DEFAULT_PARAMETERS, profileEnabled: false }));
    p.textures.enabled = true;
    p.textures.sprig = { ...p.textures.sprig!, enabled: true, sprig: dome, sprigName: 'dome', depth: 2, heightPct: 50, angle };
    return p;
  };
  const halves = { ...DEFAULT_MOLD_PARAMETERS, moldStyle: 'splitHalves' as const, seamAngle: 25 };
  const thirds = { ...DEFAULT_MOLD_PARAMETERS, moldStyle: 'splitThirds' as const, seamAngle: 25 };
  const H = (a: number) => generateSplitHalvesMold(vase(a), halves, null).hasUndercuts;
  const T = (a: number) => generateSplitThirdsMold(vase(a), thirds).hasUndercuts;

  const from = -40;
  const hc = nearestAngle(from, pieceCentreAngles('halves', 25)), hs = nearestAngle(from, seamAngles('halves', 25));
  check(hc === -65 && hs === 25, `C: Halves from ${from}°: piece centre ${hc}°, seam ${hs}°`);
  check(!H(hc) && !H(hs), 'C: Halves at Seam Angle 25: clean centred on a piece and on a seam');
  // Measured: 90° (Seam Angle 0's centre) is still clean here, 25° off this one;
  // 0° (Seam Angle 0's seam) is not.
  check(H(hc + 30) && H(0), "C: CONTROL Halves: red 30° off the centre, and at 0° (the seam for Seam Angle 0)");

  const tc = nearestAngle(from, pieceCentreAngles('thirds', 25)), ts = nearestAngle(from, seamAngles('thirds', 25));
  check(tc === -35 && ts === -95, `C: Thirds from ${from}°: piece centre ${tc}°, seam ${ts}°`);
  check(!T(tc) && !T(ts), 'C: Thirds at Seam Angle 25: clean centred on a piece and on a seam');
  check(T(tc + 30) && T(-60), 'C: CONTROL Thirds: red 30° off the centre, and at -60° (a centre for Seam Angle 0)');
  setVaseSprigField(null);
}

console.log(`\n${ok ? 'ALL PASS' : 'SOME CHECKS FAILED'} (${passes} passed)`);
process.exit(ok ? 0 : 1);
