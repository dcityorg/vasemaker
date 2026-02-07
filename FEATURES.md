# VaseMakerWeb — Feature Backlog and Ideas

This is the living reference of all feature ideas, organized by category. Items are roughly prioritized within each section (higher = sooner). We pull from this when planning what to build next.

---

## Existing Features (Port from OpenSCAD v13A)

These must all be implemented in Phase 1 to reach feature parity with the OpenSCAD version.

### Cross-Section Shapes (18 total)

All shapes are polar equations: `r = f(theta)` with per-shape parameters for scale, offset, and shape-specific controls.

| Shape | Formula Type | Parameters | Notes |
|-------|-------------|------------|-------|
| Circle1 | `r = scale` | scaleFactor | Simplest base shape |
| Cardioid1 | `r = scale * (1 - sin(t))` | scaleFactor, offsetX, offsetY | Sharp indentation |
| Cardioid2 | `r = scale * 0.5 * (5 - 4*cos(t))` | scaleFactor, offsetX, offsetY | Smoother, Gary's favorite |
| Cardioid3 | `r = scale * sqrt(...)` | scaleFactor, offsetX, offsetY | Smooth with +3 offset term |
| Butterfly1 | Multi-term trig sum | scaleFactor, offsetX, offsetY | Complex 8-lobed shape |
| Diamond1 | `r = 1 / (abs(cos/sx) + abs(sin/sy))` | scaleFactor, scaleX, scaleY, offsets | L1 norm shape |
| Egg1 | `r = 2 * scale * sin(t)^width` | scaleFactor, width, offsets | Width controls narrowness |
| Egg2 | `r = scale * (cos^2(t) + a*cos(t) + b)` | scaleFactor, a, b, offsets | Different egg parametrization |
| Ellipse1 | Standard polar ellipse | scaleFactor, scaleX, scaleY, offsets | Stretched circle |
| Heart1 | `r = scale * abs(t-180)/180` | scaleFactor, offsets | Triangular heart (V-shape) |
| Infinity1 | Hippopede `r = sqrt(2*(p - sin^2(t)))` | scaleFactor, parameter1, offsets | Figure-eight / lemniscate variant |
| Misc1 | `r = scale * sqrt(complex expr)` | scaleFactor, a, b, offsets | Unusual asymmetric shape |
| Polygon1 | `r = cos(pi/n) / cos(t - 2pi/n * floor(...))` | scaleFactor, sides, offsets | Regular n-gon |
| Rectangle1 | `r = min(sx/|cos|, sy/|sin|)` | scaleFactor, scaleX, scaleY, offsets | Axis-aligned rectangle |
| Rose1 | `r = scale * (center + cos(n*t)) / (1+center)` | scaleFactor, centerSize, petalNumber, offsets | Rhodonea with center offset |
| Square1 | `r = min(1/|cos|, 1/|sin|)` | scaleFactor, offsets | Special case of Rectangle |
| SuperEllipse1 | `r = (|cos/a|^n + |sin/b|^n)^(-1/n)` | scaleFactor, n, scaleX, scaleY, offsets | Squircle family |
| SuperFormula1 | Gielis superformula | scaleFactor, a, b, m, n1, n2, n3, offsets | Extremely versatile |

### Vertical Profile
- Bezier curve with 2–8 control points defining radius multiplier vs. height fraction
- Control points: [radiusMultiplier, heightFraction] where height 0 = bottom, 1 = top

### Morphing
- Linear blend between bottom and top shape functions over height
- `blendedRadius = bottomShape(t) * (1-v) + topShape(t) * v`

### Modulation Features
- **Radial Ripples:** `depth * sin((t + twist(v)) * count)` — star-petal pattern
- **Vertical Ripples:** `depth * cos(v * 360 * count)` — horizontal bands
- **Bezier Twist:** rotation in degrees at each height, controlled by Bezier curve (2–8 points)
- **Sine Wave Twist:** alternating twist cycles with max angle
- **Vertical Smoothing:** cosine fade of ripple depth over height, with adjustable start position
- **Radial Smoothing:** cosine fade of ripple depth around circumference, with offset angle

