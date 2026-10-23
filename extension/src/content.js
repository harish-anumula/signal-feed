// Content script on X and YouTube: finds feed items, asks the service worker for decisions in batches before
// they scroll into view, then folds or highlights them. Fails open: if anything goes wrong the feed is untouched.
// All hooks are data-sf-* attributes and our own child elements: X (React) rewrites a post's class on re-render.
(function signalFeedContent() {
  "use strict";

  const BATCH_SIZE = 20;
  const BATCH_DELAY_MS = 140;
  const PREFETCH_PX = 1600;
  const RETRY_MS = [20000, 60000, 300000];
  const SELECTORS = {
    xPosts: 'article[data-testid="tweet"]',
    youtubeHome: "ytd-rich-item-renderer, ytd-grid-video-renderer",
    youtubeSidebar: "#related ytd-compact-video-renderer, #related ytd-compact-playlist-renderer, #related yt-lockup-view-model"
  };
  const YT_TITLE = [
    "#video-title",
    "a#video-title-link",
    ".yt-lockup-metadata-view-model__title",
    ".yt-lockup-metadata-view-model-wiz__title",
    "a.ytLockupMetadataViewModelTitle",
    "h3 a[href*='/watch']",
    "h3[title]"
  ].join(", ");

  const site = location.hostname === "x.com" ? "x" : "youtube";
  const records = new Map();
  const queue = new Map();
  let settings = SignalFeed.mergeSettings();
  let allow = new Set();
  let hasKey = false;
  let failing = false;
  let failures = 0;
  let nextId = 0;
  let flushTimer = null;
  let scanTimer = null;
  let countTimer = null;
  let retryTimer = null;
  let observer = null;
  let mutations = null;
  let dead = false;

  boot();

  async function boot() {
    const stored = await chrome.storage.local.get(["settings", "apiKey", "allow"]).catch(() => null);
    if (!stored) return;
    settings = SignalFeed.mergeSettings(stored.settings);
    allow = allowSet(stored.allow);
    hasKey = Boolean(stored.apiKey);
    if (!document.body) await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    observer = new IntersectionObserver(onIntersect, { rootMargin: `${PREFETCH_PX}px 0px` });
    mutations = new MutationObserver(scheduleScan);
    mutations.observe(document.documentElement, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener(onStorageChange);
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === "show-all") showAll();
    });
    scan();
  }

  function onStorageChange(changes, area) {
    if (area !== "local") return;
    if (changes.allow) {
      allow = allowSet(changes.allow.newValue);
      applyAllowList();
    }
    if (!(changes.settings || changes.apiKey)) return;
    if (changes.settings) settings = SignalFeed.mergeSettings(changes.settings.newValue);
    if (changes.apiKey) hasKey = Boolean(changes.apiKey.newValue);
    failing = false;
    failures = 0;
    resetAll();
    scan();
  }

  function allowSet(value) {
    return new Set(Array.isArray(value?.[site]) ? value[site] : []);
  }

  function active() {
    return settings.enabled && hasKey && settings.sites[site];
  }

  // When the extension is updated or reloaded, this copy of the script is cut off from it ("Extension context
  // invalidated"). Stop quietly and leave the page as it was; the next page load runs the new version.
  function alive() {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  }

  function shutdown() {
    if (dead) return;
    dead = true;
    mutations?.disconnect();
    observer?.disconnect();
    clearTimeout(scanTimer);
    clearTimeout(countTimer);
    resetAll();
  }

  // chrome.runtime.sendMessage, resolving to null instead of throwing when the extension is gone or busy.
  function send(message) {
    if (dead || !alive()) {
      shutdown();
      return Promise.resolve(null);
    }
    try {
      return chrome.runtime.sendMessage(message).catch(() => {
        if (!alive()) shutdown();
        return null;
      });
    } catch {
      shutdown();
      return Promise.resolve(null);
    }
  }

  function scheduleScan() {
    if (dead) return;
    if (!alive()) return shutdown();
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 80);
  }

  function scan() {
    // X and YouTube unmount cards as you scroll; drop records whose card is gone (the cache keeps the answers).
    for (const record of records.values()) {
      if (!record.element.isConnected) {
        records.delete(record.id);
        queue.delete(record.id);
        observer.unobserve(record.element);
      }
    }
    if (active()) {
      const surfaces = site === "x" ? ["xPosts"] : ["youtubeHome", "youtubeSidebar"];
      for (const surface of surfaces) {
        document.querySelectorAll(SELECTORS[surface]).forEach((element) => {
          if (surface === "youtubeHome" && element.closest("#related")) return;
          if (surface === "xPosts" && (element.parentElement?.closest(SELECTORS.xPosts) || isOpenedPost(element))) return;
          const content = surface === "xPosts" ? xText(element) : youtubeText(element);
          if (content) register(element, surface, content);
        });
      }
    }
    scheduleCounts();
  }

  function register(element, surface, content) {
    const hash = SignalFeed.fnv1a(content);
    if (element.dataset.sfId && element.dataset.sfHash === hash) return;
    if (element.dataset.sfId) forget(element);
    const id = `i${(nextId += 1).toString(36)}`;
    element.dataset.sfId = id;
    element.dataset.sfHash = hash;
    element.dataset.sfSurface = surface;
    const author = surface === "xPosts" ? xAuthor(element) : youtubeAuthor(element);
    const record = { id, element, surface, content, hash, author, state: "waiting", reason: null };
    records.set(id, record);
    if (author && allow.has(author.key)) {
      record.state = "allowed";
      return;
    }
    observer.observe(element);
  }

  function onIntersect(entries) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const record = records.get(entry.target.dataset.sfId);
      if (record) enqueue(record);
    }
  }

  function enqueue(record) {
    if (!active() || failing || record.state !== "waiting") return;
    record.state = "queued";
    record.element.dataset.sf = "pending";
    queue.set(record.id, record);
    if (queue.size >= BATCH_SIZE) flush();
    else if (!flushTimer) flushTimer = setTimeout(flush, BATCH_DELAY_MS);
  }

  async function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    const batch = [...queue.values()].slice(0, BATCH_SIZE);
    batch.forEach((record) => queue.delete(record.id));
    if (queue.size) flushTimer = setTimeout(flush, 40);
    if (!batch.length) return;
    try {
      const response = await send({ type: "classify", items: batch.map(payloadItem) });
      if (dead) return;
      if (!response?.ok) throw new Error(response?.error || "No answer");
      failures = 0;
      const byId = new Map(response.decisions.map((d) => [d.id, d]));
      const needReasons = [];
      for (const record of batch) {
        const decision = byId.get(record.id);
        if (!current(record)) continue;
        if (!decision) {
          release(record);
          continue;
        }
        record.reason = decision.reason || null;
        apply(record, decision.state);
        if (decision.state === "hidden" && !record.reason) needReasons.push(record);
      }
      if (needReasons.length) loadReasons(needReasons);
    } catch {
      // Leave the feed as it is and try again later, slower each time.
      failing = true;
      batch.forEach((record) => current(record) && release(record));
      clearTimeout(retryTimer);
      retryTimer = setTimeout(retry, RETRY_MS[Math.min(failures, RETRY_MS.length - 1)]);
      failures += 1;
    }
    scheduleCounts();
  }

  // Reasons come from a second, smaller question asked only for hidden posts; the bar shows it when it lands.
  async function loadReasons(list) {
    try {
      const response = await send({ type: "reasons", items: list.map(payloadItem) });
      if (!response?.ok) return;
      for (const record of list) {
        const reason = response.reasons[record.id];
        if (!reason || !current(record)) continue;
        record.reason = reason;
        record.element.querySelectorAll(":scope > .sf-bar, :scope > .sf-strip").forEach((node) => setTag(node, reason));
      }
    } catch {
      // The bar just keeps its generic label.
    }
  }

  function payloadItem({ id, surface, content }) {
    return { id, surface, content };
  }

  function retry() {
    failing = false;
    for (const record of records.values()) {
      if (record.state === "waiting" && current(record) && nearViewport(record.element)) enqueue(record);
    }
  }

  function nearViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.bottom >= -PREFETCH_PX && rect.top <= innerHeight + PREFETCH_PX;
  }

  function apply(record, state) {
    clearDecorations(record.element);
    record.state = state;
    record.element.dataset.sf = state;
    if (state === "hidden") fold(record);
  }

  // ---- The folded bar and the "shown" strip ----

  function fold(record) {
    clearDecorations(record.element);
    record.state = "hidden";
    record.element.dataset.sf = "hidden";
    alignToContent(record);
    const bar = el("div", "sf-bar");
    const label = el("span", "sf-label");
    label.append(el("span", "sf-label-text", "Hidden"));
    bar.append(label, button("Show", "sf-btn", () => reveal(record)));
    setTag(bar, record.reason);
    record.element.appendChild(guard(bar));
    scheduleCounts();
  }

  function reveal(record) {
    clearDecorations(record.element);
    record.state = "revealed";
    record.element.dataset.sf = "revealed";
    const strip = el("div", "sf-strip");
    const label = el("span", "sf-label");
    label.append(el("span", "sf-label-text", "Shown"));
    const actions = el("span", "sf-actions");
    if (record.author) actions.append(button(`Always show ${record.author.label}`, "sf-link", () => alwaysShow(record.author)));
    actions.append(button("Hide again", "sf-link", () => fold(record)));
    strip.append(label, actions);
    setTag(strip, record.reason);
    record.element.appendChild(guard(strip));
    scheduleCounts();
  }

  function setTag(node, reason) {
    const label = node.querySelector(".sf-label");
    const text = node.querySelector(".sf-label-text");
    label.querySelector(".sf-tag")?.remove();
    const name = SignalFeed.reasonLabel(reason);
    if (name) {
      label.append(el("span", "sf-tag", name));
    } else if (node.classList.contains("sf-bar")) {
      text.textContent = "Hidden by Signal Feed";
      return;
    }
    if (node.classList.contains("sf-bar")) text.textContent = "Hidden";
  }

  // Lines the bar's text up with the post's text column (after the avatar on X).
  function alignToContent(record) {
    if (record.surface !== "xPosts") return;
    const box = record.element.getBoundingClientRect();
    const text = record.element.querySelector('[data-testid="User-Name"], [data-testid="tweetText"]')?.getBoundingClientRect();
    const indent = text && box.width ? Math.round(text.left - box.left) : 0;
    if (indent > 0 && indent < 120) record.element.style.setProperty("--sf-indent", `${indent}px`);
  }

  async function alwaysShow(author) {
    if (!alive()) return shutdown();
    const { allow: saved = {} } = await chrome.storage.local.get("allow");
    const list = Array.isArray(saved[site]) ? saved[site] : [];
    if (!list.includes(author.key)) await chrome.storage.local.set({ allow: { ...saved, [site]: [...list, author.key] } });
  }

  // Newly allowed authors open up at once (and are never sent again); removed ones are judged afresh.
  function applyAllowList() {
    for (const record of [...records.values()]) {
      const allowed = record.author && allow.has(record.author.key);
      if (allowed && record.state !== "allowed") {
        queue.delete(record.id);
        clearDecorations(record.element);
        delete record.element.dataset.sf;
        record.state = "allowed";
      } else if (!allowed && record.state === "allowed") {
        forget(record.element);
      }
    }
    scan();
  }

  function showAll() {
    for (const record of records.values()) if (record.state === "hidden" && current(record)) reveal(record);
  }

  // X and YouTube open the post on any click inside the card; keep clicks on our controls to ourselves.
  function guard(node) {
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      node.addEventListener(type, (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (type !== "click") return;
        event.preventDefault();
        event.target.closest("button")?.sfAction?.();
      }, true);
    }
    return node;
  }

  function button(text, className, action) {
    const b = el("button", className, text);
    b.type = "button";
    b.sfAction = action;
    return b;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function release(record) {
    clearDecorations(record.element);
    record.state = "waiting";
    delete record.element.dataset.sf;
  }

  function current(record) {
    return record.element.isConnected && record.element.dataset.sfHash === record.hash;
  }

  function clearDecorations(element) {
    element.querySelectorAll(":scope > .sf-bar, :scope > .sf-strip").forEach((node) => node.remove());
  }

  function forget(element) {
    const id = element.dataset.sfId;
    queue.delete(id);
    records.delete(id);
    observer?.unobserve(element);
    clearDecorations(element);
    element.style.removeProperty("--sf-indent");
    for (const key of ["sfId", "sfHash", "sfSurface", "sf"]) delete element.dataset[key];
  }

  function resetAll() {
    clearTimeout(flushTimer);
    clearTimeout(retryTimer);
    flushTimer = null;
    queue.clear();
    for (const record of [...records.values()]) forget(record.element);
    records.clear();
  }

  function scheduleCounts() {
    if (dead) return;
    clearTimeout(countTimer);
    countTimer = setTimeout(sendCounts, 250);
  }

  function sendCounts() {
    let hidden = 0;
    let highlighted = 0;
    for (const record of records.values()) {
      if (!record.element.isConnected) continue;
      if (record.state === "hidden") hidden += 1;
      else if (record.state === "highlighted") highlighted += 1;
    }
    const state = !hasKey ? "nokey" : !settings.enabled || !settings.sites[site] ? "off" : failing ? "error" : "on";
    send({ type: "counts", hidden, highlighted, state });
  }

  // ---- Reading the page ----

  // On x.com/<user>/status/<id>, the post you opened is never folded (its replies still are).
  function isOpenedPost(article) {
    const id = location.pathname.match(/\/status\/(\d+)/)?.[1];
    if (!id) return false;
    return [...article.querySelectorAll(`a[href*="/status/${id}"] time`)].some((time) => time.closest("article") === article);
  }

  function xText(article) {
    const text = [...article.querySelectorAll('[data-testid="tweetText"]')]
      .map((node) => node.innerText || node.textContent)
      .filter(Boolean)
      .join("\nQuoted:\n");
    if (!text.trim()) return "";
    // Ads carry a small "Ad" (older: "Promoted") label outside the text and the name row. Not placementTracking:
    // X puts that on every video player.
    const label = [...article.querySelectorAll("span")].some((span) =>
      /^(Ad|Promoted)$/.test(span.textContent.trim()) && !span.closest('[data-testid="tweetText"], [data-testid="User-Name"]'));
    const promoted = label || article.querySelector('[data-testid="promotedIndicator"]') ? "Promoted post. " : "";
    return SignalFeed.cleanText(promoted + text);
  }

  // The author is read only to match the "Always show" list; it is never sent anywhere.
  function xAuthor(article) {
    const href = article.querySelector('[data-testid="User-Name"] a[href^="/"]')?.getAttribute("href") || "";
    const handle = href.match(/^\/([A-Za-z0-9_]{1,15})$/)?.[1];
    return handle ? { key: `@${handle.toLowerCase()}`, label: `@${handle}` } : null;
  }

  function youtubeText(card) {
    const node = card.querySelector(YT_TITLE);
    const title = node?.getAttribute("title") || node?.textContent || "";
    if (!title.trim()) return "";
    const badges = [...card.querySelectorAll("ytd-badge-supported-renderer, .badge-style-type-live-now-alternate")]
      .map((badge) => badge.textContent.trim())
      .filter(Boolean)
      .join(" ");
    return SignalFeed.cleanText(`Title: ${title}${badges ? `\nBadges: ${badges}` : ""}`);
  }

  function youtubeAuthor(card) {
    const link = card.querySelector('a[href^="/@"], a[href^="/channel/"]');
    const path = link?.getAttribute("href")?.split(/[/?]/).filter(Boolean)[0] === "channel"
      ? link.getAttribute("href").split("?")[0]
      : link?.getAttribute("href")?.match(/^\/(@[^/?]+)/)?.[1];
    if (!path) return null;
    const name = path.startsWith("@") ? decodeURIComponent(path) : (link.textContent.trim() || "this channel");
    return { key: path.toLowerCase(), label: name.length > 24 ? "this channel" : name };
  }
})();
