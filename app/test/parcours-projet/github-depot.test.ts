// La lecture des dépôts de l'étape « projet » (ticket 2476), contre un `gh` de poche : la liste du compte
// demande l'affiliation des organisations en clair, et un dépôt public qui n'est pas au chef se lit par son nom.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { AFFILIATION, depotsDuChef, lireUnDepot } from "../../src/projets/github.ts";
import { SANS_POSIX } from "../aides/posix.ts";

// Un `gh` qui note ses appels et répond ce que le test dit : `/repos/…` selon le dépôt, `/user/repos` la liste.
function unGh(t: TestContext, reponses: Record<string, { sortie?: string; erreur?: string }>) {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-app-gh-depot-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  const gh = join(dossier, "gh");
  const cas = Object.entries(reponses).map(([debut, { sortie, erreur }]) => `  ${JSON.stringify(debut)}*) ${erreur === undefined ? `printf '%s' '${sortie}'` : `echo '${erreur}' >&2; exit 1`};;`);
  writeFileSync(gh, `#!/bin/sh\necho "$2" >> "${join(dossier, "appels")}"\ncase "$2" in\n${cas.join("\n")}\n*) echo "gh: unexpected $2" >&2; exit 1;;\nesac\n`);
  chmodSync(gh, 0o755);
  return { reglages: { gh, delaiMs: 10_000 }, appels: () => readFileSync(join(dossier, "appels"), "utf8").trim().split("\n") };
}

test("la liste du compte demande ses organisations, et rend celles de l'organisation", { skip: SANS_POSIX }, async (t) => {
  const { reglages, appels } = unGh(t, {
    "/user/repos": { sortie: JSON.stringify([{ full_name: "chef/site", default_branch: "trunk" }, { full_name: "acme-corp/api", default_branch: "main" }]) },
  });
  assert.deepEqual(await depotsDuChef(reglages)(), [{ depot: "chef/site", base: "trunk" }, { depot: "acme-corp/api", base: "main" }]);
  assert.ok(appels()[0]?.includes(`affiliation=${AFFILIATION}`));
  assert.ok(AFFILIATION.split(",").includes("organization_member"));
});

test("un dépôt public qui n'est pas au chef se lit par son nom, avec sa branche par défaut", { skip: SANS_POSIX }, async (t) => {
  const { reglages, appels } = unGh(t, { "/repos/octocat/hello-world": { sortie: JSON.stringify({ full_name: "octocat/Hello-World", default_branch: "master" }) } });
  assert.deepEqual(await lireUnDepot(reglages)("octocat/hello-world"), { depot: "octocat/Hello-World", base: "master" });
  assert.deepEqual(appels(), ["/repos/octocat/hello-world"]);
});

test("un dépôt inconnu ou privé, et un nom qui n'en est pas un, se refusent en une phrase", { skip: SANS_POSIX }, async (t) => {
  const { reglages, appels } = unGh(t, { "/repos/acme/secret": { erreur: "gh: Not Found (HTTP 404)" } });
  const lire = lireUnDepot(reglages);
  assert.deepEqual(await lire("acme/secret"), { refus: "acme/secret was not found on GitHub, or it is private" });
  for (const faux of ["pas un depot", "a/b/c", "../x", "a/..", "a/.", 42, undefined]) assert.match(((await lire(faux)) as { refus: string }).refus, /not a repository name/);
  assert.deepEqual(appels(), ["/repos/acme/secret"], "un nom mal formé ne part pas à GitHub");
});
