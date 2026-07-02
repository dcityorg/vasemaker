# VaseMaker UI Spec — for BoxMaker port

This document captures the look-and-feel of VaseMaker so a fresh Claude session can build a BoxMaker webapp with the same visual language. All values are taken directly from the live VaseMaker source. Hex colors, pixel sizes, and Tailwind class names are literal — don't paraphrase them.

The reader will not have access to the VaseMaker repo; this doc must be self-contained.

---

## 1. Tech stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript 5.7**
- **Tailwind CSS 3.4** — no theme extension; all design tokens live in CSS variables in `globals.css` and Tailwind classes reference them with the `bg-[var(--name)]` arbitrary-value syntax.
- **Zustand** for state
- **@react-three/fiber + @react-three/drei** for 3D
- **lucide-react** is installed but not heavily used; native characters (✕, ↶, ↷, ↕, ?) are used for icon buttons

Body is `overflow: hidden` — the app is full-screen, no page scroll.

---

## 2. Color system

### CSS variables (in `src/app/globals.css` `:root`)

```css
:root {
  --bg-primary:    #0a0a0a;  /* app/body background, near-black */
  --bg-secondary:  #141414;  /* input bg, button bg, slightly lighter */
  --bg-panel:      #1a1a1a;  /* sidebar, help panel, modal cards */
  --border-color:  #2a2a2a;  /* borders, dividers, indent rails */
  --text-primary:  #e5e5e5;  /* main text */
  --text-secondary:#999;     /* labels, captions */
  --accent:        #6d9fff;  /* soft blue — toggles on, primary buttons, focus rings, dirty marker */
  --accent-hover:  #5a8ae6;  /* darker accent for hover on primary buttons */
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  margin: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

The whole UI is a **dark theme**. There is no light-mode toggle.

### Sidebar group colors (`src/config/colors.ts`)

Five colors, one per parameter group. Each color is used for **both** the group's uppercase header label **and** the title text of every `Section` inside that group.

```ts
export const GROUP_COLORS = {
  structure: '#7BA3CF',  // Soft blue
  surface:   '#C9A84C',  // Warm amber
  smoothing: '#7BAF7B',  // Sage green
  twist:     '#A78BBA',  // Soft purple
  settings:  '#9B9B9B',  // Neutral gray
} as const;

export const UI_MUTED = '#9B9B9B';  // utility buttons, dropdowns, toolbar
```

Toolbar elements (preset dropdown, Load/Save buttons, Export STL, image-capture controls) and shape-selection dropdowns inside parameter sections use `UI_MUTED` so they don't compete with the colored section titles.

**BoxMaker mapping suggestion** (re-using the 5 slots so the visual identity carries over): Box & Lid → blue, Standoffs → amber, Cutouts → green, Text Labels → purple, Settings → gray. See §13.

---

## 3. Typography

Font: the system stack from `globals.css` above. No custom font loading.

Size scale used throughout the UI:

| Tailwind class | Pixel | Used for |
|---|---|---|
| `text-lg`  | 18 | App title ("VaseMaker"), Help panel title |
| `text-sm`  | 14 | Slider/toggle labels, section titles, modal body text |
| `text-xs`  | 12 | Value readouts, buttons, captions, design name |
| `text-[10px]` | 10 | Group headers, preset descriptions, dropdown chevrons, capture hint |

Weights: `font-semibold` for the app title, help title, and group headers. `font-medium` for section titles, button labels, and help block headings. Everything else is normal.

Group header uses tight letter-spacing and uppercase:

```tsx
<div className="mt-6 mb-2 px-1 text-[10px] font-semibold tracking-[0.15em] uppercase"
     style={{ color }}>
  {label}
</div>
```

Numeric readouts (slider values, custom-size inputs) use `tabular-nums` so digits don't jiggle as values change.

---

## 4. Top-level layout

`Editor.tsx` is a flex row at full viewport size:

```tsx
<div className="flex h-screen w-screen overflow-hidden">
  <Sidebar ... />                  {/* w-80, fixed */}
  <div className="flex-1 min-w-0"> {/* viewport fills the rest */}
    <Viewport ... />
  </div>
  {helpOpen && <HelpPanel onClose={...} />}  {/* 240–600px, default 320 */}
