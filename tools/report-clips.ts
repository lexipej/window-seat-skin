/** Prints the screening results as a Markdown table for docs/clips.md. Usage: bun tools/report-clips.ts */
import { existsSync, readFileSync } from 'node:fs';
import { clips } from './clips';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

console.log('| Clip | Kind | Light | Resolution | Length | Near-black | Mean luma | Max jumps/s (region / whole) | Flash flag |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const c of clips) {
  const path = `data/screen/${c.id}.json`;
  if (!existsSync(path)) continue;
  const r = JSON.parse(readFileSync(path, 'utf8'));
  const name = c.kind === 'curated' ? `[${c.title}](${c.page})` : `[${c.url.split('/').pop()!.replace('.mp4', '')}](${c.page})`;
  const flag = r.flash.flagged ? `**yes** at ${r.flash.flaggedWindowStarts.map((t: number) => `${t}s`).join(', ')} (cells ${r.flash.regionsFlagged.join(', ')})` : 'no';
  console.log(`| ${name} | ${c.kind} | ${c.lighting} | ${r.width}×${r.height} @ ${Math.round(r.fps * 100) / 100} fps | ${fmt(r.duration)} | ${(r.nearBlackShare * 100).toFixed(1)}% | ${r.meanYavg} | ${r.flash.regionMaxJumpsPerSecond} / ${r.flash.wholeFrameMaxJumpsPerSecond} | ${flag} |`);
}
