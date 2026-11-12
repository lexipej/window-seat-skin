import type { Clip } from './clips';
import { createWindowSeatMarkup } from '@skin/video/skin';

type Settings = { accent: string; radius: number; marker: string; font: string; scale: string; border: string; accentText: string; fit: string; position: string };

const form = document.querySelector<HTMLFormElement>('#customizer')!;
const colorInput = document.querySelector<HTMLInputElement>('#accent-color')!;
const radiusInput = document.querySelector<HTMLInputElement>('#radius')!;
const radiusOutput = document.querySelector<HTMLOutputElement>('#radius-output')!;
const markerSelect = document.querySelector<HTMLSelectElement>('#marker')!;
const fontSelect = document.querySelector<HTMLSelectElement>('#font')!;
const scaleSelect = document.querySelector<HTMLSelectElement>('#scale')!;
const borderSelect = document.querySelector<HTMLSelectElement>('#border')!;
const accentTextSelect = document.querySelector<HTMLSelectElement>('#accent-text')!;
const fitSelect = document.querySelector<HTMLSelectElement>('#fit')!;
const positionSelect = document.querySelector<HTMLSelectElement>('#position')!;
// What the callout names over each marker's still.
const CALLOUTS: Record<string, [string, string]> = {
  station: ['North Atlantic Ocean', '41.2° N 56.6° W'],
  dot: ['North Atlantic Ocean', '41.2° N 56.6° W'],
  plane: ['Cruising altitude', ''],
  ship: ['Open water', ''],
  car: ['Coast road', ''],
  helicopter: ['Headland', ''],
  train: ['Mountain pass', ''],
};
const preview = document.querySelector<HTMLElement>('#preview-window')!;
const stage = preview.querySelector<HTMLElement>('.preview-stage')!;
const backdrop = preview.querySelector<HTMLElement>('.backdrop')!;
// Marker photos dropped into site/public/reuse/<marker>.jpg are picked up at build time; missing ones keep the
// CSS backdrop, and nothing is requested that doesn't exist.
const MARKER_IMAGES = Object.fromEntries(Object.entries(
  import.meta.glob<string>('../public/reuse/*.jpg', { eager: true, query: '?url', import: 'default' }),
).map(([path, url]) => [path.split('/').pop()!.replace('.jpg', ''), url]));
// The preview matches the page player's window size.
const mainWindow = document.querySelector<HTMLElement>('#player-slot');
if (mainWindow) new ResizeObserver(([entry]) => preview.style.setProperty('--preview-w', `${entry.borderBoxSize?.[0]?.inlineSize ?? mainWindow.offsetWidth}px`)).observe(mainWindow);
const snippet = document.querySelector<HTMLElement>('#snippet')!;
const copyButton = document.querySelector<HTMLButtonElement>('#copy-snippet')!;
const copyStatus = document.querySelector<HTMLElement>('#copy-status')!;
const DEFAULT_RADIUS = 14;

let fixture: HTMLElement | undefined;

// A static copy of the skin's own markup (as on the spec sheet): controls shown, popups and the callout hidden, mid strip.
function buildFixture() {
  const template = document.createElement('template');
  template.innerHTML = createWindowSeatMarkup();
  const root = template.content.querySelector<HTMLElement>('media-container')!;
  for (const node of [root, ...root.querySelectorAll('[id], [trigger], [commandfor]')]) {
    for (const attr of ['id', 'trigger', 'commandfor']) node.removeAttribute(attr);
  }
  root.setAttribute('data-daylight', 'day');
  root.setAttribute('aria-hidden', 'true');
  root.inert = true;
  root.querySelector('media-controls-content')?.setAttribute('data-visible', '');
  root.querySelectorAll('media-tooltip, media-popover, media-menu, media-volume-popover, media-dialog-popup, .media-indicator-group, .media-buffering-indicator')
    .forEach((element) => element.setAttribute('hidden', ''));
  // The live callout element hides itself without a player, so the preview shows a plain copy of its markup.
  const callout = root.querySelector('ws-callout');
  if (callout) {
    const copy = document.createElement('div');
    copy.className = 'ws-callout';
    copy.innerHTML = callout.innerHTML;
    copy.querySelector('.ws-callout-announcer')?.remove();
    callout.replaceWith(copy);
  }
  root.querySelectorAll('.video-controls-center, .media-poster, ws-motion, .ws-pip-scrim, ws-orbit').forEach((element) => element.remove());
  const slider = root.querySelector<HTMLElement>('media-time-slider');
  const segment = slider?.querySelector<HTMLTemplateElement>('media-time-slider-chapters template')?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
  if (slider) {
    slider.setAttribute('data-orientation', 'horizontal');
    slider.style.setProperty('--media-slider-fill', '58%');
    slider.style.setProperty('--media-slider-buffer', '72%');
    slider.style.setProperty('--media-slider-pointer', '58%');
  }
  // The time readout as the spec sheet draws it.
  const group = root.querySelector('.media-time-group');
  ['1:13', '1:13', '/', '2:06'].forEach((value, index) => { if (group?.children[index]) group.children[index].textContent = value; });
  stage.append(root);
  // The chapters element clears its children when it connects, so the one full-width segment goes in afterwards.
  setTimeout(() => {
    const chapters = root.querySelector('media-time-slider-chapters');
    if (!chapters || !segment) return;
    segment.style.setProperty('--media-slider-chapter-start', '0%');
    segment.style.setProperty('--media-slider-chapter-end', '100%');
    chapters.replaceChildren(segment);
  });
  return root;
}
let clip: Clip | undefined;

