/**
 * SprigMaker help panel content — pure data, rendered by the shared HelpPanel.
 */

import type { HelpSection } from './help-content';

export const SPRIG_HELP_SECTIONS: HelpSection[] = [
  {
    id: 'sprig-quick-start',
    title: 'Quick Start',
    blocks: [
      { type: 'paragraph', text: 'A SPRIG is a small relief — a dragonfly, a leaf, a lizard — cast or pressed in its own mold and stuck onto a pot with slip. (Wedgwood’s white jasperware figures are sprigs.) SprigMaker turns a flat SVG drawing into that relief and makes the 3D-printable parts for a ONE-PIECE OPEN plaster mold of it: a plate carrying the relief, and a wall you print twice.' },
      { type: 'heading', text: 'Basic Workflow' },
      { type: 'list', items: [
        'Pick a sample drawing, or Load / Paste your own SVG — black is the shape, white is background',
        'Set Width and Length — the FINISHED sprig, after the clay shrinks',
        'Choose how it gets its height (Height → From) and set Max Height',
        'Check for red: parts narrower than Min Feature are likely to tear or crack',
        'Pick a Mold Size — the smallest one the sprig fits is chosen for you',
        'Export the plate. Export the wall too, the first time you use that size — then print it twice',
        'Clip the two walls onto the plate, pour plaster to the top of the walls, let it set, lift the walls off and pull the plate away',
      ] },
      { type: 'tip', text: 'STANDARD SIZES are the point of the design: every Small, Medium or Long plate fits the same wall pair, so you print the walls ONCE per size and only a plate per sprig after that. That is why the walls of a standard size have no sliders — anything that changed them would make the walls you already printed stop fitting. Use Custom if you need a different box; it makes its own walls.' },
      { type: 'tip', text: 'Everything auto-saves in this browser. Save Settings writes a «name».json with the drawing stored INSIDE it, so the file alone reproduces the sprig, plus a «name».txt bench sheet with the plaster batch and printer-fit numbers.' },
      { type: 'tip', text: 'Undo and redo (↶ ↷, or Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z) cover the whole design, drawing included. RESET SPRIG SETTINGS restores the default settings and keeps your drawing, its size and which way it faces. Each section also has its own Reset, top right, for just that section (Size\'s puts the drawing back the way it was loaded: unturned, unflipped and in its own proportions). REVERT TO SAVED puts everything back to your last saved file.' },
    ],
  },
  {
    id: 'sprig-height',
    title: 'Height — from a Flat Drawing',
    blocks: [
      { type: 'paragraph', text: 'An SVG is flat. Height → From decides how it gets a third dimension:' },
      { type: 'keyvalue', items: [
        { key: 'Flat', value: 'One height for the whole shape. Only the edge is shaped (see Edges).' },
        { key: 'Gray', value: 'Black is Max Height, white is the plate, and every gray is in between. For a drawing that already has shading.' },
        { key: 'Inflate', value: 'Blows the outline up like a balloon: each point rises with its distance from the nearest edge, up to Max Height. Thick parts reach full height and thin ones cannot, so a lizard’s body domes up while its legs and tail stay lower — nobody has to paint that by hand.' },
        { key: 'Inflate + Gray detail', value: 'Inflate, and lighter-gray marks inside the shape (eyes, scales, wing veins) cut in by up to Detail Depth. Pure white is background, so draw the details in GRAY, not white. The Leaf sample shows it.' },
      ] },
      { type: 'paragraph', text: 'For the inflate modes, ROUNDNESS is how far in from the edge it takes to reach Max Height. Small values give a flat-topped pillow; large ones a full dome. A part narrower than twice the Roundness never reaches full height. PROFILE sets the shape of the rise: Round (a dome), Pillow (steep sides, flat top) or Angular (a straight slope to a ridge).' },
      { type: 'tip', text: 'Inflate knows thick from thin, not anatomy — it will not raise a head above a body. For that, shade the drawing and use Gray.' },
      { type: 'tip', text: 'INVERT swaps black and white inside the drawing’s area, so the background becomes the raised part.' },
    ],
  },
  {
    id: 'sprig-edges',
    title: 'Edges and Thin Parts',
    blocks: [
      { type: 'paragraph', text: 'EDGE SOFTNESS is the width of the slope from the edge up to full height. Higher makes the sprig blend into the pot instead of sitting on it like a sticker, and helps the cast drop out of the mold. At 0 the edge is as steep as the grid allows.' },
      { type: 'paragraph', text: 'MIN EDGE is the thickness the edge stops at, so it ends in a thin lip rather than tapering to nothing. An edge feathered all the way to 0 is ragged and fragile — but 0 is allowed, to test it. You smooth the lip onto the pot with a tool anyway.' },
      { type: 'paragraph', text: 'MIN FEATURE paints red any part of the FINISHED sprig narrower than it — a dragonfly’s legs, a lizard’s toes. Those tear coming out of the mold or crack while drying. The check rolls a disc of that diameter round inside the shape; whatever it cannot reach is too thin. A tapering tip always ends in a little red, because tips are thin.' },
    ],
  },
  {
    id: 'sprig-backing',
    title: 'One Piece or Many — Backing and Clean Up',
    blocks: [
      { type: 'paragraph', text: 'The mold is open on the back and scraped flat, so every separate part of the drawing casts as its own piece — each letter of a word, each cell of a Voronoi pattern. Checks shows how many pieces the cast comes out in. Parts touching only at a corner count as separate: clay does not hold there.' },
      { type: 'paragraph', text: 'Sometimes separate pieces are what you want: they can be laid on the pot one at a time, like mosaic tiles. To cast it in ONE piece, give it a BACKING, a thin sheet the drawing sits on:' },
      { type: 'keyvalue', items: [
        { key: 'Plaque', value: 'A tile behind the whole drawing, Border past it on every side, with rounded Corners if you like. A nameplate for text, a paving tile for a pattern.' },
        { key: 'Outline', value: 'A sheet that follows the drawing, Border past its edge, and fills the gaps between pieces — just enough to join them all, worked out for you. At Border 0 it only fills the gaps. Wide gaps (between words) fill with rounded webbing.' },
      ] },
      { type: 'paragraph', text: 'THICKNESS is the sheet; Max Height sits ON TOP of it, so the total is the two added. 0 = no sheet. BACKING EDGE is the slope at the sheet’s outer edge, so it blends onto the pot and drops out of the mold; about the same as Thickness gives 45°. Min Edge applies to it too. The Border counts toward whether the sprig fits a Mold Size.' },
      { type: 'tip', text: 'With INVERT on, a Plaque turns the drawing into a carved tile: the shapes become shallow pockets floored by the sheet instead of holes.' },
      { type: 'tip', text: 'A thick sheet is stiff. A 4 mm plaque will not bend onto a small mug; keep sheet and relief thin for a curved pot, and modest so thick parts on a thin sheet do not crack drying.' },
      { type: 'heading', text: 'Clean up (Checks)' },
      { type: 'keyvalue', items: [
        { key: 'Remove Tiny Pieces', value: 'Drops pieces smaller than Min Feature × Min Feature — the slivers left where a pattern is cut off by the edge of the drawing.' },
        { key: 'Whole Shapes Only', value: 'Drops every piece that touches the edge of the drawing, leaving only whole cells of a pattern. It deletes real parts of a drawing that runs to its own edge.' },
        { key: 'Round Off Thin Bits', value: 'Shaves off everything narrower than Min Feature: sharp tips round off and hairlines go. It also trims detail you may want, like antennae.' },
      ] },
    ],
  },
  {
    id: 'sprig-mold',
    title: 'The Mold, Pouring and Casting',
    blocks: [
      { type: 'list', items: [
        'PLATE — the relief on a flat slab, one print. Its top face is what the mold’s face is cast against, so it is what you scrape the sprig’s back flat on. Print it at a fine layer height (or variable layer height): the relief’s slopes stair-step in layers, and the plaster copies every step.',
        'WALL — one design printed twice; the second copy goes on turned 180°. Binder clips hold the walls to the plate’s flange, and the V ridges on the plate seat in grooves under the wall flange to keep plaster in — the same system as the handle mold.',
        'PLASTER — pour to the top of the walls. Plaster Behind (Printer Fit) is how much plaster ends up behind the tallest point of the sprig; under 15 mm the mold can crack.',
      ] },
      { type: 'paragraph', text: 'There is no mirror to worry about: the cast faces the same way as the plate seen from above.' },
      { type: 'heading', text: 'Casting a sprig' },
      { type: 'list', items: [
        'Slip-cast: fill the cavity with slip, top it up as the plaster drinks, then scrape the back level with the mold face. When it shrinks free, turn the mold over and it should drop out.',
        'Or press: push plastic clay into the cavity, scrape flat, and pop it out. The same mold works either way.',
        'Using the same slip as the pot matters — sprigs that shrink differently from their pot crack off.',
        'Bend it onto the pot while it is still soft enough. A slip cast may already be firm by the time it shrinks free; try bending one onto a mug before relying on it.',
      ] },
      { type: 'tip', text: 'SHRINK scales the printed relief up so the FINISHED sprig comes out at the Width, Length and Max Height you set. It is in red because a wrong value is silent.' },
      { type: 'tip', text: 'GRID is the spacing of the relief on the printed plate. 0.2 mm is finer than a layer; going finer mostly grows the file.' },
    ],
  },
];
