/**
 * Samples NASA photo pages (~1 per second of video) for each recommended clip and writes data/clips/<id>.json.
 * Raw HTML is cached under data/raw/photos/ so re-runs make no requests.
 *
 * Usage: bun tools/fetch-orbit.ts [id ...]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clips, type Clip } from './clips';

const FPS = 25; // auto clips: one photo per video frame
const DELAY_MS = 600;
const USER_AGENT = 'window-seat-orbit-sampler (personal project; cached, one request at a time)';

export interface Sample {
  videoTime: number;
  utc: string;
  lat: number;
  lon: number;
  altKm: number;
  /** Photo frame number, so samples can be re-mapped after a trim. */
  frame: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const photoHtml = async (mission: string, frame: number) => {
  const path = `data/raw/photos/${mission}-E-${frame}.html`;
  if (existsSync(path)) return readFileSync(path, 'utf8');
  const url = `https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?mission=${mission}&roll=E&frame=${frame}`;
  for (let attempt = 1; ; attempt++) {
    await sleep(DELAY_MS);
    // Retry timeouts and network errors as well as HTTP errors; the server is slow at times.
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) }).catch((e: Error) => e);
    if (res instanceof Response && res.ok) {
      const html = await res.text();
      writeFileSync(path, html);
      return html;
    }
    const reason = res instanceof Response ? `HTTP ${res.status}` : res.message;
    if (attempt >= 4) throw new Error(`${url}: ${reason}`);
    await sleep(5000 * attempt);
  }
};

const field = (html: string, label: RegExp) => html.match(label)?.[1]?.trim();

/** Parses date, time, nadir point and altitude from a photo page; returns undefined when any is missing. */
export const parsePhoto = (html: string) => {
  const date = field(html, /Date taken<\/b><\/em><\/td><td[^>]*>\s*([\d.]+)/);
  const time = field(html, /Time taken<\/b><\/em><\/td><td[^>]*>\s*([\d:]+)\s*GMT/);
  const nadir = html.match(/nadir point:<\/b><\/em>\s*([\d.]+)&deg;\s*([NS]),\s*([\d.]+)&deg;\s*([EW])/);
  const alt = field(html, /Spacecraft Altitude<\/b><\/em>:[^(]*\((\d+)\s*km\)/);
  if (!date || !time || !nadir || !alt) return undefined;
  return {
    utc: `${date.replace(/\./g, '-')}T${time}Z`,
    lat: Number(nadir[1]) * (nadir[2] === 'S' ? -1 : 1),
    lon: Number(nadir[3]) * (nadir[4] === 'W' ? -1 : 1),
    altKm: Number(alt),
  };
};

const sampleFrames = (clip: Clip) => {
  const [start, end] = clip.trim ?? [0, Infinity];
  const first = clip.firstFrame + Math.round(start * FPS);
  const last = Math.min(clip.lastFrame, clip.firstFrame + Math.round(end * FPS) - 1);
  const frames: number[] = [];
  for (let f = first; f <= last; f += FPS) frames.push(f);
  if (frames.at(-1) !== last) frames.push(last);
  return { first, frames, duration: (last - first + 1) / FPS };
};

const run = async (clip: Clip) => {
  if (clip.kind !== 'auto') throw new Error(`${clip.id}: only auto clips have a one-photo-per-frame mapping`);
  const { first, frames, duration } = sampleFrames(clip);
  const samples: Sample[] = [];
  for (const frame of frames) {
    // Some frames have no nadir data; step forward a few frames before giving up on this sample.
    for (let offset = 0; offset < 5 && frame + offset <= clip.lastFrame; offset++) {
      const photo = parsePhoto(await photoHtml(clip.mission, frame + offset));
      if (!photo) continue;
      samples.push({ videoTime: Math.round(((frame + offset - first) / FPS) * 100) / 100, ...photo, frame: frame + offset });
      break;
    }
    process.stdout.write(`\r${clip.id}: ${samples.length}/${frames.length}`);
  }
  process.stdout.write('\n');
  writeFileSync(`data/clips/${clip.id}.json`, JSON.stringify({ id: clip.id, title: clip.title, source: clip.url, page: clip.page, trim: clip.trim ?? null, duration, samples }, null, 2) + '\n');
};

if (import.meta.main) {
  // existsSync guard: Bun 1.3 on Windows can throw EEXIST even with `recursive`.
  for (const dir of ['data/raw/photos', 'data/clips']) if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const ids = process.argv.slice(2);
  for (const clip of clips.filter((c) => (ids.length ? ids.includes(c.id) : c.recommended))) await run(clip);
}
