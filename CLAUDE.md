# VaseMakerWeb — Claude Code Context

## Project Overview
Browser-based parametric 3D vase designer, ported from a 13-version OpenSCAD project (VaseMaker13 A.scad). Uses polar cross-section shapes swept along a Bezier vertical profile with modulations (ripples, twist, smoothing, morphing, offset). Real-time 3D preview + STL export for 3D printing.

## Working Directory
- Root: `/Users/gary/Dropbox/Documents/Design/Claude/VaseMakerWeb`
- Next.js project: `VaseMakerWeb-project/` (run npm commands from here)
- OpenSCAD reference: `VaseMakerWeb-project/openscad code/`
- Documentation: `PRD.md`, `ARCHITECTURE.md`, `FEATURES.md` in root

## Tech Stack
- Next.js 14 (App Router), TypeScript, React 18
- Three.js via @react-three/fiber + @react-three/drei
- Zustand for state, Tailwind CSS for styling
- No backend (Phase 1 is fully client-side)

## Key Commands
```bash
cd VaseMakerWeb-project
npm run dev    # starts at localhost:3000
npm run build  # production build (use to check for type errors)
```

## Project Structure
```
VaseMakerWeb-project/src/
├── engine/              # Pure math — NO UI dependencies
│   ├── types.ts         # VaseParameters, ShapeType, VaseMesh interfaces
│   ├── shapes.ts        # 18 polar shape functions (shapeRegistry)
│   ├── bezier.ts        # De Casteljau Bezier evaluation
│   ├── modifiers.ts     # Ripple, twist, smoothing functions
│   ├── mesh-generator.ts # Main generateMesh() — vertex grid + triangle indices
│   └── stl-export.ts    # Binary STL generation + browser download
├── components/
│   ├── editor/Editor.tsx    # Main layout (sidebar + viewport)
│   ├── editor/Sidebar.tsx   # Preset selector, save/load, undo/redo, STL export
│   ├── parameters/DimensionControls.tsx  # ALL parameter UI (sliders, toggles, shape dropdowns)
│   ├── parameters/BezierCurveEditor.tsx # Reusable SVG curve editor (drag points, double-click add, right-click remove)
│   └── viewport/
│       ├── Viewport.tsx     # R3F Canvas, lighting, camera, controls
│       ├── VaseMesh.tsx     # Renders BufferGeometry from mesh data
│       └── SceneHelpers.tsx # Ground grid, axis rulers, origin indicator
├── config/
│   ├── shape-params.ts  # All slider ranges (dimensions, shapes, ripples, twists, smoothing)
│   ├── viewport.ts      # Camera, lighting, grid, axis colors/sizes
│   └── presets.ts       # Built-in preset definitions (data only)
├── store/vase-store.ts  # Zustand store — single source of truth for all params
│   ├── store/history.ts     # Undo/redo history (debounced, 50-step, separate Zustand store)
├── presets/
│   ├── defaults.ts      # DEFAULT_PARAMETERS with per-shape defaults
│   └── index.ts         # Preset type, applyPreset(), re-exports from config
├── hooks/
│   ├── use-vase-mesh.ts # Connects store → generateMesh → Three.js
│   └── use-debounce.ts  # Debounce utility (defined but not wired in yet)
└── lib/
    ├── math-utils.ts    # sinD, cosD, tanD, rad, deg, clamp, lerp
    └── constants.ts     # Default resolution/dimension values
```

## Architecture: Data Flow
```
User adjusts slider → Zustand store → useVaseMesh hook (useMemo) →
generateMesh() → Float32Array positions/normals + Uint32Array indices →
VaseMesh.tsx updates BufferGeometry → Three.js renders
```

## Coordinate System
- **Z is UP** (matching OpenSCAD convention)
- Vase bottom sits at Z=0 on the XY plane
- Camera positioned at [80, 80, 120] looking at [0, 0, 50]
- OrbitControls target is [0, 0, 50] (mid-height of default vase)

## The 25 Polar Shapes
All defined in `shapes.ts` as `(angleDegrees, ShapeParams) => radius`:

**Original 18 (from OpenSCAD):** Butterfly1, Cardioid1/2/3, Circle1, Diamond1, Egg1/2, Ellipse1, Heart1, Infinity1, Misc1, Polygon1, Rectangle1, Rose1, Square1, SuperEllipse1, SuperFormula1

