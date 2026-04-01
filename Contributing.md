# Contributing

VaseMaker is open source under the MIT license. Contributions are welcome!

## Ways to Contribute

- **Bug reports** — use [GitHub Issues](../../issues/new?template=bug_report.md)
- **Feature requests** — use [GitHub Issues](../../issues/new?template=feature_request.md) or the [Ideas discussion](../../discussions)
- **Share your designs** — post in the [Design Gallery](../../discussions) discussion
- **Code contributions** — pull requests welcome

## Development Setup

VaseMaker uses Next.js 14 with Three.js / react-three-fiber.

```bash
git clone https://github.com/dcityorg/vasemaker
cd vasemaker
npm install
npm run dev
# Open http://localhost:3000
```

## Project Structure

```
src/
  components/
    editor/       — sidebar controls, panels
    viewport/     — 3D preview, Three.js scene
  content/
    help-content.ts   — all help text (edit here for doc changes)
  lib/
    geometry/     — mesh generation, shapes, textures
    store/        — Zustand state management
```

## Key Areas

- **New shapes:** `src/lib/geometry/shapes/` — add a new polar function
- **New textures:** `src/lib/geometry/textures/` — add a new displacement function
- **Help content:** `src/content/help-content.ts` — pure data, no JSX
- **UI controls:** `src/components/editor/` — React components for each section

## Code Style

- TypeScript throughout
- Zustand for state — keep geometry logic out of components
- Geometry functions are pure: `(params, resolution) => mesh data`

## Questions?

Open a [Discussion](../../discussions) or [Issue](../../issues).
