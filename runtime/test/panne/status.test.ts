// #4214 : `brigade <project> status` dit pourquoi la cuisine ne cuit pas, d'après le rail qu'il lit sur GitHub — au repos
// quand chaque ticket `fire` attend le chef ou un tiers, en panne avec sa cause et son action sinon.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { attenteEtRailDuStatus } from "../../src/attente-du-rail/status.ts";
import { DEBUT, FIN } from "../../src/epique.ts";
import { limitesDeLaStation } from "../../src/github-limite.ts";
import { noterGitHubSeul } from "../../src/github-seul-etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as status } from "../../src/status.ts";
import { appeler, DEPOT, fauxGh, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = Date.now();
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-25T09:00:00Z", labels: labels.map((name) => ({ name })) });
const marque = (attente: Record<string, unknown>) => [{ body: `<!-- brigade:waiting ${JSON.stringify({ what: "x", followUp: "2099-01-01T00:00:00Z", ...attente })} -->`, author_association: "OWNER" }];

// Le rail dicté au faux `gh` (chaque chemin d'issue répond vide sauf dicté), la station du compte quand elle est donnée, et
// ce que `status` en tire. `station` : son arrêt (ISO) ou null en marche, dictée au faux `gh` — qui rend ses en-têtes avec
// chaque réponse : les stations du compte ne s'y lisent jamais ; `stationsLues` dit si `status` les a demandées.
async function lire(t: TestContext, feux: unknown[], plus: Record<string, unknown> = {}, options: { station?: string | null; limite?: boolean } = {}) {
  const repertoire = repertoireTemporaire(t);
  const dossierStation = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  noterGitHubSeul(repertoire, { etat: "accepted" });
  if (options.limite === true) {
    const limites = limitesDeLaStation(dossierStation);
    limites.constater("compte", { sorte: "primary", depuis: MAINTENANT, reprise: MAINTENANT + 3_600_000 });
    limites.fermer();
  }
  const gh = fauxGh(t);
  gh.repondre(FEUX, { corps: feux });
  for (const { number } of feux as { number: number }[]) {
    gh.repondre(`/repos/${DEPOT}/issues/${number}/comments?per_page=100`, { corps: plus[`/repos/${DEPOT}/issues/${number}/comments?per_page=100`] ?? [] });
    gh.repondre(`/repos/${DEPOT}/issues/${number}/events?per_page=100`, { corps: [] });
  }
  if (options.station !== undefined) {
    const enregistrement = { brigade: "station-registration", format: 1, name: "box/claude", platform: "linux", machine: "box", version: "1", registeredAt: new Date(MAINTENANT - 86_400_000).toISOString(), lastSeen: new Date(MAINTENANT - 30_000).toISOString(), refreshMs: 120_000, stoppedAt: options.station };
    gh.repondre("/gists?per_page=100&page=1", { corps: [{ id: "g1", files: { "brigade-enregistrement.json": {} } }] });
    gh.repondre("/gists/g1", { corps: { owner: { login: "chef" }, files: { "brigade-enregistrement.json": { content: JSON.stringify(enregistrement) }, "brigade-selection.json": { content: JSON.stringify({ repositories: [DEPOT] }) } } } });
  }
  const lue = await attenteEtRailDuStatus({ BRIGADE_STATE_DIR: repertoire, BRIGADE_STATION_DIR: dossierStation, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin }, new Date(MAINTENANT), journal.base);
  return { ...lue, stationsLues: JSON.stringify(gh.appels()).includes("/gists") };
}

describe("la ligne `kitchen` de `status`", () => {
  test("espace : une décision et deux tickets parqués (`parked`, et `waiting` d'avant), rien en file — au repos, sans lire les stations", async (t) => {
    const feux = [issue(1, ["fire", "decision"]), issue(2, ["fire", "parked"]), issue(3, ["fire", "waiting"]), issue(4, ["fire", "kitchen-board"]), issue(5, ["fire"], `${DEBUT}\n- [ ] #2\n${FIN}`)];
    const lue = await lire(t, feux, { [`/repos/${DEPOT}/issues/2/comments?per_page=100`]: marque({ who: "the client" }) });
    assert.deepEqual([lue.cuisine, lue.stationsLues], [["kitchen    idle: nothing to cook: 3 tickets wait on you or on a third party (1 open decision, 2 on hold)"], false]);
  });

  test("un ticket en file : les stations se lisent ; illisibles, elles ne font aucune panne", async (t) => {
    const lue = await lire(t, [issue(4, ["fire"])], {}, { station: null });
    assert.deepEqual([lue.cuisine, lue.stationsLues], [[], true]);
  });

  test("un cook tourne : rien à dire, et les stations ne se lisent pas", async (t) => {
    const lue = await lire(t, [issue(3, ["fire", "taken"]), issue(4, ["fire"])], {}, { station: new Date(MAINTENANT - 10_000).toISOString() });
    assert.deepEqual([lue.cuisine, lue.stationsLues], [[], false]);
  });

  test("la réparation de main sur le rail : main rouge, que la cuisine répare", async (t) => {
    const lue = await lire(t, [issue(9, ["fire", "repair-main", "taken"])]);
    assert.deepEqual(lue.cuisine, ["kitchen    fault: the main branch is red, so no delivery merges", "           done: the kitchen repairs it on #9"]);
  });

  test("un ticket que la station a sorti de sa boucle de relances : la boucle, nommée", async (t) => {
    const plus = { [`/repos/${DEPOT}/issues/7/comments?per_page=100`]: marque({ who: "the supervisor", failures: true }), [`/repos/${DEPOT}/issues/6/comments?per_page=100`]: marque({ who: "the client" }) };
    const lue = await lire(t, [issue(6, ["fire", "parked"]), issue(7, ["fire", "parked"])], plus);
    assert.deepEqual(lue.cuisine, ["kitchen    fault: the kitchen relaunched #7 in a loop", "           done: the kitchen parked #7, out of the loop"]);
  });

  test("GitHub qui limite la station : la file listée reste, la cuisine ne juge pas des stations illisibles", async (t) => {
    const lue = await lire(t, [issue(4, ["fire"])], {}, { limite: true });
    assert.deepEqual([lue.enFile, lue.cuisine], [[4], []]);
  });

  test("`status` d'une station GitHub seul pose la ligne au-dessus de la ligne `rail`", async (t) => {
    const repertoire = repertoireTemporaire(t);
    ouvrirJournal(repertoire).fermer();
    noterGitHubSeul(repertoire, { etat: "accepted" });
    const gh = fauxGh(t);
    gh.repondre(FEUX, { corps: [issue(1, ["fire", "decision"]), issue(2, ["fire", "waiting"])] });
    gh.repondre(`/repos/${DEPOT}/issues/2/comments?per_page=100`, { corps: [] });
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    assert.equal(await commande.fin, 0);
    const lignes = commande.sortie().split("\n");
    const rang = lignes.indexOf("kitchen    idle: nothing to cook: 2 tickets wait on you or on a third party (1 open decision, 1 on hold)");
    assert.ok(rang !== -1, commande.sortie());
    assert.ok(lignes.findIndex((ligne) => ligne.startsWith("rail ")) > rang, commande.sortie());
  });
});
