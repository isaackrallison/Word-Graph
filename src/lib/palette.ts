// Cluster colors: validated 8-slot categorical palette (dark mode) — every
// point also carries a text label, satisfying the secondary-encoding rule.
export const CLUSTER_COLORS = [
  '#3987e5', // blue
  '#199e70', // aqua
  '#c98500', // yellow
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
  '#d55181', // magenta
  '#d95926', // orange
] as const;

/** User-added words get a reserved bright accent, distinct from all clusters. */
export const ADDED_WORD_COLOR = '#ffffff';
export const ADDED_WORD_GLOW = '#7dd3fc';

export const SCENE_BACKGROUND = '#060610';
