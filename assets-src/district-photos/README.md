# District photo uploads

Drop the high-resolution originals here, then run:

```
npm run optimize:district-photos
```

The script writes the shipping assets and reports any file still below the DPR2
target. The file name only has to contain the district key — it is matched
case- and diacritic-insensitively, so `Gazimağusa_KKTC_4k.jpg` matches
`gazimagusa`.

| Upload name contains | Writes | Minimum width |
| --- | --- | --- |
| `girne` / `kyrenia` | `public/images/Girne.webp` | 3840 |
| `gazimagusa` / `magusa` / `famagusta` | `public/images/Gazimağusa.webp` | 3840 |
| `guzelyurt` / `morphou` | `public/images/güzelyurt.jpg` | 3840 |
| `iskele` / `trikomo` | `public/images/iskele.jpg` | 3840 |
| `lefkosa` / `nicosia` | `public/images/lefkoşa.jpeg` | 3840 |
| `lefke` | `public/images/lefke.jpg` | 3840 |
| `metal` / `feature strip` / `signature` | `public/images/homepage-metal-feature-strip.png` | 3072 |

Why 3840px: the homepage hero spans the full viewport. At 1920 CSS px on a DPR2
display the browser needs a 3840px-wide source; anything smaller is upscaled and
looks soft. The signature banner is capped at 1536 CSS px, so it needs 3072px.

Sources are only ever downscaled. A file below the target is passed through
unchanged and the run exits non-zero, so a small upload can never be silently
enlarged into a blurry asset.
