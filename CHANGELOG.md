# Changelog

## 1.0.0 (23 Oct 2026)

First public release, rebuilt from the September demo.

- Runs on your own OpenRouter key (Jev through OpenRouter's decisions endpoint); no other account needed.
- One popup: hide chips plus free text, optional topics to highlight, Relaxed / Balanced / Strict, and X and YouTube switches. Every change saves at once.
- A welcome tab on install that checks the key before saving it.
- Alt+Shift+S turns it on or off; the toolbar badge shows how many posts are hidden on the page, `off`, or `!` when the key is missing or OpenRouter fails.
- Hidden X posts and sidebar videos collapse to a slim bar; YouTube home cards keep their place in the grid.
- Fails open with backoff: on any error the feed is left as it is and checked again later.
- Removed the demo-only parts: identity blur, hidden X sidebar and YouTube chip bar, per-surface sliders, session stats and the unused `tabs` permission.
- Unit tests, an end-to-end test in Chrome for Testing, a cost and latency benchmark, and a release workflow.
