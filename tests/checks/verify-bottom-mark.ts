/**
 * Bottom Mark phase 3 — the mark on the Split Halves / Split Thirds plug disk,
 * and the RETROFIT requirement: an existing plug mold gets a mark by
 * reprinting ONLY the plug disk.
 *   npx tsx --tsconfig tsconfig.json tests/checks/verify-bottom-mark.ts [mold.json …]
 * Default: Gary's four plug molds (private test designs; SKIPPED if absent).
 *
 * Per file:
 * M  migration: an old file's foot (in its mold settings) becomes the vase's
 * C  the app path (vase foot → mold) builds the SAME disk + walls, byte for
 *    byte, as the file's own settings did before the foot moved
 * E  …and the same disk as the STL Gary actually printed (if found)
 * A  with a mark: every part except the disk byte-identical; the disk differs
 *    only inside the recess (vertical rays: same top outside, same bottom and
 *    footprint everywhere, different somewhere inside); closed + wound
 *    a mark deeper than the disk floor allows thickens the disk (walls change,
 *    nothing else); one that just fits changes no wall
 * B  negative control: Plug Height + 0.5 → the walls are NOT identical
 * D  the F test: the cast piece's bottom reads F from below (control: from above)
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { privateDesign } from '../lib/designs';
import { applyPreset } from '@/presets';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { mergeMoldParameters, retireMoldStyle, type MoldParameters } from '@/engine/mold/mold-types';
import { moldWithVaseFoot, footFromMoldSettings, isLegacyFootFile } from '@/engine/mold/vase-foot';
import { generateSplitHalvesMold } from '@/engine/mold/split-halves-generator';
import { generateSplitThirdsMold } from '@/engine/mold/split-thirds-generator';
import { setBottomMarkField } from '@/engine/bottom';
import { buildRelief, type SprigSource } from '@/engine/sprig/relief';
import { DEFAULT_MARK_PARAMETERS } from '@/engine/sprig/sprig-types';
import { generateSTL } from '@/engine/stl-export';
import type { VaseParameters, VaseMesh } from '@/engine/types';
import type { PlugFoot } from '@/engine/mold/plug-cup';

const files = process.argv.length > 2 ? process.argv.slice(2) : (
  ['tumbler4', 'tumbler3', 'mug-a', 'ribbed-waves']
    .map((id) => privateDesign(`molds/${id}.mold.json`, 'M, C, E: a real plug mold'))
    .filter((f): f is string => !!f));

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

// ── The F mark (5 × 7, row 0 at the top), 15 × 21 mm ──
const F = ['#####', '#....', '#....', '####.', '#....', '#....', '#....'];
function fSource(scale = 12): SprigSource {
  const w = 5 * scale, h = 7 * scale;
  const pixels = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (F[Math.floor(y / scale)][Math.floor(x / scale)] === '#') pixels[y * w + x] = 0;
  return { pixels, width: w, height: h };
}
const markParams = { ...DEFAULT_MARK_PARAMETERS, width: 15, length: 21, svgAspect: 5 / 7, maxHeight: 0.8, edgeSoftness: 0.1 };
const relief = buildRelief(fSource(), markParams, 0.2);

type Built = { meshes: [string, VaseMesh][]; foot: PlugFoot; base: [number, number][]; recessD: number; zDisk: number };
function build(vase: VaseParameters, mold: MoldParameters): Built {
  const r = mold.moldStyle === 'splitThirds' ? generateSplitThirdsMold(vase, mold) : generateSplitHalvesMold(vase, mold);
  if (r.error) throw new Error(r.error);
  const foot = r.foot!;
  const meshes: [string, VaseMesh][] = [];
  if (r.style === 'splitHalves') {
    for (const k of ['masterL', 'masterR', 'plateL', 'plateR', 'wellWallL', 'baseWallL', 'wellWallR', 'baseWallR'] as const) meshes.push([k, r[k]]);
  } else {
    r.kits.forEach((kit, i) => { meshes.push([`kit${i} part`, kit.partPrint], [`kit${i} well wall`, kit.wellWallPrint], [`kit${i} base wall`, kit.baseWallPrint]); });
  }
  foot.walls.forEach((w, i) => meshes.push([`plug wall ${i}`, w]));
  const cup = r.style === 'splitHalves' ? r.debug.foot!.cup : r.debug.foot!;
  return { meshes, foot, base: cup.base, recessD: cup.recessDepth, zDisk: cup.zDisk };
}
const bytes = (m: VaseMesh) => Buffer.from(generateSTL(m)).subarray(80);
const same = (a: VaseMesh, b: VaseMesh) => Buffer.compare(bytes(a), bytes(b)) === 0;

/** Vertical rays through a mesh: top and bottom hit z per (x, y), NaN = miss. */
function rays(m: VaseMesh, pts: [number, number][]): { top: number; bot: number }[] {
  const P = m.positions, I = m.indices, C = 2;
  const bins = new Map<string, number[]>();
  for (let t = 0; t < I.length; t += 3) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let e = 0; e < 3; e++) { const q = I[t + e] * 3; x0 = Math.min(x0, P[q]); x1 = Math.max(x1, P[q]); y0 = Math.min(y0, P[q + 1]); y1 = Math.max(y1, P[q + 1]); }
    for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(y0 / C); j <= Math.floor(y1 / C); j++) {
      const k = `${i},${j}`; (bins.get(k) ?? bins.set(k, []).get(k)!).push(t);
    }
  }
  return pts.map(([x, y]) => {
    let top = -Infinity, bot = Infinity;
    for (const t of bins.get(`${Math.floor(x / C)},${Math.floor(y / C)}`) ?? []) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const d = (P[b + 1] - P[c + 1]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 1] - P[c + 1]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((P[b + 1] - P[c + 1]) * (x - P[c]) + (P[c] - P[b]) * (y - P[c + 1])) / d;
      const l2 = ((P[c + 1] - P[a + 1]) * (x - P[c]) + (P[a] - P[c]) * (y - P[c + 1])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const z = l1 * P[a + 2] + l2 * P[b + 2] + l3 * P[c + 2];
      top = Math.max(top, z); bot = Math.min(bot, z);
    }
    return top === -Infinity ? { top: NaN, bot: NaN } : { top, bot };
  });
}
/** Radius of the outline loop along angle th (cup coords, about 0). */
function radiusAt(base: [number, number][], th: number): number {
  const c = Math.cos(th), s = Math.sin(th);
  let best = 0;
  for (let i = 0; i < base.length; i++) {
    const [ax, ay] = base[i], [bx, by] = base[(i + 1) % base.length];
    const ex = bx - ax, ey = by - ay, det = ex * s - ey * c;
    if (Math.abs(det) < 1e-12) continue;
    const t = (ex * ay - ey * ax) / det, u = (c * ay - s * ax) / det;
    if (u >= -1e-9 && u <= 1 + 1e-9 && t > best) best = t;
  }
  return best;
}
function closed(m: VaseMesh): boolean {
  const key = (i: number) => `${Math.round(m.positions[i * 3] * 1e4)},${Math.round(m.positions[i * 3 + 1] * 1e4)},${Math.round(m.positions[i * 3 + 2] * 1e4)}`;
  const id = new Map<string, number>(); const w: number[] = [];
  for (let i = 0; i < m.positions.length / 3; i++) { const k = key(i); if (!id.has(k)) id.set(k, id.size); w.push(id.get(k)!); }
  const dir = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [w[m.indices[t]], w[m.indices[t + 1]], w[m.indices[t + 2]]];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let e = 0; e < 3; e++) { const k = `${v[e]}>${v[(e + 1) % 3]}`; dir.set(k, (dir.get(k) ?? 0) + 1); }
  }
  for (const [k, c] of dir) { const [a, b] = k.split('>'); if (c !== 1 || !dir.has(`${b}>${a}`)) return false; }
  return true;
}

