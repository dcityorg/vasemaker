# Cross-Section Shapes

VaseMaker includes 29 cross-section shapes that determine the vase's horizontal profile — what it looks like from above.

## Shape Categories

### Simple
| Shape | Notes |
|-------|-------|
| Circle | Perfect circle — the default starting point |
| Ellipse | Stretched circle with independent X/Y radius control |
| Square | Square with corner rounding control |
| Rectangle | Rectangular with corner rounding, independent width/height |
| Diamond | Rotated square / rhombus |
| Polygon | Regular polygon with 3–12 sides |

### Organic
| Shape | Notes |
|-------|-------|
| Heart | Classic heart shape |
| Egg (2 variants) | Asymmetric egg/oval shapes |
| Butterfly | Winged figure-eight shape with thin pinch point — needs thick walls for printing |
| Cardioid (3 variants) | Cardioid curve variants |
| Teardrop | Asymmetric raindrop/pear shape. Pointiness controls how sharp the narrow end is |
| Nephroid | Kidney/bean shape with a single smooth indentation. Indent controls depth |

### Mathematical
| Shape | Notes |
|-------|-------|
| Rose | Polar rose with multiple petals |
| SuperEllipse | Between rectangle and ellipse (Lamé curve) |
| SuperFormula | The most versatile — see SuperFormula Guide below |
| Infinity | Figure-eight / lemniscate |
| Limacon | Snail-shell curve |
| Folium | Leaf-shaped curve with a sharp cusp |
| Astroid | 4-cusped hypocycloid — sharp points |
| Lissajous | Parametric Lissajous figure |
| RationalRose | Rational rose with fraction parameters |
| Cassini Oval | Smooth pinched oval. Pinch slider controls waist narrowness |

### Mechanical
| Shape | Notes |
|-------|-------|
| Gear | Up to 60 teeth — surprisingly printable |
| Spirograph | Epitrochoid curves — very thin lobes, display only |
| Cycloid | Epi/Hypo slider blends between outward bumps and inward cusps |
| Piriform | Pear-shaped curve |

---

## Shape Morphing

Enable **Top Shape** to blend from the bottom shape at the base to the top shape at the rim. Each shape has independent parameters.

**Great combos:**
- Circle → Star
- Square → Heart
- Polygon → Gear
- Circle → SuperFormula (star)

---

## SuperFormula Guide

The SuperFormula (Gielis formula) is the most versatile shape — circles, stars, polygons, petals, and organic forms from 6 parameters.

**Formula:** r(θ) = |cos(mθ/4)/a|^n2 + |sin(mθ/4)/b|^n3, raised to -1/n1

| Parameter | Effect | Tip |
|-----------|--------|-----|
| m | Number of symmetry lobes/petals (1–20) | Start here — sets the count |
| n1 | Overall roundness (lower = puffier, higher = pointier) | Main shape control |
| n2 | Cos term sharpness | Fine-tune lobe shape |
| n3 | Sin term sharpness | Fine-tune lobe shape |
| a | Horizontal stretch (0.1–5) | Squash/stretch |
| b | Vertical stretch (0.1–5) | Squash/stretch |

**Example presets:**

| Shape | m | n1 | n2 | n3 |
|-------|---|----|----|----|
| Circle | 0 | 1 | 1 | 1 |
| Square | 4 | 100 | 100 | 100 |
| Triangle | 3 | 100 | 100 | 100 |
| Star (5-point) | 5 | 0.3 | 1 | 1 |
| 4-petal flower | 8 | 0.5 | 1 | 1 |
| Asteroid | 4 | 0.5 | 0.5 | 0.5 |
| Soft clover | 6 | 1 | 1 | 6 |
| Spiky star | 5 | 2 | 7 | 7 |

> **Tip:** Set `m` first to get the right number of lobes, then adjust `n1` for roundness vs sharpness. `n2`/`n3` fine-tune each lobe.

---

## Printability Notes

Some shapes have thin areas that may cause printing problems:

| Shape | Issue | Workaround |
|-------|-------|------------|
| Spirograph | Very thin lobes, near-zero width | Display only, increase radius |
| Butterfly | Thin pinch point | Use 2–3mm wall thickness |
| SuperFormula (extreme values) | Thin spikes or deep concavities | Start with mild values |
| Astroid, Folium | Sharp cusps | Expect thin edges at cusp points |
| Cycloid (Hypo mode) | Sharp inward cusps | Low cusp count = extreme thin points |

> **Slicer showing missing sections?** Increase wall thickness — complex shapes have pinch points where thin walls can't be sliced.
