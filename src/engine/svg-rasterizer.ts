/**
 * SVG rasterizer — converts SVG markup to a grayscale pixel array.
 * Runs in the browser (needs DOM). Used by use-vase-mesh.ts to feed
 * pixel data into the pure-math mesh generator.
 */

/** Rasterized SVG data ready for mesh-generator sampling */
export interface SvgPixelData {
  pixels: Uint8Array;  // grayscale 0–255, row-major
  width: number;
  height: number;
}

/**
 * Parse user input into clean SVG markup.
 * Accepts three formats:
 * 1. Raw SVG: `<svg ...>...</svg>`
 * 2. Data URL: `data:image/svg+xml,...`
 * 3. CSS background-image line: `background-image: url("data:image/svg+xml,...");`
 *
 * Also ensures the resulting SVG has explicit width/height attributes
 * (required for rendering via <img> / canvas).
 */
export function parseSvgInput(input: string): string {
  const trimmed = input.trim();
  let svg: string;

  // Format 1: raw SVG (may have <!DOCTYPE>, <?xml>, or comments before <svg>)
  if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<!--')) {
    // Strip everything before the <svg tag (DOCTYPE, XML declarations, comments)
    const svgStart = trimmed.indexOf('<svg');
    svg = svgStart >= 0 ? trimmed.substring(svgStart) : trimmed;
  } else {
    // Format 3: CSS background-image line — extract the data URL
    // Hero Patterns uses: url("data:image/svg+xml,%3Csvg...") — percent-encoded
    // Pattern Monster uses: url("data:image/svg+xml,<svg ...>...</svg>") — raw SVG with parens inside
    // Match from opening quote to closing quote+paren to handle raw SVG content with () inside
    let dataUrl = trimmed;
    const cssMatch = trimmed.match(/url\(\s*"(data:image\/svg\+xml[^"]+)"\s*\)/)
      || trimmed.match(/url\(\s*'(data:image\/svg\+xml[^']+)'\s*\)/)
      || trimmed.match(/url\(\s*(data:image\/svg\+xml[^)]+?)\s*\)/);
    if (cssMatch) {
      dataUrl = cssMatch[1];
    }

    // Format 2: data URL
    if (dataUrl.startsWith('data:image/svg+xml')) {
      // Handle both base64 and percent-encoded
      const base64Match = dataUrl.match(/^data:image\/svg\+xml;base64,(.+)/);
      if (base64Match) {
        svg = atob(base64Match[1]);
      } else {
        // Content after the comma — may be percent-encoded or raw SVG
        const content = dataUrl.replace(/^data:image\/svg\+xml[^,]*,/, '');
        if (content.startsWith('<svg') || content.startsWith('<?xml')) {
          // Raw SVG markup (e.g. Pattern Monster) — mostly raw but may have
          // selective percent-encoding like %23 for # in url() references.
          // Decode only safe percent sequences that won't break the markup.
          svg = content.replace(/%23/g, '#').replace(/%27/g, "'").replace(/%20/g, ' ');
        } else {
          // Percent-encoded (e.g. Hero Patterns with %3Csvg...)
          try {
            svg = decodeURIComponent(content);
          } catch {
            // If decoding fails (invalid % sequences), treat as raw markup
            svg = content;
          }
        }
      }
    } else {
      // Fallback: assume it's SVG markup
      svg = trimmed;
    }
  }

  // Ensure the SVG has explicit width/height (needed for <img> / canvas rendering).
  // If it only has viewBox but no width/height, inject them.
  svg = ensureSvgDimensions(svg, 256, 256);

  return svg;
}

/**
 * If the <svg> tag lacks width/height attributes, inject them.
 * This ensures the SVG renders at a known size in <img> and canvas.
 */
