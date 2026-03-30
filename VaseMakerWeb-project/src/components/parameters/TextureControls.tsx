'use client';

import { useState, useRef, useEffect } from 'react';
import { useVaseStore } from '@/store/vase-store';
import { TEXTURES } from '@/config/shape-params';
import { DEFAULT_PARAMETERS } from '@/presets/defaults';
import { parseSvgInput } from '@/engine/svg-rasterizer';
import { GROUP_COLORS } from '@/config/colors';
import { SliderRow, Section, GroupHeader, Toggle } from './ui';

/** Extract native w/h from SVG string for aspect-correct preview tiling */
function getSvgAspect(svgMarkup: string): number {
  const svgTag = svgMarkup.match(/<svg\b([^>]*)>/);
  if (!svgTag) return 1;
  const attrs = svgTag[1];
  const wMatch = attrs.match(/\bwidth\s*=\s*['"]?([\d.]+)/);
  const hMatch = attrs.match(/\bheight\s*=\s*['"]?([\d.]+)/);
  if (wMatch && hMatch) return parseFloat(wMatch[1]) / parseFloat(hMatch[1]);
  const vbMatch = attrs.match(/viewBox\s*=\s*["']?\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/);
  if (vbMatch) return parseFloat(vbMatch[1]) / parseFloat(vbMatch[2]);
  return 1;
}

/** Dialog for loading SVG pattern text — only mounted when open */
function SvgLoadDialog({ onClose, onApply, initialSvg }: {
  onClose: () => void; onApply: (svg: string) => void; initialSvg: string;
}) {
  const [text, setText] = useState(initialSvg);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAspect, setPreviewAspect] = useState(1);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (!text.trim()) {
      setPreviewUrl(null);
      return;
    }
    let revoke: string | null = null;
    try {
      const markup = parseSvgInput(text);
      const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      revoke = url;
      setPreviewUrl(url);
      setPreviewAspect(getSvgAspect(markup));
    } catch {
      setPreviewUrl(null);
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [text]);

  const handleApply = () => {
    if (text.trim()) {
      onApply(text.trim());
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="rounded-lg p-0 w-[480px] max-w-[90vw] max-h-[80vh] bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-color)] shadow-xl backdrop:bg-black/50"
    >
      <div className="p-4 flex flex-col gap-3">
        <h3 className="text-sm font-medium">Paste SVG Pattern</h3>
        <p className="text-xs text-[var(--text-secondary)]">
          Paste SVG code or CSS code (e.g. from Hero Patterns).
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='<svg xmlns="http://www.w3.org/2000/svg" ...>...</svg>'
          className="w-full h-40 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 text-xs font-mono text-[var(--text-primary)] resize-y"
          spellCheck={false}
        />
        {text.trim() && (
          <button
            onClick={() => setText('')}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors self-start"
          >
            Clear
          </button>
        )}
        {previewUrl && (() => {
          const tileW = 64;
          const tileH = Math.max(4, Math.round(tileW / previewAspect));
          return (
            <div className="flex justify-center">
              <div
                className="w-48 h-48 border border-[var(--border-color)] rounded bg-white"
                style={{
                  backgroundImage: `url(${previewUrl})`,
                  backgroundSize: `${tileW}px ${tileH}px`,
                  backgroundRepeat: 'repeat',
                }}
              />
            </div>
          );
        })()}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!text.trim()}
            className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white hover:opacity-90 transition-colors disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Small inline SVG preview thumbnail — shows single tile with transforms applied */
function SvgPreviewThumb({ svgText, rotation, flipX, flipY }: { svgText: string; rotation?: number; flipX?: boolean; flipY?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!svgText) { setUrl(null); return; }
    let revoke: string | null = null;
    try {
      const markup = parseSvgInput(svgText);
      const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      revoke = blobUrl;
      setUrl(blobUrl);
    } catch {
      setUrl(null);
    }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [svgText]);

  if (!url) return null;
  const rot = rotation ?? 0;
  const scaleX = flipX ? -1 : 1;
  const scaleY = flipY ? -1 : 1;
  return (
    <div className="w-12 h-12 border border-[var(--border-color)] rounded shrink-0 bg-white overflow-hidden flex items-center justify-center">
      <img
        src={url}
        alt="SVG pattern"
        className="max-w-full max-h-full"
        style={{ transform: `rotate(${rot}deg) scaleX(${scaleX}) scaleY(${scaleY})` }}
      />
    </div>
  );
}

export function TextureControls({ designName }: { designName?: string | null }) {
  const params = useVaseStore((s) => s.params);
  const {
    setTexturesEnabled, setFluting, setBasketWeave, setVoronoi, setSimplex, setWoodGrain, setSvgPattern, setSquareFlute, setWaves, setRods,
    setVerticalFluting, setVerticalSquareFlute, setVerticalWaves, setVerticalRods,
  } = useVaseStore();

  const resetFluting = () => setFluting({ count: DEFAULT_PARAMETERS.textures.fluting.count, depth: DEFAULT_PARAMETERS.textures.fluting.depth, duty: DEFAULT_PARAMETERS.textures.fluting.duty });
  const resetBasketWeave = () => setBasketWeave({ bands: DEFAULT_PARAMETERS.textures.basketWeave.bands, waves: DEFAULT_PARAMETERS.textures.basketWeave.waves, depth: DEFAULT_PARAMETERS.textures.basketWeave.depth });
  const resetVoronoi = () => setVoronoi({ scale: DEFAULT_PARAMETERS.textures.voronoi.scale, depth: DEFAULT_PARAMETERS.textures.voronoi.depth, edgeWidth: DEFAULT_PARAMETERS.textures.voronoi.edgeWidth, seed: DEFAULT_PARAMETERS.textures.voronoi.seed, cutout: false });
  const resetSimplex = () => setSimplex({ scale: DEFAULT_PARAMETERS.textures.simplex.scale, depth: DEFAULT_PARAMETERS.textures.simplex.depth, octaves: DEFAULT_PARAMETERS.textures.simplex.octaves, persistence: DEFAULT_PARAMETERS.textures.simplex.persistence, lacunarity: DEFAULT_PARAMETERS.textures.simplex.lacunarity, seed: DEFAULT_PARAMETERS.textures.simplex.seed });
  const resetWoodGrain = () => setWoodGrain({ count: DEFAULT_PARAMETERS.textures.woodGrain.count, depth: DEFAULT_PARAMETERS.textures.woodGrain.depth, wobble: DEFAULT_PARAMETERS.textures.woodGrain.wobble, sharpness: DEFAULT_PARAMETERS.textures.woodGrain.sharpness, seed: DEFAULT_PARAMETERS.textures.woodGrain.seed });
  const resetSvgPattern = () => setSvgPattern({ repeatX: DEFAULT_PARAMETERS.textures.svgPattern.repeatX, repeatY: DEFAULT_PARAMETERS.textures.svgPattern.repeatY, depth: DEFAULT_PARAMETERS.textures.svgPattern.depth, invert: DEFAULT_PARAMETERS.textures.svgPattern.invert, cutout: false, rotation: 0, flipX: false, flipY: false, sizeAround: 100, sizeUp: 100, shiftUp: 0, spaceUp: 0, stagger: 0, tileRotation: 0, randomRotation: 0, randomScale: 0, randomRotateSeed: 0, randomScaleSeed: 0, mirrorAlternate: false });
  const resetSquareFlute = () => setSquareFlute({ count: DEFAULT_PARAMETERS.textures.squareFlute.count, depth: DEFAULT_PARAMETERS.textures.squareFlute.depth, duty: DEFAULT_PARAMETERS.textures.squareFlute.duty, sharpness: DEFAULT_PARAMETERS.textures.squareFlute.sharpness });
  const resetWaves = () => setWaves({ count: DEFAULT_PARAMETERS.textures.waves.count, depth: DEFAULT_PARAMETERS.textures.waves.depth, duty: DEFAULT_PARAMETERS.textures.waves.duty });
  const resetRods = () => setRods({ count: DEFAULT_PARAMETERS.textures.rods.count, depth: DEFAULT_PARAMETERS.textures.rods.depth, duty: DEFAULT_PARAMETERS.textures.rods.duty });
  const resetVerticalFluting = () => setVerticalFluting({ count: DEFAULT_PARAMETERS.textures.verticalFluting.count, depth: DEFAULT_PARAMETERS.textures.verticalFluting.depth, duty: DEFAULT_PARAMETERS.textures.verticalFluting.duty });
  const resetVerticalSquareFlute = () => setVerticalSquareFlute({ count: DEFAULT_PARAMETERS.textures.verticalSquareFlute.count, depth: DEFAULT_PARAMETERS.textures.verticalSquareFlute.depth, duty: DEFAULT_PARAMETERS.textures.verticalSquareFlute.duty, sharpness: DEFAULT_PARAMETERS.textures.verticalSquareFlute.sharpness });
  const resetVerticalWaves = () => setVerticalWaves({ count: DEFAULT_PARAMETERS.textures.verticalWaves.count, depth: DEFAULT_PARAMETERS.textures.verticalWaves.depth, duty: DEFAULT_PARAMETERS.textures.verticalWaves.duty });
  const resetVerticalRods = () => setVerticalRods({ count: DEFAULT_PARAMETERS.textures.verticalRods.count, depth: DEFAULT_PARAMETERS.textures.verticalRods.depth, duty: DEFAULT_PARAMETERS.textures.verticalRods.duty });

  const [svgDialogOpen, setSvgDialogOpen] = useState(false);
  const svgFileRef = useRef<HTMLInputElement>(null);

  const handleSvgFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setSvgPattern({ svgText: content });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveSvg = () => {
    const raw = params.textures.svgPattern?.svgText;
    if (!raw) return;
    const markup = parseSvgInput(raw);
    const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
    const svgName = designName ? `${designName}-pattern.svg` : 'vasemaker-pattern.svg';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = svgName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <GroupHeader label="Surface" color={GROUP_COLORS.surface} />

      <Section title="Textures" defaultOpen={false} checked={params.textures.enabled !== false} onToggle={(v) => setTexturesEnabled(v)} tooltip="Surface textures — master switch must be on for textures to render" titleColor={GROUP_COLORS.surface}>
        <Toggle label="Fluting" checked={params.textures.fluting.enabled} onChange={(v) => setFluting({ enabled: v })} onReset={resetFluting} tooltip="Smooth sine-wave grooves around the vase" />
        {params.textures.fluting.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.fluting.count} {...TEXTURES.fluting.count} onChange={(v) => setFluting({ count: v })} tooltip="Number of flutes around circumference" />
            <SliderRow label="Depth" value={params.textures.fluting.depth} {...TEXTURES.fluting.depth} onChange={(v) => setFluting({ depth: v })} tooltip="Groove depth in mm" />
            <SliderRow label="Duty" value={params.textures.fluting.duty ?? 0} {...TEXTURES.fluting.duty} onChange={(v) => setFluting({ duty: v })} tooltip="Groove width ratio — 0 = narrow grooves, 0.9 = wide grooves" />
          </div>
        )}
        <Toggle label="Square Flute" checked={params.textures.squareFlute?.enabled ?? false} onChange={(v) => setSquareFlute({ enabled: v })} onReset={resetSquareFlute} tooltip="Flat-topped pillars with rectangular channels" />
        {params.textures.squareFlute?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.squareFlute.count} {...TEXTURES.squareFlute.count} onChange={(v) => setSquareFlute({ count: v })} tooltip="Number of pillars around circumference" />
            <SliderRow label="Depth" value={params.textures.squareFlute.depth} {...TEXTURES.squareFlute.depth} onChange={(v) => setSquareFlute({ depth: v })} tooltip="Channel depth in mm" />
            <SliderRow label="Duty" value={params.textures.squareFlute.duty} {...TEXTURES.squareFlute.duty} onChange={(v) => setSquareFlute({ duty: v })} tooltip="Pillar-to-groove ratio (high = wide pillars, narrow channels)" />
            <SliderRow label="Sharpness" value={params.textures.squareFlute.sharpness} {...TEXTURES.squareFlute.sharpness} onChange={(v) => setSquareFlute({ sharpness: v })} tooltip="Edge transition (1 = sharp square, 0 = rounded)" />
          </div>
        )}
        <Toggle label="Waves" checked={params.textures.waves?.enabled ?? false} onChange={(v) => setWaves({ enabled: v })} onReset={resetWaves} tooltip="Smooth sinusoidal lobes going outward (softer than Rods)" />
        {params.textures.waves?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.waves.count} {...TEXTURES.waves.count} onChange={(v) => setWaves({ count: v })} tooltip="Number of wave lobes around circumference" />
            <SliderRow label="Depth" value={params.textures.waves.depth} {...TEXTURES.waves.depth} onChange={(v) => setWaves({ depth: v })} tooltip="Wave height outward in mm" />
            <SliderRow label="Duty" value={params.textures.waves.duty} {...TEXTURES.waves.duty} onChange={(v) => setWaves({ duty: v })} tooltip="Gap between waves (0 = touching, 0.9 = narrow lobes with wide gaps)" />
          </div>
        )}
        <Toggle label="Rods" checked={params.textures.rods?.enabled ?? false} onChange={(v) => setRods({ enabled: v })} onReset={resetRods} tooltip="Semicircular pillars going outward — like cylindrical rods on the surface" />
        {params.textures.rods?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.rods.count} {...TEXTURES.rods.count} onChange={(v) => setRods({ count: v })} tooltip="Number of rods around circumference" />
            <SliderRow label="Depth" value={params.textures.rods.depth} {...TEXTURES.rods.depth} onChange={(v) => setRods({ depth: v })} tooltip="Rod height outward in mm" />
            <SliderRow label="Duty" value={params.textures.rods.duty} {...TEXTURES.rods.duty} onChange={(v) => setRods({ duty: v })} tooltip="Gap between rods (0 = touching, 0.9 = narrow rods with wide gaps)" />
          </div>
        )}
        <Toggle label="Vertical Fluting" checked={params.textures.verticalFluting?.enabled ?? false} onChange={(v) => setVerticalFluting({ enabled: v })} onReset={resetVerticalFluting} tooltip="Sine-wave grooves running horizontally (bands up the height)" />
        {params.textures.verticalFluting?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.verticalFluting.count} {...TEXTURES.verticalFluting.count} onChange={(v) => setVerticalFluting({ count: v })} tooltip="Number of flute bands up the height" />
            <SliderRow label="Depth" value={params.textures.verticalFluting.depth} {...TEXTURES.verticalFluting.depth} onChange={(v) => setVerticalFluting({ depth: v })} tooltip="Groove depth in mm" />
            <SliderRow label="Duty" value={params.textures.verticalFluting.duty ?? 0} {...TEXTURES.verticalFluting.duty} onChange={(v) => setVerticalFluting({ duty: v })} tooltip="Groove width ratio — 0 = narrow grooves, 0.9 = wide grooves" />
          </div>
        )}
        <Toggle label="Vertical Square Flute" checked={params.textures.verticalSquareFlute?.enabled ?? false} onChange={(v) => setVerticalSquareFlute({ enabled: v })} onReset={resetVerticalSquareFlute} tooltip="Flat-topped horizontal bands with rectangular channels" />
        {params.textures.verticalSquareFlute?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.verticalSquareFlute.count} {...TEXTURES.verticalSquareFlute.count} onChange={(v) => setVerticalSquareFlute({ count: v })} tooltip="Number of horizontal bands" />
            <SliderRow label="Depth" value={params.textures.verticalSquareFlute.depth} {...TEXTURES.verticalSquareFlute.depth} onChange={(v) => setVerticalSquareFlute({ depth: v })} tooltip="Channel depth in mm" />
            <SliderRow label="Duty" value={params.textures.verticalSquareFlute.duty} {...TEXTURES.verticalSquareFlute.duty} onChange={(v) => setVerticalSquareFlute({ duty: v })} tooltip="Band-to-groove ratio (high = wide bands, narrow channels)" />
            <SliderRow label="Sharpness" value={params.textures.verticalSquareFlute.sharpness} {...TEXTURES.verticalSquareFlute.sharpness} onChange={(v) => setVerticalSquareFlute({ sharpness: v })} tooltip="Edge transition (1 = sharp square, 0 = rounded)" />
          </div>
        )}
        <Toggle label="Vertical Waves" checked={params.textures.verticalWaves?.enabled ?? false} onChange={(v) => setVerticalWaves({ enabled: v })} onReset={resetVerticalWaves} tooltip="Smooth horizontal wave bands going outward" />
        {params.textures.verticalWaves?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.verticalWaves.count} {...TEXTURES.verticalWaves.count} onChange={(v) => setVerticalWaves({ count: v })} tooltip="Number of wave bands up the height" />
            <SliderRow label="Depth" value={params.textures.verticalWaves.depth} {...TEXTURES.verticalWaves.depth} onChange={(v) => setVerticalWaves({ depth: v })} tooltip="Wave height outward in mm" />
            <SliderRow label="Duty" value={params.textures.verticalWaves.duty} {...TEXTURES.verticalWaves.duty} onChange={(v) => setVerticalWaves({ duty: v })} tooltip="Gap between waves (0 = touching, 0.9 = narrow lobes with wide gaps)" />
          </div>
        )}
        <Toggle label="Vertical Rods" checked={params.textures.verticalRods?.enabled ?? false} onChange={(v) => setVerticalRods({ enabled: v })} onReset={resetVerticalRods} tooltip="Semicircular horizontal bands going outward" />
        {params.textures.verticalRods?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.verticalRods.count} {...TEXTURES.verticalRods.count} onChange={(v) => setVerticalRods({ count: v })} tooltip="Number of rod bands up the height" />
            <SliderRow label="Depth" value={params.textures.verticalRods.depth} {...TEXTURES.verticalRods.depth} onChange={(v) => setVerticalRods({ depth: v })} tooltip="Rod height outward in mm" />
            <SliderRow label="Duty" value={params.textures.verticalRods.duty} {...TEXTURES.verticalRods.duty} onChange={(v) => setVerticalRods({ duty: v })} tooltip="Gap between rods (0 = touching, 0.9 = narrow rods with wide gaps)" />
          </div>
        )}
        <Toggle label="Basket Weave" checked={params.textures.basketWeave.enabled} onChange={(v) => setBasketWeave({ enabled: v })} onReset={resetBasketWeave} tooltip="Alternating horizontal band weave pattern" />
        {params.textures.basketWeave.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Bands" value={params.textures.basketWeave.bands} {...TEXTURES.basketWeave.bands} onChange={(v) => setBasketWeave({ bands: v })} tooltip="Number of horizontal bands" />
            <SliderRow label="Waves" value={params.textures.basketWeave.waves} {...TEXTURES.basketWeave.waves} onChange={(v) => setBasketWeave({ waves: v })} tooltip="Number of waves around circumference" />
            <SliderRow label="Depth" value={params.textures.basketWeave.depth} {...TEXTURES.basketWeave.depth} onChange={(v) => setBasketWeave({ depth: v })} tooltip="Weave depth in mm" />
          </div>
        )}
        {/* Voronoi UI hidden for now — engine code preserved for future improvements */}
        <Toggle label="Simplex" checked={params.textures.simplex?.enabled ?? false} onChange={(v) => setSimplex({ enabled: v })} onReset={resetSimplex} tooltip="Organic noise displacement (rocky, craggy surface)" />
        {params.textures.simplex?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Scale" value={params.textures.simplex.scale} {...TEXTURES.simplex.scale} onChange={(v) => setSimplex({ scale: v })} tooltip="Feature density (higher = more features)" />
            <SliderRow label="Depth" value={params.textures.simplex.depth} {...TEXTURES.simplex.depth} onChange={(v) => setSimplex({ depth: v })} tooltip="Displacement amplitude in mm" />
            <SliderRow label="Octaves" value={params.textures.simplex.octaves} {...TEXTURES.simplex.octaves} onChange={(v) => setSimplex({ octaves: v })} tooltip="Detail layers (1 = smooth, 6 = craggy)" />
            <SliderRow label="Persistence" value={params.textures.simplex.persistence} {...TEXTURES.simplex.persistence} onChange={(v) => setSimplex({ persistence: v })} tooltip="How much each octave contributes (lower = smoother)" />
            <SliderRow label="Lacunarity" value={params.textures.simplex.lacunarity} {...TEXTURES.simplex.lacunarity} onChange={(v) => setSimplex({ lacunarity: v })} tooltip="Frequency multiplier per octave (higher = finer detail)" />
            <SliderRow label="Seed" value={params.textures.simplex.seed} {...TEXTURES.simplex.seed} onChange={(v) => setSimplex({ seed: v })} tooltip="Pattern variation — change for a different random pattern" />
          </div>
        )}
        <Toggle label="Stipple" checked={params.textures.woodGrain?.enabled ?? false} onChange={(v) => setWoodGrain({ enabled: v })} onReset={resetWoodGrain} tooltip="Bumpy, irregular surface texture using noise-perturbed grooves" />
        {params.textures.woodGrain?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <SliderRow label="Count" value={params.textures.woodGrain.count} {...TEXTURES.woodGrain.count} onChange={(v) => setWoodGrain({ count: v })} tooltip="Number of grain lines around circumference" />
            <SliderRow label="Depth" value={params.textures.woodGrain.depth} {...TEXTURES.woodGrain.depth} onChange={(v) => setWoodGrain({ depth: v })} tooltip="Groove depth in mm" />
            <SliderRow label="Wobble" value={params.textures.woodGrain.wobble} {...TEXTURES.woodGrain.wobble} onChange={(v) => setWoodGrain({ wobble: v })} tooltip="How much lines meander side-to-side" />
            <SliderRow label="Sharpness" value={params.textures.woodGrain.sharpness} {...TEXTURES.woodGrain.sharpness} onChange={(v) => setWoodGrain({ sharpness: v })} tooltip="Edge hardness (0 = soft grooves, 1 = sharp lines)" />
            <SliderRow label="Seed" value={params.textures.woodGrain.seed} {...TEXTURES.woodGrain.seed} onChange={(v) => setWoodGrain({ seed: v })} tooltip="Pattern variation — change for a different random pattern" />
          </div>
        )}
        <Toggle label="SVG Pattern" checked={params.textures.svgPattern?.enabled ?? false} onChange={(v) => setSvgPattern({ enabled: v })} onReset={resetSvgPattern} tooltip="Use SVG artwork as a displacement pattern" />
        {params.textures.svgPattern?.enabled && (
          <div className="ml-1 pl-2 border-l-2 border-[var(--border-color)]">
            <div className="flex items-center gap-2 mb-1">
              {params.textures.svgPattern.svgText && (
                <SvgPreviewThumb svgText={params.textures.svgPattern.svgText} rotation={params.textures.svgPattern.rotation} flipX={params.textures.svgPattern.flipX} flipY={params.textures.svgPattern.flipY} />
              )}
              {params.textures.svgPattern.svgText && (
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => setSvgPattern({ rotation: ((params.textures.svgPattern.rotation ?? 0) + 90) % 360 })}
                    className="w-6 h-6 flex items-center justify-center rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors"
                    title="Rotate 90° clockwise"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 2.5A5 5 0 1 0 11.5 7" /><path d="M10 0.5L12 2.5L10 4.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setSvgPattern({ flipX: !(params.textures.svgPattern.flipX ?? false) })}
                    className="w-6 h-6 flex items-center justify-center rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors"
                    title="Flip horizontal"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1.5 7H4L2 5M2 9L4 7" /><path d="M12.5 7H10L12 5M12 9L10 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setSvgPattern({ flipY: !(params.textures.svgPattern.flipY ?? false) })}
                    className="w-6 h-6 flex items-center justify-center rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-secondary)] transition-colors"
                    title="Flip vertical"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 1.5V4L5 2M9 2L7 4" /><path d="M7 12.5V10L5 12M9 12L7 10" />
                    </svg>
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => svgFileRef.current?.click()}
                  className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-primary)] transition-colors"
                >
                  Load SVG
                </button>
                <button
                  onClick={handleSaveSvg}
                  disabled={!params.textures.svgPattern.svgText}
                  className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-primary)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save SVG
                </button>
                <button
                  onClick={() => setSvgDialogOpen(true)}
                  className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--border-color)] text-[var(--text-primary)] transition-colors"
                >
                  Paste SVG
                </button>
              </div>
              <input ref={svgFileRef} type="file" accept=".svg" onChange={handleSvgFileSelected} className="hidden" />
            </div>
            <div className="text-xs text-[var(--text-secondary)] opacity-60 mb-2">
              {params.textures.svgPattern.svgText ? 'SVG loaded' : 'SVG empty'}
            </div>
            {params.textures.svgPattern.svgText && (
              <>
                <SliderRow label="# Tiles Around" value={params.textures.svgPattern.repeatX} {...TEXTURES.svgPattern.repeatX} onChange={(v) => setSvgPattern({ repeatX: v })} tooltip="Number of tile repeats around circumference" />
                <SliderRow label="# Tiles Vert" value={params.textures.svgPattern.repeatY} {...TEXTURES.svgPattern.repeatY} onChange={(v) => setSvgPattern({ repeatY: v })} tooltip="Number of tile repeats up the height" />
                <SliderRow label="SVG Size X" value={params.textures.svgPattern.sizeAround ?? 100} {...TEXTURES.svgPattern.sizeAround} onChange={(v) => setSvgPattern({ sizeAround: v })} tooltip="Motif width as % of tile cell (smaller = more gap between motifs)" suffix="%" />
                <div className="flex items-center gap-2 ml-4 -mt-1 mb-1">
                  <span className="text-xs text-[var(--text-secondary)] opacity-60">↕ 100% for tiling</span>
                  <button className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]" onClick={() => setSvgPattern({ sizeAround: 100, sizeUp: 100 })}>Reset</button>
                </div>
                <SliderRow label="SVG Size Y" value={params.textures.svgPattern.sizeUp ?? 100} {...TEXTURES.svgPattern.sizeUp} onChange={(v) => setSvgPattern({ sizeUp: v })} tooltip="Motif height as % of tile cell (smaller = more gap between motifs)" suffix="%" />
                <SliderRow label="Rotate" value={params.textures.svgPattern.tileRotation ?? 0} {...TEXTURES.svgPattern.tileRotation} onChange={(v) => setSvgPattern({ tileRotation: v })} tooltip="Uniform rotation for all tiles in degrees" suffix="°" />
                <div className="flex items-center gap-1 mb-2">
                  <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title="Max random tilt per tile in degrees">Rand. Rotate</label>
                  <input type="range" min={0} max={360} step={1} value={params.textures.svgPattern.randomRotation ?? 0} onChange={(e) => setSvgPattern({ randomRotation: parseFloat(e.target.value) })} className="flex-1 min-w-0 h-1.5 accent-[var(--accent)]" />
                  <span className="text-xs text-[var(--text-secondary)] w-12 shrink-0 text-right tabular-nums">{params.textures.svgPattern.randomRotation ?? 0}°</span>
                  <button className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--border-color)] shrink-0" title="Re-randomize rotation" onClick={() => setSvgPattern({ randomRotateSeed: ((params.textures.svgPattern.randomRotateSeed ?? 0) + 1) % 100 })}>↻</button>
                </div>
                <div className="flex items-center gap-1 mb-2">
                  <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title="Max random size variation per tile (%)">Rand. Size</label>
                  <input type="range" min={0} max={50} step={1} value={params.textures.svgPattern.randomScale ?? 0} onChange={(e) => setSvgPattern({ randomScale: parseFloat(e.target.value) })} className="flex-1 min-w-0 h-1.5 accent-[var(--accent)]" />
                  <span className="text-xs text-[var(--text-secondary)] w-12 shrink-0 text-right tabular-nums">{params.textures.svgPattern.randomScale ?? 0}%</span>
                  <button className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--border-color)] shrink-0" title="Re-randomize scale" onClick={() => setSvgPattern({ randomScaleSeed: ((params.textures.svgPattern.randomScaleSeed ?? 0) + 1) % 100 })}>↻</button>
                </div>
                <Toggle label="Mirror Alt." checked={params.textures.svgPattern.mirrorAlternate ?? false} onChange={(v) => setSvgPattern({ mirrorAlternate: v })} tooltip="Flip every other tile horizontally" />
                <SliderRow label="Vert Spacing" value={params.textures.svgPattern.spaceUp ?? 0} min={0} max={100} step={1} onChange={(v) => setSvgPattern({ spaceUp: v })} tooltip="Distance between row centers (% of vase height). 0 = auto (evenly divided)" />
                <SliderRow label="Vert Move" value={params.textures.svgPattern.shiftUp ?? 0} {...TEXTURES.svgPattern.shiftUp} onChange={(v) => setSvgPattern({ shiftUp: v })} tooltip="Shift pattern up the vase (% of vase height)" suffix="%" />
                <SliderRow label="Stagger Rows" value={params.textures.svgPattern.stagger ?? 0} {...TEXTURES.svgPattern.stagger} onChange={(v) => setSvgPattern({ stagger: v })} tooltip="Shift alternate rows horizontally (% of cell width)" />
                <Toggle label="Invert SVG" checked={params.textures.svgPattern.invert ?? false} onChange={(v) => setSvgPattern({ invert: v })} tooltip="Swap grooves and ridges" />
                <SliderRow label="Depth" value={params.textures.svgPattern.depth} {...TEXTURES.svgPattern.depth} onChange={(v) => setSvgPattern({ depth: v })} tooltip="Displacement depth in mm" />
                <Toggle label="Cutout" checked={params.textures.svgPattern.cutout ?? false} onChange={(v) => setSvgPattern({ cutout: v })} tooltip="Punch holes through the wall at dark areas" />
                <div className="text-xs text-[var(--text-secondary)] mt-1 opacity-60">
                  Increase Resolution for finer detail
                </div>
              </>
            )}
          </div>
        )}
        {svgDialogOpen && (
          <SvgLoadDialog
            onClose={() => setSvgDialogOpen(false)}
            onApply={(svg) => setSvgPattern({ svgText: svg })}
            initialSvg={params.textures.svgPattern?.svgText ?? ''}
          />
        )}
      </Section>
    </>
  );
}
