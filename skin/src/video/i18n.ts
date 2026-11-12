import { getI18nTranslations, registerI18n } from '@videojs/html/i18n';

export const WINDOW_SEAT_TEXT = {
  'windowSeat.places': 'Places',
  'windowSeat.flightLog': 'Overflight',
  'windowSeat.closeFlightLog': 'Close Overflight',
  'windowSeat.overview': 'Overview globe',
  'windowSeat.globeSize': 'Globe size: {size}. Activate to resize',
  'windowSeat.globeSize.small': 'small',
  'windowSeat.globeSize.medium': 'medium',
  'windowSeat.globeSize.large': 'large',
  'windowSeat.aurora': 'Aurora',
  'windowSeat.overPlace': 'Over {place}',
  'windowSeat.passComplete': 'Pass complete',
  'windowSeat.buffering': 'Reacquiring signal',
  // Themed title over the built-in error description, which stays as the plain second line.
  'errors.title': 'Loss of signal',
  'windowSeat.chapter': 'Chapter {number}',
  'windowSeat.pipPlaying': 'Playing in picture-in-picture',
  'windowSeat.pipBringBack': 'Bring back',
};

const existing = getI18nTranslations('en');
registerI18n('en', Object.fromEntries(Object.entries(WINDOW_SEAT_TEXT).filter(([key]) => existing[key] === undefined)));