function ensureSvgDimensions(svg: string, defaultW: number, defaultH: number): string {
  const svgTagMatch = svg.match(/<svg\b([^>]*)>/);
  if (!svgTagMatch) return svg;

  const attrs = svgTagMatch[1];
  // Percentage dimensions (e.g. width='100%') are useless for <img>/canvas rendering
  const hasWidth = /\bwidth\s*=\s*['"]?\d+(\.\d+)?(px)?\s*['"]?/.test(attrs)
    && !/\bwidth\s*=\s*['"]?\d+(\.\d+)?%/.test(attrs);
  const hasHeight = /\bheight\s*=\s*['"]?\d+(\.\d+)?(px)?\s*['"]?/.test(attrs)
    && !/\bheight\s*=\s*['"]?\d+(\.\d+)?%/.test(attrs);

  if (hasWidth && hasHeight) return svg;

  // Try to get dimensions from viewBox
  let w = defaultW;
  let h = defaultH;
  const vbMatch = attrs.match(/viewBox\s*=\s*["']?\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (vbMatch) {
    w = parseFloat(vbMatch[3]);
    h = parseFloat(vbMatch[4]);
  }

  // Strip any existing width/height (including percentage values) before injecting numeric ones
  let newAttrs = attrs;
  if (!hasWidth) {
    newAttrs = newAttrs.replace(/\bwidth\s*=\s*['"][^'"]*['"]/g, '').replace(/\bwidth\s*=\s*\S+/g, '');
    newAttrs += ` width="${w}"`;
  }
  if (!hasHeight) {
    newAttrs = newAttrs.replace(/\bheight\s*=\s*['"][^'"]*['"]/g, '').replace(/\bheight\s*=\s*\S+/g, '');
    newAttrs += ` height="${h}"`;
  }

  return svg.replace(/<svg\b[^>]*>/, `<svg${newAttrs}>`);
}

/**
 * Extract the native width/height from SVG markup (from attributes or viewBox).
 * Returns [width, height] or null if not determinable.
 */
function getSvgDimensions(svgMarkup: string): [number, number] | null {
  const svgTag = svgMarkup.match(/<svg\b([^>]*)>/);
  if (!svgTag) return null;
  const attrs = svgTag[1];

  // Try explicit width/height attributes (skip percentage values like '100%')
  const wMatch = attrs.match(/\bwidth\s*=\s*['"]?([\d.]+)(px)?\s*['"]?/);
  const hMatch = attrs.match(/\bheight\s*=\s*['"]?([\d.]+)(px)?\s*['"]?/);
  if (wMatch && hMatch
    && !/\bwidth\s*=\s*['"]?[\d.]+%/.test(attrs)
    && !/\bheight\s*=\s*['"]?[\d.]+%/.test(attrs)) {
    return [parseFloat(wMatch[1]), parseFloat(hMatch[1])];
  }

  // Try viewBox
  const vbMatch = attrs.match(/viewBox\s*=\s*["']?\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/);
  if (vbMatch) {
    return [parseFloat(vbMatch[1]), parseFloat(vbMatch[2])];
  }

  return null;
}

/**
 * Rasterize SVG markup to a grayscale pixel array via an offscreen canvas.
 * Preserves the SVG's native aspect ratio, scaled so the larger dimension
 * is `maxDim` pixels.
 */
export async function rasterizeSvg(
  svgMarkup: string,
  maxDim = 512,
  padPixels = 0
): Promise<SvgPixelData> {
  // Determine rasterization size from SVG's native aspect ratio
  const dims = getSvgDimensions(svgMarkup);
  let width: number;
  let height: number;
  if (dims) {
    const [svgW, svgH] = dims;
    const scale = maxDim / Math.max(svgW, svgH);
    width = Math.max(1, Math.round(svgW * scale));
    height = Math.max(1, Math.round(svgH * scale));
  } else {
    width = maxDim;
    height = maxDim;
  }

  // Canvas padding — draws the SVG into an inner region of the bitmap with a
  // white border (in pixels) around it. The Gaussian blur below then produces
  // natural falloff gradients where the SVG content meets the white margin, so
  // content that touches the SVG's viewBox edge no longer creates cliffs on
  // the vase. Pixels-based so the amount of padding needed is uniform
  // regardless of the motif's physical size — the cliff is a blur-pixel
  // artifact, not a motif-size artifact.
  const pad = Math.max(0, Math.min(Math.floor(Math.min(width, height) / 2) - 1, Math.round(padPixels)));
  const innerW = Math.max(1, width - 2 * pad);
  const innerH = Math.max(1, height - 2 * pad);

  // Override the SVG's width/height to match the INNER target dimensions so the
  // browser rasterizes at full drawn resolution without extra scaling.
  const scaledMarkup = setSvgSize(svgMarkup, innerW, innerH);

  const blob = new Blob([scaledMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url, innerW, innerH);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Draw white background (so transparent SVG areas = white = flush, and so
    // the padding region is solid white)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw the SVG into the inner region, leaving a white margin
    ctx.drawImage(img, pad, pad, innerW, innerH);

    // Extract grayscale
    const imageData = ctx.getImageData(0, 0, width, height);
    const rgba = imageData.data;
    const raw = new Uint8Array(width * height);

    for (let i = 0; i < raw.length; i++) {
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      // Luminance formula
      raw[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    // Gaussian blur to anti-alias sharp edges for smoother displacement.
    // Without this, sharp black/white transitions create staircase artifacts
    // on the mesh where vertex density can't resolve the edge.
    const pixels = gaussianBlur(raw, width, height, 3);

    return { pixels, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Simple separable Gaussian blur on a grayscale Uint8Array.
 * Radius is in pixels — a radius of 2 gives a 5x5 kernel.
 * Wraps horizontally (for seamless tiling) and clamps vertically.
 */
function gaussianBlur(src: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  if (radius <= 0) return src;

  // Build 1D Gaussian kernel
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  const sigma = radius / 2;
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;

  // Horizontal pass (wraps for seamless tiling)
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = 0; k < size; k++) {
        const sx = ((x + k - radius) % w + w) % w; // wrap horizontally
        val += src[y * w + sx] * kernel[k];
      }
      tmp[y * w + x] = val;
    }
  }

  // Vertical pass (clamp at edges)
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = 0; k < size; k++) {
        const sy = Math.min(Math.max(y + k - radius, 0), h - 1);
        val += tmp[sy * w + x] * kernel[k];
      }
      dst[y * w + x] = Math.round(val);
    }
  }

  return dst;
}

/**
 * Replace or inject width/height on the <svg> tag so the browser
 * rasterizes at exactly the desired pixel dimensions.
 */
function setSvgSize(svg: string, w: number, h: number): string {
  return svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    // Remove existing width/height (including units like "px", "em", "%")
    let cleaned = attrs
      .replace(/\bwidth\s*=\s*['"][^'"]*['"]/g, '')
      .replace(/\bheight\s*=\s*['"][^'"]*['"]/g, '')
      .replace(/\bwidth\s*=\s*\S+/g, '')
      .replace(/\bheight\s*=\s*\S+/g, '');
    return `<svg${cleaned} width="${w}" height="${h}">`;
  });
}

/** Load an image from a URL with explicit dimensions */
function loadImage(url: string, width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.width = width;
    img.height = height;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load SVG image'));
    img.src = url;
  });
}
