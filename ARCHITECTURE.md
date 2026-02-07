# VaseMakerWeb — Architecture

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js (App Router) | React-based, Vercel-native, supports static export for v1 and serverless API routes for v2 |
| Language | TypeScript | Type safety for math-heavy code; catches unit/coordinate errors at compile time |
| 3D Rendering | Three.js via @react-three/fiber + @react-three/drei | React integration, declarative scene graph, orbit controls and helpers built in |
| Styling | Tailwind CSS | Utility-first, fast iteration, good for component-heavy UIs |
| UI Components | shadcn/ui | High-quality accessible components (sliders, dropdowns, toggles, collapsible panels) |
| State Management | Zustand | Lightweight, works well with React and Three.js, no boilerplate |
| STL Export | Custom (write triangles to ArrayBuffer) or three-stl-exporter | Simple binary STL writer |
| Auth (v2) | Supabase Auth | Email + OAuth, pairs with Supabase DB |
| Database (v2) | Supabase (Postgres) | Free tier, real-time subscriptions, row-level security |
| Hosting | Vercel | Auto-deploy from GitHub, edge CDN, serverless functions |

## Project Structure

```
VaseMakerWeb/
├── public/                     # Static assets (favicon, og-image, etc.)
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Main editor page
│   │   └── globals.css         # Tailwind base styles
│   │
│   ├── engine/                 # Pure math — NO UI, NO rendering dependencies
│   │   ├── shapes.ts           # All polar equation functions
│   │   ├── bezier.ts           # Bezier curve evaluation (replaces BezierScad.scad)
│   │   ├── mesh-generator.ts   # Builds vertex/face arrays from parameters
│   │   ├── modifiers.ts        # Ripples, twist, smoothing, morphing
│   │   ├── stl-export.ts       # Converts mesh to STL binary/ASCII
│   │   └── types.ts            # TypeScript types for parameters, meshes, etc.
│   │
│   ├── components/             # React UI components
│   │   ├── editor/             # Main editor layout
│   │   │   ├── Editor.tsx      # Top-level editor (sidebar + viewport)
│   │   │   ├── Sidebar.tsx     # Scrollable parameter panel
│   │   │   └── Toolbar.tsx     # Top bar: presets, export, settings
│   │   ├── parameters/         # Parameter group components
│   │   │   ├── ShapeSelector.tsx
│   │   │   ├── ProfileEditor.tsx
│   │   │   ├── RippleControls.tsx
│   │   │   ├── TwistControls.tsx
│   │   │   ├── SmoothingControls.tsx
│   │   │   ├── OffsetControls.tsx
│   │   │   ├── MorphControls.tsx
│   │   │   ├── ResolutionControls.tsx
│   │   │   └── DimensionControls.tsx
│   │   ├── viewport/           # 3D rendering components
│   │   │   ├── Viewport.tsx    # R3F Canvas wrapper
│   │   │   ├── VaseMesh.tsx    # Renders the generated mesh
│   │   │   ├── SceneSetup.tsx  # Lights, camera, ground plane
│   │   │   └── ViewControls.tsx # Wireframe toggle, color picker, etc.
│   │   └── ui/                 # shadcn/ui component overrides
│   │
│   ├── store/                  # Zustand state management
│   │   ├── vase-store.ts       # All vase parameters + actions
│   │   └── ui-store.ts         # UI state (panel open/closed, view mode, etc.)
│   │
│   ├── presets/                # Built-in preset definitions
│   │   ├── index.ts            # Preset registry
│   │   └── defaults.ts         # Default parameter values
│   │
│   ├── hooks/                  # Custom React hooks
│   │   ├── use-vase-mesh.ts    # Connects store → engine → Three.js geometry
│   │   └── use-debounce.ts     # Debounce rapid parameter changes
│   │
│   └── lib/                    # Shared utilities
│       ├── math-utils.ts       # Trig helpers, deg/rad conversion, clamp, lerp
│       └── constants.ts        # Shared constants
│
├── PRD.md
├── ARCHITECTURE.md
├── FEATURES.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── .gitignore
```

## Core Data Flow

```
User adjusts slider
       │
       ▼
Zustand Store (vase-store.ts)
  Holds all parameter values as a single flat object
       │
       ▼
use-vase-mesh hook
  Subscribes to store, debounces rapid changes (50ms),
  calls engine to rebuild mesh
       │
       ▼
mesh-generator.ts (engine)
  1. Evaluates Bezier profile curve → radius/height at each vertical step
  2. For each vertical layer:
     a. Computes Bezier XY offset at this height
     b. Computes Bezier twist at this height
     c. For each radial step:
        - Evaluates bottom shape function at angle t
        - If morphing: evaluates top shape function, blends by height ratio
        - Applies radial ripple modulation
        - Applies vertical ripple modulation
        - Applies vertical smoothing
        - Applies radial smoothing
        - Multiplies by Bezier profile radius
        - Converts polar → cartesian
        - Applies XY offset
        - Applies twist rotation
  3. Stitches adjacent vertices into triangle faces
  4. Returns Float32Array of positions + normals
       │
       ▼
VaseMesh.tsx (component)
  Creates Three.js BufferGeometry from the arrays,
  attaches to a <mesh> in the R3F scene
       │
       ▼
Viewport.tsx (component)
  R3F Canvas with OrbitControls, lights, ground plane
  Renders the mesh in real-time
```

