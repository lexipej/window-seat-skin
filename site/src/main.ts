import { clips, type Clip } from './clips';
import { clipCredit, createPlayer } from './player';
import { loadStrip } from './strip';
import { parseOrbit } from '@skin/video/orbit-data';
import type { GlobeMode, PassGlobe } from './pass-globe';
import { customizePlayer } from './customizer';
import { renderLinks } from './links';
import { followNotes, initNotes } from './notes';
import { createSky } from './sky';
import { followTelemetry } from './telemetry';

const root = document.documentElement;
const playerSlot = document.querySelector<HTMLElement>('#player-slot')!;
const clipTitle = document.querySelector<HTMLElement>('#clip-title')!;
const clipMeta = document.querySelector('#clip-meta')!;
const clipDetails = document.querySelector('#clip-details')!;
const clipSource = document.querySelector('#clip-source')!;
const list = document.querySelector('#clip-picker')!;
const status = document.querySelector<HTMLElement>('#clip-status')!;
const links = new Map<string, HTMLAnchorElement>();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const sky = createSky(root);
let activeClip: Clip | undefined;
// Footage switch and width presets.
let lastOrbitClip: Clip = clips.find((clip) => clip.tracks) ?? clips[0];
const plainClip = clips.find((clip) => !clip.tracks);
const footageButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-footage]')];
const widthButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-width]')];
const WIDTHS = ['phone', 'tablet', 'full'] as const;
type Width = typeof WIDTHS[number];
let disconnect: (() => void) | undefined;
let disconnectNotes: (() => void) | undefined;
let globe: PassGlobe | undefined;
let unsubscribeGlobe: (() => void) | undefined;
let currentPlayer: ReturnType<typeof createPlayer> | undefined;
const globeHost = document.querySelector<HTMLElement>('.globe')!;
const globeTip = globeHost.querySelector<HTMLElement>('.globe-tip')!;

const orbitUrl = (clip: Clip) => `${import.meta.env.BASE_URL}${clip.id}.json`;
const passNumber = (clip: Clip) => String(clips.indexOf(clip) + 1).padStart(2, '0');

// "ISS075-E-…-20261003-Both" → expedition and date of the pass.
function passMeta(clip: Clip) {
  const [, expedition, year, month, day] = clip.nasaId.match(/^(ISS\d+)-.*-(\d{4})(\d{2})(\d{2})-/) ?? [];
  const date = year ? `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}` : '';
  return [`Pass ${passNumber(clip)} of ${String(clips.length).padStart(2, '0')}`, expedition, date, clip.light, clip.length].filter(Boolean).join(' · ');
}

function clipUrl(clip: Clip) {
  const url = new URL(location.href);
  url.searchParams.set('clip', clip.id);
  url.hash = '';
  return url;
}

// "Brazil to Kazakhstan" reads as a route; other titles stay as written.
function routeLabel(title: string) {
  const label = document.createElement('span');
  label.className = 'pass-route';
  const [from, ...rest] = title.split(' to ');
  if (!rest.length) {
    label.textContent = title;
    return label;
  }
  const arrow = document.createElement('span');
  arrow.className = 'pass-arrow';
  arrow.textContent = '→';
  label.append(from, arrow, rest.join(' to '));
  return label;
}

for (const clip of clips) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  const number = document.createElement('span');
  const tag = document.createElement('span');
  const strip = document.createElement('span');
  const length = document.createElement('span');
  number.className = 'pass-number';
  number.textContent = passNumber(clip);
  tag.className = 'pass-tag';
  tag.textContent = clip.tracks ? clip.light : `${clip.light} · plain`;
  strip.className = 'pass-strip';
  strip.setAttribute('aria-hidden', 'true');
  length.className = 'pass-length';
  length.textContent = clip.length;
  link.href = clipUrl(clip).href;
  link.dataset.clip = clip.id;
  link.setAttribute('aria-label', `Pass ${passNumber(clip)}: ${clip.title}. ${tag.textContent}, ${clip.length}`);
  link.append(number, routeLabel(clip.title), tag, strip, length);
  item.append(link);
  list.append(item);
  links.set(clip.id, link);

  void loadStrip(orbitUrl(clip)).then((background) => {
    if (background) strip.style.setProperty('--strip', background);
  });

  // The list steers the globe: pointing at or focusing a row swings the Earth to that pass.
  const preview = () => globe?.preview(clip.id, true);
  const release = () => globe?.preview(undefined, true);
  link.addEventListener('pointerenter', preview);
  link.addEventListener('pointerleave', release);
  link.addEventListener('focus', preview);
  link.addEventListener('blur', release);

  link.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    board(clip);
  });
}

