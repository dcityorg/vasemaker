/**
 * Built-in sample SVGs for SprigMaker — simple shapes drawn here for the app
 * (no copied artwork), so a new user has something to inflate straight away.
 *
 * `aspect` is the width / height of each drawing's INKED extent, worked out by
 * hand from the shapes below (the app crops whitespace before sizing, so this is
 * what the 🔗 lock needs). It is only used before the browser has measured the
 * SVG itself; loading a sample re-measures it.
 */

import type { SprigParameters } from '@/engine/sprig/sprig-types';

export interface SprigSample {
  id: string;
  name: string;
  description: string;
  /** The SVG markup — or, for a picture sample, '' and `picture` is set. */
  svg: string;
  aspect: number;
  /** A picture sample: its file under public/ (loaded like Load Image). */
  picture?: string;
  /** The settings that show it at its best (Gary, 2026-10-30): a sample loads
   *  with these, every other drawing setting at its default. Sprig tab only;
   *  on the Mark tab a sample loads just the drawing. */
  settings: Partial<SprigParameters>;
}

// Wings: rotated ellipses, inked x 10.28–89.72; head top y 4, abdomen tip y 76.
const DRAGONFLY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80">
<g fill="#000">
<ellipse cx="30" cy="22" rx="20" ry="6" transform="rotate(-10 30 22)"/>
<ellipse cx="70" cy="22" rx="20" ry="6" transform="rotate(10 70 22)"/>
<ellipse cx="32" cy="34" rx="18" ry="5" transform="rotate(15 32 34)"/>
<ellipse cx="68" cy="34" rx="18" ry="5" transform="rotate(-15 68 34)"/>
<circle cx="50" cy="10" r="6"/>
<ellipse cx="50" cy="24" rx="5" ry="9"/>
<rect x="48" y="30" width="4" height="46" rx="2"/>
</g>
</svg>`;

// Leaf: two cubics, inked x 27.5–72.5, y 2–98. Veins are GRAY, so they carve
// in with "Inflate + Gray detail" and vanish in the other modes.
const LEAF = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<path d="M50 2 C80 20 80 70 50 98 C20 70 20 20 50 2 Z" fill="#000"/>
<g stroke="#999" stroke-width="1.6" fill="none" stroke-linecap="round">
<path d="M50 12 L50 90"/>
<path d="M50 30 L63 22"/><path d="M50 30 L37 22"/>
<path d="M50 48 L66 38"/><path d="M50 48 L34 38"/>
<path d="M50 66 L63 56"/><path d="M50 66 L37 56"/>
</g>
</svg>`;

// Lizard: round-capped strokes, inked x 26–74, y 4–98.5. The thin tail and legs
// are what Inflate makes lower than the body.
const LIZARD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<g fill="#000">
<ellipse cx="50" cy="12" rx="6" ry="8"/>
<ellipse cx="50" cy="40" rx="8" ry="18"/>
</g>
<g stroke="#000" fill="none" stroke-linecap="round" stroke-linejoin="round">
<path d="M50 56 Q50 80 62 96" stroke-width="5"/>
<path d="M44 30 L32 22 L28 14" stroke-width="4"/>
<path d="M56 30 L68 22 L72 14" stroke-width="4"/>
<path d="M44 50 L32 58 L28 68" stroke-width="4"/>
<path d="M56 50 L68 58 L72 68" stroke-width="4"/>
</g>
</svg>`;

// Flower: line art — six petal outlines, a centre ring, a stem and two leaf
// outlines. Fill Holes fills the petals part way, so the lines stand above.
const FLOWER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">
<g fill="none" stroke="#000" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">
<g transform="translate(50 42)">
<path d="M0 -9 C10 -16 12 -34 0 -40 C-12 -34 -10 -16 0 -9 Z" transform="rotate(0)"/>
<path d="M0 -9 C10 -16 12 -34 0 -40 C-12 -34 -10 -16 0 -9 Z" transform="rotate(60)"/>
<path d="M0 -9 C10 -16 12 -34 0 -40 C-12 -34 -10 -16 0 -9 Z" transform="rotate(120)"/>
<path d="M0 -9 C10 -16 12 -34 0 -40 C-12 -34 -10 -16 0 -9 Z" transform="rotate(180)"/>
<path d="M0 -9 C10 -16 12 -34 0 -40 C-12 -34 -10 -16 0 -9 Z" transform="rotate(240)"/>
<path d="M0 -9 C10 -16 12 -34 0 -40 C-12 -34 -10 -16 0 -9 Z" transform="rotate(300)"/>
<circle r="9"/>
</g>
<path d="M50 82 C49 92 51 104 50 116"/>
<path d="M50 100 C58 92 70 92 76 96 C70 104 58 106 50 100 Z"/>
<path d="M50 92 C42 84 30 84 24 88 C30 96 42 98 50 92 Z"/>
</g>
</svg>`;

