import type { Clip } from './clips';
import type { createPlayer } from './player';
import type { Sky } from './sky';
import { playRowIcon } from '@skin/video/motion';
import { loadChapters, signed } from './telemetry';

type VideoPlayerElement = ReturnType<typeof createPlayer>;
type Cue = { start: number; end: number; text: string };

const notes = document.querySelector<HTMLElement>('#notes')!;
const route = document.querySelector<HTMLElement>('#note-route')!;
const stops = document.querySelector<HTMLElement>('#stops')!;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const clock = (time: number) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;

// Only the highlighted stop plays its demo, and only while the notes are on screen.
const isPlaying = (stop: Element | null) =>
  !!stop && !reduced.matches && notes.hasAttribute('data-onscreen') && stop.hasAttribute('data-active');
const ADVANCE_MS = 6000;

/** The sky preview slider, the sideways stepping of the stops and the looping demos. */
export function initNotes(sky: Sky, initial: number | undefined) {
  const input = document.querySelector<HTMLInputElement>('#sky-input')!;
  const output = document.querySelector<HTMLOutputElement>('#sky-output')!;
  const live = document.querySelector<HTMLButtonElement>('#sky-live')!;
  // "Back to live" appears only once the slider has pinned the sky.
  const pin = (value: number | undefined) => {
    sky.force(value);
    live.hidden = value === undefined;
    output.value = value === undefined ? 'following the pass' : `previewing ${signed(value)}`;
  };
  if (initial !== undefined) {
    input.value = String(initial);
    pin(initial);
  }
  input.addEventListener('input', () => pin(input.valueAsNumber));
  live.addEventListener('click', () => {
    pin(undefined);
    const url = new URL(location.href);
    if (url.searchParams.has('sun')) {
      url.searchParams.delete('sun');
      history.replaceState(null, '', url);
    }
    input.focus();
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>('.stops-step')) {
    button.addEventListener('click', () => {
      const step = (stops.querySelector<HTMLElement>('.stop')?.offsetWidth ?? 320) + 32;
      stops.scrollBy({ left: Number(button.dataset.step) * step, behavior: reduced.matches ? 'auto' : 'smooth' });
    });
  }

  new IntersectionObserver(([entry]) => notes.toggleAttribute('data-onscreen', entry.isIntersecting)).observe(notes);
  // One highlighted stop at a time. It advances every 6 s; hovering or focusing a stop takes the highlight and holds it,
  // and dragging or scrolling the track holds it for a while. Reduced motion keeps it still.
  const cards = [...stops.querySelectorAll<HTMLElement>('.stop')];
  let current = 0;
  let held = false;
  let holdUntil = 0;
  const highlight = (index: number, scroll: boolean) => {
    current = index;
    cards.forEach((card, at) => card.toggleAttribute('data-active', at === index));
    if (!scroll) return;
    const card = cards[index];
    const left = card.offsetLeft - stops.offsetLeft;
    const visible = left >= stops.scrollLeft && left + card.offsetWidth <= stops.scrollLeft + stops.clientWidth;
    if (!visible) stops.scrollTo({ left, behavior: reduced.matches ? 'auto' : 'smooth' });
  };
  highlight(0, false);
  cards.forEach((card, index) => {
    card.addEventListener('pointerenter', () => { held = true; highlight(index, false); });
    card.addEventListener('pointerleave', () => { held = false; });
    card.addEventListener('focusin', () => { held = true; highlight(index, false); });
    card.addEventListener('focusout', () => { held = false; });
  });
  // Fades show only where there is more to scroll.
  const edges = () => {
    stops.toggleAttribute('data-more-start', stops.scrollLeft > 4);
    stops.toggleAttribute('data-more-end', stops.scrollLeft + stops.clientWidth < stops.scrollWidth - 4);
  };
  stops.addEventListener('scroll', edges, { passive: true });
  new ResizeObserver(edges).observe(stops);
  edges();
  for (const type of ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const) {
    stops.addEventListener(type, () => { holdUntil = performance.now() + 12000; }, { passive: true });
  }
  window.setInterval(() => {
    if (reduced.matches || held || performance.now() < holdUntil || !notes.hasAttribute('data-onscreen')) return;
    highlight((current + 1) % cards.length, true);
  }, ADVANCE_MS);

  // Icons note: the skin's own icons stepping through their states, with its settings-row one-shots and knob slide.
  const cycling = [...document.querySelectorAll<HTMLElement>('.icon-row [data-cycle]')];
  const oneShots = [...document.querySelectorAll<HTMLElement>('.icon-row .demo-play')];
  const knobs = document.querySelector<HTMLElement>('.icon-row .demo-knobs');
  let tick = 0;
  window.setInterval(() => {
    if (!isPlaying(cycling[0]?.closest('.stop'))) return;
    tick++;
    for (const icon of cycling) {
      const names = icon.dataset.cycle!.split(' ');
      icon.setAttribute('name', names[tick % names.length]);
    }
    for (const row of oneShots) playRowIcon(row);
    knobs?.toggleAttribute('data-on', tick % 2 === 1);
  }, 1400);
}

/** The strip demo uses the player's own station glyph as its thumb. */
function borrowThumb(player: VideoPlayerElement) {
  const gear = document.querySelector<HTMLElement>('.demo-gear');
  const gearIcon = player.querySelector('svg.ws-icon-gear');
  if (gear && gearIcon && !gear.firstElementChild) gear.append(gearIcon.cloneNode(true));
  const thumb = document.querySelector<HTMLElement>('.demo-thumb');
  const glyph = player.querySelector('svg.ws-iss');
  if (!thumb || !glyph || thumb.firstElementChild) return;
  const copy = glyph.cloneNode(true) as SVGSVGElement;
  copy.querySelector('.ws-iss-knockout')?.remove();
  thumb.append(copy);
}

/** Keeps the Overflight specimen on the playing pass; while its stop is active it walks through the places. */
export function followNotes(player: VideoPlayerElement, clip: Clip) {
  let cues: Cue[] = [];
  let shown = -2;
  let demo = 0;
  let disposed = false;
  borrowThumb(player);
  route.replaceChildren();
  if (clip.tracks) {
    void loadChapters(clip.tracks.chapters).then((loaded) => {
      if (disposed) return;
      cues = loaded;
      shown = -2;
      sync();
    });
  } else {
    const empty = document.createElement('li');
    empty.textContent = 'This pass has no chapters, so Overflight stays hidden.';
    route.append(empty);
  }

  const draw = (index: number) => {
    if (index === shown) return;
    shown = index;
    const from = Math.max(0, Math.min(index - 1, cues.length - 3));
    route.replaceChildren(...cues.slice(from, from + 3).map((cue, offset) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const at = document.createElement('span');
      name.textContent = cue.text;
      at.className = 'route-time';
      at.textContent = clock(cue.start);
      if (from + offset < index) item.toggleAttribute('data-passed', true);
      if (from + offset === index) item.toggleAttribute('data-current', true);
      item.append(name, at);
      return item;
    }));
  };

  const sync = () => {
    if (!cues.length || isPlaying(route.closest('.stop'))) return;
    const time = player.store.currentTime ?? 0;
    draw(Math.max(0, cues.findIndex((cue) => time >= cue.start && time < cue.end)));
  };
  const walk = window.setInterval(() => {
    if (!cues.length || !isPlaying(route.closest('.stop'))) return;
    demo = (Math.max(demo, shown) + 1) % cues.length;
    draw(demo);
  }, 1600);
  const unsubscribe = player.store.subscribe(sync);
  sync();
  borrowThumb(player);
  return () => {
    disposed = true;
    clearInterval(walk);
    unsubscribe();
  };
}
