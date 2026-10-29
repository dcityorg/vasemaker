'use client';

/**
 * The thin-parts warning with its fixes (Gary, 2026-10-28: "a lot of users
 * will love just a fix-it button", and the engineer wants the slider). Each
 * button sets its setting in one undo step, then the slider for it stays open
 * in the box, so the fix can be taken further or backed off. The box stays
 * after the red has gone, until closed, so the slider does not vanish under
 * the pointer.
 *
 *   Thicken     → Thicken Thin Parts (relief.ts `thicken`), set to Min Feature
 *   Make bigger → Width (and Length), scaled by Min Feature ÷ thinnest; a
 *                 standard mold grows to the smallest one it fits. Offered
 *                 once: a pointed tip reads thin at any size
 *   Shave off   → Round Off Thin Bits; Min Feature is how much it shaves
 */

import { useEffect, useState } from 'react';
import { SliderRow } from '@/components/parameters/ui';
import { SPRIG_PARAMS } from '@/config/sprig-params';
import { smallestFit, fitsBox } from '@/engine/sprig/sprig-generator';
import { SPRIG_SIZES, sprigFootprint, type SprigParameters, type TextSize } from '@/engine/sprig/sprig-types';

type Fix = 'thicken' | 'bigger' | 'shave';

const btn = 'text-[11px] px-2 py-0.5 rounded border border-amber-600 text-amber-100 hover:bg-amber-900/60 transition-colors';

interface Props {
  params: SprigParameters;
  thinSpots: number;
  thinnest: number;
  textSize: TextSize | null;
  setParams: (u: Partial<SprigParameters>) => void;
  setParam: <K extends keyof SprigParameters>(k: K, v: SprigParameters[K]) => void;
  setWidth: (w: number) => void;
}

const up = (x: number) => Math.ceil(x * 2 - 1e-9) / 2;

/** Width, Length and mold for a sprig scaled by `f`. `capped` when no standard
 *  mold takes the whole step, so it stops at the largest that fits. */
function scaled(p: SprigParameters, f: number, text: TextSize | null) {
  // Rounded up to the half mm, or down when that has to fit a mold.
  const at = (g: number, round = up) => {
    const max = SPRIG_PARAMS.width.max;
    const width = Math.min(max, round(p.width * g)), length = Math.min(max, round(p.length * g));
    return { ...p, width, length };
  };
  let next = at(f);
  let capped = false;
  if (p.moldSize !== 'custom') {
    const S = 1 + p.shrinkPercent / 100;
    const [fw, fl] = sprigFootprint(next, text);
    const box = SPRIG_SIZES[p.moldSize];
    if (!fitsBox(fw * S, fl * S, box.cavW, box.cavL, p.plasterMargin)) {
      let k = smallestFit(next, text);
      if (!k) {
        // The largest step a standard mold still takes.
        let lo = 1, hi = f;
        for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (smallestFit(at(mid), text)) lo = mid; else hi = mid; }
        next = at(lo, (x) => Math.max(1, Math.floor(x * 2 + 1e-9) / 2));
        k = smallestFit(next, text);
        capped = true;
      }
      if (k) next = { ...next, moldSize: k };
    }
  }
  return { width: next.width, length: next.length, moldSize: next.moldSize, capped };
}

