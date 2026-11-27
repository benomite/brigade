// La lecture des dépôts de l'étape « projet » (ticket 2476), contre un `gh` de poche : la liste du compte
// demande l'affiliation des organisations en clair, et un dépôt public qui n'est pas au chef se lit par son nom.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { AFFILIATION, repositoriesOfChef, readOneRepository } from "../../src/projects/github.ts";
import { WITHOUT_POSIX } from "../helpers/posix.ts";

// Un `gh` qui note ses appels et répond ce que le test dit : `/repos/…` selon le dépôt, `/user/repos` la liste.
function oneGh(t: TestContext, answers: Record<string, { sortie?: string; erreur?: string }>) {
  const folder = mkdtempSync(join(tmpdir(), "brigade-app-gh-depot-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const gh = join(folder, "gh");
  const theCase = Object.entries(answers).map(([start, { sortie: output, erreur: error }]) => `  ${JSON.stringify(start)}*) ${error === undefined ? `printf '%s' '${output}'` : `echo '${error}' >&2; exit 1`};;`);
  writeFileSync(gh, `#!/bin/sh\necho "$2" >> "${join(folder, "appels")}"\ncase "$2" in\n${theCase.join("\n")}\n*) echo "gh: unexpected $2" >&2; exit 1;;\nesac\n`);
  chmodSync(gh, 0o755);
  return { reglages: { gh, delaiMs: 10_000 }, appels: () => readFileSync(join(folder, "appels"), "utf8").trim().split("\n") };
}

test("la liste du compte demande ses organisations, et rend celles de l'organisation", { skip: WITHOUT_POSIX }, async (t) => {
  const { reglages: settings, appels: calls } = oneGh(t, {
    "/user/repos": { sortie: JSON.stringify([{ full_name: "chef/site", default_branch: "trunk" }, { full_name: "acme-corp/api", default_branch: "main" }]) },
  });
  assert.deepEqual(await repositoriesOfChef(settings)(), [{ depot: "chef/site", base: "trunk" }, { depot: "acme-corp/api", base: "main" }]);
  assert.ok(calls()[0]?.includes(`affiliation=${AFFILIATION}`));
  assert.ok(AFFILIATION.split(",").includes("organization_member"));
});

test("un dépôt public qui n'est pas au chef se lit par son nom, avec sa branche par défaut", { skip: WITHOUT_POSIX }, async (t) => {
  const { reglages: settings, appels: calls } = oneGh(t, { "/repos/octocat/hello-world": { sortie: JSON.stringify({ full_name: "octocat/Hello-World", default_branch: "master" }) } });
  assert.deepEqual(await readOneRepository(settings)("octocat/hello-world"), { depot: "octocat/Hello-World", base: "master" });
  assert.deepEqual(calls(), ["/repos/octocat/hello-world"]);
});

test("un dépôt inconnu ou privé, et un nom qui n'en est pas un, se refusent en une phrase", { skip: WITHOUT_POSIX }, async (t) => {
  const { reglages: settings, appels: calls } = oneGh(t, { "/repos/acme/secret": { erreur: "gh: Not Found (HTTP 404)" } });
  const read = readOneRepository(settings);
  assert.deepEqual(await read("acme/secret"), { refus: "acme/secret was not found on GitHub, or it is private" });
  for (const fake of ["pas un depot", "a/b/c", "../x", "a/..", "a/.", 42, undefined]) assert.match(((await read(fake)) as { refus: string }).refus, /not a repository name/);
  assert.deepEqual(calls(), ["/repos/acme/secret"], "un nom mal formé ne part pas à GitHub");
});
