import { PlayerController, playerContext, selectTextTrack, selectTime, UIElement, type PropertyValues } from '@videojs/html';
import { activeChapter } from './chapters';
import { readSkinPreference, savePreferences } from './preferences';
import { canUseShortcut } from './shortcuts';

const AURORA_DURATION_MS = 6000;

class AuroraElement extends UIElement {
  #time = new PlayerController(this, playerContext, selectTime);
  #tracks = new PlayerController(this, playerContext, selectTextTrack);
  #container?: HTMLElement;
  #setting?: HTMLElementTagNameMap['media-menu-checkbox-item'];
  #listeners?: AbortController;
  #timer?: number;
  #chapterStart?: number;

  connectedCallback() {
    super.connectedCallback();
    const container = this.closest('media-container');
    if (!container) return;

    this.#container = container;
    this.#setting = container.querySelector('media-menu-checkbox-item.ws-aurora-setting') ?? undefined;
    const saved = readSkinPreference('aurora');
    if (this.#setting && saved !== undefined) this.#setting.checked = saved;
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    container.addEventListener('keydown', this.#onKey, { signal });
    this.#setting?.addEventListener('checked-change', this.#onSettingChange, { signal });
    this.style.setProperty('--ws-aurora-duration', `${AURORA_DURATION_MS}ms`);
    this.requestUpdate();
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#stop();
    this.#container = undefined;
    this.#setting = undefined;
    this.#chapterStart = undefined;
    super.disconnectedCallback();
  }

  update(changed: PropertyValues) {
    super.update(changed);
    const time = this.#time.value;
    if (!time || time.seeking) return;

    const chapters = this.#tracks.value?.chaptersCues ?? [];
    const chapter = chapters[activeChapter(chapters, time.currentTime)];
    const start = chapter && /aurora/i.test(chapter.text) ? chapter.startTime : undefined;
    if (start === this.#chapterStart) return;
    this.#chapterStart = start;
    if (start !== undefined) this.#show();
  }

  #onKey = (event: KeyboardEvent) => {
    if (event.key.toUpperCase() !== 'A' || this.#setting?.checked === false || !canUseShortcut(event)) return;
    event.preventDefault();
    this.#show();
  };

  #onSettingChange = () => {
    if (!this.#setting) return;
    savePreferences({ aurora: this.#setting.checked });
    if (!this.#setting.checked) this.#stop();
  };

  #show() {
    const container = this.#container;
    // Overlapping triggers share a single glow so repeated keys and seeks cannot make it pulse.
    if (!container || this.#timer !== undefined || this.#setting?.checked === false) return;
    container.setAttribute('data-aurora', '');
    this.#timer = window.setTimeout(this.#stop, AURORA_DURATION_MS);
  }

  #stop = () => {
    window.clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#container?.removeAttribute('data-aurora');
  };
}

if (!customElements.get('ws-aurora')) customElements.define('ws-aurora', AuroraElement);