</div>
```

- **Sidebar**: `w-80` = 320px, fixed width, on the left
- **Viewport**: `flex-1 min-w-0`, fills remaining horizontal space
- **Help panel**: appears on the right when open, pushes the viewport (does not overlay it), draggable width

When the help panel is open, the viewport narrows. This is intentional — `Editor` controls help state, `Viewport` auto-adjusts via flex.

---

## 5. Sidebar shell

`Sidebar.tsx`. Width 320, full height, `bg-[var(--bg-panel)]`, right border `border-[var(--border-color)]`, flex column with a fixed header and a single scrollable region below.

### Header (`px-4 py-3`, border-bottom)

Two rows.

**Row 1** — app title + icon buttons, all in one flex row:

```
[ VaseMaker                ↶  ↷  ↕  ? ]
```

- App title: `text-lg font-semibold text-[var(--text-primary)] flex-1`
- Undo/Redo buttons: `text-lg leading-none px-1 py-0.5 rounded hover:bg-[var(--bg-secondary)]`, disabled state `opacity-25 cursor-default`. Glyphs: `↶` / `↷`.
- Expand/collapse-all button: same style, glyph `↕` (Unicode `&#x2195;`), `text-xs`, secondary text color. Toggles `open` on every `<details>` in the sidebar.
- Help button: `w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold`. **Active state** (help panel open): `bg-[var(--accent)] text-white`. **Inactive**: `text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]`. Glyph: `?`.

**Row 2** — version subtitle: `text-xs text-[var(--text-secondary)]`, e.g. `"Parametric 3D Vase Designer — v1.6.0"`.

**Row 3** — editable design name. Click-to-edit pattern:
- Display mode: `<p className="text-xs text-[var(--text-secondary)] truncate cursor-pointer hover:text-[var(--text-primary)]">`. Shows `* ` prefix in `--accent` color when state is dirty, then the design name (or `"Untitled"`).
- Edit mode (on click): swaps to `<input type="text">` styled `text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded px-1 py-0.5 w-full outline-none focus:border-[var(--accent)]`. Enter saves, Esc cancels, blur saves.

### Scrollable body

Everything below the header is one `overflow-y-auto sidebar-scroll` column containing the toolbar (§6) followed by the parameter sections (§7).

### Unsaved-changes confirmation dialog

When the user picks a preset or loads a file while state is dirty, a modal appears. See §10.

---

## 6. Toolbar

Lives at the top of the sidebar's scrollable area: `px-3 py-2 border-b border-[var(--border-color)] flex flex-col gap-2`. Contains four groups, separated by thick dividers:

```
[ Select a starting preset       ▼ ]    ← preset dropdown
─────────────────────────────────────   border-t-[3px] border-[#555]
[ Load Design  ]  [ Save Design  ]      ← design file row
─────────────────────────────────────
[ Size preset ▼ ]  ( ) PNG  ( ) JPG     ← image capture row
[ Capture Image                     ]
─────────────────────────────────────
[ Export STL                        ]
```

The `border-t-[3px] border-[#555] pt-2` dividers are visually heavier than normal section borders — that's intentional, they group file-operation chunks.

All toolbar buttons share the **muted utility style**:

```
bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded
px-2 py-1 text-xs hover:bg-[var(--border-color)] transition-colors
style={{ color: UI_MUTED }}
```

Save/Export-style buttons use the same style but with `py-1.5` and `font-medium`.

When the user activates image capture, the `Capture Image` button is replaced by:
```
[ Save Image (primary) ] [ Cancel (utility) ]
```
The primary button uses `bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white`.

---

## 7. Sidebar primitives

These four components are the entire parameter-control vocabulary. Copy them exactly. From `src/components/parameters/ui.tsx`:

### Section — collapsible accordion with optional toggle

