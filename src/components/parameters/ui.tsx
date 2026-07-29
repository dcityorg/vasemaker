'use client';

import { useRef, useCallback } from 'react';

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
}) {
  // Modifier state for the drag path. The `input` event carries no modifier
  // flags, so they're latched from the pointer events that precede it.
  const mods = useRef({ alt: false, shift: false });

  const gridFor = (alt: boolean, shift: boolean) =>
    alt ? step * FINE_FACTOR : shift ? step * COARSE_FACTOR : step;

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
      <label className="text-sm text-[var(--text-secondary)] w-28 shrink-0" title={tooltip}>{label}</label>
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
      >
        {valueLabel ?? `${value}${suffix ?? ''}`}
      </span>
    </div>
  );
}

/** Collapsible section wrapper — supports optional header toggle */
export function Section({ title, children, defaultOpen = true, active, checked, onToggle, tooltip, titleColor }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
  active?: boolean; checked?: boolean; onToggle?: (v: boolean) => void; tooltip?: string; titleColor?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  // Browsers queue a `toggle` event when React sets `open` during mount, so
  // auto-scroll only after a real user click on the summary (keyboard
  // activation fires a synthetic click too). Without this guard, every
  // default-open section scrolls itself into view on mount and the sidebar
  // lands mid-scroll after navigating back from /mold.
  const userToggled = useRef(false);

  const handleToggle = useCallback(() => {
    const el = detailsRef.current;
    const wasUser = userToggled.current;
    userToggled.current = false;
    if (!el || !el.open || !wasUser) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  return (
    <details ref={detailsRef} open={defaultOpen} className="mb-4" onToggle={handleToggle}>
      <summary onClick={() => { userToggled.current = true; }} className="cursor-pointer text-sm font-medium py-2 px-3 bg-[var(--bg-secondary)] rounded select-none hover:bg-[var(--border-color)] transition-colors flex items-center gap-2" style={titleColor ? { color: titleColor } : { color: 'var(--text-primary)' }} title={tooltip}>
        <span className="flex-1">{title}</span>
        {onToggle ? (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(!checked); }}
            className={`w-8 h-4 rounded-full transition-colors shrink-0 ${checked ? 'bg-[var(--accent)]' : 'bg-[#888]'}`}
          />
        ) : (
          active && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        )}
      </summary>
      <div className="pt-3 px-4 ml-2 border-l-2 border-[var(--border-color)]">
        {children}
      </div>
    </details>
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
export function Toggle({ label, checked, onChange, onReset, tooltip }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; onReset?: () => void; tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      {/* w-28, not w-24: labels carrying a unit ("Thickness (mm)") wrapped to a
          second line and threw the row heights out of alignment. Toggle matches
          so its label still lines up with the sliders around it. */}
      <label className="text-sm text-[var(--text-secondary)] w-28 shrink-0" title={tooltip}>{label}</label>
      <button
        onClick={() => onChange(!checked)}
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
