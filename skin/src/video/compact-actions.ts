class CompactActionsElement extends HTMLElement {
  #listeners?: AbortController;
  #resize?: ResizeObserver;
  #attributes?: MutationObserver;

  connectedCallback() {
    const container = this.closest('media-container');
    if (!container) return;
    this.#listeners = new AbortController();
    const { signal } = this.#listeners;
    const updates = [...container.querySelectorAll<HTMLElement>('.ws-compact-action')].flatMap((item) => {
      const control = container.querySelector<HTMLElement>(item.dataset.action!);
      if (!control) return [];
      if (!item.querySelector('media-icon, svg')) {
        const icon = control.querySelector('svg')?.cloneNode(true) as SVGElement | undefined;
        if (icon) {
          icon.classList.add('media-menu-trigger-icon');
          item.prepend(icon);
        }
      }
      const label = item.querySelector('[data-action-label]');
      const sync = () => {
        const style = getComputedStyle(control);
        const moved = style.display === 'none' || style.visibility === 'hidden';
        const unavailable = control.matches('[hidden], [data-hidden], [aria-disabled="true"], [data-availability="unsupported"], [data-availability="unavailable"]');
        const name = control.getAttribute('aria-label');
        if (label && name && label.textContent !== name) label.textContent = name;
        item.hidden = !moved || unavailable || Boolean(label && !name);
      };
      item.addEventListener('select', () => {
        // The Settings menu closes synchronously after selection.
        queueMicrotask(() => {
          if (!signal.aborted) control.click();
        });
      }, { signal });
      return [{ control, sync }];
    });

    const sync = () => updates.forEach((action) => action.sync());
    this.#resize = new ResizeObserver(sync);
    const pictureControls = container.querySelector('.video-controls-content');
    this.#resize.observe(pictureControls ?? container);
    this.#attributes = new MutationObserver(sync);
    for (const { control } of updates) {
      this.#attributes.observe(control, {
        attributeFilter: ['hidden', 'data-hidden', 'data-availability', 'aria-disabled', 'aria-label'],
      });
    }
    sync();
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#resize?.disconnect();
    this.#attributes?.disconnect();
  }
}

if (!customElements.get('ws-compact-actions')) customElements.define('ws-compact-actions', CompactActionsElement);
