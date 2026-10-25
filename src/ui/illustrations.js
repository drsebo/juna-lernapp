// Icon tiles for the two Conversations modes — same language as the Home area
// cards (rounded tile in the area's colour, white glyph, pressed-edge shadow).
// Kept as plain inline SVG strings (no external assets) so the app stays fully
// offline, and coloured via the CSS tokens so dark mode just works.

export const TALKING_ILLUSTRATION = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Speaking">
  <rect x="6" y="10" width="88" height="84" rx="26" style="fill:var(--color-primary-press)"/>
  <rect x="6" y="6" width="88" height="84" rx="26" style="fill:var(--color-primary)"/>
  <circle cx="78" cy="20" r="16" fill="#ffffff" opacity="0.14"/>

  <rect x="40" y="22" width="20" height="34" rx="10" fill="#ffffff"/>
  <path d="M31 46a19 19 0 0 0 38 0" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M50 65v9M41 75h18" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round"/>

  <path d="M20 36q-5 8 0 16" stroke="var(--color-accent)" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M80 36q5 8 0 16" stroke="var(--color-accent)" stroke-width="4.5" fill="none" stroke-linecap="round"/>
</svg>
`;

export const WRITING_ILLUSTRATION = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Written chat">
  <rect x="6" y="10" width="88" height="84" rx="26" style="fill:color-mix(in srgb, var(--tone-conversations) 70%, #000)"/>
  <rect x="6" y="6" width="88" height="84" rx="26" style="fill:var(--tone-conversations)"/>
  <circle cx="78" cy="20" r="16" fill="#ffffff" opacity="0.14"/>

  <path d="M20 24h38a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8H32l-9 8v-8h-3a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8Z" fill="#ffffff"/>
  <path d="M24 35h28M24 43h18" stroke="var(--tone-conversations)" stroke-width="4" stroke-linecap="round"/>

  <path d="M48 52h30a8 8 0 0 1 8 8v8a8 8 0 0 1-8 8h-2v8l-9-8H48a8 8 0 0 1-8-8v-8a8 8 0 0 1 8-8Z" style="fill:var(--color-accent)"/>
  <circle cx="53" cy="64" r="3.2" fill="#1d1b3a"/>
  <circle cx="63" cy="64" r="3.2" fill="#1d1b3a"/>
  <circle cx="73" cy="64" r="3.2" fill="#1d1b3a"/>
</svg>
`;
