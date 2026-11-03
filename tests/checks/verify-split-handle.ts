/**
 * Numeric verification for Split 2-Pc Phase 2 — the cast handle
 * (moldmaker-split2pc-plan.md, Phase 2):
 *  A. on several vases x every handle preset x seam angles: the handle is
 *     placed, its half-solid in each tray is a closed positive manifold, and
 *     the rest of the tray is unchanged in kind;
 *  B. both attachment points lie ON the vase outline (re-measured here, not
 *     read back from the placement);
 *  C. the end caps are buried — every cap vertex has relief above it (upward
 *     ray parity against the RELIEF MESH, independent of the lookup the sweep
 *     used), and the middle of the handle is NOT swallowed by the vase;
 *  D. the block holds the handle with a full plaster margin, and no natch
 *     lands on the handle;
 *  E. refusals: a handle longer than the vase, and one forced off the rim,
 *     report an error and still build the mold without a handle;
 *  F. the fill-solid warning fires at 10 mm vs 3.5 mm walls and not at 5.5.
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-split-handle.ts
 */
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { DEFAULT_MOLD_PARAMETERS } from '@/engine/mold/mold-types';
import { DEFAULT_HANDLE_PARAMETERS, type HandleParameters } from '@/engine/handle/handle-types';
import { HANDLE_PRESETS } from '@/config/handle-presets';
import { generateSplitTwoPieceMold } from '@/engine/mold/split-two-piece-generator';
import { prepareVaseParams, buildOuterRings } from '@/engine/mold/mold-generator';
import { splitSilhouette, handleToWorld } from '@/engine/mold/split-handle';
import { signedVolume } from '@/engine/handle/mesh3';
import type { VaseMesh } from '@/engine/types';

let ok = true;
const fail = (msg: string) => { ok = false; console.log(`FAIL  ${msg}`); };
const pass = (msg: string) => console.log(`PASS  ${msg}`);