```tsx
export function Section({ title, children, defaultOpen = true, active,
                          checked, onToggle, tooltip, titleColor }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
  active?: boolean; checked?: boolean; onToggle?: (v: boolean) => void;
  tooltip?: string; titleColor?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const handleToggle = useCallback(() => {
    const el = detailsRef.current;
    if (!el || !el.open) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  return (
    <details ref={detailsRef} open={defaultOpen} className="mb-4" onToggle={handleToggle}>
      <summary
        className="cursor-pointer text-sm font-medium py-2 px-3 bg-[var(--bg-secondary)] rounded select-none hover:bg-[var(--border-color)] transition-colors flex items-center gap-2"
        style={titleColor ? { color: titleColor } : { color: 'var(--text-primary)' }}
        title={tooltip}
      >
        <span className="flex-1">{title}</span>
        {onToggle ? (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(!checked); }}
            className={`w-8 h-4 rounded-full transition-colors shrink-0 ${
              checked ? 'bg-[var(--accent)]' : 'bg-[#888]'
            }`}
          />
        ) : (
          active && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        )}
      </summary>
      <div className="pt-3 px-4 ml-2 border-l-2 border-[var(--border-color)]">
        {children}
      </div>
    </details>
  );
}
```

Key behaviors:
- Native `<details>` element — accessibility free, no JS for open/close
- Title color comes from the group color (passed via `titleColor`); content children are *not* colored
- When `onToggle` is provided, the header gets a pill switch on the right (independent of accordion open/close). Off state is `#888` (not `--border-color`) so the off pill is still visible against the secondary bg.
- Content is indented: `pt-3 px-4 ml-2 border-l-2 border-[var(--border-color)]` — a thin vertical rail on the left
- Auto-scrolls into view on open

### SliderRow — labeled range slider

```tsx
export function SliderRow({ label, value, min, max, step, onChange, tooltip, suffix }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; tooltip?: string; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title={tooltip}>
        {label}
      </label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 min-w-0 h-1.5 accent-[var(--accent)]"
      />
      <span className="text-xs text-[var(--text-secondary)] w-12 shrink-0 text-right tabular-nums">
        {value}{suffix}
      </span>
    </div>
  );
}
```

- Label column fixed at `w-24` (96px), value column fixed at `w-12` (48px), slider flexes
- Native `<input type="range">` styled with `accent-[var(--accent)]` — the browser handles the thumb/track in accent blue
- `h-1.5` (6px) track height
- Optional `suffix` for units (e.g. `"%"`, `" mm"`)

### Toggle — labeled pill switch

```tsx
export function Toggle({ label, checked, onChange, onReset, tooltip }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
  onReset?: () => void; tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <label className="text-sm text-[var(--text-secondary)] w-24 shrink-0" title={tooltip}>
        {label}
      </label>
      <button
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-color)]'
        }`}
      />
      {onReset && checked && (
        <button onClick={onReset}
          className="ml-auto text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-1.5 py-0.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
          title="Reset to defaults">
          Reset
        </button>
      )}
    </div>
  );
}
```

- Switch size `w-8 h-4` (32×16px), `rounded-full`
- **Note**: off color is `--border-color` here vs `#888` inside Section headers — the section-header pill needs higher contrast against the section's secondary background, so it uses `#888`. Within content the regular border color is enough.
- Optional Reset button on the right, only visible when checked

### GroupHeader — uppercase label between sections

```tsx
export function GroupHeader({ label, color }: { label: string; color: string }) {
  return (
    <div className="mt-6 mb-2 px-1 text-[10px] font-semibold tracking-[0.15em] uppercase"
         style={{ color }}>
      {label}
    </div>
  );
}
```

Sits between groups of sections to visually break the sidebar into the 5 color zones.

### Putting it together — typical usage pattern

