// Renders the popup (light and dark) for the store images, with a sample week of activity at the per-post costs
// measured by eval/run.mjs, so the chart shows what it looks like after a few days. Not real usage data.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME } from '../test/chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(root, 'extension');
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'sf-shots-')), {
  executablePath: CHROME, headless: true, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto(`chrome-extension://${id}/popup/popup.html`);

// ~500 posts a day, about 30% hidden, $0.022 per 1,000 posts checked plus reasons
const days = {};
const counts = [380, 520, 460, 610, 300, 540, 470];
const today = new Date();
counts.forEach((checked, i) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (counts.length - 1 - i));
  const hidden = Math.round(checked * 0.3);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  days[day] = { cost: checked * 0.000022, checked, hidden, reasons: { lowEffort: Math.round(hidden * 0.36), ragebait: Math.round(hidden * 0.24), bait: Math.round(hidden * 0.2), hype: Math.round(hidden * 0.12), promo: Math.round(hidden * 0.08) } };
});
const total = Object.values(days).reduce((t, d) => ({ cost: t.cost + d.cost, checked: t.checked + d.checked, hidden: t.hidden + d.hidden }), { cost: 0, checked: 0, hidden: 0 });
await page.evaluate((s) => chrome.storage.local.set(s), {
  apiKey: 'sk-or-v1-sample-key-a1b2',
  settings: { enabled: true, sites: { x: true, youtube: true }, hide: ['ragebait', 'bait', 'hype', 'lowEffort', 'promo'], hideExtra: '', interests: 'AI research, RL, LLM engineering', strictness: 'balanced' },
  usage: { since: Object.keys(days)[0], days, total }
});

fs.mkdirSync(path.join(root, 'store/raw'), { recursive: true });
for (const scheme of ['light', 'dark']) {
  const p = await ctx.newPage();
  await p.emulateMedia({ colorScheme: scheme });
  await p.setViewportSize({ width: 360, height: 700 });
  await p.goto(`chrome-extension://${id}/popup/popup.html`);
  await p.waitForSelector('#main:not([hidden])');
  await p.waitForTimeout(300);
  await p.locator('body').screenshot({ path: path.join(root, `store/raw/popup-${scheme}.png`) });
  await p.close();
}
await ctx.close();
console.log('popup shots in store/raw/');
