/**
 * Reverse-geocodes each clip's nadir samples against Natural Earth (public domain) and writes
 * data/clips/<id>.chapters.vtt (one cue per place) and data/clips/<id>.captions.vtt ("Over Brazil").
 *
 * Usage: bun tools/make-places.ts [id ...]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Sample } from './fetch-orbit';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson';
const COUNTRIES = 'ne_50m_admin_0_countries';
const MARINE = 'ne_10m_geography_marine_polys';
const MIN_SEGMENT_S = Number(process.env.MIN_SEGMENT_S ?? 2); // seconds of video; shorter passes (tiny islands, coastal slivers) merge into a neighbour

type Ring = [number, number][];
interface Place {
  name: string;
  water: boolean;
  polygons: Ring[][];
  bbox: [number, number, number, number];
}

const load = async (file: string) => {
  const path = `data/raw/natural-earth/${file}.geojson`;
  if (!existsSync(path)) {
    if (!existsSync('data/raw/natural-earth')) mkdirSync('data/raw/natural-earth', { recursive: true });
    writeFileSync(path, await (await fetch(`${NE}/${file}.geojson`)).text());
  }
  return JSON.parse(readFileSync(path, 'utf8')).features as { properties: Record<string, string | null>; geometry: { type: string; coordinates: unknown } }[];
};

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const toPlace = (name: string, water: boolean, geometry: { type: string; coordinates: unknown }): Place => {
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as Ring[][];
  const pts = polygons.flatMap((p) => p[0]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { name, water, polygons, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
};

const inRing = (x: number, y: number, ring: Ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const contains = (p: Place, lon: number, lat: number) =>
  lon >= p.bbox[0] && lon <= p.bbox[2] && lat >= p.bbox[1] && lat <= p.bbox[3] &&
  p.polygons.some(([outer, ...holes]) => inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h)));

const area = (p: Place) => (p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1]);

// Short common names ("Russia", "Czechia"), except where NAME is abbreviated ("Dem. Rep. Congo").
const countryName = ({ NAME, NAME_LONG }: Record<string, string | null>) =>
  NAME === 'United States of America' ? 'United States' : NAME!.includes('.') ? NAME_LONG! : NAME!;
const countries = (await load(COUNTRIES)).map((f) => toPlace(countryName(f.properties), false, f.geometry));
const seas = (await load(MARINE))
  .filter((f) => f.properties.name && f.properties.featurecla !== 'generic')
  // Ocean names carry the North/South split ("South Atlantic Ocean"); name_en drops it.
  .map((f) => toPlace(f.properties.featurecla === 'ocean' ? titleCase(f.properties.name!) : (f.properties.name_en ?? f.properties.name!), true, f.geometry))
  .sort((a, b) => area(a) - area(b)); // most specific water body first

/** Land first, then the smallest water body containing the point, then a broad ocean guess. */
const placeAt = (lat: number, lon: number): Pick<Place, 'name' | 'water'> =>
  countries.find((c) => contains(c, lon, lat)) ??
  seas.find((s) => contains(s, lon, lat)) ?? { name: lat < -60 ? 'Southern Ocean' : 'Open Ocean', water: true };

const THE_COUNTRY = /^(United|Republic|Democratic|Dominican|Central African|Netherlands|Philippines|Bahamas|Gambia|Maldives|Solomon|Marshall|Falkland|Comoros|Seychelles)/;
const caption = ({ name, water }: Pick<Place, 'name' | 'water'>) =>
  `Over ${(water && !/^Lake /.test(name)) || THE_COUNTRY.test(name) ? 'the ' : ''}${name}`;

const vttTime = (s: number) => {
  const ms = Math.round(s * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
};

interface Segment {
  place: Pick<Place, 'name' | 'water'>;
  start: number;
  end: number;
}

const segments = (samples: Sample[], duration: number) => {
  const segs: Segment[] = [];
  samples.forEach((s, i) => {
    const place = placeAt(s.lat, s.lon);
    const last = segs.at(-1);
    if (last?.place.name === place.name) return;
    // Boundary halfway between the last sample of the old place and the first of the new one.
    const start = i === 0 ? 0 : (samples[i - 1].videoTime + s.videoTime) / 2;
    if (last) last.end = start;
    segs.push({ place, start, end: duration });
  });
  // Merge short passes into the previous segment (or the next one at the start), then re-join equal neighbours.
  for (let i = 0; i < segs.length && segs.length > 1; ) {
    const s = segs[i];
    if (s.end - s.start >= MIN_SEGMENT_S) { i++; continue; }
    if (i > 0) segs[i - 1].end = s.end;
    else segs[1].start = s.start;
    segs.splice(i, 1);
    if (i > 0 && segs[i] && segs[i].place.name === segs[i - 1].place.name) {
      segs[i - 1].end = segs[i].end;
      segs.splice(i, 1);
    }
    i = Math.max(0, i - 1);
  }
  return segs;
};

const vtt = (segs: Segment[], text: (s: Segment) => string) =>
  'WEBVTT\n\n' + segs.map((s, i) => `${i + 1}\n${vttTime(s.start)} --> ${vttTime(s.end)}\n${text(s)}\n`).join('\n');

const ids = process.argv.slice(2);
for (const file of readdirSync('data/clips').filter((f) => /^[^.]+\.json$/.test(f))) {
  const clip = JSON.parse(readFileSync(`data/clips/${file}`, 'utf8')) as { id: string; samples: Sample[]; duration: number };
  if (ids.length && !ids.includes(clip.id)) continue;
  const segs = segments(clip.samples, clip.duration);
  writeFileSync(`data/clips/${clip.id}.chapters.vtt`, vtt(segs, (s) => s.place.name));
  writeFileSync(`data/clips/${clip.id}.captions.vtt`, vtt(segs, (s) => caption(s.place)));
  console.log(`${clip.id}: ${segs.map((s) => `${s.place.name} (${Math.round(s.end - s.start)}s)`).join(' → ')}`);
}