**7 new shapes:** Astroid1 (pinched star, `power` param), Folium1 (three-lobed clover), Gear1 (teeth/depth/steepness), Limacon1 (a + b*cos, unifies cardioid family), Lissajous1 (freqA/freqB/phase), RationalRose1 (p/q ratio + center), Spirograph1 (bigR/smallR/penDist epitrochoid)

Note: OpenSCAD spells it "Cardiod" (typo) but the TS port uses "Cardioid".

## Modulation Pipeline (in mesh-generator.ts)
For each vertex at height v (0-1) and angle t (0-360):
1. Evaluate bottom shape (and top shape if morphing)
2. Blend shapes by height ratio if morphing enabled
3. Multiply by Bezier profile radius at this height
4. Add radial ripple * vertical smoothing * radial smoothing
5. Add vertical ripple * vertical smoothing * radial smoothing
6. Add Voronoi cellular texture offset (if enabled)
7. Add Simplex noise texture offset (if enabled)
8. Apply radial offset (−wallThickness for inner surface, clamped to MIN_INNER_RADIUS)
9. Convert polar → cartesian, add XY offset, apply Bezier twist rotation

When wallThickness > 0, `generateMesh()` produces: outer surface, inner surface (reversed winding), bottom cap (outer disc at z=0 + inner disc at inner start height), and rim (flat quad strip or rounded semicircular arc with RIM_STEPS=5 intermediate rings). Per-row data is precomputed into `RowContext` structs and shared via `computeVertex()` helper.

## Known Issues & Bugs Fixed
1. **next.config.ts** — Next.js 14 doesn't support .ts config. Renamed to next.config.mjs.
2. **deepMerge type error** — `presets/index.ts` had incompatible Record types. Fixed with proper generics.
3. **shapeOffsetY bug (OpenSCAD lines 1154-1161)** — Square1, SuperEllipse1, SuperFormula1 returned OffsetX where OffsetY was intended. FIXED in TS port by using per-shape params.
4. **Egg1 origin issue** — Origin sits on curve edge. Mitigated by default offsetY=-30. Low priority.
5. **Top shape offsets** — `mesh-generator.ts:58-59` only uses bottomParams offsets for center position. Same as OpenSCAD behavior. Could be improved to blend offsets during morph.

