# Motion Studio

Motion graphics written as code. Each video is an HTML page that draws any frame on demand; `render.mjs` turns it into an MP4.

## Layout

```
brand.css        colors and fonts (CSS variables) shared by every video
fonts/           Space Grotesk + Inter (OFL), loaded by brand.css so renders work offline
lib/motion.js    helpers for render(t): tween, progress, clamp, easings
videos/*.html    one file per video
render.mjs       renderer (Playwright + ffmpeg)
out/             rendered MP4s (committed); out/stills/ is ignored by git
```

## Writing a video

A video HTML file sets three things:

```js
window.DURATION = 3;            // seconds
window.SIZE = [1920, 1080];     // width, height (even numbers)
window.render = (t) => { ... }; // draw the exact frame at time t (seconds)
```

`render(t)` must depend only on `t`: no CSS animations, transitions, timers or `requestAnimationFrame`. `brand.css` disables CSS animations, and the renderer seeds `Math.random`, so the same file always produces the same video. See `videos/hello.html`.

## Rendering

Needs Node 18+, ffmpeg, and Playwright with Chromium (`npm install playwright && npx playwright install chromium` if it isn't installed globally).

```bash
node render.mjs videos/hello.html              # -> out/hello.mp4 (30 fps, H.264)
node render.mjs videos/hello.html --stills 3   # -> out/stills/hello-0.50s.png, ...
node render.mjs videos/hello.html --fps 60     # other frame rates
```

Stills are taken at evenly spaced times across the video, for quick checks before a full render.
