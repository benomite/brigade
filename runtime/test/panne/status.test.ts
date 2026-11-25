// #4214 : `brigade <project> status` dit pourquoi la cuisine ne cuit pas, d'après le rail qu'il lit sur GitHub — au repos
// quand chaque ticket `fire` attend le chef ou un tiers, en panne avec sa cause et son action sinon.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEBUT, FIN } from "../../src/epique.ts";
import { lireLAttente } from "../../src/attente-du-rail/status.ts";
import { noterGitHubSeul } from "../../src/github-seul-etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as status } from "../../src/status.ts";
import { appeler, DEPOT, fauxGh, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-25T10:00:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-25T09:00:00Z", labels: labels.map((name) => ({ name })) });
const lireDe = (reponses: Record<string, unknown>) => async (chemin: string) => reponses[chemin] ?? (chemin.includes("/events?") || chemin.includes("/comments?") ? [] : assert.fail(`not dictated: ${chemin}`));
const pasLues = () => assert.fail("no station read");
const station = (stoppedAt: string | null) => async () => ({ lues: [{ name: "box", lastSeen: new Date(MAINTENANT - 30_000).toISOString(), stoppedAt, refreshMs: 120_000, selection: [DEPOT] }] });
const marque = (attente: Record<string, unknown>) => [{ body: `<!-- brigade:waiting ${JSON.stringify({ what: "x", followUp: "2026-11-26T00:00:00Z", ...attente })} -->`, author_association: "OWNER" }];

describe("la ligne `kitchen` de `status`", () => {
  test("espace : une décision et deux tickets en WAITING, rien en file — au repos, sans lire les stations", async () => {
    const feux = [issue(1, ["fire", "decision"]), issue(2, ["fire", "waiting"]), issue(3, ["fire", "waiting"]), issue(4, ["fire", "kitchen-board"]), issue(5, ["fire"], `${DEBUT}\n- [ ] #2\n${FIN}`)];
    const lue = await lireLAttente({ depot: DEPOT, lire: lireDe({ [FEUX]: feux, [`/repos/${DEPOT}/issues/2/comments?per_page=100`]: marque({ who: "the client" }) }), stations: pasLues, maintenant: MAINTENANT });
    assert.deepEqual(lue.cuisine, ["kitchen    idle: nothing to cook: 3 tickets wait on you or on a third party (1 open decision, 2 on hold)"]);
  });

  test("un ticket en file et la station arrêtée : en panne, avec le bouton qui la démarre", async () => {
    const lue = await lireLAttente({ depot: DEPOT, lire: lireDe({ [FEUX]: [issue(4, ["fire"])] }), stations: station("2026-11-25T09:59:50.000Z"), maintenant: MAINTENANT });
    assert.deepEqual(lue.cuisine, ["kitchen    fault: station box/claude is down, so no cook takes #4", "           button: Start it on its computer"]);
  });

  test("un ticket en file et la station en marche : rien à dire", async () => {
    assert.deepEqual((await lireLAttente({ depot: DEPOT, lire: lireDe({ [FEUX]: [issue(4, ["fire"])] }), stations: station(null), maintenant: MAINTENANT })).cuisine, []);
  });

  test("un cook tourne : rien à dire, et les stations ne se lisent pas", async () => {
    assert.deepEqual((await lireLAttente({ depot: DEPOT, lire: lireDe({ [FEUX]: [issue(3, ["fire", "taken"]), issue(4, ["fire"])] }), stations: pasLues, maintenant: MAINTENANT })).cuisine, []);
  });

  test("la réparation de main sur le rail : main rouge, que la cuisine répare", async () => {
    const lue = await lireLAttente({ depot: DEPOT, lire: lireDe({ [FEUX]: [issue(9, ["fire", "repair-main", "taken"])] }), stations: pasLues, maintenant: MAINTENANT });
    assert.deepEqual(lue.cuisine, ["kitchen    fault: the main branch is red, so no delivery merges", "           done: the kitchen repairs it on #9"]);
  });

  test("un ticket que la station a sorti de sa boucle de relances : la boucle, nommée", async () => {
    const reponses = { [FEUX]: [issue(6, ["fire", "waiting"]), issue(7, ["fire", "waiting"])], [`/repos/${DEPOT}/issues/7/comments?per_page=100`]: marque({ who: "the supervisor", whileSetAside: true }), [`/repos/${DEPOT}/issues/6/comments?per_page=100`]: marque({ who: "the client" }) };
    const lue = await lireLAttente({ depot: DEPOT, lire: lireDe(reponses), stations: pasLues, maintenant: MAINTENANT });
    assert.deepEqual(lue.cuisine, ["kitchen    fault: the kitchen relaunched #7 in a loop", "           done: the kitchen put #7 in WAITING, out of the loop"]);
  });

  test("GitHub qui limite la station : la file listée reste, la cuisine ne juge pas des stations illisibles", async () => {
    const lue = await lireLAttente({ depot: DEPOT, lire: lireDe({ [FEUX]: [issue(4, ["fire"])] }), stations: async () => ({ illisibles: "rate limited" }), maintenant: MAINTENANT, limite: { backAt: "2026-11-25T10:42:00.000Z" } });
    assert.deepEqual([lue.enFile, lue.cuisine], [[4], []]);
  });

  test("le rail illisible : aucune ligne `kitchen`, la ligne de l'attente dit pourquoi", async () => {
    const lue = await lireLAttente({ depot: DEPOT, lire: async () => { throw new Error("GitHub answered HTTP 502"); }, stations: pasLues, maintenant: MAINTENANT });
    assert.deepEqual(lue.cuisine, []);
    assert.match(lue.lignes[0] ?? "", /could not be read on GitHub/);
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