```tsx
<GroupHeader label="Box & Lid" color={GROUP_COLORS.structure} />

<Section title="Dimensions" titleColor={GROUP_COLORS.structure}>
  <SliderRow label="Length" value={params.length} min={20} max={300} step={1}
             onChange={setLength} suffix=" mm" />
  <SliderRow label="Width"  value={params.width}  min={20} max={300} step={1}
             onChange={setWidth}  suffix=" mm" />
  <SliderRow label="Height" value={params.height} min={20} max={300} step={1}
             onChange={setHeight} suffix=" mm" />
</Section>

<Section title="Snap-Fit Lid" titleColor={GROUP_COLORS.structure}
         checked={params.lid.enabled} onToggle={(v) => setLid({ enabled: v })}>
  <Toggle label="Front" checked={params.lid.front} onChange={(v) => setLid({ front: v })} />
  <Toggle label="Back"  checked={params.lid.back}  onChange={(v) => setLid({ back:  v })} />
  ...
</Section>
```

### Sub-slider indent

When a slider group sits beneath a parent toggle (e.g. "Voronoi enabled → its sub-sliders"), VaseMaker wraps the sub-block in:

```tsx
<div className="ml-2 pl-3 border-l-2 border-[var(--border-color)]">
  <SliderRow ... />
  <SliderRow ... />
</div>
```

This is the same indent rail used by `Section` itself, applied at a second level.

---

## 8. Button styles

Three flavors, all `text-xs` and `rounded`:

**Utility (default)** — toolbar, secondary modal buttons:
```
bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded
px-2 py-1 hover:bg-[var(--border-color)] transition-colors
style={{ color: UI_MUTED }}
```

**Primary** — Save & Continue in the dirty-modal, Save Image during capture:
```
bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium
px-3 py-1.5 rounded transition-colors
```

**Header icon** — undo/redo/expand-all in sidebar header:
```
text-lg leading-none px-1 py-0.5 rounded
hover:bg-[var(--bg-secondary)] transition-colors
disabled:opacity-25 disabled:cursor-default
```

Native browser `title` attribute is added to **every** interactive element for tooltips.

---

## 9. Preset dropdown

The preset picker is a custom dropdown, not a native `<select>`, because each option shows a thumbnail.

**Trigger button**:
```tsx
<button className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded
                   px-2 py-1 text-xs text-left flex items-center justify-between"
        style={{ color: UI_MUTED }}>
  <span>Select a starting preset</span>
  <span className="text-[10px] ml-1">{open ? '▲' : '▼'}</span>
</button>
```

**Open dropdown panel** (absolutely positioned below the trigger):
```tsx
<div className="absolute left-0 right-0 top-full mt-1
                bg-[var(--bg-panel)] border border-[var(--border-color)]
                rounded shadow-xl z-50 max-h-[70vh] overflow-y-auto sidebar-scroll">
  {presets.map(p => (
    <button className="w-full flex items-center gap-3 px-2 py-1.5
                       hover:bg-[var(--border-color)] transition-colors text-left">
      <img src={p.thumbnail} className="w-10 h-14 object-cover rounded shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-[var(--text-primary)] font-medium">{p.name}</div>
        <div className="text-[10px] text-[var(--text-secondary)] truncate">{p.description}</div>
      </div>
    </button>
  ))}
</div>
```

Thumbnails are **40×56** (vertical aspect — for vases). For BoxMaker, square 48×48 thumbnails would read better; adjust `w-10 h-14` → `w-12 h-12`.

Close-on-outside-click via a `mousedown` listener on `document` when the dropdown is open.

---

## 10. Modal dialog

The unsaved-changes confirmation is the only modal in VaseMaker. Use this pattern for any BoxMaker dialogs.

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <div className="bg-[var(--bg-panel)] border border-[var(--border-color)]
                  rounded-lg p-5 max-w-sm mx-4 shadow-xl">
    <p className="text-sm text-[var(--text-primary)] mb-4">
      You have unsaved changes. Save first?
    </p>
    <div className="flex gap-2">
      <button className="flex-1 px-3 py-1.5 text-xs bg-[var(--accent)]
                         hover:bg-[var(--accent-hover)] text-white rounded">
        Save & Continue
      </button>
      <button className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-secondary)]
                         border border-[var(--border-color)] rounded
                         hover:bg-[var(--border-color)] text-[var(--text-primary)]">
        Don't Save
      </button>
      <button className="flex-1 px-3 py-1.5 text-xs bg-[var(--bg-secondary)]
                         border border-[var(--border-color)] rounded
                         hover:bg-[var(--border-color)] text-[var(--text-secondary)]">
        Cancel
      </button>
    </div>
  </div>
