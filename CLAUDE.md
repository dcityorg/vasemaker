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
│   ├── shapes.ts        # 25 polar shape functions (shapeRegistry)
│   ├── bezier.ts        # De Casteljau Bezier evaluation
│   ├── modifiers.ts     # Ripple, twist, smoothing functions
│   ├── mesh-generator.ts # Main generateMesh() — vertex grid + triangle indices
│   └── stl-export.ts    # Binary STL generation + browser download
├── content/
│   └── help-content.ts     # Structured help text (5 sections, pure data, no JSX)
├── components/
│   ├── editor/Editor.tsx    # Main layout (sidebar + viewport + optional help panel)
│   ├── editor/Sidebar.tsx   # Preset selector, save/load, undo/redo, STL export, help toggle
│   ├── editor/HelpPanel.tsx # Right-side help panel (accordion sections, slide-in animation)
│   ├── parameters/DimensionControls.tsx  # ALL parameter UI (sliders, toggles, shape dropdowns)
│   ├── parameters/BezierCurveEditor.tsx # Reusable SVG curve editor (drag points, double-click add, right-click remove)
│   └── viewport/
│       ├── Viewport.tsx     # R3F Canvas, lighting, camera, controls
│       ├── VaseMesh.tsx     # Renders BufferGeometry from mesh data
│       └── SceneHelpers.tsx # Ground grid, axis rulers, origin indicator
├── config/
│   ├── shape-params.ts  # All slider ranges (dimensions, shapes, ripples, twists, smoothing, textures)
│   ├── viewport.ts      # Camera, lighting, grid, axis colors/sizes
│   └── presets.ts       # Built-in preset definitions (data only)
├── store/
│   ├── vase-store.ts    # Zustand store — single source of truth for all params
│   └── history.ts       # Undo/redo history (debounced, 50-step, separate Zustand store)
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

## The 25 Polar Shapes
All defined in `shapes.ts` as `(angleDegrees, ShapeParams) => radius`:

**Original 18 (from OpenSCAD):** Butterfly1, Cardioid1/2/3, Circle1, Diamond1, Egg1/2, Ellipse1, Heart1, Infinity1, Misc1, Polygon1, Rectangle1, Rose1, Square1, SuperEllipse1, SuperFormula1

**7 new shapes:** Astroid1, Folium1, Gear1, Limacon1, Lissajous1, RationalRose1, Spirograph1

Note: OpenSCAD spells it "Cardiod" (typo) but the TS port uses "Cardioid".

## Modulation Pipeline (in mesh-generator.ts)
For each vertex at height v (0-1) and angle t (0-360):
1. Evaluate bottom shape (and top shape if morphing)
2. Blend shapes by height ratio if morphing enabled
3. Multiply by Bezier profile radius at this height
4. Add radial ripple * vertical smoothing * radial smoothing
5. Add vertical ripple * vertical smoothing * radial smoothing
6. Add texture offsets (fluting, basket weave, voronoi, simplex, wood grain) if textures master gate is on
7. Apply radial offset (−wallThickness for inner surface, clamped to MIN_INNER_RADIUS). When `smoothInner` is enabled, inner surface uses `computeRadius(skipTextures=true)` and enforces `minWallThickness` gap relative to textured outer surface
8. Convert polar → cartesian, add XY offset, apply twist rotation (bezier + wave twist)

When wallThickness > 0, `generateMesh()` produces: outer surface, inner surface (reversed winding), bottom cap (outer disc at z=0 + inner disc at inner start height), and rim (flat or rounded). Per-row data is precomputed into `RowContext` structs.