## Recently Completed
- **Base cap lip fix** — Removed the wall strip that connected outer disc (z=0) to inner disc, which created a visible flat lip on bell/flared profiles. Outer wall now follows the profile curve naturally to the ground. Inner disc seals the cavity at innerStartStep height using that row's actual shape. Inner surface first row also uses its natural row data instead of being overridden with row 0.
- **Sidebar UI polish** — Section content indented with left border (`px-4 ml-2 border-l-2`) for clear visual hierarchy. Reset buttons added to Dimensions (30/100), Shell (0.8mm/2mm/rounded), and Resolution (60/120/off) — always visible when expanded. Save/Load buttons moved to own row below preset dropdown with "Save Design"/"Load Design" labels.
- **Header toggles** — Moved enabled toggles from inside section content into the section header bar. Toggle and accordion open/close are independent — clicking the header text expands/collapses, clicking the toggle enables/disables. Content always renders when expanded (can adjust settings before enabling). Off-state toggle uses `#888` for visibility on hover.
- **Textures master gate** — `textures.enabled` boolean in VaseParameters gates all 4 texture evaluations in mesh-generator.ts. Header toggle on Textures section. Individual texture toggles preserved inside. Backward compat via `!== false` for old save files.
- **Shape section split** — "Shape" split into "Bottom Shape" (always on, no toggle) and "Top Shape" (header toggle controls morphing, `defaultOpen={false}`).
- **Wave Twist (renamed from Sine Twist)** — Now rotates the entire cross-section (shape, ripples, textures, everything) via the unified `twistAngle`, not just radial ripples. Removed the old ripple-only phase-shift path to prevent double-counting.
- **Preset dropdown fix** — Label changed to "Select a starting vase". Resets to placeholder after each selection so the same preset can be re-selected. Uses controlled `value=""` instead of `defaultValue`.
- **Default profile restored** — `DEFAULT_PARAMETERS.profilePoints` set to a classic vase curve (narrow base, wide middle, waist, flared top). Profile Reset goes to flat cylinder (all 1.0) — independent of presets. Presets inherit the vase curve from defaults.
- **Shape dropdown alphabetized** — All 25 shapes sorted A–Z by label in `SHAPE_OPTIONS`.
- **Simplex noise texture** — Organic/natural surface displacement using 3D simplex noise with fractal Brownian motion (fBm). From-scratch implementation (~120 lines, no npm dependency): `GRAD3` table (12 gradient vectors), `buildPermTable(seed)` (Fisher-Yates shuffled, 512 entries), `simplex3D()` (standard 4-corner tetrahedra evaluation), `fbm3D()` (multi-octave layering). Seamless 0/360 wrapping via mapping angle to cos/sin circle in 3D noise space — no special boundary logic needed. Perm table cached once per `generateMesh()` call, not per-vertex. Vertical scale auto-adjusts by aspect ratio for roughly square features. Params: Scale (1–50 feature size), Depth (0.05–5mm displacement), Octaves (1–6 detail layers), Persistence (0.1–0.9 amplitude decay), Lacunarity (1.5–3 frequency multiplier), Seed (0–99 pattern variation). Uses optional chaining for backward compat with old save files. UI in Textures section alongside Fluting, Basket Weave, and Voronoi.
- **Voronoi texture** — Cellular/organic surface pattern using Worley noise. Hash-based 2D algorithm (`hash2D` + `voronoiCell` in mesh-generator.ts) computes nearest/second-nearest seed distances with smoothstep edge detection. Params: Scale (5–50 cells around circumference), Depth (0.05–5mm emboss), Edge Width (0–1 sharpness), Seed (0–99 pattern variation). Vertical cell count auto-scales by aspect ratio for roughly square cells. Seamless at 0/360 boundary. Uses optional chaining for backward compat with old save files. UI in Textures section alongside Fluting and Basket Weave.
- **7 new shapes** — Astroid (pinched star), Folium (clover), Gear (mechanical cog), Limacon (unified cardioid family), Lissajous (multi-lobed), Rational Rose (overlapping petals), Spirograph (epitrochoid flowers). Each with tunable parameters and slider configs. Total: 25 shapes.
- **Undo/Redo** — 50-step history with ↶/↷ buttons next to "VaseMaker" title and Cmd+Z/Cmd+Shift+Z keyboard shortcuts. Debounced at 300ms so one slider drag = one undo step. History clears on preset load, reset, and file load. Custom implementation in `src/store/history.ts` using a separate Zustand store (no extra dependencies).
- **Vase color picker** — Appearance section (first in sidebar) with native color picker and green dot indicator when color differs from default. Color saved/loaded with design JSON, so each vase can have its own color. Default color (`#6d9fff`) configured in `APPEARANCE` export in shape-params.ts. Reset button appears when color differs from default.
- **Header toggles & section UI** — Toggleable sections have an on/off switch in the header bar (replaces the old green dots). Clicking the header text opens/closes the accordion; clicking the toggle enables/disables the feature — fully independent. Section content always renders when expanded regardless of toggle state, so users can preview/adjust settings before enabling. Reset buttons (right-aligned at top of content) restore feature values to neutral defaults independent of presets. Sections without toggles: Appearance (green dot for non-default color), Dimensions, Shell, Bottom Shape (always on), Resolution (green dot for non-default).
- **Resolution sliders & Show Facets** — Resolution section at bottom of sidebar with Vertical (8–200, default 60) and Radial (8–360, default 120) sliders, plus "Show Facets" toggle (`flatShading` param) for explicit control of flat vs smooth shading. Unified single resolution for both preview and export (WYSIWYG). Green dot when non-default. Reset button resets all three. Defaults and ranges in `RESOLUTION` export in shape-params.ts.
- **Wall thickness, base, and rim** — Full solid shell generation when wallThickness > 0. Outer + inner surfaces, base cap, and rim (flat or rounded half-torus). Inner surface uses reversed winding for correct inward normals. Base cap: outer disc at z=0 (closes bottom visually) + inner disc at innerStartStep height (seals inner cavity). No wall strip — the outer wall naturally follows the profile curve down to the ground, avoiding a flat lip on bell/flared shapes. Base thickness is measured vertically (z-axis); on steep/flared profiles, actual plastic thickness at edges tapers to wall thickness. Base disc also works when wallThickness = 0 (simple cap). UI: Shell section with Wall/Base sliders (0–5mm) and Flat/Rounded rim radio buttons. Defaults: wall 0.8mm, base 2mm, rounded rim. Config in `SHELL` export in shape-params.ts.
- **Save/Load design** — "Save Design" / "Load Design" buttons on their own row below the preset dropdown (visually separated — presets are starting points, save/load is your current work). Save exports as JSON file, Load merges onto DEFAULT_PARAMETERS for forward-compatibility with future features.
- **Custom Twist curve editor** — Replaced fixed-count twist sliders with interactive BezierCurveEditor. Drag points to set twist degrees at each height. Add/remove points with double-click/right-click.
- **XY Sway curve editors** — New sidebar section with two BezierCurveEditors (X and Y offset) plus Scale X/Y sliders. Uses adapter functions to bridge `[x,y][]` engine format with the curve editor's `BezierPoint[]` format.
- **Bezier profile curve editor** — Interactive SVG widget in sidebar. Drag control points, double-click to add (max 8), right-click to remove. Reusable component for future twist/offset editors.
- **Shape-specific parameter UI** — All 18 shapes have sliders for their specific params (polygon sides, rose petals, superformula m/n1/n2/n3, etc.)
- **Colored axis labels** — Canvas-texture sprites along each axis in dimmed R/G/B
- **Z-up orbit controls** — Mouse behavior matches OpenSCAD (left-drag rotates around Z)
- **Config extraction** — All slider ranges, viewport settings, and presets in `src/config/` for easy tweaking
- **Morph offset interpolation** — Top shape offsets now blend with height during morphing

