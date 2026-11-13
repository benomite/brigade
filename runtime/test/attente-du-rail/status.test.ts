// Pourquoi la file du rail ne part pas, dans `brigade <project> status` (#3433) : la phrase au-dessus de la ligne `rail`, puis
// la ligne de chaque carte — les mêmes que l'app écrit (app/test/attente-du-rail/meme-ligne.test.ts les compare).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEBUT, FIN } from "../../src/epique.ts";
import { noterGitHubSeul } from "../../src/github-seul-etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { attenteDuRailDuStatus, avecLAttenteDuRail, lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { principal as status } from "../../src/status.ts";
import { appeler, DEPOT, fauxGh, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-12T10:00:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[], body = "") => ({ number, title: `#${number}`, body, created_at: "2026-11-12T09:00:00Z", labels: labels.map((name) => ({ name })) });
const evenements = (instant: string) => [{ event: "labeled", label: { name: "fire" }, created_at: instant }];
const lireDe = (reponses: Record<string, unknown>) => async (chemin: string) => reponses[chemin] ?? (chemin.includes("/events?") ? [] : assert.fail(`not dictated: ${chemin}`));
const aucune = async () => ({ lues: [] });
const enLigne = async () => ({ lues: [{ name: "box", lastSeen: new Date(MAINTENANT - 30_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] });

describe("les lignes de l'attente de la file", () => {
  test("le plafond de cooks atteint (dit par l'appelant) : la phrase de la raison 5, après les stations en ligne", async () => {
    const lignes = await lignesDeLAttente({ depot: DEPOT, lire: lireDe({ [FEUX]: [issue(4, ["fire"])] }), stations: enLigne, maintenant: MAINTENANT, plafondAtteint: true });
    assert.deepEqual(lignes, ["queue wait The station has reached its cook cap: a cook starts as soon as a place frees up. It resolves by itself."]);
  });

  test("des tickets en file, aucune station : la phrase de la raison 1, puis la ligne de chaque carte qui attend", async () => {
    const lignes = await lignesDeLAttente({ depot: DEPOT, lire: lireDe({ [FEUX]: [issue(4, ["fire"]), issue(5, ["fire"], "Depends on #4")] }), stations: aucune, maintenant: MAINTENANT });
    assert.deepEqual(lignes, ["queue wait No station serves this project, so no cook can start. Add the project to a station.", "  #5  after #4"]);
  });

  test("une station en ligne : l'attente normale, depuis l'instant où `fire` a été posé", async () => {
    const lignes = await lignesDeLAttente({
      depot: DEPOT,
      lire: lireDe({ [FEUX]: [issue(4, ["fire"])], [`/repos/${DEPOT}/issues/4/events?per_page=100`]: evenements("2026-11-12T09:58:00Z") }),
      stations: enLigne,
      maintenant: MAINTENANT,
    });
    assert.deepEqual(lignes, ["queue wait Normal wait: a cook takes the ticket within minutes (the oldest has waited 2 min). It resolves by itself."]);
  });

  test("un cook tourne : pas de phrase, les stations ne se lisent pas, la ligne d'une carte derrière lui se dit", async () => {
    const lignes = await lignesDeLAttente({ depot: DEPOT, lire: lireDe({ [FEUX]: [issue(3, ["fire", "taken"]), issue(4, ["fire"], "Depends on #3")] }), stations: () => assert.fail("no station read"), maintenant: MAINTENANT });
    assert.deepEqual(lignes, ["  #4  waiting for #3 to merge"]);
  });

  test("rien en file : aucune ligne ; un ticket mis de côté, en WAITING ou épique n'est pas en file", async () => {
    const epique = issue(7, ["fire"], `${DEBUT}\n- [ ] #8\n- [ ] #9\n${FIN}`);
    const feux = [issue(4, ["fire", "blocked-on-human"]), issue(5, ["fire", "waiting"]), epique, issue(6, ["fire", "kitchen-board"])];
    assert.deepEqual(await lignesDeLAttente({ depot: DEPOT, lire: lireDe({ [FEUX]: feux }), stations: () => assert.fail("no station read"), maintenant: MAINTENANT }), []);
  });

  test("des événements qui ne se lisent pas : la durée n'est pas dite, et la file reste lue", async () => {
    const lire = async (chemin: string) => {
      if (chemin === FEUX) return [issue(4, ["fire"])];
      throw new Error("GitHub answered HTTP 502");
    };
    assert.deepEqual(await lignesDeLAttente({ depot: DEPOT, lire, stations: enLigne, maintenant: MAINTENANT }), ["queue wait A cook takes the ticket within minutes. It resolves by itself."]);
  });

  test("GitHub qui ne rend pas le rail : la ligne dit qu'il n'a pas été vérifié, et pourquoi", async () => {
    const lignes = await lignesDeLAttente({ depot: DEPOT, lire: async () => { throw new Error("GitHub answered HTTP 502"); }, stations: aucune, maintenant: MAINTENANT });
    assert.deepEqual(lignes, [`queue wait not checked: the rail of ${DEPOT} could not be read on GitHub — GitHub answered HTTP 502`]);
  });

  test("les lignes se posent au-dessus de la ligne `rail`, à la fin sans elle, et rien ne change sans elles", () => {
    const photo = ["project    parade", "", "rail       2 queued", "  #4  queued"];
    assert.deepEqual(avecLAttenteDuRail(photo, ["queue wait x"]), ["project    parade", "", "queue wait x", "rail       2 queued", "  #4  queued"]);
    assert.deepEqual(avecLAttenteDuRail(["project    parade"], ["queue wait x"]), ["project    parade", "queue wait x"]);
    assert.deepEqual(avecLAttenteDuRail(photo, []), photo);
  });
});

describe("`status` d'une station GitHub seul", () => {
  test("la phrase vient au-dessus de la ligne `rail`, lue par le `gh` de la station", async (t) => {
    const repertoire = repertoireTemporaire(t);
    ouvrirJournal(repertoire).fermer();
    noterGitHubSeul(repertoire, { etat: "accepted" });
    const gh = fauxGh(t);
    gh.repondre(FEUX, { corps: [issue(4, ["fire"])] });
    gh.repondre(`/repos/${DEPOT}/issues/4/comments?per_page=100`, { corps: [] });
    gh.repondre(`/repos/${DEPOT}/issues/4/events?per_page=100`, { corps: evenements("2026-01-01T00:00:00Z") });
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    assert.equal(await commande.fin, 0);
    const lignes = commande.sortie().split("\n");
    const rang = lignes.findIndex((ligne) => ligne.startsWith("queue wait "));
    assert.ok(rang !== -1, commande.sortie());
    // Ce faux `gh` ne rend pas les gists du compte : aucune raison de station n'est devinée.
    assert.match(lignes[rang] ?? "", /^queue wait The wait is longer than usual: the oldest queued ticket has waited \d+ d and no reason is found\. It resolves by itself\.$/);
    assert.ok(lignes.findIndex((ligne) => ligne.startsWith("rail ")) > rang, commande.sortie());
  });

  test("hors d'une station GitHub seul, ou sans dépôt nommé : aucune ligne, et `gh` n'est pas appelé", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const journal = ouvrirJournal(repertoire);
    t.after(() => journal.fermer());
    const gh = fauxGh(t);
    assert.deepEqual(await attenteDuRailDuStatus({ BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin }, new Date(MAINTENANT), journal.base), []);
    noterGitHubSeul(repertoire, { etat: "accepted" });
    assert.deepEqual(await attenteDuRailDuStatus({ BRIGADE_STATE_DIR: repertoire, BRIGADE_GH_BIN: gh.bin }, new Date(MAINTENANT), journal.base), []);
    assert.deepEqual(gh.appels(), []);
  });
});
