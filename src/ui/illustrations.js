// Small hand-drawn inline SVG illustrations for the Conversations screen — kept
// as plain strings (no external image assets) so the app stays fully offline.

export const TALKING_ILLUSTRATION = `
<svg viewBox="0 0 220 130" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two people talking">
  <ellipse cx="110" cy="122" rx="88" ry="5" fill="#00000014"/>

  <rect x="18" y="68" width="62" height="48" rx="24" fill="#2f6f5e"/>
  <circle cx="49" cy="52" r="23" fill="#f4d9b0"/>
  <circle cx="41" cy="53" r="2.4" fill="#2c2c2c"/>
  <circle cx="57" cy="53" r="2.4" fill="#2c2c2c"/>
  <path d="M40 61 Q49 66 58 61" stroke="#2c2c2c" stroke-width="2.2" fill="none" stroke-linecap="round"/>

  <rect x="10" y="4" width="76" height="36" rx="15" fill="#e4f1ec" stroke="#2f6f5e" stroke-width="1.5"/>
  <polygon points="36,38 48,38 34,52" fill="#e4f1ec" stroke="#2f6f5e" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M24 16 q6 -7 12 0 q6 -7 12 0 q6 -7 12 0" stroke="#2f6f5e" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M24 27 q6 -7 12 0 q6 -7 12 0" stroke="#2f6f5e" stroke-width="2.6" fill="none" stroke-linecap="round"/>

  <rect x="140" y="68" width="62" height="48" rx="24" fill="#e8a33d"/>
  <circle cx="171" cy="52" r="23" fill="#e8b57e"/>
  <circle cx="163" cy="53" r="2.4" fill="#2c2c2c"/>
  <circle cx="179" cy="53" r="2.4" fill="#2c2c2c"/>
  <path d="M162 61 Q171 66 180 61" stroke="#2c2c2c" stroke-width="2.2" fill="none" stroke-linecap="round"/>

  <rect x="134" y="4" width="76" height="36" rx="15" fill="#fdf1de" stroke="#e8a33d" stroke-width="1.5"/>
  <polygon points="184,38 172,38 186,52" fill="#fdf1de" stroke="#e8a33d" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M150 16 q6 -7 12 0 q6 -7 12 0" stroke="#e8a33d" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <path d="M150 27 q6 -7 12 0 q6 -7 12 0 q6 -7 12 0" stroke="#e8a33d" stroke-width="2.6" fill="none" stroke-linecap="round"/>
</svg>
`;

export const WRITING_ILLUSTRATION = `
<svg viewBox="0 0 220 130" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A person writing">
  <ellipse cx="110" cy="122" rx="88" ry="5" fill="#00000014"/>

  <rect x="38" y="100" width="144" height="10" rx="4" fill="#d8d2c4"/>
  <rect x="48" y="110" width="8" height="14" fill="#c3bcac"/>
  <rect x="164" y="110" width="8" height="14" fill="#c3bcac"/>

  <rect x="78" y="58" width="64" height="46" rx="22" fill="#2f6f5e"/>
  <circle cx="110" cy="42" r="24" fill="#f4d9b0"/>
  <circle cx="102" cy="43" r="2.4" fill="#2c2c2c"/>
  <circle cx="118" cy="43" r="2.4" fill="#2c2c2c"/>
  <path d="M101 51 Q110 55 119 51" stroke="#2c2c2c" stroke-width="2.2" fill="none" stroke-linecap="round"/>

  <rect x="76" y="86" width="68" height="42" rx="6" fill="#ffffff" stroke="#e0dccf" stroke-width="1.5"/>
  <path d="M86 98 h30 M86 106 h46 M86 114 h36" stroke="#c7c1b2" stroke-width="3" stroke-linecap="round"/>

  <path d="M136 92 Q150 84 158 72" stroke="#f4d9b0" stroke-width="10" stroke-linecap="round" fill="none"/>
  <rect x="153" y="58" width="9" height="28" rx="3" fill="#e8a33d" transform="rotate(38 157.5 72)"/>
  <path d="M158.5 55.5 l7.5 7 -12 4.5z" fill="#2c2c2c" transform="rotate(38 157.5 72)"/>
  <path d="M170 60 q4 -4 8 -2 M172 68 q5 -3 9 0" stroke="#e8a33d" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.6"/>
</svg>
`;
