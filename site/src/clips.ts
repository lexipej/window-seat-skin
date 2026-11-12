export const NASA_CREDIT = 'Video courtesy of the Earth Science and Remote Sensing Unit, NASA Johnson Space Center';
export const NASA_INDEX = 'https://eol.jsc.nasa.gov/BeyondThePhotography/CrewEarthObservationsVideos/AutomaticallyGenerated/AutomaticallyGeneratedVideos.pl?year=2026';

type ClipDetails = {
  nasaId: string;
  title: string;
  light: 'Day' | 'Night' | 'Day to night' | 'Night to day';
  length: string;
  description: string;
  playbackId: string;
};

export type Clip = ClipDetails & {
  id: string;
  tracks?: { orbit: string; chapters: string; captions: string };
};

function defineClip(details: ClipDetails, plain = false): Clip {
  const id = details.nasaId.split('-').slice(0, 4).join('-').toLowerCase();
  const asset = `${import.meta.env.BASE_URL}${id}`;
  return {
    ...details,
    id,
    tracks: plain ? undefined : {
      orbit: `${asset}.json`,
      chapters: `${asset}.chapters.vtt`,
      captions: `${asset}.captions.vtt`,
    },
  };
}

export const clips = [
  defineClip({
    nasaId: 'ISS075-E-25398-29083-20260727-Day',
    title: 'Brazil to Kazakhstan',
    light: 'Day',
    length: '2:27',
    description: 'A docked Soyuz stays in view as the station passes from Brazil across the Atlantic, then over Europe and into Kazakhstan.',
    playbackId: 'OMqaVB01nWT7iGK2jutdmsAZykx1U7SvOmTCoxVmxJE4',
  }),
  defineClip({
    nasaId: 'ISS075-E-198379-202048-20260928-Day',
    title: 'Central America to Germany',
    light: 'Day',
    length: '2:26',
    description: 'White cloud fields slide beneath the station’s solar arrays as it crosses Central America and the North Atlantic toward Europe.',
    playbackId: '1kG49M02781QDM00hwI6ep1PgFyT8OUSD8cfsAlFvBEWQ',
  }),
  defineClip({
    nasaId: 'ISS074-E-862582-866319-20260721-Day',
    title: 'South Africa to Mongolia',
    light: 'Day',
    length: '2:29',
    description: 'Sunlight glints off the Indian Ocean before the station crosses southern Africa, the Arabian Sea, India, and China.',
    playbackId: 'PMZDncueENu7UBSbs024lFyq6bZiAP92TDhjdDZIpMss',
  }),
  defineClip({
    nasaId: 'ISS075-E-206114-209285-20261003-Both',
    title: 'Daylight to city lights',
    light: 'Day to night',
    length: '2:06',
    description: 'Bright Earth and the station’s solar arrays fill the window before the pass crosses into darkness and city lights appear below.',
    playbackId: 'enqF7Kn02rTtKprBBbkfh2Mp8zf6cV2sUxuqRE01JAhXo',
  }),
  defineClip({
    nasaId: 'ISS075-E-91561-94959-20260908-Night',
    title: 'Aurora over Canada',
    light: 'Night',
    length: '2:16',
    description: 'Sunset over the North Pacific leads into a northern aurora above Canadian city lights. This pass uses the plain player.',
    playbackId: 'o6OqGLnHknCtZFpijtBgoUBgifHDcrMTaK01j1QiKo1U',
  }, true),
  defineClip({
    nasaId: 'ISS075-E-240953-244701-20261003-Both',
    title: 'Argentina to China',
    light: 'Night to day',
    length: '2:10',
    description: 'Follow the station across the South Atlantic and into daylight over Africa and Eurasia.',
    playbackId: 'OqVRzzVvj4XroPtt02UFbPXujdYfMwAWRkTpNdXZV35s',
  }),
] as const;
