/** Deep: every shape × size × shell variant × foot/mark, as a printed vase. */
import { sweep, SHAPES, SIZES, type Case, type Size } from '../lib/sweep';

const cases: Case[] = [];
for (const s of SHAPES) for (const size of Object.keys(SIZES) as Size[]) {
  const vase = { bottomShape: s, topShape: s, ...SIZES[size] };
  cases.push({ vase }, { vase: { ...vase, bottomThickness: 0 } }, { vase: { ...vase, bottomThickness: 6 } },
    { vase: { ...vase, innerOffsetMode: 'perpendicular' } }, { vase, mark: 'impressed' }, { vase, mark: 'raised' });
}
sweep('sweep-vase', cases);
