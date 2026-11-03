// SprigMaker picture input (image-prep.ts + the relief's mask path). Synthetic
// checks with controls; pass a folder holding 4.bmp / 2.bmp (sips -s format bmp)
// to also run the real dragonfly pictures.
//   npx tsx --tsconfig tsconfig.json tests/checks/verify-sprig-picture.ts [folder]
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { prepareImage, type RgbaImage } from '@/engine/sprig/image-prep';
import { buildRelief } from '@/engine/sprig/relief';
import { DEFAULT_SPRIG_PARAMETERS, type SprigParameters } from '@/engine/sprig/sprig-types';

const SP = process.argv[2];
let fails = 0;
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!ok) fails++; };

function readBmp(path: string): RgbaImage {
  const b = readFileSync(path);
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), hs = b.readInt32LE(22), bpp = b.readUInt16LE(28);
  const h = Math.abs(hs), bytes = bpp / 8, row = Math.ceil((w * bytes) / 4) * 4;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = hs > 0 ? h - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const p = off + sy * row + x * bytes, k = (y * w + x) * 4;
      data[k] = b[p + 2]; data[k + 1] = b[p + 1]; data[k + 2] = b[p]; data[k + 3] = bytes === 4 ? b[p + 3] || 255 : 255;
    }
  }
  return { data, width: w, height: h };
}
function writePpm(path: string, src: { pixels: Uint8Array; mask?: Uint8Array; width: number; height: number }) {
  const { width: w, height: h } = src;
  const body = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const bg = src.mask && src.mask[i] >= 128, v = src.pixels[i];
    body[i * 3] = bg ? 90 : v; body[i * 3 + 1] = bg ? 40 : v; body[i * 3 + 2] = bg ? 40 : v;
  }
  writeFileSync(path, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), body]));
}
const blank = (w: number, h: number, rgb = [240, 240, 240]): RgbaImage => {
  const data = new Uint8Array(w * h * 4);
  for (let k = 0; k < w * h; k++) { data[k * 4] = rgb[0]; data[k * 4 + 1] = rgb[1]; data[k * 4 + 2] = rgb[2]; data[k * 4 + 3] = 255; }
  return { data, width: w, height: h };
};
const paint = (img: RgbaImage, f: (x: number, y: number) => number[] | null) => {
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const c = f(x, y); if (!c) continue;
    const k = (y * img.width + x) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; if (c.length > 3) img.data[k + 3] = c[3];
  }
};
const D = { background: 20, closeGaps: 0, smooth: 1, tones: 3 };
const insideCount = (m: Uint8Array) => m.reduce((a, v) => a + (v < 128 ? 1 : 0), 0);

// 1. Closed ring outline → filled disc; ring with a gap → only the ring, unless Close Gaps.
const ring = (gap: number) => { const im = blank(200, 200); paint(im, (x, y) => {
  const r = Math.hypot(x - 100, y - 100);
  if (r < 60 || r > 64) return null;
  if (gap > 0 && Math.abs(y - 100) < gap / 2 && x > 100) return null;
  return [20, 20, 20]; }); return im; };
const closed = prepareImage(ring(0), D)!;
const discArea = Math.PI * 64 * 64, ringArea = Math.PI * (64 * 64 - 60 * 60);
check('closed outline fills solid', Math.abs(insideCount(closed.source.mask!) - discArea) / discArea < 0.03, `${insideCount(closed.source.mask!)} vs disc ${discArea.toFixed(0)}`);
const gapped = prepareImage(ring(4), D)!;
check('CONTROL: outline with a 4px gap is cut away inside', insideCount(gapped.source.mask!) < ringArea * 1.1, `${insideCount(gapped.source.mask!)} vs ring ${ringArea.toFixed(0)}`);
const healed = prepareImage(ring(4), { ...D, closeGaps: 3 })!;
check('Close Gaps 3 fills it', insideCount(healed.source.mask!) > discArea * 0.95, `${insideCount(healed.source.mask!)}`);

// 2. Three flat tones + JPEG-like noise → exactly 3 levels.
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const tri = blank(300, 100); paint(tri, (x, y) => {
  if (y < 20 || y > 80 || x < 10 || x > 290) return null;
  const base = x < 100 ? 50 : x < 200 ? 110 : 170; const v = base + (rnd() - 0.5) * 24; return [v, v, v]; });
