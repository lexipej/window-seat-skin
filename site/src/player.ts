import '@videojs/html/video/player';
import '@videojs/html/media/mux-video';
import type { VideoPlayerElement } from '@videojs/html/video';
import { createWindowSeatMarkup } from '@skin/video/skin';
import { NASA_CREDIT, NASA_INDEX, type Clip } from './clips';

export function clipCredit(clip: Clip) {
  const credit = document.createElement('p');
  const link = document.createElement('a');
  link.href = NASA_INDEX;
  link.textContent = clip.nasaId;
  credit.append(`${NASA_CREDIT}. `, link, '.');
  return credit;
}

export function createPlayer(clip: Clip, playbackId: string): VideoPlayerElement {
  const player = document.createElement('video-player');
  player.setAttribute('content-title', clip.title);
  player.innerHTML = createWindowSeatMarkup();

  const media = document.createElement('mux-video');
  media.setAttribute('src', `https://stream.mux.com/${playbackId}.m3u8`);
  media.setAttribute('playsinline', '');
  media.setAttribute('crossorigin', 'anonymous');
  media.setAttribute('preload', 'metadata');

  if (clip.tracks) {
    const chapters = document.createElement('track');
    chapters.kind = 'chapters';
    chapters.src = clip.tracks.chapters;
    chapters.default = true;
    const captions = document.createElement('track');
    captions.kind = 'captions';
    captions.srclang = 'en';
    captions.label = 'Places (English)';
    captions.src = clip.tracks.captions;
    media.append(chapters, captions);
    player.querySelector('ws-orbit')!.setAttribute('src', clip.tracks.orbit);
  }

  const description = document.createElement('p');
  description.textContent = clip.description;
  player.querySelector('.ws-flight-notes')!.append(description, clipCredit(clip));
  player.querySelector('media-container')!.prepend(media);
  return player;
}
