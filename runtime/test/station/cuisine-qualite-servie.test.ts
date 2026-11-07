// Le ticket de qualité mergé (#2804), par où la station démarre : `ouvrirCuisine`.
// La fenêtre des temps du clone porte encore les renvois que ce ticket a comptés ;
// le détecteur n'en ouvre pas un second. Sans lui, il en ouvre un.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { MARQUE_QUALITE, marqueDesComptes } from "../../src/alerte-qualite.ts";
import { marqueDuProjet } from "../../src/routage-temps-perdu.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { CLONES, environnementDuProjet, lireConfiguration } from "../../src/station/configuration.ts";
import { projetSurGit } from "../aides/projet-sur-git.ts";
import { DEPOT, FAUX_CLAUDE, fauxGh, issueGitHub, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();



// La correction du temps et la qualité lisent les tickets de la brigade elle-même.
const BRIGADE = "benomite/brigade";
const CHEMIN_TICKETS = `repos/${BRIGADE}/issues?state=all&since=`;

// Dix tickets mergés à dix minutes d'écart, les 4 premiers après un cook raté : 60 % du premier coup.
const temps = () =>
  Array.from({ length: 10 }, (_, rang) => ({
    ticket: rang + 1,
    mergedAt: new Date(Date.UTC(2026, 10, 7) + rang * 10 * 60_000).toISOString(),
    cuisson: 300, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0,
    perdu: { attente: 0, ratees: 0, renvois: 0 },
    qualite: { renvois: [], cooksRates: rang < 4 ? 1 : 0 },
  }));

// Une station neuve qui sert `brigade`, dont le clone porte ces temps ; `precedent` : un ticket de qualité déjà fermé, qui a compté ces tickets.
function ouvrir(t: TestContext, precedent: boolean) {
  const racine = repertoireTemporaire(t);
  const clone = join(racine, CLONES, "brigade");
  projetSurGit(t, { reglages: { integrationBranch: "v2" }, clone });
  writeFileSync(join(clone, ".claude", "brigade", "temps-tickets.json"), JSON.stringify(temps()));
  const [projet] = lireConfiguration(`brigade ${DEPOT}`).projets;
  assert.ok(projet);
  const gh = fauxGh(t);
  gh.issues([issueGitHub(7, { labels: ["fire", "model:sonnet", "effort:low"] })]);
  gh.repondre(`repos/${DEPOT}/issues/7/events?per_page=100`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/pulls?head=${DEPOT.split("/")[0]}:${brancheDuTicket(7)}&state=all&per_page=1`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/commits/v2/check-runs?per_page=100`, { corps: { check_runs: [] } });
  gh.repondre(`repos/${DEPOT}/commits/v2/status?per_page=100`, { corps: { statuses: [] } });
  // Le début de la fenêtre des tickets de qualité : minuit UTC, trente jours avant.
  const debut = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  debut.setUTCHours(0, 0, 0, 0);
  const merge = { ...issueGitHub(2800, { state: "closed" }), body: `${marqueDuProjet(DEPOT)}\n${MARQUE_QUALITE}\n${marqueDesComptes([1, 2, 3, 4])}`, author_association: "OWNER" };
  gh.repondre(`${CHEMIN_TICKETS}${debut.toISOString()}&per_page=100`, { corps: precedent ? [merge] : [] });
  const env = environnementDuProjet(racine, projet, { HOME: repertoireTemporaire(t), BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_SESSION_STATE: join(racine, "session", "renouvellement"), BRIGADE_GH_BIN: gh.bin });
  mkdirSync(env.BRIGADE_STATE_DIR ?? "", { recursive: true });
  const journal = ouvrirJournal(env.BRIGADE_STATE_DIR ?? "");
  const decisions = { BRIGADE_STATIONS: "box/claude:2:code", BRIGADE_MANAGER_MODEL: "sonnet", BRIGADE_MANAGER_EFFORT: "medium", BRIGADE_REVIEWER_MODEL: "sonnet", BRIGADE_REVIEWER_EFFORT: "medium" };
  for (const [name, value] of Object.entries(decisions)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  journal.fermer();
  const cuisine = ouvrirCuisine(env, { dire: () => {} });
  const lecturesDesTickets = () => gh.appels().filter((args) => args.at(-1)?.startsWith(CHEMIN_TICKETS)).length;
  const creations = () => gh.appels().filter((args) => args.includes("POST") && args.at(-1) === `repos/${BRIGADE}/issues`).length;
  const prises = () => gh.appels().filter((args) => args.includes("POST") && args.at(-1) === `repos/${DEPOT}/issues/7/comments`).length;
  return { cuisine, lecturesDesTickets, creations, prises };
}

for (const [precedent, attendu] of [[false, 1], [true, 0]] as const) {
  test(`the station's kitchen ${precedent ? "opens no second quality ticket while the window holds the send-backs the merged one counted" : "opens a quality ticket when the first-try rate is under the threshold"}`, async (t) => {
    const { cuisine, lecturesDesTickets, creations, prises } = ouvrir(t, precedent);
    try {
      await jusqua(() => lecturesDesTickets() > 0);
      // Le tour va au bout : la station a pris le ticket 7, sans rien ouvrir avant.
      if (precedent) await jusqua(() => prises() > 0);
      else await jusqua(() => creations() > 0);
      assert.equal(creations() >= 1 ? 1 : 0, attendu);
    } finally {
      cuisine.arreter("fin du test");
      await cuisine.arretee?.();
    }
  });
}

test("cuisine-qualite-servie.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);