## Parametric Engine Design

### Parameter Object

All vase parameters live in a single TypeScript interface. This is the "source of truth" — it gets saved as JSON, loaded from presets, and passed to the mesh generator.

```typescript
interface VaseParameters {
  // Dimensions
  radius: number;           // mm (default 30)
  height: number;           // mm (default 100)

  // Vertical profile — Bezier control points [radiusMultiplier, heightFraction]
  profilePoints: [number, number][];  // 2–8 points

  // Cross-section shapes
  bottomShape: ShapeType;   // enum of all 18+ shape names
  topShape: ShapeType;
  morphEnabled: boolean;

  // Shape-specific parameters stored as a record
  shapeParams: Record<string, Record<string, number>>;

  // Radial ripples
  radialRipple: { enabled: boolean; count: number; depth: number; };

  // Vertical ripples
  verticalRipple: { enabled: boolean; count: number; depth: number; };

  // Bezier twist
  bezierTwist: { enabled: boolean; points: number[]; };

  // Sine twist
  sineTwist: { enabled: boolean; cycles: number; maxDegrees: number; };

  // Smoothing
  verticalSmoothing: { enabled: boolean; cycles: number; startPercent: number; };
  radialSmoothing: { enabled: boolean; cycles: number; offsetAngle: number; };

  // Offset
  fixedOffset: { x: number; y: number; };
  bezierOffset: { enabled: boolean; scaleX: number; scaleY: number; points: [number, number][]; };

  // Resolution
  previewResolution: { vertical: number; radial: number; };
  exportResolution: { vertical: number; radial: number; };

  // Shell (new feature not in OpenSCAD)
  wallThickness: number;    // mm, 0 = solid
  bottomCap: boolean;
}
```

### Shape Functions

Each polar shape is a pure function: `(angleDegrees: number, params: ShapeSpecificParams) => number` returning the radius at that angle. These are registered in a shape registry:

```typescript
const shapeRegistry: Record<ShapeType, ShapeFunction> = {
  Circle1: (t, p) => p.scaleFactor,
  Cardiod1: (t, p) => p.scaleFactor * (1 - Math.sin(rad(t))),
  SuperFormula1: (t, p) => superFormula(t, p.a, p.b, p.m, p.n1, p.n2, p.n3) * p.scaleFactor,
  // ... etc
};
```

This replaces the massive ternary chain in the OpenSCAD code with a clean lookup.

### Bezier Evaluation

The BezierScad.scad library's `PointAlongBez()` function is replaced with a standard de Casteljau algorithm implementation. This is ~20 lines of TypeScript and handles any number of control points (2–8, matching the OpenSCAD version).

### Mesh Generation Strategy

The mesh is built as a grid of vertices indexed by [verticalStep][radialStep]. Each quad in the grid is split into two triangles. This is identical to the OpenSCAD approach (which builds pie-slice polyhedra) but more efficient because we share vertices between adjacent faces and compute normals from the triangle cross-products.

For the hollow shell (wall thickness > 0), we generate a second inner surface with radius reduced by wallThickness, flip its normals, and stitch the top/bottom edges together.

### Performance Considerations

- **Debouncing:** Slider changes are debounced at 50ms to avoid rebuilding the mesh on every pixel of slider movement.
- **Web Worker (future):** If mesh generation is slow at high resolutions, move it to a Web Worker so the UI thread stays responsive. For v1, we'll profile first — the math may be fast enough on the main thread.
- **Level of detail:** Preview uses lower resolution; export uses the higher resolution the user configures. The preview mesh is what renders in real-time.
- **BufferGeometry reuse:** We reuse the same Three.js BufferGeometry object and update its attributes in place rather than creating a new geometry each time.

## Phase 2 Additions

### Database Schema (Supabase / Postgres)

```sql
-- Users table is managed by Supabase Auth

create table designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  parameters jsonb not null,        -- the full VaseParameters object
  thumbnail_url text,               -- stored in Supabase Storage
  is_public boolean default false,
  forked_from uuid references designs(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table likes (
  user_id uuid references auth.users(id) on delete cascade,
  design_id uuid references designs(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, design_id)
);
```

### API Routes

All via Next.js serverless functions on Vercel:

- `GET /api/designs` — list user's designs (authenticated)
- `POST /api/designs` — save a new design
- `PUT /api/designs/[id]` — update a design
- `DELETE /api/designs/[id]` — delete a design
- `GET /api/designs/[id]` — get a single design (public or owner)
- `GET /api/gallery` — list public designs (paginated, sorted)
- `POST /api/designs/[id]/like` — toggle like
