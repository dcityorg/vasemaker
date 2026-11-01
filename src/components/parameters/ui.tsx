'use client';

import { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';

/** useLayoutEffect in the browser; the server render has no layout (and warns). */
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Modifier multipliers shared by every fine-adjust control (sliders and the
 * Bezier curve editors) so the muscle memory carries between them:
 * Alt/Option = 5× finer, Shift = 5× coarser. Alt wins when both are held —
 * precision beats speed.
 */
export const FINE_FACTOR = 0.2;
export const COARSE_FACTOR = 5;

/** Snap to a grid, trimming binary-float noise (0.1 * 3 → 0.30000000000000004). */
export function snapToGrid(v: number, grid: number): number {
  if (!(grid > 0)) return v;
  return parseFloat((Math.round(v / grid) * grid).toFixed(6));
}

/**
 * Reusable slider row.
 *
 * Arrow keys nudge the focused slider by one `step`; **Alt/Option** gives a
 * step 5× finer than the slider's own and **Shift** one 5× coarser. The same
 * multipliers apply while dragging, so Alt-drag resolves finer than the step
 * grid and Shift-drag jumps in coarse increments.
 */
export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  tooltip,
  suffix,
  valueLabel,
  color,
  after,
  fine = true,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  tooltip?: string;
  suffix?: string;
  /**
   * Replaces the numeric readout when the slider's value alone doesn't tell the
   * story — e.g. HandleMaker's Height shows "100 / 115" (the span it sets, and
   * the overall extent that follows along). Widens the column to suit.
   */
  valueLabel?: string;
  /** Colours the label and readout — for a setting that must not be missed (the mold's Shrink). */
  color?: string;
  /** Shown after the label text, e.g. the Sprig page's reset dot. */
  after?: React.ReactNode;
  /** false = Alt/Option gives no finer steps — for a setting where values
   *  between the slider's own steps do nothing (Sprig's Close Gaps). */
  fine?: boolean;
}) {
  // Modifier state for the drag path. The `input` event carries no modifier
  // flags, so they're latched from the pointer events that precede it.
  const mods = useRef({ alt: false, shift: false });

  const gridFor = (alt: boolean, shift: boolean) =>
    alt && fine ? step * FINE_FACTOR : shift ? step * COARSE_FACTOR : step;

  /** Clamp to range and drop float noise. */
  const clean = (v: number) => parseFloat(Math.max(min, Math.min(max, v)).toFixed(6));

  const commit = (next: number, el?: HTMLInputElement) => {
    if (next !== value) onChange(next);
    // Unchanged after snapping: React won't re-render, so the input would keep
    // the un-snapped position it just reported and the thumb would sit
    // slightly off the real value. Put it back by hand.
    else if (el) el.value = String(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const dir =
      e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1
      : 0;
    if (!dir) return;
    e.preventDefault(); // native stepping ignores the modifiers — do it ourselves
    // Relative, NOT re-snapped to the modified grid: Shift means "move by 5
    // steps", so 124 → 129. Snapping would align to the coarse grid instead
    // and jump to 130, and an Alt-fine offset would be lost on the next
    // ordinary press. This matches how the curve editors nudge.
    commit(clean(value + dir * gridFor(e.altKey, e.shiftKey)));
  };

  const latchMods = (e: React.PointerEvent<HTMLInputElement>) => {
    mods.current = { alt: e.altKey, shift: e.shiftKey };
  };

  return (
    <div className="flex items-center gap-2 mb-2">
      {/* w-28, not w-24: labels carrying a unit ("Thickness (mm)") wrapped to a
          second line and threw the row heights out of alignment. Toggle matches
          so its label still lines up with the sliders around it. */}
      <label className={`text-sm text-[var(--text-secondary)] w-28 shrink-0 ${after ? 'whitespace-nowrap' : ''}`} title={tooltip} style={color ? { color } : undefined}>{label}{after}</label>
      <input
        type="range"
        min={min}
        max={max}
        /* `any` — with a fixed step the browser's value sanitisation snaps an
           Alt-fine value straight back to the coarse grid (12.4 → 12 at
           step=1). Snapping happens in commit() instead, so an unmodified
           drag still lands on the slider's own step exactly as before. */
        step="any"
        value={value}
        onKeyDown={handleKeyDown}
        onPointerDown={latchMods}
        onPointerMove={latchMods}
        onChange={(e) =>
          // Dragging is absolute positioning, so here the grid DOES align the
          // value — an unmodified drag lands on the slider's own step exactly
          // as it did before, Alt resolves 5× finer, Shift 5× coarser.
          commit(
            clean(snapToGrid(parseFloat(e.target.value), gridFor(mods.current.alt, mods.current.shift))),
            e.target
          )
        }
        className="flex-1 min-w-0 h-1.5 accent-[var(--accent)]"
      />
      <span
        className={`text-xs text-[var(--text-secondary)] shrink-0 text-right tabular-nums ${valueLabel ? 'w-[68px]' : 'w-12'}`}
        title={tooltip}
        style={color ? { color } : undefined}
      >
        {valueLabel ?? `${value}${suffix ?? ''}`}
      </span>
    </div>
  );
}

/**
 * Settings that only matter while some other setting is on stay in view,
 * greyed out and locked, with a short line saying what to turn on — instead of
 * disappearing, so the greyed setting itself is the reminder (Gary,
 * 2026-11-01). `fieldset disabled` disables every input, button and select
 * inside; `inert` also takes the focusable curve editors out of the Tab order,
 * and pointer-events-none stops clicks on SVG/canvas widgets and clickable
 * spans. When not `off` the children render as they are, with no wrapper.
 */
export function Greyed({ off, hint, children }: { off: boolean; hint: string; children: React.ReactNode }) {
  if (!off) return <>{children}</>;
  return <GreyedBox hint={hint}>{children}</GreyedBox>;
}

function GreyedBox({ hint, children }: { hint: string; children: React.ReactNode }) {
  const ref = useRef<HTMLFieldSetElement>(null);
  // React 18 has no `inert` prop; set the attribute by hand.
  useEffect(() => { ref.current?.setAttribute('inert', ''); }, []);
  return (
    <>
      <div className="text-[10px] text-[var(--text-secondary)] mb-1">{hint}</div>
      <fieldset ref={ref} disabled aria-disabled className="border-0 p-0 m-0 min-w-0 opacity-40 pointer-events-none">
        {children}
      </fieldset>
    </>
  );
}

/** Collapsible section wrapper — supports optional header toggle. With a
 *  header switch that is off, the body is greyed and locked (see Greyed). */
export function Section({ title, children, defaultOpen = true, active, checked, onToggle, offHint, tooltip, titleColor, changed, changedTip }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
  active?: boolean; checked?: boolean; onToggle?: (v: boolean) => void;
  /** The greyed body's hint while the header switch is off; "Turn on <title> to use these" if omitted. */
  offHint?: string;
  tooltip?: string; titleColor?: string;
  /** Something in this section differs from its default: a small dot after the
   *  title (Sprig page, Gary 2026-10-29 — "where did I change that?"). */
  changed?: boolean;
  /** The title dot's tooltip. The Sprig page's sections each have a Reset; the
   *  other pages point at the setting dots instead (2026-11-01). */
  changedTip?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  // Browsers queue a `toggle` event when React sets `open` during mount, so
  // auto-scroll only after a real user click on the summary (keyboard
  // activation fires a synthetic click too). Without this guard, every
  // default-open section scrolls itself into view on mount and the sidebar
  // lands mid-scroll after navigating back from /mold.
  const userToggled = useRef(false);
  const key = `${usePathname()}|${title}`;

  // Back on this page: open or closed as it was left (Gary, 2026-11-01).
  useClientLayoutEffect(() => {
    const el = detailsRef.current, was = sidebarMemory().open[key];
    if (el && was !== undefined && el.open !== was) el.open = was;
  }, [key]);

  const handleToggle = useCallback(() => {
    const el = detailsRef.current;
    const wasUser = userToggled.current;
    userToggled.current = false;
    if (el) rememberSidebar((m) => { m.open[key] = el.open; });
    if (!el || !el.open || !wasUser) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [key]);

  return (
    <details ref={detailsRef} open={defaultOpen} className="mb-4" onToggle={handleToggle}>
      <summary onClick={() => { userToggled.current = true; }} className="cursor-pointer text-sm font-medium py-2 px-3 bg-[var(--bg-secondary)] rounded select-none hover:bg-[var(--border-color)] transition-colors flex items-center gap-2" style={titleColor ? { color: titleColor } : { color: 'var(--text-primary)' }} title={tooltip}>
        <span className="flex-1">
          {title}
          {changed && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" title={changedTip ?? "Changed from the default — this section's Reset puts it back"} />}
        </span>
        {onToggle ? (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(!checked); }}
            title={checked ? 'On — click to turn off' : 'Off — click to turn on'}
            className={`w-8 h-4 rounded-full transition-colors shrink-0 ${checked ? 'bg-[var(--accent)]' : 'bg-[#888]'}`}
          />
        ) : (
          active && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        )}
      </summary>
      <div className="pt-3 px-4 ml-2 border-l-2 border-[var(--border-color)]">
        <Greyed off={!!onToggle && checked === false} hint={offHint ?? `Turn on ${title} to use these`}>
          {children}
        </Greyed>
      </div>
    </details>
  );
}

/** What each side panel looked like when its page was left: which boxes were
 *  open (by page and title) and how far it was scrolled. Going Vase → Sprig →
 *  Vase comes back to the same place (Gary, 2026-11-01). Per browser tab, so
 *  a reload keeps it and a new tab starts fresh. */
interface SidebarMemory { open: Record<string, boolean>; scroll: Record<string, number> }
const SIDEBAR_KEY = 'vasemaker-sidebar-view';
let memory: SidebarMemory | null = null;
function sidebarMemory(): SidebarMemory {
  if (memory) return memory;
  memory = { open: {}, scroll: {} };
  try { Object.assign(memory, JSON.parse(sessionStorage.getItem(SIDEBAR_KEY) ?? '{}')); } catch { /* none kept */ }
  return memory;
}
function rememberSidebar(change: (m: SidebarMemory) => void): void {
  const m = sidebarMemory();
  change(m);
  try { sessionStorage.setItem(SIDEBAR_KEY, JSON.stringify(m)); } catch { /* kept for this visit only */ }
}

/** A side panel's scroll position, kept per page. Put the returned props on
 *  its scrolling div. The boxes reopen in their own layout effects first, so
 *  the height is mostly right; the position is held for 1.5 s while the rest
 *  fills in, unless the user scrolls first. */
export function useRememberedScroll() {
  const page = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const restoring = useRef(true);
  useClientLayoutEffect(() => {
    const el = ref.current, want = sidebarMemory().scroll[page] ?? 0;
    restoring.current = want > 0;
    if (!el || !want) return;
    // Held for a moment, not set once: boxes above that fill in late (the
    // Sprig page's drawing) would otherwise push the view ~70 px down.
    const until = performance.now() + 1500;
    let raf = 0;
    const tryIt = () => {
      if (!restoring.current) return;
      if (Math.abs(el.scrollTop - want) >= 1) el.scrollTop = want;
      if (performance.now() > until) { restoring.current = false; return; }
      raf = requestAnimationFrame(tryIt);
    };
    tryIt();
    return () => cancelAnimationFrame(raf);
  }, [page]);
  // Only the user's own scrolling is kept: a box above that fills in late
  // makes the browser shift the scroll to keep the view still, and saving that
  // shift crept the Sprig panel ~70 px further down on every visit.
  const byUser = useRef(false);
  const stop = () => { restoring.current = false; byUser.current = true; };
  const onScroll = () => {
    const el = ref.current;
    if (!el || restoring.current || !byUser.current) return;
    rememberSidebar((m) => { m.scroll[page] = el.scrollTop; });
  };
  return { ref, onScroll, onWheel: stop, onPointerDown: stop, onTouchStart: stop, onKeyDown: stop };
}

/** The ↕ in each page's header: open every box in this side panel, or close
 *  them all if they are all open (was Vase only until 2026-10-26, Gary).
 *  Works on the nearest `data-sidebar` ancestor, so the help panel's own
 *  accordion is left alone. */
export function ToggleAllSectionsButton() {
  return (
    <button
      onClick={(e) => {
        const root = e.currentTarget.closest('[data-sidebar]');
        if (!root) return;
        const details = Array.from(root.querySelectorAll('details'));
        const allOpen = details.every((d) => d.open);
        details.forEach((d) => { d.open = !allOpen; });
      }}
      className="text-xs leading-none px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors text-[var(--text-secondary)]"
      title="Expand/collapse all sections"
    >
      &#x2195;
    </button>
  );
}

/** Title-dot tooltip for a page whose sections have no Reset of their own. */
export const CHANGED_TIP = 'Changed from the default — an amber dot after a setting below shows which; click that dot to put it back';

/** The amber "changed" dot after a setting's name: click it to put just that
 *  setting back to its default (Sprig's Adjust list, 2026-10-29; every page
 *  since 2026-11-01). `shown` is the default as it reads, e.g. "12mm" or "off". */
// 14 px wide with no margin: the longest labels that carry one ("Dome Diameter")
// then end within the gap before the slider.
export function ResetDot({ onReset, shown }: { onReset: () => void; shown: string }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); onReset(); }}
      title={`Changed from the default — click to put it back to ${shown}`}
      className="inline-flex items-center justify-center w-3.5 h-4 align-middle rounded-full hover:bg-[var(--border-color)]"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
    </button>
  );
}

