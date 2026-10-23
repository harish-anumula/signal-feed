# Privacy policy

Last updated: 23 October 2026

Signal Feed has no servers and no analytics. It doesn't collect, sell or share anything about you, and the developer never receives your data.

## What leaves your browser

While Signal Feed is on, and only on x.com and www.youtube.com, it sends the following to [OpenRouter](https://openrouter.ai) with your own OpenRouter key:

- the text of posts in your X feed (and of a quoted post inside one), and the titles and badges (such as "LIVE") of videos on the YouTube home page and sidebar, at most 1,200 characters per item;
- your hide list and the topics you asked to highlight;
- for posts it has hidden, the same text again, to pick the reason shown on the folded bar.

OpenRouter passes the request to TypeSafe, which runs the Jev model, and returns one probability per question. It is used only to decide whether to fold or highlight each item. [OpenRouter's privacy policy](https://openrouter.ai/privacy) and terms apply to these requests.

Signal Feed never sends usernames, profile pictures, links, images, cookies, form contents, your browsing history, or anything from other sites. It reads a post's @handle (or a video's channel) on the page only to check it against your "Always show" list; that never leaves your browser.

## What stays in your browser

- Your OpenRouter key and your settings are stored in `chrome.storage.local` in this browser profile. Web pages can't read them. The key is sent only to openrouter.ai.
- Answers are cached in `chrome.storage.session` so the same post isn't checked twice. The cache is cleared when you close the browser.
- Your "Always show" list and your activity (posts checked and hidden per day, the reasons, and the cost OpenRouter reported) are stored in `chrome.storage.local`. Activity is kept for 30 days, plus running totals.
- Which posts you chose to show is kept only in the open page.

Removing the extension deletes all of it.

## Permissions

- **storage**: keep your key, settings, "Always show" list, activity and the session cache.
- **x.com, www.youtube.com**: read feed items and fold or highlight them.
- **openrouter.ai**: check your key and ask Jev about feed items.

## Contact

Questions or concerns: open an issue at https://github.com/harish-anumula/signal-feed/issues.
