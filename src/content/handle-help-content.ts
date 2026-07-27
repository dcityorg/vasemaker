/**
 * HandleMaker help panel content — pure data, rendered by the shared HelpPanel.
 */

import type { HelpSection } from './help-content';

export const HANDLE_HELP_SECTIONS: HelpSection[] = [
  {
    id: 'handle-quick-start',
    title: 'Quick Start',
    blocks: [
      { type: 'paragraph', text: 'HandleMaker designs a mug/vase handle and generates the 3D-printable parts for a two-part plaster slip-casting mold of it: a HALF-handle master (flat side down), a bottom plate, and one side wall you print twice. Each plaster pour molds one half of the handle; two pours make the working pair.' },
      { type: 'heading', text: 'Basic Workflow' },
      { type: 'list', items: [
        'Pick a preset spine shape from the dropdown, or draw your own',
        'Set Height and Depth for the finished handle size (shrinkage is compensated automatically)',
        'Set the cross-section Width and Thickness',
        'Size the well cones (opening + length) for pouring slip',
        'Turn on the Plate / Walls / Plaster view toggles to see the mold grow around the handle',
        'Export the STLs (print the wall twice) and pour each mold half',
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
      { type: 'paragraph', text: 'The editor shows real millimeters at the true aspect ratio — what you draw is what you get. Height and Depth set the drawing-area size and scale the whole curve. Both end points are anchored to the vase wall (the left edge) but slide up and down it, so hook shapes with angled approaches are fine — not just U shapes.' },
      { type: 'paragraph', text: 'The cross-section of the finished handle is an ellipse: Width lies in the parting plane, Thickness perpendicular. The printed master is the UPPER HALF of that ellipse with a flat bottom — each plaster half molds one side, and an ellipse is widest exactly at the parting plane, which is what makes the mold release cleanly.' },
    ],
  },
  {
    id: 'handle-wells',
    title: 'Wells',
    blocks: [
      { type: 'paragraph', text: 'Each end of the handle gets a well running straight out, perpendicular to the vase wall: a round CYLINDER at the mold wall (the pour opening), then a TRANSITION that funnels down onto the handle. In the finished plaster mold these are the openings you pour slip into; on the cast handle they are stubs you cut off flat — the handle always ends parallel to the wall, whatever angle it approaches at.' },
      { type: 'list', items: [
        'Opening ⌀ — diameter of the pour opening / cylinder. Bigger handles want bigger openings',
        'Cylinder — length of the straight section at the mold wall',
        'Transition — length of the funnel from the cylinder down to the handle',
        'The transition sizes itself automatically: a steeply angled handle gets a longer funnel mouth on the side it drifts toward',
        'Turn OFF the Wells view toggle to see the finished handle with its flat-cut ends',
      ] },
      { type: 'paragraph', text: 'Shrink % scales the handle body up so the fired handle comes out at your designed size (same idea as MoldMaker’s master scale-up). The well plumbing is not scaled. With Hollow on, the cylinder and transition are shelled like the body, so the whole master pours less plastic.' },
    ],
  },
  {
    id: 'handle-mold-parts',
    title: 'Anatomy of the Mold',
    blocks: [
      { type: 'heading', text: 'Bottom Plate' },
      { type: 'list', items: [
        'A pocket in the handle’s silhouette registers the master: its flat skirt drops Seat Depth (default 1 mm) onto a support lip, putting the parting plane flush with the plate top',
        'Inside the lip the plate is CUT THROUGH — reach in from below and tape the master down so it can’t float when the plaster goes in',
        'TWO V-ridges run around the plate near the flange edge: they align the walls and form a double leak dam (plaster would have to climb over both)',
        'Two spherical registration marks — one bump, one dimple — mold a matching natch pair into the two plaster halves',
        'The plate border beyond the walls is the clip flange for binder clips',
      ] },
      { type: 'heading', text: 'Side Walls (one design × 2)' },
      { type: 'list', items: [
        'Each wall covers half the box; the second copy is the same print rotated 180°',
        'Seam tabs meet mid-side with a vertical V-ridge on one tab and a V-groove on the other, so the two copies key into each other',
        'Two V-grooves in each wall’s clip-flange underside mate with the plate ridges',
        'A 1 mm collar frames each well opening so the cone tip nests into it (seals the pour opening). The matching collar on the far wall is a by-product of the two-identical-walls trick — it just leaves a shallow dent in the plaster block’s back face',
      ] },
      { type: 'paragraph', text: 'Wall height = the master’s highest point + the Plaster Above setting. Each pour is independent — same setup both times.' },
      { type: 'heading', text: 'Symmetric vs. hook handles' },
      { type: 'paragraph', text: 'Two identical plaster blocks only mate face-to-face if the handle outline is top-bottom symmetric (like a D). Symmetric: pour the same plate twice — done. Hook-shaped (asymmetric) handles: extra “Handle B / Plate B” export buttons appear with mirrored parts — pour half A with the A parts and half B with the B parts, and the blocks line up. The walls fit both.' },
    ],
  },
  {
    id: 'handle-printing',
    title: 'Printing & Assembly',
    blocks: [
      { type: 'heading', text: 'Printing' },
      { type: 'list', items: [
        'Master: prints FLAT side down — no supports needed',
        'Plate: prints as exported, pocket up, no supports',
        'Wall: print 2 copies. Lay it on its outer face in the slicer if you prefer support-free printing',
      ] },
      { type: 'heading', text: 'Assembly & Pouring (per half)' },
      { type: 'list', items: [
        'Seat the master in the plate pocket and tape it down from below through the lip opening',
        'Stand the walls on the plate (grooves onto the edge ridges), clip the flanges with binder clips',
        'Pour plaster, tapping to release bubbles; let it set, then unclip and lift out the block',
        'Repeat for the second half — same plate for symmetric handles, the B plate + B master for hooks',
        'Let both halves dry thoroughly before casting',
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
