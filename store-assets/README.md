# Chrome Web Store assets

The v1.7.0 package is published on GitHub and was submitted to the Chrome Web Store on 2026-10-24 (JST); it is awaiting review. The Japanese and English listing texts were saved together in the dashboard's shared description field before submission. The currently published store version remains 1.6.3.

The existing store images were retained for this submission. The generated PNG files correspond to these Chrome Web Store fields:

| File | Store field | Required |
| --- | --- | --- |
| `store-icon-128.png` | Store icon (128x128) | Yes |
| `small-promo-440x280.png` | Small promo tile | Yes |
| `screenshot-light-1280x800.png` | Screenshot | At least one screenshot is required |
| `screenshot-dark-1280x800.png` | Screenshot | Optional additional screenshot |
| `marquee-1400x560.png` | Marquee promo tile | Optional |

The editable SVG and HTML sources are in `source/`. The screenshots use fictional sample content and do not contain personal or production ChatGPT data. They run the current extension scripts on a representative simulated conversation layout, not a live account. Regenerate light/dark screenshots with `node scripts/capture-store-screenshots.js` after installing Playwright Chromium. All page requests are fulfilled locally.

Copy-ready listing drafts are in `listing.ja.txt` and `listing.en.txt`. Release version, privacy declarations, reviewer instructions and submission steps are in [the release preparation plan](../docs/RELEASE.md).

The existing screenshots demonstrate ChatGPT with fictional local data and remain valid examples of that supported feature. They do not demonstrate Gemini or prove Gemini history recovery. A Gemini-specific sample image is optional; create it from an anonymous fixture if added. Do not use live account screenshots or the private test-conversation URLs. Existing image files are unchanged for this preparation.
