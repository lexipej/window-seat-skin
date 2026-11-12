import { selectTextTrack } from '@videojs/html';
import type { VideoPlayerElement } from '@videojs/html/video';

const STORAGE_KEY = 'window-seat:prefs';

type Preferences = {
  volume?: number;
  muted?: boolean;
  rate?: number;
  captions?: string | null;
  captionLanguage?: string;
  aurora?: boolean;
  globe?: boolean;
  globeSize?: GlobeSize;
};

export const GLOBE_SIZES = ['small', 'medium', 'large'] as const;
export type GlobeSize = typeof GLOBE_SIZES[number];

function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return {
      volume: typeof value?.volume === 'number' && value.volume >= 0 && value.volume <= 1 ? value.volume : undefined,
      muted: typeof value?.muted === 'boolean' ? value.muted : undefined,
      rate: typeof value?.rate === 'number' && Number.isFinite(value.rate) && value.rate > 0 ? value.rate : undefined,
      captions: value?.captions === null || typeof value?.captions === 'string' ? value.captions : undefined,
      captionLanguage: typeof value?.captionLanguage === 'string' ? value.captionLanguage : undefined,
      aurora: typeof value?.aurora === 'boolean' ? value.aurora : undefined,
      globe: typeof value?.globe === 'boolean' ? value.globe : undefined,
      globeSize: GLOBE_SIZES.includes(value?.globeSize) ? value.globeSize : undefined,
    };
  } catch {
    return {};
  }
}

export function savePreferences(changes: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPreferences(), ...changes }));
  } catch {
    // The player also works when storage is blocked.
  }
}

export function readSkinPreference<K extends 'aurora' | 'globe' | 'globeSize'>(key: K): Preferences[K] {
  return readPreferences()[key];
}

type PlayerStore = VideoPlayerElement['store'];

const captionTracks = (store: PlayerStore) =>
  selectTextTrack(store.state)?.textTrackList.filter(({ kind }) => kind === 'captions' || kind === 'subtitles') ?? [];

const captionSelection = (tracks: ReturnType<typeof captionTracks>) =>
  tracks.find(({ mode }) => mode === 'showing')?.language ?? null;

class PreferencesElement extends HTMLElement {
  #unsubscribe?: () => void;

  connectedCallback() {
    const store = this.closest<VideoPlayerElement>('video-player')?.store;
    if (!store) return;

    let saved: Preferences = {};
    let target: HTMLElement | undefined;
    let previous: Preferences = {};
    let captionsPending = false;
    let restoring = false;
    const sync = () => {
      if (restoring) return;
      const media = store.target?.media;
      if (!(media instanceof HTMLElement) || !('readyState' in media) || Number(media.readyState) < 1) return;
      const tracks = captionTracks(store);

      if (media !== target) {
        target = media;
        saved = readPreferences();
        restoring = true;
        try {
          const muted = media.hasAttribute('muted') ? store.muted : saved.muted ?? store.muted;
          const canMute = store.mutedAvailability === 'available';
          if (canMute && !muted && store.muted) store.setMuted(false);
          if (saved.volume !== undefined && !media.hasAttribute('volume') && store.volumeAvailability === 'available') {
            store.setVolume(saved.volume);
          }
          if (canMute && muted && !store.muted) store.setMuted(true);
          if (saved.rate !== undefined && store.playbackRates.includes(saved.rate) &&
            !media.hasAttribute('playbackrate') && !media.hasAttribute('playback-rate')) {
            store.setPlaybackRate(saved.rate);
          }
        } finally {
          restoring = false;
        }
        captionsPending = true;
        previous = { volume: store.volume, muted: store.muted, rate: store.playbackRate };
      }

      if (captionsPending && tracks.length) {
        captionsPending = false;
        const language = saved.captions === null ? saved.captionLanguage : saved.captions;
        const preferred = tracks.find((track) => track.language === language);
        restoring = true;
        try {
          if (!media.querySelector('track:is([kind="captions"], [kind="subtitles"])[default]')) {
            if (preferred) store.selectSubtitlesTrack(preferred.id);
            if (saved.captions === null) store.selectSubtitlesTrack(null);
          }
        } finally {
          restoring = false;
        }
        previous.captions = captionSelection(captionTracks(store));
      }

      const next = { volume: store.volume, muted: store.muted, rate: store.playbackRate, captions: captionSelection(captionTracks(store)) };
      const changes: Preferences = {};
      if (next.volume !== previous.volume) changes.volume = next.volume;
      if (next.muted !== previous.muted) changes.muted = next.muted;
      if (next.rate !== previous.rate) changes.rate = next.rate;
      if (tracks.length && next.captions !== previous.captions) {
        changes.captions = next.captions;
        if (next.captions !== null) changes.captionLanguage = next.captions;
      }
      previous = next;
      if (Object.keys(changes).length) savePreferences(changes);
    };

    this.#unsubscribe = store.subscribe(sync);
    sync();
  }

  disconnectedCallback() {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }
}

if (!customElements.get('ws-preferences')) customElements.define('ws-preferences', PreferencesElement);
