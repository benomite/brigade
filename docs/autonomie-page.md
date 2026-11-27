# The public autonomy page (#3220)

`site/autonomie.html` shows the autonomy figures of benomite/brigade. It computes nothing: `site/autonomie.js` renders `site/autonomie.json` as it finds it.

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

One workflow, `.github/workflows/pages.yml`, runs the generator step and deploys `site/`: on push to main, daily (schedule) and on demand. There is no second deploy path. A pull request builds the artifact without the generator: it is never deployed.

## The generator

`scripts/autonomy-page/generate.ts` writes `site/autonomie.json` over the last 30 days of benomite/brigade, with the workflow's `GITHUB_TOKEN` (read only, no other secret):

- the read is the app's (`app/src/vue/autonomy/autonomy-github.ts`), the computation the runtime's (`runtime/src/autonomie/chiffres/chiffres.ts`), the same as the app's Autonomy screen;
- the events and comments of the served tickets are read fifty at a time with GraphQL first, so the run stays within the token's 1,000 REST requests an hour; a ticket GraphQL does not give whole goes to the app's REST read;
- served without a human and the send-back rate show as `90% (690 of 763)` (the tickets the kitchen served), the lead time as the app writes a duration (`1 h 27 min`), the pull requests merged as a count;
- every figure links to the pull requests merged in the period, to the second; the fourth figure is their count.

When the figures cannot be computed (GitHub refuses, the period is only read in part, no ticket served), the script writes nothing and exits non-zero with an `::error::` line: the job fails, nothing is deployed, and the page last published stays.
