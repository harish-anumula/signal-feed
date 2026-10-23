# Changelog

## 1.0.0 (23 Oct 2026)

First public release, rebuilt from the September demo.

- Runs on your own OpenRouter key (Jev through OpenRouter's decisions endpoint); no other account needed.
- One popup: hide chips plus free text, optional topics to highlight, Relaxed / Balanced / Strict, and X and YouTube switches. Every change saves at once.
- Every folded post says why (Ragebait, Engagement bait, …). Show opens it with a one-line strip; Hide again folds it back; Always show @handle or a channel; Show all on the page from the popup.
- Activity in the popup: a 7-day spend chart, today, the total and the most common reasons, from the cost OpenRouter reports.
- Relaxed / Balanced / Strict thresholds calibrated per surface with a new eval (`eval/`): on a real X feed, Balanced hides 85% of the noise at 96% precision.
- Works with X's re-renders (no class hooks), never folds the post you opened, doesn't mistake videos for ads, and reads YouTube's dark theme.
- A welcome tab on install that checks the key before saving it.
- Alt+Shift+S turns it on or off; the toolbar badge shows how many posts are hidden on the page, `off`, or `!` when the key is missing or OpenRouter fails.
- Hidden X posts and sidebar videos collapse to a slim bar; YouTube home cards keep their place in the grid.
- Fails open with backoff: on any error the feed is left as it is and checked again later.
- Removed the demo-only parts: identity blur, hidden X sidebar and YouTube chip bar, per-surface sliders, session stats and the unused `tabs` permission.
- Unit tests, an end-to-end test in Chromium, a calibration eval with cost and latency, and a release workflow.
