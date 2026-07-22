# Self-hosted fonts

The three families in the ArcBase type system (see the design brief): Geist for
body/UI, Geist Mono for labels, Inter Tight for the wordmark and display
headings. Loaded by `src/app/layout.tsx` via `next/font/local`.

## Why these are committed rather than fetched

They used to come from `next/font/google`, which fetches at **build** time. That
made every build depend on a third-party network call, and the failure was both
intermittent and badly disguised:

- a direct failure aborted the build with `NextFontError: Failed to fetch 'Geist'
from Google Fonts`;
- worse, a failure part-way left a half-written `.next`, which surfaced later as
  `Cannot find module '.next/server/next-font-manifest.json'` — an error that
  points nowhere near the actual cause.

Self-hosting makes the build hermetic and removes a runtime dependency on
Google's CDN for anyone using the app.

## What each file is

Each `.woff2` is the **latin subset** of the family's **variable** font, taken
from Google's font CDN (`fonts.gstatic.com`) — byte-for-byte the same file
`next/font/google` was fetching, with `subsets: ["latin"]` as before.

Being variable, one file spans weights **100–900**, which is why `layout.tsx`
declares `weight: "100 900"` rather than a single number. ArcBase uses 400, 500,
600 and 800; all are covered by these three files.

| File                               | Family      | Size  |
| ---------------------------------- | ----------- | ----- |
| `geist-latin-variable.woff2`       | Geist       | 29 KB |
| `geist-mono-latin-variable.woff2`  | Geist Mono  | 23 KB |
| `inter-tight-latin-variable.woff2` | Inter Tight | 44 KB |

## Licensing

Both families are licensed under the **SIL Open Font License, Version 1.1**,
which permits bundling and redistribution provided the licence travels with the
files. The upstream licence texts are included verbatim:

- `LICENSE-Geist.txt` — © 2023 Vercel, in collaboration with basement.studio
  ([vercel/geist-font](https://github.com/vercel/geist-font))
- `LICENSE-InterTight.txt` — © 2016 The Inter Project Authors
  ([rsms/inter](https://github.com/rsms/inter))

## Updating

Fonts are only worth re-fetching to pick up an upstream release. Get the latin
`src` URL from the Google Fonts CSS API with a modern browser `User-Agent`
(without one it serves `.ttf` instead of `.woff2`), then replace the file in
place — the filenames are referenced from `layout.tsx`:

```bash
curl -A "Mozilla/5.0 ... Chrome/120.0 Safari/537.36" \
  "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap"
```

The response is split into one `@font-face` block per subset; take the URL under
the `/* latin */` comment. Verify what you downloaded is really a font before
committing it — a failed fetch writes an HTML error page under the `.woff2`
name, and `file x.woff2` should say `Web Open Font Format (Version 2)`.
