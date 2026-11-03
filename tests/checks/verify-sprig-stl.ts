// SprigMaker Load Relief STL (stl-relief.ts → the picture path → buildRelief).
// Synthetic plaques with two domes, in three orientations, plus controls; pass
// a relief STL made in another app to also report on it.
//   npx tsx --tsconfig tsconfig.json tests/checks/verify-sprig-stl.ts [file.stl]
import { readFileSync } from 'fs';
import { parseStl, stlToReliefMap, reliefMapToRgba, reliefMapSize, withRelief } from '@/engine/sprig/stl-relief';
import { prepareImage } from '@/engine/sprig/image-prep';
import { buildRelief } from '@/engine/sprig/relief';
import { DEFAULT_SPRIG_PARAMETERS, drawingDefaults, mergeSprigParameters } from '@/engine/sprig/sprig-types';
import { useSprigStore } from '@/store/sprig-store';
import { SPRIG_SAMPLES } from '@/config/sprig-samples';
import { existsSync } from 'fs';

let fails = 0;
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!ok) fails++; };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// ── A plaque 40 × 30 × 3 mm, face up, with a tall dome (R 6, 2 mm) at (10, 0)
//    and a short one (R 4, 1 mm) at (−8, 6). Back at z = −3. ──
const dome = (x: number, y: number, cx: number, cy: number, R: number, H: number) => {
  const r2 = ((x - cx) ** 2 + (y - cy) ** 2) / (R * R);
  return r2 < 1 ? H * Math.sqrt(1 - r2) : 0;
};
const field = (x: number, y: number) => Math.max(dome(x, y, 10, 0, 6, 2), dome(x, y, -8, 6, 4, 1));
function plaque(f: (x: number, y: number) => number, d = 0.1): number[] {
  const t: number[] = [];
  const nx = Math.round(40 / d), ny = Math.round(30 / d);
  const P = (i: number, j: number) => { const x = -20 + i * d, y = -15 + j * d; return [x, y, f(x, y)]; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), e = P(i, j + 1);
    t.push(...a, ...b, ...c, ...a, ...c, ...e);
  }
  t.push(-20, -15, -3, 20, 15, -3, 20, -15, -3, -20, -15, -3, -20, 15, -3, 20, 15, -3);
  return t;
}
const flat = plaque(field);
const xf = (t: number[], m: (x: number, y: number, z: number) => number[]) => {
  const o: number[] = [];
  for (let k = 0; k < t.length; k += 3) o.push(...m(t[k], t[k + 1], t[k + 2]));
  return Float32Array.from(o);
};
const cases: [string, Float32Array][] = [
  ['face up', Float32Array.from(flat)],
  ['face down (turned over about y)', xf(flat, (x, y, z) => [-x, y, -z])],
  ['standing, facing −y (as MakerWorld exports)', xf(flat, (x, y, z) => [x, -z, y])],
];

// Expected crop: x −12..16 (28 mm), y −6..10 (16 mm); centre (2, 2).
for (const [name, tris] of cases) {
  const m = stlToReliefMap(tris, 1024)!;
  const s = reliefMapSize(m);
  check(`A ${name}: size 28 × 16`, near(s.width, 28, 0.3) && near(s.length, 16, 0.3), `${s.width.toFixed(2)} × ${s.length.toFixed(2)}`);
  check(`A ${name}: height 2`, near(m.maxHeight, 2, 0.02), m.maxHeight.toFixed(3));
  // Tall dome on the RIGHT, short one TOP-LEFT (not mirrored, not upside down).
  const at = (x: number, y: number) => {
    const i = Math.round((x + 12) / m.pixelMm) + 2, j = Math.round((10 - y) / m.pixelMm) + 2;
    return m.heights[j * m.width + i];
  };
  check(`A ${name}: tall dome right, short top-left`, near(at(10, 0), 2, 0.05) && near(at(-8, 6), 1, 0.05) && at(-8, 0) === 0,
    `(10,0)=${at(10, 0).toFixed(2)} (−8,6)=${at(-8, 6).toFixed(2)} (−8,0)=${at(-8, 0).toFixed(2)}`);
}

// Control: a plaque with nothing on it.
check('A control: a bare plaque gives nothing', stlToReliefMap(Float32Array.from(plaque(() => 0, 1)), 256) === null);

// ── B: through the picture path and the relief, with the Load Relief settings ──
const m = stlToReliefMap(cases[0][1], 1024)!;
const rgba = reliefMapToRgba(m);
const prep = (tones: number) => prepareImage({ data: rgba, width: m.width, height: m.height }, { background: 0, closeGaps: 0, smooth: 0, tones })!;
const pr = prep(-1);
const P = withRelief(DEFAULT_SPRIG_PARAMETERS, 'data:image/png;base64,', 'test', { ...reliefMapSize(m), maxHeight: m.maxHeight });
check('B settings: Gray, as made, own size', P.heightMode === 'gray' && P.imageTones === -1 && P.width === 28 && P.length === 16 && P.maxHeight === 2,
  `${P.heightMode} tones ${P.imageTones} ${P.width} × ${P.length} h ${P.maxHeight} mold ${P.moldSize}`);