// Scallop shell in three greys: black ribs stand highest, grey fan between,
// light ears at the hinge lowest — Gray with three Steps.
const SHELL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6.4 10.0 87.2 68.0">
<path d="M50 76 L35 60 L34 70 Z" fill="#ccc"/><path d="M50 76 L65 60 L66 70 Z" fill="#ccc"/>
<path d="M50 74 L8.4 36.5 L9.2 27.3 L18.5 27.7 L21.4 19.0 L30.3 21.6 L35.3 13.8 L43.3 18.4 L50.0 12.0 L56.7 18.4 L64.7 13.8 L69.7 21.6 L78.6 19.0 L81.5 27.7 L90.8 27.3 L91.6 36.5 Z" fill="#888" stroke="#888" stroke-width="1.5" stroke-linejoin="round"/>
<g fill="#000">
<path d="M50 70 L8.2 30.9 L12.9 26.8 Z"/>
<path d="M50 70 L19.6 22.3 L25.2 19.4 Z"/>
<path d="M50 70 L32.7 16.5 L38.8 15.0 Z"/>
<path d="M50 70 L46.9 14.1 L53.1 14.1 Z"/>
<path d="M50 70 L61.2 15.0 L67.3 16.5 Z"/>
<path d="M50 70 L74.8 19.4 L80.4 22.3 Z"/>
<path d="M50 70 L87.1 26.8 L91.8 30.9 Z"/>
</g>
</svg>`;

// Bird: one solid silhouette, rounded by Inflate; the grey eye and wing line
// cut in with Inflate + Gray.
const BIRD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 76">
<path d="M6 31 L21 25 C25 14 38 10 48 17 C58 24 70 27 84 28 L108 16 L104 26 L114 28 C104 36 94 44 84 50 C72 58 58 62 44 60 C30 58 21 48 20 37 Z" fill="#000"/>
<circle cx="31" cy="24" r="2.6" fill="#888"/>
<path d="M46 36 C58 32 72 34 88 32 C78 42 62 48 50 46" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export const SPRIG_SAMPLES: SprigSample[] = [
  { id: 'dragonfly-picture', name: 'Dragonfly picture', description: 'A drawing — wings with veins, a segmented tail', svg: '', aspect: 870 / 614,
    picture: '/sprig-samples/dragonfly-picture.jpg',
    settings: { heightMode: 'inflateGray', imageBackground: 20, imageCloseGaps: 1, gapFill: 60, imageSmooth: 1, imageTones: 3, imageLightest: 40, detailDepth: 0.6, roundness: 3, edgeSoftness: 0.8, removeTiny: true } },
  { id: 'flower', name: 'Flower', description: 'Line art — Fill Holes fills the petals', svg: FLOWER, aspect: 0.8333,
    settings: { heightMode: 'inflate', fillHeight: 60, roundness: 2, edgeSoftness: 0.6 } },
  { id: 'shell', name: 'Seashell', description: 'Three greys — Gray makes darker stand higher', svg: SHELL, aspect: 1.2824,
    settings: { heightMode: 'gray', svgTones: 3, imageLightest: 25, edgeSoftness: 0.5 } },
  { id: 'bird', name: 'Bird', description: 'A silhouette — Inflate rounds it, the grey eye and wing cut in', svg: BIRD, aspect: 1.5789,
    settings: { heightMode: 'inflateGray', roundness: 4, detailDepth: 0.8, edgeSoftness: 0.6 } },
  { id: 'dragonfly', name: 'Dragonfly', description: 'Four wings and a long thin body', svg: DRAGONFLY, aspect: 79.44 / 72,
    settings: { heightMode: 'inflate' } },
  { id: 'leaf', name: 'Leaf', description: 'Grey veins cut in with Inflate + Gray', svg: LEAF, aspect: 45 / 96,
    settings: { heightMode: 'inflateGray' } },
  { id: 'lizard', name: 'Lizard', description: 'Thin legs and tail — watch the thin-part check', svg: LIZARD, aspect: 48 / 94.5,
    settings: { heightMode: 'inflate' } },
];

export const DEFAULT_SPRIG_SVG = DRAGONFLY;
export const DEFAULT_SPRIG_SVG_NAME = 'Dragonfly';
export const DEFAULT_SPRIG_ASPECT = 79.44 / 72;
