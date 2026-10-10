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
      { type: 'paragraph', text: 'MoldMaker and HandleMaker were inspired by Kent at shapecastmolds.com (https://shapecastmolds.com) — thank you.' },
      { type: 'heading', text: 'Basic Workflow' },
      { type: 'list', items: [
        'Pick a preset from the dropdown, or draw your own — a preset sets the shape AND the mold settings behind the handles that have printed and poured well here',
        'Set Height and Depth — measured on the handle itself, shrinkage compensated automatically',
        'Set the cross-section Width and Thickness',
        'Size the well cones (opening + length) for pouring slip',
        'Turn on the Plate / Wall A / Wall B / Plaster view toggles to see the mold grow around the handle (hide one wall to inspect the wall-to-plate joint)',
        'Export the STLs (print the wall twice) and pour each mold half',
      ] },
      { type: 'paragraph', text: 'The joint between the handle and the plate is a plain flat land, and what seals it is DEPTH at a tight fit: the master\u2019s flat skirt drops Seat Depth into the pocket, so plaster has to creep that far down a Fit Clearance gap to reach the underside. The wells work the same way \u2014 the wall\u2019s collar swallows Well Seal millimetres of the well cylinder at the same clearance. Both joints carried interlocking V ridges until August 2026. They sealed, but plaster got into them and was very hard to clean out, and the seat V in particular needed a solid floor under the master\u2019s channel \u2014 which made the master very hard to pry out of the set plaster. Depth and clearance do the job with nothing to scrub.' },
      { type: 'tip', text: 'RESOLUTION lives in Handle Dimensions, right under Shell — deliberately, so you meet it while you are still thinking about the handle rather than after the print is off the bed. Around sets segments over HALF the cross-section and now also drives the well collar\u2019s sealing bore and the registration natches. The default 80 puts the strap within 0.0015 mm of a true ellipse; 40 is already invisible at 0.006 mm, and 24 is where facets start to show. Raising it costs only file size (master ~1.8 MB at 40, ~3.2 MB at 80).' },
      { type: 'tip', text: 'CROSS-SECTION (View list) slices everything with a movable plane so you can see inside. Pick the axis — X cuts across the strap and shows the section (the shell wall, and the open channel between); Z cuts parallel to the plate and shows the channel running the length of the master in plan; Y cuts the other way. The Position slider sweeps the plane through the whole assembly; arrow keys step it, Alt for fine. Note the cut face is not capped — you look into a hollow shell rather than at a solid section, which is what makes the wall thickness readable.' },
      { type: 'tip', text: 'The master is always hollow and OPEN along its whole underside \u2014 the shell is all there is. That matters once the plaster has set: you can get a tool into the channel, and grip the Seat Depth lip standing proud of the plaster face with long-nose pliers, to lever the master out. PULL RIBS help with the same job: short solid slices bridging the channel (4 along the strap plus one in each well by default) with the channel open either side, so plier jaws drop in and close on one. They sit INSIDE the shell, so the plaster \u2014 and therefore the cast handle \u2014 never sees them. Shell sets how thick the printed walls are, and is clamped automatically so the cavity never closes on a thin strap — the Hollow cavity row in Analysis shows what you actually get.' },
      { type: 'tip', text: 'PRINTING THE WALLS \u2014 two orientations work. Flange down (the way it sits in the mold) needs no supports at all; the only steep overhang is about 20 mm\u00b2 at the crown of each well pocket, which will sag a little. If that comes out poorly, print the walls UPSIDE DOWN (wall rim on the bed) instead: that makes the well pocket completely self-supporting, and the only thing needing support is the clip flange, which sits outside the plaster and does not have to be pretty. The well collars run the full height of the wall so neither orientation has a ledge hanging in mid-air.' },
      { type: 'tip', text: 'FIT CLEARANCE is one number for everywhere the master meets a printed part \u2014 the plate pocket AND the wall\u2019s well-collar bore. 0.10 mm is the default: tight enough to hold the master put and to starve the leak path, loose enough to assemble on a well-calibrated printer. If a printed master will not drop into its pocket, or a wall will not seat over a well, raise it a step at a time rather than sanding.' },
      { type: 'tip', text: 'Flat Shading in the View list gives every face its own normal. Smooth shading averages across a V ridge\u2019s three faces and draws the sharp apex as a rounded tube — turn it on to see the ridges and grooves as they will actually print.' },
      { type: 'tip', text: 'PRESETS carry a known-good setup, not just a silhouette: picking one sets the shape and overwrites the mold settings with the proven numbers. That is deliberate — but it means a preset will replace settings you have tuned. Undo takes it back in one step, and Revert to Saved returns to your own file. RESET HANDLE SETTINGS restores the default mold numbers and leaves your handle SHAPE alone — the profile, Width and Thickness stay put. That makes it the button to press after an app update changes a default: you get the new numbers without redrawing your handle. To change the shape instead, pick a preset — Basic is the one the app starts with. Both are undoable. REVERT TO SAVED appears once a design has been saved or loaded, and puts everything back to that file in one click, shape included.' },
      { type: 'tip', text: 'Undo and redo (↶ ↷ in the header, or Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z) cover the whole handle design, shape included. One slider drag is one step. Loading a settings file starts fresh and clears the history.' },
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
        { key: 'Double-click', value: 'Add a point (max 16)' },
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
      { type: 'paragraph', text: 'Show Mug (under the editor) puts your VaseMaker mug with the handle. The big window becomes a side view of the FINISHED mug at true size, standing upright with this handle on it: placed the way the Mold tab\'s Split 2-Pc style will cast it, top end at Top Below Rim, bottom end where the handle\'s span meets the mug, both ends running into the wall. Keep shaping the handle in the editor; the side view follows as you drag. The editor also shows the mug outline in grey, and opens 20 mm left of the wall so you can see it. Scroll the mouse wheel over the side view to zoom (it zooms about the pointer) and drag to move it. Zoom until the 10 mm bar at the bottom-left measures 10 mm with a ruler and the mug is at real size; that zoom is remembered, and it holds while you edit the handle. Fit (or double-click) frames the whole mug again. A red message means the handle does not fit this mug at that height. Turn Show Mug off to get the 3-D mold view back.' },
      { type: 'tip', text: 'The ⌂ button under the orientation cube snaps the 3D view to look straight down on the handle, oriented exactly like this editor — wall and openings on the left, height running up. It keeps whatever zoom you were at.' },
      { type: 'paragraph', text: 'The cross-section of the finished handle is an ellipse: Thickness lies in the parting plane (how thick the strap looks in the profile view), Width perpendicular to it (what you see looking at the mug head-on). BOTH numbers describe the FINISHED handle — the two plaster halves together, after clay shrinkage. The printed master is the UPPER HALF of that ellipse with a flat bottom, so it carries half the Width but all of the Thickness (the parting plane splits the Width direction), and the whole thing is scaled up by Shrink. The Strap Section readout in Analysis spells both out. An ellipse is widest exactly at the parting plane, which is what makes the mold release cleanly.' },
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
      { type: 'paragraph', text: 'Shrink % scales the handle body up so the fired handle comes out at your designed size (same idea as MoldMaker’s master scale-up). The well plumbing is not scaled. The cylinder AND the transition are shelled like the body, so the hollow runs unbroken from each pour opening through to the strap — that continuous void is what you get a tool into to lever the master out of the plaster, and it is where the pull ribs sit.' },
    ],
  },
  {
    id: 'handle-mold-parts',
    title: 'Anatomy of the Mold',
    blocks: [
      { type: 'heading', text: 'Bottom Plate' },
      { type: 'list', items: [
        'A pocket in the handle’s silhouette registers the master: its flat skirt drops Seat Depth (default 3 mm) onto a support lip, putting the parting plane flush with the plate top. That depth is the seal, and it is also the lip you grip with pliers to lift the master out of the set plaster',
        'Inside the lip the plate is CUT THROUGH — reach in from below and tape the master down so it can’t float when the plaster goes in. The opening runs back under both wells (stopping a lip-width short of the mold wall), so there is real surface to tape',
        'TIE BARS cross that opening at intervals, making it a ladder rather than one long slot. Without them the plate inside the handle’s curve is a tongue 50–60 mm long joined to the rest of the plate only at the mold wall — and setting plaster expands, hot, with nothing else to push against there. The bars sit one layer below the lip so the lip alone still decides where the master sits, and they are buried in the sealed space under the master, so the plaster never touches one. Any that would land near a well are dropped (the opening is as wide as the pour hole out there); Analysis reports how many actually landed',
        'The support lip itself is a plain flat land. It carried a V ridge into a matching groove in the master until August 2026 — an excellent seal, but the groove needed a solid floor under the master’s channel to cut into, and that made the master very hard to pry out of the plaster',
        'THREE concentric V-ridges run around the plate near the flange edge: they align the walls and form a triple leak dam. Plaster would have to climb over all three, and a V is self-centring as the wall drops on, so a loose clamp still seals',
        'Two spherical registration marks — one bump, one dimple — mold a matching natch pair into the two plaster halves. Wide and shallow is right for plaster: a big cap locates well and releases cleanly, a tall one is a snap risk. Diameter is clamped to the plaster band between the wall and the handle pocket, so a small Plaster Margin limits it; ENGAGEMENT is limited by Seat Depth, because the plate recess that molds the mating bump is only that deep',
        'The plate border beyond the walls is the clip flange for binder clips',
      ] },
      { type: 'heading', text: 'Side Walls (one design × 2)' },
      { type: 'list', items: [
        'Each wall covers half the box; the second copy is the same print rotated 180°',
        'Seam tabs meet mid-side with a vertical V-ridge on one tab and a V-groove on the other, so the two copies key into each other. The Vs run the full height, from the plate surface to the wall top',
        'Three matching V-grooves in each wall’s clip-flange underside sit over the plate ridges. At each wall-to-wall seam a solid seam block owns the last few millimetres: its underside carries the same three grooves, and its mating face carries three vertical Vs at the SAME positions — so each vertical V stands directly on the ring ridge it continues and the barrier turns the corner in one piece instead of handing off. Keep Flange Width at about 11 mm or more so the walls between these features stay printable (14 is the default)',
        'A collar frames each well opening and swallows Well Seal millimetres of the well cylinder (default 3) at Fit Clearance — that depth of engagement is what keeps plaster out from under the handle there. The matching collar on the far wall is a by-product of the two-identical-walls trick — it just leaves a shallow dent in the plaster block’s back face',
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
      { type: 'tip', text: 'THE PLATE IS THE PARTING PLANE. Both plaster halves copy their mating face from it, so any bow in the plate is copied into both faces the same way round — and two faces bowed the same way do not close. It also spends the pour hot: setting plaster gives off enough heat to soften PLA, which creeps under load well below its melting point. Three things guard against that, in order of effect: the TIE BARS, LIP THICKNESS (stiffness goes as the cube of it — the default 3.6 mm makes a 6.6 mm plate), and printing the plate in PETG or ASA rather than PLA. Note PETG is not stiffer than PLA cold; what it is, is still stiff at 60 °C. Stand the whole assembly on something genuinely flat while it sets.' },
      { type: 'tip', text: 'If two halves will not close, look at the mating faces before blaming the plate: a thin plaster fin standing proud around the handle imprint is the other cause, made by plaster creeping down the Fit Clearance gap beside the master’s skirt. Facing both halves on wet-and-dry paper laid on glass takes a minute and cures fins and small bows alike.' },
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
