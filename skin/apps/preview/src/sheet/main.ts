import '@/styles/video/window-seat.css';
import '@/video/skin.css';
import '@/video/window-seat.css';
import { fitChapterGaps, markInteracted } from '@/video/motion';
import { registerWindowSeatIcons } from '@/video/icons';
import skin from '@/video/skin.html?raw';
import './sheet.css';

registerWindowSeatIcons();

const sheet = document.querySelector<HTMLElement>('#sheet')!;
const template = document.createElement('template');
template.innerHTML = skin;
const skinRoot = template.content.querySelector<HTMLElement>('media-container')!;
const animated: { node: HTMLElement; states: Record<string, string>; alternate: Record<string, string> }[] = [];
// Scrubber fixtures: each flips one tile between its two resting states.
const toggles: ((flipped: boolean) => void)[] = [];
const toggleAttrs = (node: Element, resting: Record<string, string>, other: Record<string, string>) =>
  toggles.push((flipped) => states(node, flipped ? other : resting));

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
};

const copy = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = skinRoot) => {
  const node = root.querySelector(selector);
  if (!node) throw new Error('Missing skin fixture: ' + selector);
  return node.cloneNode(true) as T;
};

function states(node: Element, attrs: Record<string, string>) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === 'absent') node.removeAttribute(key);
    else node.setAttribute(key, value);
  }
}

function scene(label: string, target: Element, kind = '') {
  const figure = make('figure', 'sheet-case');
  const stage = make('div', 'sheet-stage ' + kind);
  figure.append(make('figcaption', '', label), stage);
  target.append(figure);
  return stage;
}

function clean(node: HTMLElement) {
  for (const item of [node, ...node.querySelectorAll('[id], [trigger], [commandfor]')]) {
    for (const attr of ['id', 'trigger', 'commandfor']) item.removeAttribute(attr);
  }
  return node;
}

function island(...contents: Element[]) {
  const row = make('div', 'video-controls-row');
  const group = copy('.video-controls-start');
  group.classList.remove('video-controls-start');
  group.replaceChildren(...contents);
  row.append(group);
  return row;
}

const play = '.video-controls-start media-play-button';
const settings = 'button:has(.ws-icon-gear)';
const iconCases: [string, string, Record<string, string>?, Record<string, string>?][] = [
  ['Play', play, { 'data-started': '', 'data-paused': '' }, { 'data-paused': 'absent' }],
  ['Pause', play, { 'data-started': '', 'data-paused': 'absent' }, { 'data-paused': '' }],
  ['Replay', play, { 'data-paused': '', 'data-ended': '' }, { 'data-ended': 'absent' }],
    ['Volume muted', 'media-mute-button', { 'data-muted': '', 'data-volume-level': 'off' }, { 'data-muted': 'absent', 'data-volume-level': 'high' }],
  ...(['low', 'medium', 'high'].map((level) => [
    'Volume ' + level, 'media-mute-button', { 'data-volume-level': level }, { 'data-volume-level': 'off' },
  ]) as [string, string, Record<string, string>?, Record<string, string>?][]),
  ['Captions off', 'media-captions-button', { 'data-active': 'absent' }, { 'data-active': '' }],
  ['Captions on', 'media-captions-button', { 'data-active': '' }, { 'data-active': 'absent' }],
  ['Settings closed', settings, { 'aria-expanded': 'false' }, { 'aria-expanded': 'true' }],
  ['Settings open', settings, { 'aria-expanded': 'true' }, { 'aria-expanded': 'false' }],
  ['PiP off', 'media-pip-button', { 'data-pip': 'absent' }, { 'data-pip': '' }],
  ['PiP on', 'media-pip-button', { 'data-pip': '' }, { 'data-pip': 'absent' }],
  ['Fullscreen enter', 'media-fullscreen-button', { 'data-fullscreen': 'absent' }, { 'data-fullscreen': '' }],
  ['Fullscreen exit', 'media-fullscreen-button', { 'data-fullscreen': '' }, { 'data-fullscreen': 'absent' }],
  ['Overflight', '.ws-flight-trigger', { 'aria-expanded': 'false' }, { 'aria-expanded': 'true' }],
  ['Globe off', '.ws-overview-trigger', { 'aria-pressed': 'false' }, { 'aria-pressed': 'true' }],
  ['Globe on', '.ws-overview-trigger', { 'aria-pressed': 'true' }, { 'aria-pressed': 'false' }],
  ...(['cast', 'airplay'].flatMap((name) => ['available', 'connected'].map((state) => [
    name + ' ' + state, 'media-' + name + '-button', { ['data-' + name + '-state']: state === 'available' ? 'disconnected' : state, 'data-availability': 'available' },
  ])) as [string, string, Record<string, string>?, Record<string, string>?][]),
  ['Aurora', '.ws-aurora-setting .ws-icon'],
  ['Close', '.ws-flight-popup .media-dialog-close'],
  ['Check', 'media-icon[name="check"]'],
  ['Chevron', 'media-icon[name="chevron"]'],
  ['Buffering orbit', '.ws-icon-buffering'],
  ['ISS thumb', '.ws-iss'],
];

