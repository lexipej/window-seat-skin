import { ORBIT_CHANGE, type OrbitElement } from '@skin/video/orbit';
import { solarElevation, subsolarPoint, wrapLongitude } from '@skin/video/orbit-data';
import type { Clip } from './clips';
import type { createPlayer } from './player';

type VideoPlayerElement = ReturnType<typeof createPlayer>;

type Cue = { start: number; end: number; text: string };

const MINUS = '−';

const seconds = (stamp: string) => stamp.split(':').reduce((total, part) => total * 60 + Number(part), 0);

const chapterCache = new Map<string, Promise<Cue[]>>();

/** Fetches a WebVTT chapters file into cues; an unreachable file gives no cues. */
export function loadChapters(url: string) {
  let cues = chapterCache.get(url);
  if (!cues) {
    cues = fetch(url)
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => text.split(/\r?\n\r?\n/).flatMap((block) => {
        const lines = block.split(/\r?\n/);
        const timing = lines.findIndex((line) => line.includes('-->'));
        if (timing < 0) return [];
        const [start, end] = lines[timing].split('-->').map((part) => seconds(part.trim().split(/\s/)[0]));
        return [{ start, end, text: lines.slice(timing + 1).join(' ').trim() }];
      }))
      .catch(() => []);
    chapterCache.set(url, cues);
  }
  return cues;
}

const degrees = (value: number, positive: string, negative: string) =>
  `${Math.abs(value).toFixed(2)}° ${value < 0 ? negative : positive}`;

export const signed = (value: number) => `${value < 0 ? MINUS : '+'}${Math.abs(value).toFixed(1)}°`;

// Apparent solar time at the station's nadir: noon when the sun is due overhead in longitude.
function solarTime(utcMs: number, lon: number) {
  const sun = subsolarPoint(utcMs);
  const minutes = ((12 * 60 + wrapLongitude(lon - sun.lon) * 4) % 1440 + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`;
}

/** Writes live telemetry for the playing pass and reports the sun's elevation; returns a disconnect function. */
export function followTelemetry(player: VideoPlayerElement, clip: Clip, onElevation: (elevation: number | undefined) => void) {
  const fields = new Map([...document.querySelectorAll<HTMLElement>('#telemetry [data-t]')].map((field) => [field.dataset.t!, field]));
  const orbit = player.querySelector<OrbitElement>('ws-orbit');
  const controller = new AbortController();
  let cues: Cue[] = [];

  const write = (key: string, value: string) => {
    const field = fields.get(key);
    if (field && field.textContent !== value) field.textContent = value;
  };

  const sync = () => {
    const time = player.store.currentTime ?? 0;
    const sample = clip.tracks ? orbit?.sampleAt(time) : undefined;
    const place = cues.find((cue) => time >= cue.start && time < cue.end)?.text;
    write('place', place ?? (clip.tracks ? '—' : 'No orbit data'));
    if (!sample) {
      for (const key of ['lat', 'lon', 'alt', 'sun', 'solar']) write(key, '—');
      onElevation(undefined);
      return;
    }
    const elevation = solarElevation(sample);
    write('lat', degrees(sample.lat, 'N', 'S'));
    write('lon', degrees(sample.lon, 'E', 'W'));
    write('alt', `${sample.altKm.toFixed(0)} km`);
    write('sun', signed(elevation));
    write('solar', solarTime(sample.utcMs, sample.lon));
    onElevation(elevation);
  };

  if (clip.tracks) {
    void loadChapters(clip.tracks.chapters).then((loaded) => {
      if (controller.signal.aborted) return;
      cues = loaded;
      sync();
    });
  }
  player.querySelector('media-container')?.addEventListener(ORBIT_CHANGE, sync, { signal: controller.signal });
  const unsubscribe = player.store.subscribe(sync);
  sync();

  return () => {
    controller.abort();
    unsubscribe();
  };
}
