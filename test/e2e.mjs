// End to end in Chrome for Testing with the real extension and live Jev calls through OpenRouter.
// x.com and www.youtube.com are served from test/pages, so the shipped manifest is tested as it is.
// Key: OPENROUTER_KEY, or the file at ~/.inpage/openrouter_key (or SIGNAL_FEED_KEY_FILE).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME } from './chrome.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(root, 'extension');
const OUT = path.join(root, 'test/out');
fs.mkdirSync(OUT, { recursive: true });
const key = process.env.OPENROUTER_KEY || fs.readFileSync(process.env.SIGNAL_FEED_KEY_FILE || path.join(os.homedir(), '.inpage/openrouter_key'), 'utf8').trim();
const page = (name) => fs.readFileSync(path.join(root, 'test/pages', name), 'utf8');

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'signal-feed-')), {
  executablePath: CHROME,
  headless: true,
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
await ctx.route('https://x.com/**', (route) => route.fulfill({ contentType: 'text/html', body: page('x.html') }));
await ctx.route('https://www.youtube.com/**', (route) => route.fulfill({ contentType: 'text/html', body: page('youtube.html') }));

const results = [];
const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    results.push(`ok   ${name} (${Date.now() - t} ms)`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
  }
};

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;

// The states of every card on a page, once each has been decided (or the timeout passes).
async function settled(tab, selector, timeout = 45000) {
  await tab.waitForFunction((sel) => [...document.querySelectorAll(sel)].every((el) => ['hidden', 'normal', 'highlighted', 'revealed'].includes(el.dataset.sf)), selector, { timeout, polling: 100 });
  return tab.$$eval(selector, (els) => els.map((el) => ({ kind: el.dataset.kind, state: el.dataset.sf, text: el.innerText.slice(0, 60) })));
}
const badge = (setup, urlPart) => setup.evaluate(async (u) => {
  const tab = (await chrome.tabs.query({})).find((t) => t.url?.includes(u));
  return chrome.action.getBadgeText({ tabId: tab.id });
}, urlPart);
const setSettings = (setup, patch) => setup.evaluate(async (p) => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settings, ...p } });
}, patch);