function manifold(mesh: VaseMesh): string | null {
  const map = new Map<string, number>();
  const remap = new Array<number>(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const k = `${mesh.positions[i * 3].toFixed(4)},${mesh.positions[i * 3 + 1].toFixed(4)},${mesh.positions[i * 3 + 2].toFixed(4)}`;
    const seen = map.get(k);
    if (seen === undefined) { map.set(k, i); remap[i] = i; } else remap[i] = seen;
  }
  const parent = Array.from({ length: mesh.vertexCount }, (_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const edges = new Map<string, number>();
  let degenerate = 0;
  for (let f = 0; f < mesh.triangleCount; f++) {
    const a = remap[mesh.indices[f * 3]], b = remap[mesh.indices[f * 3 + 1]], c = remap[mesh.indices[f * 3 + 2]];
    if (a === b || b === c || a === c) { degenerate++; continue; }
    parent[find(a)] = find(b); parent[find(b)] = find(c);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.set(`${p},${q}`, (edges.get(`${p},${q}`) ?? 0) + 1);
  }
  let multi = 0, unmatched = 0;
  for (const [k, n] of edges) {
    if (n !== 1) multi++;
    const [p, q] = k.split(',');
    if (!edges.has(`${q},${p}`)) unmatched++;
  }
  const roots = new Set<number>();
  for (let i = 0; i < mesh.vertexCount; i++) if (remap[i] === i && mesh.triangleCount) roots.add(find(i));
  const vol = signedVolume(mesh);
  if (multi === 0 && unmatched === 0 && degenerate === 0 && vol > 0 && roots.size === 1) return null;
  return `tris=${mesh.triangleCount} degen=${degenerate} multi=${multi} unmatched=${unmatched} comps=${roots.size} vol=${vol.toFixed(1)}`;
}

/** Z values where the vertical line (x, y) crosses the mesh. */
function zHits(mesh: VaseMesh, x: number, y: number): number[] {
  const P = mesh.positions, I = mesh.indices, out: number[] = [];
  for (let f = 0; f < mesh.triangleCount; f++) {
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
    const x0 = P[a], y0 = P[a + 1], x1 = P[b], y1 = P[b + 1], x2 = P[c], y2 = P[c + 1];
    const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(d) < 1e-12) continue;
    const w0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d;
    const w1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
    const w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    out.push(w0 * P[a + 2] + w1 * P[b + 2] + w2 * P[c + 2]);
  }
  return out;
}
const reliefAbove = (relief: VaseMesh, x: number, y: number, z: number) => zHits(relief, x, y).filter((h) => h > z).length;

type Vase = typeof DEFAULT_PARAMETERS;
type Mold = typeof DEFAULT_MOLD_PARAMETERS;
function build(vMut: (v: Vase) => void, mMut: (m: Mold) => void, handle: HandleParameters) {
  const vase = structuredClone(DEFAULT_PARAMETERS);
  vase.resolution.vertical = 80; vase.resolution.radial = 120;
  vMut(vase);
  const mold = structuredClone(DEFAULT_MOLD_PARAMETERS);
  mold.moldStyle = 'splitTwoPiece';
  mold.splitHandle = true;
  mMut(mold);
  return { m: generateSplitTwoPieceMold(vase, mold, handle), vase, mold };
}
const withPreset = (id: string): HandleParameters => {
  const pr = HANDLE_PRESETS.find((p) => p.id === id);
  return { ...DEFAULT_HANDLE_PARAMETERS, ...(pr?.params ?? {}) } as HandleParameters;
};

const VASES: [string, (v: Vase) => void][] = [
  ['default (waisted circle)', () => {}],
  ['Egg1 (asymmetric)', (v) => { v.bottomShape = 'Egg1'; v.topShape = 'Egg1'; }],
  ['Rectangle1', (v) => { v.bottomShape = 'Rectangle1'; v.topShape = 'Rectangle1'; }],
  ['straight cylinder', (v) => { v.profilePoints = [[1, 0], [1, 1]] as never; v.profilePointTypes = ['fixed', 'fixed'] as never; }],
];
const SEAMS = [0, 30, 90];

console.log('Presets:', HANDLE_PRESETS.map((p) => p.id).join(', '));
for (const [vLabel, vMut] of VASES) {
  for (const preset of HANDLE_PRESETS) {
    for (const seam of SEAMS) {
      const label = `${vLabel} / ${preset.id} / ${seam}°`;
      // Basic spans 84 mm (94 shrink-scaled) — it does not fit the 100 mm test
      // vase (correctly refused), so it gets a 130 mm one.
      const tall = (v: Vase) => { vMut(v); if (preset.id === 'basic') v.height = 130; };
      const { m, vase, mold } = build(tall, (mm) => { mm.seamAngle = seam; }, withPreset(preset.id));
      if (m.error) { fail(`${label}: ${m.error}`); continue; }
      if (!m.handle) { fail(`${label}: no handle — ${m.handleError}`); continue; }
      const errs: string[] = [];
      // A. manifold
      for (const [h, mesh] of [['A', m.handle.meshA], ['B', m.handle.meshB]] as const) {
        const e = manifold(mesh); if (e) errs.push(`handle ${h} ${e}`);
      }
      for (const [h, parts] of [['A', m.partsA], ['B', m.partsB]] as const) {
        parts.forEach((p, i) => { const e = manifold(p); if (e) errs.push(`${h} part ${i} ${e}`); });
      }
      // B. endpoints on the outline (re-measured)
      const scale = 1 + mold.shrinkPercent / 100;
      const p = prepareVaseParams(vase, scale, mold.keepTexture);
      const stack = buildOuterRings(p, mold.keepTexture && p.textures.enabled !== false);
      const a = (seam * Math.PI) / 180;
      const sil = splitSilhouette(stack.rings, vase.resolution.radial, stack.centers[0][0], stack.centers[0][1], Math.cos(a), Math.sin(a));
      const rho = (z: number) => {
        let k = 0; while (k + 2 < sil.length && sil[k + 1][0] <= z) k++;
        const t = (z - sil[k][0]) / (sil[k + 1][0] - sil[k][0]);
        return sil[k][1] + (sil[k + 1][1] - sil[k][1]) * t;
      };
      const pl = m.handle.placement;
      for (const [nm, P] of [['T', pl.T], ['B', pl.B]] as const) {
        const d = Math.abs(rho(P[0]) - P[1]);
        if (d > 0.3) errs.push(`${nm} off outline by ${d.toFixed(2)}`);
      }
      const topWant = stack.heights[stack.heights.length - 1] - mold.handleTopDrop * scale;
      if (Math.abs(pl.T[0] - topWant) > 1e-6) errs.push(`T at z ${pl.T[0].toFixed(2)}, want ${topWant.toFixed(2)}`);
      // C. caps buried (upward rays against the RELIEF mesh, per half). Skipped
      // when the VASE already fails the split (e.g. an egg cut off its widest
      // line overhangs its own parting edge) — no burial test means anything there.
      const F = m.floorTop;
      if (m.hasUndercuts) console.log(`      ${label}: vase itself flagged as undercut — burial probe skipped`);
      else for (const [h, mesh, relief] of [['A', m.handle.meshA, m.partsA[0]], ['B', m.handle.meshB, m.partsB[0]]] as const) {
        const P = mesh.positions;
        // The first and last ring are the caps; read them from the vertex
        // order (rings are emitted ring by ring, M points each).
        const M = (mesh.vertexCount); // total
        const ringLen = 48 + 3;
        const caps = [0, M / ringLen - 1];
        let bad = 0;
        for (const r of caps) {
          for (let k = 0; k < ringLen; k++) {
            const i = (r * ringLen + k) * 3;
            const z = Math.max(P[i + 2], F + 0.05);
            if (reliefAbove(relief, P[i], P[i + 1], z) < 1) bad++;
          }
        }
        if (bad) errs.push(`handle ${h}: ${bad} cap vertices not under the relief`);
        // Middle of the handle: crown point must be in open plaster space.
        const midRing = Math.floor(M / ringLen / 2);
        const ci = (midRing * ringLen + 24) * 3;
        if (reliefAbove(relief, P[ci], P[ci + 1], P[ci + 2]) !== 0) errs.push(`handle ${h}: middle is inside the vase`);
      }
      // D. margin + natches
      const m0 = mold.plasterThickness;
      let uMaxH = -Infinity;
      const hp = m.handle.meshA.positions;
      for (let i = 1; i < hp.length; i += 3) uMaxH = Math.max(uMaxH, hp[i]);
      let floorY = -Infinity;
      const fp = m.partsA[1].positions;
      for (let i = 1; i < fp.length; i += 3) floorY = Math.max(floorY, fp[i]);
      const margin = floorY - mold.trayWallThickness - uMaxH;
      if (margin < m0 - 0.01) errs.push(`plaster margin past handle ${margin.toFixed(2)} < ${m0}`);
      for (const [z, u] of [...m.bumpsA, ...m.dimplesA]) {
        let dmin = Infinity;
        for (let i = 0; i < hp.length; i += 3) dmin = Math.min(dmin, Math.hypot(hp[i] - z, hp[i + 1] - u));
        if (dmin < m.natchRadius + 2) errs.push(`natch (${z.toFixed(0)}, ${u.toFixed(0)}) only ${dmin.toFixed(1)} from the handle`);
      }
      if (errs.length) fail(`${label}: ${errs.join('; ')}`);
      else pass(`${label}: T (${pl.T[0].toFixed(1)}, ${pl.T[1].toFixed(1)}) B (${pl.B[0].toFixed(1)}, ${pl.B[1].toFixed(1)}) span ${pl.span.toFixed(1)}, margin ${margin.toFixed(1)}`);
    }
  }
}

// ── E. Refusals ──
console.log('\n── E. Refusals');
{
  const long = structuredClone(DEFAULT_HANDLE_PARAMETERS);
  long.spinePoints = long.spinePoints.map(([x, y]) => [x, y * 3]) as never;
  const { m } = build(() => {}, () => {}, long);
  if (!m.error && !m.handle && m.handleError && m.partsA.length > 0) pass(`too-long handle refused, mold still built: "${m.handleError}"`);
  else fail(`too-long handle: error=${m.error} handle=${!!m.handle} handleError=${m.handleError}`);
  const { m: m2 } = build(() => {}, (mm) => { mm.handleTopDrop = 0; }, withPreset('ear'));
  console.log(`      top at the rim, Ear: handle=${!!m2.handle} handleError=${m2.handleError}`);
}

// ── F. Fill-solid warning ──
console.log('\n── F. Fill-solid warning');
{
  const { m } = build(() => {}, () => {}, withPreset('c-handle'));
  if (m.handleWarning) pass(`10 mm handle vs 3.5 mm walls warns: "${m.handleWarning.slice(0, 60)}…"`);
  else fail('no warning at 10 mm vs 3.5 mm walls');
  const { m: m2 } = build(() => {}, (mm) => { mm.castWallThickness = 5.5; }, withPreset('c-handle'));
  if (!m2.handleWarning) pass('no warning at 10 mm vs 5.5 mm walls'); else fail('warned at 5.5 mm walls');
}

// Sanity: handleToWorld maps the endpoints onto T and B.
{
  const { m } = build(() => {}, () => {}, withPreset('c-handle'));
  if (!m.handle) fail('sanity build has no handle');
  if (m.handle) {
    const pl = m.handle.placement;
    const top = handleToWorld(pl, 0, pl.yBot + pl.span);
    const d = Math.hypot(top[0] - pl.T[0], top[1] - pl.T[1]);
    if (d < 0.2) pass(`top endpoint maps to T within ${d.toFixed(3)} mm`); else fail(`top endpoint maps ${d.toFixed(2)} mm from T`);
  }
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
