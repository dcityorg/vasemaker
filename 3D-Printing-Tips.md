# 3D Printing Tips

VaseMaker generates watertight STL files ready for any slicer. The exported mesh matches exactly what you see in the preview.

---

## Wall Thickness

Match wall thickness to your nozzle size:

| Nozzle | Recommended Wall |
|--------|-----------------|
| 0.4mm | 0.8–1.2mm (2–3 perimeters) |
| 0.6mm | 1.2–1.8mm |

> Too thin = fragile and may not slice. Too thick = hides surface detail. If the slicer drops sections, try increasing to 2–3mm.

---

## Smooth Inner Wall

Enable **Smooth Inner** to keep the inside perfectly smooth while the outside has textures. Prevents textures from creating paper-thin spots.

| Control | Description |
|---------|-------------|
| Smooth Inner | Toggle on for smooth inner surface |
| Min Wall | Minimum wall thickness — prevents textures from pushing through |

---

## Vase Mode (Spiral Printing)

Set **wall thickness to 0** in VaseMaker to export a single surface — perfect for slicer vase mode (spiral outer contour):

| Slicer | Setting |
|--------|---------|
| Cura | Special Modes → Spiralize Outer Contour |
| PrusaSlicer | Print Settings → Layers → Spiral Vase |
| OrcaSlicer | Others → Spiral Vase |

> Vase mode prints are fast and beautiful but fragile — great for display.

---

## Resolution

| Axis | General Use | Fine Textures |
|------|-------------|---------------|
| Vertical | 100–200 | Up to 500 |
| Radial | 200–360 | Up to 720 |

Enable **Show Facets** to preview the actual polygon edges in your STL. If you see visible flat faces, increase resolution.

> For Square Flute with 80 pillars, use 400+ radial resolution.

---

## Cutout / Lattice Prints

| Setting | Recommendation |
|---------|----------------|
| Wall thickness | 1.0–2.0mm for structural bars |
| Smooth Zones | 5–10% base and rim, keeps top/bottom solid |
| SVG | High-contrast black/white only |
| Resolution | 150+ vertical, 200+ radial for smooth hole edges |

---

## Shape Printability

Some shapes have thin areas that cause slicer problems:

| Shape | Issue |
|-------|-------|
| Spirograph | Very thin lobes — display piece only |
| Butterfly | Thin pinch point — use 2–3mm walls |
| SuperFormula (extreme values) | Can produce paper-thin spikes |
| Astroid, Folium | Sharp cusps = thin edges |
| Cycloid Hypo mode | Inward cusps with extreme thin points |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Slicer drops sections | Increase wall thickness (try 2–3mm) |
| Non-manifold / holes in slicer | Increase wall thickness or resolution |
| Print too fragile | Increase wall thickness and base thickness |
| Surface detail not visible | Reduce wall thickness or increase texture depth |
| STL file too large | Lower radial resolution |
| Textures not showing | Check master Textures toggle is on |
| Self-intersection / inside-out patches | Reduce texture depth, increase radius, simplify shape |
