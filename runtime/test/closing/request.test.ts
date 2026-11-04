// La demande de passe qui écrit, telle que le journal la porte : demandée une
// fois, elle se lit dans la file avec ce qui la retient, se retire par le même
// geste, et il n'y en a qu'une. Plus rien ne lance la passe elle-même (#2061) :
// les faits qu'elle écrivait — ses réglages, son départ — sont posés au journal.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { attentesDuChef, decrireAttentes } from "../../src/attend.ts";
import type { ReglagesDeFermeture } from "../../src/events/closing.ts";
import { lireRail } from "../../src/projections/rail.ts";
import { principal } from "../../src/closing/command.ts";
import { cuisine as cuisineDuProjet, PLAFONDS } from "../aides/cuisine.ts";
import { appeler, BASE, ENV_GIT } from "../outils.ts";

// Les réglages d'une passe : aucun cook en vol, et des plafonds qu'un closer
// qui retire une ligne n'atteint pas.
const REGLAGES_DE_FERMETURE: ReglagesDeFermeture = { calibration: { model: "sonnet", effort: "low" }, cooksBelow: 1, tokens: 1000, removedLines: 20 };

// Le runtime du projet tourne, sur un vrai dépôt, et son closer est réglé : ce
// que la passe notait au journal à son démarrage.
function cuisine(t: TestContext) {
  const lieu = cuisineDuProjet(t, { git: true });
  lieu.journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "closing.configured", payload: REGLAGES_DE_FERMETURE });
  const geste = async (args: string[]): Promise<{ code: number; sortie: string }> => {
    const appel = appeler(principal, args, { BRIGADE_STATE_DIR: lieu.repertoire });
    return { code: await appel.fin, sortie: appel.sortie() };
  };
  return {
    ...lieu,
    // Le geste du chef, depuis son propre process : `run fermeture -- ecrire`.
    demander: () => geste(["write"]),
    // Il y renonce : `run fermeture -- annuler`.
    annuler: () => geste(["cancel"]),
  };
}

type Cuisine = ReturnType<typeof cuisine>;

// Le bloc `attend` de l'état, tel que `run status` l'écrit.
function attend({ journal }: Cuisine): string {
  return decrireAttentes(attentesDuChef(journal.base, lireRail(journal.base)), () => "1 min").join("\n");
}

// Un ticket du rail, et son cook en vol que rien ne rend : il retient la demande.
function cookEnVol({ journal }: Cuisine, ticket: number): void {
  journal.ajouter({ project: "brigade", ticket, author: "github", type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: 5, createdAt: "2026-10-01T00:00:07Z", url: `https://exemple.test/${ticket}` } });
  journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.launched", payload: { run: `${ticket}-enVol`, limits: PLAFONDS, stream: `runs/${ticket}-enVol.jsonl` } });
}

test("une demande qui attend se lit dans la file : depuis quand, et ce qui la retient — combien de cooks en vol, pour quel seuil", async (t) => {
  const lieu = cuisine(t);
  cookEnVol(lieu, 7);

  assert.equal((await lieu.demander()).code, 0);
  const bloc = attend(lieu);
  assert.match(bloc, /^awaiting {3}1 decision awaits the chef — for 1 min\n/);
  assert.match(
    bloc,
    /\n {2}closing {2}for 1 min {2}closing pass requested on \d{4}-\d\d-\d\dT[\d:.]+Z, it waits — start condition not met: 1 cook in flight for a threshold of 1 — the pass leaves when there are fewer than the threshold, or when the rail is empty \(it carries 1 unserved ticket\); it leaves on its own, once, as soon as nothing holds it back, without anyone restarting it — to withdraw it with the `Cancel the cleanup` button in the closer section of the project's Cooks tab\n/,
  );

  // Et là où le chef observe.
  const observee = appeler(principal, [], { ...ENV_GIT, BRIGADE_REPO_DIR: lieu.clone, BRIGADE_BASE_BRANCH: BASE, BRIGADE_STATE_DIR: lieu.repertoire });
  assert.equal(await observee.fin, 0, observee.sortie());
  assert.match(observee.sortie(), /\npass {7}closing pass requested on [\d\-T:.]+Z, it waits — start condition not met: 1 cook in flight for a threshold of 1 /);
});

test("une seule demande à la fois : redemandée pendant qu'elle attend, rien n'est redemandé", async (t) => {
  const lieu = cuisine(t);
  cookEnVol(lieu, 7);

  assert.equal((await lieu.demander()).code, 0);
  const encore = await lieu.demander();
  assert.equal(encore.code, 0, encore.sortie);
  assert.match(encore.sortie, /^brigade : already requested, nothing is requested again — closing pass requested on \d{4}-\d\d-\d\dT[\d:.]+Z, it waits — start condition not met: 1 cook in flight for a threshold of 1/);
  assert.deepEqual(lieu.types().filter((type) => type === "closing.requested"), ["closing.requested"]);
});

test("le chef renonce à la demande par le même geste ; partie, elle ne se rappelle pas", async (t) => {
  const lieu = cuisine(t);
  const { journal, demander, annuler, types } = lieu;
  cookEnVol(lieu, 7);
  assert.equal((await demander()).code, 0);

  const retiree = await annuler();
  assert.equal(retiree.code, 0, retiree.sortie);
  assert.match(retiree.sortie, /^brigade : closing pass request of \d{4}-\d\d-\d\dT[\d:.]+Z withdrawn: nothing has left, and nothing will leave without another request\n$/);
  assert.ok(types().includes("closing.cancelled"));
  assert.doesNotMatch(attend(lieu), /closing/);
  assert.equal((await annuler()).sortie, "brigade : no closing pass is requested: nothing to cancel\n");

  // Redemandée, puis partie — ce que le journal d'avant porte : elle ne se retire plus.
  assert.equal((await demander()).code, 0);
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "closing.started", payload: { run: "fermeture-0a1b2c3d", base: "ba5e001", zone: [], held: [], candidates: 3, limits: { tokens: 1000, removedLines: 20 } } });
  const tard = await annuler();
  assert.equal(tard.code, 1);
  assert.match(tard.sortie, /^brigade : closing run fermeture-0a1b2c3d has left: it cannot be recalled — “stop” halts it/);
});