let welcome;
await step('install opens the welcome tab with the key form', async () => {
  const deadline = Date.now() + 5000;
  while (!(welcome = ctx.pages().find((p) => p.url().includes('popup.html?welcome'))) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  assert.ok(welcome, 'no welcome tab');
  await welcome.waitForSelector('#connect:not([hidden])');
  assert.equal(await welcome.isVisible('#main'), false);
});

await step('a wrong key is refused with a clear message', async () => {
  await welcome.fill('#key', 'sk-or-v1-not-a-real-key');
  await welcome.click('#key-save');
  await welcome.waitForSelector('#key-error:not([hidden])');
  assert.match(await welcome.textContent('#key-error'), /rejected/);
});

await step('the real key connects and the settings appear', async () => {
  await welcome.fill('#key', `OPENROUTER_API_KEY="${key}"`);
  await welcome.click('#key-save');
  await welcome.waitForSelector('#main:not([hidden])', { timeout: 15000 });
  assert.match(await welcome.textContent('#key-hint'), new RegExp(`••••${key.slice(-4)}$`));
  assert.equal(await welcome.locator('.chip.on').count(), 5);
  await welcome.screenshot({ path: path.join(OUT, 'welcome.png'), fullPage: true });
});
const setup = welcome;

let x;
await step('X: noise folds, useful posts stay', async () => {
  x = await ctx.newPage();
  await x.goto('https://x.com/home');
  const states = await settled(x, 'article[data-testid="tweet"]');
  const hiddenNoise = states.filter((s) => s.kind === 'noise' && s.state === 'hidden').length;
  const hiddenUseful = states.filter((s) => s.kind === 'useful' && s.state === 'hidden');
  results.push(`     X: ${hiddenNoise}/6 noise hidden, ${hiddenUseful.length}/6 useful hidden`);
  assert.ok(hiddenNoise >= 5, `only ${hiddenNoise}/6 noise hidden`);
  assert.equal(hiddenUseful.length, 0, `useful hidden: ${hiddenUseful.map((s) => s.text).join(' | ')}`);
  const height = await x.$eval('article[data-sf="hidden"]', (el) => el.getBoundingClientRect().height);
  assert.ok(height <= 45, `folded post is ${height}px tall`);
});

await step('X: the toolbar badge counts the hidden posts', async () => {
  await x.waitForTimeout(400);
  const hidden = await x.locator('article[data-sf="hidden"]').count();
  assert.equal(await badge(setup, 'x.com'), String(hidden));
});

await step('X: Show reveals the post without opening it', async () => {
  const before = await x.locator('article[data-sf="hidden"]').count();
  await x.locator('article[data-sf="hidden"] .sf-bar-show').first().click();
  assert.equal(await x.locator('article[data-sf="hidden"]').count(), before - 1);
  assert.equal(await x.locator('article[data-sf="revealed"]').count(), 1);
  assert.equal(await x.evaluate(() => window.__clicks), 0);
});

await step('X: interests highlight the useful posts', async () => {
  await setSettings(setup, { interests: 'software engineering, databases, performance, machine learning' });
  await x.waitForTimeout(300);
  const states = await settled(x, 'article[data-testid="tweet"]');
  const lit = states.filter((s) => s.state === 'highlighted');
  results.push(`     X: highlighted ${lit.length}: ${lit.map((s) => s.kind).join(', ')}`);
  assert.ok(lit.length >= 3, `only ${lit.length} highlighted`);
  assert.ok(lit.every((s) => s.kind === 'useful'), 'noise was highlighted');
  await x.screenshot({ path: path.join(OUT, 'x-feed.png') });
});

await step('YouTube: home and sidebar fold the clickbait', async () => {
  const yt = await ctx.newPage();
  await yt.goto('https://www.youtube.com/');
  await setSettings(setup, { interests: '' });
  await yt.waitForTimeout(300);
  const states = await settled(yt, 'ytd-rich-item-renderer, #related ytd-compact-video-renderer');
  const wrong = states.filter((s) => (s.kind === 'noise') !== (s.state === 'hidden'));
  results.push(`     YouTube: ${states.filter((s) => s.state === 'hidden').length} hidden; wrong: ${wrong.map((s) => `${s.kind}:${s.text}`).join(' | ') || 'none'}`);
  assert.ok(wrong.length <= 1, `${wrong.length} wrong`);
  await yt.screenshot({ path: path.join(OUT, 'youtube.png') });
  await yt.close();
});

await step('turning it off restores the feed and marks the badge', async () => {
  await setSettings(setup, { enabled: false });
  await x.waitForFunction(() => !document.querySelector('.sf-card, .sf-bar'));
  await x.waitForTimeout(400);
  assert.equal(await badge(setup, 'x.com'), 'off');
  await setSettings(setup, { enabled: true });
  await settled(x, 'article[data-testid="tweet"]');
});

await step('a dead key fails open: the feed stays, the badge warns', async () => {
  await setup.evaluate(() => chrome.storage.local.set({ apiKey: 'sk-or-v1-dead' }));
  await setSettings(setup, { hideExtra: 'force a fresh request' });
  const deadline = Date.now() + 30000;
  while ((await badge(setup, 'x.com')) !== '!' && Date.now() < deadline) await x.waitForTimeout(200);
  assert.equal(await badge(setup, 'x.com'), '!');
  assert.equal(await x.locator('article[data-sf="hidden"], article[data-sf="pending"]').count(), 0);
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popup.waitForSelector('#alert:not([hidden])');
  assert.match(await popup.textContent('#alert'), /rejected the key/);
  await popup.close();
});

await step('popup renders cleanly in light and dark', async () => {
  await setup.evaluate((k) => chrome.storage.local.set({ apiKey: k, settings: { enabled: true, sites: { x: true, youtube: true }, hide: ['ragebait', 'bait', 'hype', 'lowEffort', 'promo'], hideExtra: '', interests: 'AI research, systems', strictness: 'balanced' } }), key);
  await setup.evaluate(() => chrome.storage.session.set({ lastError: null }));
  for (const scheme of ['light', 'dark']) {
    const popup = await ctx.newPage();
    await popup.emulateMedia({ colorScheme: scheme });
    await popup.setViewportSize({ width: 360, height: 600 });
    await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
    await popup.waitForSelector('#main:not([hidden])');
    const overflow = await popup.evaluate(() => document.documentElement.scrollWidth > 360);
    assert.equal(overflow, false, 'popup scrolls sideways');
    await popup.locator('body').screenshot({ path: path.join(OUT, `popup-${scheme}.png`) });
    await popup.close();
  }
});

await ctx.close();
console.log(results.join('\n'));
