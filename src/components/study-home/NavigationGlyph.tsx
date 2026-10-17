import type { ReactElement } from 'react';
import { MATERIAL_GLYPHS } from './data';

export type NavigationGlyphTab = keyof typeof MATERIAL_GLYPHS;

interface NavigationGlyphProps {
  tab: NavigationGlyphTab;
  active?: boolean;
  size?: number;
}

export default function NavigationGlyph({
  tab,
  active = false,
  size = 24,
}: NavigationGlyphProps): ReactElement {
  const glyphs = MATERIAL_GLYPHS[tab];
  const shown = active && glyphs.filled ? glyphs.filled : glyphs.outline;

  return (
    <svg width={size} height={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
      {shown.map((glyph, index) => (
        <path key={index} d={glyph.d} transform={glyph.transform} />
      ))}
    </svg>
  );
}
