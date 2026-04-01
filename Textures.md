# Textures

VaseMaker includes 13 surface textures that displace vertices inward or outward. Multiple textures can be combined.

## Master Switch

The toggle next to the **Textures** header is a master on/off switch. Set up individual textures first (their toggles remember their state), then flip the master on. Like a power strip.

> Textures stack additively. Combine multiple for complex effects — e.g. Fluting + Simplex for fluted panels with organic texture.

---

## Fluting
Smooth sine-wave grooves running up the vase, like a fluted column.

| Control | Description |
|---------|-------------|
| Count | Number of flutes (3–60) |
| Depth | Groove depth in mm |

---

## Square Flute
Flat-topped rectangular pillars separated by sharp-edged channels. Castle-parapet or columned look.

| Control | Description |
|---------|-------------|
| Count | Number of pillars (3–80) |
| Depth | Channel depth in mm |
| Duty | Pillar-to-groove ratio. Higher = wider pillars. 0.5 = equal width |
| Sharpness | Edge transition. 1 = perfectly square, 0 = rounded/beveled |

> High pillar counts need high radial resolution — set to 400+ for 80 pillars.

---

## Waves
Smooth outward lobes — the opposite of Fluting. Bumps go outward, creating a scalloped look.

| Control | Description |
|---------|-------------|
| Count | Number of wave lobes (3–60) |
| Depth | Protrusion outward in mm |
| Duty | Gap between lobes. 0 = lobes touching, 0.9 = narrow lobes with wide flat gaps |

---

## Rods
Semicircular pillars going outward — like cylindrical rods attached to the surface.

| Control | Description |
|---------|-------------|
| Count | Number of rods (3–60) |
| Depth | Rod height outward (mm) — also the rod radius |
| Duty | Gap between rods. 0 = touching, 0.9 = narrow rods with wide gaps |

---

## Vertical Textures

Vertical Fluting, Vertical Square Flute, Vertical Waves, and Vertical Rods are the horizontal-band versions of the above — they wrap around the vase as rings instead of running up it.

- **Vertical Fluting** — horizontal cosine grooves
- **Vertical Square Flute** — horizontal flat-topped bands
- **Vertical Waves** — horizontal cosine² lobes outward
- **Vertical Rods** — horizontal semicircular bands outward

Same controls as their circumferential counterparts. Count starts at 1 (useful for a single decorative band).

> **Tip:** Try Fluting + Vertical Fluting for a woven grid, or Rods + Vertical Rods for a bumpy lattice.

---

## Basket Weave
Interlocking horizontal and vertical bands that alternate in/out, mimicking woven material.

| Control | Description |
|---------|-------------|
| Bands | Horizontal divisions |
| Waves | Vertical divisions |
| Depth | Amplitude of the weave in mm |

---

## Simplex Noise
Smooth, organic noise using fBm (fractal Brownian motion). Creates terrain-like, cloudy, or coral-like surfaces.

| Control | Description |
|---------|-------------|
| Scale | Feature density (larger = more features) |
| Depth | Displacement amplitude in mm |
| Octaves | Layers of detail (1=smooth, 6=craggy) |
| Persistence | How much each octave contributes |
| Lacunarity | Frequency multiplier between octaves |
| Seed | Random seed for different patterns |

> **Starting point:** Scale 10, Depth 1.5, Octaves 3, Persistence 0.5, Lacunarity 2.0

---

## Stipple
A bumpy, irregular surface texture using simplex noise to perturb groove positions.

| Control | Description |
|---------|-------------|
| Count | Number of grain lines around the circumference |
| Depth | Groove depth in mm |
| Wobble | How much lines meander (0=straight, 1=wavy) |
| Sharpness | Edge hardness (0=soft, 1=sharp) |
| Seed | Random seed |

---

## SVG Pattern
Use any SVG as a displacement map. The image is converted to grayscale — black = full depth groove, white = no displacement.

**Key controls:**

| Control | Description |
|---------|-------------|
| Load SVG | Open an .svg file |
| Paste SVG | Paste SVG code (from PatternMaker, Hero Patterns, etc.) |
| # Tiles Around | Tiles around the circumference |
| # Tiles Vert | Tile rows up the height |
| Depth | Displacement depth in mm |
| Cutout | Punch holes through the wall (see Cutout Mode) |

**Sources for SVG patterns:**
- [PatternMaker](https://patternmaker.dcity.org) — companion app, designed for VaseMaker integration
- [Hero Patterns](https://heropatterns.com)
- [Pattern Monster](https://pattern.monster)
- Any SVG editor (Inkscape, Illustrator)

---

## Cutout Mode

SVG Pattern has a **Cutout** toggle that punches holes through the vase wall for lattice/perforated designs.

- Dark SVG areas become holes, white stays solid — use high-contrast black/white SVGs
- Holes are suppressed in Smooth Zones (keeping base and rim solid)
- Higher resolution = smoother, rounder holes
- Wall Thickness must be > 0 for cutout to work

> For smooth hole edges, use 150+ vertical and 200+ radial resolution.

---

## Smooth Zones

Suppresses all textures (and cutout holes) near the base and/or rim — creating clean solid bands at top and bottom.

| Control | Description |
|---------|-------------|
| Base % | Height from bottom kept smooth (0–100%) |
| Rim % | Height from top kept smooth (0–100%) |
| Base Fade | 0% = hard cutoff, 100% = smooth blend |
| Rim Fade | 0% = hard cutoff, 100% = smooth blend |

> **Tip:** Use 5–10% base and rim with 50–100% fade for a polished look. Essential for cutout designs.