const t3 = prepareImage(tri, D)!;
const levels = new Set<number>(); t3.source.pixels.forEach((v, i) => { if (t3.source.mask![i] < 128) levels.add(v); });
check('3 tones + noise → 3 levels', levels.size === 3, JSON.stringify(Array.from(levels).sort((a, b) => a - b)));
const sm = prepareImage(tri, { ...D, tones: 0, smooth: 0 })!;
const lv2 = new Set<number>(); sm.source.pixels.forEach((v, i) => { if (sm.source.mask![i] < 128) lv2.add(v); });
check('CONTROL: Smooth keeps the noise (many levels)', lv2.size > 20, `${lv2.size}`);
const lightCount = t3.source.pixels.filter((v, i) => t3.source.mask![i] < 128 && v === 255).length;
check('darkest strip is level 0, lightest 255', levels.has(0) && levels.has(255) && lightCount > 4000);

// 3. A speck in a corner does not move the crop.
const sp = blank(200, 200); paint(sp, (x, y) => (x > 50 && x < 150 && y > 50 && y < 150) || (x === 3 && y === 3) ? [0, 0, 0] : null);
const spr = prepareImage(sp, D)!;
check('corner speck dropped, crop = square', spr.source.width === 99 && spr.source.height === 99, `${spr.source.width}x${spr.source.height}`);

// 4. Transparent background.
const tp = blank(100, 100, [255, 255, 255]); paint(tp, (x, y) => (x > 30 && x < 70 && y > 30 && y < 70) ? [255, 255, 255, 255] : [0, 0, 0, 0]);
const tpr = prepareImage(tp, D)!;
check('transparent PNG: alpha is the background (white shape kept)', tpr && tpr.source.width === 39, `${tpr?.source.width}`);

// 5. Engine: a pale area inside the outline counts as shape in Flat mode.
const pale = blank(200, 120, [255, 255, 255]); paint(pale, (x, y) => {
  if (x < 20 || x > 180 || y < 20 || y > 100) return null;
  if (x < 24 || x > 176 || y < 24 || y > 96) return [0, 0, 0];      // dark frame
  return [225, 225, 225]; });                                           // pale inside
const pr = prepareImage(pale, D)!;
const P: SprigParameters = { ...DEFAULT_SPRIG_PARAMETERS, heightMode: 'flat', width: 40, length: 40 / pr.aspect };
const withMask = buildRelief(pr.source, P, 0.2);
const noMask = buildRelief({ ...pr.source, pixels: pale2gray(pr.source), mask: undefined }, P, 0.2);
function pale2gray(src: { pixels: Uint8Array; width: number; height: number }) {
  // the same picture as an SVG would carry it: actual luminance, pale inside
  const out = new Uint8Array(src.width * src.height);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const e = x < 4 || x > src.width - 5 || y < 4 || y > src.height - 5; out[y * src.width + x] = e ? 0 : 225; }
  return out;
}
const area = (r: ReturnType<typeof buildRelief>) => r.mask.reduce((a, v) => a + v, 0);
check('pale inside kept with the mask', area(withMask) > 0.9 * (40 / 0.2) * (P.length / 0.2), `${area(withMask)}`);
check('CONTROL: without the mask the pale inside drops (frame only)', area(noMask) < 0.3 * area(withMask), `${area(noMask)}`);
check('one piece', withMask.pieces === 1);
// Gray: lightest level at Lightest% of Max Height.
const G = { ...P, heightMode: 'gray' as const, edgeSoftness: 0, imageLightest: 40 };
const gr = buildRelief(pr.source, G, 0.2);
const mid = gr.heights[Math.floor(gr.ny / 2) * gr.nx + Math.floor(gr.nx / 2)];
check('Gray: pale area at Lightest 40% of Max Height', Math.abs(mid - 0.4 * G.maxHeight) < 0.05, `${mid.toFixed(3)} vs ${0.4 * G.maxHeight}`);
const inv = buildRelief(pr.source, { ...G, invert: true }, 0.2);
const midInv = inv.heights[Math.floor(inv.ny / 2) * inv.nx + Math.floor(inv.nx / 2)];
check('Invert: pale area becomes the high one, outline unchanged', Math.abs(midInv - G.maxHeight) < 0.05 && area(inv) === area(gr), `${midInv.toFixed(3)}`);