## Implemented Features
- **25 cross-section shapes** with shape-specific parameter sliders, alphabetized in dropdown
- **Bezier profile curve editor** — interactive SVG, drag/add/remove control points (max 8)
- **Shape morphing** — Bottom Shape (always on) + Top Shape (header toggle controls morphing)
- **Radial & vertical ripples** with smoothing modifiers
- **Custom Twist** — BezierCurveEditor for twist degrees at each height
- **Wave Twist** — Sinusoidal twist that rotates entire cross-section via unified `twistAngle`
- **XY Sway** — Two BezierCurveEditors (X/Y offset) with scale sliders
- **Textures** — Master gate toggle + 5 individual textures: Fluting, Basket Weave, Voronoi (Worley noise), Simplex (fBm), Wood Grain (wobbled vertical stripes via simplex-perturbed sine). Seamless 0/360 wrapping, aspect-ratio-corrected cells. Reusable functions: `hash2D`, `simplex3D`, `fbm3D`
- **Wall thickness, base cap, rim** — Outer + inner surfaces, base cap (no wall strip — avoids lip on flared profiles), flat/rounded rim. Base thickness measured vertically. **Smooth Inner** toggle keeps inner wall texture-free; **Min Wall** slider prevents paper-thin walls where textures indent inward
- **Undo/redo** — 50-step debounced history, ↶/↷ buttons + Cmd+Z/Cmd+Shift+Z
- **Save/Load** — JSON export/import, merges onto DEFAULT_PARAMETERS for forward-compat
- **Presets** — Dropdown with "Select a starting vase" placeholder, re-selectable
- **Header toggles** — On/off switch in section headers, independent of accordion open/close. Content always renders when expanded. Off-state toggle uses `#888`
- **Reset buttons** — All sections have reset to neutral defaults (independent of loaded preset). Profile resets to flat cylinder
- **Vase color picker** — Appearance section with native picker, default `#6d9fff`
- **Resolution** — Vertical (8–200) and Radial (8–360) sliders + Show Facets toggle
- **Sidebar UI** — Indented content with left border, Reset buttons always visible. Texture sub-sliders have second-level indentation with vertical border line
- **Help panel** — Right-side push-layout panel toggled by "?" button. 5 sections: Quick Start, Shapes (with SuperFormula guide), Profile/Twist/Sway, Textures, 3D Printing Tips. Pure data in `content/help-content.ts`, rendered by `HelpPanel.tsx`. Slide-in animation, viewport auto-resizes

## What's NOT Implemented Yet

### Surface Texture Ideas
- **Reaction-Diffusion** — Gray-Scott simulation for animal skin patterns
- **Domain-Warped Noise** — Noise fed through noise for swirling/marbled effects
- **Scales / Fish Scale** — Overlapping circles in staggered grid
- **Hexagonal Cells** — Regular hex grid (geometric counterpart to Voronoi)
- **Brick / Staggered Grid** — Rectangular cells with row offsets
- **Moire / Interference** — Two sine waves at slightly different frequencies
- **Truchet Tiling** — Randomly rotated quarter-circle arcs per cell
- **Lissajous Surface** — `sin(a*t + phase) * sin(b*v)` interference
- **Wavelet/Ripple Interference** — Multiple point sources summed
- **Image-Based Displacement** — Grayscale image as radial displacement map

### UI & UX
- Dimension annotations on 3D preview
- More presets, preset thumbnails/descriptions
- Export filename picker
- DimensionControls.tsx component split
- Fixed-position XYZ gizmo

### Technical
- Wall thickness edge cases (self-intersection on complex shapes)
- Debouncing (use-debounce.ts exists but not wired in)

## Design Decisions
- **Transform sliders removed from UI** — `scaleFactor`/`offsetX`/`offsetY` removed from Shape UI (redundant with Radius; offsets baked into defaults). Data fields still exist. To restore: re-import `UNIVERSAL_PARAMS` and add Transform block in `ShapeParamControls`.
- **Fixed offset UI skipped** — `fixedOffset` exists in engine but no UI. Redundant with XY Sway.
- **Reset = neutral defaults, not preset values** — Predictable: presets = designed starting points, Reset = return to neutral.
- **Base cap without wall strip** — Outer wall follows profile curve to ground naturally. Trade-off: steep profiles have less plastic at edges.

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

**c) Evaluate per-vertex** inside `computeRadius()`, in the `if (!skipTextures)` block, after existing textures:
```typescript
let myTextureVal = 0;
if (texturesEnabled && params.textures.myTexture?.enabled) {
  const mt = params.textures.myTexture;
  // compute value from t (angle 0-360), row.v (height 0-1), params
  myTextureVal = mt.depth * yourFunction(/* ... */);
}
```

**d) Add to the radius sum** (inside `computeRadius()` return statement):
```typescript
return shapeValue * row.shapeRadius
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
  <div className="ml-2 pl-3 border-l-2 border-[var(--border-color)]">
    <SliderRow label="Scale" value={params.textures.myTexture.scale}
      {...TEXTURES.myTexture.scale} onChange={(v) => setMyTexture({ scale: v })} />
    {/* ... more sliders ... */}
  </div>
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
- The drei `Grid` component renders on XZ plane (Y-up) and its shader doesn't support rotation. We use a custom `GroundGrid` that draws on XY plane (Z-up).
- Avoid `useFrame` with viewport/scissor manipulation in R3F — breaks main scene render.
- Avoid drei `Html` components for many labels — DOM overlay performance issues.
- OpenSCAD uses degrees for all trig; the TS port uses sinD/cosD/tanD helpers from math-utils.ts.

## Git Info
- Branch: master (main branch is "main")
