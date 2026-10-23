# Chrome Web Store submission

Everything the developer dashboard asks for, in the order it asks. Upload `dist/signal-feed-1.0.0.zip` (`npm run package`).

## Store listing

**Name:** Signal Feed

**Summary** (132 characters max):

> Your X and YouTube feeds, minus the bait. Ragebait, hype and engagement bait fold away, each with the reason why.

**Category:** Productivity → Tools (fallback: Social & Communication)

**Language:** English

**Description:**

> Your X and YouTube feeds, minus the bait.
>
> Signal Feed folds away ragebait, empty hype and engagement bait before you scroll to them, and tells you why each one was hidden. Posts on the topics you care about get a subtle highlight.
>
> WHAT YOU GET
> • Hidden posts collapse to a slim bar with the reason: Ragebait, Engagement bait, Empty hype, Low effort or Spammy promo.
> • One click shows a post. Hide again if you change your mind.
> • "Always show" for people and channels you trust.
> • Highlights for your topics, like "AI research, climbing".
> • Show everything on a page from the toolbar, and Alt+Shift+S to turn it on or off.
>
> SIMPLE TO SET UP
> Paste an OpenRouter API key once. Then choose what to hide (chips, or your own words such as "anything except AI"), what to highlight, and Relaxed, Balanced or Strict.
>
> MEASURED, NOT GUESSED
> On 63 posts from a real X feed, labelled by Claude, the default setting caught 85% of the posts labelled as noise, and 96% of what it hid was labelled noise. The full eval is open source.
>
> PENNIES, AND YOU CAN SEE THEM
> It uses Jev, TypeSafe's fast judgment model, through your own OpenRouter account: about 2 cents per 1,000 posts, half a second per batch of 20. The popup shows what you spent this week.
>
> PRIVATE BY DESIGN
> No servers, no analytics, no account with us. Only the text of feed posts and video titles goes to OpenRouter to be judged. Usernames, images, cookies and your browsing history never leave your browser. If OpenRouter can't be reached, your feed is shown exactly as it is.
>
> Open source (MIT): https://github.com/harish-anumula/signal-feed

**Graphic assets** (in `store/`):

| Asset | Size | File |
|---|---|---|
| Store icon | 128×128 | `extension/icons/icon-128.png` |
| Screenshots (up to 5) | 1280×800 | `store/screenshot-1.png` … `store/screenshot-4.png`, in that order |
| Small promo tile | 440×280 | `store/promo-small.png` |
| Marquee promo tile (optional) | 1400×560 | `store/promo-marquee.png` |

**Official URL:** none · **Homepage URL:** https://github.com/harish-anumula/signal-feed · **Support URL:** https://github.com/harish-anumula/signal-feed/issues

## Privacy practices

**Single purpose:**

> Signal Feed filters the X and YouTube feeds: it hides posts and videos that match the user's hide list and highlights ones that match the user's chosen topics.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Stores the user's OpenRouter key, settings, "Always show" list and local activity totals, and caches decisions for the browser session so the same post isn't checked twice. |
| Host `https://x.com/*` | Reads the text of posts in the X feed and folds or highlights them in the page. Reads a post's @handle locally, only to honour the user's "Always show" list. |
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
