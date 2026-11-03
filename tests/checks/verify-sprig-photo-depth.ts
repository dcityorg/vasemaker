// SprigMaker Photo depth (engine/sprig/photo-depth.ts → image-prep → buildRelief).
// Synthetic pictures and depth maps, with controls. The model itself runs only
// in the browser (lib/photo-depth.ts) and is not exercised here.
//   npx tsx --tsconfig tsconfig.json tests/checks/verify-sprig-photo-depth.ts
import { depthRelief, looksLikePhoto, type DepthMap } from '@/engine/sprig/photo-depth';
import { prepareImage } from '@/engine/sprig/image-prep';
import { buildRelief } from '@/engine/sprig/relief';
import { DEFAULT_SPRIG_PARAMETERS, mergeSprigParameters, type SprigParameters } from '@/engine/sprig/sprig-types';

let fails = 0;
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!ok) fails++; };

const W = 200, H = 160;
const rgba = (f: (x: number, y: number) => [number, number, number, number]) => {
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.set(f(x, y), (y * W + x) * 4);
  return { data: d, width: W, height: H };
};
// An ellipse on white, centre (100, 80), radii 70 × 55.
const inEllipse = (x: number, y: number) => ((x - 100) / 70) ** 2 + ((y - 80) / 55) ** 2 < 1;

// ── A: photo or drawing ──
const flat = rgba((x, y) => (inEllipse(x, y) ? (x < 100 ? [200, 40, 40, 255] : [40, 40, 200, 255]) : [255, 255, 255, 255]));
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const photo = rgba((x, y) => (inEllipse(x, y) ? [80 + x * 0.6 + rnd() * 30, 60 + y * 0.8 + rnd() * 30, 90 + rnd() * 40, 255] : [255, 255, 255, 255]));
const clear = rgba((x, y) => (inEllipse(x, y) ? [0, 0, 0, 255] : [Math.floor(rnd() * 255), Math.floor(rnd() * 255), Math.floor(rnd() * 255), 0]));
check('A two flat colours: a drawing', !looksLikePhoto(flat));
check('A shaded and speckled: a photo', looksLikePhoto(photo));
check('A control: colours under transparent pixels do not count', !looksLikePhoto(clear));

// ── B: depthRelief on its own ──
// Depth: a bump at (130, 80) (a "head") on a tilt rising to the right.
const depthField = (s: number, scale = 1, offset = 0): DepthMap => {
  const w = Math.round(W * s), h = Math.round(H * s), data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = (x + 0.5) / s - 0.5, Y = (y + 0.5) / s - 0.5;
    data[y * w + x] = offset + scale * (X / W + 1.5 * Math.exp(-(((X - 130) ** 2 + (Y - 80) ** 2) / (2 * 12 * 12))));
  }
  return { data, width: w, height: h };
};
const inside = new Uint8Array(W * H), edge = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!inEllipse(x, y)) continue;
  inside[y * W + x] = 1;
  // Distance to the outline, roughly (enough for this test's comparisons).
  edge[y * W + x] = (1 - Math.sqrt(((x - 100) / 70) ** 2 + ((y - 80) / 55) ** 2)) * 55;
}
const at = (h: Float32Array, x: number, y: number) => h[y * W + x];
const r1 = depthRelief(depthField(1), W, H, inside, edge);
let lo = 1, hi = 0, outside = 0;
for (let k = 0; k < W * H; k++) { if (inside[k]) { lo = Math.min(lo, r1[k]); hi = Math.max(hi, r1[k]); } else outside = Math.max(outside, r1[k]); }
check('B heights 0.03..1 inside, 0 outside', lo >= 0.03 - 1e-6 && hi <= 1 && outside === 0, `inside ${lo.toFixed(2)}..${hi.toFixed(2)}`);
check('B rounded at the outline: edge low, middle high', at(r1, 31, 80) < 0.3 && at(r1, 80, 80) > 0.6, `edge ${at(r1, 31, 80).toFixed(2)} middle ${at(r1, 80, 80).toFixed(2)}`);
const scaled = depthRelief(depthField(1, 37, -5), W, H, inside, edge);
let dScale = 0; for (let k = 0; k < W * H; k++) dScale = Math.max(dScale, Math.abs(scaled[k] - r1[k]));
check('B depth units do not matter (×37, −5)', dScale < 1e-4, `max diff ${dScale.toExponential(1)}`);
const half = depthRelief(depthField(0.5), W, H, inside, edge);
let dHalf = 0, nHalf = 0; for (let k = 0; k < W * H; k++) if (inside[k]) { dHalf += Math.abs(half[k] - r1[k]); nHalf++; }
check('B depth at half the resolution: nearly the same', dHalf / nHalf < 0.02, `mean diff ${(dHalf / nHalf).toFixed(4)}`);
// Control: no bump in the depth → the bump spot is no higher than its mirror.
const noBump: DepthMap = (() => { const d = depthField(1); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.data[y * W + x] = x / W; return d; })();
const r0 = depthRelief(noBump, W, H, inside, edge);
// The bump raises its own spot (against the same depth without it), and not a spot far from it.
check('B the depth bump stands up where it is', at(r1, 130, 80) - at(r0, 130, 80) > 0.1, `${at(r1, 130, 80).toFixed(2)} vs ${at(r0, 130, 80).toFixed(2)} without it`);
check('B control: far from the bump, about the same', Math.abs(at(r1, 60, 80) - at(r0, 60, 80)) < 0.06, `${at(r1, 60, 80).toFixed(2)} vs ${at(r0, 60, 80).toFixed(2)}`);

