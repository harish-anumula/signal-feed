// Renders the Chrome Web Store images (screenshots 1280×800, promo tiles 440×280 and 1400×560) and the README
// image from the screenshots the end-to-end test leaves in test/out. Run `npm run test:e2e` first.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME } from '../test/chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const img = (file) => `data:image/png;base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`;
const icon = img('extension/icons/icon-128.png');

const base = `
  * { box-sizing: border-box; margin: 0; }
  body { width: var(--w); height: var(--h); overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         color: #f4f2ff; background: radial-gradient(circle at 85% 10%, rgba(78,226,198,.18), transparent 40%), radial-gradient(circle at 10% 90%, rgba(155,124,255,.22), transparent 45%), #15131f; }
  .copy h1 { font-size: 44px; line-height: 1.08; letter-spacing: -0.03em; font-weight: 750; }
  .copy p { margin-top: 18px; font-size: 20px; line-height: 1.45; color: #b9b5cc; }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 34px; font-size: 20px; font-weight: 650; color: #fff; }
  .brand img { width: 40px; height: 40px; border-radius: 10px; }
  .window { border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 30px 80px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08); }
  .bar { height: 30px; background: #ecebf1; display: flex; align-items: center; gap: 7px; padding: 0 12px; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; background: #c9c7d3; display: block; }
  .shot { display: block; width: 100%; }
`;

const slide = (title, text, inner, { cols = '420px 1fr' } = {}) => `
  <style>${base} body { --w: 1280px; --h: 800px; display: grid; grid-template-columns: ${cols}; gap: 56px; align-items: center; padding: 0 64px; }</style>
  <div class="copy"><div class="brand"><img src="${icon}">Signal Feed</div><h1>${title}</h1><p>${text}</p></div>
  <div>${inner}</div>`;

const windowed = (src, { height, position = 'top', size = 'cover' }) => `
  <div class="window"><div class="bar"><i></i><i></i><i></i></div>
  <div style="height:${height}px;background:#fff url(${src}) ${position} / ${size} no-repeat"></div></div>`;

const pages = {
  'store/screenshot-1.png': [1280, 800, slide(
    'Noise folds away before you see it',
    'Ragebait, empty hype and engagement bait collapse to a slim bar. Useful posts stay, and the topics you care about get a teal edge.',
    windowed(img('test/out/x-feed.png'), { height: 600, position: 'center top' }))],
  'store/screenshot-2.png': [1280, 800, slide(
    'One key, three choices',
    'Paste an OpenRouter key once. Pick what to hide, what to highlight, and how strict to be. About 2 cents per 1,000 posts.',
    `<div style="display:flex;gap:28px;justify-content:center">
       <img src="${img('test/out/popup-light.png')}" style="width:340px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.45)">
       <img src="${img('test/out/popup-dark.png')}" style="width:340px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.08)">
     </div>`, { cols: '400px 1fr' })],
  'store/screenshot-3.png': [1280, 800, slide(
    'On X and YouTube',
    'Clickbait thumbnails on the home grid and in the sidebar fold too. Click Show to see anything that was hidden.',
    windowed(img('test/out/youtube.png'), { height: 560, position: 'left top', size: '100% auto' }))],
  'store/promo-small.png': [440, 280, `
    <style>${base} body { --w: 440px; --h: 280px; display: flex; flex-direction: column; justify-content: center; padding: 0 34px; }
      .brand { margin-bottom: 18px; font-size: 24px; } .brand img { width: 52px; height: 52px; border-radius: 13px; }
      h1 { font-size: 27px; line-height: 1.15; letter-spacing: -0.02em; }</style>
    <div class="brand"><img src="${icon}">Signal Feed</div><h1>Calmer X and YouTube.<br><span style="color:#9b8cff">Less bait, more signal.</span></h1>`],
  'store/promo-marquee.png': [1400, 560, `
    <style>${base} body { --w: 1400px; --h: 560px; display: grid; grid-template-columns: 520px 1fr; gap: 60px; align-items: center; padding: 0 80px; }</style>
    <div class="copy"><div class="brand"><img src="${icon}">Signal Feed</div><h1>Calmer X and YouTube</h1><p>Fold away ragebait and engagement bait before you scroll to it.</p></div>
    ${windowed(img('test/out/x-feed.png'), { height: 440, position: 'center top' })}`],
  'docs/screenshots/feed.png': [1280, 800, slide(
    'Noise folds away before you see it',
    'Ragebait, empty hype and engagement bait collapse to a slim bar. The topics you care about get a teal edge.',
    windowed(img('test/out/x-feed.png'), { height: 600, position: 'center top' }))]
};

const browser = await chromium.launch({ executablePath: CHROME });
for (const [out, [width, height, html]] of Object.entries(pages)) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
  await page.screenshot({ path: path.join(root, out) });
  await page.close();
  console.log(out);
}
await browser.close();
