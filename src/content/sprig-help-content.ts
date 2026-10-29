/**
 * SprigMaker help panel content — pure data, rendered by the shared HelpPanel.
 */

import type { HelpSection } from './help-content';

export const SPRIG_HELP_SECTIONS: HelpSection[] = [
  {
    id: 'sprig-quick-start',
    title: 'Quick Start',
    blocks: [
      { type: 'paragraph', text: 'A SPRIG is a small relief — a dragonfly, a leaf, a lizard — cast or pressed in its own mold and stuck onto a pot with slip. (Wedgwood’s white jasperware figures are sprigs.) SprigMaker turns a flat SVG drawing, or a picture, into that relief and makes the 3D-printable parts for a ONE-PIECE OPEN plaster mold of it: a plate carrying the relief, and a wall you print twice.' },
      { type: 'heading', text: 'Basic Workflow' },
      { type: 'list', items: [
        'Pick a sample drawing, Load / Paste your own SVG (black is the shape, white is background), or Load Image for a PNG or JPG (see Pictures), or Load Relief STL for a relief made in another app (see Reliefs from other apps)',
        'Set Width and Length — the FINISHED sprig, after the clay shrinks',
        'Choose how it gets its height (Height → Shaping) and set Max Height',
        'Check for red: parts narrower than Min Feature are likely to tear or crack',
        'Pick a Mold Size — the smallest one the sprig fits is chosen for you',
        'Export the plate. Export the wall too, the first time you use that size — then print it twice',
        'Clip the two walls onto the plate, pour plaster to the top of the walls, let it set, lift the walls off and pull the plate away',
      ] },
      { type: 'tip', text: 'STANDARD SIZES are the point of the design: every plate of one size (20×20 up to 140×140 in 20 mm steps, plus Long 160×60) fits that size’s wall pair, so you print the walls ONCE per size and only a plate per sprig after that. That is why the walls of a standard size have no sliders — anything that changed them would make the walls you already printed stop fitting. Use Custom if you need a different box; it makes its own walls. PLATE THICKNESS is the exception that is allowed on every size: the walls sit on top of the plate, so a thinner or thicker plate still fits the walls you have.' },
      { type: 'tip', text: 'Everything auto-saves in this browser. Save Design writes a «name».json with the drawing stored INSIDE it, so the file alone reproduces the sprig, plus a «name».txt bench sheet with the plaster batch and printer-fit numbers.' },
      { type: 'tip', text: 'Undo and redo (↶ ↷, or Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z) cover the whole design, drawing included. RESET SPRIG SETTINGS restores the default settings and keeps your drawing, its size and which way it faces. Each section also has its own Reset, top right, for just that section (Size\'s puts the drawing back the way it was loaded: unturned, unflipped and in its own proportions). REVERT TO SAVED puts everything back to your last saved file.' },
    ],
  },
  {
    id: 'sprig-mark',
    title: 'Mark — Your Maker\'s Mark',
    blocks: [
      { type: 'paragraph', text: 'The MARK tab, at the top of this panel, designs a maker\'s mark for the bottom of a piece: initials, a symbol, a logo. It uses the same controls as a sprig (samples, SVG, pictures, text, height, edges, checks), but it is a separate design. Switching tabs never changes the other one, and each has its own name, undo and Revert to Saved.' },
      { type: 'list', items: [
        'One mark, kept in this browser like everything else. Save Design writes it to its own «name».json, with the drawing inside',
        'Shown at its FINISHED size, as it reads looking at the bottom of the piece. There is no Shrink here: the vase or the mold that carries the mark scales it with everything else',
        'No mold, no Backing and no Cut In letters: whether the mark is pressed into the bottom or stands up from it is chosen where it is placed',
        'Load Design takes a sprig file as well as a mark file, so a sprig you already drew can become your mark (and the other way round)',
      ] },
      { type: 'tip', text: 'To put the mark on a vase, open the Vase tab\u2019s Foot & Mark section and turn Mark on \u2014 the vase takes a copy of it. It goes on the plastic print, the Pour 3-Pc center and the Split Halves / Split Thirds plug disk.' },
    ],
  },
  {
    id: 'sprig-height',
    title: 'Height — from a Flat Drawing',
    blocks: [
      { type: 'paragraph', text: 'An SVG is flat. Height → Shaping decides how it gets a third dimension:' },
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
    id: 'sprig-svg',
    title: 'SVG drawings',
    blocks: [
      { type: 'paragraph', text: 'The SVG section shows what SprigMaker made of the drawing (dark red = background, darker gray = higher), and has two settings for the kinds of SVG you will meet. With both off, the SVG is read exactly as drawn.' },
      { type: 'list', items: [
        'SOLID SILHOUETTES (one colour — most icons and clip art): work as they are. Nothing to change',
        'LINE ART (outlines with an empty inside): only the lines become shape. Turn on FILL OUTLINES and the inside of each closed outline fills solid, with the lines standing on top. Close Gaps mends small breaks in an outline',
        'SEVERAL COLOURS OR SHADES (clip art, and what image-to-SVG converters make): in Gray or Inflate + Gray detail each shade’s darkness is its height. TONES groups them into 2–5 flat steps, which cast and release cleanly',
        'GRADIENTS: rare; As drawn turns them into smooth slopes',
      ] },
      { type: 'keyvalue', items: [
        { key: 'Fill Outlines', value: 'The inside of a closed outline becomes part of the shape. White inside it stands at the Lightest height in the Gray modes. Off: white is always paper.' },
        { key: 'Tones', value: 'AS DRAWN: each shade’s darkness is its height. STEPS: the shades grouped into that many flat levels, darkest highest.' },
        { key: 'Lightest', value: 'Shown once Fill or Steps is on, in the Gray modes: the height of the lightest level, as for pictures.' },
      ] },
      { type: 'tip', text: 'Colours count by how dark they are, so a red and a green of the same darkness stand at the same height. If two areas should differ, give them different shades of gray in the SVG.' },
    ],
  },
  {
    id: 'sprig-text',
    title: 'Text',
    blocks: [
      { type: 'paragraph', text: 'Type up to two lines in the TEXT section and they are added to the sprig — beside the drawing, on top of it, or on their own (Show Drawing off). The cast reads the same way as the plate seen from above, so nothing needs mirroring.' },
      { type: 'keyvalue', items: [
        { key: 'Font', value: 'Six built-in fonts chosen for casting; they look the same on every computer. The two scripts join their letters, so a word casts in one piece. "Installed font…" uses any font installed on your computer, by name, but a design saved with it only looks right on a computer that has that font.' },
        { key: 'Letter Height', value: 'Height of a capital letter, finished. Strokes need about 1.5 mm to cast, so 6–8 mm is about the smallest that works in a bold font. Thin Parts paints strokes that are too thin red.' },
        { key: 'Raised', value: 'The letters stand Raise mm above whatever is under them: the plate, the drawing, or the backing sheet.' },
        { key: 'Cut In', value: 'The letters are sunk Depth mm into the backing sheet, so turn on Plaque or Outline. At least 0.4 mm of sheet is always kept under them. Nothing small can break off — good for name plates and dates.' },
        { key: 'Position', value: 'Below, Above, Left or Right of the drawing with Gap between them, or On Top of it. Nudge moves the text from there. The whole sprig, drawing and text together, stays centred in the mold so it fits the smallest size, so a nudge also shifts the drawing the other way by half.' },
      ] },
      { type: 'tip', text: 'Raised letters are separate pieces, and so is the dot on an i. A Plaque or Outline backing joins them into one cast, or pick a Script font.' },
      { type: 'tip', text: 'Rotate and Flip turn the drawing only. To turn the text, use ↺ 90° / ↻ 90° in the Text section, or Text Angle for any angle (+ = clockwise as seen from above). Turned text stays the same Letter Height; the mold size makes room for its new shape.' },
    ],
  },
  {
    id: 'sprig-picture',
    title: 'Pictures (PNG / JPG)',
    blocks: [
      { type: 'paragraph', text: 'LOAD IMAGE takes a picture straight in — no converting to SVG first, which would throw away its shading. The Picture section shows what SprigMaker made of it: dark red is cut away as background, and the drawing is shown in its height levels, darker standing higher.' },
      { type: 'heading', text: 'What works' },
      { type: 'list', items: [
        'Clean drawings, clip art and silhouettes on a plain background: bold shapes and a few flat tones',
        'Line drawings with CLOSED outlines: the inside fills solid and the lines stand on top. Use Close Gaps if the outline has small breaks',
        'Not photos: their shadows and highlights come from the lighting, not from height, and turn into bumps in the wrong places',
        'Not fine pencil or etched drawings: anything finer than about 1 mm on the finished sprig cannot be cast or come out of the plaster',
        'Not stock-photo sites: their pictures carry watermarks (which would be raised too) and are not free to use',
      ] },
      { type: 'keyvalue', items: [
        { key: 'Background', value: 'How different a colour can be from the background and still be cut away. Starts from the colour round the edge of the picture, so off-white or coloured backgrounds work; a transparent PNG’s clear area is always background. Raise it if a halo stays round the drawing, lower it if pale parts disappear. Areas the background cannot reach — inside a closed outline — always stay.' },
        { key: 'Close Gaps', value: 'Closes small breaks in an outline before the background is cut, so the inside does not leak away with it.' },
        { key: 'Smooth', value: 'Blurs the speckle inside the drawing that JPEG pictures are full of, before the tones are read.' },
        { key: 'Tones', value: 'STEPS groups the picture’s greys into 2–5 flat levels, darkest highest: clean terraces that read well and release cleanly. SMOOTH gives every grey its own height, speckle and shading included, stretched to fill Max Height. AS MADE (HEIGHT MAP) takes each grey exactly as its height, unstretched — for a height map you painted, and what Load Relief STL uses.' },
        { key: 'Lightest', value: 'In Gray: the height of the lightest level as a % of Max Height. In Inflate + Gray detail: how much of Detail Depth the lightest level is spared.' },
      ] },
      { type: 'tip', text: 'Loading a picture switches Height to Inflate + Gray detail (unless you were already on Gray): the outline gives a rounded body and flat wings, and the tones add detail on top. Tone cannot tell a body from a wing tip of the same grey — both stand the same height.' },
      { type: 'tip', text: 'On a picture, INVERT swaps which tones stand higher; the outline stays the same.' },
      { type: 'tip', text: 'Thin lines such as antennae break into crumbs at casting size and show as tiny pieces in Checks. Remove Tiny Pieces or Round Off Thin Bits clears them.' },
    ],
  },
  {
    id: 'sprig-stl',
    title: 'Reliefs from other apps (STL)',
    blocks: [
      { type: 'paragraph', text: 'LOAD RELIEF STL takes a relief made in another app — a shape standing on a flat plaque, such as MakerWorld’s Relief Sculpture Maker, which can turn a flat picture into a sculpted relief with invented detail like wing veins. SprigMaker reads the top of the relief into a height map, drops that app’s plaque, and puts the relief on this mold’s plate. Everything else then works on it as usual: the mold box, Thin Parts and its fixes, On Vase, and the Sprig texture on a vase.' },
      { type: 'list', items: [
        'It comes in at its own size and its own height (Width, Length, Max Height), in Gray with Tones As made, and moves to the smallest standard mold it fits',
        'The plaque may lie flat or stand on its edge; the flattest axis is taken as up, and the side with the relief on it is found by itself',
        'Change Width or Max Height afterwards to scale it — the shape stays the same',
        'Fine detail such as veins may be only 0.1–0.2 mm high. Check it at casting size; detail that fine may not survive clay',
        'Use the STL, not a 3MF: the same mesh, read faster',
        'Check the other app’s terms. MakerWorld’s Relief Sculpture Maker allows commercial use and asks for a credit if you share the result publicly',
      ] },
    ],
  },
  {
    id: 'sprig-edges',
    title: 'Edges and Thin Parts',
    blocks: [
      { type: 'paragraph', text: 'EDGE SOFTNESS is the width of the slope from the edge up to full height. Higher makes the sprig blend into the pot instead of sitting on it like a sticker, and helps the cast drop out of the mold. At 0 the edge is as steep as the Resolution allows.' },
      { type: 'paragraph', text: 'EDGE LIP raises every part of the relief thinner than it up to that thickness, so the edge ends in a small step instead of tapering to the plate. It flattens thin parts too, so it is 0 by default. Try 0.3–0.5 only if cast edges tear or crumble when you take them out of the mold.' },
      { type: 'paragraph', text: 'SPRIG COLOR and BACKGROUND (View → Display) colour the clay and the plate behind it differently, so a spot with no clay shows at a glance. They are remembered in this browser, for the Sprig and Mark tabs both; the Display Reset puts them back.' },
      { type: 'paragraph', text: 'NO CLAY INSIDE THE DRAWING: when a spot walled in by the drawing goes right down to the plate — a white vein in a leaf, say — a note says how many. In an SVG, turn on Fill Outlines to fill them; Close Gaps also fills one that is open to the outside at a narrow gap (that kind is not counted, because it is joined to the background). In Inflate + Gray detail, LIGHTEST and DETAIL DEPTH then set the groove: it cuts Detail Depth × (100% − Lightest) below the surface round it, so raise Lightest for more clay under it. Letters (the inside of an O) are never counted.' },
      { type: 'paragraph', text: 'MIN FEATURE paints red any part of the FINISHED sprig narrower than it — a dragonfly’s legs, a lizard’s toes. Those tear coming out of the mold or crack while drying. The check rolls a disc of that diameter round inside the shape; whatever it cannot reach is too thin. A tapering tip always ends in a little red, because tips are thin.' },
      { type: 'paragraph', text: 'When there are thin parts, a box at the top of the panel offers three fixes. Each is one step, so undo (Cmd/Ctrl+Z) takes it back, and after you press one its slider opens in the box so you can take it further or back it off:' },
      { type: 'keyvalue', items: [
        { key: 'Thicken them', value: 'Sets THICKEN THIN PARTS (Checks) to Min Feature: every part thinner than that is widened to about that width — legs, tails, stalks — and the rest of the shape is left alone. Pointed tips end in a short rounded stub. Thin parts close together, like a gecko’s toes or fern leaflets, can merge into one.' },
        { key: 'Make it bigger', value: 'Scales the whole sprig up so legs and stalks reach Min Feature, and moves it to the smallest standard mold it fits. The shape stays exactly the same. A pointed tip reads thin at any size, so some red may stay at the points: Thicken or Shave rounds them. Making it bigger and then thickening usually looks best.' },
        { key: 'Shave them off', value: 'Turns on Round Off Thin Bits: antennae, legs and sharp points go. Raise Min Feature to shave more.' },
      ] },
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
      { type: 'paragraph', text: 'THICKNESS is the sheet; Max Height sits ON TOP of it, so the total is the two added. 0 = no sheet. BACKING EDGE is the slope at the sheet’s outer edge, so it blends onto the pot and drops out of the mold; about the same as Thickness gives 45°. Edge Lip applies to it too. The Border counts toward whether the sprig fits a Mold Size.' },
      { type: 'tip', text: 'With INVERT on, a Plaque turns the drawing into a carved tile: the shapes become shallow pockets floored by the sheet instead of holes.' },
      { type: 'tip', text: 'A thick sheet is stiff. A 4 mm plaque will not bend onto a small mug; keep sheet and relief thin for a curved pot, and modest so thick parts on a thin sheet do not crack drying.' },
      { type: 'heading', text: 'Clean up (Checks)' },
      { type: 'keyvalue', items: [
        { key: 'Remove Tiny Pieces', value: 'Drops pieces smaller than Min Feature × Min Feature — the slivers left where a pattern is cut off by the edge of the drawing, and the crumbs a hairline breaks into.' },
        { key: 'Whole Shapes Only', value: 'Drops every piece that touches the edge of the drawing, leaving only whole cells of a pattern. It deletes real parts of a drawing that runs to its own edge.' },
        { key: 'Round Off Thin Bits', value: 'Shaves off everything narrower than Min Feature: sharp tips round off and hairlines go. It also trims detail you may want, like antennae.' },
        { key: 'Thicken Thin Parts', value: 'The opposite: widens every part thinner than this to about this width, so thin legs, tails and antennae cast instead of tearing. It also joins up an antenna that had broken into crumbs. 0 = off.' },
      ] },
    ],
  },
  {
    id: 'sprig-onvase',
    title: 'Seeing It on the Vase',
    blocks: [
      { type: 'paragraph', text: 'View → ON VASE shows the sprig on the vase that is open in VaseMaker (change the vase there). It is a preview for size and placement; nothing here changes the mold. The placement set here is the one HandleMaker (View → On Vase → Show Sprig) and VaseMaker (Appearance → Show Sprig) show too.' },
      { type: 'keyvalue', items: [
        { key: 'Height', value: 'Where the sprig\'s centre sits, as a % of the vase\'s height.' },
        { key: 'Around', value: 'Where round the vase it sits. ⌂ turns the view to face it.' },
        { key: 'Tilt', value: 'Turns the sprig on the wall, clockwise as you look at it.' },
        { key: 'Repeat', value: 'Copies spaced evenly round the vase. A note appears if they would overlap.' },
        { key: 'Show Handle', value: 'Puts the HandleMaker handle on the vase, so sprigs can be placed beside it. Its height is HandleMaker\'s Top Below Rim — one handle position for every page.' },
      ] },
      { type: 'paragraph', text: 'The sprig DRAPES over any texture on the vase, the way soft clay pressed on does: over fluting it bulges out on the ridges and dips into the grooves, and the texture never pokes through. Real clay smooths some of that out, so the preview shows the most the texture can show through.' },
      { type: 'tip', text: 'Around measures the distance round the vase at that height, and up measures along the wall, so a sloping or oval vase is handled. What it cannot show is the clay stretching: on a round-bellied pot a real sprig stretches a little when you bend it on, so trust the preview for size and placement, and expect the exact shape to be close rather than perfect.' },
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
      { type: 'tip', text: 'RESOLUTION is the spacing of the points that make up the relief on the printed plate. Smaller = a smoother surface but a larger file. 0.2 mm is already as fine as a printed layer, so going smaller mostly grows the file.' },
    ],
  },
];
