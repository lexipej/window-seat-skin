// Every segment edge lands on a whole device pixel, so each gap renders at the same width and merged runs show no seam.
export function fitChapterGaps(slider: HTMLElement) {
  const chapters = [...slider.querySelectorAll<HTMLElement>('.media-time-slider-chapter')];
  const track = chapters[0]?.querySelector('.media-time-slider-track');
  if (!track) return;
  const { left, width } = track.getBoundingClientRect();
  if (!width) return;
  const ratio = devicePixelRatio || 1;
  const snap = (x: number) => Math.round(x * ratio) / ratio;
  const scale = parseFloat(getComputedStyle(slider).getPropertyValue('--ws-scale')) || 1;
  const gap = Math.max(3, snap(4 * scale));
  const bounds = chapters.map((chapter) => {
    const style = getComputedStyle(chapter);
    return [style.getPropertyValue('--media-slider-chapter-start'), style.getPropertyValue('--media-slider-chapter-end')]
      .map((value) => parseFloat(value) * width / 100);
  });
  const narrow = bounds.map(([start, end]) => end - start < 16 * scale);
  // A short segment joins the one after it (the last one joins the one before it).
  const gaps = narrow.map((short, index) =>
    !short && index < narrow.length - 1 && !(index === narrow.length - 2 && narrow[index + 1]),
  );
  const edges = bounds.slice(0, -1).map(([, end], index) => {
    const from = snap(left + end - (gaps[index] ? gap / 2 : 0));
    return [from - left, from + (gaps[index] ? gap : 0) - left];
  });
  // A merged run is drawn by its last segment alone, so a sub-pixel member can't carry the rounded outer end by itself.
  let runStart = 0;
  chapters.forEach((chapter, index) => {
    const owner = index === chapters.length - 1 || gaps[index];
    const { style } = chapter;
    style.setProperty('--ws-chapter-clip-start', `${owner ? (runStart ? edges[runStart - 1][1] : 0) : width}px`);
    style.setProperty('--ws-chapter-clip-end', `${owner && index < edges.length ? width - edges[index][0] : 0}px`);
    if (owner && !runStart) style.setProperty('--ws-chapter-left', 'var(--ws-r-pill)');
    else style.removeProperty('--ws-chapter-left');
    if (owner) runStart = index + 1;
  });
}

const ONE_SHOTS = new Set([
  'ws-play-pop-in', 'ws-play-pop-out', 'ws-icon-orbit', 'ws-draw-in', 'ws-hub-pulse',
  'ws-frame-grow', 'ws-frame-shrink', 'ws-route-draw', 'ws-pin-drop',
]);

/*
 * Unlocks the icon one-shots (CSS keys them on data-ws-interacted) without playing the ones that match states
 * already showing: only a state change after this point starts one.
 */
export function markInteracted(root: Element) {
  if (root.hasAttribute('data-ws-interacted')) return;
  root.setAttribute('data-ws-interacted', '');
  for (const animation of root.getAnimations({ subtree: true })) {
    if (animation instanceof CSSAnimation && ONE_SHOTS.has(animation.animationName) &&
      Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))) animation.finish();
  }
}

const EASE_OUT = 'cubic-bezier(.3, 0, .2, 1)';
const EASE_MORPH = 'cubic-bezier(.6, 0, .3, 1)';
const RIPPLE = [{ transform: 'none' }, { transform: 'translateY(-3.5px)' }, { transform: 'none' }];
// Every row icon also pops as a whole, so the response reads at 20 px even where the part motion is small.
const ROW_ICON_POP = [{ transform: 'none' }, { transform: 'scale(1.3)', offset: .4 }, { transform: 'none' }];

/*
 * One-shots for settings-row icons, played when a row gains the highlight. They run on the Web Animations API so a
 * quick sweep across the rows lets each one finish at rest instead of snapping back mid-move. Parts that hold a
 * second pose while highlighted (Quality knobs, picture-in-picture window) are CSS transitions instead.
 */