check('B picture aspect = relief aspect', near(pr.aspect, P.width / P.length, 0.02), `${pr.aspect.toFixed(3)} vs ${(P.width / P.length).toFixed(3)}`);
const sample = (rel: ReturnType<typeof buildRelief>, x: number, y: number) => {
  const i = Math.round((x - 2 - rel.x0) / rel.step), j = Math.round((y - 2 - rel.y0) / rel.step);
  return rel.heights[j * rel.nx + i];
};
const rel = buildRelief(pr.source, P, 0.2);
const pts: [number, number][] = [[10, 0], [-8, 6], [13, 0], [10, 4], [-8, 8], [-6, 6]];
let worst = 0;
for (const [x, y] of pts) worst = Math.max(worst, Math.abs(sample(rel, x, y) - field(x, y)));
check('B relief heights match the STL (6 points)', worst < 0.06, `worst ${worst.toFixed(3)} mm`);
check('B background stays plate', sample(rel, -8, -4) === 0 && sample(rel, 2, 9) === 0);
check('B one piece each dome, no thin parts', rel.pieces === 2 && rel.thinSpots === 0, `pieces ${rel.pieces} thin ${rel.thinSpots}`);
// Control: Smooth tones stretch the greys, so the short dome no longer reads 1 mm.
const relS = buildRelief(prep(0).source, P, 0.2);
let worstS = 0;
for (const [x, y] of pts) worstS = Math.max(worstS, Math.abs(sample(relS, x, y) - field(x, y)));
check('B control: Smooth tones (stretched) miss by more', worstS > 2 * worst && worstS > 0.06, `worst ${worstS.toFixed(3)} mm vs ${worst.toFixed(3)}`);
// Control: the same relief standing across x (thin axis x, facing +x) reads unmirrored too.
const acrossX = xf(flat, (x, y, z) => [z, x, y]);
const mx = stlToReliefMap(acrossX, 1024)!;
const atX = (x: number, y: number) => mx.heights[(Math.round((10 - y) / mx.pixelMm) + 2) * mx.width + Math.round((x + 12) / mx.pixelMm) + 2];
check('A standing across x, facing +x: not mirrored', near(atX(10, 0), 2, 0.05) && near(atX(-8, 6), 1, 0.05), `(10,0)=${atX(10, 0).toFixed(2)} (−8,6)=${atX(-8, 6).toFixed(2)}`);

