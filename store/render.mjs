// Renders the Chrome Web Store images (screenshots 1280×800, promo tiles 440×280 and 1400×560) and the README
// image from the captures in store/raw: real X and YouTube feeds with names, avatars and thumbnails blurred
// (taken with the extension running), and the popup from store/popup-shots.mjs.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME } from '../test/chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const img = (file) => `data:image/png;base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`;
const icon = img('extension/icons/icon-128.png');
const raw = (name) => img(`store/raw/${name}.png`);

const base = `
  * { box-sizing: border-box; margin: 0; }
  body { width: var(--w); height: var(--h); overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #f4f2ff;
         background: radial-gradient(circle at 88% 8%, rgba(78,226,198,.16), transparent 42%), radial-gradient(circle at 8% 92%, rgba(155,124,255,.22), transparent 46%), #121019; }
  .copy h1 { font-size: 46px; line-height: 1.06; letter-spacing: -0.035em; font-weight: 760; }
  .copy p { margin-top: 18px; font-size: 19px; line-height: 1.5; color: #b6b2c8; }
  .copy ul { margin-top: 22px; padding: 0; list-style: none; display: grid; gap: 12px; }
  .copy li { font-size: 17px; color: #d9d6e6; display: flex; gap: 10px; align-items: baseline; }
  .copy li::before { content: ""; flex: none; width: 7px; height: 7px; border-radius: 50%; background: #8b7cf6; transform: translateY(-2px); }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 30px; font-size: 19px; font-weight: 650; color: #fff; }
  .brand img { width: 38px; height: 38px; border-radius: 10px; }
  .accent { color: #a99cff; }
  .window { border-radius: 14px; overflow: hidden; background: #000; box-shadow: 0 30px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.09); }
  .bar { height: 30px; background: #1c1b22; display: flex; align-items: center; gap: 7px; padding: 0 12px; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; background: #3a3843; display: block; }
  .bar span { margin-left: 10px; font-size: 12px; color: #8e8b9b; }
  .shot { display: block; width: 100%; }
`;

const slide = (title, text, inner, { cols = '430px 1fr', list } = {}) => `
  <style>${base} body { --w: 1280px; --h: 800px; display: grid; grid-template-columns: ${cols}; gap: 60px; align-items: center; padding: 0 64px; }</style>
  <div class="copy"><div class="brand"><img src="${icon}">Signal Feed</div><h1>${title}</h1>${text ? `<p>${text}</p>` : ''}${list ? `<ul>${list.map((l) => `<li>${l}</li>`).join('')}</ul>` : ''}</div>
  <div>${inner}</div>`;

const windowed = (src, { site, width = '100%', crop }) => `
  <div class="window" style="width:${width};margin-left:auto"><div class="bar"><i></i><i></i><i></i><span>${site}</span></div>
  ${crop ? `<div style="height:${crop}px;background:#000 url(${src}) top center / 100% auto no-repeat"></div>` : `<img class="shot" src="${src}">`}</div>`;

const popups = `<div style="display:flex;gap:26px;justify-content:center;align-items:flex-start">
  <img src="${raw('popup-light')}" style="width:330px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.5)">
  <img src="${raw('popup-dark')}" style="width:330px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.09);margin-top:40px">
</div>`;

const hero = (w) => windowed(raw('x-real'), { site: 'x.com', width: w });

const pages = {
  'store/screenshot-1.png': [1280, 800, slide(
    'Your feed,<br><span class="accent">minus the bait</span>',
    'Ragebait, empty hype and engagement bait fold into a slim bar that says why, before you scroll to them. Posts on topics you care about get a teal edge.',
    hero('640px'))],
  'store/screenshot-2.png': [1280, 800, `
    <style>${base} body { --w: 1280px; --h: 800px; padding: 56px 64px 0; display: flex; flex-direction: column; gap: 34px; }
      .top { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; } .top .brand { margin-bottom: 18px; }
      .top p { margin: 0; max-width: 470px; font-size: 18px; line-height: 1.5; color: #b6b2c8; }
      .yt { height: 560px; border-radius: 14px 14px 0 0; overflow: hidden; box-shadow: 0 30px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.09);
            background: #0f0f0f url(${raw("youtube-real")}) center top / auto 100% no-repeat; }</style>
    <div class="top"><div class="copy"><div class="brand"><img src="${icon}">Signal Feed</div><h1>Clickbait folds on <span class="accent">YouTube</span> too</h1></div>
    <p>On the home page and next to the video you are watching. Cards keep their place, so the grid never jumps.</p></div>
    <div class="yt"></div>`],
  'store/screenshot-3.png': [1280, 800, slide(
    'Every fold <span class="accent">says why</span>',
    null,
    windowed(raw('x-real-strip'), { site: 'x.com', width: '700px' }),
    { cols: '430px 1fr', list: ['Show any post with one click', 'Hide it again if you change your mind', 'Always show people and channels you trust', 'Show everything on a page from the toolbar'] })],
  'store/screenshot-4.png': [1280, 800, slide(
    'One key, <span class="accent">three choices</span>',
    'Paste an OpenRouter key once. Pick what to hide, what to highlight and how strict to be. About 2 cents per 1,000 posts, and the popup shows exactly what you spent.',
    popups, { cols: '440px 1fr' })],
  'store/promo-small.png': [440, 280, `
    <style>${base} body { --w: 440px; --h: 280px; display: flex; flex-direction: column; justify-content: center; padding: 0 34px; }
      .brand { margin-bottom: 18px; font-size: 24px; } .brand img { width: 52px; height: 52px; border-radius: 13px; }
      h1 { font-size: 28px; line-height: 1.15; letter-spacing: -0.025em; }</style>
    <div class="brand"><img src="${icon}">Signal Feed</div><h1>Your feed,<br><span class="accent">minus the bait.</span></h1>`],
  'store/promo-marquee.png': [1400, 560, `
    <style>${base} body { --w: 1400px; --h: 560px; display: grid; grid-template-columns: 560px 1fr; gap: 70px; align-items: center; padding: 0 80px; overflow: hidden; }
      .clip { height: 470px; overflow: hidden; border-radius: 14px; }</style>
    <div class="copy"><div class="brand"><img src="${icon}">Signal Feed</div><h1>Your feed, <span class="accent">minus the bait</span></h1><p>Ragebait, hype and engagement bait fold away on X and YouTube, each with the reason why.</p></div>
    <div class="clip">${hero('600px')}</div>`],
  'docs/screenshots/feed.png': [1280, 800, slide(
    'Your feed, <span class="accent">minus the bait</span>',
    'Ragebait, empty hype and engagement bait fold into a slim bar that says why. Posts on topics you care about get a teal edge.',
    hero('640px'))]
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