## What's NOT Implemented Yet (Phase 1 gaps)

### Surface Textures — Ideas & Possibilities

**Highly Organic**
- **Reaction-Diffusion (Turing Patterns)** — The math behind animal skin patterns (leopard spots, zebra stripes, coral). Precompute a 2D Gray-Scott simulation grid, sample as displacement. Computationally heavier but stunning organic results.
- **Domain-Warped Noise** — Feed noise coordinates through *another* noise function before evaluating. Creates swirling, marbled, almost fluid-like distortions. Very alien/organic. Can build on the existing simplex3D/fbm3D implementation in mesh-generator.ts.

**Geometric but Natural-Looking**
- **Scales / Fish Scale** — Overlapping circles in a staggered grid. Each scale is a radial bump offset per row (similar math to basket weave but with circular falloff). Looks like pinecones, dragon skin, roof tiles. Params: rows, columns, depth, overlap.
- **Hexagonal Cells (Honeycomb)** — Like Voronoi but perfectly regular hex grid. Raised hexagons with flat gaps, or inverse (sunken dimples). Clean geometric counterpart to Voronoi's randomness. Params: scale, depth, gap width.
- **Brick / Staggered Grid** — Rectangular cells with alternating row offsets. With rounded edges looks like woven bamboo or stone wall. Params: rows, columns, depth, gap, stagger.

**Mathematical / Decorative**
- **Moire / Interference** — Multiply two sine waves at slightly different frequencies. Creates beautiful beating patterns with organic-looking nodes and antinodes. Params: freq1, freq2, depth.
- **Truchet Tiling** — Divide surface into grid, randomly rotate quarter-circle arcs per cell. Creates maze-like flowing curves. Params: scale, depth, seed.
- **Lissajous Surface** — `sin(a*t + phase) * sin(b*v)` with tunable frequency ratios. At irrational ratios produces non-repeating organic interference. Params: freqA, freqB, phase, depth.
- **Wavelet/Ripple Interference** — Multiple point sources of circular ripples at random positions, summed together. Like pond surface in rain. Params: sources, frequency, depth, seed.
- **Additive Sine Noise** — Layer sine waves at irrational frequency ratios for organic texture.
- **Image-Based Displacement** — Upload grayscale image as radial displacement map.

