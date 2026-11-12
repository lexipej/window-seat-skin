const POPUP = 'media-menu, media-popover, media-volume-popover, media-dialog, media-error-dialog';

export function canUseShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (event.composedPath().some((element) => element instanceof HTMLElement &&
    (element.isContentEditable || element.matches('input, textarea, select, [role="textbox"]')))) return false;
  return !Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement & { open?: boolean }>(POPUP))
    .some((popup) => popup.open || (popup.open === undefined && popup.querySelector('[data-open]')));
}

class VolumeFocusElement extends HTMLElement {
  #popover?: HTMLElementTagNameMap['media-volume-popover'];

  connectedCallback() {
    const popover = this.previousElementSibling;
    if (popover?.localName !== 'media-volume-popover') return;
    this.#popover = popover as HTMLElementTagNameMap['media-volume-popover'];
    this.#popover.addEventListener('open-change', this.#onOpenChange);
  }

  disconnectedCallback() {
    this.#popover?.removeEventListener('open-change', this.#onOpenChange);
    this.#popover = undefined;
  }

  #onOpenChange = (event: Event) => {
    const { open, reason } = (event as CustomEvent<{ open: boolean; reason: string }>).detail;
    const popover = this.#popover;
    if (open || reason !== 'escape' || !popover?.contains(this.ownerDocument.activeElement)) return;

    // Focusing the trigger normally reopens the hover popover.
    const openOnHover = popover.openOnHover;
    popover.openOnHover = false;
    popover.parentElement?.querySelector<HTMLElement>('.media-mute-button')?.focus({ preventScroll: true });
    popover.openOnHover = openOnHover;
  };
}

if (!customElements.get('ws-volume-focus')) customElements.define('ws-volume-focus', VolumeFocusElement);
