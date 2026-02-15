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

## Vercel Deployment
Project name: **vasemaker** (gary-muhonens-projects). No git remote — deploy via Vercel CLI.
User will ask daily with "deploy to vercel" or similar.
```bash
cd VaseMakerWeb-project
vercel --prod
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
│   ├── svg-rasterizer.ts # SVG → grayscale pixels via canvas (browser-only, used by use-vase-mesh.ts)
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
4. Add radial ripple * vertical smoothing * radial smoothing * smoothZoneFactor
5. Add vertical ripple * vertical smoothing * radial smoothing * smoothZoneFactor
6. Add texture offsets (fluting, square flute, basket weave, voronoi, simplex, carved wood, SVG pattern) * smoothZoneFactor if textures master gate is on
7. Apply radial offset (−wallThickness for inner surface, clamped to MIN_INNER_RADIUS). When `smoothInner` is enabled, inner surface uses `computeRadius(skipEffects=true)` and enforces `minWallThickness` gap relative to textured outer surface
8. Convert polar → cartesian, add XY offset, apply twist rotation (bezier + wave twist)

When wallThickness > 0, `generateMesh()` produces: outer surface, inner surface (reversed winding), bottom cap (outer disc at z=0 + inner disc at inner start height), rim (flat or rounded), and cutout wall quads (if cutout enabled). Per-row data is precomputed into `RowContext` structs (includes `smoothZoneFactor`). Cutout skips triangles where `cutoutGrid` is true and adds manifold wall quads at hole boundaries.

## Implemented Features
- **25 cross-section shapes** with shape-specific parameter sliders, alphabetized in dropdown
- **Bezier profile curve editor** — interactive SVG, drag/add/remove control points (max 8)
- **Shape morphing** — Bottom Shape (always on) + Top Shape (header toggle controls morphing)
- **Radial & vertical ripples** with smoothing modifiers
- **Custom Twist** — BezierCurveEditor for twist degrees at each height
- **Wave Twist** — Sinusoidal twist that rotates entire cross-section via unified `twistAngle`
- **XY Sway** — Two BezierCurveEditors (X/Y offset) with scale sliders
- **Textures** — Master gate toggle (defaults OFF) + 7 individual textures: Fluting, Square Flute (flat-topped pillars with rectangular channels — square-wave version of Fluting, params: count/depth/duty/sharpness), Basket Weave, Voronoi (Worley noise), Simplex (fBm), Carved Wood (wobbled vertical stripes via simplex-perturbed sine, UI label "Carved Wood", engine param `woodGrain`), SVG Pattern (user-supplied SVG as displacement map). Seamless 0/360 wrapping, aspect-ratio-corrected cells. Reusable functions: `hash2D`, `simplex3D`, `fbm3D`. **Cutout mode** on Voronoi and SVG Pattern punches holes through the wall for lattice/perforated designs
- **Texture Cutout** — Per-texture `cutout` toggle (Voronoi + SVG Pattern only). Removes triangles from both outer and inner surfaces where cutout factor exceeds threshold, then generates manifold wall quads connecting outer↔inner at hole boundaries. `computeCutoutFactor()` evaluates voronoi cell value or SVG brightness with smoothstep threshold (0.3–0.7 remap). Cutout is suppressed in smooth zones (`smoothZoneFactor < 1`). Precomputed `cutoutGrid` boolean array avoids per-triangle recomputation. Index buffer is over-allocated then trimmed to actual triangle count. SVG cutout works best with high-contrast black/white images — grayscale produces unpredictable partial holes. Hole boundary smoothness depends on mesh resolution (150+ vert, 200+ radial for round holes)
- **Smooth Zones** — Global suppression of all surface effects (ripples + textures) near base and/or rim. `smoothZones.basePercent` and `rimPercent` (0–100%, auto-clamped so sum ≤ 100%) define zone heights as % of vase height. `transition` mode: `'hard'` = step function (0 inside, 1 outside), `'fade'` = smoothstep gradient across zone. `smoothZoneFactor` is precomputed per `RowContext` row and multiplied into all effect terms in `computeRadius()`. Shape, profile, and twist are NOT affected. Replaces the old hardcoded `cutoutSolidBand` formula — cutout now checks `smoothZoneFactor < 1` instead. Default 0%/0% = no suppression (backward compatible)
- **SVG Pattern texture** — Paste SVG from pattern sites (Hero Patterns, etc.) as radial displacement. Accepts raw SVG, data URLs, or CSS `background-image: url(...)` lines. Modal dialog with tiled preview, aspect-ratio-preserving rasterization via offscreen canvas, Gaussian blur anti-aliasing, bilinear interpolation sampling. Sliders: Repeat X (circumference tiles), Repeat Y (height tiles, max 60), Depth, Invert toggle. Architecture: `svg-rasterizer.ts` (browser-only DOM) rasterizes to grayscale `Uint8Array`; `mesh-generator.ts` stores pixel data at module level via `setSvgPatternData()` setter (keeps it DOM-free); `use-vase-mesh.ts` bridges async rasterization to synchronous mesh rebuild via version counter. Higher mesh resolution (100+ vertical/radial) recommended for fine patterns
- **Wall thickness, base cap, rim** — Outer + inner surfaces, base cap (no wall strip — avoids lip on flared profiles), flat/rounded rim. Base thickness measured vertically. **Smooth Inner** toggle keeps inner wall completely smooth (no ripples or textures) via `skipEffects=true`; **Min Wall** slider prevents paper-thin walls where effects indent inward
- **Undo/redo** — 50-step debounced history, ↶/↷ buttons + Cmd+Z/Cmd+Shift+Z
- **Save/Load** — JSON export/import, merges onto DEFAULT_PARAMETERS for forward-compat
- **Presets** — Dropdown with "Select a starting vase" placeholder, re-selectable
- **Header toggles** — On/off switch in section headers, independent of accordion open/close. Content always renders when expanded. Off-state toggle uses `#888`
- **Reset buttons** — All sections have reset to neutral defaults (independent of loaded preset). Profile resets to flat cylinder
- **Vase color picker** — Appearance section with native picker, default `#6d9fff`
- **Resolution** — Vertical (8–500) and Radial (8–720) sliders + Show Facets toggle. Defaults: 200 vertical, 360 radial. High resolution needed for dense textures (Square Flute 40+ count, fine Voronoi, SVG patterns). Info note in UI about file size vs. resolution trade-off
- **Sidebar UI** — Indented content with left border, Reset buttons always visible. Texture sub-sliders have second-level indentation with vertical border line
- **Tooltips** — Native browser tooltips (`title` attribute) on all sliders, toggles, and section headers. Provides brief descriptions of each parameter's effect without cluttering the UI
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
- **Image-Based Displacement** — Grayscale raster image (PNG/JPG) as radial displacement map (SVG Pattern covers SVG input)

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

