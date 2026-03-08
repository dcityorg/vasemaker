# VaseMakerWeb — Claude Code Context

## Project Overview
Browser-based parametric 3D vase designer, ported from a 13-version OpenSCAD project (VaseMaker13 A.scad). Uses polar cross-section shapes swept along a Bezier vertical profile with modulations (twist, smoothing, morphing, offset). Real-time 3D preview + STL export for 3D printing.

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

## "Save Code" Command
When the user says "Save Code", perform these steps in order:
1. **Update help** — Ensure `src/content/help-content.ts` reflects any new/changed features
2. **Increment version** — Bump the version by 0.001 in `src/components/editor/Sidebar.tsx` (always display 3 decimal digits, e.g. v0.901)
3. **Update CLAUDE.md** — Add/update any relevant sections (features, design decisions, etc.)
4. **Build check** — Run `npm run build` to catch type errors before committing
5. **Git commit** — Stage changed files and commit with a descriptive message (e.g. "v0.77: Add SVG paste/load/save buttons")
6. **Deploy to Vercel** — Run `vercel --prod` from `VaseMakerWeb-project/`

## Project Structure
```
VaseMakerWeb-project/src/
├── engine/              # Pure math — NO UI dependencies
│   ├── types.ts         # VaseParameters, ShapeType, VaseMesh interfaces
│   ├── shapes.ts        # 29 polar shape functions (shapeRegistry)
│   ├── bezier.ts        # De Casteljau Bezier evaluation
│   ├── modifiers.ts     # Twist, smoothing functions
│   ├── mesh-generator.ts # Main generateMesh() — vertex grid + triangle indices
│   ├── svg-rasterizer.ts # SVG → grayscale pixels via canvas (browser-only, used by use-vase-mesh.ts)
│   └── stl-export.ts    # Binary STL generation + browser download
├── content/
│   └── help-content.ts     # Structured help text (5 sections, pure data, no JSX)
├── components/
│   ├── editor/Editor.tsx    # Main layout (sidebar + viewport + optional help panel)
│   ├── editor/Sidebar.tsx   # Preset selector, save/load, undo/redo, STL export, help toggle
│   ├── editor/HelpPanel.tsx # Right-side help panel (accordion sections, slide-in animation)
│   ├── parameters/DimensionControls.tsx  # Thin wrapper composing all parameter sections
│   ├── parameters/ui.tsx                # Shared UI primitives (SliderRow, Section, GroupHeader, Toggle)
│   ├── parameters/ShapeControls.tsx     # Dimensions, Shell, Shape selection, Profile, XY Sway
│   ├── parameters/TextureControls.tsx   # All 13 textures + SVG dialog
│   ├── parameters/SmoothingControls.tsx # Smooth Zones, Radial/Vertical Smoothing
│   ├── parameters/TwistControls.tsx     # Custom Twist, Wave Twist
│   ├── parameters/SettingsControls.tsx  # Appearance, Resolution
│   ├── parameters/BezierCurveEditor.tsx # Reusable SVG curve editor (drag points, double-click add, right-click remove)
│   └── viewport/
│       ├── Viewport.tsx        # R3F Canvas, lighting, camera, controls
│       ├── VaseMesh.tsx        # Renders BufferGeometry from mesh data
│       ├── SceneHelpers.tsx    # Ground grid, axis rulers, origin indicator
│       ├── CaptureOverlay.tsx  # Frame overlay with corner resize handles
│       └── CaptureRenderer.tsx # Screenshot + crop capture (inside Canvas)
├── config/
│   ├── shape-params.ts  # All slider ranges (dimensions, shapes, ripples, twists, smoothing, textures)
│   ├── viewport.ts      # Camera, lighting, grid, axis colors/sizes
│   ├── colors.ts        # UI color palette — sidebar group colors + utility muted color
│   ├── capture.ts       # Image capture size presets and types
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
    ├── image-capture.ts # Download utilities (canvasToBlob, downloadImage, downloadBlob, saveDesignFile) with burst-limit cleanup
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

## The 29 Polar Shapes
All defined in `shapes.ts` as `(angleDegrees, ShapeParams) => radius`:

**Original 18 (from OpenSCAD):** Butterfly1, Cardioid1/2/3, Circle1, Diamond1, Egg1/2, Ellipse1, Heart1, Infinity1, Misc1, Polygon1, Rectangle1, Rose1, Square1, SuperEllipse1, SuperFormula1

**7 shapes (added early):** Astroid1, Folium1, Gear1, Limacon1, Lissajous1, RationalRose1, Spirograph1

**4 shapes (v0.85):** Cassini1 (pinched peanut oval, eccentricity param), Cycloid1 (epicycloid↔hypocycloid continuous blend, cusps + epi/hypo slider), Teardrop1 (asymmetric piriform, pointiness param), Nephroid1 (kidney/bean, indent param)

**Shape enhancements (v0.86):** Square1 and Rectangle1 now have a `rounding` parameter (0–1) for rounded corners. Uses `roundedRectPolar()` helper — ray-circle intersection at corner arcs with proper tangent-point region detection for clean flat-edge-to-arc transitions. At rounding=1, Square becomes a circle and Rectangle becomes an ellipse-like shape.

Note: OpenSCAD spells it "Cardiod" (typo) but the TS port uses "Cardioid".

## Modulation Pipeline (in mesh-generator.ts)
For each vertex at height v (0-1) and angle t (from `anglesForSteps` — arc-length-uniform):
1. Evaluate bottom shape (and top shape if morphing)
2. Blend shapes by height ratio if morphing enabled
3. Multiply by Bezier profile radius at this height
4. Add texture offsets (fluting, vertical fluting, square flute, vertical square flute, waves, vertical waves, rods, vertical rods, basket weave, voronoi, simplex, carved wood, SVG pattern) * verticalSmoothing * radialSmoothing * smoothZoneFactor if textures master gate is on
5. Apply radial offset (−wallThickness for inner surface, clamped to MIN_INNER_RADIUS). When `smoothInner` is enabled, inner surface uses `computeRadius(skipEffects=true)` and enforces `minWallThickness` gap relative to textured outer surface
6. Convert polar → cartesian, add XY offset, apply twist rotation (bezier + wave twist)

When wallThickness > 0, `generateMesh()` produces: outer surface, inner surface (reversed winding), bottom cap (outer disc at z=0 + inner disc at inner start height), rim (flat or rounded), and cutout wall quads (if cutout enabled). Per-row data is precomputed into `RowContext` structs (includes `smoothZoneFactor`, `anglesForSteps`, `perimeter`). Cutout skips triangles where `cutoutGrid` is true and adds manifold wall quads at hole boundaries.

## Arc-Length Parameterization (v0.89)
Vertices and textures use arc-length-uniform distribution instead of angle-uniform. This prevents texture stretching/distortion on non-circular shapes (Rectangle, Ellipse, Heart, etc.).

**How it works:** In `computeRowContexts()`, for each row: (1) compute cumulative chord lengths around the shape perimeter at uniform angle steps, (2) invert via binary search to get `anglesForSteps[tStep]` — the angle that places each vertex at equal surface distance. All vertex/radius functions use `row.anglesForSteps[tStep]` instead of `tStep * 360 / rRes`. Texture U coordinate is trivially `tStep / rRes`. Aspect-ratio correction uses actual `row.perimeter` instead of `2π * radius`.

**Key fields in RowContext:** `anglesForSteps: Float32Array` (per-tStep angle in degrees), `perimeter: number` (total perimeter in mm). **TextureContext:** `arcU: number` (= tStep/rRes), `perimeter: number`.

**Voronoi edge quality:** `voronoiCell()` in `noise.ts` uses wide transition zone (0.15–0.5 cell units) with power-curve shaping `t^(1/k)` (k=1+edgeWidth*4) for visually sharp edges without mesh aliasing. Old approach shrank the zone to 0.05 → sawtooth artifacts.

## Implemented Features
- **29 cross-section shapes** with shape-specific parameter sliders, alphabetized in dropdown
- **Bezier profile curve editor** — interactive SVG, drag/add/remove control points (max 8)
- **Shape morphing** — Bottom Shape (always on) + Top Shape (header toggle controls morphing)
- **Custom Twist** — BezierCurveEditor for twist degrees at each height
- **Wave Twist** — Sinusoidal twist that rotates entire cross-section via unified `twistAngle`
- **XY Sway** — Two BezierCurveEditors (X/Y offset) with scale sliders
- **Textures** — Master gate toggle (defaults OFF) + 13 individual textures. **Circumferential** (run vertically around the vase): Fluting (cosine-profile grooves), Square Flute (flat-topped pillars with rectangular channels, params: count/depth/duty/sharpness), Waves (smooth outward cosine² lobes, params: count/depth/duty), Rods (semicircular outward pillars via sqrt(1−x²) profile, params: count/depth/duty). **Vertical** (run horizontally as bands up the height): Vertical Fluting, Vertical Square Flute, Vertical Waves, Vertical Rods — identical algorithms to circumferential counterparts but using `row.m` (uniform parametric height) instead of angle; count min=1 for verticals. **Other**: Basket Weave, Voronoi (Worley noise), Simplex (fBm), Carved Wood (wobbled vertical stripes via simplex-perturbed sine, UI label "Carved Wood", engine param `woodGrain`), SVG Pattern (user-supplied SVG as displacement map). All textures are modulated by `verticalSmoothing * radialSmoothing * smoothZoneFactor`. Seamless 0/360 wrapping, aspect-ratio-corrected cells. Reusable functions: `hash2D`, `simplex3D`, `fbm3D`. **Cutout mode** on Voronoi and SVG Pattern punches holes through the wall for lattice/perforated designs
- **Texture Cutout** — Per-texture `cutout` toggle (Voronoi + SVG Pattern only). Removes triangles from both outer and inner surfaces where cutout factor exceeds threshold, then generates manifold wall quads connecting outer↔inner at hole boundaries. `computeCutoutFactor()` evaluates voronoi cell value or SVG brightness with smoothstep threshold (0.3–0.7 remap). Cutout is suppressed in smooth zones (`smoothZoneFactor < 1`). Precomputed `cutoutGrid` boolean array avoids per-triangle recomputation. Index buffer is over-allocated then trimmed to actual triangle count. SVG cutout works best with high-contrast black/white images — grayscale produces unpredictable partial holes. Hole boundary smoothness depends on mesh resolution (150+ vert, 200+ radial for round holes)
- **Smooth Zones** — Global suppression of all surface effects (textures) near base and/or rim. Has `enabled` toggle to quickly compare with/without. `smoothZones.basePercent` and `rimPercent` (0–100%, auto-clamped so sum ≤ 100%) define zone heights as % of vase height. `baseFade` and `rimFade` (0–100%) control what fraction of each zone is a smoothstep fade transition vs fully suppressed: 0% = hard cutoff (entire zone suppressed), 100% = full smoothstep ramp across zone, 50% = half hard/half fade. Fade sliders only appear when the corresponding zone percent > 0. `smoothZoneFactor` is precomputed per `RowContext` row and multiplied into all effect terms in `computeRadius()`. Shape, profile, and twist are NOT affected. Cutout checks `smoothZoneFactor < 1`. Default 0%/0% = no suppression (backward compatible)
- **SVG Pattern texture** — SVG as radial displacement. Three buttons: **Load SVG** (file picker for `.svg` files), **Save SVG** (downloads clean `.svg` for reuse), **Paste SVG** (dialog for pasting SVG code or CSS code from pattern sites). **Transform buttons** next to thumbnail: Rotate 90° CW (cycles 0→90→180→270), Flip Horizontal, Flip Vertical — transforms stored as `rotation`/`flipX`/`flipY` in params, applied as UV remapping in `sampleSvgPattern()`. Thumbnail shows single tile with transforms applied. Status indicator shows "SVG loaded" / "SVG empty". Paste dialog has Clear button to reset textarea before pasting new content. Accepts raw SVG markup `<svg>...</svg>`, data URLs, and CSS `background-image: url(...)` lines. Parser handles raw SVG with parentheses inside `url()` (Pattern Monster), percent-encoded `%23` → `#` references, and `width='100%'` percentage dimensions (stripped and replaced with pixel values). Modal dialog with tiled preview, aspect-ratio-preserving rasterization via offscreen canvas, Gaussian blur anti-aliasing, bilinear interpolation sampling. Sliders: Tiles Around (circumference tiles), Tiles Up (height tiles, fractional OK, min 0.1, max 60), Depth, Invert toggle. Architecture: `svg-rasterizer.ts` (browser-only DOM) rasterizes to grayscale `Uint8Array`; `mesh-generator.ts` stores pixel data at module level via `setSvgPatternData()` setter (keeps it DOM-free); `use-vase-mesh.ts` bridges async rasterization to synchronous mesh rebuild via version counter. Higher mesh resolution (100+ vertical/radial) recommended for fine patterns
- **Wall thickness, base cap, rim** — Outer + inner surfaces, base cap (no wall strip — avoids lip on flared profiles), flat/rounded rim. Base thickness measured vertically. **Smooth Inner** toggle keeps inner wall completely smooth (no textures) via `skipEffects=true`; **Min Wall** slider prevents paper-thin walls where effects indent inward. **Open bottom (base thickness = 0):** When `bottomThickness` is 0 and `wallThickness > 0`, a bottom ring annulus at z=0 connects the outer and inner walls to create a manifold mesh. This allows bottomless vases (e.g. for LED candles) — the slicer fills between the walls with plastic for structural strength
- **Undo/redo** — 50-step debounced history, ↶/↷ buttons + Cmd+Z/Cmd+Shift+Z
- **Save/Load** — JSON export/import, merges onto DEFAULT_PARAMETERS for forward-compat. **Unsaved changes protection**: `isDirty` flag in Zustand store tracks whether params changed since last load/save/preset. When dirty, selecting a preset or loading a design shows a confirmation dialog (Save & Continue / Don't Save / Cancel). Uses `skipNextDirtyMark()` flag pattern (same as `skipNextHistoryRecord`) to prevent subscriber from re-dirtying during load/preset/reset operations. Save Design and file load clear the dirty flag. All downloads (Save Design, Export STL, Save Image) share `downloadBlob`/`anchorDownload` cleanup logic in `image-capture.ts` — revokes previous object URL before creating new one to avoid Brave's ~16-download burst limit. Save Design uses `showSaveFilePicker` when available (Chrome/Edge) and reads back the chosen filename; falls back to anchor click (Brave/Firefox)
- **Editable design name** — Shown in sidebar header below version line. Click to rename. Used as filename for Save Design (`.json`), Save Image (`.png`/`.jpg`), and Export STL (`.stl`). Updated by Load Design (from filename), Save Design (from picker dialog in Chrome/Edge), and preset selection. `*` prefix shown in accent color when `isDirty`. Brave limitation: can't read back renamed filename from its built-in save dialog
- **Presets** — Dropdown with "Select a starting vase" placeholder, re-selectable
- **Header toggles** — On/off switch in section headers, independent of accordion open/close. Content always renders when expanded. Off-state toggle uses `#888`
- **Reset buttons** — All sections have reset to neutral defaults (independent of loaded preset). Profile resets to flat cylinder
- **Vase color picker** — Appearance section with native picker, default `#6d9fff`
- **Show Rulers** — Toggle in Appearance section to show/hide axis lines, tick marks, numeric dimension labels, and XYZ gizmo. Off by default for a clean view. Stored as `showRulers` in VaseParameters, read by Viewport.tsx to conditionally render SceneHelpers (AxisRulers, AxisLabels, AxisGizmo). **Dynamic scaling:** tick spacing, label spacing, ruler length, and grid size all adapt to vase dimensions via `niceSpacing()` helper (picks round intervals from [1,2,5]×10^n). Components receive `radius` and `height` from Viewport. GroundGrid always visible
- **Resolution** — Vertical (8–500) and Radial (8–720) sliders + Show Facets toggle. Defaults: 200 vertical, 360 radial. High resolution needed for dense textures (Square Flute 40+ count, fine Voronoi, SVG patterns). Info note in UI about file size vs. resolution trade-off
- **Sidebar UI** — Sections organized into 5 color-coded groups: Shape & Structure (blue `#7BA3CF`), Surface (amber `#C9A84C`), Smoothing (green `#7BAF7B`), Twist (purple `#A78BBA`), Settings (gray `#9B9B9B`). Group headers and section titles share the same color. Utility elements (preset dropdown, Load/Save buttons, shape dropdowns) use muted gray (`#9B9B9B`). All colors defined in `config/colors.ts` for easy customization. Indented content with left border, Reset buttons always visible. Texture sub-sliders have second-level indentation with vertical border line. Hint text on Vertical/Radial Smoothing sections clarifying they fade surface effect intensity
- **Tooltips** — Native browser tooltips (`title` attribute) on all sliders, toggles, and section headers. Provides brief descriptions of each parameter's effect without cluttering the UI
- **Help panel** — Right-side push-layout panel toggled by "?" button. 5 sections: Quick Start, Shapes (with SuperFormula guide), Profile/Twist/Sway, Textures, 3D Printing Tips. Pure data in `content/help-content.ts`, rendered by `HelpPanel.tsx`. Slide-in animation, viewport auto-resizes. Drag-resizable width (240–600px, default 320px) via left-edge drag handle
- **Image Capture** — Save viewport screenshots as PNG or JPG. Capture mode shows a resizable frame overlay on the viewport; user composes the shot by orbiting/zooming (controls pass through the frame via `pointer-events: none`), then saves the framed region at a chosen resolution. 7 size presets (640×480 to 2048×2048) plus custom dimensions. Architecture: `CaptureOverlay.tsx` (HTML layer with box-shadow dimming, corner drag handles for aspect-locked resizing), `CaptureRenderer.tsx` (inside Canvas, uses `preserveDrawingBuffer` + `drawImage` crop from main canvas for pixel-perfect color match). Rulers auto-hidden in captures. State is ephemeral (React useState in Editor, not Zustand). Canvas uses `alpha: false` to prevent premultiplied-alpha grey veil on export. Config in `src/config/capture.ts`, download utility in `src/lib/image-capture.ts`
- **Sidebar toolbar reorganization** — All file operations grouped in the toolbar area: Presets | Design Load/Save | Image Capture | Export STL, separated by 3px `#555` divider lines. Export STL and Capture Image use consistent muted grey button style. Image capture presets ordered portrait-first (tall vases), default 960×1280
- **Auto-scroll on section open** — When a collapsed section is opened near the bottom of the sidebar, it smoothly scrolls into view via `scrollIntoView({ block: 'nearest' })` on the `<details>` toggle event. Uses `requestAnimationFrame` to wait for layout before scrolling

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
- More presets, preset thumbnails/descriptions
- Export filename picker
- ~~DimensionControls.tsx component split~~ (done — split into ShapeControls, TextureControls, SmoothingControls, TwistControls, SettingsControls)
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

**d) Add to the radius sum** (inside `computeRadius()` return statement, multiply by smoothing factors):
```typescript
return shapeValue * row.shapeRadius
  + /* ... existing terms ... */
  + myTextureVal * row.vSmooth * rSmooth * szf;
```

**Key details for the algorithm:**
- `t` = angle in degrees (0–360), `row.v` = normalized height (0–1)
- `params.radius` and `params.height` = vase dimensions in mm
- Output is a radial offset in mm (positive = outward, negative = inward)
- **Seamless wrapping at 0/360:** Either map angle to cos/sin circle in higher-dimensional space (like Simplex does), or use integer cell wrapping (like Voronoi does)
- **Aspect ratio correction:** To get roughly square cells/features, compute `circumference = 2 * Math.PI * params.radius` and scale vertical dimension by `height / circumference`
- Use `?.` optional chaining on `params.textures.myTexture` for backward compat with old save files that don't have the field
- Existing reusable functions: `hash2D(ix, iy, seed)` returns `[0,1)` pair, `simplex3D(x,y,z,perm)` returns `[-1,1]`, `fbm3D(x,y,z,octaves,persistence,lacunarity,perm)` returns `[-1,1]`

### 6. `src/components/parameters/TextureControls.tsx` — UI controls
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

## Version
- Display version is in `src/components/editor/Sidebar.tsx` (search for "v0.")
- Remember to update it in each release commit

## Git Info
- Branch: master (main branch is "main")
