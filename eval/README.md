# Eval

How Signal Feed's thresholds were chosen, and how to check them again. `node eval/run.mjs` asks Jev about every labelled item exactly as the extension does, and prints precision, recall and false hides for each threshold and for the shipped Relaxed, Balanced and Strict settings. It also checks how often the reason shown on a folded post is right, and reports cost and latency. Answers are cached in `eval/out/`, so a re-run only pays for new items or changed prompts; a full run from scratch costs about half a cent.

## Data

| Set | What | Public |
|---|---|---|
| `data/x.json` | 91 synthetic X posts: clear noise in each category, hard negatives (angry but substantive, "BREAKING" news, launches with real numbers, short but useful tips) and borderline posts marked `either` | yes |
| `data/youtube.json` | 54 synthetic YouTube titles, same idea | yes |
| `private/*.json` | Real posts from a real X feed, labelled by Claude | **no**: gitignored, never committed |

All labels, synthetic and real, were made by Claude. Synthetic items are written for this eval and use no real accounts. Labels: `keep`, one hide category, or `either` (not scored). Tags: `ai` (for the custom-rule test), `hl` (worth highlighting), `alsoBait` and `amb` (fits more than one reading; not scored where that matters).

The synthetic sets are deliberately clear-cut, so they mostly catch regressions (AUC ≈ 1.0). The real feed is the honest test, and it is the one the thresholds were tuned on. To add your own private set, put a file like this in `eval/private/`: `{ "site": "X", "items": [["h", "post text"], ["k", "post text", true], ["e", "post text"]] }` (h = hide, k = keep, e = either; `true` = worth highlighting).

## Scenarios

- **default**: the default chips (ragebait, engagement bait, empty hype, low effort, spammy promo).
- **extras**: every chip on, adding pure entertainment, politics and sports.
- **custom**: no chips, only the typed rule "anything that is not mainly about AI or machine learning".
- **highlight**: the highlight question with "AI research, machine learning, software engineering".

## Results (23 Oct 2026, `typesafe/jev-1.13`)

Real X feed, default chips, 63 clear-cut posts (27 to hide):

| Setting | Threshold | Precision | Recall | False hides |
|---|---|---|---|---|
| Relaxed | 0.70 | 100% | 70% | 0% |
| **Balanced** | 0.50 | **96%** | **85%** | **3%** |
| Strict | 0.40 | 79% | 96% | 19% |

Precision: of the posts it hides, how many you'd want hidden. Recall: of the posts you'd want hidden, how many it catches. False hides: share of good posts that get hidden.

Synthetic sets: 100% precision at every shipped setting on the default and extras scenarios; YouTube recall 80% / 90% / 100% for Relaxed / Balanced / Strict. Custom rule on X: 99% precision, 93% recall at Balanced. Reasons: 36 of 38 right on X, 18 of 20 on YouTube.

Cost per 1,000 posts: about $0.018 for the hide question, $0.008 more with highlighting, and about $0.004 for reasons (asked only for the ~30% that get hidden). About 0.5 s per batch of 20.

## What was compared

Three ways to ask, on the same data:

- **A**, the first version: a yes/no "should this be hidden?" with a short policy. Real-feed AUC 0.977, but its best threshold sat higher and it was less consistent across sets.
- **A2**, what ships: the same yes/no question with each category spelled out in the policy. AUC 0.974, the steadiest precision across the real and synthetic sets, and clean thresholds.
- **B**: one multiple-choice question per post (keep, or one of the categories), with P(hide) = 1 − P(keep). It gives a reason for free, but ranks worse on the real feed (AUC 0.961, 8% false hides at its best point).

So the shipped design decides with A2, then asks B's question only for posts that are already hidden, to show the reason. `node eval/run.mjs --compare` reruns B next to the shipped design.

Two prompt fixes came out of the eval: category definitions in the policy (A → A2), and an instruction to read exception rules ("anything except X") broadly, so subfields, tools, jobs and news about X count as X. On the custom-rule scenario that took X from AUC 0.898 to 0.987.