for (const [name, selector, attrs = {}, alternate] of iconCases) {
  const pair = [false, true].map((zoom) => {
    const glyph = clean(copy(selector));
    glyph.removeAttribute('hidden');
    states(glyph, attrs);
    if (alternate) {
      animated.push({ node: glyph, states: attrs, alternate });
      toggleAttrs(glyph, attrs, alternate);
    }
    if (selector.includes('media-seek-button')) {
      glyph.classList.remove('ws-band-seek');
      glyph.dataset.sheetSeek = '';
    }
    const wrap = make('div', zoom ? 'sheet-zoom' : '');
    wrap.append(glyph);
    return wrap;
  });
  scene(name, document.querySelector('#icons')!, 'sheet-swatch').append(island(...pair));
}

// Progress markers: the seek thumb's glyph for each value of the `marker` attribute, at 2x.
for (const glyph of skinRoot.querySelectorAll<SVGSVGElement>('.ws-iss-thumb > svg.ws-iss')) {
  const wrap = make('div', 'sheet-zoom sheet-marker');
  wrap.append(glyph.cloneNode(true));
  scene(glyph.dataset.marker ?? '', document.querySelector('#markers')!, 'sheet-swatch').append(wrap);
}

const controlGrid = document.querySelector('#controls')!;
for (const state of ['Rest', 'Hover', 'Focus-visible', 'Pressed', 'Active']) {
  const button = clean(copy(state === 'Active' ? 'media-captions-button' : play));
  states(button, { 'data-paused': '' });
  if (state === 'Active') button.setAttribute('data-active', '');
  else if (state !== 'Rest') button.setAttribute('data-sheet-' + state.toLowerCase(), '');
  const flip = { Rest: { 'data-sheet-hover': '' }, Hover: { 'data-sheet-hover': 'absent' }, Pressed: { 'data-sheet-pressed': 'absent' }, Active: { 'data-active': 'absent' } }[state as 'Rest'];
  if (flip) toggleAttrs(button, Object.fromEntries(Object.keys(flip).map((key) => [key, button.getAttribute(key) ?? 'absent'])), flip);
  scene(state, controlGrid, 'sheet-swatch').append(island(button));
}
const time = (root: ParentNode, current = '1:07') => {
  const group = root.querySelector('.media-time-group');
  for (const [index, value] of [current, current, '/', '2:10'].entries()) {
    if (group?.children[index]) group.children[index].textContent = value;
  }
};
const timeDisplay = island(copy('.media-time-group'));
time(timeDisplay);
scene('Time display', controlGrid, 'sheet-swatch').append(timeDisplay);
const callout = copy('ws-callout');
callout.removeAttribute('hidden');
callout.querySelector('.ws-callout-name')!.textContent = 'Atlantic';
const coordinates = callout.querySelector('.ws-callout-coordinates')!;
coordinates.removeAttribute('hidden');
coordinates.querySelector('bdi')!.textContent = '31.8° S 29.2° W';
scene('Place callout', controlGrid, 'sheet-swatch').append(callout);