/** Switches to a pass from the page (list or globe) and brings the window back into view. */
export function board(clip: Clip) {
  if (clip !== activeClip) {
    history.pushState(null, '', clipUrl(clip));
    selectClip(clip);
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelector('.hero')!.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

function selectClip(clip: Clip) {
  if (clip === activeClip) return;
  if (activeClip) links.get(activeClip.id)?.removeAttribute('aria-current');
  activeClip = clip;
  links.get(clip.id)?.setAttribute('aria-current', 'page');
  if (clip.tracks) lastOrbitClip = clip;
  for (const button of footageButtons) button.setAttribute('aria-pressed', String((button.dataset.footage === 'plain') === !clip.tracks));
  clipTitle.textContent = clip.title;
  clipMeta.textContent = passMeta(clip);
  clipDetails.textContent = clip.description;
  clipSource.replaceChildren(clipCredit(clip));
  root.toggleAttribute('data-plain', !clip.tracks);
  status.textContent = `Selected: ${clip.title}.`;

  disconnect?.();
  disconnectNotes?.();
  const player = createPlayer(clip, clip.playbackId);
  // The window starts moving at once, muted as browsers require; not under reduced motion.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const media = player.querySelector('mux-video');
    media?.setAttribute('autoplay', '');
    media?.setAttribute('muted', '');
  }
  disconnect = followTelemetry(player, clip, sky.set);
  disconnectNotes = followNotes(player, clip);
  playerSlot.replaceChildren(player);
  customizePlayer(player, clip);
  currentPlayer = player;
  followGlobe();

  // The title rises into place on each change; restarting the animation makes repeated changes interruptible.
  clipTitle.classList.remove('is-arriving');
  void clipTitle.offsetWidth;
  clipTitle.classList.add('is-arriving');
}

// The globe draws a pass only from its orbit data; the plain pass is drawn but never boarded on it.
function followGlobe() {
  unsubscribeGlobe?.();
  unsubscribeGlobe = undefined;
  const player = currentPlayer;
  const clip = activeClip;
  if (!globe || !player || !clip) return;
  const sync = () => globe?.setActive(clip.tracks ? clip.id : '', player.store.currentTime ?? 0);
  unsubscribeGlobe = player.store.subscribe(sync);
  sync();
}

// Globe view: this pass only, or all six; remembered between visits.
const GLOBE_MODE_KEY = 'window-seat-globe-mode';
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-globe-mode]')];
let globeMode: GlobeMode = 'all';
try {
  if (localStorage.getItem(GLOBE_MODE_KEY) === 'pass') globeMode = 'pass';
} catch { /* storage unavailable: keep the default */ }

function setGlobeMode(mode: GlobeMode) {
  globeMode = mode;
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.globeMode === mode));
  globeHost.setAttribute('aria-label', mode === 'all'
    ? 'Ground track globe, all six passes. Drag or use the arrow keys to turn it; the pass buttons board a pass.'
    : 'Ground track globe, this pass only, following the station.');
  globe?.setMode(mode);
}

for (const button of modeButtons) {
  button.addEventListener('click', () => {
    const mode = button.dataset.globeMode as GlobeMode;
    try { localStorage.setItem(GLOBE_MODE_KEY, mode); } catch { /* not remembered */ }
    setGlobeMode(mode);
  });
}
setGlobeMode(globeMode);

async function mountGlobe() {
  try {
    const tracks = (await Promise.all(clips.map(async (clip) => {
      const response = await fetch(orbitUrl(clip));
      const orbit = response.ok ? parseOrbit(await response.json()) : undefined;
      return orbit && { id: clip.id, label: passNumber(clip), title: clip.title, orbit };
    }))).filter((track) => track !== undefined);
    const { createPassGlobe } = await import('./pass-globe');
    const porthole = document.querySelector<HTMLElement>('.porthole-ring');
    globe = await createPassGlobe(globeHost, tracks, {
      onSnapshot(url) {
        porthole?.style.setProperty('--globe-shot', `url("${url}")`);
        porthole?.toggleAttribute('data-globe', true);
      },
      onHover(id) {
        const clip = clips.find((candidate) => candidate.id === id);
        globeTip.hidden = !clip;
        if (clip) globeTip.textContent = `${passNumber(clip)} · ${clip.title}${clip === activeClip ? ' · playing' : ''}`;
        for (const [clipId, link] of links) link.toggleAttribute('data-hover', clipId === id);
      },
      onPick(id) {
        const clip = clips.find((candidate) => candidate.id === id);
        if (clip && clip !== activeClip) {
          history.pushState(null, '', clipUrl(clip));
          selectClip(clip);
        }
      },
    });
    setGlobeMode(globeMode);
    followGlobe();
  } catch {
    globeHost.toggleAttribute('data-unavailable', true);
  }
}

for (const button of footageButtons) {
  button.hidden = button.dataset.footage === 'plain' && !plainClip;
  button.addEventListener('click', () => {
    const clip = button.dataset.footage === 'plain' ? plainClip : lastOrbitClip;
    if (!clip || clip === activeClip) return;
    history.pushState(null, '', clipUrl(clip));
    selectClip(clip);
  });
}

// Width presets shrink only the player inside the window frame, to check the skin at phone and tablet sizes.
function applyWidth(width: Width) {
  if (width === 'full') delete playerSlot.dataset.width;
  else playerSlot.dataset.width = width;
  for (const button of widthButtons) button.setAttribute('aria-pressed', String(button.dataset.width === width));
}

for (const button of widthButtons) {
  button.addEventListener('click', () => {
    const width = button.dataset.width as Width;
    const url = new URL(location.href);
    if (width === 'full') url.searchParams.delete('width');
    else url.searchParams.set('width', width);
    history.replaceState(null, '', url);
    applyWidth(width);
  });
}

function selectFromUrl() {
  const params = new URLSearchParams(location.search);
  const id = params.get('clip');
  // The default is the pass that crosses the terminator, so all three skies show within two minutes.
  selectClip(clips.find((clip) => clip.id === id) ?? clips.find((clip) => clip.light === 'Day to night') ?? clips[0]);
  const width = params.get('width');
  applyWidth(WIDTHS.find((name) => name === width) ?? 'full');
}

window.addEventListener('popstate', selectFromUrl);
selectFromUrl();
// `?sun=-12` pins the sky to a sun elevation, the same as the preview slider in the design notes.
const sun = Number.parseFloat(new URLSearchParams(location.search).get('sun') ?? '');
initNotes(sky, Number.isFinite(sun) ? Math.max(-24, Math.min(24, sun)) : undefined);
void mountGlobe();
renderLinks();
