/**
 * MoldMaker help panel content — pure data, no JSX.
 * Rendered by the shared HelpPanel component on the /mold route.
 * Reuses the HelpBlock/HelpSection types from help-content.ts.
 */

import type { HelpSection } from './help-content';

export const MOLD_HELP_SECTIONS: HelpSection[] = [
  // ─── 1. Quick Start ───────────────────────────────────────────
  {
    id: 'mold-quick-start',
    title: 'Quick Start',
    blocks: [
      { type: 'paragraph', text: 'MoldMaker turns your current vase design into 3D-printable plastic parts for making a plaster drain mold for slip casting. You print the parts, pour plaster into them, and the plaster that sets IS your working mold. Pick a style with the tabs at the top of the sidebar:' },
      { type: 'keyvalue', items: [
        { key: 'Pour 3-Pc', value: 'One plaster block. The vase stands upside down on a printed center piece inside a shell that unclips in two halves. Proven over many pours, and the one to use whenever the vase never gets narrower going up.' },
        { key: 'Split Halves', value: 'Two plaster halves that split down the middle of the vase and pull apart sideways, so the vase may narrow going up — a neck, a belly, a rolled lip — and a handle can be cast on with the mug. Poured in REUSABLE parts like the handle mold: a plate, two clip-on walls, and a separate hollow master that you pull out of the plaster. An optional plaster plug gives the mug a foot. Two pours so far, both good.' },
        { key: 'Split Thirds', value: 'Three plaster pieces, split 120° apart, each pulling straight out along its own centre line. Each piece is poured in its own reusable parts: the master and a V-shaped plate as one print, and two clip-on walls. Pieces part at a gentler angle to the surface than halves do, so textures that lock two halves can release in thirds. An optional plaster plug gives the mug a foot. First set poured October 2026.' },
      ] },
      { type: 'heading', text: 'Workflow' },
      { type: 'list', items: [
        'Design your vase in VaseMaker as usual, then click Mold ▸',
        'Pick a style, then adjust the settings (shrinkage %, well size, plaster thickness)',
        'Check for red undercut areas — red means the plaster would lock onto the vase',
        'Export the STLs and print them',
        'Pour plaster, let it set, release the plastic — your plaster mold is ready for slip',
      ] },
      { type: 'heading', text: 'Live Handoff' },
      { type: 'paragraph', text: 'The Mold tab always works from the live vase design in the Vase tab. Use ◂ Vase to go back and tweak the design — the mold regenerates when you return. The vase is kept in your browser along with the mold settings, so a reload brings both back together — landing here after a restart no longer shows your mold numbers wrapped around the default vase.' },
      { type: 'heading', text: 'Saving Your Settings' },
      { type: 'paragraph', text: 'Mold settings save themselves: every change is stored in your browser automatically and restored next time — no action needed. Save Settings and Load Settings are for named profiles on top of that: keep one file per clay body or mold style (say "porcelain 14" or "big molds 25mm plaster") and load the right one before exporting. The style itself is just another setting, saved and restored with the rest.' },
      { type: 'paragraph', text: 'MoldMaker and HandleMaker were inspired by Kent at shapecastmolds.com (https://shapecastmolds.com) — thank you.' },
      { type: 'tip', text: 'Undo and redo (↶ ↷ in the header, or Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z) cover the mold SETTINGS — including the mold style, so switching tabs is one step back. The vase has its own undo on the Vase tab; the two are kept separate on purpose, because one shared history would disagree with itself the moment you switched tabs. Revert to Saved appears once you have saved or loaded a settings file, and puts the numbers back to it. Reset is undoable too, and keeps the current mold style.' },
      { type: 'heading', text: 'The Vase (and Handle) Travel With the Mold' },
      { type: 'paragraph', text: 'A mold is DERIVED from your vase — the cavity IS the vase, scaled up — so mold settings on their own can never reproduce a mold. A settings file therefore carries a COPY of the vase design it was saved with, and the Mold tab remembers your vase between sessions along with the settings. Come back a day later and you get both back together, instead of your mold numbers wrapped around whatever vase happened to load.' },
      { type: 'list', items: [
        'Load a mold file whose vase matches the one already open, and it simply loads — no questions',
        'Load one saved with a DIFFERENT vase and you are asked: take its vase too, or keep yours and use the numbers only',
        'That same question catches a stale file — if you have edited the vase since saving the mold, the two no longer match and you get to choose which one wins',
        'Files saved before this still work; they carry no vase, so they load the settings and leave your vase alone',
        'The vase and handle NAMES come back with them. In Brave, rename in the app (click the name) before saving rather than in the save dialog — Brave cannot tell the app what you typed there',
      ] },
      { type: 'tip', text: 'The choice is there because both answers are useful: taking the vase reopens a mold exactly as you left it, while "settings only" is how you put a mold you like onto a different vase. Your vase design file is unaffected either way — it is the one that a mold file copies FROM, never the other way round.' },
      { type: 'paragraph', text: 'Save Settings writes two files: the «name».json profile, and a «name».txt bench sheet with the plaster batch (powder, water, mix ratio) and the printer-fit numbers, so you can size a batch at the bench without opening the app. Your browser asks for each file separately — the second dialog opens in the same folder with the name already filled in, so it is one extra Save click. Skipping it costs nothing; the settings are already written. HandleMaker saves the same pair.' },
      { type: 'paragraph', text: 'If the vase has unsaved changes, Save Settings first asks whether to save those too, with the unsaved ones ticked. Each is saved as its own file under its OWN name (the one on the Vase or Handle tab), then the mold, so one click leaves everything on disk. Nothing unsaved means no question.' },
      { type: 'paragraph', text: 'The mold has its OWN name, the Mold Name in the header, separate from the vase\'s: one vase can have several molds. Until you name it, it shows in yellow ("Not named yet"), and Save Settings or any Export asks for a name first. The name is used for the .json, the .txt and every STL ("Tumbler 3 pour master.stl"). If the vase or handle being saved with it has no name either, you are asked for that too.' },
      { type: 'paragraph', text: 'Each mold style keeps its OWN settings: change Plaster on Split Thirds and Split Halves keeps its own value. Shrink is shown in red as a reminder — it is set per style too, so if you measure a new clay shrinkage, set it on every style you use. Reset Mold Settings to Defaults resets only the tab you are on, and a foot piece that is on stays on (only its settings go back to defaults). Loading a settings file changes only the style it was saved from (and switches you to that tab); your other tabs are left alone. A settings file also works as a TEMPLATE: load it while a different vase is open, choose Settings only, and you get that mold\'s numbers (Seam Angle included) on the vase you have.' },
      { type: 'paragraph', text: 'Click the Mold Name to rename it; it also fills in when you load or save a settings file.' },
      { type: 'tip', text: 'Older settings files made for Press 2-Pc, Pour 1-Pc, Pour 2-Pc or Split 2-Pc still load. Those styles are no longer offered (the plaster was too hard to get out of them), so the settings open as Pour 3-Pc — or, for Split 2-Pc, as Split Halves, which makes the same two halves — and a note under the tabs says so.' },
      { type: 'paragraph', text: 'Mouse controls match the vase viewport: left-drag rotates, scroll zooms, right-drag pans. Hover any slider or toggle for a tooltip.' },
      { type: 'tip', text: 'Exported STLs are named after your design: "«design name» center.stl" and "«design name» shell.stl" for Pour 3-Pc; "«design name» master L.stl", "plate L.stl", "well wall L.stl", "base wall L.stl" and so on for Split Halves; "plug disk" and "plug wall" with the foot plug on. Set the design name on the Vase tab.' },
    ],
  },

  // ─── 2. Parts of a Mold ───────────────────────────────────────
  {
    id: 'mold-anatomy',
    title: 'Parts of a Mold',
    blocks: [
      { type: 'paragraph', text: 'Both styles mould the same things into the plaster; they differ in how the plaster is held while it sets and how it comes apart afterwards.' },
      { type: 'keyvalue', items: [
        { key: 'Vase form', value: 'Your vase\'s outer surface, scaled up by the Shrink % so finished cast pieces come out at your designed size. Textures carry over when Keep Texture is on.' },
        { key: 'Well', value: 'A collar above the vase rim that moulds a funnel-shaped reservoir into the plaster. When slip casting, you fill this reservoir so the level stays topped up as the walls absorb water.' },
        { key: 'Razor ledge', value: 'The flat step where the vase rim meets the well (its size is Well Width). It moulds a crisp edge into the plaster — after casting, you run a razor along it to trim the piece cleanly off the reservoir ring.' },
        { key: 'Foot recess', value: 'An optional stepped indent in the vase bottom: a plaster boss that gives every cast piece a foot ring and a recessed center (a glaze well). Pour 3-Pc moulds it into its one block; Split Halves and Split Thirds cast it on a separate plaster plug (see their sections).' },
      ] },
      { type: 'heading', text: 'The Plaster (view only)' },
      { type: 'paragraph', text: 'The Plaster view toggle shows the plaster that will set around the vase — it isn\'t exported, it\'s a preview of your finished mold. On Pour 3-Pc, combine it with Cross-section to see the cavity, the well funnel, and the wall thicknesses exactly as they\'ll cast.' },
      { type: 'tip', text: 'View → Color changes the preview colour of the main part (the center or the masters) — handy when the default off-white is hard to look at. The shell stays blue. It is remembered in this browser and is not part of a settings file; Reset beside it puts the default back. Avoid a red, since undercuts are shown in red.' },
    ],
  },

  // ─── 3. Pour 3-Pc ─────────────────────────────────────────────
  {
    id: 'mold-pour-three',
    title: 'Pour 3-Pc Mold',
    blocks: [
      { type: 'paragraph', text: 'Pour 3-Pc makes one plaster block from three prints that binder-clip together: a CENTER piece (your vase upside down with its well, whose floor spreads out into a flat foot flange) and an outer SHELL split vertically into two halves. You pour plaster in the open top. When it has set you unclip, part the two shell halves sideways, and the block stands free on the center. Nothing is ever dragged along the plaster, which is why this is the style we recommend.' },
      { type: 'heading', text: 'The foot flange' },
      { type: 'list', items: [
        'The center\'s floor and the shell halves each end in a flat flange; the flanges overlap beyond the shell wall (Overlap), and that overlap is where the binder clips grab',
        'Three raised V rings on the center flange nest into grooves in the shell flange. Plaster trying to leak under the shell wall has to climb over all three',
        'The clips clamp directly over the rings, pressing the seal closed. Clip all the way around',
        'V Fit sets the groove oversize — if the shell won\'t seat, increase it; if plaster seeps, decrease it',
        'Center Lip makes the center flange stick out past the shell flange, giving you an exposed rim to press on. It defaults to 0',
      ] },
      { type: 'heading', text: 'The seam seal' },
      { type: 'paragraph', text: 'The vertical seams between the shell halves use the same V ridge-and-groove profile as the flange — and as the handle mold, which poured completely leak-free. There are three of each, and the vertical Vs sit at exactly the SAME radii as the flange rings, so every vertical V stands directly on top of the ring ridge it continues. Plaster escaping in any direction has to climb three barriers, whether it runs under the flange, through the wall seam, or up the seam itself. A loose fit still seals; the clips do not need to be tight.' },
      { type: 'paragraph', text: 'Each half is solid for the last few millimetres before the split (the Seam Block setting, 4 mm by default) and carries its Vs on that face over the full height. Clips grab both blocks, so they clamp twice that thickness.' },
      { type: 'paragraph', text: 'Overlap sets the spacing between the three rings; the material left outboard of the outermost one always matches the shell Wall thickness, so the flange edge never thins to a sliver. If you set Overlap so small that the rings would run into each other, the V shrinks rather than the grooves merging — widen Overlap instead.' },
      { type: 'heading', text: 'The shell' },
      { type: 'paragraph', text: 'The shell\'s Draft tapers INWARD going up: the plaster block is slightly narrower at the top than the bottom, which saves plaster and helps the halves come away. The shell follows your vase\'s cross-section shape by default.' },
      { type: 'heading', text: 'Round vs shaped shell' },
      { type: 'paragraph', text: 'Following the cross-section keeps the plaster close to the vase and saves material. A half-shell can only part sideways if the cross-section is convex, so a concave one — heart, rose, butterfly, gear — makes the shell fall back to round automatically, and the sidebar says so. No seam angle fixes that: the shell reaches into the notch between lobes and locks. Round Shell forces round on any vase, which costs plaster but lets one printed shell serve several designs.' },
      { type: 'heading', text: 'Printing' },
      { type: 'list', items: [
        'The center prints as shown, flange down. The hollow under the vase needs internal supports; that surface never touches plaster, so its finish doesn\'t matter. The bottom stays open so you can pour cold water into it at release time',
        'When the cross-section is half-turn symmetric — circles, ellipses, squares, rectangles — the two shell halves are the same part, so you print one Shell STL twice. Anything else exports Shell A and Shell B',
        'Each shell half prints standing on its flange with the seam blocks vertical; no supports',
      ] },
      { type: 'heading', text: 'Releasing' },
      { type: 'list', items: [
        'Unclip and part the two shell halves sideways — the plaster block is left standing on the center',
        'Then flip the whole thing over, so the center piece is on top and its hollow interior faces up',
        'Pour VERY COLD water into the center — the plastic shrinks away from the plaster, and the center lifts off easily',
        'That flip is what makes it easy: the water sits in the hollow and stays against the plastic instead of running out',
      ] },
      { type: 'tip', text: 'Put the Seam Angle on a flat stretch of the cross-section rather than a corner. A seam block at a sharp corner has to lie in the plane that bisects it, which is awkward to clamp — though on a square a corner seam actually releases a little more easily.' },
      { type: 'tip', text: 'The shell is reusable: re-clip it for every re-pour of this design. If you tweak only the vase profile but keep the footprint, the old shell may still fit — compare the Shell numbers in Printer Fit.' },
    ],
  },
  {
    id: 'mold-split-halves',
    title: 'Split Halves Mold',
    blocks: [
      { type: 'warning', text: 'Split Halves is new. Two mugs have been poured with their handles. On the first, the walls and plate came off easily and ice water freed the master, but some plaster chipped above the handle, which is why the sidebar warns when that plaster is thin. On the second the plaster was left to set much longer, and the handle came out clean. The foot plug has not been poured on Split Halves yet.' },
      { type: 'paragraph', text: 'Pour 3-Pc casts ONE plaster block and pulls the vase straight out of the top, so the vase may never get narrower going up. Split Halves casts TWO plaster halves that split down the middle of the vase, and each half pulls off sideways. For a round vase that always comes apart — necks, bellies, waists and rolled rims are all fine. That is what makes mugs and shaped vases castable.' },
      { type: 'paragraph', text: 'Each half is poured in reusable parts built like the HandleMaker mold. Every part comes off in its own direction, so nothing has to be cut or melted away.' },
      { type: 'keyvalue', items: [
        { key: 'Master', value: 'Half of your vase (with its well and, if on, half the handle) as a hollow shell, open on its flat cut face and closed at the well end so it holds water. The handle is hollow too, with three ribs across its channel to grip with long-nose pliers; each rib has a small tunnel through it at the bottom of the channel, so water poured in at one end runs the length of the handle. Its skirt sits Seat Depth down into a pocket in the plate.' },
        { key: 'Plate', value: 'The parting face. Solid, with the pocket for the master, the natches, and the three V ridges round its edge that the walls\' clip flanges seal on.' },
        { key: 'Well wall + Base wall', value: 'Two L-shaped walls that clip onto the plate edge and meet at the middle of the long sides. The well end of the master runs into a boss on the well wall, and with the foot plug on the plug band runs into a boss on the base wall. Each boss runs the full width, side wall to side wall, so both ends of the plaster are flat, with no narrow steps to chip.' },
      ] },
      { type: 'heading', text: 'How many parts' },
      { type: 'list', items: [
        'With a handle, the two halves are mirror images (lay both cut-face down and the handle points opposite ways), so each half has its own master, plate, well wall and base wall: 8 STLs',
        'Without a handle, a vase that is the same on both halves needs only ONE master, plate, well wall and base wall, poured twice: 4 STLs. The sidebar says which you have',
        'The well wall carries V ridges at both its seams and the base wall grooves, so they always fit together',
        'The foot plug adds a plug disk and 2 to 4 plug walls (often one wall design, printed that many times)',
      ] },
      { type: 'heading', text: 'Pouring and releasing' },
      { type: 'list', items: [
        'Seat the master in its pocket, clip its well wall and base wall on, and pour plaster in the open top',
        'Let it set FULLY before you take anything off — on the second mug a much longer set is what let the handle come out clean',
        'When it has set: unclip and pull the walls off sideways',
        'Lift the plate off the parting face. Go gently near the natches — the plate is solid, with no holes to push through',
        'Turn the block over so the master\'s open cut face is up, fill it with VERY COLD water (the capped well end keeps it in; with the foot plug on, the plug\'s band is hollow and fills too). Fill the handle channel too — one squeeze-bottle fill at either end runs through the rib tunnels, and the master shrinks free and lifts out. Pliers on the handle ribs help pull the handle straight up',
      ] },
      { type: 'heading', text: 'Foot piece' },
      { type: 'paragraph', text: 'A foot recess would lock the two halves, because they pull off sideways. Turn on Foot Piece and the bottom becomes a plaster PLUG that sits INSIDE the two halves, the same plug Split Thirds uses. It is exactly the shape of the vase\'s bottom, carried straight down Plug Height (default 21 mm, about the Plaster thickness, so it soaks up water like the sides) to the bottom of the mold. A rounded ring round the master\'s band leaves a groove in each half, and the plug has the matching ridge, so when the halves are strapped together the plug cannot fall out, and they still pull straight off it sideways. Because the plug is no wider than the vase\'s bottom, there is no flat ledge meeting a curled-in bottom, so no thin wedge of plaster to crack.' },
      { type: 'list', items: [
        'The master\'s band is hollow and open on the cut face like the rest of the master, so the same cold water fills it. Past the plug it runs on into a boss on the base wall, which holds it with Fit Clearance, and is capped there',
        'The plug is poured in its own small cup: a bottom disk (the vase\'s foot ring and recessed middle, recess up) that drops onto a ledge inside clip-together walls. The walls carry the groove that gives the plug its ridge. The app uses the fewest walls (2, 3 or 4) that all pull straight off the plug, and says how many under Foot Piece; when they are all the same part there is one Plug Wall export, printed that many times',
        'Pour the plug into the cup, vase face down on the disk, and strike it off level with the top of the walls. That face is the bottom of the mold. Pour it once; it works with both halves. The Plaster Estimate lists its batch separately',
        'The plug is 0.1 mm (Fit Clearance) smaller all round than the halves\' bore, so it drops in after the plaster swells a little as it sets',
        'The foot\u2019s shape comes from the Vase tab\u2019s Foot & Mark section (Foot on/off, Foot Width, Slope Width, Depth, Smooth Inside), the same for every style. With Foot off the disk is flat, and the bottom is still its own piece',
        'Your maker\u2019s mark (Vase tab, Foot & Mark) goes on the plug disk. To add a mark to a mold you already have, load its mold file, turn the mark on, and reprint ONLY the plug disk: the plug walls and both halves are unchanged',
        'To cast: set the plug on the bench, vase face up, close both halves round it (its ridge in their groove), strap them tight, and pour through the well as usual',
      ] },
      { type: 'heading', text: 'Settings' },
      { type: 'keyvalue', items: [
        { key: 'Seat Depth', value: 'How deep the master sits in the plate. This is the seal — a deeper skirt is a longer path for plaster to creep — and it is the lip you grip to lift the master. 3 mm, as on the handle mold.' },
        { key: 'Fit Clearance', value: 'The gap round the master in its pocket and in the wall collar. 0.10 mm, as on the handle mold; raise it if the master binds.' },
        { key: 'Plate Floor', value: 'Solid plastic under the pocket. 4 mm, thicker than the handle plate because this one spans a whole mug.' },
        { key: 'Natches', value: 'Placed for you, each as big as fits up to Max Diameter with at least 4 mm of plaster all round. Each sits in a corner of the parting face, the same distance from the three things round it: the end of the block, the side wall and the master (at the top, the well instead of the end). Count 3 keeps a corner pair and puts the third opposite the middle of them. A vase that pours one plate twice always uses 4, because each bump has to land opposite a dimple. The sidebar lists the sizes it chose.' },
        { key: 'Well Seal', value: 'How far the well runs into the wall collar. The well ends in a straight section exactly this long (a collar can only seal on a straight section, not a taper), and that end is capped so the master holds ice water when you turn the half cut-face up to release it.' },
        { key: 'Plaster above the handle', value: 'Where the top of the handle comes close to the rim and well, the plaster between them is a thin tongue that can chip when the master comes out. The sidebar warns when it is under 10 mm (and the same at the handle\'s bottom end, down to the plug or the bottom of the mold). Lower the handle (Top Below Rim) or narrow the well to thicken it.' },
      ] },
      { type: 'heading', text: 'Split Angle and undercuts' },
      { type: 'paragraph', text: 'Split Angle sets where the split runs through the vase. On a round vase it only matters for where the seam line lands. On a square or polygon it decides whether the seams fall on corners or faces. Red in the Undercuts view means a surface that faces back toward the split line — flutes or ripples crossing the seam, twist, or a concave shape like a heart — and the plaster half would lock onto it. Try another Split Angle, or turn off Keep Texture.' },
      { type: 'paragraph', text: 'The small drawing under Split Angle looks straight down on the vase: its outline (sliced where the handle\'s top attaches, or half way up), the split as a dashed line, and the handle in red. 0° is to the right and Split Angle turns counter-clockwise. On a gently shaped vase it shows at a glance whether the handle sits on a lobe or in a groove. Fluting always puts a high point at 0°, so with N flutes the high points are every 360/N degrees and the grooves halfway between.' },
      { type: 'heading', text: 'Casting the handle with the mug' },
      { type: 'paragraph', text: 'Turn on the Handle section to cast your current HandleMaker handle as part of the mug. The handle is drawn in HandleMaker as usual, then turned so both ends sit on the vase: the top end at Top Below Rim, the bottom end wherever the handle\'s span reaches the vase lower down. It lies in the split, so each half carries half of it, and it goes on the Split Angle side (add 180° to move it to the other side). Each end runs a little way on into the vase so it meets the wall with no gap. The joint is a sharp corner for now; blend it with a little slip.' },
      { type: 'paragraph', text: 'In HandleMaker, View → Side draws this vase behind the handle in grey, placed exactly the way the mold will place it, so you can shape the handle against the real mug. Top Below Rim is the same setting in both places. The handle is scaled by the Mold tab\'s Shrink, not HandleMaker\'s.' },
      { type: 'tip', text: 'Cast Wall is your usual fired wall thickness. Walls cast in from both sides of the handle, so a strap thicker than about twice the wall may still be liquid in the middle when you drain the mug. The amber note says so; thin the handle, or expect it to come out hollow.' },
      { type: 'heading', text: 'Rounded or rolled lips' },
      { type: 'paragraph', text: 'For a rounded or rolled lip, try a funnel well: set Well Width to 0 and turn the well Draft right up (about 27° works well). There is no step at the rim any more — the well flares straight out of the lip as a wide funnel, like a pouring cup. Width 0 also removes the thin, fragile ring of plaster that a ledge leaves right under the step. The catch is trimming: with no ledge to run the razor along, you slice the extra slip off level with the top of the lip instead.' },
      { type: 'tip', text: 'A rolled lip narrows going up, so in Pour 3-Pc it would be an undercut and lock the vase into the plaster; the split halves pull sideways off it.' },
      { type: 'tip', text: 'Print the master either way up. Cut face down (the default) needs no support outside, and with a handle it is the only sensible way. Standing upright gives cleaner layer lines but needs supports if the vase overhangs. The Plaster setting is the margin round the vase, below its base, and above its highest point.' },
    ],
  },
  {
    id: 'mold-split-thirds',
    title: 'Split Thirds Mold',
    blocks: [
      { type: 'warning', text: 'Split Thirds is new. The first set was poured in October 2026 and worked well; this version changes the foot and joins the master to its plate after that pour, and has not been poured yet. Treat every number here as a starting point.' },
      { type: 'paragraph', text: 'Split Thirds casts THREE plaster pieces, with seams 120° apart. Each piece pulls straight out along its own centre line. A surface only locks a piece if it faces back toward a seam by more than the piece allows: 30° right at a seam, more toward the middle of the piece. Halves allow 0° at the seam, so a texture that locks two halves can release in thirds. Like Split Halves, necks, bellies and rolled lips are fine. There is no handle option.' },
      { type: 'keyvalue', items: [
        { key: 'Master + plate', value: 'ONE print. The master — one third of your vase with its well, as a hollow shell — sits in a V-shaped plate whose two parting faces meet under the vase axis and rise at 30°, with the natches and three V ridges round its edge. Joining them means no seam for plaster to creep into. Print it lying down, the flat underside on the bed (adaptive layer heights keep the sloped faces smooth).' },
        { key: 'Under the master', value: 'Two water cavities, one each side of a 2 mm gap down the middle. Each is open only at the bottom: the slicer puts support in them under the master\'s arch, which comes out through the bottom. The gap runs up into the master\'s shell, leaving about 2 mm, so the master\'s curve can bend there. Past the master the gap runs right through to the faces at both ends, so the only thing joining the two halves is that 2 mm of master along its top: flex the base and each half swings about it, the faces peel off the plaster and the master\'s sides fold in, until the gap closes at the bottom (about 2°). With the plug on, the band the plug sits in is hollow too and opens into the master, so the cold water reaches all of it, and the gap runs through it.' },
        { key: 'Clipping the ends', value: 'Past each end wall the plate is only a thin lip, as along the sides, so binder clips fit round the end flanges as well as the side ones.' },
        { key: 'Well wall + base wall', value: 'Two walls clip onto the plate edge, one at each end. Their sides stand square to the plate faces, so they lean in 30°, and the three pieces\' sides line up into a clean hexagon. The well runs into a collar on the well wall. Print each wall UPSIDE DOWN, its flat top on the bed. At each corner where the clip flange turns round the end, a thin leg (4 mm) stands from the bed up to the flange corner, so that corner prints onto plastic instead of only onto support, where it can lift. It sits outside the plaster; clip on the straight flange runs, not right on the corner.' },
      ] },
      { type: 'heading', text: 'How many parts' },
      { type: 'list', items: [
        'If all three pieces are the same (a round vase, or a texture whose count divides by 3), you print ONE master + plate and one well wall and pour them three times. The sidebar says which you have',
        'Otherwise each piece has its own master + plate and well wall. One base wall serves them all, except with the foot piece on, where each piece needs its own (its boss fits that piece\'s band)',
        'The walls never swap ends, so each piece always goes back together the same way',
      ] },
      { type: 'heading', text: 'Seam Angle' },
      { type: 'paragraph', text: 'Seam Angle turns all three seams together; they always stay 120° apart. Put the seams on the RIDGES of a texture, never in its grooves, and watch the Undercuts view. A texture count divisible by 3 lets every seam land on a ridge. Fluting and Waves release well. Rods lock near the seams at any angle, because their sides go vertical at the base. On a TWISTED texture the angle hardly matters: the ribs turn as they rise, so every angle meets a rib side somewhere. See "Textures and the split styles" under Undercut Check. The drawing under Seam Angle looks straight down on the vase, sliced half way up, with the seams dashed. It shows the three pieces\' seams only; the foot plug\'s cup picks its own.' },
      { type: 'heading', text: 'Pouring and releasing' },
      { type: 'list', items: [
        'Clip both walls onto the master + plate, and pour plaster in the open top. Each piece is its own pour',
        'When it has set: walls off, then flex the base to break the plaster faces loose. Turn it over (plaster on the bench), fill both cavities with VERY COLD water, wait, pour it out, and lift the part straight off',
        'To cast, stand the three pieces together (the natches line them up), band them tight, and pour slip through the well',
      ] },
      { type: 'heading', text: 'Foot piece' },
      { type: 'paragraph', text: 'A plaster PLUG forms the bottom of the mug and sits INSIDE the three pieces. It is exactly the shape of the vase\'s bottom, carried straight down Plug Height (default 21 mm, about the Plaster thickness, so it soaks up water like the sides) to the bottom of the mold. A rounded ring round the master\'s band leaves a groove in each piece, and the plug has the matching ridge, so when the three pieces are strapped together the plug cannot fall out — and they still pull straight off it sideways. Because the plug is no wider than the vase\'s bottom, there is no flat ledge meeting a curled-in bottom, so no thin wedge of plaster to crack.' },
      { type: 'list', items: [
        'The plug is poured in its own small cup: a bottom disk (the vase\'s foot ring and recessed middle, recess up) that drops onto a ledge inside clip-together walls. The walls carry the groove that gives the plug its ridge, and each has V ridges on one clip flange and V grooves on the other, so a ridge always meets a groove. The walls pull straight off the plug sideways, so if the vase\'s texture runs down to its bottom edge, the plug\'s ribs can catch them near a seam. The app uses the fewest walls (2, 3 or 4) that all pull off cleanly, turns the seams to suit, and says how many under Foot Piece. When the outline repeats from wall to wall they are all the same part: one Plug Wall export, printed that many times. If even 4 walls would catch, it warns you; a base Smooth Zone on the Vase tab makes the bottom edge plain',
        'Pour the plug into the cup, vase face down on the disk, and strike it off level with the top of the walls — that face is the bottom of the mold',
        'The plug is 0.1 mm (Fit Clearance) smaller all round than the pieces\' bore, so it drops in after the plaster swells a little as it sets',
        'The foot and the mark come from the Vase tab\u2019s Foot & Mark section, as on the other styles. A mark changes only the plug disk, so an existing mold can get one by reprinting the disk alone',
      ] },
      { type: 'heading', text: 'Settings' },
      { type: 'keyvalue', items: [
        { key: 'Plate Floor / Wall / Clip Flange', value: 'Split Thirds has its own: 2 / 2 / 10 mm. Below about 11 mm the clip flange narrows the V seals a little.' },
        { key: 'Seat Depth, Fit Clearance, Well Seal', value: 'As on Split Halves.' },
        { key: 'Natches', value: 'Two per seam, one in each corner of the parting face: at the top the same distance from the well, the side wall and the master; at the bottom from the end of the block, the side wall and the master (or the plug\'s band). Each piece has bumps on one face and dimples on the other, so any piece mates with the next.' },
      ] },
    ],
  },
  {
    id: 'mold-mesh-quality',
    title: 'Mesh Quality & File Size',
    blocks: [
      { type: 'paragraph', text: 'Mold parts have no resolution setting of their own — they inherit the Radial and Vertical sliders from the Vase tab\u2019s Resolution section. Printer Fit shows the current values as a reminder, along with the triangle count and rough STL size of each part, so you can see what an export is going to cost before you make it.' },
      { type: 'heading', text: 'How fine is fine enough' },
      { type: 'paragraph', text: 'On a vase form around 170 mm across, the default 360 radial steps put the faceting error near 0.003 mm — roughly a hundred times finer than a 0.4 mm nozzle laying 0.2 mm layers can reproduce. Halving to 180 is still about 0.013 mm, and you would have to drop near 64 before faceting became visible on the print. Vertical resolution behaves the same way. So for a smooth master the defaults are not buying quality; they are buying file size and slicer time.' },
      { type: 'heading', text: 'When high resolution does matter' },
      { type: 'paragraph', text: 'With Keep Texture on and a textured vase, radial resolution has to resolve the texture features themselves — flutes, voronoi cells, an SVG motif — not just the roundness of the wall. That needs several segments per feature and is a far higher bar than smoothness, so leave it high in that case.' },
      { type: 'tip', text: 'On the pour styles the center piece dominates the file because it carries the vase surface twice, outer and cavity; the shell is a few thousand triangles either way. If an export feels unwieldy, drop the vase resolution rather than simplifying afterwards in the slicer.' },
    ],
  },

  // ─── 5. Master Settings ───────────────────────────────────────
  {
    id: 'mold-master-settings',
    title: 'Master Settings',
    blocks: [
      { type: 'keyvalue', items: [
        { key: 'Shrink %', value: 'Clay slip shrinks as it dries and fires — commonly around 12%, but check your clay body\'s spec. The vase form is scaled up by this amount so finished pieces match your designed size.' },
        { key: 'Wall', value: 'Printed thickness of the hollow vase form — the center piece on Pour 3-Pc, the master on Split Halves. 3mm is a good default — stiff enough to survive the pour, thin enough to shrink away in cold water.' },
        { key: 'Keep Texture', value: 'Carries the vase\'s surface texture into the mold. Turn it off for a smooth mold of a textured design. Note that most textures create undercuts — see the Undercut Check section.' },
      ] },
      { type: 'heading', text: 'Foot (set on the Vase tab, Foot & Mark)' },
      { type: 'paragraph', text: 'Recesses the vase form\'s bottom face with a smooth slope from the foot ring up to the center. The plaster fills the recess, forming a raised boss in the mold floor — so every piece you cast gets a foot ring around a recessed center.' },
      { type: 'keyvalue', items: [
        { key: 'Foot Width', value: 'The flat ring at the outer edge of the bottom — this becomes the foot the piece stands on.' },
        { key: 'Slope Width', value: 'The sloped ramp from the foot up to the recessed center.' },
        { key: 'Depth', value: 'How far the center is recessed. On Pour 3-Pc it is limited to the master Wall thickness minus 0.5mm so it can\'t punch into the hollow interior.' },
        { key: 'Smooth Inside', value: 'Builds the ramp and recessed center from the untextured base contour, keeping surface texture out of the glaze well.' },
      ] },
      { type: 'paragraph', text: 'These are set on the Vase tab, with one Foot switch, because the foot belongs to the piece: the same foot goes on the plastic print and on every mold style. The Mold tab shows what it is. Loading a mold file saved before October 2026 brings that mold\u2019s own foot back onto the vase, so it rebuilds as it was poured.' },
      { type: 'tip', text: 'The maker\u2019s mark reaches the Split Halves and Split Thirds plug disk. On Pour 3-Pc it is not on the master yet.' },
    ],
  },

  // ─── 6. Well & Shell Settings ─────────────────────────────────
  {
    id: 'mold-well-cottle',
    title: 'Well & Shell Settings',
    blocks: [
      { type: 'heading', text: 'Well' },
      { type: 'keyvalue', items: [
        { key: 'Width', value: 'How far the well steps out horizontally from the vase rim — the width of the razor-trim ledge. Wider = a bigger slip reservoir and an easier trim line. On Split Halves, 0 gives a funnel well for rolled lips (see the Split Halves section).' },
        { key: 'Height', value: 'Height of the well wall above the vase rim — the depth of the slip reservoir.' },
        { key: 'Draft', value: 'Outward taper of the well wall so it releases from the set plaster (up to 30°).' },
      ] },
      { type: 'heading', text: 'Shell (Pour 3-Pc)' },
      { type: 'keyvalue', items: [
        { key: 'Plaster', value: 'Plaster thickness at the widest point of the vase — the gap between the vase and the shell wall. 20mm is typical; thicker absorbs more water per cast but is heavier and slower to dry.' },
        { key: 'Wall', value: 'Printed wall thickness of the shell. It mostly just holds liquid plaster, so 3mm is plenty.' },
        { key: 'Draft', value: 'INWARD taper going up — the plaster block is narrower at the top, which saves plaster and helps the halves come away.' },
      ] },
      { type: 'paragraph', text: 'The Foot Flange and Split Cottle settings are explained in the Pour 3-Pc section. Split Halves\' and Split Thirds\' Plate & Walls, Natches and Foot Piece settings (and Split Halves\' Handle) are in their own sections.' },
    ],
  },

  // ─── 7. Undercut Check ────────────────────────────────────────
  {
    id: 'mold-undercuts',
    title: 'Undercut Check',
    blocks: [
      { type: 'paragraph', text: 'The first part of this section is about Pour 3-Pc. For Split Halves and Split Thirds, see "Textures and the split styles" further down. After the plaster sets, the vase form must pull straight out of the block. That works only if the vase never gets narrower as it rises: every horizontal slice has to fit through every slice above it. Straight vertical sections are fine — any inward narrowing is not, because the plaster that set above the wide spot locks it in.' },
      { type: 'paragraph', text: 'With the Undercuts view toggle on, the vase form is tinted red wherever it\'s wider than the narrowest point anywhere above it. The whole trapped region paints — a bulge below a narrow neck shows red across the entire bulge, because all of it would collide with plaster on the way out, not just the spot where the profile turns inward.' },
      { type: 'heading', text: 'What triggers red' },
      { type: 'list', items: [
        'Profile curves that bend inward anywhere above the base (shoulders, necks, barrel shapes)',
        'Twist — a twisted cross-section corkscrews, so it can\'t pull straight up even if its profile never narrows. Molding a twisted design needs the twist removed',
        'Most textures with horizontal relief (Waves, Rods, ripple bands) — each groove is a real micro-undercut. Expect heavy red on textured designs',
        'XY Sway that leans the vase over — the leaning side effectively narrows as it rises',
      ] },
      { type: 'paragraph', text: 'The check is strict on purpose: plaster doesn\'t shrink away from the plastic as it sets (it actually expands slightly, about 0.2%), so there\'s no clearance to forgive small undercuts. A tiny red band might survive in practice thanks to the plastic flexing when released — but that\'s a gamble to test on a real pour, not something the checker will approve.' },
      { type: 'paragraph', text: 'If there is any fully-flagged red area when you export the center (or a Split Halves or Split Thirds master), a warning dialog appears first. You can export anyway — useful when you\'ve decided a shallow texture is worth trying.' },
      { type: 'tip', text: 'The foot recess and the well collar are never flagged — the recess lifts cleanly off the plaster boss, and the well is always wider than the rim. Only the vase body between them is analyzed.' },
      { type: 'heading', text: 'Textures and the split styles' },
      { type: 'paragraph', text: 'On Split Halves and Split Thirds, each plaster piece comes off SIDEWAYS, straight out along its own centre line. Picture the texture\'s ribs as teeth. In the middle of a piece the piece moves straight away from the surface and lifts off the ribs easily. Near a seam it is moving almost ALONG the surface, so the plaster that set between two ribs has to slide past the next rib to get out, and it can\'t. The piece is locked. That is what the red shows on these styles: the parts of the vase that would catch a piece on its way off.' },
      { type: 'list', items: [
        'Put the seams on the CRESTS of the ribs (Seam Angle). Cut at its crest, a rib\'s sides face away from the seam and both pieces lift off it. A seam on the side of a rib, or in a groove, is where it catches',
        'Use a rib count that divides by the number of pieces (3 for Split Thirds, 2 for Split Halves). Then every seam can sit on a crest at once, and the pieces come out identical, so you print one set of parts instead of several',
        'Gentler ribs release more easily. Split Thirds allows a rib side to lean back toward a seam by up to about 30°; Split Halves allows nothing right at the seam. Fluting and Waves are gentle; Rods have vertical sides and catch at any angle',
        'Twisted textures are different. The ribs turn as they rise, so a seam that sits on a crest at one height crosses the side of a rib at another, and moving Seam Angle hardly changes anything. Whether a twisted design releases depends on how steep the ribs are, not on where the seams go. If it shows red, make the texture shallower (or the twist smaller than the spacing between ribs) rather than hunting for an angle',
        'The shape matters too, even without texture. On a square, polygon or oval, seams at the corners behave differently from seams across the flat sides; on an inward-curving shape (heart, cardioid) some angles lock and others clear. Turn Seam Angle and watch the red come and go',
        'Smooth Zones keep texture off the bottom and the rim. On Split Halves and Split Thirds with the foot plug on, a base Smooth Zone also keeps the plug plain. The plug\'s little cup comes off it sideways in the same way, so a textured bottom edge needs 3 or 4 cup walls instead of 2 (the app picks how many and says so under Foot Piece)',
      ] },
      { type: 'tip', text: 'A thin red line right along a seam may still let go on a real pour, because the plastic master flexes a little. Treat it as something to test, not something to rely on.' },
    ],
  },

  // ─── 8. Printing, Pouring & Casting ───────────────────────────
  {
    id: 'mold-print-cast',
    title: 'Printing, Pouring & Casting',
    blocks: [
      { type: 'heading', text: 'Printing the parts' },
      { type: 'list', items: [
        'Print every part watertight: 2–3 perimeters and enough top/bottom layers — liquid plaster finds pinholes',
        'Print as normal solid models (they already have real walls), not in spiral/vase mode',
        'Check the Printer Fit section for each part\'s size against your printer bed',
        'PLA works fine. Setting plaster gets warm, so for a big pour PETG holds its shape better',
        'Each style\'s section above says which way up to print and where supports go',
      ] },
      { type: 'heading', text: 'Mixing plaster' },
      { type: 'paragraph', text: 'The Plaster Estimate section shows the mold volume split into approximate powder and water weights for the chosen material (Pottery Plaster No.1, Hydrocal, or Hydrostone). For Split Halves the volume, powder and water are TOTALS for both halves together, and for Split Thirds for all three pieces (the sidebar and the saved .txt both say so); the foot plug, when on, is listed as its own batch. Weigh both, add powder to water (not the reverse), let it slake a minute or two, then mix until it just starts to thicken.' },
      { type: 'heading', text: 'Pouring' },
      { type: 'list', items: [
        'Apply mold release to every plastic surface the plaster will touch',
        'Pour 3-Pc: clip the shell halves onto the center and to each other, set it on a level surface, and pour into the open top up to the level shown in the Plaster view',
        'Split Halves: clip the walls round the master on its plate, set it level and fill to the top of the walls; each half is its own pour. The plug, if you use one, is poured in its own cup',
        'Split Thirds: clip both walls onto the master + plate and fill to the top of the walls; each piece is its own pour. The plug, if you use one, is poured in its own cup',
        'Tap or vibrate to walk bubbles up and out — bubbles against the vase form become voids in your mold surface',
        'Let it set fully (it will warm up, then cool again) before releasing anything',
      ] },
      { type: 'heading', text: 'Releasing the parts' },
      { type: 'list', items: [
        'Pour 3-Pc: unclip and part the shell halves, flip, and fill the center with very cold water — see the Pour 3-Pc section',
        'Split Halves: walls off, plate off, then very cold water into the master — see the Split Halves section',
        'Split Thirds: the same, piece by piece — see the Split Thirds section',
        'Let the fresh mold dry thoroughly (days, not hours) before its first cast — a saturated mold can\'t absorb water from the slip',
      ] },
      { type: 'heading', text: 'Slip casting' },
      { type: 'list', items: [
        'Split Halves: put the two halves together (the natches line them up), round the plug if you made one (its ridge in their groove), and strap them tight. Split Thirds: stand the three pieces round the plug (its ridge in their groove) and strap them tight',
        'Fill the mold to the top of the well reservoir and keep it topped up as the level drops',
        'Wait while the plaster draws water out of the slip, building a clay wall against the mold face',
        'When the wall is thick enough, pour the excess slip back out and drain upside down',
        'Once leather-hard, the piece releases from the mold; trim it off the reservoir ring with a razor along the ledge — or, with a Width 0 funnel well, level with the top of the lip',
      ] },
      { type: 'tip', text: 'A plaster mold is good for many casts, but it works by absorbing water — let it dry between casting sessions.' },
    ],
  },
];
