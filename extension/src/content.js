// Content script on X and YouTube: finds feed items, asks the service worker for decisions in batches before
// they scroll into view, then folds or highlights them. Fails open: if anything goes wrong the feed is untouched.
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
  let hasKey = false;
  let failing = false;
  let failures = 0;
  let nextId = 0;
  let flushTimer = null;
  let scanTimer = null;
  let countTimer = null;
  let retryTimer = null;
  let observer = null;

  boot();

  async function boot() {
    const stored = await chrome.storage.local.get(["settings", "apiKey"]);
    settings = SignalFeed.mergeSettings(stored.settings);
    hasKey = Boolean(stored.apiKey);
    if (!document.body) await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    observer = new IntersectionObserver(onIntersect, { rootMargin: `${PREFETCH_PX}px 0px` });
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !(changes.settings || changes.apiKey)) return;
      if (changes.settings) settings = SignalFeed.mergeSettings(changes.settings.newValue);
      if (changes.apiKey) hasKey = Boolean(changes.apiKey.newValue);
      failing = false;
      failures = 0;
      resetAll();
      scan();
    });
    scan();
  }

  function active() {
    return settings.enabled && hasKey && settings.sites[site];
  }

  function scheduleScan() {
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
    element.classList.add("sf-card");
    records.set(id, { id, element, surface, content, hash, state: "waiting" });
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
      const response = await chrome.runtime.sendMessage({
        type: "classify",
        items: batch.map(({ id, surface, content }) => ({ id, surface, content }))
      });
      if (!response?.ok) throw new Error(response?.error || "No answer");
      failures = 0;
      const byId = new Map(response.decisions.map((d) => [d.id, d]));
      for (const record of batch) {
        const decision = byId.get(record.id);
        if (!current(record)) continue;
        if (decision) apply(record, decision);
        else release(record, "waiting");
      }
    } catch {
      // Leave the feed as it is and try again later, slower each time.
      failing = true;
      batch.forEach((record) => current(record) && release(record, "waiting"));
      clearTimeout(retryTimer);
      retryTimer = setTimeout(retry, RETRY_MS[Math.min(failures, RETRY_MS.length - 1)]);
      failures += 1;
    }
    scheduleCounts();
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

  function apply(record, decision) {
    clearDecorations(record.element);
    record.state = decision.state;
    record.element.dataset.sf = decision.state;
    if (decision.state === "hidden") fold(record);
  }

  function fold(record) {
    const bar = document.createElement("div");
    bar.className = "sf-bar";
    const label = document.createElement("span");
    label.className = "sf-bar-label";
    label.textContent = "Hidden by Signal Feed";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sf-bar-show";
    button.textContent = "Show";
    bar.append(label, button);
    // X and YouTube open the post on any click inside the card; keep clicks on the bar to ourselves.
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      bar.addEventListener(type, (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (type === "click") {
          event.preventDefault();
          if (event.target === button) reveal(record);
        }
      }, true);
    }
    record.element.appendChild(bar);
  }

  function reveal(record) {
    clearDecorations(record.element);
    record.state = "revealed";
    record.element.dataset.sf = "revealed";
    scheduleCounts();
  }

  function release(record, state) {
    clearDecorations(record.element);
    record.state = state;
    delete record.element.dataset.sf;
  }

  function current(record) {
    return record.element.isConnected && record.element.dataset.sfHash === record.hash;
  }

  function clearDecorations(element) {
    element.querySelectorAll(":scope > .sf-bar").forEach((node) => node.remove());
  }

  function forget(element) {
    const id = element.dataset.sfId;
    queue.delete(id);
    records.delete(id);
    observer?.unobserve(element);
    clearDecorations(element);
    element.classList.remove("sf-card");
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
    chrome.runtime.sendMessage({ type: "counts", hidden, highlighted, state }).catch(() => {});
  }

  function xText(article) {
    const text = [...article.querySelectorAll('[data-testid="tweetText"]')]
      .map((node) => node.innerText)
      .filter(Boolean)
      .join("\nQuoted:\n");
    if (!text.trim()) return "";
    const promoted = article.querySelector('[data-testid="promotedIndicator"], [data-testid="placementTracking"]') ? "Promoted post. " : "";
    return SignalFeed.cleanText(promoted + text);
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
})();
