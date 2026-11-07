import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { HumainsInvalides, humainsDe, humainsDuRole, humainsParRole, lireHumains } from "../../src/humains/humains.ts";
import { ecrireReglagesProjet, FICHIER, lireReglagesProjet, ReglageRefuse } from "../../src/reglages-projet/reglages.ts";
import { repertoireTemporaire } from "../outils.ts";

// Un clone dont `projet.json` porte ces réglages, en plus de sa branche.
function projet(t: TestContext, reglages: Record<string, unknown> = {}): string {
  const clone = repertoireTemporaire(t);
  mkdirSync(dirname(join(clone, FICHIER)), { recursive: true });
  writeFileSync(join(clone, FICHIER), JSON.stringify({ version: 1, integrationBranch: "main", ...reglages }));
  return clone;
}

test("a project declaring alice with `product` and `review`: she is loaded, and the lookup by `review` returns her", (t) => {
  const humains = lireHumains(projet(t, { humans: [{ login: "alice", roles: ["product", "review"] }, { login: "bob", roles: ["design"] }] }));
  assert.deepEqual(humains, [{ login: "alice", roles: ["product", "review"] }, { login: "bob", roles: ["design"] }]);
  assert.deepEqual(humainsDuRole(humains, "review"), [{ login: "alice", roles: ["product", "review"] }]);
  assert.deepEqual(humainsDuRole(humains, "client-contact"), []);
  assert.deepEqual(humainsParRole(humains), { product: ["alice"], design: ["bob"], review: ["alice"], "client-contact": [] });
});

test("a project without `humans`, or without settings at all, loads with no error and an empty list", (t) => {
  assert.deepEqual(lireHumains(projet(t)), []);
  assert.deepEqual(lireHumains(repertoireTemporaire(t)), []);
  assert.deepEqual(humainsDe(undefined), []);
  assert.deepEqual(humainsDe([]), []);
});

test("an unknown role, a duplicate login or an empty login is refused, naming the offending entry", (t) => {
  const refus = (humans: unknown, cle: string, message: RegExp) => {
    assert.throws(() => humainsDe(humans), (erreur: unknown) => erreur instanceof HumainsInvalides && erreur.cle === cle && message.test(erreur.message));
    // Le même refus, à la lecture du fichier du projet.
    assert.throws(() => lireHumains(projet(t, { humans })), (erreur: unknown) => erreur instanceof ReglageRefuse && erreur.cle === cle && message.test(erreur.message));
  };
  refus([{ login: "alice", roles: ["review"] }, { login: "bob", roles: ["review", "owner"] }], "humans.1.roles", /`humans\.1` \("bob"\).*"owner" is not a role.*`product`, `design`, `review`, `client-contact`/);
  refus([{ login: "alice", roles: ["review"] }, { login: "Alice", roles: ["design"] }], "humans.1.login", /`humans\.1` \("Alice"\).*already declared by `humans\.0`/);
  refus([{ login: "", roles: ["review"] }], "humans.0.login", /`humans\.0`.*login is empty/);
  refus([{ roles: ["review"] }], "humans.0.login", /`humans\.0`.*login is empty/);
  refus([{ login: "not a login", roles: [] }], "humans.0.login", /is not a GitHub login/);
  refus([{ login: "alice", roles: "review" }], "humans.0.roles", /must be a list/);
  refus([{ login: "alice", roles: [], email: "a@b.c" }], "humans.0.email", /`email` is not part of a human/);
  refus({ alice: ["review"] }, "humans", /must be a list/);
});

test("roles belong to the project: the same login carries its own roles in each project", (t) => {
  const un = lireHumains(projet(t, { humans: [{ login: "alice", roles: ["product"] }] }));
  const deux = lireHumains(projet(t, { humans: [{ login: "alice", roles: ["review", "client-contact"] }] }));
  assert.deepEqual(un, [{ login: "alice", roles: ["product"] }]);
  assert.deepEqual(deux, [{ login: "alice", roles: ["review", "client-contact"] }]);
  assert.deepEqual(humainsDuRole(un, "review"), []);
  assert.deepEqual(humainsDuRole(deux, "review").map(({ login }) => login), ["alice"]);
});

test("the project settings keep `humans`: read with the others, and rewritten as they were", async (t) => {
  const humans = [{ login: "alice", roles: ["product", "review"] }];
  const clone = projet(t, { chef: "benomite", humans });
  assert.deepEqual((await lireReglagesProjet(clone)).humans, humans);
  ecrireReglagesProjet(clone, { integrationBranch: "main", chef: "benomite", humans });
  assert.deepEqual(JSON.parse(readFileSync(join(clone, FICHIER), "utf8")).humans, humans);
  assert.deepEqual(lireHumains(clone), humans);
});
