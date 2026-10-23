# Contributing

Thanks for helping. Signal Feed is plain JavaScript with no build step: `extension/` is exactly what ships.

## Set up

```sh
npm install
npx playwright install chromium
echo "sk-or-v1-…" > .openrouter-key   # your OpenRouter key, for the end-to-end test and the eval (gitignored)
```

Load `extension/` unpacked at `chrome://extensions` to try your change on the real sites. After editing, click reload on the extension card and refresh your X or YouTube tab.

## Before a pull request

```sh
npm run check        # syntax
npm test             # unit tests for extension/src/core.js
npm run test:e2e     # the real extension against fixture X and YouTube pages, with live Jev calls (< 1 cent)
```

If you change a prompt, a threshold or the hide categories, run `node eval/run.mjs` too and put the before and after numbers in the pull request. See [eval/README.md](eval/README.md).

## Where things are

- `extension/src/core.js`: settings, the Jev requests, thresholds and the decision. Pure functions, unit-tested.
- `extension/src/content.js` and `content.css`: finding posts on X and YouTube, folding, highlighting, reasons. Hook only on `data-sf-*` attributes and elements we add: X rewrites a post's `class` on re-render.
- `extension/background.js`: the key, batching, the session cache, retries, usage and the badge.
- `extension/popup/`: settings, activity and the welcome tab.
- `test/pages/`: the fixture pages. When X or YouTube changes its markup, update the fixture to match the real page first, so the test fails, then fix the selector.

## Reporting a wrong call

The most useful report is a post that was hidden and shouldn't have been, or the other way round. Use the "Wrong call" issue form, and paste only the text of the post, never the author. Clear cases go into `eval/data/` as synthetic look-alikes, so the eval catches them next time.

## Ground rules

- Fail open: if anything goes wrong, the page must look exactly as it would without the extension.
- Nothing new leaves the browser without a line in [PRIVACY.md](PRIVACY.md) and the store listing (`store/listing.md`).
- No remote code, no analytics, no new permissions without a good reason in the pull request.