const SHORT_CHAPTERS = [7, .6, 6, 8, 2, .7, 8, 12, .9, 7, 8, 5, 1.1, 9, 3, .5, 6, 9];
const stripResize = new ResizeObserver((entries) => {
  for (const { target } of entries) fitChapterGaps(target as HTMLElement);
});

function strip(root: ParentNode, lengths: number[], progress: number, orbit: boolean, mode: string) {
  const slider = root.querySelector<HTMLElement>('media-time-slider')!;
  const chapters = slider.querySelector('media-time-slider-chapters')!;
  const segment = chapters.querySelector('template')!;
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let start = 0;
  for (const length of lengths) {
    const chapter = segment.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const end = start + length / total * 100;
    chapter.style.setProperty('--media-slider-chapter-start', start + '%');
    chapter.style.setProperty('--media-slider-chapter-end', end + '%');
    chapter.toggleAttribute('data-highlighted', mode === 'Hover' && progress >= start && progress <= end);
    chapters.append(chapter);
    start = end;
  }
  segment.remove();
  stripResize.observe(slider);
  slider.setAttribute('data-orientation', 'horizontal');
  slider.style.setProperty('--media-slider-fill', progress + '%');
  slider.style.setProperty('--media-slider-buffer', Math.min(100, progress + 14) + '%');
  slider.style.setProperty('--media-slider-pointer', progress + '%');
  if (orbit) {
    slider.style.setProperty('--ws-passes-edge', 'linear-gradient(90deg, var(--ws-strip-night-edge) 36%, transparent 46%)');
    slider.style.setProperty('--ws-passes', 'linear-gradient(90deg, var(--ws-strip-night) 36%, var(--ws-strip-day) 46%)');
    slider.style.setProperty('--ws-terminators', 'linear-gradient(90deg, transparent calc(41% - 1px), var(--ws-terminator) 41%, transparent calc(41% + 1px))');
  }
  if (mode === 'Hover') slider.setAttribute('data-sheet-hover', '');
  if (mode === 'Drag') states(slider, { 'data-dragging': '', 'data-interactive': '', 'data-ws-drag': 'forward' });
  if (mode === 'Rest' && progress === 50) {
    toggleAttrs(slider, { 'data-dragging': 'absent', 'data-interactive': 'absent', 'data-ws-drag': 'absent' }, { 'data-dragging': '', 'data-interactive': '', 'data-ws-drag': 'forward' });
  }
  slider.querySelector('media-slider-preview')?.setAttribute('hidden', '');
}

// A static player: every rail trigger and the callout shown, popups and indicators hidden, mid-pass strip.
function playerFixture(orbit = true, lengths = [1, 1, 1, 1, 1, 1], progress = 48) {
  const root = clean(copy<HTMLElement>('media-container', template.content));
  root.classList.add('sheet-stage');
  root.style.width = '100%';
  root.style.height = '100%';
  root.setAttribute('data-daylight', 'day');
  root.querySelectorAll('.ws-chapter-trigger, ws-callout').forEach((el) => el.removeAttribute('hidden'));
  root.querySelector('ws-callout')!.replaceWith(callout.cloneNode(true));
  root.querySelector('media-controls-content')!.setAttribute('data-visible', '');
  root.querySelectorAll('media-tooltip, media-popover, media-menu, media-volume-popover, media-dialog-popup, .media-indicator-group, .media-buffering-indicator').forEach((el) => el.setAttribute('hidden', ''));
  root.querySelectorAll('.video-controls-center, .media-poster, ws-motion, .ws-pip-scrim').forEach((el) => el.remove());
  time(root);
  strip(root, lengths, progress, orbit, 'Rest');
  return root;
}

