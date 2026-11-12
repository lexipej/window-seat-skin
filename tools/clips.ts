/** Candidate NASA ISS time-lapses. `recommended` marks the final set used for orbit data, chapters and captions. */
export type Lighting = 'Day' | 'Night' | 'Both';

export interface Clip {
  id: string;
  kind: 'auto' | 'curated';
  lighting: Lighting;
  /** NASA title (curated) or a short working label (auto). */
  title: string;
  url: string;
  page: string;
  /** Mission and first/last photo frame; auto clips map one photo to one video frame. */
  mission: string;
  firstFrame: number;
  lastFrame: number;
  recommended?: boolean;
  /** Suggested cut [start, end] in source seconds; orbit `videoTime` is relative to the start. */
  trim?: [number, number];
}

const AUTO_BASE = 'https://eol.jsc.nasa.gov/BeyondThePhotography/CrewEarthObservationsVideos/AutomaticallyGenerated';
const CURATED_BASE = 'https://eol.jsc.nasa.gov/BeyondThePhotography/CrewEarthObservationsVideos';

const auto = (file: string, title: string, recommended = false): Clip => {
  const [mission, , first, last, date, lighting] = file.split('-');
  return {
    id: `${mission}-e-${first}-${last}`.toLowerCase(),
    kind: 'auto',
    lighting: lighting as Lighting,
    title,
    url: `${AUTO_BASE}/${file}.mp4`,
    page: `${AUTO_BASE}/AutomaticallyGeneratedVideos.pl?year=${date.slice(0, 4)}`,
    mission,
    firstFrame: Number(first),
    lastFrame: Number(last),
    recommended,
  };
};

const curated = (slug: string, title: string, mission: string, firstFrame: number, lastFrame: number, lighting: Lighting): Clip => ({
  id: slug.toLowerCase().replace(/_/g, '-'),
  kind: 'curated',
  lighting,
  title,
  url: `${CURATED_BASE}/videos/${slug}/${slug}.mp4`,
  page: `${CURATED_BASE}/#${slug}`,
  mission,
  firstFrame,
  lastFrame,
});

export const clips: Clip[] = [
  auto('ISS075-E-25398-29083-20260727-Day', 'Brazil to Kazakhstan, day', true),
  auto('ISS075-E-198379-202048-20260928-Day', 'Central America to Germany, day', true),
  auto('ISS074-E-862582-866319-20260721-Day', 'South Africa to Mongolia, day', true),
  auto('ISS075-E-206114-209285-20261003-Both', 'Daylight to city lights', true),
  auto('ISS075-E-173875-177624-20260924-Night', 'Persian Gulf to the Indian Ocean, night'),
  auto('ISS075-E-121458-124939-20260916-Night', 'Black Sea to the Indian Ocean, night'),
  auto('ISS075-E-91561-94959-20260908-Night', 'North Pacific over Canada, sunset into night', true),
  auto('ISS075-E-230912-234062-20261010-Night', 'Southern Ocean, night'),
  // Trim skips the sunrise glare and array flicker at 13 s (flash flag) and the window reflection at the end.
  { ...auto('ISS075-E-240953-244701-20261003-Both', 'Argentina to China, night into day', true), trim: [16, 146] },
  {
    ...curated('WestAfrica-Alps_2017-12', 'West Africa to the Italian Alps', 'ISS053', 386864, 388463, 'Day'),
    id: 'iss053-e-386864-388463',
    trim: [3.6, 54],
  },
  curated('Nile-at-Night_ISS061_2019-11', 'Over the Nile at Night', 'ISS061', 61778, 63040, 'Night'),
  curated('aurora_ISS061_2019-11', 'Aurora Borealis Over North America', 'ISS061', 38363, 39943, 'Night'),
];
