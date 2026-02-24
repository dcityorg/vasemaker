/**
 * Polar cross-section shape functions.
 * Each function takes an angle in degrees (0–360) and shape-specific parameters,
 * and returns the radius at that angle.
 *
 * Ported from VaseMaker13 A.scad — all 18 original shapes.
 * OpenSCAD uses degrees for trig functions, so we use sinD/cosD helpers.
 */

import type { ShapeType, ShapeParams } from './types';
import { sinD, cosD, tanD } from '@/lib/math-utils';

/** Shape function signature: angle in degrees → radius */
export type ShapeFunction = (t: number, params: ShapeParams) => number;

/**
 * Registry of all shape functions, keyed by ShapeType.
 * Replaces the massive ternary chain in the OpenSCAD code.
 */
export const shapeRegistry: Record<ShapeType, ShapeFunction> = {

  // Circle — simplest shape, constant radius
  Circle1: (t, p) => p.scaleFactor,

  // Butterfly — complex multi-lobed shape
  // http://hubpages.com/education/Butterfly-Curves-in-Polar-Coordinates-on-a-Graphing-Calculator
  Butterfly1: (t, p) =>
    0.1 * p.scaleFactor * (
      8 - sinD(t) + 2 * sinD(3 * t) + 2 * sinD(5 * t) -
      sinD(7 * t) + 3 * cosD(2 * t) - 2 * cosD(4 * t)
    ),

  // Cardioid1 — simple cardioid with sharp indentation
  Cardioid1: (t, p) => p.scaleFactor * (1 - sinD(t)),

  // Cardioid2 — smoother indentation (Gary's favorite!)
  Cardioid2: (t, p) => p.scaleFactor * (0.5 * (5 - 4 * cosD(t))),

  // Cardioid3 — smooth with +3 offset term
  Cardioid3: (t, p) => {
    const x = (1 - sinD(t)) * cosD(t);
    const y = (1 - sinD(t)) * sinD(t) + 3;
    return p.scaleFactor * Math.sqrt(x * x + y * y);
  },

  // Diamond — L1 norm shape
  Diamond1: (t, p) => {
    const sx = p.scaleX ?? 1;
    const sy = p.scaleY ?? 1;
    return p.scaleFactor * (1 / (Math.abs((1 / sx) * cosD(t)) + Math.abs((1 / sy) * sinD(t))));
  },

  // Egg1 — egg shape controlled by width parameter
  // http://www.mathematische-basteleien.de/eggcurves.htm
  Egg1: (t, p) => {
    const width = p.width ?? 2.5;
    return 2 * p.scaleFactor * Math.pow(Math.abs(sinD(t)), width);
  },

  // Egg2 — different egg parametrization
  // https://www.geogebra.org/m/J96JSbXz
  Egg2: (t, p) => {
    const a = p.a ?? 0.9;
    const b = p.b ?? 2.4;
    return p.scaleFactor * (cosD(t) * cosD(t) + a * cosD(t) + b);
  },

  // Ellipse — standard polar ellipse
  Ellipse1: (t, p) => {
    const sx = p.scaleX ?? 0.6;
    const sy = p.scaleY ?? 1.2;
    return p.scaleFactor * sx * sy /
      Math.sqrt(Math.pow(sy * cosD(t), 2) + Math.pow(sx * sinD(t), 2));
  },

  // Heart — V-shaped heart
  // http://www.mathematische-basteleien.de/heart.htm
  Heart1: (t, p) => p.scaleFactor * Math.abs(t - 180) / 180,

  // Infinity / Hippopede — figure-eight variant
  // http://mathworld.wolfram.com/Hippopede.html
  Infinity1: (t, p) => {
    const param = p.parameter1 ?? 1.02;
    const val = 2 * 1 * (param - 1 * Math.pow(sinD(t), 2));
    return 0.7 * p.scaleFactor * Math.sqrt(Math.max(0, val));
  },

  // Misc1 — unusual asymmetric shape
  Misc1: (t, p) => {
    const a = p.a ?? 3;
    const b = p.b ?? 1;
    const x = 2 * Math.pow(Math.abs(sinD(t)), a) * cosD(t);
    const y = 2 * Math.pow(Math.abs(sinD(t)), a) * sinD(t) - b;
    return p.scaleFactor * Math.sqrt(x * x + y * y);
  },

  // Polygon — regular n-sided polygon
  // http://math.stackexchange.com/questions/777739/equation-of-a-regular-polygon-in-polar-coordinates
  Polygon1: (t, p) => {
    const n = p.sides ?? 5;
    return p.scaleFactor * cosD(180 / n) /
      cosD(t - (360 / n) * Math.floor((n * t + 180) / 360));
  },

  // Rectangle — axis-aligned rectangle
  // http://stackoverflow.com/questions/4788892/draw-square-with-polar-coordinates
  Rectangle1: (t, p) => {
    const sx = p.scaleX ?? 1;
    const sy = p.scaleY ?? 1.5;
    return p.scaleFactor * Math.min(sx / Math.abs(cosD(t)), sy / Math.abs(sinD(t)));
  },

  // Rose — rhodonea with adjustable center
  // http://mathworld.wolfram.com/Rose.html
  Rose1: (t, p) => {
    const center = p.centerSize ?? 1.5;
    const petals = p.petalNumber ?? 4;
    return p.scaleFactor * (center + cosD(petals * t)) / (1 + center);
  },

  // Square — special case of Rectangle with equal sides
  Square1: (t, p) =>
    p.scaleFactor * Math.min(1 / Math.abs(cosD(t)), 1 / Math.abs(sinD(t))),

  // Astroid — pinched four-pointed star with concave sides
  // https://en.wikipedia.org/wiki/Astroid
  Astroid1: (t, p) => {
    const pw = p.power ?? 0.667;
    const ct = cosD(t);
    const st = sinD(t);
    // Parametric astroid in polar: r = (|cos|^pw + |sin|^pw)^(1/pw) inverted
    // Use superellipse-style formula with exponent < 1 for concave shape
    const sum = Math.pow(Math.abs(ct), pw) + Math.pow(Math.abs(st), pw);
    return p.scaleFactor * Math.pow(sum, 1 / pw);
  },

  // Folium — three-lobed clover shape
  // https://en.wikipedia.org/wiki/Folium
  Folium1: (t, p) => {
    const r = cosD(t) * (4 * sinD(t) * sinD(t) - 1);
    return p.scaleFactor * (0.5 + 0.5 * Math.abs(r));
  },

  // Gear / Cog — steep-sided bumps for mechanical look
  Gear1: (t, p) => {
    const teeth = p.teeth ?? 8;
    const depth = p.depth ?? 0.3;
    const steepness = p.steepness ?? 4;
    return p.scaleFactor * (1 + depth * Math.tanh(steepness * sinD(teeth * t)));
  },

  // Limacon — unifies cardioid family: a + b*cos(t)
  // https://en.wikipedia.org/wiki/Lima%C3%A7on
  Limacon1: (t, p) => {
    const a = p.a ?? 1.5;
    const b = p.b ?? 1;
    return p.scaleFactor * Math.abs(a + b * cosD(t)) / (a + Math.abs(b));
  },

  // Lissajous — complex multi-lobed flowing shapes
  // Convert parametric Lissajous to polar
  Lissajous1: (t, p) => {
    const a = p.a ?? 3;
    const b = p.b ?? 2;
    const phase = p.phase ?? 90;
    const x = sinD(a * t);
    const y = sinD(b * t + phase);
    return p.scaleFactor * Math.sqrt(x * x + y * y) / Math.SQRT2;
  },

  // Rational Rose — cos(p/q * t) with non-integer ratio for overlapping petals
  // https://en.wikipedia.org/wiki/Rose_(mathematics)
  RationalRose1: (t, p) => {
    const pn = p.p ?? 3;
    const q = p.q ?? 2;
    const center = p.centerSize ?? 0.5;
    return p.scaleFactor * (center + Math.abs(cosD(pn / q * t))) / (1 + center);
  },

  // Spirograph / Epitrochoid — classic flower patterns
  // https://en.wikipedia.org/wiki/Epitrochoid
  Spirograph1: (t, p) => {
    const R = p.bigR ?? 3;
    const r = p.smallR ?? 1;
    const d = p.d ?? 0.5;
    const angle = (R + r) / r * t;
    const x = (R + r) * cosD(t) - d * r * cosD(angle);
    const y = (R + r) * sinD(t) - d * r * sinD(angle);
    return p.scaleFactor * Math.sqrt(x * x + y * y) / (R + r + d * r);
  },

  // SuperEllipse — squircle family
  // https://en.wikipedia.org/wiki/Superellipse
  SuperEllipse1: (t, p) => {
    const n = p.n ?? 2.8;
    const sx = p.scaleX ?? 0.6;
    const sy = p.scaleY ?? 1;
    return p.scaleFactor * Math.pow(
      Math.pow(Math.abs(cosD(t) / sx), n) +
      Math.pow(Math.abs(sinD(t) / sy), n),
      -1 / n
    );
  },

  // SuperFormula — Gielis superformula, extremely versatile
  // https://en.wikipedia.org/wiki/Superformula
  SuperFormula1: (t, p) => {
    const a = p.a ?? 1;
    const b = p.b ?? 1;
    const m = p.m ?? 2;
    const n1 = p.n1 ?? 0.4;
    const n2 = p.n2 ?? 1;
    const n3 = p.n3 ?? 2;
    return p.scaleFactor * Math.pow(
      Math.pow(Math.abs(cosD(m * t / 4) / a), n2) +
      Math.pow(Math.abs(sinD(m * t / 4) / b), n3),
      -1 / n1
    );
  },

  // Cassini Oval — pinched peanut / smooth waist shape
  // https://en.wikipedia.org/wiki/Cassini_oval
  // r² = cos(2θ) ± sqrt(e⁴ - sin²(2θ)), e > 1 guarantees single loop
  Cassini1: (t, p) => {
    const e = p.eccentricity ?? 1.5;
    const e4 = e * e * e * e;
    const c2 = cosD(2 * t);
    const s2 = sinD(2 * t);
    const disc = e4 - s2 * s2;
    // e > 1 guarantees disc >= 0, but clamp for safety
    const r2 = c2 + Math.sqrt(Math.max(0, disc));
    // Normalize so max radius ≈ 1 (at θ=0, r² = 1 + e², so r = sqrt(1+e²))
    const norm = Math.sqrt(1 + e * e);
    return p.scaleFactor * Math.sqrt(Math.max(0, r2)) / norm;
  },

  // Cycloid — epicycloid (outward bumps) or hypocycloid (inward cusps)
  // https://en.wikipedia.org/wiki/Epicycloid
  // https://en.wikipedia.org/wiki/Hypocycloid
  Cycloid1: (t, p) => {
    const cusps = Math.round(p.cusps ?? 4);
    const blend = Math.max(0, Math.min(1, p.mode ?? 0)); // 0=epi, 1=hypo
    const R = cusps;
    const r = 1;
    // Epicycloid: point on circle rolling outside
    const exEpi = (R + r) * cosD(t) - r * cosD((R + r) * t);
    const eyEpi = (R + r) * sinD(t) - r * sinD((R + r) * t);
    const maxEpi = R + 2 * r;
    const rEpi = Math.sqrt(exEpi * exEpi + eyEpi * eyEpi) / maxEpi;
    // Hypocycloid: point on circle rolling inside
    const exHypo = (R - r) * cosD(t) + r * cosD((R - r) * t);
    const eyHypo = (R - r) * sinD(t) - r * sinD((R - r) * t);
    const maxHypo = R;
    const rHypo = Math.sqrt(exHypo * exHypo + eyHypo * eyHypo) / maxHypo;
    // Blend between the two
    return p.scaleFactor * (rEpi * (1 - blend) + rHypo * blend);
  },

  // Teardrop — asymmetric pear/raindrop shape (piriform curve)
  // Uses r = 1 - d*cos(t) base with sin-power modulation for pointed end
  // At pointiness=0 → circle, higher values → sharper narrow end
  Teardrop1: (t, p) => {
    const n = p.pointiness ?? 2;
    // Cardioid-like base: (1 + cos(t)) is 2 at t=0 (wide end), 0 at t=180 (pointed end)
    // Raise to power n to control how sharp the pointed end is
    // Then add a floor to keep minimum radius > 0
    const rad = t * Math.PI / 180;
    const base = (1 + Math.cos(rad)) / 2; // 0 to 1, peaks at t=0
    const shaped = Math.pow(base, n);      // sharper point at higher n
    // Blend: at n=0 this is circular, at higher n the t=180 side gets very narrow
    // Floor keeps it from going to zero (avoid degenerate geometry)
    const floor = 0.15;
    const r = floor + (1 - floor) * shaped;
    return p.scaleFactor * r;
  },

  // Nephroid — kidney/bean shape (2-cusped epicycloid)
  // https://en.wikipedia.org/wiki/Nephroid
  // r = sqrt(10 - 6·cos(2θ)) normalized, with tunable indentation depth
  Nephroid1: (t, p) => {
    const indent = p.indent ?? 0.6;
    // indent=0 → circle, indent=1 → full nephroid (deep kidney shape)
    const r = Math.sqrt(4 + 6 * indent - 6 * indent * cosD(2 * t));
    // At indent=0: r = 2 (circle). At indent=1: r = sqrt(10 - 6*cos(2t)), max=4, min=2
    const maxR = 2 + 2 * indent; // normalize to ~1 at maximum
    return p.scaleFactor * r / maxR;
  },
};

/**
 * Get the shape function for a given shape type.
 * Returns the function from the registry, or Circle1 as fallback.
 */
export function getShapeFunction(type: ShapeType): ShapeFunction {
  return shapeRegistry[type] ?? shapeRegistry.Circle1;
}