const layouts = document.querySelector('#layouts')!;
for (const [name, width] of [['Wide islands', 860], ['Narrow islands', 340]] as const) {
  const stage = scene(name, layouts);
  stage.style.setProperty('--sheet-width', width + 'px');
  const root = playerFixture();
  stage.append(root);
  // Controls hide and show; the palette crosses the day/night line.
  toggleAttrs(root.querySelector('media-controls-content')!, { 'data-visible': '' }, { 'data-visible': 'absent' });
  toggles.push((flipped) => { root.dataset.daylight = flipped ? 'night' : palette.value.toLowerCase(); });
}

const popups = document.querySelector('#popups')!;
// Closing holds the library's ending hook; reopening replays its starting hook for one style pass.
function openClose(node: HTMLElement, flipped: boolean) {
  if (flipped) {
    node.removeAttribute('data-open');
    node.setAttribute('data-ending-style', '');
    return;
  }
  node.removeAttribute('data-ending-style');
  node.setAttribute('data-open', '');
  node.setAttribute('data-starting-style', '');
  node.getBoundingClientRect();
  node.removeAttribute('data-starting-style');
}

function popup(label: string, node: HTMLElement, toggle = true) {
  clean(node);
  states(node, { 'data-open': '', 'data-side': 'top', 'data-visible': '' });
  scene(label, popups, 'sheet-popup').append(node);
  if (toggle) toggles.push((flipped) => openClose(node, flipped));
  return node;
}

function menu(submenu = false) {
  const settingsMenu = copy('media-menu');
  const panels = [...settingsMenu.querySelectorAll('media-menu-content')];
  const panel = panels[submenu ? 1 : 0];
  settingsMenu.replaceChildren(panel);
  panel.querySelectorAll('media-menu-content').forEach((nested) => nested.remove());
  if (submenu) {
    const group = panel.querySelector('media-quality-radio-group')!;
    const row = group.querySelector('template')!;
    for (const option of ['Auto (1080p)', '1080p', '720p']) {
      const radio = row.content.firstElementChild!.cloneNode(true) as HTMLElement;
      radio.querySelector('[data-part="label"]')!.textContent = option;
      radio.setAttribute('aria-checked', String(option.startsWith('Auto')));
      group.append(radio);
    }
  }
  panel.setAttribute('data-open', '');
  panel.querySelectorAll('media-menu-item, media-menu-checkbox-item, media-menu-radio-item').forEach((row) => row.setAttribute('data-item', ''));
  return settingsMenu;
}