/** The dot only while `changed` — null otherwise, so a SliderRow / Toggle
 *  label without one keeps wrapping as it always has (`after` is falsy). */
export function resetDot(changed: boolean, onReset: () => void, shown: string): React.ReactNode {
  return changed ? <ResetDot onReset={onReset} shown={shown} /> : null;
}

/** Small-button look of the Revert / Reset row (was the Sprig page's). */
export const MINI_BTN =
  'flex-1 py-1 text-[11px] rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] ' +
  'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)] transition-colors';

/**
 * Revert to Saved and the page's reset, side by side, under Load / Save Design
 * on every page (Gary, 2026-11-01 — they were at the very bottom on three of
 * the four). The same 3 px bar above as over the exports (Gary: thin lines
 * hardly showed on his screen).
 * Revert is always shown, greyed while there is nothing to go back to; it is
 * aria-disabled rather than disabled so its tooltip still shows.
 */
export function RevertResetRow({ canRevert, onRevert, revertTitle, nothingTitle, resetLabel, resetTitle, onReset }: {
  canRevert: boolean; onRevert: () => void; revertTitle: string;
  /** The greyed button's tooltip, when the page's baseline is more than a file. */
  nothingTitle?: string;
  /** Omitted on the Vase page, which has no reset button. */
  resetLabel?: string; resetTitle?: string; onReset?: () => void;
}) {
  return (
    <div className="border-t-[3px] border-[#555] pt-2 flex gap-2">
      <button
        onClick={() => { if (canRevert) onRevert(); }}
        aria-disabled={!canRevert}
        className={canRevert ? MINI_BTN
          : 'flex-1 py-1 text-[11px] rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] opacity-40 cursor-not-allowed'}
        title={canRevert ? revertTitle : nothingTitle ?? 'Nothing to revert — no changes since the last Save Design or Load Design'}
      >
        Revert to Saved
      </button>
      {resetLabel && onReset && (
        <button onClick={onReset} className={MINI_BTN} title={resetTitle}>
          {resetLabel}
        </button>
      )}
    </div>
  );
}

