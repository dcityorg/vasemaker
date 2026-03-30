'use client';

import { useRef, useCallback } from 'react';

/** Reusable slider row */
export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  tooltip,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  tooltip?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title={tooltip}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 min-w-0 h-1.5 accent-[var(--accent)]"
      />
      <span className="text-xs text-[var(--text-secondary)] w-12 shrink-0 text-right tabular-nums">
        {value}{suffix}
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

  const handleToggle = useCallback(() => {
    const el = detailsRef.current;
    if (!el || !el.open) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  return (
    <details ref={detailsRef} open={defaultOpen} className="mb-4" onToggle={handleToggle}>
      <summary className="cursor-pointer text-sm font-medium py-2 px-3 bg-[var(--bg-secondary)] rounded select-none hover:bg-[var(--border-color)] transition-colors flex items-center gap-2" style={titleColor ? { color: titleColor } : { color: 'var(--text-primary)' }} title={tooltip}>
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
      <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title={tooltip}>{label}</label>
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
