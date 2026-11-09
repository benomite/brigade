# migration-etiquettes-anglais — an existing repo moves to the English label catalogue

Epic #3029. For a repo set up before the catalogue went English: renames `hors-cuisine` to `served-elsewhere` (GitHub carries the new name onto every ticket that had the old one) and gives every label its English description from the catalogue (`runtime/src/etiquettes.ts`, the only list). A label the repo lacks is reported, not created. `gh` must be connected.

```sh
# Dry run (default): prints the renames and description changes, changes nothing on GitHub.
node scripts/migration-etiquettes-anglais/migrer.ts --repo benomite/brigade

# Write: renames and describes for real.
node scripts/migration-etiquettes-anglais/migrer.ts --repo benomite/brigade --apply

# Audit (read-only): number and links of the issue and PR titles and comments that look French.
node scripts/migration-etiquettes-anglais/migrer.ts --repo benomite/brigade --audit
```

`--apply` and `--audit` exclude each other. The audit never rewrites anything: French is detected by common-word counts, a heuristic for the chef to read. A GitHub failure is printed and the command exits 1.

## Tests

`cd scripts/migration-etiquettes-anglais && npm test` — a stubbed GitHub client, nothing leaves the machine. `npm run typecheck` reuses the dependencies of `runtime/`.
