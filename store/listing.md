# Chrome Web Store submission

Everything the developer dashboard asks for, in the order it asks. Upload `dist/signal-feed-1.0.0.zip` (`npm run package`).

## Store listing

**Name:** Signal Feed

**Summary** (132 characters max):

> Fold away ragebait, hype and engagement bait on X and YouTube, and highlight what you care about. Uses your OpenRouter key.

**Category:** Productivity → Tools (fallback: Social & Communication)

**Language:** English

**Description:**

> Signal Feed makes X and YouTube calmer. It folds away ragebait, empty hype and engagement bait before you scroll to it, and can highlight the posts and videos you actually came for.
>
> HOW IT WORKS
> • Posts are checked in small batches about two screens ahead, so noise is folded before you see it.
> • Hidden posts collapse to a slim bar. Click Show to see any of them.
> • Add topics you care about ("AI research, climbing") and matching posts get a subtle teal edge.
> • The toolbar badge shows how many posts are hidden on the page.
> • Alt+Shift+S turns it on or off from any tab.
>
> SIMPLE TO SET UP
> Paste an OpenRouter API key once. Then choose what to hide (chips for ragebait, engagement bait, empty hype, low-effort posts, spammy promo, pure entertainment, politics or sports, plus your own words), what to highlight, and how strict to be.
>
> CHEAP AND FAST
> Signal Feed uses Jev, TypeSafe's fast judgment model, through your own OpenRouter account. It costs about 2 cents per 1,000 posts and answers a batch of 20 posts in about half a second. Answers are cached, so scrolling back costs nothing.
>
> PRIVATE BY DESIGN
> No servers, no analytics, no account with us. Only the text of feed posts and video titles goes to OpenRouter to be judged. Usernames, images, cookies and your browsing history never leave your browser. If OpenRouter is unreachable, your feed is shown exactly as it is.
>
> Open source (MIT): https://github.com/harish-anumula/signal-feed

**Graphic assets** (in `store/`):

| Asset | Size | File |
|---|---|---|
| Store icon | 128×128 | `extension/icons/icon-128.png` |
| Screenshots (up to 5) | 1280×800 | `store/screenshot-1.png` … `store/screenshot-3.png` |
| Small promo tile | 440×280 | `store/promo-small.png` |
| Marquee promo tile (optional) | 1400×560 | `store/promo-marquee.png` |

**Official URL:** none · **Homepage URL:** https://github.com/harish-anumula/signal-feed · **Support URL:** https://github.com/harish-anumula/signal-feed/issues

## Privacy practices

**Single purpose:**

> Signal Feed filters the X and YouTube feeds: it hides posts and videos that match the user's hide list and highlights ones that match the user's chosen topics.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Stores the user's OpenRouter key and settings, and caches decisions for the browser session so the same post isn't checked twice. |
| Host `https://x.com/*` | Reads the text of posts in the X feed and folds or highlights them in the page. |
| Host `https://www.youtube.com/*` | Reads video titles on the YouTube home page and sidebar and folds or highlights them in the page. |
| Host `https://openrouter.ai/*` | Checks the user's API key and sends feed text to the Jev model on OpenRouter, which returns the hide/highlight probabilities. |

**Remote code:** No, I am not using remote code. (All JavaScript is in the package; the extension only fetches JSON from OpenRouter.)

**Data usage** (tick these):

- **Website content**: yes. The text of feed posts and video titles is sent to OpenRouter to decide whether to hide or highlight them.
- **Authentication information**: yes. The user's OpenRouter API key is stored locally and sent only to OpenRouter to authorise requests.
- Everything else (personally identifiable information, health, financial, personal communications, location, web history, user activity): no.

**Certifications** (all three are true):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/harish-anumula/signal-feed/blob/main/PRIVACY.md

## Distribution

- Visibility: Public
- Regions: All regions
- Pricing: Free

## Notes for the reviewer (optional field)

> To test: install, paste any OpenRouter API key on the welcome tab (openrouter.ai/keys; a few cents of credit is enough), then open x.com or youtube.com. Posts that match the hide list fold into "Hidden by Signal Feed" bars. The extension only fetches JSON from openrouter.ai and runs no remote code.
