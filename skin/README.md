# window-seat

A Video.js video skin for HTML, styled with CSS. It started from the Scaffold skin.

## Develop

```sh
bun dev
```

The workbench opens your skin in a slimmed-down version of the Video.js sandbox. It plays the Brazil to Kazakhstan pass from Mux, with its chapters, captions and orbit data; change the media in `apps/preview/src/frame/player`. The options panel sets the player's width and aspect ratio, the color scheme, text direction, and language, and playback options such as autoplay, muted, loop, and preload. The arrow button opens the preview on its own. The settings live in the URL, so a link such as `/?width=384&ratio=9:16&dir=rtl&locale=ar` opens the workbench in that state, and `/preview.html#width=384&ratio=9:16` opens the preview alone.

## Deploy

```sh
bun run deploy
```

It asks where to deploy the workbench: Vercel, Netlify, or Cloudflare Pages. Name one to skip the question, such as `bun run deploy vercel`. The first time, the host's CLI signs you in and creates the project, then every run prints the URL. Vercel and Netlify deploy to a preview URL you can share; to deploy to production instead, add `--prod` to the `deploy:netlify` script, or to both commands in `deploy:vercel`.

To deploy on every push instead, put the project on GitHub and import it on Vercel or Netlify; `vercel.json` and `netlify.toml` already describe the build. The build uses relative URLs, so `dist/` also works on any static host, including in a subfolder.

## Progress marker

The seek thumb is the space station by default. For other journey footage, set `marker` on the skin root (the `media-container` from `createWindowSeatMarkup()`) or on any ancestor such as `<video-player>`:

```html
<video-player marker="plane">…</video-player>
```

Values: `station` (default), `plane`, `ship`, `car`, `helicopter`, `train`, `dot`. Each is drawn on the station's 34 × 20 grid in the same two-tone style (body in the ink colour, detail in the accent), faces right, the direction the bar fills, and banks while dragging like the station. For your own glyph, use `marker="custom"` and point `--media-marker-image` at an SVG that faces right; it is drawn in the ink colour:

```css
video-player { --media-marker-image: url("./my-marker.svg"); }
```

The spec sheet (`/sheet.html`) shows every marker under "Progress markers".

## Where things live

When embedding the skin, call `createWindowSeatMarkup()` from `src/video/skin.ts` for each player to give its controls unique IDs. Both Vite builds use `flatten-scope.mjs` to lower the skin's CSS for the project's browser floor. Include that PostCSS transform when bundling the skin source in another project.

- `src/`: your skin, and only your skin. Keep, rewrite, or delete any of it.
  - `src/video/`: the skin component and its parts.
  - `src/styles/`: theme tokens and shared styles the skin imports, when it started from a packaged skin.
  - `src/skin.css`: global styles for the skin.
- `apps/preview/`: the workbench that previews the skin. You don't need to change it.
  - `src/shell/`: the Shadcn shell.
  - `src/frame/`: the page the shell frames. `player` mounts your skin in a player and sets the media it plays.
  - `public/`: files the preview serves, such as the chapters track.
- `vercel.json`, `netlify.toml`: how those hosts build the workbench.
- `skin.json`: what this skin is built from. Keep it; it records the Video.js version the skin was created with.

## Learn more

- [Build your own skin](https://videojs.org/docs/framework/html/guides/build-your-own-skin)
- [Customize skins](https://videojs.org/docs/framework/html/guides/customize-skins)
- [UI components](https://videojs.org/docs/framework/html/guides/ui-components)
