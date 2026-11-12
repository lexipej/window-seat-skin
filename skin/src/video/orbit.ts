import { PlayerController, playerContext, selectPlayback, selectTime, UIElement, type PropertyValues } from '@videojs/html';
import {
  buildOrbitElevations,
  daylightAt,
  parseOrbit,
  sampleOrbit,
  solarElevation,
  TWILIGHT_LIMIT,
  type Daylight,
  type OrbitData,
} from './orbit-data';

export const ORBIT_CHANGE = 'ws-orbit-change';
const MIN_SECTION = 6;

const PASS_COLORS = {
  day: 'var(--ws-strip-day)',
  night: 'var(--ws-strip-night)',
};

// A day/night section thinner than `minFraction` of the strip at either end joins its neighbour instead of drawing a sliver.
function absorbEndSlivers(elevations: readonly number[], minFraction: number) {
  const values = [...elevations];
  const steps = values.length - 1;
  const crossing = (index: number) => {
    const [from, to] = [values[index], values[index + 1]];
    return Math.sign(from) !== Math.sign(to) ? (index + from / (from - to)) / steps : undefined;
  };
  for (let index = 0; index < steps; index++) {
    const at = crossing(index);
    if (at === undefined) continue;
    if (at < minFraction) values.fill(values[index + 1], 0, index + 1);
    break;
  }
  for (let index = steps - 1; index >= 0; index--) {
    const at = crossing(index);
    if (at === undefined) continue;
    if (1 - at < minFraction) values.fill(values[index], index + 1);
    break;
  }
  return values;
}

function passGradient(elevations: readonly number[]) {
  const stops: string[] = [];
  const edges: string[] = [];
  const ticks: string[] = [];
  const steps = elevations.length - 1;
  const dayAmount = (elevation: number) =>
    Math.max(0, Math.min(1, (elevation + TWILIGHT_LIMIT) / (2 * TWILIGHT_LIMIT)));
  const colorAt = (elevation: number) => {
    const day = dayAmount(elevation);
    if (day === 0) return PASS_COLORS.night;
    if (day === 1) return PASS_COLORS.day;
    return `color-mix(in oklab, ${PASS_COLORS.day} ${(day * 100).toFixed(3)}%, ${PASS_COLORS.night})`;
  };

  const addStop = (elevation: number, position: string) => {
    stops.push(`${colorAt(elevation)} ${position}%`);
    const night = (1 - dayAmount(elevation)) * 100;
    edges.push(`color-mix(in oklab, var(--ws-strip-night-edge) ${night.toFixed(3)}%, transparent) ${position}%`);
  };

  for (let index = 0; index <= steps; index++) {
    const position = (index / steps * 100).toFixed(3);
    const from = elevations[index];
    const color = colorAt(from);
    // Flat day/night runs only need their endpoints; twilight follows the sampled elevation.
    if (index === 0 || index === steps || color !== colorAt(elevations[index - 1]) ||
      color !== colorAt(elevations[index + 1])) addStop(from, position);
    if (index === steps) continue;

    const delta = elevations[index + 1] - from;
    const crossings = [-TWILIGHT_LIMIT, TWILIGHT_LIMIT]
      .map((limit) => (limit - from) / delta)
      .filter((fraction) => fraction > 0 && fraction < 1)
      .sort((a, b) => a - b);
    for (const crossing of crossings) {
      addStop(from + delta * crossing, ((index + crossing) / steps * 100).toFixed(3));
    }

    const horizon = -from / delta;
    if (delta && horizon >= 0 && horizon < 1) {
      const position = ((index + horizon) / steps * 100).toFixed(3);
      ticks.push(`linear-gradient(to right, transparent calc(${position}% - 2px),
        var(--ws-band) calc(${position}% - 2px) calc(${position}% - 1px),
        var(--ws-terminator, #fff6d6) calc(${position}% - 1px) calc(${position}% + 1px),
        var(--ws-band) calc(${position}% + 1px) calc(${position}% + 2px),
        transparent calc(${position}% + 2px))`);
    }
  }
  return {
    passes: `linear-gradient(to right, ${stops.join(', ')})`,
    edge: `linear-gradient(to right, ${edges.join(', ')})`,
    terminators: ticks.join(', ') || 'none',
  };
}

export class OrbitElement extends UIElement {
  static properties = { src: { type: String } };
  declare src?: string;

  #time = new PlayerController(this, playerContext, selectTime);
  #container: HTMLElement | null = null;
  #request?: AbortController;
  #requestedSrc?: string;
  #orbit?: OrbitData;
  #track?: HTMLElement;
  #trackDuration = 0;
  #trackWidth = 0;
  #resize = new ResizeObserver(() => this.requestUpdate());

  connectedCallback() {
    super.connectedCallback();
    this.#container = this.closest('media-container');
    this.requestUpdate();
  }

  disconnectedCallback() {
    this.#request?.abort();
    this.#requestedSrc = undefined;
    this.#setOrbit();
    this.#container = null;
    super.disconnectedCallback();
  }