### Offset
- Fixed XY offset (shifts entire vase off-center for asymmetric twist effects)
- Bezier XY offset (XY shift varies with height via Bezier curve)

---

## New Features — Phase 1 Enhancements

These go beyond OpenSCAD parity and are planned for the Phase 1 web release.

### Shell / Wall Thickness (HIGH PRIORITY)
- Generate inner surface at `radius - wallThickness`
- Stitch top and bottom edges to create closed, manifold mesh
- Bottom cap option (flat disc closing the bottom)
- This was never achieved in OpenSCAD (commented-out `minkowski` attempt was too slow)

### Improved Morph Curve
- Replace linear `(1-v)` morph with a configurable easing function
- Options: linear, ease-in, ease-out, ease-in-out, step, or custom Bezier
- Allows holding the bottom shape longer then transitioning quickly, or vice versa

### Multi-Stage Morph
- Chain multiple shapes at different heights: e.g., Circle at 0%, Star at 33%, Heart at 66%, Circle at 100%
- Each transition uses the morph easing function
- Vase "tells a story" as your eye moves upward

### Preview Quality
- Wireframe overlay toggle
- Color / material picker (for visual appeal in preview, not functional)
- Ground plane with soft shadow
- Environment lighting (HDR)

### Preset System
- Import the existing OpenSCAD JSON parameter sets as built-in presets
- Save/load to browser storage
- Export as JSON file
- Import JSON file
- Randomize button — generates random but aesthetically constrained parameters

---

## New Shapes to Add

These are polar equations not in the original OpenSCAD version, chosen for interesting vase cross-sections.

### High Priority

**Spirograph / Epitrochoid**
`r = sqrt((R+r)^2 + d^2 - 2*d*(R+r)*cos((R+r)/r * t))` — classic Spirograph flower patterns, highly tunable with R, r, d parameters. Would make beautiful fluted vases.

**Astroid**
`r = cos(t)^(2/3)` — pinched four-pointed star with concave sides. Elegant, distinctive.

**Generalized Rhodonea (Rational Rose)**
`r = cos(p/q * t)` where p/q is a rational fraction (3/2, 5/3, 7/4). Produces roses with overlapping petals, much more complex than integer-petal roses. Creates intricate, almost woven-looking vases.

**Limacon Family**
`r = a + b*cos(t)` — unifies cardioid (a=b), dimpled limacon, looped limacon into one shape with a ratio parameter. More flexible than having three separate cardioid variants.

### Medium Priority

**Lissajous (Polar)**
Convert `x = sin(a*t), y = sin(b*t + phase)` to `r = sqrt(x^2 + y^2)`. Ratios like 3/2 or 5/4 produce complex flowing multi-lobed shapes.

**Folium**
`r = cos(t) * (4*sin(t)^2 - 1)` — three-lobed clover.

**Gear / Cog**
`r = 1 + depth * tanh(k * sin(n*t))` — steep-sided bumps that approximate a gear profile. Mechanical-looking vases. The `tanh` provides smooth transitions versus a hard `sign()`.

**Cissoid of Diocles**
`r = sin(t) * tan(t)` — asymmetric teardrop.

### Low Priority / Experimental

**Watt's Curve** — figure-eight family related to mechanical linkages.

**Kampyle of Eudoxus** — `r = sec(t)^2` variant — open curve, would need clamping.

**Fermat's Spiral** (as a radial modulation, not a cross-section) — could create a spiral groove pattern on the surface.

---

## Surface Texture Ideas

These add high-frequency detail to the vase surface. All would be implemented as additional terms in `findRadius()`.

