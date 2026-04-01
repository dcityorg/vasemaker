# Profile, Twist & Sway

## Profile Curve

The profile curve controls how the cross-section radius varies from bottom to top. It's a Bezier curve where:
- Horizontal axis = radius multiplier (0–1)
- Vertical axis = height (bottom to top)

| Shape | Meaning |
|-------|---------|
| Straight vertical line | Cylinder (constant radius) |
| Curve left | Narrower at that height |
| Curve right | Wider at that height |

**Classic vase profile:** narrow at bottom, wide in middle, narrow at top.

### Curve Editor Controls

| Action | Result |
|--------|--------|
| Drag point | Move a control point |
| Double-click | Add a new point (max 8) |
| Right-click | Remove a point (min 2 remain) |

> The first and last points control the bottom and top of the vase.

---

## Custom Twist

Uses a Bezier curve to define rotation (in degrees) at each height. The vase cross-section rotates as it rises.

Example: curve from 0° at bottom to 90° at top = quarter turn over full height.

---

## Wave Twist

Sinusoidal (back-and-forth) oscillating twist.

| Control | Description |
|---------|-------------|
| Cycles | Number of oscillations over the height |
| Max Degrees | How far it twists each way |

> Wave Twist + Fluting creates beautiful swirling patterns.

---

## XY Sway

Offsets the cross-section left/right (X) or forward/back (Y) at different heights using Bezier curves.

- X Sway: makes the vase lean
- Combine both axes: S-curves or spiraling offsets
- Scale slider: overall sway intensity

---

## Smoothing

Vertical and Radial Smoothing modulate surface effect intensity, fading textures in/out to prevent a uniform "stamped" look.

| Control | Description |
|---------|-------------|
| Vertical Cycles | Number of fade-in/fade-out bands up the height |
| Start Percent | Where smoothing begins (0 = bottom) |
| Radial Cycles | Number of fade bands around the circumference |
| Offset Angle | Rotational offset for radial smoothing |
