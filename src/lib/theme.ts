/** Perceptual luminance check (ITU-R BT.601) — decides whether text on this
 * background should be near-white or near-black, so a custom background color
 * always gets a readable, automatically "balanced" text color instead of the
 * fixed light-on-dark pairing baked in for the default navy theme. */
export function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

/** Maps a Super-Admin-picked font choice to a real CSS font-family stack. Curated,
 * fixed list only — arbitrary fonts aren't supported without a code change, since
 * loading arbitrary web fonts at runtime isn't compatible with next/font's
 * build-time static imports. */
export function fontFamilyCss(font: string | null | undefined): string | undefined {
  switch (font) {
    case 'Georgia':
      return 'Georgia, "Times New Roman", serif';
    case 'Monospace':
      return '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
    case 'System Default':
      return 'system-ui, -apple-system, sans-serif';
    case 'Inter':
    default:
      return undefined; // falls back to the app's default Inter stack
  }
}
