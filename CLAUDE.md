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

When wallThickness > 0, `generateMesh()` produces: outer surface, inner surface (reversed winding), bottom cap (two discs + wall strip), and rim (flat quad strip or rounded semicircular arc with RIM_STEPS=5 intermediate rings). Per-row data is precomputed into `RowContext` structs and shared via `computeVertex()` helper.

## Known Issues & Bugs Fixed
1. **next.config.ts** — Next.js 14 doesn't support .ts config. Renamed to next.config.mjs.
2. **deepMerge type error** — `presets/index.ts` had incompatible Record types. Fixed with proper generics.
3. **shapeOffsetY bug (OpenSCAD lines 1154-1161)** — Square1, SuperEllipse1, SuperFormula1 returned OffsetX where OffsetY was intended. FIXED in TS port by using per-shape params.
4. **Egg1 origin issue** — Origin sits on curve edge. Mitigated by default offsetY=-30. Low priority.
5. **Top shape offsets** — `mesh-generator.ts:58-59` only uses bottomParams offsets for center position. Same as OpenSCAD behavior. Could be improved to blend offsets during morph.

## Recently Completed
- **Simplex noise texture** — Organic/natural surface displacement using 3D simplex noise with fractal Brownian motion (fBm). From-scratch implementation (~120 lines, no npm dependency): `GRAD3` table (12 gradient vectors), `buildPermTable(seed)` (Fisher-Yates shuffled, 512 entries), `simplex3D()` (standard 4-corner tetrahedra evaluation), `fbm3D()` (multi-octave layering). Seamless 0/360 wrapping via mapping angle to cos/sin circle in 3D noise space — no special boundary logic needed. Perm table cached once per `generateMesh()` call, not per-vertex. Vertical scale auto-adjusts by aspect ratio for roughly square features. Params: Scale (1–50 feature size), Depth (0.05–5mm displacement), Octaves (1–6 detail layers), Persistence (0.1–0.9 amplitude decay), Lacunarity (1.5–3 frequency multiplier), Seed (0–99 pattern variation). Uses optional chaining for backward compat with old save files. UI in Textures section alongside Fluting, Basket Weave, and Voronoi.
- **Voronoi texture** — Cellular/organic surface pattern using Worley noise. Hash-based 2D algorithm (`hash2D` + `voronoiCell` in mesh-generator.ts) computes nearest/second-nearest seed distances with smoothstep edge detection. Params: Scale (5–50 cells around circumference), Depth (0.05–5mm emboss), Edge Width (0–1 sharpness), Seed (0–99 pattern variation). Vertical cell count auto-scales by aspect ratio for roughly square cells. Seamless at 0/360 boundary. Uses optional chaining for backward compat with old save files. UI in Textures section alongside Fluting and Basket Weave.
- **7 new shapes** — Astroid (pinched star), Folium (clover), Gear (mechanical cog), Limacon (unified cardioid family), Lissajous (multi-lobed), Rational Rose (overlapping petals), Spirograph (epitrochoid flowers). Each with tunable parameters and slider configs. Total: 25 shapes.
- **Undo/Redo** — 50-step history with ↶/↷ buttons next to "VaseMaker" title and Cmd+Z/Cmd+Shift+Z keyboard shortcuts. Debounced at 300ms so one slider drag = one undo step. History clears on preset load, reset, and file load. Custom implementation in `src/store/history.ts` using a separate Zustand store (no extra dependencies).
- **Vase color picker** — Appearance section (first in sidebar) with native color picker and green dot indicator when color differs from default. Color saved/loaded with design JSON, so each vase can have its own color. Default color (`#6d9fff`) configured in `APPEARANCE` export in shape-params.ts. Reset button appears when color differs from default.
- **Reset buttons & active indicators** — Each toggleable section has a Reset button (visible when enabled) that restores its values to defaults. Green dot on accordion headers shows which features are currently active — visible even when collapsed for quick scanning. Shape section dot indicates morph is on. Dimensions and Shell have no dot (always-on).
- **Resolution sliders & Show Facets** — Resolution section at bottom of sidebar with Vertical (8–200, default 60) and Radial (8–360, default 120) sliders, plus "Show Facets" toggle (`flatShading` param) for explicit control of flat vs smooth shading. Unified single resolution for both preview and export (WYSIWYG). Green dot when non-default. Reset button resets all three. Defaults and ranges in `RESOLUTION` export in shape-params.ts.
- **Wall thickness, base, and rim** — Full solid shell generation when wallThickness > 0. Outer + inner surfaces, solid base cap (outer disc + inner disc + connecting wall strip), and rim (flat or rounded half-torus). Inner surface uses reversed winding for correct inward normals. Base follows outer shell contour exactly (uses row 0 shape for both discs and inner surface start). Base disc also works when wallThickness = 0 (simple cap). UI: Shell section with Wall/Base sliders (0–5mm) and Flat/Rounded rim radio buttons. Defaults: wall 0.8mm, base 2mm, rounded rim. Config in `SHELL` export in shape-params.ts.
- **Save/Load design** — Save design as JSON file (user picks filename), Load merges onto DEFAULT_PARAMETERS for forward-compatibility with future features. Removed Reset button (redundant with "Simple Vase" preset).
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

## Important Notes
- The drei `Grid` component renders on XZ plane (Y-up) and its shader doesn't support rotation. We use a custom `GroundGrid` component that draws on XY plane (Z-up).
- Avoid `useFrame` with viewport/scissor manipulation in R3F — it can break the main scene render. The previous AxisGizmo implementation caused the vase to disappear.
- Avoid drei `Html` components for many labels — they create DOM overlays that can cause performance and rendering issues.
- OpenSCAD uses degrees for all trig; the TS port uses sinD/cosD/tanD helpers from math-utils.ts.
- The OpenSCAD `PointAlongBez()` uses Bernstein polynomial form; the TS `evaluateBezier()` uses de Casteljau. Both produce identical results.

## Git Info
- Branch: master (main branch is "main")
- Latest commit: 11800e9 — "Add Custom Twist and XY Sway curve editors"
