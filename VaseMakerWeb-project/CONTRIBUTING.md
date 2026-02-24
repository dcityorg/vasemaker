# Contributing to VaseMaker

Thanks for your interest in contributing! VaseMaker is a parametric 3D vase designer built with Next.js, Three.js, and TypeScript.

## Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/vasemaker.git
cd vasemaker
npm install
npm run dev
```

Before submitting a PR, make sure the build passes:

```bash
npm run build
```

## Code Organization

The codebase follows a clear separation:

- **`src/engine/`** — Pure math functions. No React, no DOM, no UI. This is where mesh generation, shapes, and algorithms live.
- **`src/components/`** — React UI components. Split by area: `editor/` (layout), `parameters/` (controls), `viewport/` (3D canvas).
- **`src/store/`** — Zustand state management. Single source of truth for all vase parameters.
- **`src/config/`** — Constants, slider ranges, color palettes. Data only.

## Adding a New Texture

This is the most common contribution. Follow the 6-file recipe in [CLAUDE.md](./CLAUDE.md#how-to-add-a-new-texture-recipe):

1. `src/engine/types.ts` — Define parameter shape
2. `src/presets/defaults.ts` — Set defaults
3. `src/config/shape-params.ts` — Define slider ranges
4. `src/store/vase-store.ts` — Add store action
5. `src/engine/mesh-generator.ts` — The algorithm
6. `src/components/parameters/TextureControls.tsx` — UI controls

### Key Texture Requirements

- Output is a radial offset in mm (positive = outward, negative = inward)
- Must wrap seamlessly at 0/360 degrees
- Use aspect ratio correction for square cells: `circumference / height`
- Use `?.` optional chaining for backward compatibility with old save files
- Multiply by `row.vSmooth * rSmooth * szf` (smoothing factors)

## Adding a New Shape

Shapes are polar functions in `src/engine/shapes.ts`. Each takes `(angleDegrees, params)` and returns a radius. Register it in `shapeRegistry`, add to the `ShapeType` union in `types.ts`, add per-shape defaults, and add to `SHAPE_OPTIONS` in `config/shape-params.ts`.

## Code Style

- TypeScript strict mode
- Tailwind CSS for styling (use CSS variables like `var(--text-primary)`)
- No external UI component libraries — everything is built from scratch
- Keep the engine pure: no DOM, no React, no browser APIs in `src/engine/`
- Prefer simple, readable code over clever abstractions

## Pull Requests

- One feature or fix per PR
- Include a brief description of what changed and why
- Make sure `npm run build` passes with no errors
- Test that existing features still work (load a design, adjust sliders, export STL)
- For new textures: verify no seam at 0/360, stacks with other textures, save/load works

## Coordinate System

VaseMaker uses **Z-up** (matching the OpenSCAD origin):
- Vase bottom at Z=0 on the XY plane
- Height goes up along Z
- Cross-section shapes are in the XY plane

## Questions?

Open an issue if you have questions about the architecture or need guidance on a contribution.
