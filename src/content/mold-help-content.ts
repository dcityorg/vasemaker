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

  // ─── 3. Master Settings ───────────────────────────────────────
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

  // ─── 4. Well, Flange & Cottle Settings ────────────────────────
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

  // ─── 5. Undercut Check ────────────────────────────────────────
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

  // ─── 6. Printing, Pouring & Casting ───────────────────────────
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
