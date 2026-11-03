// SprigMaker Fill Height (2026-10-30, was the Fill Outlines switch).
// A line drawing — a thick black ring on white — filled through the picture
// pipeline the way a filled SVG is, then built as an SVG (fillHeight applies)
// and as a picture (imageLightest applies, the old Fill Outlines behaviour).
//   npx tsx --tsconfig tsconfig.json tests/checks/verify-sprig-fill.ts
import { prepareImage } from '@/engine/sprig/image-prep';
import { buildRelief } from '@/engine/sprig/relief';
import { DEFAULT_SPRIG_PARAMETERS, mergeSprigParameters, type SprigParameters } from '@/engine/sprig/sprig-types';
import type { DepthMap } from '@/engine/sprig/photo-depth';

let fails = 0;
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!ok) fails++; };

const W = 240, H = 240, d = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const r = Math.hypot(x - 120, y - 120);
  d.set(r > 90 && r < 105 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * W + x) * 4);
}
const src = prepareImage({ data: d, width: W, height: H }, { background: 20, closeGaps: 0, smooth: 0, tones: -1, fill: true })!.source;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>', PIC = 'data:image/png;base64,x';
const P = (o: Partial<SprigParameters>): SprigParameters => ({ ...DEFAULT_SPRIG_PARAMETERS, svg: SVG, svgAspect: 1, width: 40, length: 40, moldSize: 'custom', edgeSoftness: 0.5, ...o });
const build = (o: Partial<SprigParameters>) => buildRelief(src, P(o), 0.2);
const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) < 1e-6);
// Heights at the middle (the filled inside) and on the ring, mm from the
// centre: the drawing is cropped to the ring's outside (105 px = 20 mm).
const at = (r: ReturnType<typeof build>, x: number) => r.heights[Math.round(-r.y0 / r.step) * r.nx + Math.round((x - r.x0) / r.step)];
const mid = (r: ReturnType<typeof build>) => at(r, 0), ring = (r: ReturnType<typeof build>) => at(r, (97.5 / 105) * 20);

// The steepest step between neighbouring cells, from the middle out to the ring.
const wall = (r: ReturnType<typeof build>) => {
  let m = 0; const c = (97.5 / 105) * 20;
  for (let x = 0; x < c; x += r.step) m = Math.max(m, Math.abs(at(r, x + r.step) - at(r, x)));
  return m;
};

// Gray: the inside at 40 % of Max Height, the ring at full height, and the
// ring's own edge slope running down to the fill instead of a wall.
const g40 = build({ heightMode: 'gray', fillHeight: 40, imageLightest: 90 });
const old40 = build({ svg: PIC, heightMode: 'gray', imageLightest: 40 });
check('A Gray 40 %: inside 1.2 mm, ring 3 mm', Math.abs(mid(g40) - 1.2) < 0.01 && Math.abs(ring(g40) - 3) < 0.01, `inside ${mid(g40).toFixed(2)} ring ${ring(g40).toFixed(2)}`);
// The slope down to the fill is the lines' own Edge Softness, as at the outer edge.
const gs = build({ heightMode: 'gray', fillHeight: 40, edgeSoftness: 1.5 }), olds = build({ svg: PIC, heightMode: 'gray', imageLightest: 40, edgeSoftness: 1.5 });
let outer = 0; for (let x = (97.5 / 105) * 20; x < 21; x += gs.step) outer = Math.max(outer, Math.abs(at(gs, x + gs.step) - at(gs, x)));
check('A no wall: the ring slopes down to the fill no steeper than its outer edge', wall(gs) <= outer + 1e-3 && wall(gs) < 0.65 * wall(olds),
  `inner ${wall(gs).toFixed(2)} mm per cell, outer ${outer.toFixed(2)}, old Fill ${wall(olds).toFixed(2)}`);
check('A control: Lightest Tone does not move a filled SVG', same(g40.heights, build({ heightMode: 'gray', fillHeight: 40, imageLightest: 10 }).heights));

// Flat: half, and solid.
const f50 = build({ heightMode: 'flat', fillHeight: 50 }), f100 = build({ heightMode: 'flat', fillHeight: 100 });
check('B Flat 50%: inside half the ring', Math.abs(mid(f50) - 0.5 * ring(f50)) < 0.05, `${mid(f50).toFixed(2)} / ${ring(f50).toFixed(2)}`);
check('B Flat 100%: one solid shape = the old Fill in Flat', same(f100.heights, build({ svg: PIC, heightMode: 'flat' }).heights) && Math.abs(mid(f100) - 3) < 1e-3, `inside ${mid(f100).toFixed(2)}`);

// Inflate: 100 % = the old Fill (one dome). Below it the ring keeps its own
// rounding (the same at 5 % and 50 %) and the inside is that share of the dome.
const i100 = build({ heightMode: 'inflate', fillHeight: 100 }), i50 = build({ heightMode: 'inflate', fillHeight: 50 }), i5 = build({ heightMode: 'inflate', fillHeight: 5 });
check('C Inflate 100% = old Fill in Inflate', same(i100.heights, build({ svg: PIC, heightMode: 'inflate' }).heights), `inside ${mid(i100).toFixed(2)}`);
check('C Inflate 50%: inside half the dome there', Math.abs(mid(i50) - 0.5 * mid(i100)) < 0.05, `${mid(i50).toFixed(2)} vs ${mid(i100).toFixed(2)}`);
check('C Inflate: the ring keeps its own rounding below the fill (5 % = 50 %)', Math.abs(ring(i50) - ring(i5)) < 0.01 && ring(i5) < ring(i100) - 0.1,
  `ring ${ring(i5).toFixed(2)} / ${ring(i50).toFixed(2)}, on the solid dome ${ring(i100).toFixed(2)}`);
