<p align="center"><img src="extension/icons/icon-128.png" width="72" height="72" alt=""></p>
<h1 align="center">Signal Feed</h1>
<p align="center">Fold away ragebait, empty hype and engagement bait on X and YouTube before you scroll to it, and highlight what you care about.</p>

<p align="center"><img src="docs/screenshots/feed.png" width="860" alt="A feed where bait posts are folded into slim 'Hidden by Signal Feed' bars and useful posts are marked with a teal edge"></p>

## What it does

- **Hides feed noise.** Posts and videos that match your hide list fold into a slim bar. **Show** brings any of them back.
- **Highlights what you want.** Type a few topics ("AI research, climbing") and matching posts get a teal edge.
- **Decides ahead of you.** Posts are checked in batches about two screens before you reach them, so you rarely see anything flash.
- **One key, three choices.** Paste an OpenRouter key, then pick what to hide (chips plus free text), what to highlight, and how strict to be.
- **Alt+Shift+S** turns it on or off from any tab. The toolbar badge shows how many posts are hidden on the page.
- **Fails open.** If OpenRouter is down or the key runs out, your feed is shown as it is and the badge shows `!`.

Works on the X home timeline, profiles and threads, the YouTube home grid and the sidebar next to a video.

## Install

**Chrome Web Store:** coming soon.

**From source:**

1. Download this repository (or the zip from the latest release) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `extension` folder.
3. A welcome tab opens. Paste an [OpenRouter API key](https://openrouter.ai/keys) and click **Connect**.
4. Open X or YouTube.

Works in Chrome, Edge, Brave and other Chromium browsers.

## Cost and speed

Signal Feed uses your own OpenRouter key to call [Jev](https://openrouter.ai/typesafe/jev-1.13), TypeSafe's fast judgment model. Each post gets one yes-or-no question ("should this be hidden under your policy?"), plus one more if you set topics to highlight.

| | Per 1,000 posts | Per batch of 20 |
|---|---|---|
| Hide only (default) | about $0.015 | about 0.5 s |
| Hide and highlight | about $0.02 | about 0.5 s |

Measured with `node test/bench.mjs` on 23 Oct 2026. Answers are cached for the browser session, so scrolling back up or reopening a post costs nothing.

## Settings

| Setting | What it does |
|---|---|
| **Hide** | Chips for common noise (on by default: ragebait, engagement bait, empty hype, low effort, spammy promo; off: pure entertainment, politics, sports), plus free text for anything else. The text is applied literally, so "anything except AI" works. |
| **Highlight** | Topics you want more of. Leave it empty to only hide. |
| **Strictness** | Relaxed hides only clear cases; Strict hides more borderline posts. |
| **Sites** | Turn X or YouTube off separately. |

Change the shortcut at `chrome://extensions/shortcuts`.

## Privacy

No servers, no analytics, no tracking. The text of the posts and video titles in your feed goes to OpenRouter (and from there to TypeSafe, which runs Jev) to be judged, together with your hide list and topics. Nothing else leaves your browser: no usernames, no cookies, no browsing history. Your key is stored in this browser profile and is sent only to OpenRouter. Full details: [PRIVACY.md](PRIVACY.md).

## How it works

```
X / YouTube page                       service worker                      OpenRouter
content script ──batches of 20────────> cache (session) ──HTTPS─────────> /api/alpha/decisions
finds posts ~2 screens ahead            your key, retries                  Jev: one probability
folds / highlights <──decisions──────── thresholds by strictness  <────── per question
```

- `extension/src/content.js` finds posts, queues them as they come within about two screens, and folds or highlights them. Page text is sent as data, with instructions to treat it as untrusted.
- `extension/background.js` holds the key, batches requests, caches answers for the session, retries rate limits and sets the badge.
- `extension/src/core.js` builds the Jev request and turns probabilities into decisions. It's shared by the worker, the page script, the popup and the tests.

## Development

```sh
npm install
npm test            # unit tests for core.js
npm run test:e2e    # the real extension in Chrome for Testing, with live Jev calls
npm run package     # dist/signal-feed-<version>.zip for the Chrome Web Store
```

The end-to-end test serves fixture pages at `x.com` and `youtube.com`, so the shipped manifest is tested unchanged. It needs an OpenRouter key in `OPENROUTER_KEY` (or a file at `~/.inpage/openrouter_key`) and costs well under a cent per run. Set `CHROME` to a Chrome for Testing binary if yours lives somewhere else.

Releases: bump the version in `extension/manifest.json` and `package.json`, add a `CHANGELOG.md` entry, and push a tag like `v1.0.1`. The release workflow builds the zip and drafts a GitHub release.

## Limits

- Image-only posts and videos with no title text are left alone.
- Replies inside a thread are treated like any other post. Search results and comments aren't filtered.
- X and YouTube change their markup from time to time. If posts stop being picked up, please open an issue.

## License

MIT
