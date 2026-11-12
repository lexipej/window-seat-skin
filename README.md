# Window Seat

A Video.js v10 skin for footage shot from orbit. Its accent colour and seek bar follow the sun at the station's position, computed from orbital data rather than sampled from the picture.

- **Live demo:** https://window-seat-red.vercel.app
- **Video on Mux**, public playback ID: `enqF7Kn02rTtKprBBbkfh2Mp8zf6cV2sUxuqRE01JAhXo` (the pass the demo opens on; five more are listed in [site/src/clips.ts](site/src/clips.ts))
- Entry for the [Video.js Skins Design Challenge](https://contra.com/community/topic/videojsskinschallenge)

## What it does

The demo plays six NASA time-lapses of Earth taken from the International Space Station. For each pass the repo holds the station's ground track, so the skin knows where the station is at every second and how high the sun is there.

- **The seek bar is the pass.** It is coloured by the light on the ground below the station: blue for day, violet for night, blended through twilight, with a tick at each sunrise and sunset. Chapters split it into segments. The thumb is a small station.
- **The accent follows the sun.** Gold while the sun is more than 6° up, coral within 6° of the horizon, green below. It cross-fades as playback crosses the day/night line.
- **A callout names the place below**, with latitude and longitude.
- **Overflight** (`P`) lists the places the station passes over as a route. Choosing one seeks to it.
- **A globe porthole** (`G`, in fullscreen) shows the station's position on a live 3D Earth, in three sizes.
- **Solid two-tone icons** drawn for this skin, animated by player state.

None of this is required. On an ordinary video with no orbit data, chapters or captions, the skin is a plain, complete player: play, seek, time, volume, captions, settings, picture-in-picture and fullscreen.

## Layout

| Folder | What it is |
|---|---|
| [skin/](skin/) | The skin, made with `npx @videojs/cli skin create`. `src/` is the skin; `apps/preview/` is a workbench with a spec sheet of every icon, state and popup. |
| [site/](site/) | The demo site. It imports the skin from `../skin/src`. |
| [data/clips/](data/clips/) | Orbit data, chapters and captions for the six passes. |
| [tools/](tools/) | Scripts that fetch each pass's ground track and build the place lists. |

## Run it

```bash
cd skin && bun install && bun dev
```

```bash
cd site && bun install && bun dev
```

The site needs the skin's packages installed too, so run `bun install` in both folders. `bun run typecheck` and `bun run build` work in each.

## Use the skin

Copy the `skin/` folder into your project, then give each player the skin's markup and a media element:

```html
<video-player></video-player>
```

```ts
import { createWindowSeatMarkup } from './skin/src/video/skin';

player.innerHTML = createWindowSeatMarkup();
player.querySelector('media-container').prepend(video);
```

See [skin/README.md](skin/README.md) for the details. The demo in [site/src/player.ts](site/src/player.ts) shows how a pass attaches its chapters, captions and orbit data.

### Customise

The skin honours Video.js's public custom properties:

| Property | Effect |
|---|---|
| `--media-accent-color` | Replaces the daylight accent with a fixed colour |
| `--media-accent-text-color` | Text and icons on the accent |
| `--media-border-color` | Hairline around the player |
| `--media-border-radius` | Corner radius of the video |
| `--media-font-family` | Interface type |
| `--media-object-fit` | How the video fills the frame |
| `--media-object-position` | Where the video sits in the frame |
| `--media-scale-unit` | Base unit for every control size (16 px) |

The seek thumb is replaceable, for other kinds of journey footage:

```html
<video-player marker="ship"></video-player>
```

Markers: `station` (default), `plane`, `ship`, `car`, `helicopter`, `train`, `dot`, or your own SVG. The Reuse section of the demo has a live customiser that writes this snippet for you.

## Keyboard

Tab reaches every control, and Escape closes menus and popups.

| Keys | Action |
|---|---|
| `Space` `K` | Play or pause |
| `←` `→` `J` `L` | Seek back or forward |
| `↑` `↓` | Volume |
| `M` | Mute |
| `0`–`9` | Jump to 0–90% |
| `Home` `End` | Start or end |
| `<` `>` | Slower or faster |
| `C` | Captions |
| `F` | Fullscreen |
| `I` | Picture-in-picture |
| `P` `N` | Overflight |
| `G` | Globe porthole |
| `A` | Aurora glow |

## Accessibility, measured

- axe-core 4.10.2 reports 0 violations on the demo and the spec sheet.
- Lowest text contrast across 280 sampled frames of the six passes: 8.66:1. Over the brightest day frame the callout measures 9.0:1; over the darkest night frame, 17.3:1.
- Controls cover 6.3% of the picture at 1280 px wide and 30.9% at 360 px with a mouse (39% with touch-sized targets).
- Touch targets are 44 px; with a mouse they are 36 px. No overflow down to a 240 px wide player.
- Focus is a 2 px ring in the accent. Reduced motion, increased contrast, reduced transparency and forced colours are all handled.

## Credits

- **Footage:** "Video courtesy of the Earth Science and Remote Sensing Unit, NASA Johnson Space Center" ([eol.jsc.nasa.gov](https://eol.jsc.nasa.gov/)). Each pass shows its NASA ID and a link to its source catalogue. This independent project has no NASA affiliation or endorsement.
- **Globe imagery:** NASA Earth Observatory, [Blue Marble Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/) and [2016 Black Marble](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/). Place names use [Natural Earth](https://www.naturalearthdata.com/).
- **Music**, from Pixabay:
  - [A New World](https://pixabay.com/music/indie-pop-a-new-world-116351/), [Acoustic Ballad (Piano and Guitar)](https://pixabay.com/music/acoustic-group-acoustic-ballad-piano-and-guitar-21385/) and [The Beauty of Nature](https://pixabay.com/music/alternative-the-beauty-of-nature-5109/) by Caffeine_Creek_Band
  - [Space Travellin' (Low Rumble)](https://pixabay.com/music/ambient-space-travellinx27-low-rumble-295793/) by Diff_Style
  - [Space Ambient Cinematic](https://pixabay.com/music/ambient-space-ambient-cinematic-442834/) by DELOSound
  - [Cinematic Ambient Atmosphere](https://pixabay.com/music/ambient-cinematic-ambient-atmosphere-463222/) by sigmaeffect
- **Icons:** drawn for this skin; a few single-shape glyphs are adapted from [Phosphor Icons](https://github.com/phosphor-icons/core) (MIT). See [third-party notices](THIRD-PARTY-NOTICES.md).
- **Preview stills** in the demo's Reuse section: the station frame is from the ISS passes; the plane, ship, car, helicopter and train stills were generated by the author with CapCut's image generator.

## Licence

The code is licensed under the [Apache License 2.0](LICENSE). NASA footage, NASA imagery and third-party audio are outside the code licence.