// 6. The real pictures.
for (const f of ['4', '2']) {
  if (!SP || !existsSync(`${SP}/${f}.bmp`)) continue;
  const img = readBmp(`${SP}/${f}.bmp`);
  const t0 = Date.now();
  const r = prepareImage(img, D)!;
  const ms = Date.now() - t0;
  writePpm(`${SP}/prep-${f}.ppm`, r.source);
  const lv = new Map<number, number>(); r.source.pixels.forEach((v, i) => { if (r.source.mask![i] < 128) lv.set(v, (lv.get(v) ?? 0) + 1); });
  const Q: SprigParameters = { ...DEFAULT_SPRIG_PARAMETERS, heightMode: 'inflateGray', width: 80, length: 80 / r.aspect };
  const rel = buildRelief(r.source, Q, 0.2);
  console.log(`picture ${f}: ${img.width}x${img.height} → crop ${r.source.width}x${r.source.height} aspect ${r.aspect.toFixed(3)} in ${ms} ms; levels ${JSON.stringify(Array.from(lv.entries()).sort((a, b) => a[0] - b[0]))}; pieces ${rel.pieces} (tiny ${rel.smallPieces}), maxH ${rel.maxHeight.toFixed(2)}`);
}

// 7. SVG options (2026-10-25): an SVG arrives composited on WHITE paper.
//    Fill off = every non-white pixel is shape (an empty outline stays empty);
//    tones −1 = darkness as drawn, unstretched.
{
  const SV = { background: 10, closeGaps: 0, smooth: 0 };
  const whiteRing = () => { const im = blank(200, 200, [255, 255, 255]); paint(im, (x, y) => {
    const r = Math.hypot(x - 100, y - 100); return r >= 60 && r <= 64 ? [0, 0, 0] : null; }); return im; };
  const filled = prepareImage(whiteRing(), { ...SV, tones: -1, fill: true })!;
  const lines = prepareImage(whiteRing(), { ...SV, tones: -1, fill: false })!;
  check('SVG Fill on: closed outline fills solid', Math.abs(insideCount(filled.source.mask!) - discArea) / discArea < 0.03, `${insideCount(filled.source.mask!)}`);
  check('CONTROL: SVG Fill off: only the ring', Math.abs(insideCount(lines.source.mask!) - ringArea) / ringArea < 0.1, `${insideCount(lines.source.mask!)} vs ${ringArea.toFixed(0)}`);
  // As drawn: the white inside is the lightest (pixel 255), the ring the darkest (0).
  const c = filled.source.width >> 1;
  const centre = filled.source.pixels[c * filled.source.width + c];
  check('As drawn + Fill: white inside reads as white (lightest), not black', centre === 255, `${centre}`);
  // Mid-gray square on white, as drawn: tone ≈ 0.5, NOT stretched to full black.
  const g = blank(100, 100, [255, 255, 255]); paint(g, (x, y) => (x >= 20 && x < 80 && y >= 20 && y < 80 ? [128, 128, 128] : null));
  const gp = prepareImage(g, { ...SV, tones: -1, fill: false })!;
  const gv = gp.source.pixels[(gp.source.height >> 1) * gp.source.width + (gp.source.width >> 1)];
  check('As drawn: a mid-gray stays mid-gray (not stretched)', Math.abs(gv - 128) <= 1, `${gv}`);
  const gs = prepareImage(g, { ...SV, tones: 0, fill: false })!;
  const gsv = gs.source.pixels[(gs.source.height >> 1) * gs.source.width + (gs.source.width >> 1)];
  check('CONTROL: Smooth (stretched) puts a lone gray at full height', gsv === 0, `${gsv}`);
  // A white eye inside a black silhouette: Fill off → a hole (white is paper); Fill on → kept.
  const eye = blank(100, 100, [255, 255, 255]); paint(eye, (x, y) => {
    const r = Math.hypot(x - 50, y - 50); return r <= 40 ? (Math.hypot(x - 60, y - 45) <= 8 ? [255, 255, 255] : [0, 0, 0]) : null; });
  const eyeOff = prepareImage(eye, { ...SV, tones: 3, fill: false })!, eyeOn = prepareImage(eye, { ...SV, tones: 3, fill: true })!;
  const at = (r: typeof eyeOff, x: number, y: number) => r.source.mask![(y - 10) * r.source.width + (x - 10)];
  check('Fill off: a white eye is a hole (white = paper, as before)', at(eyeOff, 60, 45) === 255);
  check('Fill on: the white eye is kept as shape', at(eyeOn, 60, 45) === 0);
}

