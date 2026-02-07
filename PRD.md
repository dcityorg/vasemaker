# VaseMakerWeb — Product Requirements Document

## Overview

VaseMakerWeb is a browser-based parametric 3D vase designer that lets users create intricate, organic vase shapes through an intuitive visual interface with real-time 3D preview. Users manipulate parameters — cross-section shapes, vertical profiles, twist, ripples, morphing — and immediately see the result in 3D, then export STL files for 3D printing.

This project is a ground-up reimagining of VaseMaker, a 13-version OpenSCAD project (2016–2021) that proved out the parametric engine and shape library. The web version preserves all the mathematical power while dramatically improving the user experience, performance, and accessibility.

## Goals

- Make parametric vase design accessible to anyone with a browser — no software install required
- Provide instant visual feedback via real-time 3D preview (the biggest limitation of OpenSCAD)
- Produce printable STL files ready for 3D printing
- Build a foundation that can grow into a community platform (shared designs, remixing, galleries)

## Non-Goals (for v1)

- User accounts or server-side storage
- Multi-user collaboration
- Print service integration
- Mobile-optimized touch interface (responsive layout yes, but touch-gesture editing is deferred)

---

## Phased Roadmap

### Phase 1 — Static Editor (MVP)

A fully client-side web app deployed on Vercel. No backend. All computation happens in the browser.

**Core Features:**

1. **Parametric Engine (ported from OpenSCAD)**
   - All 18 polar cross-section shapes: Butterfly, Cardioid (3 variants), Circle, Diamond, Egg (2 variants), Ellipse, Heart, Infinity/Hippopede, Misc, Polygon, Rectangle, Rose, Square, SuperEllipse, SuperFormula
   - Bezier vertical profile (2–8 control points defining radius vs. height)
   - Morphing: blend from one cross-section shape to another over the height of the vase
   - Radial ripples (sine wave modulation around the circumference)
   - Vertical ripples (sine wave modulation along the height)
   - Bezier twist (rotation around Z-axis controlled by Bezier curve)
   - Sine wave twist (alternating twist cycles)
   - Vertical smoothing (fades ripples in/out vertically)
   - Radial smoothing (fades ripples in/out around the circumference)
   - XY offset: fixed and Bezier-controlled shifting of the cross-section center
   - Configurable resolution (vertical layers and radial facets)

2. **Real-Time 3D Preview**
   - Interactive orbit/zoom/pan camera
   - Mesh updates live as parameters change
   - Wireframe toggle
   - Ground plane / shadow for spatial reference
   - Color / material preview (cosmetic only — for visual appeal)

3. **Parameter UI**
   - Organized, collapsible parameter groups
   - Slider + numeric input for each parameter
   - Dropdown selector for cross-section shapes (bottom and top)
   - Toggle switches for enabling/disabling features (ripples, twist, morph, etc.)
   - Responsive layout: parameter panel on the left, 3D viewport filling the rest

4. **Presets**
   - Built-in preset library (ported from the OpenSCAD JSON parameter sets)
   - Load preset → populates all parameters
   - Save preset to browser (localStorage or IndexedDB)
   - Import/export presets as JSON files

5. **STL Export**
   - One-click download of the current vase as an STL file
   - Configurable export resolution (separate from preview resolution)
   - Option for binary or ASCII STL

6. **Wall Thickness / Hollow Vase**
   - Generate inner surface offset inward by a wall thickness parameter
   - Stitch top and bottom edges to create a closed, printable shell
   - Flat bottom cap option

### Phase 2 — User Accounts and Saved Designs

Add a lightweight backend to enable persistence across sessions and devices.

**Features:**

1. **Authentication** — sign up / sign in (email + OAuth via Google/GitHub)
2. **Cloud-saved designs** — save designs to a database with name, thumbnail, and full parameter JSON
3. **My Designs dashboard** — visual grid of saved designs with thumbnails
4. **Shareable links** — each saved design gets a unique URL; anyone with the link can view and remix

**Tech additions:** Supabase (auth + Postgres database), serverless API routes on Vercel.

### Phase 3 — Community Gallery

Turn VaseMakerWeb into a platform.

**Features:**

1. **Public gallery** — browse published designs from all users
2. **Remix / Fork** — open any public design in the editor, modify it, save as your own
3. **Remix lineage** — "remixed from [original]" attribution
4. **Search and filter** — by shape type, popularity, newest
5. **Likes / favorites**

### Phase 4 — Advanced Features (Future)

- Surface texture via displacement maps and Perlin noise
- AI-assisted design (describe a vase in words → parameter suggestions)
- Print service integration (order a physical print)
- Additional export formats (OBJ, 3MF)
- Undo/redo history
- Animation / turntable GIF export
- Multi-vase composition (arrange multiple vases in a scene)

---

## Success Metrics

**Phase 1:**
- App loads and renders a default vase in under 3 seconds
- Parameter changes reflect in the 3D preview within 100ms for simple changes, under 500ms for full mesh rebuilds
- STL export produces valid, manifold meshes that slice without errors in common slicers (Cura, PrusaSlicer)
- All 18 original OpenSCAD shapes produce visually identical results in the web version

**Phase 2:**
- Users can sign up, save, and reload designs without data loss
- Shared links render correctly for anonymous viewers

**Phase 3:**
- Gallery loads and displays thumbnails performantly (pagination / infinite scroll)

---

## Target Users

1. **3D printing hobbyists** who want unique, customizable vase designs without learning CAD
2. **Makers and artists** who appreciate parametric/generative design
3. **The original VaseMaker community** (if designs were shared on Thingiverse etc.)
4. **Casual users** who just want to play with cool 3D shapes in a browser

---

## Constraints and Assumptions

- The parametric engine must produce the same shapes as the OpenSCAD version (mathematical equivalence)
- All Phase 1 computation is client-side; no server dependency for core functionality
- The app must work in modern browsers (Chrome, Firefox, Safari, Edge — last 2 versions)
- Three.js is the rendering library (mature, well-documented, large community)
- Vercel is the hosting platform
- The project is open source (Creative Commons Attribution-ShareAlike 4.0, matching the original)