popup('Settings', menu());
popup('Quality submenu', menu(true));
function addChapterRows(root: ParentNode) {
  const list = root.querySelector('.ws-chapter-list')!;
  list.removeAttribute('hidden');
  for (const [index, title] of ['South Atlantic', 'Southern Africa', 'Indian Ocean'].entries()) {
    const item = make('li');
    const button = make('button', 'ws-chapter-button');
    button.append(make('span', '', title), make('span', 'ws-chapter-time', ['0:00', '0:24', '0:54'][index]));
    if (!index) button.setAttribute('data-passed', '');
    if (index === 1) button.setAttribute('aria-current', 'true');
    item.append(button);
    list.append(item);
  }
}
const flight = popup('Overflight', copy('.ws-flight-popup'));
addChapterRows(flight);
flight.querySelector('.ws-flight-notes')!.textContent = 'NASA Earth Science and Remote Sensing Unit, Johnson Space Center.';
const timeline = popup('Overflight timeline', copy('.ws-flight-popup'), false);
addChapterRows(timeline);
const [, second, third] = timeline.querySelectorAll('.ws-chapter-button');
toggleAttrs(second, { 'aria-current': 'true', 'data-passed': 'absent' }, { 'aria-current': 'absent', 'data-passed': '' });
toggleAttrs(third, { 'aria-current': 'absent' }, { 'aria-current': 'true' });
const pipStage = scene('Picture-in-picture card', popups, 'sheet-popup');
const pipScrim = copy('.ws-pip-scrim');
pipStage.style.position = 'relative';
pipStage.style.minHeight = '220px';
pipStage.append(pipScrim);
// The card only has an entrance, so every toggle replays it.
toggles.push(() => {
  pipScrim.style.display = 'none';
  pipScrim.getBoundingClientRect();
  pipScrim.style.display = '';
});
const volume = popup('Volume popover', copy('.media-volume-popover-popup'));
volume.querySelector<HTMLElement>('media-volume-slider')!.style.setProperty('--media-slider-fill', '65%');
volume.querySelectorAll('media-volume-slider, media-slider-track, media-slider-thumb').forEach((el) => el.setAttribute('data-orientation', 'vertical'));
popup('Tooltip and shortcut', copy('.ws-chapter-controls media-tooltip'));
const status = popup('Playback hotkey', copy('media-status-indicator'));
status.setAttribute('data-status', 'pause');
const seek = popup('Seek hotkey', copy('media-seek-indicator'));
seek.setAttribute('data-direction', 'forward');
seek.querySelector('media-seek-indicator-value')!.textContent = '10 s';
const loudness = popup('Volume hotkey', copy('media-volume-indicator'));
loudness.setAttribute('data-level', 'high');
loudness.style.setProperty('--media-volume-fill', '75%');
loudness.querySelector('media-volume-indicator-value')!.textContent = '75%';
const error = popup('Error dialog', copy('media-error-dialog media-dialog-popup'));
// The skin's title over the library's own network description and close label.
const ERROR_TEXT = ['Loss of signal', 'This media could not be loaded due to a network or server issue.', 'OK'];
const fillError = (node: ParentNode) => ['media-dialog-title', 'media-dialog-description', 'media-dialog-close']
  .forEach((selector, index) => { node.querySelector(selector)!.textContent = ERROR_TEXT[index]; });
fillError(error);

// Player states, as static fixtures over the backdrop. Each mirrors what the live components set.
const playerStates = document.querySelector('#states')!;
const show = (root: ParentNode, selector: string) => root.querySelectorAll(selector).forEach((el) => el.removeAttribute('hidden'));
const hide = (root: ParentNode, selector: string) => root.querySelectorAll(selector).forEach((el) => el.setAttribute('hidden', ''));
const setCallout = (root: ParentNode, text: string | null) => {
  const label = root.querySelector<HTMLElement>('ws-callout')!;
  label.hidden = text === null;
  label.querySelector('.ws-callout-name')!.textContent = text ?? '';
  hide(label, '.ws-callout-coordinates, .ws-callout-over');
};
const plain = (root: HTMLElement) => {
  root.setAttribute('data-sheet-plain', '');
  root.removeAttribute('data-orbit');
  root.removeAttribute('data-daylight');
  hide(root, '.ws-chapter-trigger, .ws-overview-trigger, ws-callout');
};
const STATES: [string, boolean, (root: HTMLElement) => void][] = [
  ['Loading', true, (root) => {
    root.prepend(copy('.media-poster'));
    states(root.querySelector('.media-poster')!, { 'data-visible': '' });
    time(root, '0:00');
    root.querySelector<HTMLImageElement>('.media-poster-image')!.src = 'https://image.mux.com/OMqaVB01nWT7iGK2jutdmsAZykx1U7SvOmTCoxVmxJE4/thumbnail.webp?time=0';
    show(root, '.media-buffering-indicator');
    states(root.querySelector('.media-buffering-indicator')!, { 'data-visible': '' });
    root.querySelectorAll('.video-controls-start media-play-button').forEach((button) => states(button, { 'data-paused': '' }));
  }],
  ['Buffering · "Reacquiring signal"', true, (root) => {
    show(root, '.media-buffering-indicator');
    states(root.querySelector('.media-buffering-indicator')!, { 'data-visible': '' });
  }],
  ['Ended · "Pass complete"', true, (root) => {
    root.querySelectorAll('media-play-button').forEach((button) => states(button, { 'data-paused': '', 'data-ended': '', 'data-started': '' }));
    setCallout(root, 'Pass complete');
    time(root, '2:10');
  }],
  ['Error · "Loss of signal"', true, (root) => {
    const dialog = root.querySelector<HTMLElement>('media-error-dialog media-dialog-popup')!;
    dialog.removeAttribute('hidden');
    states(dialog, { 'data-open': '' });
    fillError(dialog);
  }],
  ['No title', true, (root) => setCallout(root, null)],
  ['Mute only (volume unavailable)', true, (root) => {
    states(root.querySelector('media-mute-button')!, { 'data-muted': '', 'data-volume-level': 'off' });
  }],
  ['No orbit data', false, plain],
  ['No chapters', false, plain],
  ['Captions on', true, (root) => {
    states(root.querySelector('media-captions-button')!, { 'data-active': '' });
    root.append(make('p', 'sheet-cue', 'Lights of the coast below.'));
  }],
];
for (const [label, orbit, setup] of STATES) {
  const root = playerFixture(orbit, label === 'No chapters' ? [1] : undefined, label.startsWith('Ended') ? 100 : label === 'Loading' ? 0 : 48);
  root.toggleAttribute('data-orbit', orbit);
  setup(root);
  scene(label, playerStates, 'sheet-player').append(root);
}

