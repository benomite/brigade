// Les commandes du chef — retirer un ticket du rail, commenter l'issue d'une
// carte — partent sur GitHub même quand la box retient la cuisine : plus de
// 2 500 appels dans l'heure, un quota au plus bas, une pause posée. Seul un refus
// de GitHub les arrête. Le compteur de la station est posé pour ce process,
// comme la station le pose au démarrage : ce fichier n'a que ces tests.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirGitHub } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { installerLimite, LimiteGitHubAtteinte, limiteDeLaStation } from "../src/limite-github.ts";
import { principal as pass } from "../src/montrer-pass.ts";
import { principal as montrerRail } from "../src/montrer-rail.ts";
import { lireRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "../src/rail.ts";
import { appeler, DEPOT, fauxGh, horloge, issueGitHub, JOUR_HORLOGE, repertoireTemporaire, temporaireDuFichier } from "./outils.ts";

const rienNeReste = temporaireDuFichier();

// Le compteur de la station, chargé : 2 600 appels dans l'heure, 40 restants
// sur 5 000 selon GitHub, et une pause qui court encore.
function stationChargee(t: TestContext) {
  const limite = limiteDeLaStation(repertoireTemporaire(t));
  t.after(() => limite.fermer());
  for (let i = 0; i < 2600; i++) limite.prendre("geste");
  limite.noter("gh", { restant: 40, plafond: 5000, reset: Date.now() + 30 * 60_000 });
  limite.suspendre(Date.now() + 10 * 60_000);
  installerLimite(limite);
  return limite;
}

test("rail remove et pass comment partent sur un compteur que la cuisine ne passe plus, et y sont comptés", async (t) => {
  const limite = stationChargee(t);
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:30:00.000Z`) });
  journal.ajouter({ project: "brigade", ticket: 18, author: "github", type: "ticket.arrived", payload: { title: "Ticket 18", priority: 5, createdAt: "2026-10-01T00:00:18Z", url: "https://exemple.test/18" } });
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/issues/18/labels/fire`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/issues/7`, { corps: { ...issueGitHub(7), body: "Le corps", user: { login: "chef" } } });
  gh.repondre(`repos/${DEPOT}/issues/7/comments`, { statut: 201, corps: { id: 1 } });
  const env = { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin };

  // La cuisine, elle, est retenue : rien ne part.
  const cuisine = ouvrirGitHub({ depot: DEPOT, bin: gh.bin });
  t.after(() => cuisine.fermer());
  await assert.rejects(cuisine.tickets(), LimiteGitHubAtteinte);
  assert.deepEqual(gh.appels(), []);

  const retrait = appeler(montrerRail, ["remove", "18"], env);
  assert.equal(await retrait.fin, 0, retrait.sortie());
  assert.match(retrait.sortie(), /^#18 removed from the rail — cost: /);
  assert.deepEqual(lireRail(journal.base), []);

  const commentaire = appeler(pass, ["7", "comment", "Le fournisseur répond lundi."], env);
  assert.equal(await commentaire.fin, 0, commentaire.sortie());
  assert.equal(JSON.parse(commentaire.sortie()).done, true);

  assert.deepEqual(
    gh.appels().map((appel) => appel.at(-1)),
    [`repos/${DEPOT}/issues/18/labels/fire`, `repos/${DEPOT}/issues/7`, `repos/${DEPOT}/issues/7/comments`],
  );
  assert.ok(!/budget GitHub épuisé/.test(retrait.sortie() + commentaire.sortie()));
  assert.equal(limite.appels(), 2603);
});

test("gestes-sans-retenue.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
