/**
 * Verify the seat joint — where the master's underside meets the plate's
 * support lip. That joint is where Gary's 2026-07-30 pour leaked, and as of
 * 2026-08-08 it is a plain FLAT LAND again: the V ridge/groove pair that lived
 * here from 2026-07-31 is gone, because the groove had to be cut into a solid
 * floor under the master's channel and Gary wanted that floor gone (a
 * closed-bottomed master is very hard to pry out of set plaster). Seat Depth
 * and Fit Clearance do the sealing now.
 *
 * Vertex probes prove nothing here: several times in this codebase a feature
 * existed in the mesh and NOT in the solid (buried by an overlapping solid, a
 * zero-width feasibility bracket, a V overrunning its host) while every
 * manifold check passed. So everything below is a ray cast against the
 * finished solids.
 *
 *  A. SEATING — nowhere may the plate's top surface stand above the master's
 *     underside. Catches both "something jacks the master off the lip" and
 *     "the master doesn't fit the pocket"; either lifts the whole master and
 *     lets plaster under all of it.
 *  B. FLAT LAND — wherever the master's skirt bottom rests on the plate, BOTH
 *     surfaces are at exactly z = −seat. A leftover ridge or groove on either
 *     side shows up here as a mismatch, and the contact count proves the master
 *     really lands on the lip rather than bridging it.
 *  C. OPEN CHANNEL — an upward ray through the crown of the strap crosses two
 *     surfaces, not four: the underside is open along its whole length, which
 *     is what you get a tool into to lever the master out of the plaster.
 *  D. TAPE — the access hole runs back under the wells but stops short of the
 *     wall, leaving a lip for the master to sit on.
 *  E. RIBS — the pull-ribs add solids and plastic to the MASTER and change the
 *     plate and wall not at all. They sit inside the shell; one that reached
 *     the outer skin would be moulded into the cast handle.
 *  F. TIE BARS — each one really BRIDGES the tape hole: its centre is over open
 *     hole and both its ends are buried in plate that exists without it. A bar
 *     that ends inside the slot ties nothing to anything and looks identical in
 *     the viewport. They change the master and the wall not at all.
 *
 * Run: npx tsx --tsconfig tsconfig.json tests/checks/verify-handle-seal.ts
 *      npx tsx --tsconfig tsconfig.json <this file> mydesign.json
 */
import { DEFAULT_HANDLE_PARAMETERS, type HandleParameters } from '@/engine/handle/handle-types';
import { HANDLE_PRESETS } from '@/config/handle-presets';
import { generateHandleMold } from '@/engine/handle/handle-generator';
import { weldMesh, type P2 } from '@/engine/handle/mesh3';
import type { VaseMesh } from '@/engine/types';

/** Triangles bucketed by XY cell, so a vertical ray touches only a few. */
class ZProbe {
  private cell: number;
  private x0 = Infinity; private y0 = Infinity;
  private nx = 1; private ny = 1;
  private buckets: number[][] = [];
  constructor(private mesh: VaseMesh, cell = 4) {
    this.cell = cell;
    let x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const x = mesh.positions[i * 3], y = mesh.positions[i * 3 + 1];
      if (x < this.x0) this.x0 = x; if (x > x1) x1 = x;
      if (y < this.y0) this.y0 = y; if (y > y1) y1 = y;
    }
    this.nx = Math.max(1, Math.ceil((x1 - this.x0) / cell) + 1);
    this.ny = Math.max(1, Math.ceil((y1 - this.y0) / cell) + 1);
    this.buckets = Array.from({ length: this.nx * this.ny }, () => []);
    const P = mesh.positions;
    for (let f = 0; f < mesh.triangleCount; f++) {
      let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
      for (let k = 0; k < 3; k++) {
        const p = mesh.indices[f * 3 + k] * 3;
        ax = Math.min(ax, P[p]); bx = Math.max(bx, P[p]);
        ay = Math.min(ay, P[p + 1]); by = Math.max(by, P[p + 1]);
      }
      const i0 = this.col(ax), i1 = this.col(bx), j0 = this.row(ay), j1 = this.row(by);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this.buckets[j * this.nx + i].push(f);
    }
  }
  private col(x: number) { return Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.x0) / this.cell))); }
  private row(y: number) { return Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.y0) / this.cell))); }
  /** z of every surface crossing on the upward ray at (x, y), sorted. */
  zs(x: number, y: number): number[] {
    const P = this.mesh.positions;
    const out: number[] = [];
    for (const f of this.buckets[this.row(y) * this.nx + this.col(x)]) {
      const ia = this.mesh.indices[f * 3] * 3, ib = this.mesh.indices[f * 3 + 1] * 3, ic = this.mesh.indices[f * 3 + 2] * 3;
      const ax = P[ia], ay = P[ia + 1], az = P[ia + 2];
      const e1x = P[ib] - ax, e1y = P[ib + 1] - ay, e1z = P[ib + 2] - az;
      const e2x = P[ic] - ax, e2y = P[ic + 1] - ay, e2z = P[ic + 2] - az;
      const det = e1x * -e2y + e1y * e2x;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const tx = x - ax, ty = y - ay;
      const u = (tx * -e2y + ty * e2x) * inv;
      if (u < 0 || u > 1) continue;
      const v = (tx * e1y - ty * e1x) * inv;
      if (v < 0 || u + v > 1) continue;
      out.push(az + u * e1z + v * e2z);
    }
    return out.sort((a, b) => a - b);
  }
}