for (const [count, lengths] of [[1, [1]], [6, [12, 8, 23, 17, 16, 24]], [18, SHORT_CHAPTERS]] as const) {
  for (const orbit of [false, true]) {
    const group = make('div', 'sheet-strip-group');
    const grid = make('div', 'sheet-grid');
    group.append(make('h3', '', count + (count === 1 ? ' chapter' : ' chapters') + ' · ' + (orbit ? 'orbit pass' : 'plain')), grid);
    document.querySelector('#strips')!.append(group);
    for (const mode of ['Rest', 'Hover', 'Drag']) {
      for (const progress of [0, 50, 100]) {
        const fixture = island();
        fixture.replaceChildren(copy('.video-controls-slider-row'));
        strip(fixture, [...lengths], progress, orbit, mode);
        scene(mode + ' · ' + progress + '%', grid).append(fixture);
      }
    }
  }
}

// Duplicate only interaction selectors so the static samples track the skin's own styles.
function interactionRules(rules: CSSRuleList): string {
  return [...rules].map((rule) => {
    if (rule instanceof CSSStyleRule) {
      const selector = rule.selectorText.replace(/:(hover|focus-visible|active)\b/g, (_, state) =>
        '[data-sheet-' + (state === 'active' ? 'pressed' : state) + ']');
      const children = interactionRules(rule.cssRules);
      if (selector === rule.selectorText && !children) return '';
      return selector + '{' + (selector === rule.selectorText ? '' : rule.style.cssText) + children + '}';
    }
    if (rule instanceof CSSGroupingRule) {
      const children = interactionRules(rule.cssRules);
      return children ? rule.cssText.slice(0, rule.cssText.indexOf('{')) + '{' + children + '}' : '';
    }
    return '';
  }).join('\n');
}

function syncInteractionRules() {
  const mirror = make('style');
  mirror.textContent = [...document.styleSheets].map((style) => interactionRules(style.cssRules)).join('\n');
  document.head.append(mirror);
}

