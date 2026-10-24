/**
 * Built-in sample SVGs for SprigMaker — simple shapes drawn here for the app
 * (no copied artwork), so a new user has something to inflate straight away.
 *
 * `aspect` is the width / height of each drawing's INKED extent, worked out by
 * hand from the shapes below (the app crops whitespace before sizing, so this is
 * what the 🔗 lock needs). It is only used before the browser has measured the
 * SVG itself; loading a sample re-measures it.
 */

export interface SprigSample {
  id: string;
  name: string;
  description: string;
  svg: string;
  aspect: number;
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

export const SPRIG_SAMPLES: SprigSample[] = [
  { id: 'dragonfly', name: 'Dragonfly', description: 'Four wings and a long thin body', svg: DRAGONFLY, aspect: 79.44 / 72 },
  { id: 'leaf', name: 'Leaf', description: 'Gray veins — try Inflate + Gray detail', svg: LEAF, aspect: 45 / 96 },
  { id: 'lizard', name: 'Lizard', description: 'Thin legs and tail — try Inflate, and watch the thin-part check', svg: LIZARD, aspect: 48 / 94.5 },
];

export const DEFAULT_SPRIG_SVG = DRAGONFLY;
export const DEFAULT_SPRIG_SVG_NAME = 'Dragonfly';
export const DEFAULT_SPRIG_ASPECT = 79.44 / 72;