const ROW_ICON_MOTION: { parts: string; keyframes: Keyframe[]; duration: number; delay?: number; stagger?: number; easing: string }[] = [
  { parts: '.ws-speech-line', keyframes: [{ transform: 'scaleX(0)' }, { transform: 'none' }], duration: 360, stagger: 180, easing: EASE_OUT },
  {
    parts: '.ws-speed-needle',
    keyframes: [
      { transform: 'none', easing: EASE_OUT },
      // The needle rests right of centre, so it sweeps back across the dial and overshoots its rest on return.
      { transform: 'rotate(-90deg)', offset: .45, easing: 'ease-in-out' },
      { transform: 'rotate(10deg)', offset: .8, easing: 'ease-in-out' },
      { transform: 'none' },
    ],
    duration: 760,
    easing: 'linear',
  },
  { parts: '.ws-captions-c', keyframes: [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], duration: 520, stagger: 140, easing: EASE_MORPH },
  { parts: '.ws-curtains > path', keyframes: RIPPLE, duration: 520, stagger: 110, easing: 'ease-in-out' },
  { parts: '.ws-flight-route', keyframes: [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], duration: 560, easing: EASE_MORPH },
  {
    parts: '.ws-flight-pin',
    keyframes: [{ transform: 'none' }, { transform: 'translateY(-2px)', offset: .4 }, { transform: 'translateY(.4px)', offset: .8 }, { transform: 'none' }],
    duration: 300,
    delay: 140,
    easing: 'ease-in-out',
  },
];

type IconMotion = (typeof ROW_ICON_MOTION)[number] & { composite?: CompositeOperation };

const SPIN_ABOUT_CENTRE = { transformBox: 'view-box', transformOrigin: '10px 10px' };

/*
 * Hover one-shots for the control-bar icons, in the same language as the settings rows. Parts that already hold a
 * CSS transform for a state (gear, waves, picture-in-picture window, corners) add to it, so each lands back on its pose.
 */
const barIconMotion = (seekTurn: number, pipNudge: string): IconMotion[] => [
  { parts: '.ws-seek-arrow', keyframes: [{ transform: 'none' }, { transform: `rotate(${seekTurn}deg)`, offset: .45 }, { transform: 'none' }], duration: 460, easing: 'ease-in-out' },
  { parts: '.ws-wave', keyframes: [{ transform: 'none' }, { transform: 'translateX(1.5px)' }, { transform: 'none' }], duration: 420, stagger: 70, easing: 'ease-in-out', composite: 'add' },
  ...ROW_ICON_MOTION.filter(({ parts }) => /captions|flight/.test(parts)),
  {
    parts: '.ws-globe-orbit',
    keyframes: [{ ...SPIN_ABOUT_CENTRE, transform: 'none' }, { ...SPIN_ABOUT_CENTRE, transform: 'rotate(360deg)' }],
    duration: 900,
    easing: EASE_MORPH,
  },
  { parts: '.ws-gear', keyframes: [{ transform: 'none' }, { transform: 'rotate(50deg)', offset: .45 }, { transform: 'none' }], duration: 620, easing: 'ease-in-out', composite: 'add' },
  { parts: '.ws-pip-window', keyframes: [{ transform: 'none' }, { transform: `translate(${pipNudge})`, offset: .45 }, { transform: 'none' }], duration: 560, easing: 'ease-in-out', composite: 'add' },
  { parts: '.ws-icon-fullscreen > .ws-tone-2', keyframes: [{ transform: 'none' }, { transform: 'scale(1.22)', offset: .4 }, { transform: 'none' }], duration: 460, easing: EASE_MORPH },
];

const BAR_ICON_POP = [{ transform: 'none' }, { transform: 'scale(1.15)', offset: .4 }, { transform: 'none' }];

function playIcon(icon: Element, id: string, pop: Keyframe[], motion: IconMotion[]) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // A sweep back onto an icon that is still playing lets the running pass finish rather than restarting it.
  if (icon.getAnimations({ subtree: true }).some((animation) => animation.id === id && animation.playState === 'running')) return;
  icon.animate(pop, { duration: 460, easing: EASE_OUT }).id = id;
  for (const { parts, keyframes, duration, delay = 0, stagger = 0, easing, composite } of motion) {
    icon.querySelectorAll(parts).forEach((part, index) => {
      const animation = part.animate(keyframes, { duration, delay: delay + index * stagger, easing, composite, fill: 'backwards' });
      animation.id = id;
    });
  }
}

export function playRowIcon(row: Element) {
  const icon = row.querySelector('.media-menu-trigger-icon');
  if (icon) playIcon(icon, 'ws-row-icon', ROW_ICON_POP, ROW_ICON_MOTION);
}

