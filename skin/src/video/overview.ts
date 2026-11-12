import { PlayerController, playerContext, selectTime, UIElement, type PropertyValues } from '@videojs/html';
import { I18nController, i18nContext } from '@videojs/html/i18n';
import { WINDOW_SEAT_TEXT } from './i18n';
import { ORBIT_CHANGE, type OrbitElement } from './orbit';
import type { OrbitData } from './orbit-data';
import type { OverviewGlobe } from './overview-globe';
import { GLOBE_SIZES, readSkinPreference, savePreferences, type GlobeSize } from './preferences';
import { canUseShortcut } from './shortcuts';

let nextTriggerId = 0;

class OverviewElement extends UIElement {
  #time = new PlayerController(this, playerContext, selectTime);
  #i18n = new I18nController(this, i18nContext);
  #container?: HTMLElement;
  #orbit?: OrbitElement;
  #trigger?: HTMLButtonElement;
  #sizeButton?: HTMLButtonElement;
  #size: GlobeSize = 'small';
  #listeners?: AbortController;
  #load?: AbortController;
  #globe?: OverviewGlobe;
  #data?: OrbitData;
  #enabled = true;
  #failed = false;

  connectedCallback() {
    super.connectedCallback();
    const container = this.closest('media-container');
    if (!container) return;
    this.#container = container;
    this.#enabled = readSkinPreference('globe') ?? true;
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    const trigger = container.querySelector<HTMLButtonElement>('.ws-overview-trigger');
    if (trigger) {
      this.#trigger = trigger;
      trigger.id ||= `ws-overview-trigger-${++nextTriggerId}`;
      trigger.nextElementSibling?.setAttribute('trigger', trigger.id);
      trigger.addEventListener('click', this.#toggle, { signal });
      container.addEventListener('keydown', this.#onKey, { signal });
    }
    // The porthole takes pointer clicks; the button beside the globe toggle carries its name and keyboard access.
    this.#size = readSkinPreference('globeSize') ?? 'small';
    this.#sizeButton = container.querySelector<HTMLButtonElement>('.ws-porthole-size') ?? undefined;
    this.#sizeButton?.addEventListener('click', this.#cycleSize, { signal });
    this.addEventListener('click', this.#cycleSize, { signal });
    this.toggleAttribute('data-interactive', true);
    container.addEventListener(ORBIT_CHANGE, this.#onOrbitChange, { signal });
    this.ownerDocument.addEventListener('fullscreenchange', this.#refresh, { signal });
    this.addEventListener('webglcontextlost', this.#onFailure, { capture: true, signal });
    this.#onOrbitChange();
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#dispose();
    if (this.#trigger) this.#trigger.hidden = true;
    if (this.#sizeButton) this.#sizeButton.hidden = true;
    this.#trigger = undefined;
    this.#sizeButton = undefined;
    this.#container = undefined;
    this.#orbit = undefined;
    this.#data = undefined;
    this.#failed = false;
    super.disconnectedCallback();
  }

  update(changed: PropertyValues) {
    super.update(changed);
    const fullscreen = this.#container?.matches(':fullscreen');
    const data = fullscreen ? this.#orbit?.data : undefined;
    if (data !== this.#data) {
      this.#dispose();
      this.#data = data;
      this.#failed = false;
    }
    if (this.#failed) this.#dispose();

    const available = Boolean(data) && !this.#failed;
    if (this.#trigger) {
      if (!available && this.ownerDocument.activeElement === this.#trigger) {
        this.#container?.querySelector<HTMLElement>('media-fullscreen-button')?.focus({ preventScroll: true });
      }
      this.#trigger.toggleAttribute('hidden', !available);
      const pressed = String(available && this.#enabled);
      if (this.#trigger.getAttribute('aria-pressed') !== pressed) this.#trigger.setAttribute('aria-pressed', pressed);
    }

    const shown = available && this.#enabled && Boolean(this.#globe);
    this.toggleAttribute('hidden', !shown);
    if (this.dataset.size !== this.#size) this.dataset.size = this.#size;
    const sizeButton = this.#sizeButton;
    if (sizeButton) {
      if (!shown && this.ownerDocument.activeElement === sizeButton && this.#trigger && !this.#trigger.hidden) this.#trigger.focus({ preventScroll: true });
      sizeButton.hidden = !shown;
      const t = this.#i18n.value;
      const sizeKey = `windowSeat.globeSize.${this.#size}` as const;
      const size = t(sizeKey, { default: WINDOW_SEAT_TEXT[sizeKey] });
      const label = t('windowSeat.globeSize', { size, default: WINDOW_SEAT_TEXT['windowSeat.globeSize'] });
      if (sizeButton.getAttribute('aria-label') !== label) sizeButton.setAttribute('aria-label', label);
    }
    if (!data || !available || !this.#enabled) return;
    if (!this.#globe && !this.#load) void this.#mount(data);
    const sample = this.#orbit?.sampleAt(this.#time.value?.currentTime ?? 0);
    if (sample) this.#globe?.draw(sample);
  }

  #refresh = () => this.requestUpdate();

  #onOrbitChange = () => {
    this.#orbit = this.#container?.querySelector('ws-orbit') ?? undefined;
    this.requestUpdate();
  };

  #toggle = () => {
    this.#enabled = !this.#enabled;
    savePreferences({ globe: this.#enabled });
    this.requestUpdate();
  };

  #cycleSize = () => {
    this.#size = GLOBE_SIZES[(GLOBE_SIZES.indexOf(this.#size) + 1) % GLOBE_SIZES.length];
    savePreferences({ globeSize: this.#size });
    this.requestUpdate();
  };

  #onKey = (event: KeyboardEvent) => {
    const trigger = this.#trigger;
    if (!trigger || trigger.hidden || event.key.toUpperCase() !== 'G' || !canUseShortcut(event)) return;
    event.preventDefault();
    this.#toggle();
  };

  #onFailure = () => {
    this.#failed = true;
    this.requestUpdate();
  };

  async #mount(data: OrbitData) {
    this.#load = new AbortController();
    const { signal } = this.#load;
    try {
      const { createOverviewGlobe } = await import('./overview-globe');
      if (signal.aborted) return;
      const globe = await createOverviewGlobe(this, data, signal);
      if (signal.aborted) {
        globe?.dispose();
        return;
      }
      this.#globe = globe;
      this.requestUpdate();
    } catch {
      if (!signal.aborted) this.#onFailure();
    } finally {
      if (!signal.aborted) this.#load = undefined;
    }
  }

  #dispose() {
    this.#load?.abort();
    this.#load = undefined;
    this.#globe?.dispose();
    this.#globe = undefined;
  }
}

if (!customElements.get('ws-overview')) customElements.define('ws-overview', OverviewElement);