export function ThinPartsFix({ params: p, thinSpots, thinnest, textSize, setParams, setParam, setWidth }: Props) {
  const [active, setActive] = useState<Fix | null>(null);
  // A new drawing starts without an open fix.
  useEffect(() => { setActive(null); }, [p.svg]);

  if (thinSpots === 0 && !active) return null;

  const mf = p.minFeatureWidth;
  const long = Math.max(p.width, p.length);
  const big = thinSpots > 0 && thinnest > 0 && thinnest < mf ? scaled(p, mf / thinnest, textSize) : null;
  const bigLong = big ? Math.max(big.width, big.length) : long;
  // Once used, the Width slider takes over: a pointed tip reads thin at any
  // size, so the button would offer to grow it again and again.
  const showBig = big && bigLong > long + 0.25 && active !== 'bigger';
  const moldNote = big && big.moldSize !== p.moldSize && big.moldSize !== 'custom' ? `, ${SPRIG_SIZES[big.moldSize].label} mold` : '';

  const apply = (f: Fix) => {
    if (f === 'thicken') setParams({ thickenThin: mf });
    else if (f === 'bigger' && big) setParams({ width: big.width, length: big.length, moldSize: big.moldSize });
    else if (f === 'shave') setParams({ roundThin: true });
    setActive(f);
  };

  return (
    <div className={`mb-2 px-2 py-1.5 rounded border text-xs ${thinSpots > 0 ? 'border-amber-700 bg-amber-950/40 text-amber-200' : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'}`}>
      <div className="flex items-start gap-2">
        <p className="flex-1 leading-snug">
          {thinSpots > 0
            ? `${thinSpots} part${thinSpots === 1 ? '' : 's'} thinner than ${mf} mm (red): thinnest ≈ ${thinnest.toFixed(1)} mm. They may tear coming out of the mold or crack drying.`
            : 'No thin parts left.'}
        </p>
        {active && (
          <button onClick={() => setActive(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] leading-none px-1" title="Close. The fix stays; undo (Cmd/Ctrl+Z) takes it back">×</button>
        )}
      </div>
      {thinSpots > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {p.thickenThin < mf && (
            <button className={btn} onClick={() => apply('thicken')}
              title={`Widen every part thinner than ${mf} mm to about ${mf} mm. Keeps the size. Thin parts close together (toes, fern leaflets) can merge`}>
              Thicken them
            </button>
          )}
          {showBig && (
            <button className={btn} onClick={() => apply('bigger')}
              title={big!.capped
                ? `Scale the whole ${p.width >= p.length ? 'width' : 'length'} up as far as the largest standard mold takes (${SPRIG_SIZES.s140.label} or Long). Not enough on its own: thicken what is still red`
                : `Scale the whole sprig up ×${(bigLong / long).toFixed(1)}, so legs and stalks reach ${mf} mm. Keeps the shape exactly; needs a bigger mold. Pointed tips stay a little red at any size: Thicken or Shave rounds them`}>
              Make it bigger: {Math.round(long)} → {Math.round(bigLong)} mm{moldNote}{big!.capped ? ' (largest mold)' : ''}
            </button>
          )}
          {!p.roundThin && (
            <button className={btn} onClick={() => apply('shave')}
              title={`Remove everything thinner than ${mf} mm: antennae, legs and sharp tips go. Keeps the size`}>
              Shave them off
            </button>
          )}
        </div>
      )}
      {active === 'thicken' && (
        <div className="mt-2 -mx-1">
          <SliderRow label="Thicken" value={p.thickenThin} {...SPRIG_PARAMS.thickenThin} suffix="mm" onChange={(v) => setParam('thickenThin', v)}
            tooltip="Parts thinner than this are widened to about this width. 0 = off. Also under Checks as Thicken Thin Parts" />
        </div>
      )}
      {active === 'bigger' && (
        <div className="mt-2 -mx-1">
          <SliderRow label="Width" value={p.width} {...SPRIG_PARAMS.width} suffix="mm" onChange={setWidth}
            tooltip="FINISHED width. The same slider as under Size; Length follows while 🔗 Lock Proportions is on" />
        </div>
      )}
      {active === 'shave' && (
        <div className="mt-2 -mx-1">
          <SliderRow label="Min Feature" value={p.minFeatureWidth} {...SPRIG_PARAMS.minFeatureWidth} suffix="mm" onChange={(v) => setParam('minFeatureWidth', v)}
            tooltip="With Round Off Thin Bits on, everything thinner than this is shaved off: raise it to shave more. It is also the width the red check uses" />
        </div>
      )}
    </div>
  );
}
