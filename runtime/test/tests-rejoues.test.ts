// Les tests verts seulement au rejeu de la CI (#2091) : lus du journal, comptés
// sur les derniers merges, et montrés par `measures`. Le journal est écrit à la
// main : aucune cuisine ne tourne ici.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Check } from "../src/events/pass.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { principal as mesures } from "../src/montrer-mesures.ts";
import { decrireRejeux, lireRejeux, MERGES_PAR_DEFAUT, mesurerRejeux } from "../src/tests-rejoues.ts";
import { appeler, horloge, repertoireTemporaire } from "./outils.ts";

const job = (nom: string, outcome: Check["outcome"]): Check => ({ name: nom, outcome, conclusion: outcome === "red" ? "failure" : "success", url: `https://github.com/acme/brigade/actions/runs/1/job/${nom.length}` });

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number) => journal.ajouter({ project: "brigade", ticket, author: "runtime", ...fait });
  // Une relance verte sur ce ticket : ses tests rejoués, ou aucun nommé.
  const rejouer = (ticket: number, tests: string[], nom = "tests (2/4)") =>
    noter({ type: "pass.ci-rerun-passed", payload: { sha: `sha-${ticket}`, before: [job(nom, "red")], checks: [job(nom, "green")], tests } }, ticket);
  const merger = (ticket: number) => noter({ type: "merge.done", payload: { pr: `https://exemple.test/pull/${ticket}`, sha: `sha-${ticket}`, by: "pass", reconciled: false } }, ticket);
  return { repertoire, journal, rejouer, merger };
}

test("chaque test vert seulement au rejeu est compté sur les 10 derniers merges, avec ses tickets ; un job qui ne nommait aucun test compte sous son nom", (t) => {
  const { journal, rejouer, merger } = cuisine(t);
  // Un merge plus ancien que les 10 derniers : sa relance verte ne compte plus.
  rejouer(1, ["la commande manager"]);
  merger(1);
  for (let ticket = 2; ticket <= 11; ticket++) {
    if (ticket === 3) rejouer(3, ["la commande manager", "la cuisine reprise après le renommage"]);
    // Deux relances vertes sur le même ticket, avant son merge : deux fois.
    if (ticket === 5) {
      rejouer(5, ["la commande manager"]);
      rejouer(5, ["la commande manager"]);
    }
    if (ticket === 8) rejouer(8, [], "runtime-windows");
    merger(ticket);
  }
  // Pas encore mergé : ne compte pas.
  rejouer(12, ["la commande manager"]);

  const rejeux = mesurerRejeux(lireRejeux(journal.base));
  assert.deepEqual(rejeux, {
    n: MERGES_PAR_DEFAUT,
    merges: 10,
    rejeux: 4,
    tests: [
      { test: "“la commande manager”", fois: 3, tickets: [3, 5] },
      { test: "“la cuisine reprise après le renommage”", fois: 1, tickets: [3] },
      { test: "job “runtime-windows” (no test named)", fois: 1, tickets: [8] },
    ],
  });
  assert.deepEqual(decrireRejeux(rejeux), [
    "flaky      tests green only on the CI rerun over the last 10 merges: 4 reruns passed — each test, how many times, and its tickets",
    "           “la commande manager”: 3 times — #3, #5",
    "           “la cuisine reprise après le renommage”: 1 time — #3",
    "           job “runtime-windows” (no test named): 1 time — #8",
  ]);
});

test("sans relance verte, ou sans merge, la ligne le dit", (t) => {
  const { journal, merger } = cuisine(t);
  assert.deepEqual(decrireRejeux(mesurerRejeux(lireRejeux(journal.base))), ["flaky      no merge in the log: nothing to count (N = 10)"]);
  merger(1);
  assert.deepEqual(decrireRejeux(mesurerRejeux(lireRejeux(journal.base))), ["flaky      no test green only on the CI rerun over the last 1 merge"]);
});

test("`measures` montre les tests verts seulement au rejeu, après les ratages", async (t) => {
  const { repertoire, rejouer, merger } = cuisine(t);
  rejouer(7, ["la commande manager"]);
  merger(7);
  const commande = appeler(mesures, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.match(commande.sortie(), /\n\nfailures [^\n]*\n(?: {11}[^\n]*\n)*\nflaky {6}tests green only on the CI rerun over the last 1 merge: 1 rerun passed[^\n]*\n {11}“la commande manager”: 1 time — #7\n/);
});
