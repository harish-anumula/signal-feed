// Service worker: owns the OpenRouter key, calls Jev, caches decisions for the browser session,
// shows the per-tab badge and handles the on/off shortcut. Pages never see the key.
importScripts("src/core.js");

const CACHE_LIMIT = 1500;
const TIMEOUT_MS = 15000;
const inflight = new Map();

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { settings } = await chrome.storage.local.get("settings");
  await chrome.storage.local.set({ settings: SignalFeed.mergeSettings(settings) });
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html?welcome") });
  refreshBadgeStyle();
});
chrome.runtime.onStartup.addListener(refreshBadgeStyle);

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle") return;
  const { settings } = await chrome.storage.local.get("settings");
  const next = SignalFeed.mergeSettings(settings);
  next.enabled = !next.enabled;
  await chrome.storage.local.set({ settings: next });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.settings || changes.apiKey)) refreshBadgeStyle();
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== "string") return false;
  if (message.type === "classify") {
    classify(Array.isArray(message.items) ? message.items : []).then(reply, (error) => reply({ ok: false, error: friendlyError(error) }));
    return true;
  }
  if (message.type === "counts" && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    const hidden = Number(message.hidden) || 0;
    const text = { nokey: "!", off: "off", error: "!" }[message.state] ?? (hidden ? String(Math.min(hidden, 999)) : "");
    const title = {
      nokey: "Signal Feed: add your OpenRouter key",
      off: "Signal Feed is off (Alt+Shift+S)",
      error: "Signal Feed: OpenRouter didn't answer, so the feed is unfiltered"
    }[message.state] ?? `Signal Feed: ${hidden} hidden, ${Number(message.highlighted) || 0} highlighted on this page`;
    chrome.action.setBadgeText({ tabId, text });
    chrome.action.setBadgeBackgroundColor({ tabId, color: message.state === "on" ? "#5b4bd6" : message.state === "off" ? "#8a8797" : "#d6455d" });
    chrome.action.setTitle({ tabId, title });
    return false;
  }
  if (message.type === "save-key") {
    saveKey(message.key).then(reply, (error) => reply({ ok: false, error: friendlyError(error) }));
    return true;
  }
  if (message.type === "status") {
    chrome.storage.session.get("lastError").then(({ lastError }) => reply({ ok: true, lastError: lastError || null }));
    return true;
  }
  return false;
});

async function classify(items) {
  items = items
    .filter((item) => item && typeof item.id === "string" && typeof item.content === "string" && typeof item.surface === "string")
    .slice(0, 20);
  if (!items.length) return { ok: true, decisions: [] };
  const { settings: saved, apiKey } = await chrome.storage.local.get(["settings", "apiKey"]);
  const settings = SignalFeed.mergeSettings(saved);
  if (!settings.enabled) return { ok: true, decisions: [] };
  if (!apiKey) return { ok: false, error: "Add your OpenRouter key in Signal Feed." };

  const { decisionCache: cache = {} } = await chrome.storage.session.get("decisionCache");
  const decisions = [];
  const missing = [];
  for (const item of items) {
    const key = SignalFeed.cacheKey(item, settings);
    if (cache[key]) {
      cache[key].usedAt = Date.now();
      decisions.push({ id: item.id, ...cache[key].p, state: SignalFeed.decide(item.surface, cache[key].p, settings) });
    } else {
      missing.push({ item, key });
    }
  }

  if (missing.length) {
    const fresh = await judge(missing.map((m) => m.item), settings, apiKey);
    fresh.forEach((p, i) => {
      const { item, key } = missing[i];
      cache[key] = { p, usedAt: Date.now() };
      decisions.push({ id: item.id, ...p, state: SignalFeed.decide(item.surface, p, settings) });
    });
    trimCache(cache);
    await chrome.storage.session.set({ decisionCache: cache, lastError: null });
  }
  return { ok: true, decisions };
}

// The same batch asked twice at once (two tabs, a quick re-scan) shares one request.
async function judge(items, settings, apiKey) {
  const id = items.map((item) => SignalFeed.cacheKey(item, settings)).join("|");
  if (inflight.has(id)) return inflight.get(id);
  const payload = SignalFeed.buildPayload(items, settings);
  const promise = (Object.keys(payload.questions).length
    ? request(payload, apiKey).then((response) => SignalFeed.parseResponse(items, payload, response))
    : Promise.resolve(items.map(() => ({})))
  ).catch(async (error) => {
    await chrome.storage.session.set({ lastError: { message: friendlyError(error), at: Date.now() } });
    throw error;
  });
  inflight.set(id, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(id);
  }
}

async function request(payload, apiKey) {
  for (let attempt = 0; ; attempt += 1) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(SignalFeed.API_ENDPOINT, {
        method: "POST",
        signal: abort.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/harish-anumula/signal-feed",
          "X-Title": "Signal Feed"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (attempt >= 2) throw error;
      await wait(500 * 2 ** attempt);
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) return response.json();
    const retryable = [408, 429, 500, 502, 503, 529].includes(response.status);
    if (!retryable || attempt >= 2) throw new HttpError(response.status, (await response.text()).slice(0, 200));
    const after = Number(response.headers.get("retry-after"));
    await wait(after > 0 && after < 30 ? after * 1000 : 500 * 2 ** attempt);
  }
}

// Checks the key with OpenRouter (free, no model call) before saving it.
async function saveKey(raw) {
  const key = SignalFeed.cleanKey(raw);
  if (!key) return { ok: false, error: "Paste your OpenRouter key." };
  const response = await fetch(SignalFeed.KEY_ENDPOINT, { headers: { Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new HttpError(response.status, "");
  await chrome.storage.local.set({ apiKey: key });
  await chrome.storage.session.set({ lastError: null });
  return { ok: true, hint: key.slice(-4) };
}

// The global badge only nags about a missing key; X and YouTube tabs set their own (count, "off" or "!").
async function refreshBadgeStyle() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  chrome.action.setBadgeBackgroundColor({ color: "#d6455d" });
  chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
  chrome.action.setBadgeText({ text: apiKey ? "" : "!" });
}

class HttpError extends Error {
  constructor(status, detail) {
    super(`OpenRouter returned ${status}${detail ? `: ${detail}` : ""}`);
    this.status = status;
  }
}

function friendlyError(error) {
  const status = error?.status;
  if (status === 401 || status === 403) return "OpenRouter rejected the key. Check it in Signal Feed.";
  if (status === 402) return "Your OpenRouter account is out of credits.";
  if (status === 429) return "OpenRouter is rate-limiting requests. Signal Feed will try again shortly.";
  if (error?.name === "AbortError") return "OpenRouter took too long to answer.";
  if (error instanceof TypeError) return "Could not reach OpenRouter. Check your connection.";
  return String(error?.message || error || "Something went wrong.").slice(0, 200);
}

function trimCache(cache) {
  const entries = Object.entries(cache);
  if (entries.length <= CACHE_LIMIT) return;
  entries.sort((a, b) => b[1].usedAt - a[1].usedAt);
  for (const [key] of entries.slice(CACHE_LIMIT)) delete cache[key];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
