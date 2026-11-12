import { daylightAt, TWILIGHT_LIMIT, type Daylight } from '@skin/video/orbit-data';

const GAUGE_RANGE = 24;

export interface Sky {
  /** Sun elevation at the station in degrees; `undefined` (no orbit data) shows the night sky. */
  set(elevation: number | undefined): void;
  /** Pins the sky to an elevation (a preview); `undefined` follows the player again. */
  force(elevation: number | undefined): void;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/** Weights of the three sky layers. They overlap through twilight, so the page blends rather than switches. */
export function skyWeights(elevation: number) {
  return {
    day: smoothstep(-2, TWILIGHT_LIMIT + 2, elevation),
    dusk: Math.exp(-((elevation / (TWILIGHT_LIMIT + 1)) ** 2)),
    night: 1 - smoothstep(-TWILIGHT_LIMIT - 4, 1, elevation),
  };
}

// Stars are drawn once per size: the field never animates, so it costs nothing per frame.
function drawStars(canvas: HTMLCanvasElement) {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(ratio, ratio);
  // A seeded generator keeps the field identical between resizes.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const count = Math.round(width * height / 2600);
  for (let index = 0; index < count; index++) {
    const x = random() * width;
    const y = random() * height;
    const bright = random() ** 6;
    const radius = 0.35 + bright * 1.1;
    const tint = random();
    context.fillStyle = tint < 0.15 ? '#ffe2b8' : tint < 0.35 ? '#cfe0ff' : '#f4f6fb';
    context.globalAlpha = 0.25 + bright * 0.75;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

// One aurora curtain: vertical rays rising from a wavy base, green at the foot and violet at the crown.
function drawAurora(canvas: HTMLCanvasElement, phase: number) {
  const width = 1400;
  const height = 420;
  const draft = document.createElement('canvas');
  draft.width = width;
  draft.height = height;
  canvas.width = width;
  canvas.height = height;
  const rays = draft.getContext('2d');
  const context = canvas.getContext('2d');
  if (!rays || !context) return;
  for (let x = 0; x < width; x += 3) {
    const base = height - 40 - 46 * Math.sin(x * 0.0042 + phase) - 22 * Math.sin(x * 0.013 + phase * 2);
    const reach = 150 + 150 * (0.5 + 0.5 * Math.sin(x * 0.0071 + phase * 3));
    const strength = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(x * 0.031 + phase))) *
      (0.5 + 0.5 * Math.sin(x * 0.0035 + phase * 1.7)) * (0.7 + 0.3 * Math.sin(x * 0.19));
    const gradient = rays.createLinearGradient(0, base, 0, base - reach);
    gradient.addColorStop(0, `rgb(92 242 166 / ${0.9 * strength})`);
    gradient.addColorStop(0.35, `rgb(92 242 166 / ${0.45 * strength})`);
    gradient.addColorStop(1, 'rgb(157 123 255 / 0)');
    rays.fillStyle = gradient;
    rays.fillRect(x, base - reach, 3, reach + 6);
  }
  context.filter = 'blur(5px)';
  context.drawImage(draft, 0, 0);
}

export function createSky(root: HTMLElement): Sky {
  const stars = document.querySelector<HTMLCanvasElement>('.sky-stars')!;
  const hero = document.querySelector<HTMLElement>('.hero')!;
  let live: number | undefined;
  let forced: number | undefined;
  let daylight: Daylight | undefined;

  let resizeTimer = 0;
  let lastSize = '';
  const resize = () => {
    const size = `${stars.clientWidth}x${stars.clientHeight}`;
    if (size === lastSize) return;
    lastSize = size;
    drawStars(stars);
  };
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  }).observe(stars);
  resize();

  document.querySelectorAll<HTMLCanvasElement>('.aurora canvas').forEach((canvas, index) => drawAurora(canvas, index * 2.1 + 0.6));

  // The aurora's drift runs only while the window is on screen.
  new IntersectionObserver(([entry]) => root.toggleAttribute('data-hero-offscreen', !entry.isIntersecting)).observe(hero);

  // The weights live on the two sky layers only, rounded, so playback restyles a handful of elements a few times a second.
  const layers = [document.querySelector<HTMLElement>('.sky')!, hero.querySelector<HTMLElement>('.horizon')!];
  let written = '';
  const gauge = document.querySelector<HTMLElement>('.gauge')!;
  const apply = () => {
    const elevation = forced ?? live;
    const weights = elevation === undefined ? { day: 0, dusk: 0, night: 1 } : skyWeights(elevation);
    const values = [weights.day, weights.dusk, weights.night].map((weight) => weight.toFixed(2));
    if (values.join() !== written) {
      written = values.join();
      for (const layer of layers) {
        layer.style.setProperty('--sky-day', values[0]);
        layer.style.setProperty('--sky-dusk', values[1]);
        layer.style.setProperty('--sky-night', values[2]);
      }
    }
    gauge.toggleAttribute('data-empty', elevation === undefined);
    if (elevation !== undefined) {
      gauge.style.setProperty('--gauge', Math.max(-1, Math.min(1, elevation / GAUGE_RANGE)).toFixed(3));
    }
    const next = elevation === undefined ? 'night' : daylightAt(elevation);
    if (next !== daylight) root.dataset.sky = daylight = next;
    root.toggleAttribute('data-sky-forced', forced !== undefined);
  };

  apply();
  return {
    set(elevation) {
      if (elevation === live) return;
      live = elevation;
      if (forced === undefined) apply();
    },
    force(elevation) {
      forced = elevation;
      apply();
    },
  };
}