const i95 = build({ heightMode: 'inflate', fillHeight: 95 });
let d95 = 0; for (let k = 0; k < i95.heights.length; k++) d95 = Math.max(d95, Math.abs(i95.heights[k] - i100.heights[k]));
check('C no jump at the top: 95 % is within 5 % of the dome of 100 %', d95 <= 0.05 * 3 + 1e-3, `max diff ${d95.toFixed(2)} mm`);

// Inflate + Gray with a fill = Inflate; Detail Depth does not apply.
const ig = build({ heightMode: 'inflateGray', fillHeight: 50, detailDepth: 1 });
check('D Inflate + Gray filled = Inflate, Detail Depth ignored', same(ig.heights, i50.heights) && same(ig.heights, build({ heightMode: 'inflateGray', fillHeight: 50, detailDepth: 2 }).heights));

// Pictures do not use Fill Height.
check('E control: a picture ignores Fill Height', same(build({ svg: PIC, heightMode: 'flat', fillHeight: 50 }).heights, build({ svg: PIC, heightMode: 'flat', fillHeight: 0 }).heights));

// Old files: Fill Outlines on becomes the Fill Height that looks the same.
const m = (o: Record<string, unknown>) => mergeSprigParameters(o).fillHeight;
check('F old Gray + Fill + Lightest 40 → 40', m({ svgFill: true, heightMode: 'gray', imageLightest: 40 }) === 40);
check('F old Flat / Inflate + Fill → 100', m({ svgFill: true, heightMode: 'flat' }) === 100 && m({ svgFill: true, heightMode: 'inflate' }) === 100);
check('F old Inflate + Gray (Depth 1, Lightest 40, 3 mm) → 80', m({ svgFill: true, heightMode: 'inflateGray', detailDepth: 1, imageLightest: 40, maxHeight: 3 }) === 80);
check('F old Fill off → 0; a saved Fill Height wins', m({ svgFill: false }) === 0 && m({ svgFill: true, fillHeight: 25 }) === 25);

// ── G: Fill Holes in Photo depth (2026-10-30) ──
// A depth map with texture: a gentle tilt plus ripples, so the lines carry detail.
const depth: DepthMap = { width: W, height: H, data: new Float32Array(W * H) };
// Like the model, it also sees the white hole as far-off background: a dip
// there that its blur carries ~6 px into the ring round it.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const r = Math.hypot(x - 120, y - 120), dip = 0.8 * Math.min(1, Math.max(0, (96 - r) / 12));
  depth.data[y * W + x] = x / W + 0.3 * Math.sin(x / 6) * Math.sin(y / 7) - dip;
}
const prepD = (keepLines: boolean) => prepareImage({ data: d, width: W, height: H }, { background: 20, closeGaps: 0, smooth: 0, tones: -1, fill: true, depth, keepLines })!.source;
const dsrc = prepD(true);
check('G the prep keeps the lines apart when there are holes', !!dsrc.lines && dsrc.photoDepth === true);
check('G control: not asked → no lines kept', !prepD(false).lines);
const db = (o: Partial<SprigParameters>, s = dsrc) => buildRelief(s, P({ heightMode: 'photoDepth', ...o }), 0.2);
const d100 = db({ fillHeight: 100 }), d50 = db({ fillHeight: 50 }), d5 = db({ fillHeight: 5 });
// The hole's floor along the middle row, and the heights just inside the ring.
const holeRow = (r: ReturnType<typeof build>) => { const v: number[] = []; for (let x = -15; x <= 15; x += 1) v.push(at(r, x)); return v; };
const rim = (r: ReturnType<typeof build>) => at(r, (92 / 105) * 20);
const h100 = holeRow(d100), h50 = holeRow(d50), h5 = holeRow(d5);
// Filled smoothly from its rim, the hole lies between the rim's lowest and
// highest points (a sag below the lowest would be a dip).
const rimAll: number[] = [];
for (let a = 0; a < 360; a += 5) {
  const R = (90 / 105) * 20 - 0.6, x = R * Math.cos((a * Math.PI) / 180), y = R * Math.sin((a * Math.PI) / 180);
  rimAll.push(d100.heights[Math.round((y - d100.y0) / d100.step) * d100.nx + Math.round((x - d100.x0) / d100.step)]);
}
check('G 100 %: the hole fills level with the rim round it — no dip below its lowest point', Math.min(...h100) >= Math.min(...rimAll) - 0.05 && Math.max(...h100) <= Math.max(...rimAll) + 0.05,
  `hole ${Math.min(...h100).toFixed(2)}..${Math.max(...h100).toFixed(2)}, rim ${Math.min(...rimAll).toFixed(2)}..${Math.max(...rimAll).toFixed(2)}`);
const ratio = h50.map((v, i) => v / h100[i]);
check('G 50 %: the hole at half of 100 %', ratio.every((q) => Math.abs(q - 0.5) < 0.02), `${Math.min(...ratio).toFixed(3)}..${Math.max(...ratio).toFixed(3)}`);
check('G 5 %: the hole stays low', Math.max(...h5) < 0.06 * Math.max(...h100) + 0.01, `max ${Math.max(...h5).toFixed(2)} mm`);
check('G the ring keeps its own depth shape below 100 % (5 % = 50 %)', Math.abs(ring(d5) - ring(d50)) < 0.01, `${ring(d5).toFixed(2)} / ${ring(d50).toFixed(2)}`);
const flat = h100.every((v) => Math.abs(v - h100[0]) < 1e-3);
check('G the ring carries the depth texture (not flat)', !flat || ring(d50) !== ring(d100));
check('G control: Fill Holes moves the hole at all', Math.abs(Math.max(...h50) - Math.max(...h100)) > 0.1);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