for (const file of files) {
  const name = basename(file, '.json');
  console.log(`\n── ${name} ──`);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const { params: moldRaw } = retireMoldStyle(mergeMoldParameters(raw.settings));

  // M
  check(isLegacyFootFile(raw.vase), 'M  old file: its vase has no bottom, the foot is in the mold settings');
  const foot = footFromMoldSettings(raw.settings);
  check(foot.footOn && foot.footWidth === moldRaw.footWidth && foot.footHeight === moldRaw.footHeight && foot.footSlopeWidth === moldRaw.footSlopeWidth,
    `M  its foot becomes the vase's: on, ${foot.footWidth} / ${foot.footSlopeWidth} / ${foot.footHeight} mm`);
  const vase = applyPreset({ parameters: { ...raw.vase, bottom: { ...DEFAULT_PARAMETERS.bottom, ...foot } } });

  // C: old path (the file's own settings, as v1.51.0 built it) vs the app path
  setBottomMarkField(null);
  const old = build(applyPreset({ parameters: raw.vase }), moldRaw);
  const app = build(vase, moldWithVaseFoot(moldRaw, vase));
  check(same(old.foot.plate, app.foot.plate), 'C  plug disk: app path = the file\'s own settings, byte for byte');
  check(old.meshes.every(([, m], i) => same(m, app.meshes[i][1])), `C  every other part (${old.meshes.length}) identical too`);

  // E: the STL actually printed
  // The disk that was actually printed: `<id>.plug-disk.stl` beside a test
  // design, or `STL Foot/<name> plug disk.stl` beside an original mold file.
  const printed = file.endsWith('.mold.json')
    ? file.replace(/\.mold\.json$/, '.plug-disk.stl')
    : join(dirname(file), 'STL Foot', `${basename(file, ' mold.json')} plug disk.stl`);
  if (existsSync(printed)) {
    const pb = readFileSync(printed).subarray(80);
    const ours = bytes(app.foot.plate);
    if (Buffer.compare(pb, ours) === 0) check(true, `E  the disk is byte-identical to the printed ${basename(printed)}`);
    else {
      // Not the same bytes: how far apart are the solids? Rays over the disk.
      const n = pb.readUInt32LE(0);
      const pos = new Float32Array(n * 9);
      for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) pos[t * 9 + k] = pb.readFloatLE(4 + t * 50 + 12 + k * 4);
      const pm: VaseMesh = { positions: pos, normals: new Float32Array(pos.length), indices: Uint32Array.from({ length: n * 3 }, (_, i) => i), vertexCount: n * 3, triangleCount: n };
      const pts: [number, number][] = [];
      for (let x = -60; x <= 60; x += 1.5) for (let y = -60; y <= 60; y += 1.5) pts.push([x, y]);
      const a = rays(pm, pts), b = rays(app.foot.plate, pts);
      let worst = 0, hitDiff = 0;
      a.forEach((h, i) => { if (Number.isNaN(h.top) !== Number.isNaN(b[i].top)) hitDiff++; else if (!Number.isNaN(h.top)) worst = Math.max(worst, Math.abs(h.top - b[i].top), Math.abs(h.bot - b[i].bot)); });
      check(worst < 0.01 && hitDiff <= 2, `E  the disk matches the printed ${basename(printed)} (not byte-identical: ${n} vs ${app.foot.plate.triangleCount} tris; heights within ${worst.toFixed(4)} mm, ${hitDiff} edge rays differ)`);
    }
  } else console.log(`      (no printed disk STL at ${printed})`);

  // A: with the mark
  setBottomMarkField(relief);
  const marked = { ...vase, bottom: { ...vase.bottom, markOn: true, mark: markParams, markName: 'F' } };
  const withMark = build(marked, moldWithVaseFoot(moldRaw, marked));
  check(app.meshes.every(([, m], i) => same(m, withMark.meshes[i][1])), `A  with a mark, every part but the disk is byte-identical (${app.meshes.length}, incl. the plug walls)`);
  check(!same(app.foot.plate, withMark.foot.plate), 'A  …and the disk is not');
  check(closed(withMark.foot.plate), `A  the marked disk is closed and consistently wound (${withMark.foot.plate.triangleCount} tris)`);
  check(withMark.foot.markNote === null, `A  no depth note at 0.8 mm (${withMark.foot.markNote ?? 'none'})`);
  {
    // Rays in print coords (disk lifted by −zDisk): recess edge = outline − (foot + slope).
    const lift = -app.zDisk;
    const pts: [number, number][] = [];
    for (let x = -50; x <= 50; x += 0.7) for (let y = -50; y <= 50; y += 0.7) pts.push([x, y]);
    const a = rays(app.foot.plate, pts), b = rays(withMark.foot.plate, pts);
    let outside = 0, outsideBad = 0, botBad = 0, hitBad = 0, inside = 0, changed = 0;
    pts.forEach(([x, y], i) => {
      if (Number.isNaN(a[i].top) !== Number.isNaN(b[i].top)) { hitBad++; return; }
      if (Number.isNaN(a[i].top)) return;
      if (Math.abs(a[i].bot - b[i].bot) > 1e-4) botBad++;
      const r = Math.hypot(x, y), rb = radiusAt(app.base, Math.atan2(y, x));
      if (r > rb - (foot.footWidth + foot.footSlopeWidth) + 0.3) {
        outside++;
        const dz = Math.abs(a[i].top - b[i].top);
        if (dz > 1e-4) { outsideBad++; if (process.env.DEBUG_RAYS && outsideBad <= 12) console.log(`      ray (${x.toFixed(1)}, ${y.toFixed(1)}) r ${r.toFixed(2)} of ${rb.toFixed(2)}: top ${a[i].top.toFixed(4)} vs ${b[i].top.toFixed(4)}`); }
      }
      else if (r < rb - (foot.footWidth + foot.footSlopeWidth) - 0.3) { inside++; if (Math.abs(a[i].top - b[i].top) > 0.1) changed++; }
    });
    check(hitBad === 0 && botBad === 0, `A  same footprint and same underside (${hitBad} footprint, ${botBad} underside differences)`);
    check(outside > 100 && outsideBad === 0, `A  foot ring + slope identical: ${outside} rays, ${outsideBad} differ`);
    check(changed > 50, `A  the recess carries the mark: ${changed} of ${inside} rays inside it changed`);
    void lift;
  }

  {
    // Deeper than the disk's floor allows (floor = −zDisk − recess, keep 0.6).
    const floor = -app.zDisk - app.recessD;
    const deep = { ...marked, bottom: { ...marked.bottom, markDepth: floor } };
    const d = build(deep, moldWithVaseFoot(moldRaw, deep));
    // Since 2026-10-27 the disk THICKENS (walls taller) instead of capping the mark.
    const grew = app.zDisk - d.zDisk;
    const plugWall = (n: string) => n.startsWith('plug wall');
    check(Math.abs(grew - 0.6) < 1e-6 && !!d.foot.markNote?.includes('thicker') && closed(d.foot.plate),
      `A  ${floor.toFixed(1)} mm deep on a ${floor.toFixed(1)} mm floor: the disk grows ${grew.toFixed(2)} mm (want 0.60), says so, still closed`);
    check(app.meshes.every(([n, m], i) => plugWall(n) ? !same(m, d.meshes[i][1]) : same(m, d.meshes[i][1])),
      'A  …the plug walls change (taller), every other part is byte-identical');
    const fits = { ...marked, bottom: { ...marked.bottom, markDepth: floor - 0.6 } };
    const f = build(fits, moldWithVaseFoot(moldRaw, fits));
    check(f.zDisk === app.zDisk && f.foot.markNote === null && app.meshes.every(([, m], i) => same(m, f.meshes[i][1])),
      `A  control: ${(floor - 0.6).toFixed(1)} mm (just fits) leaves the disk height and the walls as printed`);
    const up = { ...marked, bottom: { ...marked.bottom, markStyle: 'raised' as const } };
    const u = build(up, moldWithVaseFoot(moldRaw, up));
    check(u.foot.markNote === null && closed(u.foot.plate) && app.meshes.every(([, m], i) => same(m, u.meshes[i][1])), 'A  raised: closed, no note, every other part identical');
  }

  // B: negative control — a different Plug Height must be caught
  const key = moldRaw.moldStyle === 'splitThirds' ? 'thirdsPlugHeight' : 'halvesPlugHeight';
  const taller = { ...moldRaw, [key]: (moldRaw[key] as number) + 0.5 } as MoldParameters;
  const bad = build(marked, moldWithVaseFoot(taller, marked));
  const wallsSame = app.foot.walls.every((w, i) => bad.foot.walls[i] && same(w, bad.foot.walls[i]));
  check(!wallsSame, 'B  control: Plug Height + 0.5 makes the plug walls differ (the identity check can fail)');

  // D: read the cast piece's bottom from below. Disk top (print coords, z up)
  // = the vase bottom turned over about x: vase (x, y, zv) ↔ cup (x, −y, −zv).
  {
    const P = withMark.foot.plate.positions, lift = -app.zDisk, S = 1 + moldRaw.shrinkPercent / 100;
    const read = (fromBelow: boolean) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < P.length; i += 3) {
        const zc = P[i + 2] - lift;                 // cup z
        const zv = -zc;                             // vase z
        if (zv > app.recessD + 0.4 && zv < app.recessD + 1.2) {
          const vx = P[i], vy = -P[i + 1];          // vase plan, about the axis
          pts.push([(fromBelow ? -vx : vx) / S, vy / S]);
        }
      }
      const has = (u0: number, u1: number, v0: number, v1: number) => pts.some(([u, v]) => u >= u0 && u <= u1 && v >= v0 && v <= v1);
      return has(-7, -5, 7, 9) && has(-7, -5, -9, -7) && has(5, 7, 8, 10) && !has(2, 7, -10, -4);
    };
    check(read(true), 'D  the cast bottom reads F, looking up at it');
    check(!read(false), 'D  control: from above it does not');
  }
}
setBottomMarkField(null);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
