/**
 * "Tips for best results" — the box opened from the button above Sample
 * drawings on the Sprig page (Gary, 2026-10-30). Pure data, so the wording can
 * be edited here without touching the component (SprigTips.tsx).
 *
 * Gary's aim: set expectations neither too high nor too low. The starting
 * picture is the hardest part of getting a good sprig, and a relief STL gives
 * the best results, so it comes first.
 */

import type { HelpBlock, HelpSection } from './help-content';

/** MakerWorld's Relief Sculpture Maker. Empty = name it without a link. */
export const RELIEF_MAKER_URL = 'https://makerworld.com/en/makerlab/reliefSculptureMakerV2?from=makerlab';

export interface TipsSection {
  title: string;
  /** Paragraphs; a string starting with "• " is shown as a bullet. */
  body: string[];
}

export const SPRIG_TIPS_TITLE = 'Getting the best results';

export const SPRIG_TIPS_INTRO =
  'A sprig is a small relief, so it needs HEIGHT: which parts stand tall and which stay low. A flat picture does not have that. SprigMaker has to work it out from the outline, the shades, or a depth guess, and the picture you start from matters more than any setting. Expect a clean drawing to give a good sprig in a few minutes. A busy photo may take a lot of adjusting, and some pictures will not make a good sprig at all.';

export const SPRIG_TIPS: TipsSection[] = [
  {
    title: '1. Best: a relief STL',
    body: [
      'Apps made for this sculpt a picture into a real 3-D relief — rounded bodies, layered petals, veins — depth a flat picture does not have. MakerWorld’s Relief Sculpture Maker (link below) is one, online. Register for a free MakerWorld account, upload your picture there, download the relief as an STL, and press LOAD RELIEF STL here. Its base plaque is dropped automatically.',
      'About 3 mm high is typically a good height for a sprig mold, so set that there if you can. It comes in at its own size and height, and you can still change Width, Max Height and the clean-up settings here. Watch for detail finer than about 0.2 mm high, which clay may not hold, and thin parts (red) that need Widen.',
    ],
  },
  {
    title: '2. SVG drawings',
    body: [
      'Crisp edges at any size. Best for silhouettes, icons, logos and line art. But an SVG is flat: the Shaping buttons give it its height.',
      '• A solid silhouette: Inflate for a rounded shape, Flat for a stamp.',
      '• Line art (outlines with empty insides): raise Fill Holes.',
      '• Several shades: Gray makes darker shades stand higher.',
    ],
  },
  {
    title: '3. Pictures and photos (Load Image)',
    body: [
      'Work well: clip art, silhouettes and clean drawings on a plain background, with strong contrast and no shadows. Background Cut removes the background; Close Gaps mends breaks in an outline.',
      'Hard: photos with busy backgrounds, soft or blurry edges, shadows, watermarks, pencil sketches, and anything finer than about 1 mm at the sprig’s size. Cut the subject out onto a plain background first if you can.',
      'When part of a picture works against you, such as a line around the edge, a shadow or a busy background, it is often quicker to change the picture than to fight it with settings. Widely available AI apps that edit images can do this from a plain request, such as “remove the white line around each wing”, “put this on a plain white background” or “turn this into clean line art”. Then load the new picture.',
      'Photo depth guesses how near each part of a photo is and shapes it to match — it also adds texture to plain drawings. It is a guess: check the result from the side.',
    ],
  },
  {
    title: '4. Try every Shaping button',
    body: [
      'The same picture looks very different with each one, and the best choice is not always the obvious one. Try them all, then work down the Adjust list from the top. Turn the 3-D view to look from the side and at a low angle: that is the shape you will cast.',
    ],
  },
  {
    title: '5. Size and detail',
    body: [
      'Small sprigs lose detail. Parts shown in red are thinner than Min Feature and may tear coming out of the mold. Making the sprig bigger keeps more detail; Widen and Round Off fix what is left.',
    ],
  },
];

/** The same tips as the first section of the Help panel — one source, so the
 *  box and Help cannot drift apart (Gary, 2026-10-30). */
export function sprigTipsHelpSection(): HelpSection {
  const blocks: HelpBlock[] = [
    { type: 'paragraph', text: 'The same tips as the 💡 Tips for best results button, above Sample drawings.' },
    { type: 'paragraph', text: SPRIG_TIPS_INTRO },
  ];
  SPRIG_TIPS.forEach((t, i) => {
    blocks.push({ type: 'heading', text: t.title });
    let bullets: string[] = [];
    const flush = () => { if (bullets.length) { blocks.push({ type: 'list', items: bullets }); bullets = []; } };
    for (const line of t.body) {
      if (line.startsWith('• ')) bullets.push(line.slice(2));
      else { flush(); blocks.push({ type: 'paragraph', text: line }); }
    }
    flush();
    if (i === 0 && RELIEF_MAKER_URL) blocks.push({ type: 'link', text: 'Open MakerWorld’s Relief Sculpture Maker', href: RELIEF_MAKER_URL });
  });
  return { id: 'sprig-tips', title: SPRIG_TIPS_TITLE, blocks };
}
