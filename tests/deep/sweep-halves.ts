/** Deep: Split Halves across shapes, sizes, foot and mark — and with the cast-on handle. */
import { sweep, moldCases, REPRESENTATIVE, type Case } from '../lib/sweep';
const handled: Case[] = REPRESENTATIVE.flatMap((s) => [120, 160, 250].map((height): Case =>
  ({ vase: { bottomShape: s, topShape: s, height, radius: 40 }, mold: { moldStyle: 'splitHalves', splitHandle: true }, handle: true })));
sweep('sweep-halves', [...moldCases('splitHalves'), ...handled]);