export function playBarIcon(button: Element) {
  const icon = button.querySelector(':scope > .ws-icon, :scope > * > .ws-icon');
  if (!icon || button.hasAttribute('data-disabled')) return;
  playIcon(icon, 'ws-bar-icon', BAR_ICON_POP, barIconMotion(
    button.getAttribute('seconds')?.startsWith('-') ? -40 : 40,
    button.hasAttribute('data-pip') ? '-5px, -3px' : '5px, 3px',
  ));
}

function positionOffset(value: string, space: number) {
  const terms = [...value.matchAll(/([+-]?)\s*(\d*\.?\d+)(%|px)/g)];
  return terms.length ? terms.reduce((sum, [, sign, number, unit]) =>
    sum + (sign === '-' ? -1 : 1) * parseFloat(number) * (unit === '%' ? space / 100 : 1), 0
  ) : space / 2;
}

function pictureInsets(container: DOMRect, video: HTMLVideoElement | undefined, minWidth: number) {
  if (!video?.videoWidth || !video.videoHeight) return [0, 0, 0, 0];
  const box = video.getBoundingClientRect();
  if (!box.width || !box.height) return [0, 0, 0, 0];
  const { objectFit, objectPosition } = getComputedStyle(video);
  const scaleX = box.width / video.videoWidth;
  const scaleY = box.height / video.videoHeight;
  const contain = Math.min(scaleX, scaleY);
  const scale = objectFit === 'cover' ? Math.max(scaleX, scaleY)
    : objectFit === 'none' ? 1
    : objectFit === 'scale-down' ? Math.min(1, contain)
    : contain;
  const width = objectFit === 'fill' ? box.width : video.videoWidth * scale;
  const height = objectFit === 'fill' ? box.height : video.videoHeight * scale;
  const [x = '50%', y = '50%'] = objectPosition.match(/calc\([^)]*\)|\S+/g) ?? [];
  const videoLeft = box.left + positionOffset(x, box.width - width);
  const videoTop = box.top + positionOffset(y, box.height - height);
  const left = Math.max(box.left, videoLeft);
  const top = Math.max(box.top, videoTop);
  const right = Math.min(box.right, videoLeft + width);
  const bottom = Math.min(box.bottom, videoTop + height);
  if (Math.min(container.right, right) - Math.max(container.left, left) < minWidth || bottom <= top) return [0, 0, 0, 0];
  return [left - container.left, top - container.top, container.right - right, container.bottom - bottom]
    .map((inset) => Math.max(0, inset));
}

class MotionElement extends HTMLElement {
  #resize?: ResizeObserver;
  #listeners?: AbortController;
  #frames = new Set<number>();
  #chapters?: MutationObserver;
  #highlights?: MutationObserver;
  #sizes?: MutationObserver;