// ── C: a real file, if given ──
const file = process.argv[2];
if (file) {
  const b = readFileSync(file);
  const t0 = Date.now();
  const tris = parseStl(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const mm = stlToReliefMap(tris, 1024);
  if (!mm) check('C real file gives a relief', false);
  else {
    const s = reliefMapSize(mm);
    const Q = withRelief(DEFAULT_SPRIG_PARAMETERS, 'x', 'real', { ...s, maxHeight: mm.maxHeight });
    const p2 = prepareImage({ data: reliefMapToRgba(mm), width: mm.width, height: mm.height }, { background: 0, closeGaps: 0, smooth: 0, tones: -1 })!;
    const r2 = buildRelief(p2.source, Q, 0.2);
    console.log(`INFO  C ${tris.length / 9} tris → ${mm.width}×${mm.height} px at ${mm.pixelMm.toFixed(3)} mm, ${Date.now() - t0} ms`);
    console.log(`INFO  C relief ${s.width.toFixed(1)} × ${s.length.toFixed(1)} mm, ${mm.maxHeight.toFixed(2)} mm high → ${Q.width} × ${Q.length}, mold ${Q.moldSize}`);
    console.log(`INFO  C sprig: max ${r2.maxHeight.toFixed(2)} mm, pieces ${r2.pieces}, thin spots ${r2.thinSpots} (thinnest ${r2.thinnestWidth.toFixed(2)} mm), bare holes ${r2.bareHoles}`);
    check('C real file reads', r2.maxHeight > 0);
  }
}

// ── D: Reset All after Load Relief STL comes back to the relief's own settings (2026-10-30) ──
{
  const st = useSprigStore;
  const D = DEFAULT_SPRIG_PARAMETERS;
  st.setState({ params: { ...D } });
  st.getState().loadRelief('data:image/png;base64,x', 'rel', { width: 47, length: 31, maxHeight: 4.6 });
  const loaded = { ...st.getState().params };
  check('D relief remembered as loaded', loaded.loadedAs === 'relief' && loaded.loadedMaxHeight === loaded.maxHeight && loaded.loadedMoldSize === loaded.moldSize,
    `max ${loaded.maxHeight}, mold ${loaded.moldSize}`);
  // Nothing shows as changed straight after loading.
  const base = drawingDefaults(D, loaded);
  const showChanged = (['heightMode', 'imageTones', 'imageLightest', 'imageBackground', 'edgeSoftness', 'minEdgeThickness', 'maxHeight', 'moldSize'] as const).filter((k) => loaded[k] !== base[k]);
  check('D no amber dots on a fresh relief', showChanged.length === 0, showChanged.join(','));
  check('D control: against the page defaults it WOULD show dots', loaded.heightMode !== D.heightMode && loaded.edgeSoftness !== D.edgeSoftness);
  st.getState().setParams({ heightMode: 'inflate', maxHeight: 2, edgeSoftness: 1.5, imageBackground: 30, widen: 2.5, moldSize: 's140' });
  st.getState().reset();
  const r = st.getState().params;
  const back = (Object.keys(loaded) as (keyof typeof loaded)[]).filter((k) => r[k] !== loaded[k]);
  check('D Reset All = the relief as loaded (Widen back to 0 too)', back.length === 0, back.join(','));
  st.getState().setParams({ edgeSoftness: 1.5, heightMode: 'inflate' });
  st.getState().resetFields(['edgeSoftness', 'heightMode']);
  check('D a dot / section Reset goes back to the relief value', st.getState().params.edgeSoftness === 0 && st.getState().params.heightMode === 'gray');
  // A new drawing forgets it.
  st.getState().loadSvg('<svg/>', 'new', 1);
  st.getState().reset();
  check('D new drawing: Reset All = page defaults again', st.getState().params.loadedAs === 'drawing' && st.getState().params.heightMode === D.heightMode && st.getState().params.edgeSoftness === D.edgeSoftness);
  // A photo with Photo depth keeps Photo depth.
  st.getState().setParams({ heightMode: 'photoDepth', loadedAs: 'photoDepth' });
  st.getState().setParams({ heightMode: 'gray', edgeSoftness: 2 });
  st.getState().reset();
  check('D photo: Reset All keeps Photo depth, the rest default', st.getState().params.heightMode === 'photoDepth' && st.getState().params.edgeSoftness === D.edgeSoftness);
  // Design files.
  const m = mergeSprigParameters(JSON.parse(JSON.stringify(loaded)));
  check('D survives a design file', m.loadedAs === 'relief' && m.loadedMaxHeight === loaded.loadedMaxHeight && m.loadedMoldSize === loaded.loadedMoldSize);
  check('D old file / junk: a plain drawing', mergeSprigParameters({}).loadedAs === 'drawing' && mergeSprigParameters({ loadedAs: 'magic' }).loadedAs === 'drawing');
}

// ── E: a new drawing lists the settings it kept from the last one (2026-10-30) ──
{
  const st = useSprigStore;
  const D = DEFAULT_SPRIG_PARAMETERS;
  st.setState({ params: { ...D, minThickness: 0.8, widen: 3.8, shrinkPercent: 15, resolution: 0.1 }, carried: null });
  st.getState().loadRelief('data:image/png;base64,y', 'logo', { width: 60, length: 50, maxHeight: 5 });
  const c = st.getState().carried;
  check('E relief: lists Min Thickness and Widen, for this drawing', !!c && c.svg === st.getState().params.svg && c.kept.minThickness === 0.8 && c.kept.widen === 3.8, JSON.stringify(c?.kept));
  check('E not the relief\'s own settings, nor mold/Shrink/Resolution', !!c && !(['heightMode', 'edgeSoftness', 'maxHeight', 'shrinkPercent', 'resolution', 'moldSize'] as string[]).some((k) => k in c.kept));
  st.setState({ params: { ...D }, carried: null });
  st.getState().loadSvg('<svg id="a"/>', 'plain', 1);
  check('E control: nothing kept from defaults → empty list', Object.keys(st.getState().carried?.kept ?? { x: 1 }).length === 0);
  st.getState().setParams({ edgeSoftness: 2 });
  st.getState().loadSvg('<svg id="b"/>', 'next', 1);
  check('E SVG: an edited Edge Softness is kept at its value', st.getState().carried?.kept.edgeSoftness === 2);
  st.getState().reset();
  check('E Reset All clears the note', st.getState().carried === null);
}

// ── H: samples load with their own settings (2026-10-30) ──
{
  const st = useSprigStore;
  const D = DEFAULT_SPRIG_PARAMETERS;
  st.setState({ params: { ...D, minThickness: 0.8, widen: 3.8, heightMode: 'photoDepth', edgeSoftness: 2, shrinkPercent: 15 }, carried: null });
  const flower = SPRIG_SAMPLES.find((x) => x.id === 'flower')!;
  st.getState().loadSvg(flower.svg, flower.name, flower.aspect, flower.settings);
  const p = st.getState().params;
  check('H sample: its own settings on', p.heightMode === 'inflate' && p.fillHeight === 60 && p.edgeSoftness === 0.6);
  check('H sample: nothing kept from the last drawing, no kept note', p.minThickness === 0 && p.widen === 0 && st.getState().carried === null);
  check('H sample: mold-making settings untouched (Shrink)', p.shrinkPercent === 15);
  st.getState().loadSvg('<svg id="z"/>', 'mine', 1);
  check('H control: a drawing of your own still keeps settings', st.getState().params.fillHeight === 60 && !!st.getState().carried);
  check('H every sample has settings; picture samples have their file', SPRIG_SAMPLES.every((x) => x.settings && Object.keys(x.settings).length > 0 && (!x.picture || existsSync('public' + x.picture))),
    SPRIG_SAMPLES.map((x) => x.id).join(','));
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
