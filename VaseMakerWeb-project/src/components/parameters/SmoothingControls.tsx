'use client';

import { useVaseStore } from '@/store/vase-store';
import { SMOOTH_ZONES, RADIAL_SMOOTHING, VERTICAL_SMOOTHING } from '@/config/shape-params';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { GROUP_COLORS } from '@/config/colors';
import { SliderRow, Section, GroupHeader } from './ui';

export function SmoothingControls() {
  const params = useVaseStore((s) => s.params);
  const { setSmoothZones, setRadialSmoothing, setVerticalSmoothing } = useVaseStore();

  const resetSmoothZones = () => setSmoothZones({ basePercent: DEFAULT_PARAMETERS.smoothZones.basePercent, rimPercent: DEFAULT_PARAMETERS.smoothZones.rimPercent, baseFade: DEFAULT_PARAMETERS.smoothZones.baseFade, rimFade: DEFAULT_PARAMETERS.smoothZones.rimFade });
  const resetRadialSmoothing = () => setRadialSmoothing({ cycles: DEFAULT_PARAMETERS.radialSmoothing.cycles, offsetAngle: DEFAULT_PARAMETERS.radialSmoothing.offsetAngle });
  const resetVerticalSmoothing = () => setVerticalSmoothing({ cycles: DEFAULT_PARAMETERS.verticalSmoothing.cycles, startPercent: DEFAULT_PARAMETERS.verticalSmoothing.startPercent });

  return (
    <>
      <GroupHeader label="Smoothing" color={GROUP_COLORS.smoothing} />

      <Section title="Smooth Zones" defaultOpen={false} checked={params.smoothZones?.enabled ?? false} onToggle={(v) => setSmoothZones({ enabled: v })} tooltip="Suppress ripples and textures near the base or rim" titleColor={GROUP_COLORS.smoothing}>
        <div className="flex justify-end mb-1">
          <button onClick={resetSmoothZones} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Base %" value={params.smoothZones?.basePercent ?? 0} {...SMOOTH_ZONES.basePercent} max={100 - (params.smoothZones?.rimPercent ?? 0)} tooltip="Suppress effects near the base (% of height)" onChange={(v) => {
          const rim = params.smoothZones?.rimPercent ?? 0;
          if (v + rim > 100) setSmoothZones({ basePercent: v, rimPercent: 100 - v });
          else setSmoothZones({ basePercent: v });
        }} />
        <SliderRow label="Rim %" value={params.smoothZones?.rimPercent ?? 0} {...SMOOTH_ZONES.rimPercent} max={100 - (params.smoothZones?.basePercent ?? 0)} tooltip="Suppress effects near the rim (% of height)" onChange={(v) => {
          const base = params.smoothZones?.basePercent ?? 0;
          if (v + base > 100) setSmoothZones({ rimPercent: v, basePercent: 100 - v });
          else setSmoothZones({ rimPercent: v });
        }} />
        {(params.smoothZones?.basePercent ?? 0) > 0 && (
          <SliderRow label="Base Fade" value={params.smoothZones?.baseFade ?? 0} {...SMOOTH_ZONES.baseFade} tooltip="How much of the base zone fades gradually (0% = hard cutoff, 100% = full blend)" onChange={(v) => setSmoothZones({ baseFade: v })} />
        )}
        {(params.smoothZones?.rimPercent ?? 0) > 0 && (
          <SliderRow label="Rim Fade" value={params.smoothZones?.rimFade ?? 0} {...SMOOTH_ZONES.rimFade} tooltip="How much of the rim zone fades gradually (0% = hard cutoff, 100% = full blend)" onChange={(v) => setSmoothZones({ rimFade: v })} />
        )}
        <div className="text-xs text-[var(--text-secondary)] mt-1 opacity-60">
          Suppresses textures near base/rim. Does not affect profile or twist.
        </div>
      </Section>

      <Section title="Radial Smoothing" defaultOpen={false} checked={params.radialSmoothing.enabled} onToggle={(v) => setRadialSmoothing({ enabled: v })} tooltip="Modulate ripple strength around the circumference" titleColor={GROUP_COLORS.smoothing}>
        <div className="flex justify-end mb-1">
          <button onClick={resetRadialSmoothing} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Cycles" value={params.radialSmoothing.cycles} {...RADIAL_SMOOTHING.cycles} onChange={(v) => setRadialSmoothing({ cycles: v })} tooltip="Number of smoothing lobes around circumference" />
        <SliderRow label="Offset" value={params.radialSmoothing.offsetAngle} {...RADIAL_SMOOTHING.offsetAngle} onChange={(v) => setRadialSmoothing({ offsetAngle: v })} tooltip="Angular offset of smoothing pattern in degrees" />
        <div className="text-xs text-[var(--text-secondary)] mt-1 opacity-60">
          Fades surface effect intensity by angle.
        </div>
      </Section>

      <Section title="Vertical Smoothing" defaultOpen={false} checked={params.verticalSmoothing.enabled} onToggle={(v) => setVerticalSmoothing({ enabled: v })} tooltip="Modulate ripple strength at different heights" titleColor={GROUP_COLORS.smoothing}>
        <div className="flex justify-end mb-1">
          <button onClick={resetVerticalSmoothing} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors" title="Reset to defaults">Reset</button>
        </div>
        <SliderRow label="Cycles" value={params.verticalSmoothing.cycles} {...VERTICAL_SMOOTHING.cycles} onChange={(v) => setVerticalSmoothing({ cycles: v })} tooltip="Number of smoothing bands up the height" />
        <SliderRow label="Start %" value={params.verticalSmoothing.startPercent} {...VERTICAL_SMOOTHING.startPercent} onChange={(v) => setVerticalSmoothing({ startPercent: v })} tooltip="Height % where smoothing begins" />
        <div className="text-xs text-[var(--text-secondary)] mt-1 opacity-60">
          Fades surface effect intensity by height.
        </div>
      </Section>
    </>
  );
}