const palette = document.querySelector<HTMLSelectElement>('#palette')!;
const backdrop = document.querySelector<HTMLSelectElement>('#backdrop')!;
const slow = document.querySelector<HTMLInputElement>('#slow')!;
const params = new URLSearchParams(location.search);
palette.value = ['Day', 'Twilight', 'Night'].find((name) => name.toLowerCase() === params.get('palette')) ?? 'Day';
backdrop.value = ['Black', 'White', 'Footage'].find((name) => name.toLowerCase() === params.get('backdrop')) ?? 'Black';
function applyPalette() {
  for (const target of [sheet, ...sheet.querySelectorAll<HTMLElement>('media-container:not([data-sheet-plain])')]) {
    target.dataset.daylight = palette.value.toLowerCase();
  }
}
function applyBackdrop() {
  const value = backdrop.value === 'Footage'
    ? 'url("https://image.mux.com/OMqaVB01nWT7iGK2jutdmsAZykx1U7SvOmTCoxVmxJE4/thumbnail.webp?time=45")'
    : backdrop.value.toLowerCase();
  sheet.style.setProperty('--sheet-backdrop', value);
}
applyPalette();
applyBackdrop();
sheet.append(copy('ws-motion'));
palette.addEventListener('change', applyPalette);
backdrop.addEventListener('change', applyBackdrop);
function applySpeed() {
  for (const animation of sheet.getAnimations({ subtree: true })) animation.updatePlaybackRate(slow.checked ? .2 : 1);
}
slow.addEventListener('change', applySpeed);
sheet.addEventListener('animationstart', applySpeed);
sheet.addEventListener('transitionrun', applySpeed);

let resetFrame = 0;
document.querySelector('#animate')!.addEventListener('click', () => {
  markInteracted(sheet);
  cancelAnimationFrame(resetFrame);
  sheet.setAttribute('data-sheet-resetting', '');
  for (const { node, alternate } of animated) states(node, alternate);
  sheet.getBoundingClientRect();
  resetFrame = requestAnimationFrame(() => {
    sheet.removeAttribute('data-sheet-resetting');
    sheet.getBoundingClientRect();
    for (const { node, states: target } of animated) states(node, target);
    for (const node of sheet.querySelectorAll<HTMLElement>('[data-sheet-seek]')) {
      node.click();
    }
    requestAnimationFrame(applySpeed);
  });
});

/*
 * Scrubber: "Toggle states" flips every fixture, then holds each transition and keyframe animation it started.
 * Progress sets each held animation to that fraction of its own end time (delay included), so frames can be
 * inspected without a running timeline.
 */
const toggleButton = document.querySelector<HTMLButtonElement>('#toggle-states')!;
const scrubStatus = document.querySelector<HTMLOutputElement>('#scrub-status')!;
let flipped = false;
let progress = 1;
let held: Animation[] = [];

const endTime = (animation: Animation) => {
  const timing = animation.effect?.getComputedTiming();
  const end = Number(timing?.endTime ?? 0);
  return Number.isFinite(end) ? end : Infinity;
};

function scrub(value: number) {
  progress = value;
  for (const animation of held) {
    animation.pause();
    animation.currentTime = endTime(animation) * value;
  }
  document.querySelectorAll<HTMLButtonElement>('[data-progress]').forEach((button) =>
    button.setAttribute('aria-pressed', String(Number(button.dataset.progress) === Math.round(value * 100))));
  scrubStatus.textContent = held.length + ' animations held at ' + Math.round(value * 100) + ' %';
}

toggleButton.addEventListener('click', () => {
  markInteracted(sheet);
  // Settle whatever is still running so only the new state change is captured.
  for (const animation of document.getAnimations()) {
    if (Number.isFinite(endTime(animation))) animation.finish();
  }
  const before = new Set(document.getAnimations());
  flipped = !flipped;
  toggleButton.setAttribute('aria-pressed', String(flipped));
  for (const toggle of toggles) toggle(flipped);
  held = document.getAnimations().filter((animation) =>
    !before.has(animation) && endTime(animation) > 0 && Number.isFinite(endTime(animation)));
  scrub(progress);
});

document.querySelectorAll<HTMLButtonElement>('[data-progress]').forEach((button) =>
  button.addEventListener('click', () => scrub(Number(button.dataset.progress) / 100)));

if (document.readyState === 'complete') syncInteractionRules();
else window.addEventListener('load', syncInteractionRules, { once: true });
