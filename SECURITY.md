# Security

Please report security problems privately, through GitHub's [private vulnerability reporting](https://github.com/harish-anumula/signal-feed/security/advisories/new), not in a public issue. I'll reply within a week.

Worth reporting: anything that lets a web page read the OpenRouter key or the extension's storage, run code in the extension, trigger requests to OpenRouter on its own, or make the extension send data that [PRIVACY.md](PRIVACY.md) says it doesn't.

How the extension is built to resist this:

- The key lives in `chrome.storage.local` and is used only by the service worker; content scripts never read it.
- The service worker accepts messages only from the extension itself, and checks the shape of every item.
- Post text goes to Jev as data, with instructions to treat it as untrusted and never follow it. Jev only returns numbers and category names, so the worst a crafted post can do is get itself (or others in its batch of 20) folded or shown wrongly; it can't run anything or change the page beyond that.
- Everything added to the page is built with `textContent`, never `innerHTML`.
- No remote code, no `eval`, and only three hosts: x.com, www.youtube.com and openrouter.ai.