function run(label: string, p: HandleParameters): boolean {
  const m = generateHandleMold(p);
  const seat = p.seatDepth;
  const master = new ZProbe(m.master);
  const plate = new ZProbe(m.plate);

  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (let i = 0; i < m.master.vertexCount; i++) {
    const x = m.master.positions[i * 3], y = m.master.positions[i * 3 + 1];
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
    if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  const xCav0 = -m.layout.cavW / 2;
  const xWall = xCav0 + p.coneLength + p.cylinderLength;

  // ── A. seating + B. flat land ─────────────────────────────────────────────
  // One sweep: at every sample the master's LOWEST surface is compared with the
  // plate's HIGHEST surface below the parting plane.
  const STEP = 0.3;
  const TOL = 0.02;
  /** Must match TIE_DROP in mold-parts.ts. */
  const TIE_DROP = 0.2;
  let clash = 0, worst = 0;
  let worstAt: [number, number] = [0, 0];
  let contact = 0, mismatch = 0, worstMismatch = 0, onTie = 0;
  for (let x = bx0 + 0.05; x <= bx1; x += STEP) {
    for (let y = by0 + 0.05; y <= by1; y += STEP) {
      const mz = master.zs(x, y);
      if (!mz.length) continue;
      const pz = plate.zs(x, y).filter((z) => z < 0.05);
      if (!pz.length) continue;
      const top = pz[pz.length - 1];
      const gap = mz[0] - top;
      if (gap < -TOL) { clash++; if (-gap > worst) { worst = -gap; worstAt = [x, y]; } }
      // On the skirt bottom (the shell rails and the solid transition), the
      // master reaches z = −seat. Under it the plate must be the flat lip at
      // exactly the same height — no ridge standing up, no groove cut down.
      if (Math.abs(mz[0] + seat) < TOL) {
        contact++;
        const err = Math.abs(top + seat);
        // A tie bar's top is deliberately TIE_DROP below the lip, and the
        // master's shell rail overhangs the lip's inner edge by shellT −
        // (lipWidth − clearance) — 0.1 mm on the defaults — so a sliver of rail
        // does sit over a bar. That is the bar being NOT a seating surface,
        // which is the whole point of the drop; it is not a groove in the lip.
        if (err > TOL && Math.abs(err - TIE_DROP) < TOL) onTie++;
        else if (err > TOL) { mismatch++; worstMismatch = Math.max(worstMismatch, err); }
      }
    }
  }
  const seatOk = clash === 0;
  console.log(`${seatOk ? 'PASS' : 'FAIL'}  ${label} — seating: ${clash} samples where the plate stands above the master's underside` +
    (clash ? `, worst ${worst.toFixed(2)} mm at x=${worstAt[0].toFixed(2)} y=${worstAt[1].toFixed(2)} (raw x=${(worstAt[0] - xWall).toFixed(2)})` : ''));

  // The rail-over-bar sliver is legitimate but it must stay a sliver: if a
  // large fraction of the contact band were over a bar, the bars would be wide
  // enough to be carrying the master instead of the lip.
  const landOk = mismatch === 0 && contact > 200 && onTie < contact * 0.05;
  console.log(`${landOk ? 'PASS' : 'FAIL'}  ${label} — flat land: ${contact} samples rest on the lip, ` +
    `${mismatch} where the plate is not flat at z=${(-seat).toFixed(2)}` +
    (mismatch ? ` (worst ${worstMismatch.toFixed(2)} mm)` : '') +
    (onTie ? `; ${onTie} over a tie bar ${TIE_DROP} mm below (legal)` : ''));

  // ── C. open channel ───────────────────────────────────────────────────────
  // Along the crown of the strap an upward ray must cross exactly two surfaces
  // (inner ceiling, outer skin). Four means the channel has been floored again.
  //
  // Sampled clear of the wells: the transition is a SOLID funnel that overlaps
  // the body by design, and a ray through the overlap legitimately crosses four
  // surfaces. It ends at the tip plane 2 mm past the wall, so 5 mm past the
  // wall is body and nothing else.
  //
  // A crown ray crosses 2 where the channel is open and 4 where a PULL RIB
  // bridges it (outer skin, rib crest, shell underside, rib floor) — so both
  // counts are legal and anything else is not. A floored channel would read 4
  // everywhere, which is what this still has to catch.
  const xStrap0 = xWall + 5;
  let probed = 0, open = 0, ribbed = 0, weird = 0;
  for (let i = 1; i < 40; i++) {
    // Walk the master's own top surface: pick the highest triangle centroid in
    // each of 40 x-slices so the ray is guaranteed to go through the crown.
    const xLo = xStrap0 + ((bx1 - 1 - xStrap0) * i) / 41;
    let bestZ = -Infinity, cx = 0, cy = 0;
    for (let f = 0; f < m.master.triangleCount; f++) {
      let zs = 0, xs = 0, ys = 0;
      for (let k = 0; k < 3; k++) {
        const o = m.master.indices[f * 3 + k] * 3;
        xs += m.master.positions[o]; ys += m.master.positions[o + 1]; zs += m.master.positions[o + 2];
      }
      xs /= 3; ys /= 3; zs /= 3;
      if (Math.abs(xs - xLo) > (bx1 - bx0) / 82) continue;
      if (zs > bestZ) { bestZ = zs; cx = xs; cy = ys; }
    }
    if (bestZ < 0) continue;
    probed++;
    const n = master.zs(cx, cy).length;
    if (n === 2) open++;
    else if (n === 4) ribbed++;
    else weird++;
  }
  const openOk = probed > 10 && weird === 0 && open > probed * 0.6;
  console.log(`${openOk ? 'PASS' : 'FAIL'}  ${label} — open channel: ${open}/${probed} crown rays cross 2 surfaces ` +
    `(${ribbed} cross 4 = on a pull rib, ${weird} something else; all 4 = floored)`);

  // ── D. tape hole ──────────────────────────────────────────────────────────
  // Probe on each well's axis: solid at the wall lip, open further in.
  const wellY: number[] = [];
  {
    let run2 = false, sum = 0, n = 0;
    for (let y = by0; y <= by1; y += 0.2) {
      const on = master.zs(xCav0 + 2, y).length > 0;
      if (on) { sum += y; n++; }
      if (!on && run2) { wellY.push(sum / n); sum = 0; n = 0; }
      run2 = on;
    }
    if (run2 && n) wellY.push(sum / n);
  }
  const solidAt = (x: number, y: number) => plate.zs(x, y).some((z) => z < -seat + 0.01 && z > -seat - m.layout.plateThk - 0.01);
  const lipSolid = wellY.length === 2 && wellY.every((y) => solidAt(xCav0 + 0.6, y));
  const holeOpen = wellY.length === 2 && wellY.every((y) => !solidAt(xCav0 + p.lipWidth + 2, y));
  const tapeOk = lipSolid && holeOpen;
  console.log(`${tapeOk ? 'PASS' : 'FAIL'}  ${label} — tape: ${wellY.length} wells found; wall lip solid ${lipSolid}; hole open under the wells ${holeOpen}`);

  // ── E. pull ribs ──────────────────────────────────────────────────────────
  // The ribs live INSIDE the master's shell, so they must add solids and
  // volume to the master and leave the plate and the plaster cavity untouched.
  // That is the invariant worth testing: a rib that reached the outer skin
  // would be moulded into the cast handle.
  // Welded first: extrudeSolid emits its two caps as fresh vertices rather than
  // reusing the side-wall rings, so an unwelded count reads ONE extruded solid
  // as three components. (The rib sweeps share their ring vertices, which is
  // why the rib test below counted correctly without this.)
  const comps = (raw: VaseMesh): number => {
    const mesh = weldMesh(raw);
    const parent = new Int32Array(mesh.vertexCount);
    for (let i = 0; i < parent.length; i++) parent[i] = i;
    const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    for (let t = 0; t < mesh.indices.length; t += 3) {
      for (const [a, b] of [[0, 1], [1, 2]] as const) {
        const x = find(mesh.indices[t + a]), y = find(mesh.indices[t + b]);
        if (x !== y) parent[x] = y;
      }
    }
    const roots = new Set<number>();
    for (let i = 0; i < mesh.vertexCount; i++) roots.add(find(i));
    return roots.size;
  };

  let ribOk = true;
  if (p.ribWidth > 0.2) {
    const bare = generateHandleMold({ ...p, ribWidth: 0 });
    const added = comps(m.master) - comps(bare.master);
    const dVol = m.masterStats.volumeMm3 - bare.masterStats.volumeMm3;
    const plateSame = Math.abs(m.plateStats.volumeMm3 - bare.plateStats.volumeMm3) < 1e-6;
    const wallSame = Math.abs(m.wallStats.volumeMm3 - bare.wallStats.volumeMm3) < 1e-6;
    // Strap ribs are two halves each when Rib Slot is on (2026-11-01); one per well, solid.
    const slotted = (p.ribSlot ?? 0) >= 0.2;
    const expect = Math.round(p.ribCount) * (slotted ? 2 : 1) + 2;
    ribOk = added === expect && dVol > 0 && plateSame && wallSame;
    // Control: the same handle with solid ribs has one solid per strap rib, and
    // MORE plastic than the slotted one (the slot is removed material).
    const solid = generateHandleMold({ ...p, ribSlot: 0 });
    const addedSolid = comps(solid.master) - comps(bare.master);
    const slotVol = solid.masterStats.volumeMm3 - m.masterStats.volumeMm3;
    const ctlOk = addedSolid === Math.round(p.ribCount) + 2 && (!slotted || slotVol > 0)
      && Math.abs(solid.plateStats.volumeMm3 - m.plateStats.volumeMm3) < 1e-6;
    ribOk = ribOk && ctlOk;
    console.log(`${ribOk ? 'PASS' : 'FAIL'}  ${label} — ribs: +${added} solids (expect ${expect}), ` +
      `+${(dVol / 1000).toFixed(2)} cm³ of plastic, plate unchanged ${plateSame}, wall unchanged ${wallSame}; ` +
      `solid-rib control +${addedSolid} solids, slot removes ${(slotVol / 1000).toFixed(3)} cm³`);
  }

  // ── F. tie bars ───────────────────────────────────────────────────────────
  // A bar only does its job if it joins two pieces of plate that the tape hole
  // had separated. Both failure modes look identical in the viewport: a bar
  // buried entirely in solid plate ties nothing, and a bar whose ends stop
  // inside the slot is a stub hanging off one side. So each is probed against
  // the plate built WITHOUT bars — centre must be open there, both ends solid.
  let tieOk = true;
  if (p.tieBarWidth > 0.2 && Math.round(p.tieBarCount) > 0) {
    const bare = generateHandleMold({ ...p, tieBarCount: 0 });
    const bareProbe = new ZProbe(bare.plate);
    const zMid = -seat - (m.layout.plateThk - seat) / 2; // mid-height of the lip slab
    const inside = (x: number, y: number): boolean =>
      bareProbe.zs(x, y).filter((z) => z > zMid).length % 2 === 1;
    let bridging = 0;
    for (const bar of m.tieBars) {
      // The rectangle is [end+, end+, end−, end−] along the bar axis, so the
      // two end midpoints are the midpoints of edges 0–3 and 1–2.
      const mid = (a: P2, b: P2): P2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const e0 = mid(bar[0], bar[3]), e1 = mid(bar[1], bar[2]);
      const c = mid(e0, e1);
      // Pull the probes 0.5 mm in from the tips so a boundary-grazing ray
      // can't decide the answer.
      const ux = (e0[0] - e1[0]) / 2, uy = (e0[1] - e1[1]) / 2;
      const L = Math.hypot(ux, uy) || 1;
      const p0: P2 = [e0[0] - (ux / L) * 0.5, e0[1] - (uy / L) * 0.5];
      const p1: P2 = [e1[0] + (ux / L) * 0.5, e1[1] + (uy / L) * 0.5];
      if (!inside(c[0], c[1]) && inside(p0[0], p0[1]) && inside(p1[0], p1[1])) bridging++;
    }
    const added = comps(m.plate) - comps(bare.plate);
    const masterSame = Math.abs(m.masterStats.volumeMm3 - bare.masterStats.volumeMm3) < 1e-6;
    const wallSame = Math.abs(m.wallStats.volumeMm3 - bare.wallStats.volumeMm3) < 1e-6;
    tieOk = m.tieBars.length > 0 && bridging === m.tieBars.length &&
      added === m.tieBars.length && masterSame && wallSame;
    console.log(`${tieOk ? 'PASS' : 'FAIL'}  ${label} — tie bars: ${m.tieBars.length}/${Math.round(p.tieBarCount)} placed, ` +
      `${bridging} genuinely bridge the tape hole, +${added} plate solids, ` +
      `master unchanged ${masterSame}, wall unchanged ${wallSame}`);
  }

  return seatOk && landOk && openOk && tapeOk && ribOk && tieOk;
}

// An explicit params file can be checked instead of the built-in shapes:
//   npx tsx --tsconfig tsconfig.json <this file> mydesign.json
// (a Save Settings file, or a bare params object).
const argFile = process.argv[2];
if (argFile) {
  const raw = JSON.parse(require('fs').readFileSync(argFile, 'utf8'));
  // Save Settings writes { app, type, settings } — reading `params` alone found
  // nothing, spread the wrapper onto the defaults and silently verified the
  // DEFAULT design while printing the filename (found 2026-08-01).
  const body = raw.settings ?? raw.params ?? raw;
  if (!Array.isArray(body.spinePoints)) throw new Error(`${argFile}: no spinePoints — is this a handle-settings file?`);
  const ok0 = run(argFile, { ...DEFAULT_HANDLE_PARAMETERS, ...body });
  console.log(ok0 ? '\nALL PASS' : '\nFAILURES PRESENT');
  process.exit(ok0 ? 0 : 1);
}
let ok = run('default', DEFAULT_HANDLE_PARAMETERS);
for (const preset of HANDLE_PRESETS) {
  ok = run(preset.name, { ...DEFAULT_HANDLE_PARAMETERS, ...preset.params }) && ok;
}
// Shapes that stress the well end and the seat specifically: a stubby well
// leaves almost no room at the wall, a fat strap pushes the skirt out toward
// the transition's flank, and the seat extremes exercise the pocket depth.
for (const [name, over] of [
  ['short well', { cylinderLength: 4, coneLength: 6 }],
  ['fat handle', { width: 22, thickness: 18 }],
  ['thin handle', { width: 8, thickness: 6 }],
  ['big opening', { openingDiameter: 26 }],
  ['shallow seat', { seatDepth: 0.5 }],
  ['deep seat', { seatDepth: 6 }],
  ['zero clearance', { recessClearance: 0 }],
  // Steep hooks are the class that broke the old seal-line solve (2026-08-01,
  // Gary's Ear Test.json). Narrow strap + steep departure + free endpoint y is
  // still the combination most likely to foul the pocket wall.
  ['steep hook', {
    spinePoints: [[0, -17.5], [30, 11], [55, 41], [30, 82], [0, 63]],
    spineTypes: ['fixed', 'handle', 'handle', 'handle', 'fixed'],
    width: 9, thickness: 16,
  }],
  ['steep hook, mirrored', {
    spinePoints: [[0, -17.5], [30, 22], [55, 41], [30, 71], [0, 63]],
    spineTypes: ['fixed', 'handle', 'handle', 'handle', 'fixed'],
    width: 9, thickness: 16,
  }],
  ['narrow strap, steep out', {
    spinePoints: [[0, 0], [34, -20], [60, 32], [34, 84], [0, 64]],
    spineTypes: ['fixed', 'handle', 'handle', 'handle', 'fixed'],
    width: 7, thickness: 18,
  }],
] as [string, Partial<HandleParameters>][]) {
  ok = run(name, { ...DEFAULT_HANDLE_PARAMETERS, ...over }) && ok;
}
console.log(ok ? '\nALL PASS' : '\nFAILURES PRESENT');
process.exit(ok ? 0 : 1);
