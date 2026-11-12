import { UIElement, type PropertyValues } from '@videojs/html';
import { I18nController, i18nContext } from '@videojs/html/i18n';
import { WINDOW_SEAT_TEXT } from './i18n';

/** Announces buffering as "Reacquiring signal", on the same delayed cue as the visible spinner. */
class SignalElement extends UIElement {
  #i18n = new I18nController(this, i18nContext);
  #observer = new MutationObserver(() => this.requestUpdate());
  #indicator: Element | null = null;

  connectedCallback() {
    super.connectedCallback();
    this.#indicator = this.closest('media-container')?.querySelector('media-buffering-indicator') ?? null;
    if (this.#indicator) this.#observer.observe(this.#indicator, { attributes: true, attributeFilter: ['data-visible'] });
  }

  disconnectedCallback() {
    this.#observer.disconnect();
    this.#indicator = null;
    super.disconnectedCallback();
  }

  update(changed: PropertyValues) {
    super.update(changed);
    const text = this.#indicator?.hasAttribute('data-visible')
      ? this.#i18n.value('windowSeat.buffering', { default: WINDOW_SEAT_TEXT['windowSeat.buffering'] })
      : '';
    if (this.textContent !== text) this.textContent = text;
  }
}

if (!customElements.get('ws-signal')) customElements.define('ws-signal', SignalElement);
