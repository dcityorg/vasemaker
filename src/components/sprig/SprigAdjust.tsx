'use client';

/**
 * Adjust: every control that changes the cast, in one run under Shaping and
 * Max Height, in the order you work — outline, size, shape, edges, thin parts,
 * pieces (Gary, 2026-10-29: "I have to bounce around too much"; the
 * adjustments are foreign to most people, so keep them together and explain
 * each). Each warning sits right above the controls that fix it, a one-line
 * hint sits under each control (Hide hints turns them off), and an amber dot
 * after a name means it differs from the default — click the dot to put it
 * back. Only the controls that do something for this drawing and Shaping are
 * shown. Replaces the thin-parts fix box (ThinPartsFix.tsx, 2026-10-28) and the
 * Height, Edges and Checks sections.
 */

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { SliderRow, Toggle } from '@/components/parameters/ui';
import { SPRIG_PARAMS } from '@/config/sprig-params';
import { UI_MUTED } from '@/config/colors';
import { smallestFit, fitsBox, type SprigNote } from '@/engine/sprig/sprig-generator';
import type { ReliefField } from '@/engine/sprig/relief';
import {
  SPRIG_SIZES, sprigFootprint, isPictureDrawing,
  type SprigParameters, type SprigProfile, type TextSize,
} from '@/engine/sprig/sprig-types';

// ── Hints: on by default, remembered per browser ──

const HINTS_KEY = 'vasemaker-sprig-hints';
const useHints = create<{ on: boolean }>(() => ({ on: true }));
function setHints(on: boolean) {
  useHints.setState({ on });
  try { if (on) window.localStorage.removeItem(HINTS_KEY); else window.localStorage.setItem(HINTS_KEY, '0'); } catch { /* this session only */ }
}

// ── Make it bigger (from the thin-parts box, 2026-10-28) ──

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

/** `v` on the slider's grid. A drag lands on it already; an arrow press from
 *  an off-grid value (an old 0.5 px) goes to the next grid value that way. */
function onGrid(v: number, old: number, step: number) {
  const q = v / step;
  if (Math.abs(q - Math.round(q)) < 1e-6) return Math.round(q) * step;
  return (v > old ? Math.ceil(old / step + 1e-9) : Math.floor(old / step - 1e-9)) * step;
}

// ── Pieces ──

type NumKey = { [K in keyof SprigParameters]: SprigParameters[K] extends number ? K : never }[keyof SprigParameters] & keyof typeof SPRIG_PARAMS;
type BoolKey = { [K in keyof SprigParameters]: SprigParameters[K] extends boolean ? K : never }[keyof SprigParameters];

const linkCls = 'underline decoration-dotted underline-offset-2 hover:text-amber-100';
const selectCls = 'flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs';

interface Props {
  params: SprigParameters;
  defaults: SprigParameters;
  relief: ReliefField | null;
  notes: SprigNote[];
  isMark: boolean;
  textSize: TextSize | null;
  setParam: <K extends keyof SprigParameters>(k: K, v: SprigParameters[K]) => void;
  setParams: (u: Partial<SprigParameters>) => void;
  setWidth: (w: number) => void;
  setLength: (l: number) => void;
}

