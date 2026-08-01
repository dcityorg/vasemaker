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
        'Set Height and Depth — measured on the handle itself, shrinkage compensated automatically',
        'Set the cross-section Width and Thickness',
        'Size the well cones (opening + length) for pouring slip',
        'Turn on the Plate / Wall A / Wall B / Plaster view toggles to see the mold grow around the handle (hide one wall to inspect the wall-to-plate joint)',
        'Export the STLs (print the wall twice) and pour each mold half',
      ] },
      { type: 'paragraph', text: 'The joint between the handle and the plate is sealed the same way as the mold flanges: a V ridge runs along the plate\u2019s support lip and a matching groove runs along the handle\u2019s underside, so plaster has to climb a labyrinth instead of crossing a flat land. Both ridges now run STRAIGHT BACK TO THE MOLD WALL under the wells, so the barrier ends against the wall instead of stopping at the well openings in open plaster \u2014 and the tape hole runs back with them, stopping one lip-width short of the wall so the master still has something to sit on out there. The handle\u2019s hollow channel is also capped, which means a leak can no longer get INSIDE the master and run its length.' },
      { type: 'tip', text: 'Lip Width has to hold the V plus clearances. Below about 3.5 mm there is no room and the seal is skipped \u2014 the sidebar says so. 4 mm gives a full-size V; wider is fine.' },
      { type: 'tip', text: 'Flat Shading in the View list gives every face its own normal. Smooth shading averages across a V ridge\u2019s three faces and draws the sharp apex as a rounded tube — turn it on to see the ridges and grooves as they will actually print.' },
      { type: 'tip', text: 'Everything auto-saves in this browser — your handle design is still here after a reload. Use Save Settings to keep named design files; it writes a «name».json plus a «name».txt bench sheet with the plaster batch and printer-fit numbers, so you can size a pour without opening the app. Your browser asks for each file separately — the second dialog opens in the same folder with the name filled in.' },
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
        { key: 'Arrow keys', value: 'Nudge the selected point 1 mm (Shift = 5 mm, Alt = 0.2 mm)' },
        { key: '▲ ▼', value: 'Step the selection to the next point up/down without clicking it — for points that crowd together' },
      ] },
      { type: 'paragraph', text: 'The same Shift/Alt modifiers work on every slider in the sidebar, and while dragging: Alt for finer than the normal step, Shift for coarser.' },
      { type: 'tip', text: 'For a smooth curve through a middle Fixed point, keep the neighboring Handle points at the same X as that point — a kink there pinches the inside of the bend. The warning banner appears if the handle bends so tightly that the mold plate cutout would overlap itself.' },
      { type: 'paragraph', text: 'The editor shows real millimeters, with both axes at the same scale — what you draw is what you get. Both end points are anchored to the vase wall (the left edge) but slide up and down it, so hook shapes with angled approaches are fine, not just U shapes.' },
      { type: 'paragraph', text: 'Height and Depth measure the handle itself, off the red centerline, and the sliders scale the curve to hit the number you ask for. Height reads as two figures — the distance between the two attachment ends, then the overall tallest-to-lowest. The slider sets the first and the second follows; they only differ when a control handle pulls the curve past an end point. Height scales vertically and Depth horizontally, independently, so making a handle taller for a bigger mug leaves your finger clearance exactly as it was.' },
      { type: 'paragraph', text: 'Drawing Area is separate, and view-only: its three sliders move the window\'s top, bottom and right edges without touching the handle. Widen one when you need somewhere to drag a control point to — going negative at the bottom gives you room below the handle. An edge will not close past the outermost control point, so nothing can be hidden. Fit shrinks the window back onto the design; because it has to keep every control point visible, some space stays wherever a handle reaches out past the curve. Re-origin slides the design so the lower attachment end sits at 0 — the drawing does not move, only the numbers on the axis.' },
      { type: 'tip', text: 'The ⌂ button under the orientation cube snaps the 3D view to look straight down on the handle, oriented exactly like this editor — wall and openings on the left, height running up. It keeps whatever zoom you were at.' },
      { type: 'paragraph', text: 'The cross-section of the finished handle is an ellipse: Thickness lies in the parting plane (how thick the strap looks in the profile view), Width perpendicular to it (what you see looking at the mug head-on). The printed master is the UPPER HALF of that ellipse with a flat bottom — each plaster half molds one side, and an ellipse is widest exactly at the parting plane, which is what makes the mold release cleanly.' },
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
        'Inside the lip the plate is CUT THROUGH — reach in from below and tape the master down so it can’t float when the plaster goes in. The opening runs back under both wells (stopping a lip-width short of the mold wall), so there is real surface to tape',
        'A V ridge runs the full length of the support lip on both sides of the strap and out to the mold wall under each well; the master carries the matching groove. That labyrinth is the seal — everything before it was a flat 4 mm land, which is what leaked',
        'TWO V-ridges run around the plate near the flange edge: they align the walls and form a double leak dam (plaster would have to climb over both)',
        'Two spherical registration marks — one bump, one dimple — mold a matching natch pair into the two plaster halves. Wide and shallow is right for plaster: a big cap locates well and releases cleanly, a tall one is a snap risk. Diameter is clamped to the plaster band between the wall and the handle pocket, so a small Plaster Margin limits it; ENGAGEMENT is limited by Seat Depth, because the plate recess that molds the mating bump is only that deep',
        'The plate border beyond the walls is the clip flange for binder clips',
      ] },
      { type: 'heading', text: 'Side Walls (one design × 2)' },
      { type: 'list', items: [
        'Each wall covers half the box; the second copy is the same print rotated 180°',
        'Seam tabs meet mid-side with a vertical V-ridge on one tab and a V-groove on the other, so the two copies key into each other. The Vs run the full height, from the plate surface to the wall top',
        'Two V-grooves in each wall’s clip-flange underside mate with the plate ridges. Where a ridge crosses a seam it passes through a snug tunnel in the wall foot, roofed just above its crest — the seam Vs alternate with the ridges (ridge, V, ridge, V) so every leak path crosses two barriers. Keep Flange Width at 13 mm or more so the walls between these features stay printable',
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
