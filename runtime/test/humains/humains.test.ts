import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { direHumains, HumainsInvalides, humainsDe, humainsDuRole } from "../../src/humains/humains.ts";
import { ecrireReglagesProjet, FICHIER, lireReglagesProjet, ReglageRefuse } from "../../src/reglages-projet/reglages.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { FAUX_CLAUDE, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

// Un clone dont `projet.json` porte ces réglages, en plus de sa branche.
function projet(t: TestContext, reglages: Record<string, unknown> = {}): string {
  const clone = repertoireTemporaire(t);
  mkdirSync(dirname(join(clone, FICHIER)), { recursive: true });
  writeFileSync(join(clone, FICHIER), JSON.stringify({ version: 1, integrationBranch: "main", ...reglages }));
  return clone;
}

// Les humains que les réglages du projet portent, lus avec les autres.
const lireHumains = async (clone: string) => (await lireReglagesProjet(clone)).humans ?? [];

test("a project declaring alice with `product` and `review`: she is loaded, and the lookup by `review` returns her", async (t) => {
  const humains = await lireHumains(projet(t, { humans: [{ login: "alice", roles: ["product", "review"] }, { login: "bob", roles: ["design"] }] }));
  assert.deepEqual(humains, [{ login: "alice", roles: ["product", "review"] }, { login: "bob", roles: ["design"] }]);
  assert.deepEqual(humainsDuRole(humains, "review"), [{ login: "alice", roles: ["product", "review"] }]);
  assert.deepEqual(humainsDuRole(humains, "client-contact"), []);
  assert.equal(direHumains(humains), "humans product alice, design bob, review alice");
  assert.equal(direHumains([]), "");
});

test("a project without `humans`, or without settings at all, loads with no error and an empty list", async (t) => {
  assert.deepEqual(await lireHumains(projet(t)), []);
  assert.deepEqual(await lireHumains(repertoireTemporaire(t)), []);
  assert.deepEqual(humainsDe(undefined), []);
  assert.deepEqual(humainsDe([]), []);
});

test("an unknown role, a duplicate login or an empty login is refused, naming the offending entry", async (t) => {
  const refus = async (humans: unknown, cle: string, message: RegExp) => {
    assert.throws(() => humainsDe(humans), (erreur: unknown) => erreur instanceof HumainsInvalides && erreur.cle === cle && message.test(erreur.message));
    // Le même refus, à la lecture des réglages du projet.
    await assert.rejects(lireHumains(projet(t, { humans })), (erreur: unknown) => erreur instanceof ReglageRefuse && erreur.cle === cle && message.test(erreur.message));
  };
  await refus([{ login: "alice", roles: ["review"] }, { login: "bob", roles: ["review", "owner"] }], "humans.1.roles", /`humans\.1` \("bob"\).*"owner" is not a role.*`product`, `design`, `review`, `client-contact`/);
  await refus([{ login: "alice", roles: ["review"] }, { login: "Alice", roles: ["design"] }], "humans.1.login", /`humans\.1` \("Alice"\).*already declared by `humans\.0`/);
  await refus([{ login: "", roles: ["review"] }], "humans.0.login", /`humans\.0`.*login is empty/);
  await refus([{ roles: ["review"] }], "humans.0.login", /`humans\.0`.*login is empty/);
  await refus([{ login: "not a login", roles: [] }], "humans.0.login", /is not a GitHub login/);
  await refus([{ login: "alice", roles: "review" }], "humans.0.roles", /must be a list/);
  await refus([{ login: "alice", roles: [], email: "a@b.c" }], "humans.0.email", /`email` is not part of a human/);
  await refus({ alice: ["review"] }, "humans", /must be a list/);
});

test("roles belong to the project: the same login carries its own roles in each project", async (t) => {
  const un = await lireHumains(projet(t, { humans: [{ login: "alice", roles: ["product"] }] }));
  const deux = await lireHumains(projet(t, { humans: [{ login: "alice", roles: ["review", "client-contact"] }] }));
  assert.deepEqual(un, [{ login: "alice", roles: ["product"] }]);
  assert.deepEqual(deux, [{ login: "alice", roles: ["review", "client-contact"] }]);
  assert.deepEqual(humainsDuRole(un, "review"), []);
  assert.deepEqual(humainsDuRole(deux, "review").map(({ login }) => login), ["alice"]);
});

test("the project settings keep `humans`: rewritten as they were", async (t) => {
  const humans = [{ login: "alice", roles: ["product", "review"] }];
  const clone = projet(t, { chef: "benomite", humans });
  ecrireReglagesProjet(clone, { integrationBranch: "main", chef: "benomite", humans: [{ login: "alice", roles: ["product", "review"] }] });
  assert.deepEqual(JSON.parse(readFileSync(join(clone, FICHIER), "utf8")).humans, humans);
  assert.deepEqual(await lireHumains(clone), humans);
});

// La cuisine d'un projet de la station, ouverte sur un clone dont la branche
// d'intégration porte ces réglages : ce qu'elle a dit en s'ouvrant.
function ouvrir(t: TestContext, reglages: Record<string, unknown>): string[] {
  const racine = repertoireTemporaire(t);
  projetSurGit(t, { reglages: JSON.stringify({ version: 1, integrationBranch: "v2", defaultCalibrations: { manager: { model: "opus", effort: "high" }, reviewer: { model: "sonnet", effort: "low" } }, ...reglages }), clone: join(racine, CLONES, "espace") });
  const [projet] = lireConfiguration("espace acme/espace").projets;
  assert.ok(projet);
  // Aucun test ne joint GitHub : ce `gh` n'existe pas.
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: join(racine, "gh-absent") });
  mkdirSync(env.BRIGADE_STATE_DIR ?? "", { recursive: true });
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "");
  journal.ajouter({ project: "espace", ticket: null, author: "chef", type: "decision.set", payload: { name: "BRIGADE_STATIONS", value: "box/claude:2:code", previous: null } });
  journal.fermer();
  const dits: string[] = [];
  const cuisine = ouvrirCuisine(env, { dire: (dit) => void dits.push(dit) });
  cuisine.arreter("fin du test");
  return dits;
}

test("the kitchen of a project, opening, says its humans role by role; without humans it says none", (t) => {
  const avec = ouvrir(t, { humans: [{ login: "alice", roles: ["product", "review"] }, { login: "bob", roles: ["review"] }] });
  assert.ok(avec.some((dit) => dit.startsWith("project settings — ") && dit.endsWith(", humans product alice, review alice bob")), avec.join("\n"));
  const sans = ouvrir(t, {});
  assert.ok(sans.some((dit) => dit.startsWith("project settings — ") && !dit.includes("humans")), sans.join("\n"));
});

test("humains.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
