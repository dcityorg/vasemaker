/**
 * HandleMaker help panel content — pure data, rendered by the shared HelpPanel.
 */

import type { HelpSection } from './help-content';

export const HANDLE_HELP_SECTIONS: HelpSection[] = [
  {
    id: 'handle-quick-start',
    title: 'Quick Start',
    blocks: [
      { type: 'paragraph', text: 'HandleMaker designs a mug/vase handle and generates the 3D-printable parts for a two-part plaster slip-casting mold of it: a handle master, a bottom plate, and one side wall you print twice.' },
      { type: 'heading', text: 'Basic Workflow' },
      { type: 'list', items: [
        'Pick a preset spine shape from the dropdown, or draw your own',
        'Set Height and Depth for the finished handle size (shrinkage is compensated automatically)',
        'Set the cross-section Width and Thickness',
        'Size the well cones (opening + length) for pouring slip',
        'Turn on the Plate / Walls / Plaster view toggles to see the mold grow around the handle',
        'Export the three STLs (print the wall twice) and pour your mold',
      ] },
      { type: 'tip', text: 'Everything auto-saves in this browser — your handle design is still here after a reload. Use Save Settings to keep named design files.' },
    ],
  },
  {
    id: 'handle-spine',
    title: 'The Spine Editor',
    blocks: [
      { type: 'paragraph', text: 'The spine is the handle’s centerline, drawn in side view: the left edge is the vase wall, right is stick-out, up is height. Both ends are anchored to the wall. The curve editor works exactly like the vase Profile editor:' },
      { type: 'keyvalue', items: [
        { key: 'Drag', value: 'Move a control point' },
        { key: 'Double-click', value: 'Add a point (max 8)' },
        { key: 'Right-click', value: 'Remove a point' },
        { key: 'Shift-click', value: 'Toggle Fixed (square, curve passes through) vs Handle (circle, pulls the curve)' },
        { key: 'Arrow keys', value: 'Nudge the selected point (Shift = coarse, Alt = fine)' },
      ] },
      { type: 'tip', text: 'For a smooth curve through a middle Fixed point, keep the neighboring Handle points at the same X as that point — a kink there pinches the inside of the bend. The warning banner appears if the handle bends so tightly that the mold plate cutout would overlap itself.' },
      { type: 'paragraph', text: 'The cross-section is an ellipse: Width lies in the parting plane, Thickness is perpendicular to it. An ellipse is always widest exactly at the parting plane, which is what makes a two-part mold release cleanly.' },
    ],
  },
  {
    id: 'handle-wells',
    title: 'Well Cones',
    blocks: [
      { type: 'paragraph', text: 'Each end of the handle flares into a cone that ends flush with the mold wall. In the finished plaster mold these become the openings you pour slip into; on the cast handle they are stubs you cut off and clean up.' },
      { type: 'list', items: [
        'Opening ⌀ — size of the pour opening. Bigger handles want bigger openings',
        'Length — distance from the handle end to the wall face. Also sets where the well-side wall stands',
        'The cones point straight out at the wall, angled by how your spine approaches the left edge',
      ] },
      { type: 'paragraph', text: 'Shrink % scales the handle body up so the fired handle comes out at your designed size (same idea as MoldMaker’s master scale-up). The cone/opening plumbing is not scaled.' },
    ],
  },
  {
    id: 'handle-mold-parts',
    title: 'Anatomy of the Mold',
    blocks: [
      { type: 'heading', text: 'Bottom Plate' },
      { type: 'list', items: [
        'A stepped pocket in the handle’s silhouette registers the master at the parting plane — the mid-plane sits Seat Depth (default 1 mm) below the plate top, resting on the pocket floor, with a solid floor below so plaster can’t leak',
        'A continuous V-ridge runs around the plate under the walls: it aligns the walls along their whole length and acts as a leak dam (plaster can’t climb over the V)',
        'Two spherical registration marks — one bump, one dimple — mold a matching natch pair into the two plaster halves',
        'The plate border beyond the walls is the clip flange for binder clips',
      ] },
      { type: 'heading', text: 'Side Walls (one design × 2)' },
      { type: 'list', items: [
        'Each wall covers half the box; the second copy is the same print rotated 180°',
        'Seam tabs meet mid-side with a vertical V-ridge on one tab and a V-groove on the other, so the two copies key into each other',
        'A V-groove along each wall bottom mates with the plate ridge',
        'A 1 mm collar frames each well opening so the cone tip nests into it (seals the pour opening). The matching collar on the far wall is a by-product of the two-identical-walls trick — it just leaves a shallow dent in the plaster block’s back face',
      ] },
      { type: 'paragraph', text: 'Wall height = the master’s highest point + the Plaster Above setting. Walls only need to contain ONE pour — you re-clamp them around the first plaster half for the second pour.' },
    ],
  },
  {
    id: 'handle-printing',
    title: 'Printing & Assembly',
    blocks: [
      { type: 'heading', text: 'Printing' },
      { type: 'list', items: [
        'Plate: prints as exported, pocket up, no supports',
        'Wall: print 2 copies. Lay it on its outer face in the slicer if you prefer support-free printing',
        'Master: a 3D curved loop — print with supports. Supports only touch surfaces that never contact plaster, but keep support interfaces away from the silhouette edge so the master still seats cleanly in the plate pocket',
      ] },
      { type: 'heading', text: 'Assembly & Pouring' },
      { type: 'list', items: [
        'Seat the master in the plate pocket, stand the walls on the V-ridge, clip the flanges with binder clips',
        'Pour plaster half 1, tapping to release bubbles',
        'When set: unclip, flip, remove the plate. Re-clamp the walls around the first half, apply mold soap / parting agent to the plaster face, pour half 2',
        'Separate, remove the master, and let both halves dry thoroughly before casting',
      ] },
    ],
  },
  {
    id: 'handle-casting',
    title: 'Casting Handles',
    blocks: [
      { type: 'list', items: [
        'Band the two plaster halves together (rubber bands or clamps)',
        'Pour slip into one or both well openings; top up as the plaster draws water',
        'When the handle has set up, open the mold, cut off the well stubs, and clean the seam lines',
        'Trim the flat attachment faces to your pot’s curvature with a knife, then score-and-slip to attach',
      ] },
      { type: 'tip', text: 'The Plaster Estimate shows powder + water for BOTH halves together — mix roughly half per pour.' },
    ],
  },
];
