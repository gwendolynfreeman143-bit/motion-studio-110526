#!/usr/bin/env node
// Render a video HTML file to MP4 (or a few stills) with Playwright + ffmpeg.
//
//   node render.mjs videos/hello.html            -> out/hello.mp4
//   node render.mjs videos/hello.html --stills 3 -> out/stills/hello-*.png
//   options: --fps 30
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Use the project's Playwright if installed, otherwise the machine's global one.
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const roots = [process.env.PLAYWRIGHT_ROOT, '/opt/node-tools/node_modules'].filter(Boolean);
    for (const root of roots) {
      try { return createRequire(path.join(root, 'noop.js'))('playwright'); } catch {}
    }
    throw new Error('Playwright not found. Run: npm install playwright && npx playwright install chromium');
  }
}

function parseArgs(argv) {
  const opts = { fps: 30, stills: 0, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fps') opts.fps = Number(argv[++i]);
    else if (a === '--stills') opts.stills = Number(argv[++i]);
    else if (!opts.file) opts.file = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  if (!opts.file) throw new Error('Usage: node render.mjs videos/<name>.html [--stills N] [--fps 30]');
  if (!(opts.fps > 0)) throw new Error('--fps must be a positive number');
  if (!(Number.isInteger(opts.stills) && opts.stills >= 0)) throw new Error('--stills must be a whole number');
  return opts;
}

// Make Math.random repeatable so even "random" videos render identically every time.
const DETERMINISM = `
  (() => {
    let s = 0x2f6b9a1d;
    Math.random = () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let r = Math.imul(s ^ (s >>> 15), 1 | s);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  })();
`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const file = path.resolve(opts.file);
  const name = path.basename(file, path.extname(file));
  const outDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out');

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('[page error]', e.message));
    await page.addInitScript(DETERMINISM);
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });

    const meta = await page.evaluate(() => ({
      duration: window.DURATION,
      size: window.SIZE,
      hasRender: typeof window.render === 'function',
    }));
    if (!(meta.duration > 0)) throw new Error('window.DURATION must be a positive number of seconds');
    if (!Array.isArray(meta.size) || meta.size.length !== 2) throw new Error('window.SIZE must be [width, height]');
    if (!meta.hasRender) throw new Error('window.render(t) is not defined');
    const [width, height] = meta.size;
    if (width % 2 || height % 2) throw new Error('SIZE width and height must be even for H.264');

    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);

    const frameAt = async (t) => {
      await page.evaluate((t) => window.render(t), t);
      return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
    };

    if (opts.stills > 0) {
      const dir = path.join(outDir, 'stills');
      mkdirSync(dir, { recursive: true });
      for (let i = 0; i < opts.stills; i++) {
        const t = (meta.duration * (i + 0.5)) / opts.stills; // evenly spaced, centered in each slice
        const p = path.join(dir, `${name}-${t.toFixed(2)}s.png`);
        await page.evaluate((t) => window.render(t), t);
        await page.screenshot({ path: p, clip: { x: 0, y: 0, width, height } });
        console.log(`still t=${t.toFixed(2)}s -> ${path.relative(process.cwd(), p)}`);
      }
      return;
    }

    mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${name}.mp4`);
    const frames = Math.round(meta.duration * opts.fps);
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(opts.fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', outFile,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const ffDone = new Promise((res, rej) => {
      ff.on('error', rej);
      ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with code ${code}`))));
    });

    const started = Date.now();
    for (let i = 0; i < frames; i++) {
      const png = await frameAt(i / opts.fps);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
      if ((i + 1) % opts.fps === 0 || i === frames - 1) {
        process.stdout.write(`\rframe ${i + 1}/${frames}`);
      }
    }
    ff.stdin.end();
    await ffDone;
    console.log(`\n${path.relative(process.cwd(), outFile)}  (${frames} frames, ${width}x${height} @ ${opts.fps}fps, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
