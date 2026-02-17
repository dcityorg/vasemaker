/**
 * UI color palette — sidebar group colors and utility colors.
 * Edit these to change the sidebar color scheme without touching components.
 */

/** Colors for sidebar section group headers and section titles */
export const GROUP_COLORS = {
  structure: '#7BA3CF',  // Soft blue — Shape & Structure
  surface:   '#C9A84C',  // Warm amber — Surface (textures, ripples)
  smoothing: '#7BAF7B',  // Sage green — Smoothing
  twist:     '#A78BBA',  // Soft purple — Twist
  settings:  '#9B9B9B',  // Neutral gray — Settings (appearance, resolution)
} as const;

/** Muted color for utility UI elements (dropdowns, toolbar buttons) */
export const UI_MUTED = '#9B9B9B';