// ── Gap Fill (2026-10-29): Gary's tail segments were split by 1–4 px white
// slits; Close Gaps filled them and the joints came up level. Gap Fill sets
// how full: a bar 400 × 40 px, split by a 2 px slit at x = 200, plus a white
// window enclosed inside the bar (inside an outline: shape without Close Gaps,
// so never a "gap").
{
  console.log('\nGap Fill');
  const W = 400, H = 120;
  const img = blank(W, H, [255, 255, 255]);
  for (let y = 40; y < 80; y++) for (let x = 20; x < 380; x++) {
    const slit = x >= 199 && x <= 200;
    const windowEdge = x >= 290 && x <= 340 && y >= 50 && y <= 70 && !(x >= 294 && x <= 336 && y >= 54 && y <= 66);
    const window = x >= 294 && x <= 336 && y >= 54 && y <= 66;
    const k = (y * W + x) * 4;
    const v = slit || window ? 255 : windowEdge ? 0 : 40;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
  }
  const opts = { background: 20, closeGaps: 0, smooth: 0, tones: 3 };
  const open = prepareImage(img, opts)!, closed = prepareImage(img, { ...opts, closeGaps: 2 })!;
  const gap = closed.source.gap!;
  let slitMarked = 0, windowMarked = 0;
  for (let y = 0; y < closed.source.height; y++) for (let x = 0; x < closed.source.width; x++) {
    if (gap[y * closed.source.width + x] !== 0) continue;
    const X = x + 20; // crop starts at the bar's left
    if (X >= 199 && X <= 200) slitMarked++; else windowMarked++;
  }
  check('Close Gaps marks the slit it filled', slitMarked > 0 && !open.source.gap, `${slitMarked} px`);
  check('control: the enclosed window is not a gap', windowMarked === 0, `${windowMarked} px`);
  const P = (o: Partial<SprigParameters>) => ({ ...DEFAULT_SPRIG_PARAMETERS, svg: 'x', svgAspect: closed.aspect, width: 36, length: 4, heightMode: 'flat', maxHeight: 2, edgeSoftness: 0.5, moldSize: 'custom', ...o }) as SprigParameters;
  const r = (o: Partial<SprigParameters>, src = closed.source) => buildRelief(src, P(o), 0.1);
  const at = (rel: ReturnType<typeof buildRelief>, x: number) => rel.heights[Math.round((0 - rel.y0) / rel.step) * rel.nx + Math.round((x - rel.x0) / rel.step)];
  const slitX = (200 - 20 - 180) / 10;   // the slit, in mm from the centre (36 mm across 360 px)
  const full = r({ gapFill: 100 }), half = r({ gapFill: 50 }), none = r({ gapFill: 0 }), opened = r({}, open.source);
  const noGap = r({ gapFill: 50 }, { ...closed.source, gap: undefined });
  check('100% = byte-identical to no Gap Fill at all', full.heights.every((v, k) => v === noGap.heights[k]));
  check('50%: the slit sits at half the height', Math.abs(at(half, slitX) - 1) < 0.15, `${at(half, slitX).toFixed(2)} mm of 2`);
  check('0%: the slit goes down to the plate', at(none, slitX) < 0.1, `${at(none, slitX).toFixed(2)} mm`);
  check('every value: one piece (the slit is still shape)', full.pieces === 1 && half.pieces === 1 && none.pieces === 1, `${full.pieces} ${half.pieces} ${none.pieces}`);
  check('control: without Close Gaps the bar is two pieces', opened.pieces === 2, `${opened.pieces}`);
  check('control: far from the slit, unchanged', at(half, -12) === at(full, -12), `${at(half, -12).toFixed(2)} mm`);
}

console.log(fails ? `${fails} FAILED` : 'ALL PASS');
