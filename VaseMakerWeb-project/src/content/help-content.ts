/**
 * Help panel content — pure data, no JSX.
 * Edit content here without touching component code.
 */

export type HelpBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'tip'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'keyvalue'; items: { key: string; value: string }[] };

export interface HelpSection {
  id: string;
  title: string;
  blocks: HelpBlock[];
}

export const HELP_SECTIONS: HelpSection[] = [
  // ─── 1. Quick Start ───────────────────────────────────────────
  {
    id: 'quick-start',
    title: 'Quick Start',
    blocks: [
      { type: 'paragraph', text: 'VaseMaker is a parametric 3D vase designer. Adjust sliders on the left, see results instantly in the 3D preview, and export an STL file for 3D printing.' },
      { type: 'heading', text: 'Basic Workflow' },
      { type: 'list', items: [
        'Pick a preset from the dropdown to start with a designed shape',
        'Adjust Dimensions (radius, height) to set the overall size',
        'Choose a cross-section shape (Circle, Star, Heart, etc.)',
        'Edit the profile curve to sculpt the vase outline',
        'Add ripples, twist, or textures for surface detail',
        'Set wall thickness for a printable hollow vase',
        'Export STL when you\'re happy with the design',
      ] },
      { type: 'heading', text: 'Mouse Controls' },
      { type: 'keyvalue', items: [
        { key: 'Left drag', value: 'Rotate the view' },
        { key: 'Scroll wheel', value: 'Zoom in/out' },
        { key: 'Right drag', value: 'Pan the view' },
      ] },
      { type: 'heading', text: 'Keyboard Shortcuts' },
      { type: 'keyvalue', items: [
        { key: '\u2318Z', value: 'Undo' },
        { key: '\u2318\u21e7Z', value: 'Redo' },
      ] },
      { type: 'heading', text: 'Save & Load' },
      { type: 'paragraph', text: 'Save Design exports your parameters as a JSON file. Load Design imports a previously saved file. Your design is fully described by the parameters \u2014 no mesh data is stored, so files are tiny.' },
      { type: 'tip', text: 'Save frequently! There\'s no auto-save. If you refresh the page, unsaved changes are lost.' },
    ],
  },

  // ─── 2. Shapes ────────────────────────────────────────────────
  {
    id: 'shapes',
    title: 'Shapes',
    blocks: [
      { type: 'paragraph', text: 'The cross-section shape determines the vase\'s horizontal profile \u2014 what it looks like when viewed from above. VaseMaker includes 25 polar shapes.' },
      { type: 'heading', text: 'Shape Categories' },
      { type: 'keyvalue', items: [
        { key: 'Simple', value: 'Circle, Ellipse, Square, Rectangle, Diamond, Polygon' },
        { key: 'Organic', value: 'Heart, Egg (2 variants), Butterfly, Cardioid (3 variants)' },
        { key: 'Mathematical', value: 'Rose, SuperEllipse, SuperFormula, Infinity, Limacon, Folium, Astroid, Lissajous, RationalRose' },
        { key: 'Mechanical', value: 'Gear, Spirograph, Misc' },
      ] },
      { type: 'heading', text: 'Shape Morphing' },
      { type: 'paragraph', text: 'Bottom Shape is always active. Open the Top Shape section and toggle it on to enable morphing \u2014 the vase will smoothly blend from the bottom shape at the base to the top shape at the rim. Each shape has its own independent parameters.' },
      { type: 'tip', text: 'Try morphing Circle \u2192 Star or Square \u2192 Heart for dramatic effects.' },

      { type: 'heading', text: 'SuperFormula Guide' },
      { type: 'paragraph', text: 'The SuperFormula (Gielis formula) is the most versatile shape. It can produce circles, stars, polygons, petals, and many organic forms \u2014 all from 6 parameters.' },
      { type: 'paragraph', text: 'The formula: r(\u03b8) = |cos(m\u03b8/4)/a|^n2 + |sin(m\u03b8/4)/b|^n3, raised to -1/n1.' },
      { type: 'table', headers: ['Parameter', 'Effect', 'Range'], rows: [
        ['m', 'Number of symmetry lobes/petals', '1\u201320'],
        ['n1', 'Overall roundness (lower = puffier)', '0.1\u201340'],
        ['n2', 'Cos term sharpness', '0.1\u201320'],
        ['n3', 'Sin term sharpness', '0.1\u201320'],
        ['a', 'Horizontal stretch', '0.1\u20135'],
        ['b', 'Vertical stretch', '0.1\u20135'],
      ] },
      { type: 'heading', text: 'SuperFormula Examples' },
      { type: 'keyvalue', items: [
        { key: 'Circle', value: 'm=0, n1=1, n2=1, n3=1, a=1, b=1' },
        { key: 'Square', value: 'm=4, n1=100, n2=100, n3=100' },
        { key: 'Triangle', value: 'm=3, n1=100, n2=100, n3=100' },
        { key: 'Star', value: 'm=5, n1=0.3, n2=1, n3=1' },
        { key: '4-petal flower', value: 'm=8, n1=0.5, n2=1, n3=1' },
        { key: 'Asteroid', value: 'm=4, n1=0.5, n2=0.5, n3=0.5' },
        { key: 'Soft clover', value: 'm=6, n1=1, n2=1, n3=6' },
        { key: 'Spiky star', value: 'm=5, n1=2, n2=7, n3=7' },
      ] },
      { type: 'tip', text: 'Start with m to set the number of lobes, then adjust n1 to control how round or pointy they are. n2 and n3 fine-tune the shape of each lobe.' },
    ],
  },

  // ─── 3. Profile, Twist & Sway ─────────────────────────────────
  {
    id: 'profile-twist-sway',
    title: 'Profile, Twist & Sway',
    blocks: [
      { type: 'heading', text: 'Profile Curve' },
      { type: 'paragraph', text: 'The profile curve controls how the cross-section radius varies from bottom to top. It\'s a Bezier curve where the horizontal axis is the radius multiplier (0\u20131) and the vertical axis is the height (bottom to top).' },
      { type: 'list', items: [
        'A straight vertical line = cylinder (constant radius)',
        'Curving left = narrower at that height',
        'Curving right = wider at that height',
        'Classic vase: narrow at bottom, wide in middle, narrow at top',
      ] },
      { type: 'heading', text: 'Curve Editor Controls' },
      { type: 'keyvalue', items: [
        { key: 'Drag point', value: 'Move a control point' },
        { key: 'Double-click', value: 'Add a new point (max 8 total)' },
        { key: 'Right-click', value: 'Remove a point (min 2 remain)' },
      ] },
      { type: 'tip', text: 'The first and last points control the bottom and top of the vase. Points between them shape the curvature.' },

      { type: 'heading', text: 'Custom Twist' },
      { type: 'paragraph', text: 'Custom Twist uses a Bezier curve to define how many degrees the cross-section rotates at each height level. The horizontal axis is degrees of rotation, the vertical axis is height.' },
      { type: 'paragraph', text: 'Example: a curve going from 0\u00b0 at the bottom to 90\u00b0 at the top will twist the shape a quarter turn over its height.' },

      { type: 'heading', text: 'Wave Twist' },
      { type: 'paragraph', text: 'Wave Twist applies a sinusoidal (back-and-forth) twist. Unlike Custom Twist which is a one-way rotation, Wave Twist oscillates.' },
      { type: 'keyvalue', items: [
        { key: 'Amplitude', value: 'How far it twists in degrees' },
        { key: 'Cycles', value: 'How many back-and-forth oscillations over the height' },
      ] },
      { type: 'tip', text: 'Wave Twist + Radial Ripple creates beautiful swirling patterns.' },

      { type: 'heading', text: 'XY Sway' },
      { type: 'paragraph', text: 'XY Sway offsets the entire cross-section left/right (X) or forward/back (Y) at different heights. Each axis has its own Bezier curve editor plus a Scale slider.' },
      { type: 'paragraph', text: 'Use X Sway to make the vase lean. Combine both axes to create S-curves or spiraling offsets.' },

      { type: 'heading', text: 'Smoothing' },
      { type: 'paragraph', text: 'Vertical and Radial Smoothing modulate the intensity of ripples. They fade ripples in/out along the height or around the circumference, preventing a uniform "stamped" look.' },
      { type: 'keyvalue', items: [
        { key: 'Vertical Cycles', value: 'Number of fade-in/fade-out bands up the height' },
        { key: 'Start Percent', value: 'Where the smoothing begins (0 = bottom)' },
        { key: 'Radial Cycles', value: 'Number of fade bands around the circumference' },
        { key: 'Offset Angle', value: 'Rotational offset for radial smoothing' },
      ] },
    ],
  },

  // ─── 4. Textures ──────────────────────────────────────────────
  {
    id: 'textures',
    title: 'Textures',
    blocks: [
      { type: 'paragraph', text: 'Textures add surface detail by displacing vertices inward or outward. The master toggle in the section header enables/disables all textures at once. Individual textures have their own enable toggles.' },
      { type: 'tip', text: 'Textures stack additively. You can combine multiple textures for complex effects \u2014 e.g. Fluting + Voronoi for fluted panels with organic cells.' },

      { type: 'heading', text: 'Fluting' },
      { type: 'paragraph', text: 'Vertical grooves running up the vase, like a fluted column. Clean, architectural look.' },
      { type: 'keyvalue', items: [
        { key: 'Count', value: 'Number of flutes around the circumference (4\u201360)' },
        { key: 'Depth', value: 'How deep the grooves cut (mm)' },
      ] },

      { type: 'heading', text: 'Basket Weave' },
      { type: 'paragraph', text: 'Interlocking horizontal and vertical bands that alternate in/out, mimicking woven material.' },
      { type: 'keyvalue', items: [
        { key: 'Bands', value: 'Horizontal divisions' },
        { key: 'Waves', value: 'Vertical divisions' },
        { key: 'Depth', value: 'Amplitude of the weave (mm)' },
      ] },

      { type: 'heading', text: 'Voronoi' },
      { type: 'paragraph', text: 'Organic cell pattern based on Worley noise. Creates a natural, cracked-earth or honeycomb-like texture.' },
      { type: 'keyvalue', items: [
        { key: 'Scale', value: 'Cell size (smaller = more cells)' },
        { key: 'Depth', value: 'How deep the cell edges indent (mm)' },
        { key: 'Edge Width', value: 'Thickness of ridges between cells' },
        { key: 'Seed', value: 'Random seed \u2014 change for different cell layouts' },
      ] },

      { type: 'heading', text: 'Simplex Noise' },
      { type: 'paragraph', text: 'Smooth, organic noise using fBm (fractal Brownian motion). Creates terrain-like, cloudy, or coral-like surfaces depending on settings.' },
      { type: 'keyvalue', items: [
        { key: 'Scale', value: 'Feature size (larger = broader bumps)' },
        { key: 'Depth', value: 'Displacement amplitude (mm)' },
        { key: 'Octaves', value: 'Layers of detail (1=smooth, 4+=rough)' },
        { key: 'Persistence', value: 'How much each octave contributes (0\u20131)' },
        { key: 'Lacunarity', value: 'Frequency multiplier between octaves' },
        { key: 'Seed', value: 'Random seed for different patterns' },
      ] },
      { type: 'tip', text: 'Suggested starting point: Scale 10, Depth 1.5, Octaves 3, Persistence 0.5, Lacunarity 2.0.' },
    ],
  },

  // ─── 5. 3D Printing Tips ──────────────────────────────────────
  {
    id: '3d-printing',
    title: '3D Printing Tips',
    blocks: [
      { type: 'paragraph', text: 'VaseMaker generates watertight STL files ready for slicing. The exported mesh is exactly what you see in the preview (WYSIWYG).' },

      { type: 'heading', text: 'Wall Thickness' },
      { type: 'paragraph', text: 'For FDM printers, set wall thickness to match your nozzle:' },
      { type: 'keyvalue', items: [
        { key: '0.4mm nozzle', value: '0.8\u20131.2mm wall thickness (2\u20133 perimeters)' },
        { key: '0.6mm nozzle', value: '1.2\u20131.8mm wall thickness' },
      ] },
      { type: 'tip', text: 'Too thin = fragile and may not slice properly. Too thick = wastes filament and hides surface detail.' },

      { type: 'heading', text: 'Vase Mode (Spiral)' },
      { type: 'paragraph', text: 'For decorative vases, you can use your slicer\'s "vase mode" (spiral outer contour). Set wall thickness to 0 in VaseMaker \u2014 this exports a single surface. Your slicer will print it as one continuous spiral.' },
      { type: 'list', items: [
        'Cura: Special Modes \u2192 Spiralize Outer Contour',
        'PrusaSlicer: Spiral Vase (Print Settings \u2192 Layers)',
        'OrcaSlicer: Others \u2192 Spiral Vase',
      ] },
      { type: 'tip', text: 'Vase mode prints are fast and beautiful but fragile \u2014 great for display, not for daily use.' },

      { type: 'heading', text: 'Base & Rim' },
      { type: 'keyvalue', items: [
        { key: 'Base Thickness', value: 'Minimum 1\u20132mm for stability. Measured vertically.' },
        { key: 'Rim', value: 'Flat (default) or Rounded. Rounded rims look nicer but add a slight overhang.' },
      ] },

      { type: 'heading', text: 'Resolution' },
      { type: 'paragraph', text: 'Higher resolution = smoother print but larger file and slower preview.' },
      { type: 'keyvalue', items: [
        { key: 'Vertical', value: '60\u2013100 for most prints. Higher for tall vases.' },
        { key: 'Radial', value: '72\u2013180 for smooth curves. 360 for maximum quality.' },
      ] },
      { type: 'paragraph', text: 'Use the Show Facets toggle to preview the actual polygon edges that will be in your STL file. If you can see visible flat faces, increase resolution.' },
      { type: 'tip', text: 'For final export, bump radial resolution to 180\u2013360. For quick iteration, keep it at 72.' },

      { type: 'heading', text: 'Troubleshooting' },
      { type: 'list', items: [
        'Slicer shows holes or non-manifold: increase wall thickness or resolution',
        'Print is too fragile: increase wall thickness and base thickness',
        'Surface detail not visible: reduce wall thickness or increase texture depth',
        'File too large: lower resolution (especially radial)',
        'Complex shapes self-intersect: simplify the cross-section or reduce ripple amplitude',
      ] },
    ],
  },
];
