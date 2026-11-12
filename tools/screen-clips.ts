/**
 * Streams each candidate clip through ffmpeg once and writes:
 * - docs/clips/<id>-sheet-<n>.jpg: contact sheets (one tile every 8 s, 6×3 per sheet)
 * - data/screen/<id>.json: near-black share and a per-region flash screen
 *
 * Usage: bun tools/screen-clips.ts [id ...]
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { clips } from './clips';

const ensureDir = (dir: string) => existsSync(dir) || mkdirSync(dir, { recursive: true }); // Bun on Windows can throw EEXIST despite `recursive`

const GRID = 4;
const CELLS = GRID * GRID;
// swscale's area filter can't average 1280 px into 4 (it point-samples), so downscale to 64×44 and average 16×11 blocks here.
const W = 64;
const H = 44;
const NEAR_BLACK_FULL = 12; // whole-frame YAVG on a 0–255 full-range scale
const FLASH_DELTA = 0.1; // WCAG: change of at least 10% relative luminance…
const FLASH_DARK = 0.8; // …where the darker state is below 0.80
const FLAG_JUMPS = 3; // flag 3+ big jumps in any 1 s window (stricter than WCAG's 3 flashes = 6 transitions)

const probe = async (url: string) => {
  const out = await new Response(
    Bun.spawn(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,color_range:format=duration', '-of', 'json', url]).stdout,
  ).json();
  const s = out.streams[0];
  const [num, den] = s.r_frame_rate.split('/').map(Number);
  return { width: s.width, height: s.height, fps: num / den, frames: Number(s.nb_frames), duration: Number(out.format.duration), fullRange: s.color_range === 'pc' };
};

/** Normalised luma (0–1) to approximate relative luminance via the sRGB curve. */
const toLuminance = (y: number) => (y <= 0.04045 ? y / 12.92 : ((y + 0.055) / 1.055) ** 2.4);

/** Collapse a series into monotonic runs and keep the big ones as transitions (frame index of the run's end). */
const transitions = (series: number[]) => {
  const out: number[] = [];
  let start = 0;
  let dir = 0;
  const close = (end: number) => {
    const a = series[start];
    const b = series[end];
    if (Math.abs(b - a) >= FLASH_DELTA && Math.min(a, b) < FLASH_DARK) out.push(end);
  };
  for (let i = 1; i < series.length; i++) {
    const d = Math.sign(series[i] - series[i - 1]);
    if (d === 0) continue;
    if (dir !== 0 && d !== dir) {
      close(i - 1);
      start = i - 1;
    }
    dir = d;
  }
  if (series.length > 1) close(series.length - 1);
  return out;
};

/** Largest number of transitions inside any window of `win` frames, plus the start times (s) of windows at or over the flag. */
const worstWindow = (marks: number[], win: number, fps: number) => {
  let max = 0;
  const flagged: number[] = [];
  for (let i = 0, j = 0; j < marks.length; j++) {
    while (marks[j] - marks[i] >= win) i++;
    const n = j - i + 1;
    max = Math.max(max, n);
    if (n >= FLAG_JUMPS) flagged.push(Math.round((marks[i] / fps) * 10) / 10);
  }
  return { max, flagged: [...new Set(flagged)] };
};

const screen = async (clip: (typeof clips)[number]) => {
  const info = await probe(clip.url);
  ensureDir('docs/clips');
  // Relative output path: ffmpeg filter/file arguments choke on Windows drive colons.
  const proc = Bun.spawn(
    [
      'ffmpeg', '-v', 'error', '-y', '-i', clip.url,
      '-filter_complex', `[0:v]split=2[a][b];[a]fps=1/8,scale=320:-1,tile=6x3[sheet];[b]extractplanes=y,scale=${W}:${H}:flags=area[grid]`,
      '-map', '[sheet]', '-q:v', '4', `docs/clips/${clip.id}-sheet-%d.jpg`,
      '-map', '[grid]', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1',
    ],
    { stdout: 'pipe', stderr: 'inherit' },
  );
  const raw = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  if ((await proc.exited) !== 0) throw new Error(`ffmpeg failed for ${clip.id}`);

  // Normalise to 0–1 whatever the source range (auto clips are full range, curated are TV range).
  const [lo, hi] = info.fullRange ? [0, 255] : [16, 235];
  const norm = (v: number) => Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  const frames = Math.floor(raw.length / (W * H));
  const bw = W / GRID;
  const bh = H / GRID;
  // Mean normalised luma per cell per frame: grid[f][c].
  const grid = Array.from({ length: frames }, (_, f) =>
    Array.from({ length: CELLS }, (_, c) => {
      const x0 = (c % GRID) * bw;
      const y0 = Math.floor(c / GRID) * bh;
      let sum = 0;
      for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) sum += norm(raw[f * W * H + y * W + x]);
      return sum / (bw * bh);
    }),
  );
  const cells = Array.from({ length: CELLS }, (_, c) => grid.map((g) => toLuminance(g[c])));
  const yavg = grid.map((g) => (g.reduce((a, b) => a + b, 0) / CELLS) * 255);
  const whole = yavg.map((y) => toLuminance(y / 255));

  const win = Math.round(info.fps);
  const regions = cells.map((s, c) => ({ cell: c, ...worstWindow(transitions(s), win, info.fps) }));
  const worst = regions.reduce((a, b) => (b.max > a.max ? b : a));
  const flaggedTimes = [...new Set(regions.flatMap((r) => r.flagged))].sort((a, b) => a - b);

  const result = {
    id: clip.id,
    url: clip.url,
    ...info,
    framesRead: frames,
    nearBlackShare: Math.round((yavg.filter((y) => y < NEAR_BLACK_FULL).length / frames) * 1000) / 1000,
    meanYavg: Math.round((yavg.reduce((a, b) => a + b, 0) / frames) * 10) / 10,
    flash: {
      wholeFrameMaxJumpsPerSecond: worstWindow(transitions(whole), win, info.fps).max,
      regionMaxJumpsPerSecond: worst.max,
      worstCell: worst.cell,
      flagged: worst.max >= FLAG_JUMPS,
      flaggedWindowStarts: flaggedTimes,
      regionsFlagged: regions.filter((r) => r.max >= FLAG_JUMPS).map((r) => r.cell),
    },
  };
  ensureDir('data/screen');
  writeFileSync(`data/screen/${clip.id}.json`, JSON.stringify(result, null, 2) + '\n');
  return result;
};

const ids = process.argv.slice(2);
for (const clip of clips.filter((c) => !ids.length || ids.includes(c.id))) {
  const r = await screen(clip);
  console.log(`${r.id}  ${r.width}x${r.height} ${r.duration.toFixed(1)}s  black ${(r.nearBlackShare * 100).toFixed(1)}%  flash max ${r.flash.regionMaxJumpsPerSecond}/s${r.flash.flagged ? ' FLAGGED' : ''}`);
}
