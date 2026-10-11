# Chrome Web Store assets

Upload the generated PNG files to the corresponding Chrome Web Store fields:

| File | Store field | Required |
| --- | --- | --- |
| `store-icon-128.png` | Store icon (128x128) | Yes |
| `small-promo-440x280.png` | Small promo tile | Yes |
| `screenshot-light-1280x800.png` | Screenshot | At least one screenshot is required |
| `screenshot-dark-1280x800.png` | Screenshot | Optional additional screenshot |
| `marquee-1400x560.png` | Marquee promo tile | Optional |

The editable SVG and HTML sources are in `source/`. The screenshots use fictional sample content and do not contain personal or production ChatGPT data. They run the current extension scripts on a representative simulated conversation layout, not a live account. Regenerate light/dark screenshots with `node scripts/capture-store-screenshots.js` after installing Playwright Chromium. All page requests are fulfilled locally.

Copy-ready listing drafts are in `listing.ja.txt` and `listing.en.txt`. Release version, privacy declarations, reviewer instructions and submission steps are in [the release preparation plan](../docs/RELEASE.md).