Adding a texture follows a strict 6-file pattern. Use Voronoi and Simplex as reference implementations. (SVG Pattern is a special case — it adds `svg-rasterizer.ts` and async hooks in `use-vase-mesh.ts`.)

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

**c) Evaluate per-vertex** inside `computeRadius()`, in the `if (!skipEffects)` block, after existing textures:
```typescript
let myTextureVal = 0;
if (texturesEnabled && params.textures.myTexture?.enabled) {
  const mt = params.textures.myTexture;
  // compute value from t (angle 0-360), row.v (height 0-1), params
  myTextureVal = mt.depth * yourFunction(/* ... */);
}
```

**d) Add to the radius sum** (inside `computeRadius()` return statement, multiply by `szf`):
```typescript
return shapeValue * row.shapeRadius
  + /* ... existing terms ... */
  + myTextureVal * szf;
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
Three edits:

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

**c) Add toggle + sliders** (after the last texture block, before `</Section>`):
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

## Troubleshooting

### White screen with sidebar visible (recurring issue)
**Symptom:** Sidebar renders but the 3D viewport is blank white. Browser console shows 404 errors for `_next/static/chunks/*.js` and `layout.css`.

**Cause:** The `.next` build cache gets stale after multiple hot-reload cycles. The dev server references chunk hashes that no longer exist on disk.

**Fix:**
```bash
cd VaseMakerWeb-project
lsof -ti :3000 | xargs kill -9 2>/dev/null   # kill dev server
rm -rf .next                                   # clear stale cache
npm run dev                                    # restart clean
```
Then **hard refresh** the browser (Cmd+Shift+R) to clear cached chunk references.

**Note:** This is a Next.js dev server issue, not a code bug. If the white screen persists after clearing `.next`, then check for actual runtime errors in the browser console (e.g. TypeError from undefined params — see backward compat notes above).

## Carved Wood Texture (engine: `woodGrain`) — Iteration Notes

The current Carved Wood texture (v1) uses simplex-perturbed sine waves. It produces organic-looking patterns but NOT realistic flat-sawn wood grain with thin delicate vertical lines. Multiple algorithm approaches were tried:

- **v1 (current/kept):** Simplex-perturbed sine waves with 2 octaves of wobble, width variation via slow noise field, sharpness-controlled groove profile. Organic but blobby. User's best preset: count=43, depth=2.2, wobble=0.05, sharpness=0.1, seed=32
- **v2–v4:** Tried `abs(sin)^power` for narrow grooves, fractional power, V-groove thresholding — improved verticality but grooves still too wide
- **v5:** Domain-warped simplex noise with contour extraction — still blobby (noise is fundamentally isotropic)
- **v6:** 2D ring noise (sample noise on cos/sin circle) — still blobby
- **v7:** Sine-wave stripes with noise only for wobble + width variation — clean verticals but too regular/uniform
- **v8:** Per-stripe hash-based random width/depth + independent per-stripe wobble — better variation but still not thin delicate lines like real wood

**Key insight:** Simplex noise is inherently isotropic and cannot be forced into vertical lines regardless of anisotropic scaling or domain warping. The sine-wave approach (v7/v8) guarantees verticals but needs more work on making grooves thin/delicate with organic forking/merging.

**Future directions to explore:**
- Per-stripe 1D noise (each groove position = independent 1D noise function of height only)
- Line forking/merging: hash-based probability that a groove splits into 2 at certain heights
- Multi-scale: broad shallow channels with thin sharp lines within them
- Reference: aim for thin white indented lines like flat-sawn wood grain, where lines meander, fork, have variable width, and some are faint while others are pronounced

## Git Info
- Branch: master (main branch is "main")