/** A section's right-aligned Reset link (the Display boxes, 2026-10-26). */
export function ResetRow({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <div className="flex justify-end mb-1">
      <button onClick={onClick} title={title}
        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors">Reset</button>
    </div>
  );
}

/** Group header label for visual separation between section groups */
export function GroupHeader({ label, color }: { label: string; color: string }) {
  return (
    <div className="mt-6 mb-2 px-1 text-[10px] font-semibold tracking-[0.15em] uppercase" style={{ color }}>
      {label}
    </div>
  );
}

/** Toggle switch with optional reset button */
export function Toggle({ label, checked, onChange, onReset, tooltip, after }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; onReset?: () => void; tooltip?: string;
  /** Shown after the label text, e.g. the Sprig page's reset dot. */
  after?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      {/* w-28, not w-24: labels carrying a unit ("Thickness (mm)") wrapped to a
          second line and threw the row heights out of alignment. Toggle matches
          so its label still lines up with the sliders around it. */}
      {/* With a dot after it, the label stays on one line (it wrapped under
          "Round Off Thin" and moved the switch, Gary 2026-10-29). */}
      <label className={`text-sm text-[var(--text-secondary)] w-28 shrink-0 ${after ? 'whitespace-nowrap' : ''}`} title={tooltip}>{label}{after}</label>
      <button
        onClick={() => onChange(!checked)}
        title={tooltip ?? (checked ? 'On — click to turn off' : 'Off — click to turn on')}
        className={`w-8 h-4 rounded-full transition-colors ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'
        }`}
      />
      {onReset && checked && (
        <button
          onClick={onReset}
          className="ml-auto text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
          title="Reset to defaults"
        >
          Reset
        </button>
      )}
    </div>
  );
}