### Additive Sine Noise (EASIEST — do first)
Layer 3–4 sine waves at irrational frequency ratios to approximate organic noise:
```
texture = amp * (
  sin(f1*t + p1*v*360) +
  0.5 * sin(f2*t + p2*v*360) +
  0.25 * sin(f3*t + p3*v*360)
)
```
Parameters: amplitude, frequency multipliers, phase offsets.

### Basket Weave
`texture = amp * sin(n1*t + shift*floor(v*bands)) * sin(v*360*n2)` — radial waves that shift phase at each vertical band, creating a woven look.

### Honeycomb / Dimple
`texture = amp * max(0, cos(n1*t) * cos(v*360*n2) - threshold)` — isolated bumps in a grid-like pattern.

### Vertical Fluting
`texture = amp * abs(sin(n*t))` — classical column-style channels running top to bottom.

### Perlin / Simplex Noise (web only)
Use a JS noise library (like simplex-noise) for truly organic, non-repeating surface variation. Parameters: scale, octaves, amplitude, seed.

### Image-Based Displacement (web only)
Load a grayscale image, sample it at (theta/360, v) UV coordinates, use brightness as radial displacement. Users could upload any texture image.

---

## UI / UX Ideas

### Phase 1

- **Collapsible parameter groups** with descriptive headers and icons
- **2D cross-section preview** — small inset showing the polar plot of the current bottom/top shape
- **Dimension annotations** — show height and radius in mm overlaid on the 3D view
- **Keyboard shortcuts** — R for reset view, W for wireframe, Space for auto-rotate
- **URL state** — encode key parameters in the URL hash so refreshing doesn't lose your work
- **Dark mode** (default) — 3D viewports always look better on dark backgrounds

### Phase 2+

- **Visual Bezier editor** — click/drag control points on a 2D curve instead of typing numbers
- **Preset gallery with thumbnails** — see what a preset looks like before loading it
- **Comparison mode** — show two parameter sets side-by-side
- **Design history** — automatic snapshots every N changes, scrub back through history
- **Fullscreen viewport** — hide sidebar for presentations / screenshots
- **Turntable animation** — auto-rotate + record as GIF or video

---

## Far-Out Ideas (Beyond Vases)

The parametric engine is fundamentally a polar-cross-section swept along a Bezier spine. That's much more general than vases.

### Near-Term Repurposing
- **Lampshades / light diffusers** — thin walls + cutout patterns = amazing shadows
- **Pencil holders, planters, candle holders** — same engine, different proportions
- **Jewelry** — rings, bangles, pendants at small scale

### Medium-Term
- **Architectural columns** — base, shaft (fluted + twisted), capital. Your engine already does this.
- **Musical instrument bells** — trumpet, horn, tuba bell profiles
- **Seashells** — logarithmic spiral growth + your twist + morph ≈ shell geometry

### Long-Term / Ambitious
- **Math sculpture** — objects designed for their shadow projections
- **Terrain ring** — noise texture taken to the extreme = miniature mountain range in a ring
- **Multi-body composition** — arrange multiple generated shapes in a scene
- **AI design assistant** — describe a vase in words, get parameter suggestions

---

## Known Bugs in OpenSCAD Version (to fix in port)

1. **shapeOffsetY lookup bug** — lines 1155–1161 in VaseMaker13 A.scad return OffsetX values where OffsetY is intended (for Square1, SuperEllipse1, SuperFormula1)
2. **Egg1 origin issue** — noted in comments: "origin is right on the curve and all pie slices will be on the edge of the curve and not inside the curve." Need to verify offset handling.
3. **Solid mesh only** — no wall thickness, no bottom cap. Vases are not watertight for printing without slicer "vase mode."
4. **Top shape doesn't inherit offsets** — bottom shape has per-shape offsetX/Y, but top shapes only have a scale factor (no independent offset). This means morphing to a shape that needs centering (like Egg or Cardioid) may be offset.