export function SprigAdjust({ params: p, defaults, relief, notes, isMark, textSize, setParam, setParams, setWidth, setLength }: Props) {
  const hints = useHints((s) => s.on);
  useEffect(() => {
    try { if (window.localStorage.getItem(HINTS_KEY) === '0') useHints.setState({ on: false }); } catch { /* default on */ }
  }, []);
  // Make it bigger is offered once per drawing: a pointed tip reads thin at
  // any size, so it would otherwise offer to grow it again and again.
  const [grown, setGrown] = useState(false);
  useEffect(() => { setGrown(false); }, [p.svg]);

  const picture = isPictureDrawing(p.svg);
  const mode = p.heightMode;
  const inflate = mode === 'inflate' || mode === 'inflateGray';
  const grayish = mode === 'gray' || mode === 'inflateGray';
  const noteOf = (k: SprigNote['kind']) => notes.filter((n) => n.kind === k);

  /** The amber dot: shown when `k` differs from its default; click = reset it. */
  const dot = (k: keyof SprigParameters, shown: string) => (p[k] !== defaults[k] ? (
    <button
      onClick={(e) => { e.preventDefault(); setParam(k, defaults[k]); }}
      title={`Changed from the default — click to put it back to ${shown}`}
      className="inline-flex items-center justify-center w-4 h-4 ml-0.5 align-middle rounded-full hover:bg-[var(--border-color)]"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
    </button>
  ) : null);
  const hint = (text: string) => (hints
    ? <p className="text-[10px] leading-snug text-[var(--text-secondary)] -mt-1.5 mb-2 pl-0.5">{text}</p>
    : null);
  const slider = (k: NumKey, label: string, suffix: string, text: string, tooltip?: string, fine = true) => (
    <>
      {/* Without fine steps the value also snaps to the slider's own steps, so
          an old 0.5 px Close Gaps does not step on to 1.5. */}
      <SliderRow label={label} value={p[k]} {...SPRIG_PARAMS[k]} suffix={suffix}
        onChange={(v) => setParam(k, fine ? v : onGrid(v, p[k], SPRIG_PARAMS[k].step))}
        tooltip={tooltip ?? text} after={dot(k, `${defaults[k]}${suffix}`)} fine={fine} />
      {hint(text)}
    </>
  );
  const toggle = (k: BoolKey, label: string, text: string) => (
    <>
      <Toggle label={label} checked={p[k]} onChange={(v) => setParam(k, v)} tooltip={text}
        after={dot(k, defaults[k] ? 'on' : 'off')} />
      {hint(text)}
    </>
  );
  const warn = (body: React.ReactNode, key?: string) => (
    <div key={key} className="mb-2 px-2 py-1.5 rounded border border-amber-700 bg-amber-950/40 text-xs text-amber-200 leading-snug">{body}</div>
  );
  const group = (label: string) => (
    <p className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] mt-3 mb-1.5">{label}</p>
  );

  // Thin parts, and the size that would clear them.
  const thin = relief?.thinSpots ?? 0;
  const thinnest = relief?.thinnestWidth ?? 0;
  const mf = p.minFeatureWidth;
  const long = Math.max(p.width, p.length);
  const big = thin > 0 && thinnest > 0 && thinnest < mf && !grown ? scaled(p, mf / thinnest, textSize) : null;
  const bigLong = big ? Math.max(big.width, big.length) : long;
  const showBig = !!big && bigLong > long + 0.25;
  const pieces = relief?.pieces ?? 1;
  const gapFill = slider('gapFill', 'Gap Fill', '%', 'How full the slits Close Gaps fills are: 100% = level with the shape round them, 50% ≈ half, 0% = down to the plate. Still one piece.',
    'Gap Fill: the slits Close Gaps filled get a groove this % of the height round them, as wide as Edge Softness each side. 100% = no groove. The cast stays one piece at any value');
  const bare = noteOf('bare');

  return (
    <div>
      {noteOf('plasterBehind').map((n, i) => warn(n.text, `pb${i}`))}
      {slider('maxHeight', 'Max Height', 'mm', 'Height of the tallest point of the finished sprig.')}

      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]" title="Everything that changes the cast, in the order you would work through it">Adjust</span>
        <button onClick={() => setHints(!hints)} className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1"
          title="The one-line explanation under each control">
          {hints ? 'Hide hints' : 'Show hints'}
        </button>
      </div>
      {hints && (
        <p className="text-[10px] leading-snug text-[var(--text-secondary)] mb-1 pl-0.5">
          An amber dot after a name means it is changed — click the dot to put it back.
        </p>
      )}

      {/* ── Outline ── */}
      {picture ? (
        <>
          {group('Outline')}
          {slider('imageBackground', 'Background', '', 'How far a colour can be from the background and still be cut away. Raise it for a halo; lower it if pale parts vanish.',
            'How different a colour can be from the background and still be cut away. Raise it if a halo or speckle round the drawing stays; lower it if pale parts of the drawing disappear. Areas the background cannot reach (inside a closed outline) always stay')}
          {slider('imageCloseGaps', 'Close Gaps', 'px', 'Fills slits up to about twice this many pixels wide — breaks in an outline, gaps between segments — so they count as shape.',
            'Close Gaps: slits up to about twice this many picture pixels wide are filled instead of being cut away with the background. Whole pixels only — in between does nothing', false)}
          {p.imageCloseGaps >= 1 && gapFill}
        </>
      ) : (
        <>
          {group('Outline')}
          {!grayish && bare.map((n, i) => warn(n.text, `bare${i}`))}
          {toggle('svgFill', 'Fill Outlines', 'For line drawings: the inside of every closed outline becomes shape, with the lines on top.')}
          {p.svgFill && slider('svgCloseGaps', 'Close Gaps', 'px', 'Closes small breaks in an outline, so its inside fills instead of leaking away.', undefined, false)}
          {p.svgFill && p.svgCloseGaps >= 1 && gapFill}
        </>
      )}

      {(mode === 'gray' || mode === 'photoDepth') && slider('trimBelow', 'Trim Below', 'mm',
        'Cuts away every part lower than this — the near-flat leftovers of legs and antennae round a relief. Watch thin tails. 0 = off.',
        'Trim Below: in Gray and Photo depth, every part whose height is under this is cut away and the outline follows. With Lightest above 0 nothing is that low — set Lightest to 0 for a relief. 0 = off')}

      {/* ── Size ── */}
      {group('Size')}
      {noteOf('fit').map((n, i) => warn(n.text, `fit${i}`))}
      <SliderRow label="Width" value={p.width} {...SPRIG_PARAMS.width} suffix="mm" onChange={setWidth}
        tooltip="FINISHED width, left to right, after the clay shrinks. The printed relief is scaled up by Shrink" />
      <SliderRow label="Length" value={p.length} {...SPRIG_PARAMS.length} suffix="mm" onChange={setLength}
        tooltip="FINISHED length, bottom to top, after the clay shrinks" />
      {hint('The finished size, after the clay shrinks. With Lock on, Length follows Width.')}
      {toggle('lockAspect', '🔗 Lock', 'Width and Length move together, so the drawing keeps its proportions. Off: stretch it.')}

      {/* ── Shape ── */}
      {group('Shape')}
      {grayish && bare.map((n, i) => warn(n.text, `bare${i}`))}
      {inflate && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm text-[var(--text-secondary)] w-28 shrink-0">Profile{dot('profile', defaults.profile)}</label>
            <select value={p.profile} onChange={(e) => setParam('profile', e.target.value as SprigProfile)} className={selectCls} style={{ color: UI_MUTED }}
              title="Shape of the rise from the edge: Round = a dome, Pillow = steep sides and a flat top, Angular = a straight slope to a ridge">
              <option value="round">Round</option>
              <option value="pillow">Pillow</option>
              <option value="angular">Angular</option>
            </select>
          </div>
          {hint('The rise from the edge: Round = a dome, Pillow = steep sides and a flat top, Angular = a ridge.')}
          {slider('roundness', 'Roundness', 'mm', 'How far in from the edge it takes to reach Max Height. Parts narrower than twice this stay lower — legs and tails.')}
        </>
      )}
      {mode === 'inflateGray' && slider('detailDepth', 'Detail Depth', 'mm', 'How deep lighter-grey marks inside the shape (eyes, veins) cut in. Pure white is background, not detail.')}
      {grayish && (picture || p.svgFill || p.svgTones >= 2) && slider('imageLightest', 'Lightest', '%', mode === 'gray'
        ? 'Height of the lightest tone, as a % of Max Height. Raise it to put clay where the plate shows through.'
        : 'How much of Detail Depth the lightest tone is spared: 100% = no cut, 0% = the full depth.')}
      {toggle('invert', 'Invert', picture ? 'Swaps which tones stand higher. The outline stays the same.' : 'Swaps black and white inside the drawing’s area: the background becomes the raised part.')}

      {/* ── Edges ── */}
      {group('Edges')}
      {slider('edgeSoftness', 'Edge Softness', 'mm', 'The slope up from the plate. Wider blends into the pot and drops out of the mold more easily; 0 = steep.')}
      {slider('minEdgeThickness', 'Edge Lip', 'mm', 'A small step at the edge. 0 = tapers smoothly to the plate; try 0.3–0.5 only if cast edges tear.')}

      {/* ── Thin parts ── */}
      {group('Thin parts')}
      {thin > 0 && warn(
        <>
          {thin} part{thin === 1 ? '' : 's'} thinner than {mf} mm (red): thinnest ≈ {thinnest.toFixed(1)} mm. They may tear coming out of the mold or crack drying.
          {showBig && (
            <> {' '}
              <button className={linkCls}
                onClick={() => { setParams({ width: big!.width, length: big!.length, moldSize: big!.moldSize }); setGrown(true); }}
                title={big!.capped
                  ? 'As big as the largest standard mold takes. Not enough on its own: thicken what is still red'
                  : `Scales the whole sprig ×${(bigLong / long).toFixed(1)}, so legs and stalks reach ${mf} mm. Keeps the shape exactly. Pointed tips stay a little red at any size`}>
                Make it bigger: {Math.round(long)} → {Math.round(bigLong)} mm
                {big!.moldSize !== p.moldSize && big!.moldSize !== 'custom' ? `, ${SPRIG_SIZES[big!.moldSize].label} mold` : ''}
                {big!.capped ? ' (largest mold)' : ''}
              </button>.
            </>
          )}
          {' '}Or use the controls below.
        </>,
      )}
      {relief && thin === 0 && hints && <p className="text-[10px] leading-snug text-[var(--text-secondary)] mb-2 pl-0.5">Nothing thinner than Min Feature.</p>}
      {slider('minFeatureWidth', 'Min Feature', 'mm', 'Parts narrower than this show red: they may tear or crack. Thicken and Round Off work to this width.')}
      {slider('thickenThin', 'Thicken', 'mm', 'Widens every thinner part — legs, tails, antennae — to about this width. 0 = off. Close parts (toes) can merge.',
        'Thicken Thin Parts: widen every part thinner than this to about this width. The rest of the shape is left alone. 0 = off')}
      {slider('minThickness', 'Min Thickness', 'mm', 'Every part at least this tall, so narrow necks keep clay; the edge still slopes. Gaps between tail segments: raise Close Gaps instead. 0 = off.',
        'Min Thickness: a floor under the whole shape, so narrow places — thin legs, necks — are not left nearly flat. Its own taper at the outline rises over half its height. If a tail dips at gaps between its segments, raise Close Gaps instead. 0 = off')}
      {toggle('roundThin', 'Round Off Thin', 'Shaves off everything narrower than Min Feature: sharp tips round off, hairlines go.')}

      {/* ── Pieces (a mark is impressed, so its pieces do not matter) ── */}
      {!isMark && (
        <>
          {group('Pieces')}
          {relief && pieces > 1 && warn(
            <>
              Casts in {pieces} separate pieces{relief.smallPieces ? `, ${relief.smallPieces} of them tiny (under ${mf} × ${mf} mm)` : ''}.
              {p.backing === 'none' && (
                <> {' '}
                  <button className={linkCls} onClick={() => setParams({ backing: 'outline', backingThickness: p.backingThickness > 0 ? p.backingThickness : defaults.backingThickness })}
                    title="A thin sheet under the drawing, following its outline, so the pieces cast as one (Backing section below)">
                    Join them with a backing
                  </button>
                </>
              )}
            </>,
          )}
          {relief && pieces === 0 && warn('Nothing left to cast — the clean-up removed it all.')}
          {toggle('removeTiny', 'Remove Tiny', 'Drops pieces smaller than Min Feature × Min Feature — crumbs that would stick in the mold.')}
          {toggle('wholeShapesOnly', 'Whole Shapes', 'Drops every piece touching the drawing’s edge — the cut-off cells of a pattern.')}
        </>
      )}
    </div>
  );
}