### UI & UX
- **Dimension annotations** — Show mm dimensions on the 3D preview (height, diameter)
- **More presets** — Add interesting built-in designs showcasing what's possible
- **Preset thumbnails/descriptions** — Make preset dropdown more discoverable
- **Export filename** — Let user pick filename before STL download
- **Component split** — DimensionControls.tsx handles everything; planned to split into smaller files
- **Fixed-position XYZ gizmo** — Corner orientation widget (had rendering issues before)

### Technical
- **Wall thickness edge cases** — Very thin walls on complex shapes may cause inner surface self-intersection despite MIN_INNER_RADIUS clamp
- **Debouncing** — use-debounce.ts exists but useVaseMesh uses raw useMemo
- **shadcn/ui** — Not installed; using native HTML inputs
- **ui-store.ts** — No UI state management yet

## Design Decisions
- **Transform sliders removed from UI** — The per-shape `scaleFactor`, `offsetX`, `offsetY` sliders (the "Transform" section) were removed from the Shape UI. Reasoning: (1) `scaleFactor` is redundant with the Radius slider in Dimensions — it's just another multiplier on the shape radius. (2) `offsetX`/`offsetY` shift the shape center off-origin, which is only needed to compensate for math formulas that aren't naturally centered (Heart1, Egg1, Cardioid1, etc.) — those offsets are already baked into the default values. Users have no practical reason to shift shapes off-center (vases should stay centered for 3D printing). The data fields still exist in `ShapeParams` and `defaults.ts`, and the values are still saved/loaded in JSON files. The `UNIVERSAL_PARAMS` config still exists in `shape-params.ts`. To restore: re-import `UNIVERSAL_PARAMS` in `DimensionControls.tsx` and add back the Transform `<div>` block inside `ShapeParamControls` (render `UNIVERSAL_PARAMS.map(...)` sliders below the shape-specific sliders).
- **Fixed offset UI skipped** — `fixedOffset` (constant X/Y shift at all heights) exists in the engine but no UI was built. It's redundant now that XY Sway can do the same thing, and there's no practical reason to shift the entire vase off the origin (it should stay centered for 3D printing).
- **Reset = neutral defaults, not preset values** — All feature Reset buttons restore hardcoded neutral values from `DEFAULT_PARAMETERS` (or flat profile for Profile), independent of which preset was loaded. Presets = "give me a designed starting point"; Reset = "return this feature to neutral". This is predictable and consistent.
- **Base cap without wall strip** — The bottom cap no longer includes a wall strip connecting outer disc (z=0) to inner disc. On bell/flared profiles this created an ugly flat lip. The outer wall now follows the profile curve naturally to the ground. Trade-off: base thickness is measured vertically, so steep profiles have less plastic at the edges — this is acceptable and the user controls the profile shape.

## How to Add a New Texture (Recipe)

Adding a texture follows a strict 6-file pattern. Use Voronoi and Simplex as reference implementations.

### 1. `src/engine/types.ts` — Define the parameter shape
Add a new entry to `VaseParameters.textures`:
```typescript
myTexture: {
  enabled: boolean;
  // your params here (scale, depth, seed, etc.)
};
```

### 2. `src/presets/defaults.ts` — Set defaults
Add to the `textures` object in `DEFAULT_PARAMETERS`:
```typescript
myTexture: { enabled: false, scale: 10, depth: 1.0, /* ... */ },
```

### 3. `src/config/shape-params.ts` — Define slider ranges
Add to the `TEXTURES` object:
```typescript
myTexture: {
  scale: { min: 1, max: 50, step: 1 } as SliderRange,
  // one entry per slider
},
```

### 4. `src/store/vase-store.ts` — Add store action
Two edits — interface declaration and implementation:
```typescript
// In VaseStore interface:
setMyTexture: (update: Partial<VaseParameters['textures']['myTexture']>) => void;

// In create<VaseStore>:
setMyTexture: (update) =>
  set((state) => ({
    params: {
      ...state.params,
      textures: {
        ...state.params.textures,
        myTexture: { ...state.params.textures.myTexture, ...update },
      },
    },
  })),
```

### 5. `src/engine/mesh-generator.ts` — The algorithm
This is the core math work. The pattern:

