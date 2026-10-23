// Renders extension/icons/icon-{16,32,48,128}.png from assets/logo.svg.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { BROWSER } from '../test/env.mjs';
const svg = fs.readFileSync('assets/logo.svg', 'utf8');
const browser = await chromium.launch(BROWSER);
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="512" height="512"/, `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: `extension/icons/icon-${size}.png`, omitBackground: true });
}
await browser.close();
console.log('icons rendered');
