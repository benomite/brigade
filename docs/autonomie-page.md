# The public autonomy page (#3220)

`site/autonomie.html` shows the autonomy figures of benomite/brigade. It computes nothing: `site/autonomie.js` renders `site/autonomie.json` as it finds it.

## Status

Depends on #3213 (the autonomy figures), which is not merged. The contract below is an **assumption** the generator of #3213 must produce, or be aligned with. Until then, the generator step of `.github/workflows/pages.yml` is a placeholder that writes no figure, and the page shows "Figures not yet available".

## Input contract: `site/autonomie.json`

```json
{ "figures": {
  "servedWithoutHuman": { "value": "…", "computedAt": "YYYY-MM-DD", "url": "https://github.com/benomite/brigade/pulls?q=…" },
  "medianLeadTime":     { "value": "…", "computedAt": "…", "url": "…" },
  "sendBackRate":       { "value": "…", "computedAt": "…", "url": "…" },
  "mergedPullRequests": { "value": "…", "computedAt": "…", "url": "…" }
} }
```

- `value` and `computedAt` are strings, shown as given; `url` is a GitHub search URL (under `https://github.com/benomite/brigade/`) of the pull requests that figure counts, so the list matches the figure.
- The page renders only if the four figures each carry all three fields; otherwise it shows "Figures not yet available".

## Publishing

One workflow, `.github/workflows/pages.yml`, runs the generator step and deploys `site/`: on push to main, daily (schedule) and on demand. There is no second deploy path.
