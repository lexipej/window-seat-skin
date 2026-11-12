import { registerIcons } from '@videojs/html/icons';

// Solid two-tone glyphs on a 20 px grid: a main shape plus a secondary layer at 45%.
// Remaining single-shape glyphs are Phosphor Fill paths (MIT). Animated parts live inline in skin.html.
const icon = (body: string, grid = 256) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 ${grid} ${grid}" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;
const svg = (path: string) => icon(`<path d="${path}"/>`);

const volumeBody = "<path transform=\"translate(0 .8) scale(.0625 .072)\" d=\"M163.52,24.81a8,8,0,0,0-8.43.88L85.25,80H40A16,16,0,0,0,24,96v64a16,16,0,0,0,16,16H85.25l69.84,54.31A7.94,7.94,0,0,0,160,232a8,8,0,0,0,8-8V32A8,8,0,0,0,163.52,24.81Z\"/>";
const volumeWaves = [
  "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" d=\"M12.1 8.15a3 3 0 0 1 0 3.7\"/>",
  "<path opacity=\".45\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" d=\"M14 6.5a5.4 5.4 0 0 1 0 7\"/>",
  "<path opacity=\".45\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" d=\"M15.9 4.9a7.9 7.9 0 0 1 0 10.2\"/>",
];
const muteSlash = `<g fill="none" stroke-linecap="round"><path stroke="var(--ws-band)" stroke-width="4" pathLength="1" d="M3.25 3.25 16.75 16.75"/><path stroke="currentColor" stroke-width="1.9" pathLength="1" d="M3.25 3.25 16.75 16.75"/></g>`;

export const FAMILY = 'window-seat';

export function registerWindowSeatIcons(): void {
  // Classes name the parts that menu rows animate on highlight (see window-seat.css and motion.ts).
  const captions = icon('<rect opacity=".45" x="1.5" y="3.5" width="17" height="13" rx="3"/><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path class="ws-captions-c" pathLength="1" d="M8.14 8.44A1.9 1.9 0 1 0 8.14 11.56"/><path class="ws-captions-c" pathLength="1" d="M14.83 8.44A1.9 1.9 0 1 0 14.83 11.56"/></g>', 20);
  const pip = (x: number, y: number) => icon(`<rect opacity=".45" x="1.5" y="3.5" width="17" height="13" rx="3"/><rect class="ws-pip-window" x="${x}" y="${y}" width="7" height="5" rx="1.4"/>`, 20);
  const airplay = icon('<path opacity=".45" d="M4 3h12a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 16 15h-1.2l-3.6-4.3a1.6 1.6 0 0 0-2.4 0L5.2 15H4a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 4 3Z"/><path d="M9.4 12.2a.8.8 0 0 1 1.2 0l3.3 4a.8.8 0 0 1-.6 1.3H6.7a.8.8 0 0 1-.6-1.3Z"/>', 20);
  const cast = icon('<path opacity=".45" d="M4 3.5h12A2.5 2.5 0 0 1 18.5 6v8a2.5 2.5 0 0 1-2.5 2.5h-4.2a9.3 9.3 0 0 0-9.3-9.2h-1V6A2.5 2.5 0 0 1 4 3.5Z"/><path d="M1.5 9.2a7.3 7.3 0 0 1 7.3 7.3H6.9a5.4 5.4 0 0 0-5.4-5.4Z"/><path d="M1.5 12.9a3.6 3.6 0 0 1 3.6 3.6H1.5Z"/>', 20);
  registerIcons(FAMILY, {
    'close': icon('<path d="m5 5 10 10m0-10L5 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', 20),
    'check': icon('<path d="m4.5 10 3.5 3.5 7.5-7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', 20),
    'chevron': icon('<path d="M7.05 4.05a1.3 1.3 0 0 1 1.84 0l5.03 5.03a1.3 1.3 0 0 1 0 1.84l-5.03 5.03a1.3 1.3 0 0 1-1.84-1.84L11.16 10 7.05 5.89a1.3 1.3 0 0 1 0-1.84Z"/>', 20),
    'switches': icon('<rect opacity=".45" x="2.5" y="3.5" width="15" height="5.6" rx="2.8"/><circle class="ws-knob ws-knob-start" cx="5.9" cy="6.3" r="2"/><rect opacity=".45" x="2.5" y="10.9" width="15" height="5.6" rx="2.8"/><circle class="ws-knob ws-knob-end" cx="14.1" cy="13.7" r="2"/>', 20),
    'speech': icon('<path opacity=".45" d="M4.5 3.5h11A2.5 2.5 0 0 1 18 6v7a2.5 2.5 0 0 1-2.5 2.5H8.2l-3.4 2.6a.8.8 0 0 1-1.3-.63V15.4A2.5 2.5 0 0 1 2 13V6a2.5 2.5 0 0 1 2.5-2.5Z"/><rect class="ws-speech-line" x="5.6" y="7" width="8.8" height="1.8" rx=".9"/><rect class="ws-speech-line" x="5.6" y="10.3" width="5.6" height="1.8" rx=".9"/>', 20),
    'speed': icon('<path opacity=".45" d="M10 4a8 8 0 0 0-7.4 11 1.6 1.6 0 0 0 1.5 1h11.8a1.6 1.6 0 0 0 1.5-1A8 8 0 0 0 10 4Z"/><path class="ws-speed-needle" d="M14.9 6.6a.9.9 0 0 1 .2 1.2l-3.4 5a2 2 0 1 1-2.9-2.6l4.9-3.7a.9.9 0 0 1 1.2.1Z"/>', 20),
    'volume-high': icon(`${volumeBody}${volumeWaves.join('')}`, 20),
    'volume-low': icon(`${volumeBody}${volumeWaves[0]}`, 20),
    'volume-off': icon(`${volumeBody}${muteSlash}`, 20),
    'captions-off': captions,
    'captions-on': captions,
    'fullscreen-enter': svg('M93.66,202.34A8,8,0,0,1,88,216H48a8,8,0,0,1-8-8V168a8,8,0,0,1,13.66-5.66ZM88,40H48a8,8,0,0,0-8,8V88a8,8,0,0,0,13.66,5.66l40-40A8,8,0,0,0,88,40ZM211.06,160.61a8,8,0,0,0-8.72,1.73l-40,40A8,8,0,0,0,168,216h40a8,8,0,0,0,8-8V168A8,8,0,0,0,211.06,160.61ZM208,40H168a8,8,0,0,0-5.66,13.66l40,40A8,8,0,0,0,216,88V48A8,8,0,0,0,208,40Z'),
    'fullscreen-exit': svg('M152,96V48a8,8,0,0,1,13.66-5.66l48,48A8,8,0,0,1,208,104H160A8,8,0,0,1,152,96ZM96,152H48a8,8,0,0,0-5.66,13.66l48,48A8,8,0,0,0,104,208V160A8,8,0,0,0,96,152ZM99.06,40.61a8,8,0,0,0-8.72,1.73l-48,48A8,8,0,0,0,48,104H96a8,8,0,0,0,8-8V48A8,8,0,0,0,99.06,40.61ZM208,152H160a8,8,0,0,0-8,8v48a8,8,0,0,0,13.66,5.66l48-48A8,8,0,0,0,208,152Z'),
    'pip-enter': pip(4, 6),
    'pip-exit': pip(9, 9),
    'airplay-enter': airplay,
    'airplay-exit': airplay,
    'cast-enter': cast,
    'cast-exit': cast,
  });
}