**a) Add algorithm functions** before `generateMesh()`:
- Your noise/pattern function(s)
- Any lookup tables, helper functions
- Keep it pure math, no dependencies on UI or store

**b) Cache expensive setup** at the top of `generateMesh()`:
```typescript
const myPerm = params.textures.myTexture?.enabled
  ? buildSomethingExpensive(params.textures.myTexture.seed)
  : null;
```
This runs once per mesh rebuild, not per-vertex.

**c) Evaluate per-vertex** inside `computeVertex()`, after existing textures:
```typescript
let myTextureVal = 0;
if (params.textures.myTexture?.enabled) {
  const mt = params.textures.myTexture;
  // compute value from t (angle 0-360), row.v (height 0-1), params
  myTextureVal = mt.depth * yourFunction(/* ... */);
}
```

**d) Add to the radius sum:**
```typescript
let radius = shapeValue * row.shapeRadius
  + /* ... existing terms ... */
  + myTextureVal;
```

**Key details for the algorithm:**
- `t` = angle in degrees (0–360), `row.v` = normalized height (0–1)
- `params.radius` and `params.height` = vase dimensions in mm
- Output is a radial offset in mm (positive = outward, negative = inward)
- **Seamless wrapping at 0/360:** Either map angle to cos/sin circle in higher-dimensional space (like Simplex does), or use integer cell wrapping (like Voronoi does)
- **Aspect ratio correction:** To get roughly square cells/features, compute `circumference = 2 * Math.PI * params.radius` and scale vertical dimension by `height / circumference`
- Use `?.` optional chaining on `params.textures.myTexture` for backward compat with old save files that don't have the field
- Existing reusable functions: `hash2D(ix, iy, seed)` returns `[0,1)` pair, `simplex3D(x,y,z,perm)` returns `[-1,1]`, `fbm3D(x,y,z,octaves,persistence,lacunarity,perm)` returns `[-1,1]`

### 6. `src/components/parameters/DimensionControls.tsx` — UI controls
Four edits:

**a) Destructure the setter:**
```typescript
const { /* ...existing... */, setMyTexture } = useVaseStore();
```

**b) Add reset helper:**
```typescript
const resetMyTexture = () => setMyTexture({
  scale: DEFAULT_PARAMETERS.textures.myTexture.scale,
  // ... all params except enabled
});
```

**c) Update Textures section `active` prop:**
```typescript
active={/* ...existing... */ || params.textures.myTexture?.enabled}
```

**d) Add toggle + sliders** (after the last texture block, before `</Section>`):
```typescript
<Toggle label="My Texture" checked={params.textures.myTexture?.enabled ?? false}
  onChange={(v) => setMyTexture({ enabled: v })} onReset={resetMyTexture} />
{params.textures.myTexture?.enabled && (
  <>
    <SliderRow label="Scale" value={params.textures.myTexture.scale}
      {...TEXTURES.myTexture.scale} onChange={(v) => setMyTexture({ scale: v })} />
    {/* ... more sliders ... */}
  </>
)}
```

### Verification checklist
1. `npx tsc --noEmit` — clean compile
2. Toggle on — texture visible on vase
3. Each slider changes the appearance as expected
4. No visible seam at 0/360 boundary
5. Stacks with other textures (fluting, basket weave, voronoi, simplex)
6. Save/Load — old JSON files without the new texture still load correctly
7. Undo/redo works with the new sliders

## Important Notes
- The drei `Grid` component renders on XZ plane (Y-up) and its shader doesn't support rotation. We use a custom `GroundGrid` component that draws on XY plane (Z-up).
- Avoid `useFrame` with viewport/scissor manipulation in R3F — it can break the main scene render. The previous AxisGizmo implementation caused the vase to disappear.
- Avoid drei `Html` components for many labels — they create DOM overlays that can cause performance and rendering issues.
- OpenSCAD uses degrees for all trig; the TS port uses sinD/cosD/tanD helpers from math-utils.ts.
- The OpenSCAD `PointAlongBez()` uses Bernstein polynomial form; the TS `evaluateBezier()` uses de Casteljau. Both produce identical results.

## Git Info
- Branch: master (main branch is "main")
- Latest commit: 11800e9 — "Add Custom Twist and XY Sway curve editors"
