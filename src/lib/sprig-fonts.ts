/**
 * SprigMaker's built-in fonts, chosen for casting: bold strokes, no hairlines,
 * and two scripts whose letters join (a word casts in one piece). Self-hosted
 * by next/font (downloaded at build time), so a design looks the same on every
 * computer — unlike a font installed on one machine.
 */

import { Nunito, Roboto_Slab, Lilita_One, Cinzel, Pacifico, Lobster } from 'next/font/google';
import type { SprigFont } from '@/engine/sprig/sprig-types';

const nunito = Nunito({ subsets: ['latin'], weight: '900', display: 'swap' });
const robotoSlab = Roboto_Slab({ subsets: ['latin'], weight: '800', display: 'swap' });
const lilita = Lilita_One({ subsets: ['latin'], weight: '400', display: 'swap' });
const cinzel = Cinzel({ subsets: ['latin'], weight: '800', display: 'swap' });
const pacifico = Pacifico({ subsets: ['latin'], weight: '400', display: 'swap' });
const lobster = Lobster({ subsets: ['latin'], weight: '400', display: 'swap' });

type Loaded = typeof nunito;

export const SPRIG_FONTS: Record<Exclude<SprigFont, 'system'>, { label: string; font: Loaded; weight: number }> = {
  rounded: { label: 'Rounded (Nunito)', font: nunito, weight: 900 },
  slab: { label: 'Slab (Roboto Slab)', font: robotoSlab, weight: 800 },
  chunky: { label: 'Chunky (Lilita One)', font: lilita, weight: 400 },
  classic: { label: 'Classic caps (Cinzel)', font: cinzel, weight: 800 },
  script: { label: 'Script (Pacifico)', font: pacifico, weight: 400 },
  script2: { label: 'Script 2 (Lobster)', font: lobster, weight: 400 },
};

/** Class names that pull every built-in font's @font-face into the page. */
export const SPRIG_FONT_CLASSES = Object.values(SPRIG_FONTS).map((f) => f.font.className);
