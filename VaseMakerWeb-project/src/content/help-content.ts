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
        'Add textures or twist for surface detail',
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
        { key: '\u2190 \u2192', value: 'Click a slider, then use arrow keys to nudge the value one step at a time for precise control' },
      ] },
      { type: 'heading', text: 'Design Name' },
      { type: 'paragraph', text: 'The design name appears below the version line in the sidebar header. Click it to rename your design. The name is used for Save Design, Save Image, and Export STL filenames. An asterisk (*) appears when you have unsaved changes.' },
      { type: 'paragraph', text: 'The name updates automatically when you load a design file, save a design, or select a preset. You can also click the name to type a new one at any time.' },
      { type: 'tip', text: 'Some browsers (e.g. Brave) don\'t support reading back renamed filenames from the save dialog. Set your design name by clicking it in the header before saving.' },
      { type: 'heading', text: 'Save & Load' },
      { type: 'paragraph', text: 'Save Design exports your parameters as a JSON file. Load Design imports a previously saved file. Your design is fully described by the parameters \u2014 no mesh data is stored, so files are tiny.' },
      { type: 'paragraph', text: 'If you have unsaved changes and try to load a design or select a preset, you\'ll see a confirmation dialog with options to Save & Continue, Don\'t Save, or Cancel. This prevents accidentally losing your work.' },
      { type: 'tip', text: 'Save frequently! There\'s no auto-save. If you refresh the page, unsaved changes are lost.' },
      { type: 'tip', text: 'Chrome and Edge provide the best file management experience \u2014 save dialogs remember the last folder you used, and filenames carry over between Load, Save, and Export. Other browsers (Brave, Firefox, Safari) may not remember directories or read back renamed filenames.' },
      { type: 'heading', text: 'Image Capture' },
      { type: 'paragraph', text: 'Capture Image saves a screenshot of your vase design as a PNG or JPG file. A resizable frame appears on the viewport showing exactly what will be captured.' },
      { type: 'list', items: [
        'Choose a size preset (640\u00d7480 up to 2048\u00d72048) or enter custom dimensions',
        'Click Capture Image to enter capture mode \u2014 a frame overlay appears',
        'Orbit, zoom, and pan to compose your shot (controls work through the frame)',
        'Drag the corner handles to resize the frame (aspect ratio stays locked)',
        'Click Save Image to download, or Cancel to exit capture mode',
      ] },
      { type: 'tip', text: 'Rulers are automatically hidden in captured images. The filename matches your design name if one is set.' },
      { type: 'heading', text: 'Appearance' },
      { type: 'paragraph', text: 'The Appearance section lets you change the preview color and toggle Show Rulers. Rulers display axis lines with dimension markers (mm) in the 3D view \u2014 useful for checking size, hidden by default for a cleaner view.' },
      { type: 'heading', text: 'Tooltips' },
      { type: 'paragraph', text: 'Hover over any slider label, toggle, or section header to see a tooltip describing what it does.' },
    ],
  },

  // ─── 2. Shapes ────────────────────────────────────────────────
  {
    id: 'shapes',
    title: 'Shapes',
    blocks: [
      { type: 'paragraph', text: 'The cross-section shape determines the vase\'s horizontal profile \u2014 what it looks like when viewed from above. VaseMaker includes 29 polar shapes.' },
      { type: 'heading', text: 'Shape Categories' },
      { type: 'keyvalue', items: [
        { key: 'Simple', value: 'Circle, Ellipse, Square (with rounding), Rectangle (with rounding), Diamond, Polygon' },
        { key: 'Organic', value: 'Heart, Egg (2 variants), Butterfly, Cardioid (3 variants), Teardrop' },
        { key: 'Mathematical', value: 'Rose, SuperEllipse, SuperFormula, Infinity, Limacon, Folium, Astroid, Lissajous, RationalRose, Cassini Oval, Nephroid' },
        { key: 'Mechanical', value: 'Gear (up to 60 teeth), Spirograph, Cycloid, Piriform' },
      ] },
      { type: 'heading', text: 'Shape Morphing' },
      { type: 'paragraph', text: 'Bottom Shape is always active. Open the Top Shape section and toggle it on to enable morphing \u2014 the vase will smoothly blend from the bottom shape at the base to the top shape at the rim. Each shape has its own independent parameters.' },
      { type: 'tip', text: 'Try morphing Circle \u2192 Star or Square \u2192 Heart for dramatic effects.' },

      { type: 'heading', text: 'New Shapes' },
      { type: 'keyvalue', items: [
        { key: 'Cassini Oval', value: 'Smooth pinched oval / peanut shape. The Pinch slider controls how narrow the waist is (higher = more circular, lower = deeper pinch).' },
        { key: 'Cycloid', value: 'Rolling-circle curves. Epi/Hypo slider blends from epicycloid (0, rounded outward bumps) to hypocycloid (1, inward-cusped stars), with unique hybrid shapes in between. Cusps sets the number of lobes (2=kidney, 3=deltoid, 4=astroid, 5+=stars).' },
        { key: 'Teardrop', value: 'Asymmetric raindrop/pear shape \u2014 round on one side, narrowing on the other. Pointiness controls how sharp the narrow end is.' },
        { key: 'Nephroid', value: 'Kidney/bean shape with a single smooth indentation. Indent controls depth from circle (0) to deep kidney (1).' },
      ] },

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
        { key: 'Cycles', value: 'How many back-and-forth oscillations over the height' },
        { key: 'Max Degrees', value: 'How far it twists in degrees' },
      ] },
      { type: 'tip', text: 'Wave Twist + Fluting creates beautiful swirling patterns.' },

      { type: 'heading', text: 'XY Sway' },
      { type: 'paragraph', text: 'XY Sway offsets the entire cross-section left/right (X) or forward/back (Y) at different heights. Each axis has its own Bezier curve editor plus a Scale slider.' },
      { type: 'paragraph', text: 'Use X Sway to make the vase lean. Combine both axes to create S-curves or spiraling offsets.' },

      { type: 'heading', text: 'Smoothing' },
      { type: 'paragraph', text: 'Vertical and Radial Smoothing modulate the intensity of surface effects (textures). They fade effects in/out along the height or around the circumference, preventing a uniform "stamped" look.' },
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
      { type: 'paragraph', text: 'Textures add surface detail by displacing vertices inward or outward. Multiple textures can be combined for complex effects.' },
      { type: 'heading', text: 'Master Switch' },
      { type: 'paragraph', text: 'The toggle next to the Textures header is a master switch. It starts off. You can set up individual textures first (their toggles remember their state), then flip the master on to see the result. Turning the master off hides all textures without changing individual settings \u2014 like a power strip.' },
      { type: 'tip', text: 'Textures stack additively. You can combine multiple textures for complex effects \u2014 e.g. Fluting + Voronoi for fluted panels with organic cells.' },

      { type: 'heading', text: 'Fluting' },
      { type: 'paragraph', text: 'Smooth sine-wave grooves running up the vase, like a fluted column. Clean, architectural look.' },
      { type: 'keyvalue', items: [
        { key: 'Count', value: 'Number of flutes around the circumference (3\u201360)' },
        { key: 'Depth', value: 'How deep the grooves cut (mm)' },
      ] },

      { type: 'heading', text: 'Square Flute' },
      { type: 'paragraph', text: 'Flat-topped rectangular pillars separated by sharp-edged channels. A square-wave version of Fluting \u2014 produces a columned or castle-parapet look instead of smooth grooves.' },
      { type: 'keyvalue', items: [
        { key: 'Count', value: 'Number of pillars around the circumference (3\u201380)' },
        { key: 'Depth', value: 'Channel depth in mm' },
        { key: 'Duty', value: 'Pillar-to-groove ratio. Higher = wider pillars, narrower channels. 0.5 = equal widths' },
        { key: 'Sharpness', value: 'Edge transition. 1 = perfectly square edges, 0 = rounded/beveled' },
      ] },
      { type: 'tip', text: 'High pillar counts require high radial resolution. With 80 pillars, set radial resolution to 400+ for clean square edges.' },

      { type: 'heading', text: 'Waves' },
      { type: 'paragraph', text: 'Smooth outward lobes with a soft cosine profile. The opposite of Fluting \u2014 bumps go outward instead of grooves going inward. Creates a gentle scalloped look.' },
      { type: 'keyvalue', items: [
        { key: 'Count', value: 'Number of wave lobes around the circumference (3\u201360)' },
        { key: 'Depth', value: 'How far the lobes protrude outward (mm)' },
        { key: 'Duty', value: 'Gap between lobes. 0 = lobes touching, 0.9 = narrow lobes with wide flat gaps' },
      ] },

      { type: 'heading', text: 'Rods' },
      { type: 'paragraph', text: 'Semicircular pillars going outward \u2014 like cylindrical rods attached to the surface. Sharper profile than Waves, with a true half-circle cross-section and flat channels between.' },
      { type: 'keyvalue', items: [
        { key: 'Count', value: 'Number of rods around the circumference (3\u201360)' },
        { key: 'Depth', value: 'Rod height outward (mm) \u2014 also the rod radius' },
        { key: 'Duty', value: 'Gap between rods. 0 = rods touching, 0.9 = narrow rods with wide flat gaps' },
      ] },

      { type: 'heading', text: 'Vertical Textures' },
      { type: 'paragraph', text: 'Vertical Fluting, Vertical Square Flute, Vertical Waves, and Vertical Rods are horizontal-band versions of their circumferential counterparts. Instead of running up the vase, these textures wrap around it as horizontal rings or bands.' },
      { type: 'list', items: [
        'Vertical Fluting \u2014 horizontal cosine grooves (bands up the height)',
        'Vertical Square Flute \u2014 horizontal flat-topped bands with rectangular channels',
        'Vertical Waves \u2014 horizontal cosine\u00b2 lobes going outward',
        'Vertical Rods \u2014 horizontal semicircular bands going outward',
      ] },
      { type: 'paragraph', text: 'Each has the same Count, Depth, and Duty sliders as its circumferential counterpart. Count starts at 1 (useful for a single decorative band). Combine a circumferential texture with a vertical one for cross-hatch effects.' },
      { type: 'tip', text: 'Try Fluting + Vertical Fluting together for a woven grid, or Rods + Vertical Rods for a bumpy lattice.' },

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
        { key: 'Scale', value: 'Number of cells around the circumference' },
        { key: 'Depth', value: 'How much the cells raise outward (mm)' },
        { key: 'Edge Width', value: 'Sharpness of ridges between cells (0=smooth, 1=sharp)' },
        { key: 'Seed', value: 'Random seed \u2014 change for different cell layouts' },
        { key: 'Cutout', value: 'Punch holes through the wall at cell centers (see Cutout Mode below)' },
      ] },

      { type: 'heading', text: 'Simplex Noise' },
      { type: 'paragraph', text: 'Smooth, organic noise using fBm (fractal Brownian motion). Creates terrain-like, cloudy, or coral-like surfaces depending on settings.' },
      { type: 'keyvalue', items: [
        { key: 'Scale', value: 'Feature density (larger = more features)' },
        { key: 'Depth', value: 'Displacement amplitude (mm)' },
        { key: 'Octaves', value: 'Layers of detail (1=smooth, 6=craggy)' },
        { key: 'Persistence', value: 'How much each octave contributes (lower=smoother)' },
        { key: 'Lacunarity', value: 'Frequency multiplier between octaves (higher=finer detail)' },
        { key: 'Seed', value: 'Random seed for different patterns' },
      ] },
      { type: 'tip', text: 'Suggested starting point: Scale 10, Depth 1.5, Octaves 3, Persistence 0.5, Lacunarity 2.0.' },

      { type: 'heading', text: 'Carved Wood' },
      { type: 'paragraph', text: 'Vertical grain lines that meander organically, like flat-sawn wood. Uses simplex noise to wobble the stripe positions for a natural carved appearance.' },
      { type: 'keyvalue', items: [
        { key: 'Count', value: 'Number of grain lines around the circumference' },
        { key: 'Depth', value: 'Groove depth (mm)' },
        { key: 'Wobble', value: 'How much lines meander side-to-side (0=straight, 1=wavy)' },
        { key: 'Sharpness', value: 'Edge hardness (0=soft grooves, 1=sharp lines)' },
        { key: 'Seed', value: 'Random seed for different grain patterns' },
      ] },

      { type: 'heading', text: 'SVG Pattern' },
      { type: 'paragraph', text: 'Use any SVG image as a displacement map. The image is converted to grayscale and used as a depth map: black = full depth groove, white = no displacement, gray = proportional depth in between. This means grayscale SVGs produce multi-depth relief effects \u2014 useful for subtle, layered textures.' },
      { type: 'keyvalue', items: [
        { key: 'Load SVG', value: 'Open an .svg file from your computer' },
        { key: 'Save SVG', value: 'Download the current pattern as a clean .svg file for reuse' },
        { key: 'Paste SVG', value: 'Open a dialog to paste SVG code or CSS code from pattern sites (Hero Patterns, Pattern Monster, etc.)' },
        { key: 'Rotate / Flip', value: 'Small buttons next to the thumbnail — rotate 90° CW, flip horizontal, or flip vertical. Transforms are saved with the design' },
        { key: 'Tiles Around', value: 'Number of pattern tiles around the circumference' },
        { key: 'Tiles Up', value: 'Number of pattern tiles up the height (fractional values OK — partial tiles are clipped at the top)' },
        { key: 'Depth', value: 'How deep the pattern displaces (mm)' },
        { key: 'Invert', value: 'Swap which areas are grooves vs. ridges' },
        { key: 'Cutout', value: 'Punch holes through the wall at dark areas (see Cutout Mode below)' },
      ] },
      { type: 'tip', text: 'Use high-contrast black and white SVGs for the clearest patterns. Grayscale SVGs work too \u2014 they produce shallower relief for lighter areas. Increase Resolution for fine detail.' },

      { type: 'heading', text: 'Cutout Mode' },
      { type: 'paragraph', text: 'Voronoi and SVG Pattern have a Cutout toggle that punches holes through the vase wall, creating lattice or perforated designs. Instead of displacing the surface, cutout removes triangles entirely and seals the hole edges with connecting walls.' },
      { type: 'list', items: [
        'Voronoi Cutout: cell centers become holes, edges remain as a lattice framework',
        'SVG Pattern Cutout: dark areas become holes, white areas stay solid. Use high-contrast black/white SVGs for clean cutouts. Grayscale areas fall in the threshold transition zone and produce ragged, unpredictable hole edges',
        'The Edge Width slider (Voronoi) controls how thick the lattice bars are',
        'Cutout holes are automatically suppressed in Smooth Zones to keep the base and rim solid',
        'Higher Resolution produces smoother, rounder hole edges. At low resolution, holes will look blocky',
        'Wall Thickness must be > 0 (shell mode) for cutout to work',
      ] },
      { type: 'tip', text: 'For round or organic hole shapes with SVG cutout, use 150+ vertical and 200+ radial resolution. The hole boundaries follow the mesh grid, so more polygons = smoother curves.' },

      { type: 'heading', text: 'Smooth Zones' },
      { type: 'paragraph', text: 'Smooth Zones suppress all surface effects (textures and cutout holes) near the base and/or rim. This creates clean, solid bands at the top and bottom while keeping the textured middle.' },
      { type: 'keyvalue', items: [
        { key: 'Base %', value: 'Height percentage from the bottom that is kept smooth (0\u2013100%)' },
        { key: 'Rim %', value: 'Height percentage from the top that is kept smooth (0\u2013100%)' },
        { key: 'Base Fade', value: '0% = hard cutoff at base zone edge. 100% = gradual smoothstep blend across full base zone' },
        { key: 'Rim Fade', value: '0% = hard cutoff at rim zone edge. 100% = gradual smoothstep blend across full rim zone' },
      ] },
      { type: 'paragraph', text: 'Base and Rim percentages automatically adjust so they never exceed 100% combined. Smooth Zones do not affect the profile curve, shape, or twist \u2014 only textures.' },
      { type: 'tip', text: 'Use 5\u201310% base and rim with 50\u2013100% fade for a polished look. Essential for cutout designs to keep the vase structurally sound at top and bottom.' },
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

      { type: 'heading', text: 'Smooth Inner Wall' },
      { type: 'paragraph', text: 'When Smooth Inner is enabled (Shell section), the inner wall ignores all ripples and textures, keeping it perfectly smooth. This prevents textures from creating paper-thin spots on the inside.' },
      { type: 'keyvalue', items: [
        { key: 'Smooth Inner', value: 'Toggle on for a smooth inner surface with textured outer' },
        { key: 'Min Wall', value: 'Minimum wall thickness (mm) \u2014 prevents textures from pushing through' },
      ] },
      { type: 'tip', text: 'Enable Smooth Inner when using deep textures (Voronoi, Simplex, or Carved Wood with high depth) to prevent thin walls that won\'t print well.' },

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
      { type: 'paragraph', text: 'Higher resolution = smoother print but larger STL file size.' },
      { type: 'keyvalue', items: [
        { key: 'Vertical', value: '100\u2013200 for most prints. Up to 500 for fine textures or tall vases.' },
        { key: 'Radial', value: '200\u2013360 for smooth curves. Up to 720 for high-count textures (Square Flute, Fluting).' },
      ] },
      { type: 'paragraph', text: 'Use the Show Facets toggle to preview the actual polygon edges that will be in your STL file. If you can see visible flat faces, increase resolution.' },
      { type: 'tip', text: 'For final export, bump radial resolution to 360+. For quick iteration, keep it lower. Dense textures like 80-count Square Flute need 400+ radial to look sharp.' },

      { type: 'heading', text: 'Cutout / Lattice Prints' },
      { type: 'paragraph', text: 'Cutout vases have holes through the wall, creating decorative lattice designs. The mesh is manifold (hole edges are sealed with connecting walls), so slicers should handle them correctly.' },
      { type: 'list', items: [
        'Use 1.0\u20132.0mm wall thickness for structural lattice bars',
        'Use Smooth Zones (5\u201310% base and rim) to keep the top and bottom solid',
        'Voronoi: lower Edge Width = thicker lattice bars, more printable',
        'SVG Pattern: use high-contrast black/white images. Grayscale areas may produce unpredictable partial holes',
        'High resolution (150+ vertical, 200+ radial) gives smoother hole edges and better slicer results',
        'Preview with Show Facets on to see the actual polygon edges the slicer will receive',
      ] },
      { type: 'tip', text: 'Print a small test piece first. Lattice vases with thin bars may need supports or slower print speed.' },

      { type: 'heading', text: 'Shape Printability' },
      { type: 'paragraph', text: 'Some cross-section shapes can produce geometry that looks great on screen but may not print well or at all. Shapes with thin lobes, sharp cusps, or self-crossing outlines can result in paper-thin walls that no printer can reproduce.' },
      { type: 'keyvalue', items: [
        { key: 'Spirograph', value: 'Thin lobes that taper to near-zero width. Higher petal count = thinner petals. Print as decorative display piece only.' },
        { key: 'SuperFormula', value: 'Extreme m/n values can produce very thin spikes or deeply concave indentations. Start with mild values and check the preview.' },
        { key: 'Astroid, Folium', value: 'Sharp cusps where the curve pinches to a point. The cusp areas will be extremely thin.' },
        { key: 'Rose, RationalRose', value: 'Many petals with deep valleys between them can create thin sections near the center.' },
        { key: 'Cycloid (Hypo)', value: 'Hypocycloid mode creates sharp inward cusps. Low cusp counts (2\u20133) have extreme thin points.' },
      ] },
      { type: 'tip', text: 'If you love a shape but it has thin areas, try increasing the radius, reducing the shape-specific parameters, or using it as a Top Shape morphed from a simpler Bottom Shape so only the rim has the complex outline.' },

      { type: 'heading', text: 'Self-Intersection' },
      { type: 'paragraph', text: 'Self-intersection happens when the vase surface folds through itself, creating overlapping geometry. The 3D preview may look odd (inside-out patches, dark flickering faces), and slicers may produce errors or failed prints.' },
      { type: 'paragraph', text: 'Common causes:' },
      { type: 'list', items: [
        'Deep textures on a small radius \u2014 if texture depth exceeds the vase radius, the surface pushes past the center and folds back on itself',
        'Large profile multiplier + deep textures \u2014 a wide flare (3\u20135\u00d7) at one height combined with deep grooves can overlap at narrow sections',
        'Aggressive XY Sway \u2014 large offsets can push one side of the vase through the opposite side',
        'Complex cross-section shapes (SuperFormula, Spirograph) with high parameter values \u2014 the shape itself may loop or cross over',
        'Thin wall thickness + deep inward textures \u2014 inner wall pushes past outer wall. Use Smooth Inner or increase Min Wall to prevent this',
      ] },
      { type: 'paragraph', text: 'Fixes: reduce texture depth, increase radius, lower the profile multiplier at problem heights, simplify the cross-section shape, or enable Smooth Inner for the inner wall. VaseMaker does not detect or prevent self-intersection \u2014 you are free to create any geometry, but the STL may not slice correctly for printing.' },

      { type: 'heading', text: 'Troubleshooting' },
      { type: 'list', items: [
        'Slicer shows holes or non-manifold: increase wall thickness or resolution',
        'Print is too fragile: increase wall thickness and base thickness',
        'Surface detail not visible: reduce wall thickness or increase texture depth',
        'File too large: lower resolution (especially radial)',
        'Complex shapes self-intersect: see Self-Intersection section above',
        'Textures not showing: make sure the master Textures toggle is on',
      ] },
    ],
  },
];
