# VaseMaker

A browser-based parametric 3D vase designer. Create beautiful vases with 25 cross-section shapes, Bezier profile curves, 13 surface textures, twist, morphing, and more — then export STL files for 3D printing.

**[Try it live](https://vasemaker.vercel.app)**

## Features

- **25 polar cross-section shapes** — Circle, Heart, Star, SuperFormula, Gear, and more
- **Bezier profile curve** — sculpt the vase outline with an interactive curve editor
- **Shape morphing** — smoothly blend between two shapes from bottom to top
- **13 surface textures** — Fluting, Voronoi, Simplex noise, Basket Weave, Carved Wood, SVG patterns, and more
- **Texture cutout** — punch holes through the wall for lattice/perforated designs
- **Twist & Sway** — custom Bezier twist, wave twist, and XY offset curves
- **Smooth zones** — suppress textures near base/rim for clean edges
- **Shell mode** — wall thickness, smooth inner wall, flat/rounded rim
- **Image capture** — save viewport screenshots as PNG/JPG at any resolution
- **STL export** — watertight mesh ready for slicing
- **Save/Load** — JSON design files, tiny and forward-compatible
- **50-step undo/redo** — Cmd+Z / Cmd+Shift+Z
- **Real-time preview** — instant feedback as you adjust parameters

## Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/vasemaker.git
cd vasemaker
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- [Next.js 14](https://nextjs.org/) (App Router, TypeScript)
- [Three.js](https://threejs.org/) via [@react-three/fiber](https://docs.pmnd.rs/react-three-fiber)
- [Zustand](https://zustand-demo.pmnd.rs/) for state management
- [Tailwind CSS](https://tailwindcss.com/) for styling
- Fully client-side — no backend required

## Project Structure

```
src/
├── engine/           # Pure math — mesh generation, shapes, STL export
├── components/
│   ├── editor/       # Main layout, sidebar, help panel
│   ├── parameters/   # All parameter UI controls (split by section)
│   └── viewport/     # 3D canvas, capture overlay/renderer
├── config/           # Slider ranges, colors, presets, viewport settings
├── store/            # Zustand stores (params + undo history)
├── presets/          # Default parameters and preset definitions
├── hooks/            # React hooks (mesh generation bridge)
├── content/          # Help panel text content
└── lib/              # Utilities (math, download helpers)
```

## How It Works

```
User adjusts slider → Zustand store → useVaseMesh hook →
generateMesh() → Float32Array positions/normals + indices →
VaseMesh.tsx updates BufferGeometry → Three.js renders
```

The engine uses polar cross-section shapes swept along a Bezier vertical profile. Each vertex is computed from: shape function × profile radius + texture offsets, then converted from polar to cartesian coordinates with twist rotation applied.

## Adding a New Texture

See the detailed recipe in [CLAUDE.md](./CLAUDE.md#how-to-add-a-new-texture-recipe) — it walks through all 6 files that need changes with code examples.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

[MIT](./LICENSE)
