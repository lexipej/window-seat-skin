import { buildOrbitElevations, parseOrbit, TWILIGHT_LIMIT } from '@skin/video/orbit-data';

// A compact version of the skin's pass gradient (skin/src/video/orbit.ts): same day/night/twilight rule and colours.
const DAY = 'var(--site-pass-day)';
const NIGHT = 'var(--site-pass-night)';

const dayAmount = (elevation: number) =>
  Math.max(0, Math.min(1, (elevation + TWILIGHT_LIMIT) / (2 * TWILIGHT_LIMIT)));

const colorAt = (elevation: number) => {
  const day = dayAmount(elevation);
  return day === 0 ? NIGHT : day === 1 ? DAY : `color-mix(in oklab, ${DAY} ${(day * 100).toFixed(1)}%, ${NIGHT})`;
};

// As in the skin: a day/night section thinner than `minFraction` at either end joins its neighbour.
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

function stripGradient(elevations: readonly number[]) {
  const steps = elevations.length - 1;
  const stops: string[] = [];
  const ticks: string[] = [];
  elevations.forEach((elevation, index) => {
    const color = colorAt(elevation);
    const position = (index / steps * 100).toFixed(2);
    // Flat runs only need their endpoints.
    if (index === 0 || index === steps || color !== colorAt(elevations[index - 1]) || color !== colorAt(elevations[index + 1])) {
      stops.push(`${color} ${position}%`);
    }
    const next = elevations[index + 1];
    if (next !== undefined && Math.sign(elevation) !== Math.sign(next)) {
      const at = ((index + elevation / (elevation - next)) / steps * 100).toFixed(2);
      ticks.push(`linear-gradient(to right, transparent calc(${at}% - 1px), var(--site-terminator) calc(${at}% - 1px) calc(${at}% + 1px), transparent calc(${at}% + 1px))`);
    }
  });
  return [...ticks, `linear-gradient(to right, ${stops.join(', ')})`].join(', ');
}

const cache = new Map<string, Promise<string | undefined>>();

/** Fetches a clip's orbit data and resolves to a CSS background for its day/night strip. */
export function loadStrip(url: string) {
  let strip = cache.get(url);
  if (!strip) {
    strip = fetch(url)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((json) => {
        const orbit = parseOrbit(json);
        return orbit && stripGradient(absorbEndSlivers(buildOrbitElevations(orbit, orbit.duration), 0.03));
      })
      .catch(() => undefined);
    cache.set(url, strip);
  }
  return strip;
}