</div>
```

Backdrop is `bg-black/50` — translucent black, dims (but doesn't blur) the app underneath. Card has `rounded-lg` (heavier than the `rounded` used elsewhere) to signal it's modal.

---

## 11. Help panel

Activated by the **?** button in the sidebar header (§5). When open:
- The button becomes filled accent (`bg-[var(--accent)] text-white`).
- A panel slides in from the right, **pushing** the viewport narrower (not overlaying it).
- Pressing the close X or clicking ? again closes it.

### Layout

```tsx
<div className="h-full bg-[var(--bg-panel)] border-l border-[var(--border-color)]
                flex flex-col help-panel-enter shrink-0 relative"
     style={{ width }}>
  {/* Drag handle on left edge */}
  <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize
                  hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50
                  transition-colors z-10"
       onMouseDown={...} />

  {/* Header */}
  <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center">
    <h2 className="text-lg font-semibold text-[var(--text-primary)] flex-1">Help</h2>
    <button className="text-lg leading-none px-1.5 py-0.5 rounded
                       hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]
                       hover:text-[var(--text-primary)]"
            onClick={onClose}>✕</button>
  </div>

  {/* Scrollable content — same <details> sections as the sidebar */}
  <div className="flex-1 overflow-y-auto sidebar-scroll px-3 py-3">
    {sections.map((section, si) => (
      <details key={section.id} open={si === 0} className="mb-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)]
                            py-2 px-3 bg-[var(--bg-secondary)] rounded select-none
                            hover:bg-[var(--border-color)] transition-colors">
          {section.title}
        </summary>
        <div className="pt-3 px-3 ml-2 border-l-2 border-[var(--border-color)]">
          {section.blocks.map((block, bi) => renderBlock(block, bi))}
        </div>
      </details>
    ))}
  </div>