// ── C: through image-prep ──
const opts = { background: 20, closeGaps: 0, smooth: 1, tones: 3 };
const plain = prepareImage(photo, opts)!, withD = prepareImage(photo, { ...opts, depth: depthField(1) })!;
let sameMask = plain.source.mask!.length === withD.source.mask!.length;
for (let k = 0; sameMask && k < plain.source.mask!.length; k++) if (plain.source.mask![k] !== withD.source.mask![k]) sameMask = false;
check('C depth flag set, outline unchanged', withD.source.photoDepth === true && !plain.source.photoDepth && sameMask && withD.aspect === plain.aspect);
// Tones and Smooth are not used with depth.
const otherTones = prepareImage(photo, { ...opts, tones: 0, smooth: 4, depth: depthField(1) })!;
let samePx = true; for (let k = 0; samePx && k < withD.source.pixels.length; k++) if (withD.source.pixels[k] !== otherTones.source.pixels[k]) samePx = false;
check('C Tones and Smooth ignored with depth', samePx);

// ── D: buildRelief ──
const P = (o: Partial<SprigParameters>): SprigParameters => ({ ...DEFAULT_SPRIG_PARAMETERS, svg: 'x', svgAspect: plain.aspect, width: 50, length: Math.round((50 / plain.aspect) * 2) / 2, moldSize: 'custom', ...o });
const same = (a: Float32Array, b: Float32Array) => a.length === b.length && a.every((v, k) => v === b[k]);
const noDepth = buildRelief(plain.source, P({ heightMode: 'photoDepth' }), 0.2);
const inflate = buildRelief(plain.source, P({ heightMode: 'inflate' }), 0.2);
check('D Photo depth before the depth arrives = Inflate exactly', same(noDepth.heights, inflate.heights));
const pd = buildRelief(withD.source, P({ heightMode: 'photoDepth', imageLightest: 40 }), 0.2);
const gray = buildRelief(withD.source, P({ heightMode: 'gray', imageLightest: 0 }), 0.2);
check('D with depth = Gray as made (Lightest ignored)', same(pd.heights, gray.heights), `max ${pd.maxHeight.toFixed(2)} mm`);
check('D same outline as Inflate: pieces and thin parts', pd.pieces === inflate.pieces && pd.thinSpots === inflate.thinSpots, `pieces ${pd.pieces}/${inflate.pieces} thin ${pd.thinSpots}/${inflate.thinSpots}`);
const inv = buildRelief(withD.source, P({ heightMode: 'photoDepth', invert: true }), 0.2);
check('D control: Invert changes it', !same(inv.heights, pd.heights));

// ── E: design files ──
check('E Photo depth survives a design file', mergeSprigParameters({ heightMode: 'photoDepth' }).heightMode === 'photoDepth');
check('E control: an unknown Shaping falls back to the default', mergeSprigParameters({ heightMode: 'magic' }).heightMode === DEFAULT_SPRIG_PARAMETERS.heightMode);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
