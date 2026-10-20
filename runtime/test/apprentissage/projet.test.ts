// Ce que les cooks ont appris, lu pour un projet : ses leçons, provisoires et promues, et ses
// profils (`apprentissage/projet.ts`) — puis par `facts`, le canal du runtime vers l'app.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { enregistrerRetro } from "../../src/apprentissage/provisoires.ts";
import { apprentissageDuProjet, LECONS_INJECTEES } from "../../src/apprentissage/projet.ts";
import { CARNET_PATH, saveCarnet } from "../../src/carnet/carnet.ts";
import { principal as faits } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { saveDefinition } from "../../src/profils/definition.ts";
import { appeler, faitInconnu, repertoireTemporaire } from "../outils.ts";

// Un projet : une leçon provisoire (L1, proposée par le ticket 21), une promue (L-001, du carnet), un profil.
function projet(t: TestContext, { garni = true } = {}) {
  const etat = repertoireTemporaire(t);
  const depot = repertoireTemporaire(t);
  const journal = ouvrirJournal(etat);
  t.after(() => { try { journal.fermer(); } catch {} });
  if (garni) {
    journal.ajouter({ project: "p", ticket: 21, author: "station", type: "cook.reported", payload: { run: "r21", ending: "done", reason: null, summary: "", deliverable: "", retro: "<retro>\npropose lancer les tests avant de commiter\n</retro>", branch: "cook/21", pr: null } });
    enregistrerRetro(journal, { projet: "p", ticket: 21, run: "r21", auteur: "pass" });
    saveCarnet(depot, { lessons: [
      { id: "L-001", text: "lire le CLAUDE.md d'abord", state: "promoted", entered: "2026-10-01", retros: ["#12", "#15"] },
      { id: "L-002", text: "sortie", state: "retired", entered: "2026-10-01", retros: ["#13"], exit: { date: "2026-10-05", reason: "manual" } },
    ] });
    saveDefinition(depot, { name: "app-src-vue", zone: "app/src/vue", perimeter: ["app/src/vue"], skills: [], accepted: "2026-10-19", tickets: [3, 4], notebook: { lessons: [{ id: "L-001", text: "peau mince", state: "promoted", entered: "2026-10-02", retros: ["#3"] }] } });
    // Deux cooks ont reçu la leçon provisoire, un seul (deux fois) la promue.
    for (const [run, lessons] of [["a", ["L1", "L-001"]], ["b", ["L1"]], ["a", ["L-001"]]] as const) journal.ajouter({ project: "p", ticket: null, author: "station", ...faitInconnu(LECONS_INJECTEES, { run, lessons }) });
  }
  return { etat, depot, journal };
}

describe("l'apprentissage d'un projet", () => {
  test("ses leçons portent date, tickets et cooks ; seule la promue porte l'adresse de sa ligne ; son profil porte domaine, carnet et tickets", (t) => {
    const { journal, depot } = projet(t);
    const { lecons, profils } = apprentissageDuProjet({ journal, projet: "p", repoDir: depot, depot: "benomite/brigade", branche: "v2" });

    const [provisoire, promue] = lecons;
    assert.equal(lecons.length, 2);
    assert.deepEqual({ ...provisoire, date: provisoire?.date.length }, { id: "L1", texte: "lancer les tests avant de commiter", statut: "provisoire", date: 10, tickets: [21], cooks: 2 });
    assert.equal("url" in (provisoire ?? {}), false);
    // Le carnet : titre, blanc, « ## L-001 », état, texte → la ligne du texte est la 6e.
    assert.deepEqual(promue, { id: "L-001", texte: "lire le CLAUDE.md d'abord", statut: "promue", date: "2026-10-01", tickets: [12, 15], cooks: 1, url: `https://github.com/benomite/brigade/blob/v2/${CARNET_PATH}#L5` });
    assert.deepEqual(profils, [{ nom: "app-src-vue", domaine: "app/src/vue", carnet: [{ id: "L-001", texte: "peau mince", etat: "promoted" }], tickets: [3, 4] }]);
  });

  test("sans dépôt connu, la promue n'a pas d'adresse", (t) => {
    const { journal, depot } = projet(t);
    assert.equal("url" in (apprentissageDuProjet({ journal, projet: "p", repoDir: depot }).lecons[1] ?? {}), false);
  });

  test("un projet sans leçon ni profil rend deux listes vides, sans erreur", (t) => {
    const { journal, depot } = projet(t, { garni: false });
    assert.deepEqual(apprentissageDuProjet({ journal, projet: "p", repoDir: depot, depot: "benomite/brigade", branche: "v2" }), { lecons: [], profils: [] });
    assert.deepEqual(apprentissageDuProjet({ journal, projet: "p" }), { lecons: [], profils: [] });
  });

  test("les leçons d'un autre projet de la même base n'en sont pas", (t) => {
    const { journal } = projet(t);
    assert.deepEqual(apprentissageDuProjet({ journal, projet: "autre" }), { lecons: [], profils: [] });
  });
});

describe("par `facts`, le canal du runtime vers l'app", () => {
  test("`apprentissage` porte les leçons et les profils ; il est absent quand il n'y a rien", async (t) => {
    const { etat, depot, journal } = projet(t);
    journal.fermer();
    const env = { BRIGADE_STATE_DIR: etat, BRIGADE_PROJECT: "p", BRIGADE_REPO_DIR: depot, BRIGADE_GITHUB_REPO: "benomite/brigade", BRIGADE_BASE_BRANCH: "v2" };
    const lancee = appeler(faits, [], env);
    assert.equal(await lancee.fin, 0);
    const forme = JSON.parse(lancee.sortie().split("\n")[0] ?? "");
    assert.deepEqual(forme.apprentissage.lecons.map((l: { id: string }) => l.id), ["L1", "L-001"]);
    assert.equal(forme.apprentissage.lecons[1].url, `https://github.com/benomite/brigade/blob/v2/${CARNET_PATH}#L5`);
    assert.equal(forme.apprentissage.profils[0].domaine, "app/src/vue");

    const vide = projet(t, { garni: false });
    vide.journal.fermer();
    const sans = appeler(faits, [], { ...env, BRIGADE_STATE_DIR: vide.etat, BRIGADE_REPO_DIR: vide.depot });
    assert.equal(await sans.fin, 0);
    assert.equal("apprentissage" in JSON.parse(sans.sortie().split("\n")[0] ?? ""), false);
  });

  test("un carnet illisible ne fait pas taire les faits", async (t) => {
    const { etat, depot, journal } = projet(t);
    journal.fermer();
    mkdirSync(join(depot, ".claude/brigade"), { recursive: true });
    writeFileSync(join(depot, CARNET_PATH), "n'importe quoi\n");
    const lancee = appeler(faits, [], { BRIGADE_STATE_DIR: etat, BRIGADE_PROJECT: "p", BRIGADE_REPO_DIR: depot });
    assert.equal(await lancee.fin, 0);
    assert.equal("apprentissage" in JSON.parse(lancee.sortie().split("\n")[0] ?? ""), false);
  });
});