  connectedCallback() {
    const container = this.closest('media-container');
    if (!container) return;
    this.#listeners = new AbortController();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const rail = container.querySelector<HTMLElement>('.video-controls-bottom')!;
    const flight = container.querySelector<HTMLElement>('.ws-flight-popup')!;
    const slider = container.querySelector<HTMLElement>('media-time-slider')!;
    const chapterStrip = slider.querySelector('media-time-slider-chapters')!;
    const media = container.querySelector<HTMLVideoElement>('video, mux-video');
    const globe = container.querySelector<HTMLElement>('.ws-overview-trigger');
    const tools = container.querySelector<HTMLElement>('.video-controls-end');
    const animateSeek = (event: Event) => {
      const button = (event.target as Element | null)?.closest('media-seek-button');
      if (!button || reduced.matches || button.hasAttribute('data-disabled')) return;

      const arrow = button.querySelector('.ws-seek-arrow');
      const label = button.querySelector('.ws-seek-number');
      if (!arrow || !label) return;
      const rotation = button.getAttribute('seconds') === '-10' ? -360 : 360;
      for (const part of [arrow, label]) part.getAnimations().forEach((animation) => animation.cancel());
      arrow.animate([{ transform: 'rotate(0)' }, { transform: `rotate(${rotation}deg)` }], {
        duration: 360,
        easing: 'cubic-bezier(.2, .8, .2, 1)',
      });
      label.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], {
        duration: 260,
        easing: 'ease-out',
      });
    };
    const listenerOptions = { signal: this.#listeners.signal };
    // Capture phase on the document, so the flag is in place before any hotkey or control acts on the same press.
    const interacted = () => markInteracted(container);
    for (const type of ['pointerdown', 'keydown']) {
      container.ownerDocument.addEventListener(type, interacted, { ...listenerOptions, capture: true, once: true });
    }
    // CSS can't see drag direction: report it so the station thumb banks toward travel and levels out on release.
    slider.addEventListener('pointermove', (event) => {
      if (!slider.hasAttribute('data-dragging') || Math.abs(event.movementX) < 1) return;
      slider.setAttribute('data-ws-drag', event.movementX > 0 ? 'forward' : 'back');
    }, listenerOptions);
    for (const type of ['pointerup', 'pointercancel']) {
      container.ownerDocument.addEventListener(type, () => slider.removeAttribute('data-ws-drag'), listenerOptions);
    }
    // Mouse only: a touch tap toggles the controls, and pens and keyboards get no hover.
    container.addEventListener('pointerover', (event) => {
      if (event.pointerType !== 'mouse') return;
      const button = (event.target as Element).closest('.media-button');
      if (button && !button.contains(event.relatedTarget as Node | null)) playBarIcon(button);
    }, listenerOptions);
    container.addEventListener('click', animateSeek, listenerOptions);
    container.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') animateSeek(event);
    }, listenerOptions);
    container.addEventListener('keyup', (event) => {
      if (event.key === ' ') animateSeek(event);
    }, listenerOptions);
    const fit = () => {
      const bounds = container.getBoundingClientRect();
      const rem = parseFloat(getComputedStyle(container.ownerDocument.documentElement).fontSize);
      container.toggleAttribute('data-ws-large', bounds.width >= 80 * rem);
      const video = media?.shadowRoot?.querySelector('video') ?? media ?? undefined;
      const insets = pictureInsets(bounds, video, 30 * rem);
      const pictureWidth = bounds.width - insets[0] - insets[2];
      container.toggleAttribute('data-ws-picture-stacked', pictureWidth < 44 * rem);
      for (const [index, side] of ['left', 'top', 'right', 'bottom'].entries()) {
        container.style.setProperty(`--ws-picture-${side}`, `${insets[index]}px`);
      }
      const railBounds = rail.getBoundingClientRect();
      if (globe?.offsetWidth) {
        const { left, width } = globe.getBoundingClientRect();
        const center = left + width / 2;
        const inset = rail.matches(':dir(rtl)') ? center - railBounds.left : railBounds.right - center;
        container.style.setProperty('--ws-globe-anchor', `${inset}px`);
      }
      const compact = getComputedStyle(container.querySelector('.ws-flight-trigger')!).visibility === 'hidden';
      // Above the rail the log sits one popup gap over the islands (CSS subtracts the gap); compact layouts centre it.
      const railTop = railBounds.top - new DOMMatrixReadOnly(getComputedStyle(rail).transform).m42;
      const aboveRail = railTop - bounds.top - insets[1] - 12;
      const space = Math.min(Math.max(0, compact ? bounds.height - 24 : aboveRail), Math.max(0, bounds.height - 24));
      flight.toggleAttribute('data-ws-centered', compact);
      flight.style.setProperty('--ws-flight-space', `${space}px`);
      flight.style.setProperty('--ws-flight-bottom', `${bounds.bottom - railTop}px`);
      // Align the log's end edge with the tools island, like the settings menu.
      const toolsBounds = tools?.getBoundingClientRect();
      if (toolsBounds?.width) {
        const end = rail.matches(':dir(rtl)') ? toolsBounds.left - bounds.left : bounds.right - toolsBounds.right;
        flight.style.setProperty('--ws-flight-end', `${end}px`);
      }
      fitChapterGaps(slider);
    };
    for (const element of [media, media?.shadowRoot?.querySelector('video')]) {
      element?.addEventListener('loadedmetadata', fit, listenerOptions);
      element?.addEventListener('resize', fit, listenerOptions);
      element?.addEventListener('emptied', fit, listenerOptions);
    }
    container.ownerDocument.addEventListener('fullscreenchange', fit, listenerOptions);
    this.#chapters = new MutationObserver(fit);
    this.#chapters.observe(chapterStrip, { childList: true });
    this.#resize = new ResizeObserver(fit);
    for (const element of [container, rail, slider, globe, tools]) {
      if (element) this.#resize.observe(element);
    }
    /*
     * Row icons animate only once the viewer is browsing the open menu (a pointer move or key press inside it), so
     * the row Video.js highlights on a keyboard open stays still. Each open starts unarmed again.
     */
    this.#highlights = new MutationObserver((records) => {
      for (const { target } of records) {
        const row = target as Element;
        if (row.hasAttribute('data-highlighted') && row.closest('[data-ws-browsing]')) playRowIcon(row);
      }
    });
    /*
     * Settings navigation resizes the panel on the page slide's clock. Video.js writes --media-menu-width twice per
     * sync (without, then with, the page's scrollbar) and flushes style in between, which keeps restarting a CSS
     * width transition. Instead this reads the settled size once per sync and tweens to it from the size on screen.
     */
    const panels = new WeakMap<HTMLElement, { key: string; size: [number, number]; from?: [number, number]; animation?: Animation }>();
    this.#sizes = new MutationObserver((records) => {
      for (const menu of new Set(records.map(({ target }) => target as HTMLElement))) {
        const key = ['width', 'height'].map((side) => menu.style.getPropertyValue(`--media-menu-${side}`)).join();
        const panel = panels.get(menu);
        if (panel?.key === key) continue;
        const { animation } = panel ?? {};
        const progress = animation?.playState === 'running' ? animation.effect?.getComputedTiming().progress ?? 1 : 1;
        const from = panel && (panel.from && progress < 1
          ? panel.from.map((value, index) => value + (panel.size[index] - value) * progress) as [number, number]
          : panel.size);
        animation?.cancel();
        const style = getComputedStyle(menu);
        const size: [number, number] = [parseFloat(style.width), parseFloat(style.height)];
        panels.set(menu, { key, size });
        const navigating = menu.hasAttribute('data-open') && !menu.matches('[data-starting-style], [data-ending-style]');
        const duration = parseFloat(style.getPropertyValue('--ws-dur-nav'));
        if (!from || !navigating || reduced.matches || !duration || (from[0] === size[0] && from[1] === size[1])) continue;
        panels.set(menu, {
          key, size, from,
          animation: menu.animate(
            [{ width: `${from[0]}px`, height: `${from[1]}px` }, { width: `${size[0]}px`, height: `${size[1]}px` }],
            { duration, easing: style.getPropertyValue('--ws-ease-nav') || 'ease-out' },
          ),
        });
      }
    });
    container.querySelectorAll<HTMLElement>('.media-menu-popup').forEach((menu) => {
      const arm = () => menu.toggleAttribute('data-ws-browsing', menu.hasAttribute('data-open'));
      // Capture, so the flag is set before Video.js moves the highlight for the same event.
      menu.addEventListener('pointermove', arm, { ...listenerOptions, capture: true });
      menu.addEventListener('keydown', arm, { ...listenerOptions, capture: true });
      menu.addEventListener('open-change', (event) => {
        if (event.target === menu) menu.removeAttribute('data-ws-browsing');
      }, listenerOptions);
      this.#highlights!.observe(menu, { subtree: true, attributeFilter: ['data-highlighted'] });
      this.#sizes!.observe(menu, { attributeFilter: ['style'] });
    });
    container.querySelectorAll('media-dialog').forEach((dialog) => {
      dialog.addEventListener('open-change', (event) => {
        if (!(event as CustomEvent<{ open: boolean }>).detail.open) return;
        const frame = requestAnimationFrame(() => {
          this.#frames.delete(frame);
          // Settle the dialog's placement first so the origin is measured where it will actually open.
          fit();
          const trigger = container.querySelector(`[commandfor="${dialog.id}"]`);
          const popup = dialog.querySelector<HTMLElement>('media-dialog-popup');
          if (!trigger || !popup) return;
          const anchor = trigger.getBoundingClientRect();
          const bounds = popup.getBoundingClientRect();
          popup.style.transformOrigin = `${anchor.x + anchor.width / 2 - bounds.x}px ${anchor.y + anchor.height / 2 - bounds.y}px`;
        });
        this.#frames.add(frame);
      }, { signal: this.#listeners!.signal });
    });
  }

  disconnectedCallback() {
    this.#resize?.disconnect();
    this.#chapters?.disconnect();
    this.#highlights?.disconnect();
    this.#sizes?.disconnect();
    this.#listeners?.abort();
    this.#frames.forEach(cancelAnimationFrame);
    this.#frames.clear();
  }
}

if (!customElements.get('ws-motion')) customElements.define('ws-motion', MotionElement);
