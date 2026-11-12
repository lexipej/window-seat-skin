import {
  PlayerController,
  playerContext,
  selectMetadata,
  selectPlayback,
  selectTextTrack,
  selectTime,
  UIElement,
  type PropertyValues,
} from '@videojs/html';
import { I18nController, i18nContext, type Translator } from '@videojs/html/i18n';
import { WINDOW_SEAT_TEXT } from './i18n';
import { ORBIT_CHANGE, type OrbitElement } from './orbit';
import { canUseShortcut } from './shortcuts';

type Chapters = NonNullable<ReturnType<typeof selectTextTrack>>['chaptersCues'];
type ChapterPopup = UIElement & { open: boolean; close(): void };

const EMPTY_CHAPTERS: Chapters = [];
let nextTriggerId = 0;

export const activeChapter = (chapters: Chapters, time: number) =>
  chapters.findIndex(({ startTime, endTime }) => startTime <= time && time < endTime);

const formatCoordinate = (value: number, positive: string, negative: string) =>
  `${Math.abs(value).toFixed(1)}° ${value < 0 ? negative : positive}`;

const formatTime = (time: number) => {
  const seconds = Math.floor(time);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${hours ? `${hours}:${pad(minutes)}` : minutes}:${pad(seconds % 60)}`;
};

class CalloutElement extends UIElement {
  #i18n = new I18nController(this, i18nContext);
  #metadata = new PlayerController(this, playerContext, selectMetadata);
  #playback = new PlayerController(this, playerContext, selectPlayback);
  #tracks = new PlayerController(this, playerContext, selectTextTrack);
  #time = new PlayerController(this, playerContext, selectTime);
  #seeking = false;
  #place = '';
  #pulse?: Animation;
  #container: HTMLElement | null = null;
  #orbit?: OrbitElement;
  #onOrbitChange = () => {
    this.#orbit = this.#container?.querySelector('ws-orbit') ?? undefined;
    this.requestUpdate();
  };

  connectedCallback() {
    super.connectedCallback();
    this.#container = this.closest('media-container');
    this.#container?.addEventListener(ORBIT_CHANGE, this.#onOrbitChange);
    this.#onOrbitChange();
  }

  disconnectedCallback() {
    this.#pulse?.cancel();
    this.#container?.removeEventListener(ORBIT_CHANGE, this.#onOrbitChange);
    this.#container = null;
    this.#orbit = undefined;
    super.disconnectedCallback();
  }

  update(changed: PropertyValues) {
    super.update(changed);
    const chapters = this.#tracks.value?.chaptersCues ?? EMPTY_CHAPTERS;
    const time = this.#time.value;
    const chapter = chapters[activeChapter(chapters, time?.currentTime ?? 0)]?.text.trim();
    const title = chapter || this.#metadata.value?.title.trim() || '';
    const passComplete = Boolean(this.#playback.value?.ended && this.#orbit?.data);
    this.hidden = !title && !passComplete;

    const sample = !passComplete && title ? this.#orbit?.sampleAt(time?.currentTime ?? 0) : undefined;
    const label = this.querySelector('.ws-callout-name');
    const t = this.#i18n.value;
    const text = passComplete ? t('windowSeat.passComplete', { default: WINDOW_SEAT_TEXT['windowSeat.passComplete'] }) : title;
    if (this.#place && text && this.#place !== text && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.#pulse?.cancel();
      this.#pulse = this.querySelector('.ws-callout-dot')?.animate([
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(1.8)', opacity: 0.55 },
        { transform: 'scale(1)', opacity: 1 },
      ], { duration: 440, easing: 'ease-out' });
    }
    this.#place = text;
    if (label) this.#setPlace(label, text);

    const over = this.querySelector<HTMLElement>('.ws-callout-over');
    if (over) {
      over.hidden = !sample || !chapter;
      const place = sample && chapter ? t('windowSeat.overPlace', { place: chapter, default: WINDOW_SEAT_TEXT['windowSeat.overPlace'] }) : '';
      this.#setPlace(over, place, chapter);
    }
    const coordinates = this.querySelector<HTMLElement>('.ws-callout-coordinates');
    if (coordinates) {
      coordinates.hidden = !sample;
      const value = coordinates.querySelector('bdi');
      const position = sample ? `${formatCoordinate(sample.lat, 'N', 'S')} ${formatCoordinate(sample.lon, 'E', 'W')}` : '';
      if (value && value.textContent !== position) value.textContent = position;
    }

    const announcer = this.querySelector('.ws-callout-announcer');
    if (announcer && time?.seeking !== this.#seeking) {
      announcer.textContent = time?.seeking ? '' : chapter ?? '';
    }
    this.#seeking = Boolean(time?.seeking);
  }

  #setPlace(label: Element, text: string, place?: string) {
    let current = label.querySelector<HTMLElement>('.ws-place-current');
    if (current?.textContent === text) return;
    const previous = label.querySelector('.ws-place-previous') ?? document.createElement('span');
    previous.className = 'ws-place-previous';
    previous.setAttribute('aria-hidden', 'true');
    previous.replaceChildren(...(current ? Array.from(current.childNodes, (node) => node.cloneNode(true)) : []));
    const animate = Boolean(current?.textContent && text && !this.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches);
    current ??= document.createElement('span');
    current.className = 'ws-place-current';
    current.textContent = text;
    if (place && text.includes(place)) {
      const index = text.indexOf(place);
      const prefix = document.createElement('span');
      prefix.className = 'ws-callout-prefix';
      prefix.textContent = text.slice(0, index);
      const suffix = prefix.cloneNode() as HTMLElement;
      suffix.textContent = text.slice(index + place.length);
      current.replaceChildren(prefix, document.createTextNode(place), suffix);
    }
    label.replaceChildren(previous, current);
    if (animate) {
      label.classList.add('ws-place-preparing');
      label.getBoundingClientRect();
      label.classList.remove('ws-place-preparing');
    }
  }
}

// Both surfaces use native chapter buttons so focus survives playback updates.
class ChapterPanelElement extends UIElement {
  #i18n = new I18nController(this, i18nContext);
  #tracks = new PlayerController(this, playerContext, selectTextTrack);
  #time = new PlayerController(this, playerContext, selectTime);
  #chapters = EMPTY_CHAPTERS;
  #buttons: HTMLButtonElement[] = [];
  #translator?: Translator;
  #current = -1;
  #disconnect?: AbortController;
  #trigger?: HTMLButtonElement;
  #popup?: ChapterPopup;

  connectedCallback() {
    super.connectedCallback();
    const container = this.closest('media-container');
    const popup = this.closest<ChapterPopup>('media-popover, media-dialog');
    if (!container || !popup) return;
    const isPlaces = popup.matches('media-popover');
    const trigger = isPlaces ? popup.previousElementSibling : container.querySelector('.ws-flight-trigger');
    if (!(trigger instanceof HTMLButtonElement)) return;

    this.#popup = popup;
    this.#trigger = trigger;
    trigger.id ||= `ws-chapter-trigger-${++nextTriggerId}`;
    if (isPlaces) {
      const heading = this.querySelector('.ws-panel-heading');
      if (heading) {
        heading.id ||= `${trigger.id}-heading`;
        popup.setAttribute('aria-labelledby', heading.id);
      }
    } else {
      popup.id ||= `${trigger.id}-dialog`;
      trigger.setAttribute('commandfor', popup.id);
      popup.requestUpdate();
    }
    const tooltip = isPlaces ? popup.nextElementSibling : trigger.nextElementSibling;
    tooltip?.setAttribute('trigger', trigger.id);

    this.#disconnect = new AbortController();
    const { signal } = this.#disconnect;
    container.addEventListener('keydown', this.#onKey, { signal });
    this.addEventListener('click', this.#onChapter, { signal });
    if (isPlaces) popup.addEventListener('open-change', this.#onPlacesOpen, { signal });
    else {
      popup.addEventListener('open-change-complete', this.#onFlightOpenComplete, { signal });
      this.ownerDocument.addEventListener('click', this.#onOutsideClick, { signal, capture: true });
    }
  }

  // Close on a click outside the panel, including a second click on the trigger.
  #onOutsideClick = (event: MouseEvent) => {
    const popup = this.#popup;
    const target = event.target;
    if (!popup?.open || !(target instanceof Node)) return;
    // The dialog element has no box of its own; the panel inside it is what the user sees.
    if ((popup.querySelector('.media-dialog-popup') ?? popup).contains(target)) return;
    if (this.#trigger?.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
    }
    popup.close();
  };

  disconnectedCallback() {
    this.#disconnect?.abort();
    super.disconnectedCallback();
  }

  update(changed: PropertyValues) {
    super.update(changed);
    const list = this.querySelector<HTMLOListElement>('.ws-chapter-list');
    if (!list || !this.#trigger || !this.#popup) return;
    const chapters = this.#tracks.value?.chaptersCues ?? EMPTY_CHAPTERS;
    const chaptersChanged = chapters !== this.#chapters;
    if (chaptersChanged) {
      this.#chapters = chapters;
      this.#current = -1;
      const items = chapters.map((chapter, index) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        const title = document.createElement('span');
        const time = document.createElement('span');
        button.type = 'button';
        button.className = 'ws-chapter-button';
        button.dataset.chapter = String(index);
        title.textContent = chapter.text.trim();
        time.className = 'ws-chapter-time';
        time.textContent = formatTime(chapter.startTime);
        button.append(title, time);
        item.append(button);
        return { item, button };
      });
      this.#buttons = items.map(({ button }) => button);
      list.replaceChildren(...items.map(({ item }) => item));
      list.hidden = !chapters.length;
    }
    const t = this.#i18n.value;
    if (chaptersChanged || t !== this.#translator) {
      this.#translator = t;
      for (const [index, button] of this.#buttons.entries()) {
        if (chapters[index].text.trim()) continue;
        const title = button.firstElementChild;
        if (title) title.textContent = t('windowSeat.chapter', { number: index + 1, default: WINDOW_SEAT_TEXT['windowSeat.chapter'] });
      }
    }

    const hasNotes = Boolean(this.querySelector('.ws-flight-notes')?.textContent?.trim());
    this.#trigger.hidden = !chapters.length && !hasNotes;
    if (this.#trigger.hidden && this.#popup.open) this.#popup.close();

    const current = activeChapter(chapters, this.#time.value?.currentTime ?? 0);
    if (current === this.#current) return;
    this.#buttons[this.#current]?.removeAttribute('aria-current');
    this.#buttons[current]?.setAttribute('aria-current', 'true');
    // Places before the current one are passed (styling only; aria-current carries the meaning).
    this.#buttons.forEach((button, index) => button.toggleAttribute('data-passed', index < current));
    this.#current = current;
  }

  #onKey = (event: KeyboardEvent) => {
    const trigger = this.#trigger;
    if (!trigger || trigger.hidden || !trigger.getAttribute('aria-keyshortcuts')?.split(' ').includes(event.key.toUpperCase())) return;
    if (!canUseShortcut(event)) return;

    event.preventDefault();
    this.#focusTrigger();
    trigger.click();
  };

  #focusTrigger() {
    const trigger = this.#trigger;
    if (!trigger) return;
    const target = getComputedStyle(trigger).visibility === 'hidden'
      ? trigger.closest('media-container')?.querySelector<HTMLElement>('.ws-settings-trigger')
      : trigger;
    target?.focus({ preventScroll: true });
  }

  #onChapter = (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-chapter]');
    const chapter = this.#chapters[Number(button?.dataset.chapter)];
    if (!chapter || !this.#popup) return;
    void this.#time.value?.seek(chapter.startTime);
    this.#popup.close();
    if (this.#popup.matches('media-popover')) this.#focusTrigger();
  };

  #onPlacesOpen = (event: Event) => {
    const { open, reason } = (event as CustomEvent<{ open: boolean; reason: string }>).detail;
    if (!open) {
      if (reason === 'escape') this.#focusTrigger();
      return;
    }
    const popup = this.#popup;
    void popup?.updateComplete.then(() => {
      if (!popup.open) return;
      const button = this.#buttons[this.#current] ?? this.#buttons[0];
      button?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    });
  };

  #onFlightOpenComplete = (event: Event) => {
    const { open } = (event as CustomEvent<{ open: boolean }>).detail;
    const active = this.ownerDocument.activeElement;
    // A compact layout restores focus to Settings when the rail trigger is hidden.
    if (!open && (active === this.ownerDocument.body || this.#popup?.contains(active))) this.#focusTrigger();
  };
}

class PlacesElement extends ChapterPanelElement {}
class FlightLogElement extends ChapterPanelElement {}

for (const [tag, element] of [
  ['ws-callout', CalloutElement],
  ['ws-places', PlacesElement],
  ['ws-flight-log', FlightLogElement],
] as const) {
  if (!customElements.get(tag)) customElements.define(tag, element);
}
