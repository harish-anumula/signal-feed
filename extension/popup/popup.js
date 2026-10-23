// Popup (and the welcome tab opened on install): connect the key, then edit settings. Every change saves at once;
// open X and YouTube tabs pick it up through chrome.storage.
(function signalFeedPopup() {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const welcome = new URLSearchParams(location.search).has("welcome");
  let settings = SignalFeed.mergeSettings();
  let textTimer = null;

  init();

  async function init() {
    document.body.classList.toggle("is-welcome", welcome);
    $(".welcome").hidden = !welcome;
    const stored = await chrome.storage.local.get(["settings", "apiKey", "allow", "usage"]);
    settings = SignalFeed.mergeSettings(stored.settings);
    buildChips();
    render();
    renderAllow(stored.allow);
    renderActivity(stored.usage);
    showKeyState(stored.apiKey);
    wire();
    refreshStatus();
  }

  function buildChips() {
    const box = $("#chips");
    for (const preset of SignalFeed.HIDE_PRESETS) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.id = preset.id;
      chip.textContent = preset.label;
      chip.title = `Hide ${preset.text}`;
      chip.addEventListener("click", () => {
        const on = !settings.hide.includes(preset.id);
        settings.hide = on ? [...settings.hide, preset.id] : settings.hide.filter((id) => id !== preset.id);
        save();
      });
      box.appendChild(chip);
    }
  }

  function render() {
    $("#enabled").checked = settings.enabled;
    document.querySelectorAll(".chip").forEach((chip) => {
      const on = settings.hide.includes(chip.dataset.id);
      chip.classList.toggle("on", on);
      chip.setAttribute("aria-pressed", String(on));
    });
    if (document.activeElement !== $("#hide-extra")) $("#hide-extra").value = settings.hideExtra;
    if (document.activeElement !== $("#interests")) $("#interests").value = settings.interests;
    document.querySelectorAll("#strictness button").forEach((button) => {
      button.setAttribute("aria-checked", String(button.dataset.value === settings.strictness));
    });
    $("#site-x").checked = settings.sites.x;
    $("#site-youtube").checked = settings.sites.youtube;
    document.body.classList.toggle("is-off", !settings.enabled);
  }

  function wire() {
    $("#enabled").addEventListener("change", (event) => {
      settings.enabled = event.target.checked;
      save();
    });
    for (const [selector, field] of [["#hide-extra", "hideExtra"], ["#interests", "interests"]]) {
      const input = $(selector);
      // Text changes re-check the feed, so wait until typing pauses (or Enter / leaving the field).
      const commit = () => {
        clearTimeout(textTimer);
        const value = SignalFeed.cleanText(input.value, 300);
        if (value !== settings[field]) {
          settings[field] = value;
          save();
        }
      };
      input.addEventListener("input", () => {
        clearTimeout(textTimer);
        textTimer = setTimeout(commit, 1200);
      });
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (event) => event.key === "Enter" && commit());
    }
    $("#strictness").addEventListener("click", (event) => {
      const value = event.target.closest("button")?.dataset.value;
      if (!value) return;
      settings.strictness = value;
      save();
    });
    $("#strictness").addEventListener("keydown", (event) => {
      const order = Object.keys(SignalFeed.STRICTNESS);
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      settings.strictness = order[(order.indexOf(settings.strictness) + step + order.length) % order.length];
      save();
      $(`#strictness [data-value="${settings.strictness}"]`).focus();
    });
    $("#site-x").addEventListener("change", (event) => { settings.sites.x = event.target.checked; save(); });
    $("#site-youtube").addEventListener("change", (event) => { settings.sites.youtube = event.target.checked; save(); });
    $("#key-form").addEventListener("submit", saveKey);
    $("#change-key").addEventListener("click", () => showKeyState(null, true));
    $("#show-all").addEventListener("click", showAllOnPage);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.allow) renderAllow(changes.allow.newValue);
      if (changes.usage) renderActivity(changes.usage.newValue);
      if (!changes.settings) return;
      settings = SignalFeed.mergeSettings(changes.settings.newValue);
      render();
      refreshStatus();
    });
  }

  async function save() {
    render();
    await chrome.storage.local.set({ settings });
    refreshStatus();
  }

  async function saveKey(event) {
    event.preventDefault();
    const button = $("#key-save");
    const error = $("#key-error");
    error.hidden = true;
    button.disabled = true;
    button.textContent = "Checking…";
    try {
      const result = await chrome.runtime.sendMessage({ type: "save-key", key: $("#key").value });
      if (!result?.ok) throw new Error(result?.error || "That key didn't work.");
      $("#key").value = "";
      showKeyState(result.hint);
      refreshStatus();
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "Connect";
    }
  }

  // hint: a saved key (or its last 4 characters); editing: show the key form even though a key is saved.
  async function showKeyState(hint, editing = false) {
    const saved = Boolean(hint) || (editing && (await chrome.storage.local.get("apiKey")).apiKey);
    $("#connect").hidden = saved && !editing;
    $("#main").hidden = !saved;
    $(".top .switch").hidden = !saved;
    $("#welcome-next").textContent = saved ? "You're set: open X or YouTube. The defaults below work well, and you can change them any time from the toolbar icon." : "Connect a key below to start.";
    if (saved && !editing) {
      const tail = typeof hint === "string" && hint.length >= 4 ? hint.slice(-4) : "";
      $("#key-hint").textContent = tail ? `OpenRouter key ••••${tail}` : "OpenRouter key saved";
    }
    if (editing || !saved) $("#key").focus();
  }

  // Accounts and channels the user chose to always show, each removable.
  function renderAllow(allow) {
    const box = $("#allow");
    box.replaceChildren();
    const entries = ["x", "youtube"].flatMap((site) => (Array.isArray(allow?.[site]) ? allow[site] : []).map((key) => ({ site, key })));
    $("#allow-card").hidden = !entries.length;
    for (const { site, key } of entries) {
      const chip = document.createElement("span");
      chip.className = "allow-chip";
      const mark = document.createElement("span");
      mark.className = "site-mark";
      mark.textContent = site === "x" ? "X" : "YT";
      const name = document.createElement("span");
      name.textContent = key.startsWith("/channel/") ? "channel" : key;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = `Stop always showing ${key}`;
      remove.setAttribute("aria-label", remove.title);
      remove.addEventListener("click", async () => {
        const { allow: saved = {} } = await chrome.storage.local.get("allow");
        await chrome.storage.local.set({ allow: { ...saved, [site]: (saved[site] || []).filter((k) => k !== key) } });
      });
      chip.append(mark, name, remove);
      box.appendChild(chip);
    }
  }

  // Spend from OpenRouter's own cost reports: a 7-day bar chart, today, the week and the total.
  function renderActivity(saved) {
    const u = SignalFeed.summarizeUsage(saved);
    const spark = $("#spark");
    spark.replaceChildren();
    const max = Math.max(...u.days.map((d) => d.cost), 0.0001);
    u.days.forEach((d, i) => {
      const col = document.createElement("div");
      col.className = `col${i === u.days.length - 1 ? " today" : ""}`;
      col.title = `${d.day}: ${SignalFeed.formatCost(d.cost)}, ${d.hidden} hidden of ${d.checked} checked`;
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${Math.round((d.cost / max) * 100)}%`;
      const label = document.createElement("span");
      label.textContent = d.weekday;
      col.append(bar, label);
      spark.appendChild(col);
    });
    spark.setAttribute("aria-label", `Spend over the last 7 days: ${SignalFeed.formatCost(u.week.cost)}`);
    const bold = (text) => Object.assign(document.createElement("b"), { textContent: text });
    $("#act-week").replaceChildren("7 days ", bold(SignalFeed.formatCost(u.week.cost)));
    $("#act-today").replaceChildren("Today ", bold(`${u.today.hidden} hidden`), ` of ${u.today.checked} checked · `, bold(SignalFeed.formatCost(u.today.cost)));
    const since = new Date(`${u.since}T00:00`).toLocaleDateString("en", { day: "numeric", month: "short" });
    const top = u.topReasons.map((r) => `${r.label} ${Math.round(r.share * 100)}%`).join(", ");
    $("#act-total").textContent = `Total ${SignalFeed.formatCost(u.total.cost)} since ${since}${top ? ` · Mostly ${top}` : ""}`;
  }

  async function showAllOnPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await chrome.tabs.sendMessage(tab.id, { type: "show-all" }).catch(() => {});
    $("#show-all").hidden = true;
    setTimeout(refreshStatus, 400);
  }

  async function refreshStatus() {
    const status = $("#status");
    const { apiKey } = await chrome.storage.local.get("apiKey");
    if (!apiKey) {
      status.textContent = "Not connected yet";
      return;
    }
    const { lastError } = (await chrome.runtime.sendMessage({ type: "status" })) || {};
    const alert = $("#alert");
    const recent = lastError && Date.now() - lastError.at < 10 * 60 * 1000;
    alert.hidden = !recent;
    if (recent) alert.textContent = `${lastError.message} Your feed is shown unfiltered until it works again.`;
    $("#show-all").hidden = true;
    if (!settings.enabled) {
      status.textContent = "Off · Alt+Shift+S to turn on";
      return;
    }
    status.textContent = "On";
    if (welcome) {
      status.textContent = "On · open X or YouTube";
      return;
    }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const text = tab ? await chrome.action.getBadgeText({ tabId: tab.id }) : "";
      const count = Number(text);
      if (count > 0) status.textContent = `On · ${count} hidden on this page ·`;
      $("#show-all").hidden = !(count > 0);
    } catch {
      // No active tab (e.g. a devtools window): the plain "On" is enough.
    }
  }
})();
