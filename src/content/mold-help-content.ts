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
      { type: 'paragraph', text: 'MoldMaker turns your current vase design into the two 3D-printable plastic parts needed to make a one-piece plaster drain mold for slip casting. You print the two parts, pour plaster between them, and the plaster block that sets in the gap IS your working mold.' },
      { type: 'keyvalue', items: [
        { key: 'Master', value: 'A hollow plastic positive of your vase, scaled up to compensate for clay shrinkage, with a slip-reservoir collar (the well) and a lid on top.' },
        { key: 'Cottle', value: 'The plastic container you pour the plaster into. Its walls follow your vase\'s shape at a fixed distance, so the plaster is an even thickness everywhere.' },
      ] },
      { type: 'heading', text: 'Workflow' },
      { type: 'list', items: [
        'Design your vase in VaseMaker as usual, then click Mold ▸',
        'Adjust mold settings (shrinkage %, well size, plaster thickness, draft angles)',
        'Turn on Cross-section to inspect the assembly from inside',
        'Check for red undercut areas on the master — red means the master can\'t pull out of the plaster',
        'Export Master and Export Cottle, then print both',
        'Seat the master\'s lid on the cottle rim (the lip self-centers it) and pour plaster through the lid slots',
        'Once the plaster sets, release both plastic parts — your plaster mold is ready for slip',
      ] },
      { type: 'heading', text: 'Live Handoff' },
      { type: 'paragraph', text: 'The Mold tab always works from the live vase design in the Vase tab. Use ◂ Vase to go back and tweak the design — the mold regenerates when you return. A full browser reload resets the vase to the default preset (your mold settings survive — see below), so save your vase design on the Vase tab before closing the browser.' },
      { type: 'heading', text: 'Saving Your Settings' },
      { type: 'paragraph', text: 'Mold settings save themselves: every change is stored in your browser automatically and restored next time — no action needed. Save Settings and Load Settings are for named profiles on top of that: keep one file per clay body or mold style (say "porcelain 14" or "big molds 25mm plaster") and load the right one before exporting.' },
      { type: 'paragraph', text: 'The Settings File name in the header is used as the save filename — click it to rename, and it fills in automatically when you load or save a settings file. Settings files contain only the mold settings, never the vase: the vase design has its own Save Design file on the Vase tab.' },
      { type: 'paragraph', text: 'Mouse controls match the vase viewport: left-drag rotates, scroll zooms, right-drag pans. Hover any slider or toggle for a tooltip.' },
      { type: 'tip', text: 'Exported STLs are named after your design: "«design name» master.stl" and "«design name» cottle.stl". Set the design name on the Vase tab.' },
    ],
  },

  // ─── 2. Anatomy of the Mold ───────────────────────────────────
  {
    id: 'mold-anatomy',
    title: 'Anatomy of the Mold',
    blocks: [
      { type: 'paragraph', text: 'Understanding the pieces makes the settings obvious. From inside out, the assembly is: master → plaster gap → cottle wall.' },
      { type: 'heading', text: 'The Master' },
      { type: 'keyvalue', items: [
        { key: 'Body', value: 'Your vase\'s outer surface, scaled up by the Shrink % so finished cast pieces come out at your designed size. Textures carry over when Keep Texture is on.' },
        { key: 'Well', value: 'A collar above the vase rim that molds a funnel-shaped reservoir into the plaster. When slip casting, you fill this reservoir so the level stays topped up as the walls absorb water.' },
        { key: 'Razor ledge', value: 'The 90° horizontal step where the vase rim meets the well. It molds a crisp square edge into the plaster — after casting, you run a razor along this ledge to trim the piece cleanly off the reservoir ring.' },
        { key: 'Lid', value: 'A flat plate on top with arc-shaped pour slots over the plaster gap and a grip lip that hooks over the cottle rim, centering the master in the cottle automatically.' },
        { key: 'Foot recess', value: 'An optional stepped indent in the master\'s bottom. It molds a boss into the plaster floor, which gives every cast piece a foot ring and a recessed center (a glaze well).' },
      ] },
      { type: 'heading', text: 'The Cottle' },
      { type: 'keyvalue', items: [
        { key: 'Wall', value: 'Follows your vase\'s full contour — ripples, squares, any cross-section — offset outward by the plaster thickness, with a slight draft (wider at the top) so the set plaster block slides out.' },
        { key: 'Floor', value: 'Solid, with an optional center hole (the Air Hole setting) that lets air in when you pull the plaster block out (breaks the suction). The interior floor is never smaller than 40mm across, so the plaster block always has a flat base to stand on.' },
      ] },
      { type: 'heading', text: 'The Plaster (view only)' },
      { type: 'paragraph', text: 'The Plaster view toggle shows the block that will form between the two parts — it isn\'t exported, it\'s a preview of your finished mold. Combine it with Cross-section to see the cavity, the well funnel, and the wall thicknesses exactly as they\'ll cast.' },
    ],
  },

  // ─── 3. One-Piece Mold ────────────────────────────────────────
  {
    id: 'mold-one-piece',
    title: 'Pour 1-Pc Mold',
    blocks: [
      { type: 'paragraph', text: 'The Press 2-Pc / Pour 1-Pc / Pour 2-Pc tabs at the top of the sidebar switch between three ways of building the same plaster mold. Pour 1-Pc replaces the master and cottle with a SINGLE print: the vase sits upside-down in the center, fused to the cottle at the well, and you pour plaster in through the fully open top. The plaster fills the gap around the vase and covers its bottom, forming the solid base of the mold. Released and flipped over, it\'s the identical finished mold — cavity, well funnel, razor edge, and foot boss.' },
      { type: 'heading', text: 'Why choose it' },
      { type: 'list', items: [
        'One print instead of two — no lid, flange, or pour slots',
        'Nothing to register or hold down: the master can\'t float or shift while the plaster sets',
        'Pouring is a simple top-fill to the brim — the wall height IS the fill line',
      ] },
      { type: 'heading', text: 'How it differs' },
      { type: 'list', items: [
        'The cottle wall can\'t hug the vase\'s vertical profile here (it would trap the plaster) — it\'s a straight drafted wall from the widest point, so tapered vases get extra plaster toward the top of the print. It still follows the cross-section shape.',
        'Air Holes: four holes through the flat floor ring instead of one center hole. Tape or clay them over while pouring; afterwards they break the suction, take compressed air, or let you push rods through to eject the block.',
        'The same undercut rule applies: the vase must always get wider toward its own top. Red areas mean the plaster block will lock onto the master.',
      ] },
      { type: 'heading', text: 'Printing' },
      { type: 'paragraph', text: 'Print it exactly as shown — open pour side up. The hollow interior under the vase bottom needs internal supports; that surface never touches plaster, so its finish doesn\'t matter. The bottom center stays open so you can pour ice-cold water into the master\'s hollow interior at release time.' },
      { type: 'heading', text: 'Releasing' },
      { type: 'list', items: [
        'Apply mold release to the cottle walls and floor ring before pouring',
        'After the plaster sets, un-tape the air holes and pour ice-cold water into the hollow center from below to shrink the plastic',
        'Pull the block straight up and out of the open top — everything (vase, well, foot boss, cottle) releases with that one motion',
        'If it fights you: more cottle draft, more release agent, compressed air through the floor holes, or push rods through them',
      ] },
      { type: 'tip', text: 'The single pull has a lot of surface area to unstick at once. If that worries you, use Pour 2-Pc — same pour, but the outer shell unclips and lifts off first, so release is much easier.' },
    ],
  },

  // ─── 4. Pour Two-Piece Mold ───────────────────────────────────
  {
    id: 'mold-pour-two-piece',
    title: 'Pour 2-Pc Mold',
    blocks: [
      { type: 'paragraph', text: 'Pour 2-Pc is the pour mold split into two prints that binder-clip together: a CENTER piece (the upside-down vase and well, whose floor spreads out into a flat foot flange) and a removable outer SHELL (an open-topped wall with a matching flange). You pour the same way — plaster in the open top — but at release time the shell unclips and lifts off first, leaving the plaster block standing free on the center. Only the center form is left to release, which makes this the easiest-releasing style.' },
      { type: 'heading', text: 'The foot flange' },
      { type: 'list', items: [
        'Both flanges are 2 mm thick by default and overlap 10 mm beyond the shell wall — that overlap is where the binder clips grab',
        'Two raised notch rings on the center flange nest into grooves in the shell flange. Plaster trying to leak under the shell wall has to climb over both rings — a labyrinth seal',
        'The clips clamp directly over the notches, pressing the seal closed. Clip all the way around the flange',
        'Notch Fit sets the groove oversize — if the shell won\'t seat, increase it; if plaster seeps, decrease it',
        'The center flange sticks out a few millimeters past the shell flange (Center Lip): press down on that exposed rim while you pull the shell up, so the center stays put',
      ] },
      { type: 'heading', text: 'The shell' },
      { type: 'paragraph', text: 'Unlike the other styles, the shell\'s Draft tapers INWARD going up: the plaster block is slightly narrower at the top than the bottom, so the shell slides up and off without a fight. It also saves some plaster. The shell still follows your vase\'s cross-section shape.' },
      { type: 'paragraph', text: 'The wall runs an extra Grab Height (10 mm default) above the plaster fill line — an empty rim to grab when pulling the shell off. Fill to the line (plaster thickness above the vase bottom), NOT to the brim: the Plaster view shows the intended level.' },
      { type: 'heading', text: 'Workflow' },
      { type: 'list', items: [
        'Print the center (supports under the hollow interior, like Pour 1-Pc) and the shell (prints flange-down, no supports)',
        'Seat the shell\'s grooves onto the center\'s notch rings and binder-clip the flanges all around',
        'Tape or clay over the four round air holes, apply mold release, and pour to the fill line (Grab Height below the brim)',
        'When set: unclip, lift the shell straight up and off, then release the center (ice-cold water in the hollow interior, air or push rods through the floor holes)',
      ] },
      { type: 'tip', text: 'The shell is reusable: re-clip it for every re-pour of this design. If you tweak only the vase profile but keep the footprint, the old shell may still fit — compare the Shell numbers in Printer Fit.' },
    ],
  },

  // ─── 5. Master Settings ───────────────────────────────────────
  {
    id: 'mold-master-settings',
    title: 'Master Settings',
    blocks: [
      { type: 'keyvalue', items: [
        { key: 'Shrink %', value: 'Clay slip shrinks as it dries and fires — commonly around 12%, but check your clay body\'s spec. The master is scaled up by this amount so finished pieces match your designed size.' },
        { key: 'Wall', value: 'Printed shell thickness of the hollow master. 3mm is a good default — stiff enough to survive demolding, thin enough to flex when you release it.' },
        { key: 'Keep Texture', value: 'Carries the vase\'s surface texture onto the master (and so into the mold). Turn it off for a smooth mold of a textured design. Note that most textures create undercuts — see the Undercut Check section.' },
      ] },
      { type: 'heading', text: 'Foot Recess' },
      { type: 'paragraph', text: 'Recesses the master\'s bottom face in printer-friendly steps. The plaster fills the recess, forming a raised boss in the mold floor — so every piece you cast gets a foot ring around a recessed center.' },
      { type: 'keyvalue', items: [
        { key: 'Foot Width', value: 'The flat ring at the outer edge of the bottom — this becomes the foot the piece stands on.' },
        { key: 'Slope Width', value: 'The stepped ramp from the foot up to the recessed center.' },
        { key: 'Depth', value: 'How far the center is recessed. Limited to the master wall thickness minus 0.5mm so it can\'t punch into the hollow interior.' },
        { key: 'Step Height', value: 'The ramp is built from discrete steps — set this to your printer\'s layer height so the steps print cleanly without support.' },
        { key: 'Smooth Inside', value: 'Builds the ramp and recessed center from the untextured base contour, keeping surface texture out of the glaze well.' },
      ] },
    ],
  },

  // ─── 6. Well, Flange & Cottle Settings ────────────────────────
  {
    id: 'mold-well-cottle',
    title: 'Well, Flange & Cottle',
    blocks: [
      { type: 'heading', text: 'Well' },
      { type: 'keyvalue', items: [
        { key: 'Width', value: 'How far the well steps out horizontally from the vase rim — the width of the razor-trim ledge. Wider = a bigger slip reservoir and an easier trim line.' },
        { key: 'Height', value: 'Height of the well wall above the vase rim — the depth of the slip reservoir.' },
        { key: 'Draft', value: 'Outward taper of the well wall so it releases from the set plaster.' },
      ] },
      { type: 'heading', text: 'Flange' },
      { type: 'keyvalue', items: [
        { key: 'Thickness', value: 'Thickness of the lid plate. The lid\'s outer size is set automatically from the cottle so its grip lip always fits.' },
      ] },
      { type: 'heading', text: 'Cottle' },
      { type: 'keyvalue', items: [
        { key: 'Plaster', value: 'The gap between master and cottle wall = the plaster wall thickness of your finished mold. 20mm is typical; thicker absorbs more water per cast but is heavier and slower to dry.' },
        { key: 'Wall', value: 'Printed wall thickness of the cottle. It mostly just holds liquid plaster, so 3mm is plenty.' },
        { key: 'Draft', value: 'Inward wall taper (wider at the top) so the plaster block pulls out of the cottle after setting.' },
        { key: 'Air Hole', value: 'Optional hole through the floor center (default 4mm) that lets air in behind the set plaster block so suction doesn\'t fight you when pulling it out. Turn it off for a fully sealed floor, or widen it if a big block releases stubbornly.' },
      ] },
      { type: 'tip', text: 'The plaster gap also sets the pour-slot size in the lid — the slots span exactly the gap between the well wall and the cottle wall, so plaster can only go where it belongs.' },
    ],
  },

  // ─── 7. Undercut Check ────────────────────────────────────────
  {
    id: 'mold-undercuts',
    title: 'Undercut Check',
    blocks: [
      { type: 'paragraph', text: 'After the plaster sets, the master must pull straight up out of the block. That works only if the master never gets narrower as it rises: every horizontal slice has to fit through every slice above it. Straight vertical sections are fine — any inward narrowing is not, because the plaster that set above the wide spot locks it in.' },
      { type: 'paragraph', text: 'With the Undercuts view toggle on, the master is tinted red wherever it\'s wider than the narrowest point anywhere above it. The whole trapped region paints — a bulge below a narrow neck shows red across the entire bulge, because all of it would collide with plaster on the way out, not just the spot where the profile turns inward.' },
      { type: 'heading', text: 'What triggers red' },
      { type: 'list', items: [
        'Profile curves that bend inward anywhere above the base (shoulders, necks, barrel shapes)',
        'Twist — a twisted cross-section corkscrews, so it can\'t pull straight up even if its profile never narrows. Molding a twisted design needs the twist removed',
        'Most textures with horizontal relief (Waves, Rods, ripple bands) — each groove is a real micro-undercut. Expect heavy red on textured masters',
        'XY Sway that leans the vase over — the leaning side effectively narrows as it rises',
      ] },
      { type: 'paragraph', text: 'The check is strict on purpose: plaster doesn\'t shrink away from the master as it sets (it actually expands slightly, about 0.2%), so there\'s no clearance to forgive small undercuts. A tiny red band might survive in practice thanks to the master flexing when released — but that\'s a gamble to test on a real pour, not something the checker will approve.' },
      { type: 'paragraph', text: 'If the master has any fully-flagged red area when you click Export Master, a warning dialog appears first. You can export anyway — useful when you\'ve decided a shallow texture is worth trying.' },
      { type: 'tip', text: 'The foot recess and the well collar are never flagged — the recess lifts cleanly off the plaster boss, and the well is always wider than the rim. Only the vase body between them is analyzed.' },
    ],
  },

  // ─── 8. Printing, Pouring & Casting ───────────────────────────
  {
    id: 'mold-print-cast',
    title: 'Printing, Pouring & Casting',
    blocks: [
      { type: 'heading', text: 'Printing the parts' },
      { type: 'list', items: [
        'Print both parts watertight: 2–3 perimeters and enough top/bottom layers — liquid plaster finds pinholes',
        'The master prints as a normal solid model (it\'s already hollow with real walls), not in spiral/vase mode',
        'Check the Printer Fit section for each part\'s widest diameter and height against your printer bed',
        'PLA works fine; the parts only meet room-temperature plaster',
      ] },
      { type: 'heading', text: 'Mixing plaster' },
      { type: 'paragraph', text: 'The Plaster Estimate section shows the mold volume split into approximate powder and water weights for the chosen material (Pottery Plaster No.1, Hydrocal, or Hydrostone). Weigh both, add powder to water (not the reverse), let it slake a minute or two, then mix until it just starts to thicken.' },
      { type: 'heading', text: 'Pouring' },
      { type: 'list', items: [
        'Set the cottle on a level surface and seat the master\'s lid on the cottle rim — the grip lip centers it',
        'Pour plaster through the lid slots until it reaches the underside of the lid',
        'Tap or vibrate the assembly to walk bubbles up and out — bubbles against the master become voids in your mold surface',
        'Let it set fully (it will warm up, then cool again) before releasing anything',
      ] },
      { type: 'heading', text: 'Releasing the parts' },
      { type: 'list', items: [
        'Pour ice-cold water into the hollow master — the plastic shrinks slightly and pops free of the plaster',
        'Warm water on the cottle helps it release from the plaster block the same way',
        'The air hole in the cottle floor (if enabled) lets air in behind the plaster block so suction doesn\'t fight you',
        'Let the fresh mold dry thoroughly (days, not hours) before its first cast — a saturated mold can\'t absorb water from the slip',
      ] },
      { type: 'heading', text: 'Slip casting' },
      { type: 'list', items: [
        'Fill the mold to the top of the well reservoir and keep it topped up as the level drops',
        'Wait while the plaster draws water out of the slip, building a clay wall against the mold face',
        'When the wall is thick enough, pour the excess slip back out and drain upside down',
        'Once leather-hard, the piece releases from the mold; trim it off the reservoir ring with a razor at the square ledge',
      ] },
      { type: 'tip', text: 'A plaster mold is good for many casts, but it works by absorbing water — let it dry between casting sessions.' },
    ],
  },
];
