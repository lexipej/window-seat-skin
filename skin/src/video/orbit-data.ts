export interface OrbitSample {
  videoTime: number;
  utcMs: number;
  lat: number;
  lon: number;
  altKm: number;
}

export interface OrbitData {
  duration: number;
  samples: readonly OrbitSample[];
}

export type Daylight = 'day' | 'twilight' | 'night';

const MS_PER_DAY = 86_400_000;
const RADIANS = Math.PI / 180;
const TRACK_STEPS = 160;
export const TWILIGHT_LIMIT = 6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
export const wrapLongitude = (degrees: number) => ((degrees + 180) % 360 + 360) % 360 - 180;

export function parseOrbit(value: unknown): OrbitData | undefined {
  if (!isRecord(value) || !Array.isArray(value.samples) || value.samples.length < 2) return;

  const samples: OrbitSample[] = [];
  for (const row of value.samples as unknown[]) {
    if (!isRecord(row)) return;
    const { videoTime, utc, lat, lon, altKm } = row;
    if (!isNumber(videoTime) || videoTime < 0 || videoTime <= (samples.at(-1)?.videoTime ?? -1)) return;
    if (typeof utc !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(utc)) return;
    const utcMs = Date.parse(utc);
    if (!Number.isFinite(utcMs) || !isNumber(lat) || Math.abs(lat) > 90 ||
      !isNumber(lon) || Math.abs(lon) > 180 || !isNumber(altKm)) return;

    samples.push({ videoTime, utcMs, lat, lon, altKm });
  }

  const lastTime = samples[samples.length - 1].videoTime;
  const duration = isNumber(value.duration) ? Math.max(value.duration, lastTime) : lastTime;
  return { duration, samples };
}

export function sampleOrbit(orbit: OrbitData, time: number): OrbitSample {
  const samples = orbit.samples;
  let low = 0;
  let high = samples.length - 1;
  if (time <= samples[low].videoTime) return samples[low];
  if (time >= samples[high].videoTime) return samples[high];

  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].videoTime <= time) low = middle;
    else high = middle;
  }

  const from = samples[low];
  const to = samples[high];
  const amount = (time - from.videoTime) / (to.videoTime - from.videoTime);
  return {
    videoTime: time,
    utcMs: mix(from.utcMs, to.utcMs, amount),
    lat: mix(from.lat, to.lat, amount),
    lon: wrapLongitude(from.lon + wrapLongitude(to.lon - from.lon) * amount),
    altKm: mix(from.altKm, to.altKm, amount),
  };
}

// NOAA's fractional-year approximation for the point directly below the sun.
export function subsolarPoint(utcMs: number) {
  const date = new Date(utcMs);
  const year = date.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const daysInYear = (Date.UTC(year + 1, 0, 1) - startOfYear) / MS_PER_DAY;
  const gamma = (2 * Math.PI / daysInYear) * ((utcMs - startOfYear) / MS_PER_DAY - 0.5);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const midnight = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  const solarMinutes = (utcMs - midnight) / 60_000 + equationOfTime;
  return { lat: declination / RADIANS, lon: wrapLongitude(180 - solarMinutes / 4) };
}

export function solarElevation({ utcMs, lat, lon }: OrbitSample): number {
  const sun = subsolarPoint(utcMs);
  const declination = sun.lat * RADIANS;
  const hourAngle = (lon - sun.lon) * RADIANS;
  const latitude = lat * RADIANS;
  const sine = Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sine))) / RADIANS;
}

export const daylightAt = (elevation: number): Daylight =>
  elevation > TWILIGHT_LIMIT ? 'day' : elevation < -TWILIGHT_LIMIT ? 'night' : 'twilight';

export function buildOrbitElevations(orbit: OrbitData, duration: number): number[] {
  return Array.from({ length: TRACK_STEPS + 1 }, (_, index) =>
    solarElevation(sampleOrbit(orbit, duration * index / TRACK_STEPS)));
}
