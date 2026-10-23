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
  results.push(`     X: ${hiddenNoise}/8 noise hidden, ${hiddenUseful.length}/7 useful hidden (incl. a video post and an ad)`);
  assert.ok(hiddenNoise >= 7, `only ${hiddenNoise}/8 noise hidden`);
  assert.equal(hiddenUseful.length, 0, `useful hidden: ${hiddenUseful.map((s) => s.text).join(' | ')}`);
  const height = await x.$eval('article[data-sf="hidden"]', (el) => el.getBoundingClientRect().height);
  assert.ok(height <= 45, `folded post is ${height}px tall`);
});

await step('X: the toolbar badge counts the hidden posts', async () => {
  await x.waitForTimeout(400);
  const hidden = await x.locator('article[data-sf="hidden"]').count();
  assert.equal(await badge(setup, 'x.com'), String(hidden));
});

await step('X: hovering a hidden post (X re-renders it) keeps it hidden', async () => {
  const post = x.locator('article[data-sf="hidden"]').first();
  await post.hover();
  await post.locator('.sf-btn').hover();
  await x.waitForTimeout(150);
  assert.match(await post.getAttribute('class'), /r-hover/);
  assert.equal(await post.locator('[data-testid="tweetText"]').evaluate((el) => getComputedStyle(el).visibility), 'hidden');
  assert.ok((await post.boundingBox()).height <= 45, 'post grew back');
});

await step('X: each bar shows its reason, lined up with the post text', async () => {
  await x.waitForFunction(() => [...document.querySelectorAll('article[data-sf="hidden"] .sf-bar')].every((bar) => bar.querySelector('.sf-tag')), null, { timeout: 15000 });
  const tags = await x.$$eval('article[data-sf="hidden"] .sf-tag', (els) => els.map((e) => e.textContent));
  results.push(`     X reasons: ${tags.join(', ')}`);
  assert.ok(tags.includes('Engagement bait') && tags.includes('Ragebait'), 'expected reasons missing');
  const offset = await x.$eval('article[data-sf="hidden"]', (a) => Math.round(a.querySelector('.sf-label').getBoundingClientRect().left - a.querySelector('[data-testid="User-Name"]').getBoundingClientRect().left));
  assert.ok(Math.abs(offset) <= 1, `bar text is ${offset}px off the post text`);
});

await step('X: Show reveals the post (strip with the reason), Hide again folds it, nothing opens', async () => {
  const before = await x.locator('article[data-sf="hidden"]').count();
  const post = x.locator('article[data-sf="hidden"]').first();
  const id = await post.getAttribute('data-sf-id');
  await post.locator('.sf-btn').click();
  const shown = x.locator(`article[data-sf-id="${id}"]`);
  assert.equal(await shown.getAttribute('data-sf'), 'revealed');
  assert.equal(await x.locator('article[data-sf="hidden"]').count(), before - 1);
  assert.ok(await shown.locator('.sf-strip .sf-tag').count(), 'strip has no reason');
  const textTop = await shown.evaluate((a) => a.querySelector('[data-testid="tweetText"]').getBoundingClientRect().top - a.querySelector('.sf-strip').getBoundingClientRect().bottom);
  assert.ok(textTop > 0, 'strip covers the post');
  await shown.locator('.sf-link', { hasText: 'Hide again' }).click();
  assert.equal(await shown.getAttribute('data-sf'), 'hidden');
  assert.equal(await x.evaluate(() => window.__clicks), 0);
});

await step('X: Always show @handle opens every post by them and remembers it', async () => {
  const posts = x.locator('article[data-testid="tweet"]').filter({ has: x.locator('a[href="/replyguy"]') });
  assert.equal(await posts.count(), 2);
  await x.waitForFunction(() => [...document.querySelectorAll('article[data-testid="tweet"]')].filter((a) => a.querySelector('a[href="/replyguy"]')).every((a) => a.dataset.sf === 'hidden'));
  await posts.first().locator('.sf-btn').click();
  await posts.first().locator('.sf-link', { hasText: 'Always show @replyguy' }).click();
  await x.waitForFunction(() => [...document.querySelectorAll('article[data-testid="tweet"]')].filter((a) => a.querySelector('a[href="/replyguy"]')).every((a) => !a.dataset.sf));
  assert.deepEqual(await setup.evaluate(async () => (await chrome.storage.local.get('allow')).allow), { x: ['@replyguy'] });
  await setup.evaluate(() => chrome.storage.local.set({ allow: { x: [] } }));
  await x.waitForFunction(() => [...document.querySelectorAll('article[data-testid="tweet"]')].filter((a) => a.querySelector('a[href="/replyguy"]')).every((a) => a.dataset.sf === 'hidden'), null, { timeout: 15000 });
});

await step('X: Show all (from the popup) opens every hidden post on the page', async () => {
  await setup.evaluate(async () => { const t = (await chrome.tabs.query({})).find((t) => t.url?.includes('x.com')); await chrome.tabs.sendMessage(t.id, { type: 'show-all' }); });
  await x.waitForTimeout(200);
  assert.equal(await x.locator('article[data-sf="hidden"]').count(), 0);
  assert.ok(await x.locator('article[data-sf="revealed"]').count() >= 7);
});

await step('X: interests highlight the useful posts', async () => {
  await setSettings(setup, { interests: 'software engineering, databases, performance, machine learning' });
  await x.waitForTimeout(300);
  const states = await settled(x, 'article[data-testid="tweet"]');
  const lit = states.filter((s) => s.state === 'highlighted');
  results.push(`     X: highlighted ${lit.length}: ${lit.map((s) => s.kind).join(', ')}`);
  assert.ok(lit.length >= 3, `only ${lit.length} highlighted`);
  assert.ok(lit.every((s) => s.kind === 'useful'), 'noise was highlighted');
  // reasons survive the change of interests (cached by hide list), so every bar has its tag again
  await x.waitForFunction(() => [...document.querySelectorAll('article[data-sf="hidden"] .sf-bar')].every((bar) => bar.querySelector('.sf-tag')), null, { timeout: 5000 });
  await x.screenshot({ path: path.join(OUT, 'x-feed.png') });
});

await step('X: the post you opened is never folded, its replies are', async () => {
  const thread = await ctx.newPage();
  await thread.goto('https://x.com/replyguy/status/1');
  const states = await settled(thread, 'article[data-testid="tweet"]:not(:first-child)');
  assert.ok(states.some((s) => s.state === 'hidden'), 'no reply folded');
  assert.equal(await thread.locator('article[data-testid="tweet"]').first().getAttribute('data-sf'), null);
  await thread.close();
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
  await x.waitForFunction(() => !document.querySelector('.sf-bar, .sf-strip, [data-sf]'));
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

await step('popup activity shows today\'s checks, hides and spend', async () => {
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
  await popup.waitForFunction(() => /hidden of \d+ checked/.test(document.querySelector('#act-today').textContent) && !/ 0 checked/.test(document.querySelector('#act-today').textContent), null, { timeout: 5000 });
  const line = await popup.textContent('#act-today');
  results.push(`     popup: ${line.trim()} | ${(await popup.textContent('#act-total')).trim()}`);
  assert.match(line, /\$0\.0\d\d|<\$0\.001/);
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
