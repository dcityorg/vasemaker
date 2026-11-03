/**
 * Settings sweeps for the deep suite (`npm run test:deep`). Each tests/deep/
 * sweep file picks a slice so the runner spreads them over the cores.
 *
 * A case passes when it builds with finite coordinates and every exported
 * part is a closed, outward solid (tests/lib/solid.ts) — OR the generator
 * refuses it with its own message (a handle that does not fit, say). Refusals
 * are counted and listed, not failed: the app shows those to the user. A throw,
 * a NaN or an open part is a failure, printed with the exact overrides to
 * rebuild it, and written to test-results/<file>-failures.json.
 *
 * Resolution is reduced (80 × 120) so a sweep fits in minutes; the goldens
 * and the quick checks cover full resolution.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { shapeRegistry } from '@/engine/shapes';
import type { ShapeType, VaseParameters } from '@/engine/types';
import { applyPreset } from '@/presets';
import { DEFAULT_MOLD_PARAMETERS, type MoldParameters, type MoldStyle } from '@/engine/mold/mold-types';
import { DEFAULT_HANDLE_PARAMETERS } from '@/engine/handle/handle-types';
import { setBottomMarkField } from '@/engine/bottom';
import { buildRelief, type SprigSource } from '@/engine/sprig/relief';
import { DEFAULT_MARK_PARAMETERS } from '@/engine/sprig/sprig-types';
import { generateMesh } from '@/engine/mesh-generator';
import { buildMold } from './load';
import { meshesOf } from './fingerprint';
import { solidReport, isSolid, describe } from './solid';

export const SHAPES = Object.keys(shapeRegistry) as ShapeType[];
/** Four shapes that stress different things: round, cornered, concave, self-crossing. */
export const REPRESENTATIVE: ShapeType[] = ['Circle1', 'Square1', 'Heart1', 'Rose1'];

export const SIZES = {
  small: { radius: 15, height: 40 },
  default: { radius: 30, height: 100 },
  large: { radius: 80, height: 250 },
} as const;
export type Size = keyof typeof SIZES;

export interface Case {
  /** Overrides on the default vase, reproducible as is. */
  vase: Partial<VaseParameters>;
  /** Overrides on the default mold; absent = vase only. */
  mold?: Partial<MoldParameters>;
  handle?: boolean;
  /** A synthetic F mark on the bottom (the foot must be on for it to show). */
  mark?: 'impressed' | 'raised';
}

const RES = { vertical: 80, radial: 120 };

/** The F mark from verify-bottom-mark, 15 × 21 mm. */
const MARK = (() => {
  const F = ['#####', '#....', '#....', '####.', '#....', '#....', '#....'], s = 12, w = 5 * s, h = 7 * s;
  const pixels = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (F[Math.floor(y / s)][Math.floor(x / s)] === '#') pixels[y * w + x] = 0;
  const src: SprigSource = { pixels, width: w, height: h };
  return buildRelief(src, { ...DEFAULT_MARK_PARAMETERS, width: 15, length: 21, svgAspect: 5 / 7, maxHeight: 0.8, edgeSoftness: 0.1 }, 0.2);
})();

export function vaseOf(c: Case): VaseParameters {
  const base = applyPreset({ parameters: {} });
  const v = { ...base, ...c.vase, resolution: RES } as VaseParameters;
  if (c.mark) v.bottom = { ...v.bottom, footOn: true, markOn: true, markStyle: c.mark };
  return v;
}

type Outcome = { ok: true; refused?: string } | { ok: false; why: string };

export function runCase(c: Case): Outcome {
  const vase = vaseOf(c);
  setBottomMarkField(c.mark ? MARK : null);
  try {
    if (!c.mold) {
      const r = solidReport(generateMesh(vase));
      return isSolid(r) ? { ok: true } : { ok: false, why: `vase: ${describe(r)}` };
    }
    const mold = { ...DEFAULT_MOLD_PARAMETERS, ...c.mold } as MoldParameters;
    const result = buildMold(vase, mold, c.handle ? DEFAULT_HANDLE_PARAMETERS : null) as unknown as Record<string, unknown>;
    const refusal = result.error ?? (c.handle && !result.handle ? result.handleError : null);
    if (refusal) return { ok: true, refused: String(refusal) };
    const bad = meshesOf(result).filter(([, m]) => m.indices.length > 0)
      .map(([p, m]) => [p, solidReport(m)] as const).filter(([, r]) => !isSolid(r));
    return bad.length ? { ok: false, why: bad.map(([p, r]) => `${p}: ${describe(r)}`).join('; ') } : { ok: true };
  } catch (e) {
    return { ok: false, why: `THREW ${(e as Error).message}` };
  } finally {
    setBottomMarkField(null);
  }
}

/** Run every case, print a summary, exit 0/1. `name` = the deep file, for the failure log. */
export function sweep(name: string, cases: Case[]) {
  const failures: (Case & { why: string })[] = [];
  const refused = new Map<string, number>();
  const t0 = Date.now();
  for (const c of cases) {
    const r = runCase(c);
    if (!r.ok) { failures.push({ ...c, why: r.why }); console.log(`FAIL  ${JSON.stringify(c)} — ${r.why}`); }
    else if (r.refused) refused.set(r.refused, (refused.get(r.refused) ?? 0) + 1);
  }
  const nRefused = [...refused.values()].reduce((a, b) => a + b, 0);
  for (const [msg, n] of refused) console.log(`      refused ×${n}: ${msg}`);
  const built = cases.length - failures.length - nRefused;
  if (!failures.length) console.log(`PASS  ${name}: ${cases.length} cases — ${built} built as closed solids, ${nRefused} refused by the app with a message (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  else console.log(`\n${failures.length} of ${cases.length} FAILED — rebuild one with tests/lib/sweep.ts runCase(<the JSON above>)`);
  mkdirSync(join(process.cwd(), 'test-results'), { recursive: true });
  writeFileSync(join(process.cwd(), 'test-results', `${name}-failures.json`), JSON.stringify(failures, null, 1));
  process.exit(failures.length ? 1 : 0);
}

/** The standard grid for one mold style. */
export function moldCases(style: MoldStyle, extra: Partial<MoldParameters> = {}): Case[] {
  const mold = { moldStyle: style, ...extra };
  const cases: Case[] = [];
  // Every shape, straight and morphing into another, at the default size.
  SHAPES.forEach((s, i) => {
    cases.push({ vase: { bottomShape: s, topShape: s }, mold });
    cases.push({ vase: { bottomShape: s, topShape: SHAPES[(i + 7) % SHAPES.length] }, mold });
  });
  // Representative shapes × sizes × foot / mark.
  for (const s of REPRESENTATIVE) for (const size of Object.keys(SIZES) as Size[]) {
    const vase = { bottomShape: s, topShape: s, ...SIZES[size] };
    cases.push({ vase, mold });
    cases.push({ vase: { ...vase, bottom: { ...DEFAULT_BOTTOM, footOn: true } }, mold });
    cases.push({ vase, mold, mark: 'impressed' });
    cases.push({ vase, mold, mark: 'raised' });
  }
  return cases;
}
const DEFAULT_BOTTOM = applyPreset({ parameters: {} }).bottom;