function read(): Settings {
  const choice = new FormData(form).get('accent') as string;
  return {
    accent: choice === 'sun' ? '' : choice === 'custom' ? colorInput.value : choice,
    radius: radiusInput.valueAsNumber,
    marker: markerSelect.value,
    font: fontSelect.value,
    scale: scaleSelect.value,
    border: borderSelect.value,
    accentText: accentTextSelect.value,
    fit: fitSelect.value,
    position: positionSelect.value,
  };
}

// Only the skin's public custom properties; each appears in the snippet when it differs from the default.
function properties({ accent, radius, font, scale, border, accentText, fit, position }: Settings) {
  return [
    accent && ['--media-accent-color', accent],
    accentText && ['--media-accent-text-color', accentText],
    radius !== DEFAULT_RADIUS && ['--media-border-radius', `${radius}px`],
    border && ['--media-border-color', border === 'accent' ? (accent || 'var(--media-accent-color, #ffc247)') : border],
    font && ['--media-font-family', font],
    scale && ['--media-scale-unit', scale],
    fit && ['--media-object-fit', fit],
    position && ['--media-object-position', position],
  ].filter((entry): entry is [string, string] => Boolean(entry));
}

function render() {
  const settings = read();
  radiusOutput.value = `${settings.radius} px`;
  fixture ??= buildFixture();
  for (const name of ['--media-accent-color', '--media-accent-text-color', '--media-border-radius', '--media-border-color', '--media-font-family', '--media-scale-unit', '--media-object-fit', '--media-object-position']) fixture.style.removeProperty(name);
  for (const [name, value] of properties(settings)) fixture.style.setProperty(name, value);
  fixture.setAttribute('marker', settings.marker);
  preview.style.setProperty('--preview-radius', `${settings.radius}px`);
  backdrop.dataset.scene = settings.marker;
  // The preview has a still, not a video, so picture fit is shown on the still.
  backdrop.style.backgroundSize = settings.fit === 'contain' ? 'contain' : '';
  const photo = MARKER_IMAGES[settings.marker];
  if (photo) backdrop.style.setProperty('background', `#0a1020 url("${photo}") center / cover no-repeat`);
  else backdrop.style.removeProperty('background');
  backdrop.style.backgroundPosition = settings.position ? `center ${settings.position}` : '';
  if (settings.fit === 'contain') backdrop.style.backgroundSize = 'contain';
  const [place, coordinates] = CALLOUTS[settings.marker] ?? CALLOUTS.station;
  const name = fixture.querySelector('.ws-callout-name');
  if (name) name.textContent = place;
  const where = fixture.querySelector<HTMLElement>('.ws-callout-coordinates');
  if (where) {
    where.hidden = !coordinates;
    where.querySelector('bdi')!.textContent = coordinates;
  }
  if (clip) backdrop.style.setProperty('--station-still', `url("https://image.mux.com/${clip.playbackId}/thumbnail.webp?time=30&width=1280")`);
  radiusInput.style.setProperty('--fill', `${settings.radius / Number(radiusInput.max) * 100}%`);

  const style = properties(settings).map(([name, value]) => `${name}: ${value}`).join('; ');
  const attributes = [
    settings.marker !== 'station' && `marker="${settings.marker}"`,
    style && `style="${style}"`,
  ].filter(Boolean).join(' ');
  snippet.textContent = [
    `<video-player${attributes ? ' ' + attributes : ''}></video-player>`,
    '',
    `import { createWindowSeatMarkup } from './skin/video/skin';`,
    `player.innerHTML = createWindowSeatMarkup();`,
    `player.querySelector('media-container').prepend(video);`,
    '',
    `// Mux playback ID of this pass: ${clip?.playbackId ?? ''}`,
    `// <mux-video playback-id="${clip?.playbackId ?? ''}" playsinline></mux-video>`,
  ].join('\n');
}

/** The preview shows a frame of the playing pass and its playback ID; it never changes the page player. */
export function customizePlayer(_player: HTMLElement, nextClip: Clip) {
  clip = nextClip;
  render();
}

form.addEventListener('input', render);
form.addEventListener('reset', () => setTimeout(render));
form.addEventListener('submit', (event) => event.preventDefault());
colorInput.addEventListener('input', () => {
  form.querySelector<HTMLInputElement>('input[name="accent"][value="custom"]')!.checked = true;
  render();
});
let copiedTimer = 0;
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(snippet.textContent ?? '');
    copyStatus.textContent = 'Snippet copied.';
    copyButton.toggleAttribute('data-copied', true);
    clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => copyButton.removeAttribute('data-copied'), 1500);
  } catch {
    copyStatus.textContent = 'Copy failed: select the snippet and copy it.';
  }
});