  update(changed: PropertyValues) {
    super.update(changed);
    if (!this.#container) return;

    const src = this.src?.trim() || undefined;
    if (src !== this.#requestedSrc) {
      this.#requestedSrc = src;
      this.#request?.abort();
      this.#setOrbit();
      if (src) {
        this.#request = new AbortController();
        void this.#load(src, this.#request.signal);
      }
    }
    this.#syncTrack();
  }

  sampleAt(time: number) {
    if (this.#orbit && Number.isFinite(time)) return sampleOrbit(this.#orbit, time);
  }

  get data(): OrbitData | undefined {
    return this.#orbit;
  }

  async #load(src: string, signal: AbortSignal) {
    try {
      const response = await fetch(src, { signal });
      if (!response.ok) return;
      const orbit = parseOrbit(await response.json());
      if (!signal.aborted) this.#setOrbit(orbit);
    } catch {
      // Orbit data is optional. The standard skin remains usable if a request or parse fails.
    }
  }

  #setOrbit(orbit?: OrbitData) {
    if (orbit === this.#orbit) return;
    this.#orbit = orbit;
    this.#container?.toggleAttribute('data-orbit', Boolean(orbit));
    this.#trackDuration = 0;
    this.#syncTrack();
    this.#container?.dispatchEvent(new Event(ORBIT_CHANGE));
  }

  #syncTrack() {
    if (!this.#orbit) {
      this.#track?.style.removeProperty('--ws-passes');
      this.#track?.style.removeProperty('--ws-passes-edge');
      this.#track?.style.removeProperty('--ws-terminators');
      this.#track = undefined;
      this.#resize.disconnect();
      return;
    }

    const mediaDuration = this.#time.value?.duration ?? 0;
    const duration = Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : this.#orbit.duration;
    const track = this.#container?.querySelector<HTMLElement>('media-time-slider') ?? undefined;
    const width = track?.clientWidth ?? 0;
    if (track === this.#track && duration === this.#trackDuration && width === this.#trackWidth) return;

    if (track !== this.#track) {
      this.#track?.style.removeProperty('--ws-passes');
      this.#track?.style.removeProperty('--ws-passes-edge');
      this.#track?.style.removeProperty('--ws-terminators');
    }
    if (track !== this.#track) {
      this.#resize.disconnect();
      if (track) this.#resize.observe(track);
    }
    this.#track = track;
    this.#trackDuration = duration;
    this.#trackWidth = width;
    const elevations = buildOrbitElevations(this.#orbit, duration);
    const { passes, edge, terminators } = passGradient(width ? absorbEndSlivers(elevations, MIN_SECTION / width) : elevations);
    track?.style.setProperty('--ws-passes', passes);
    track?.style.setProperty('--ws-passes-edge', edge);
    track?.style.setProperty('--ws-terminators', terminators);
  }
}

class DaylightElement extends UIElement {
  #time = new PlayerController(this, playerContext, selectTime);
  #playback = new PlayerController(this, playerContext, selectPlayback);
  #container: HTMLElement | null = null;
  #orbit?: OrbitElement;
  #daylight?: Daylight;
  #previous: string | null = null;
  #sweepTimer?: number;
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
    clearTimeout(this.#sweepTimer);
    this.#container?.removeAttribute('data-terminator-sweep');
    this.#container?.style.removeProperty('--ws-sweep-position');
    this.#container?.removeEventListener(ORBIT_CHANGE, this.#onOrbitChange);
    this.#applyDaylight();
    this.#container = null;
    this.#orbit = undefined;
    super.disconnectedCallback();
  }

  update(changed: PropertyValues) {
    super.update(changed);
    const sample = this.#orbit?.sampleAt(this.#time.value?.currentTime ?? 0);
    this.#applyDaylight(sample && daylightAt(solarElevation(sample)));
  }

  #applyDaylight(daylight?: Daylight) {
    const container = this.#container;
    if (!container || daylight === this.#daylight) return;
    if (!this.#daylight) this.#previous = container.getAttribute('data-daylight');
    const playback = this.#playback.value;
    const crossing = Boolean(daylight && this.#daylight && playback && !playback.paused &&
      !this.#time.value?.seeking && !matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches);
    container.toggleAttribute('data-daylight-transition', crossing);
    clearTimeout(this.#sweepTimer);
    container.removeAttribute('data-terminator-sweep');

    if (daylight) container.setAttribute('data-daylight', daylight);
    else if (this.#previous !== null) container.setAttribute('data-daylight', this.#previous);
    else container.removeAttribute('data-daylight');
    this.#daylight = daylight;

    if (crossing) {
      const island = container.querySelector('.video-controls-slider-row')?.getBoundingClientRect();
      const thumb = container.querySelector('.ws-iss-thumb')?.getBoundingClientRect();
      if (!island?.width || !thumb) return;
      const center = (thumb.left + thumb.width / 2 - island.left) / island.width;
      container.style.setProperty('--ws-sweep-position', `${center * 100}%`);
      container.setAttribute('data-terminator-sweep', '');
      this.#sweepTimer = window.setTimeout(() => container.removeAttribute('data-terminator-sweep'), 700);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ws-orbit': OrbitElement;
  }
}

if (!customElements.get('ws-orbit')) customElements.define('ws-orbit', OrbitElement);
if (!customElements.get('ws-daylight')) customElements.define('ws-daylight', DaylightElement);