</div>
```

### Width & resize

- Min 240, max 600, default 320 (px)
- Drag handle is a 6-pixel-wide invisible strip on the **left edge** of the panel
- Hovered handle gets a faint accent tint; while dragging, body cursor is `col-resize` and `user-select: none`

### Slide-in animation

```css
@keyframes slide-in-right {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
.help-panel-enter {
  animation: slide-in-right 200ms ease-out;
}
```

200ms ease-out feels snappy without being abrupt.

### Help content block types

Help content is structured data (no JSX) rendered by a small switch. Implement these block types — the other Claude will fill in the actual content:

| Type | Style |
|---|---|
| `paragraph` | `<p className="text-sm text-[var(--text-secondary)] mb-3 leading-relaxed">` |
| `heading` | `<h3 className="text-sm font-semibold text-[var(--text-primary)] mt-4 mb-2">` |
| `list` | `<ul className="text-sm text-[var(--text-secondary)] mb-3 pl-4 space-y-1">` with `<li className="list-disc leading-relaxed">` |
| `tip` | accent-tinted callout — see below |
| `table` | `text-xs` 2-col table with `border-b border-[var(--border-color)]` rows |
| `keyvalue` | flex pairs: bold key (primary) + value (secondary) |

The **tip block** is the only one with non-trivial styling:

```tsx
<div className="text-sm mb-3 px-3 py-2 rounded
                bg-[var(--accent)]/10 border border-[var(--accent)]/20
                text-[var(--text-secondary)] leading-relaxed">
  <span className="font-medium text-[var(--accent)]">Tip: </span>
  {block.text}
</div>
```

VaseMaker ships 5 help sections: Quick Start, Shapes, Profile/Twist/Sway, Textures, 3D Printing Tips. BoxMaker's natural sections might be: Quick Start, Box & Lid, Standoffs, Cutouts, Text Labels, 3D Printing Tips. The first section is `open` by default; the rest are collapsed.

---

## 12. 3D viewport

`Viewport.tsx`. Fills the middle column of the editor.

```tsx
<Canvas
  camera={{ position: [80, 80, 120], fov: 50, near: 0.1, far: 3000 }}
  gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
  onCreated={({ camera, scene }) => {
    camera.up.set(0, 0, 1);
    scene.up.set(0, 0, 1);
    camera.lookAt(0, 0, 50);
  }}>
  <ambientLight intensity={0.4} />
  <directionalLight position={[100, 150, 100]} intensity={1} />
  <directionalLight position={[-50, 80, -50]} intensity={0.3} />
  <directionalLight position={[-80, -120, 80]} intensity={0.5} />
  <GroundGrid />
  {/* the model */}
  <OrbitControls makeDefault enableDamping dampingFactor={0.1}
                 target={[0, 0, 50]} minDistance={30} maxDistance={1200} />
</Canvas>
```

- **Z is up** (`camera.up = (0, 0, 1)`) — matches OpenSCAD convention. Box bottom sits at Z=0 on the XY plane. Worth confirming this is what the BoxMaker engine will expect.
- **`alpha: false`** is important — without it, screenshots get a premultiplied-alpha grey veil. The canvas reads black from the body background underneath.
- **`preserveDrawingBuffer: true`** — required for screenshot capture
- **Camera position** `[80, 80, 120]` looking at `[0, 0, 50]` is tuned for ~100mm-tall vases. For boxes, you'll likely want to set the target dynamically to `[0, 0, height/2]` and scale the camera distance with box size.
- **Lighting** is a 3-point setup (key + fill + back) plus ambient. Adjusting only `ambient.intensity` is usually enough to tune overall brightness.

### Ground grid

VaseMaker draws its own grid on the XY plane (the drei `Grid` ships in XZ and can't be rotated). A simple two-color grid: minor `#282828`, major `#3a3a3a`. Size scales with the model. Always visible.

### Axis rulers (optional)

Behind a "Show Rulers" toggle: tick marks every 10mm along the X, Y, Z axes, with major ticks every 50mm and numeric labels. Colors: X red `#ff4444`, Y green `#44ff44`, Z blue `#4488ff`. Off by default for a clean preview — turn on when measuring matters.

### Screenshot capture

VaseMaker has an overlay capture mode (resizable frame on top of the viewport, save with format toggle). For a BoxMaker proof of concept, skip this — just put `Export STL` in the toolbar and call it a day.

---

## 13. Misc patterns

### Custom scrollbar

```css
.sidebar-scroll::-webkit-scrollbar           { width: 6px; }
.sidebar-scroll::-webkit-scrollbar-track     { background: transparent; }
.sidebar-scroll::-webkit-scrollbar-thumb     { background: var(--border-color); border-radius: 3px; }
.sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #444; }
```

Applied to the sidebar's scrollable region, the help panel's content area, and the preset dropdown. Webkit-only — Firefox falls back to its native scrollbar, which is fine.

### Slider focus ring

For keyboard accessibility:

```css
input[type="range"]:focus {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}
```

### Tooltips

Native browser `title="..."` on every slider, toggle, button, and section header. No tooltip library. Captures the parameter name and a short description.

### Keyboard shortcuts

Two global handlers in the sidebar:
- **Cmd/Ctrl + Z** → undo
- **Cmd/Ctrl + Shift + Z** → redo

Both `preventDefault()` to override browser defaults.

### Dirty marker

When parameters differ from the last saved/loaded state, the design name shows `* ` in `--accent` color before the name. Driven by an `isDirty` flag in the Zustand store. Loading a preset / loading a file / saving clears it.

### Auto-scroll on section open

When a `<details>` opens, it calls `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` inside a `requestAnimationFrame` (so layout finishes first). Keeps the just-opened section visible without yanking the page around when it's already in view.

---

## 14. BoxMaker-specific notes

### 5-group mapping suggestion

| VaseMaker slot | Color | BoxMaker use |
|---|---|---|
| structure | `#7BA3CF` blue | **Box & Lid** — L/W/H, wall thickness, gap, corner radii, snap-fit per-side toggles |
| surface | `#C9A84C` amber | **Standoffs** — list of standoffs |
| smoothing | `#7BAF7B` green | **Cutouts** — list of holes |
| twist | `#A78BBA` purple | **Text Labels** — list of embossed/debossed text |
| settings | `#9B9B9B` gray | **Settings** — appearance, viewport options, export |

This preserves the visual identity exactly while remapping semantics. Rename the constants in `colors.ts` if it bothers you (`structure` → `box`, `surface` → `standoffs`, etc.), or leave them as-is and just use them by color — the names are internal.

### The one new UI primitive: list-of-cards

VaseMaker is entirely slider-driven, but BoxMaker has three list-shaped inputs (standoffs, cutouts, text labels) where the user adds an arbitrary number of items, each with its own settings. The Fusion add-in uses a comma-separated multi-line textarea — that doesn't work in a webapp. Build a **list of cards** instead, using only the existing primitives.

Pattern:

```
[Section: "Standoffs" with toggle]
  ┌──────────────────────────────────────┐
  │ ≡  Floor · (10, 10) ⌀6 h8     [✕]  │   ← collapsed card summary
  └──────────────────────────────────────┘
  ┌──────────────────────────────────────┐
  │ ≡  Floor · (20, 15) ⌀4 h3     [✕]  │
  │  Face: [Floor ▾]                    │   ← expanded card
  │  X:    [SliderRow] mm               │
  │  Y:    [SliderRow] mm               │
  │  Diameter: [SliderRow] mm           │
  │  Height:   [SliderRow] mm           │
  │  ☑ Screw hole                       │
  └──────────────────────────────────────┘
  ┌──────────────────────────────────────┐
  │  + Add standoff                      │
  └──────────────────────────────────────┘
```

Each card is its own nested `<details>` styled the same as `Section` but lighter:
- Collapsed summary shows a one-line glance (face · position · key dimensions) so the user can scan a long list
- Expanded form uses `SliderRow`, `Toggle`, and a simple `<select>` dropdown (styled to match the preset trigger) — no new primitives needed
- The `≡` glyph on the left is a drag handle (mark as v2 — for the POC, render but don't wire up reordering)
- The `✕` button removes the item (confirm? probably no — undo handles it)
- "+ Add" button at the bottom uses the muted utility button style

State shape: an array of objects per list. Store actions: `addStandoff()`, `updateStandoff(i, patch)`, `removeStandoff(i)`, `reorderStandoff(from, to)`.

### What to skip for the proof of concept

VaseMaker has many features that are unnecessary for a BoxMaker POC. Ship the minimum:

- **Skip**: BezierCurveEditor (boxes don't have profile curves), image capture overlay (just have Export STL), preset thumbnails (use plain text dropdown for v1), texture system, all the modifier curves
- **Keep**: sidebar shell, all four primitives, GroupHeader, help panel, modal dialog, Save/Load Design (JSON), Export STL, undo/redo, dirty-state tracking, viewport with orbit controls + ground grid

That alone is a solid app and matches VaseMaker's feel.

### Tech-stack starter

```bash
npx create-next-app@14 boxmaker --typescript --tailwind --app --no-src-dir
# then: cd boxmaker && npm install zustand three @react-three/fiber @react-three/drei lucide-react
```

Copy these files essentially verbatim from VaseMaker after install:
- `src/app/globals.css` (CSS variables, font, scrollbar, animation)
- `src/config/colors.ts` (palette)
- `src/components/parameters/ui.tsx` (the four primitives)
- The general shape of `Sidebar.tsx`, `HelpPanel.tsx`, `Editor.tsx` — though the parameter sections inside will be entirely new

That's about 200 lines of UI scaffolding reused; everything else is BoxMaker-specific.
