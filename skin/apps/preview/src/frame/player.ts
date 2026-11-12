import '@videojs/html/video/player';
import '@videojs/html/media/mux-video';
import { createWindowSeatMarkup } from '@/video/skin';
import CAPTIONS from '../../../../../data/clips/iss075-e-25398-29083.captions.vtt?url';
import CHAPTERS from '../../../../../data/clips/iss075-e-25398-29083.chapters.vtt?url';
import ORBIT from '../../../../../data/clips/iss075-e-25398-29083.json?url';

// What the preview plays. Change these to try the skin with your own media; any Mux or HLS URL works.
// NASA ISS time-lapse ISS075-E-25398-29083 (Brazil to Kazakhstan), hosted on Mux, with its real tracks from data/clips.
const PLAYBACK_ID = 'OMqaVB01nWT7iGK2jutdmsAZykx1U7SvOmTCoxVmxJE4';
const SRC = `https://stream.mux.com/${PLAYBACK_ID}.m3u8`;
const POSTER = `https://image.mux.com/${PLAYBACK_ID}/thumbnail.webp?time=45`;

const MEDIA_PLACEHOLDER = '<!-- Add a compatible media component here. -->';

export function createPlayer(): HTMLElement {
  const player = document.createElement('video-player');
  const showOrbit = new URLSearchParams(location.search).get('orbit') === '1';
  player.setAttribute('poster', POSTER);
  player.setAttribute('content-title', 'Brazil to Kazakhstan');

  player.innerHTML = createWindowSeatMarkup().replace(
    MEDIA_PLACEHOLDER,
    `<mux-video src="${SRC}" playsinline crossorigin><track kind="chapters" label="English" srclang="en" src="${CHAPTERS}" default><track kind="captions" label="English" srclang="en" src="${CAPTIONS}"></mux-video>`
  );

  if (showOrbit) player.querySelector('ws-orbit')!.setAttribute('src', ORBIT);

  player.querySelector('.ws-flight-notes')!.innerHTML = `
    <p>A docked Soyuz stays in view as the station passes from Brazil across the Atlantic, then over Europe and into Kazakhstan.</p>
    <p>Video courtesy of the Earth Science and Remote Sensing Unit, NASA Johnson Space Center.</p>
    <a href="https://eol.jsc.nasa.gov/BeyondThePhotography/CrewEarthObservationsVideos/AutomaticallyGenerated/AutomaticallyGeneratedVideos.pl?year=2026" target="_blank" rel="noopener">ISS075-E-25398-29083 · NASA Gateway to Astronaut Photography of Earth</a>
  `.trim();

  return player;
}
