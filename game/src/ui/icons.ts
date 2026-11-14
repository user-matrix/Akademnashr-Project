/** Inline SVG icons (consistent on every platform, unlike emoji). */
const svg = (body: string, fill = false) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="${fill ? 'currentColor' : 'none'}" stroke="${
    fill ? 'none' : 'currentColor'
  }" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/>', true),
  play: svg('<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>', true),
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>'),
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  settings: svg(
    '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.54V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.54 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.54-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.54-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.54V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.54 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.54 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.54 1z"/>',
  ),
  crown: svg('<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7z"/>', true),
  coin: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#ffc83d"/><circle cx="12" cy="12" r="7" fill="#ffb000"/><path d="M12 7.5l1.4 2.9 3.1.4-2.3 2.2.6 3.1L12 14.6l-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z" fill="#fff3c4"/></svg>`,
  rotate: svg('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>'),
  hammer: svg(
    '<path d="M14.5 4.5l5 5-2.5 2.5-5-5z"/><path d="M12 7l-1.5-1.5a2 2 0 0 1 0-2.8L11 2.2"/><path d="M14.5 12L5 21.5a1.8 1.8 0 0 1-2.5-2.5L12 9.5"/>',
  ),
  reroll: svg('<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>'),
  sound: svg('<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  vibrate: svg('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 8v8M21 8v8"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'),
  fire: svg('<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"/>', true),
  ad: svg('<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  gift: svg('<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8v13M12 8S10.5 3 8 3.5 6.5 8 12 8zM12 8s1.5-5 4-4.5S17.5 8 12 8z"/>'),
  palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15" cy="8" r="1.2" fill="currentColor"/>'),
};

export type IconName = keyof typeof ICONS;
