// Le rail bloqué dans `brigade <project> status` (#3358) : sa ligne vient sous la tête du bloc `awaiting` — la file du
// second —, la même que l'app écrit (app/test/rail-bloque/meme-ligne.test.ts les compare).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { noterGitHubSeul } from "../../src/github-seul-etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { avecLeRailBloque, lignesDuRailBloque } from "../../src/rail-bloque/status.ts";
import { principal as status } from "../../src/status.ts";
import { appeler, DEPOT, fauxGh, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-12T02:30:00.000Z");
const FEUX = `/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
const issue = (number: number, labels: string[]) => ({ number, title: `#${number}`, body: "", created_at: "2026-11-11T12:25:00Z", labels: labels.map((name) => ({ name })) });
const lireDe = (reponses: Record<string, unknown>) => async (chemin: string) => (chemin.endsWith("/comments?per_page=100") || chemin.endsWith("/events?per_page=100") ? (reponses[chemin] ?? []) : (reponses[chemin] ?? assert.fail(`not dictated: ${chemin}`)));
const aucune = async () => ({ lues: [] });

describe("les lignes du rail bloqué", () => {
  test("des tickets non pris au-delà du délai : une ligne, sous le titre STUCK RAIL", async () => {
    const lignes = await lignesDuRailBloque({ depot: DEPOT, lire: lireDe({ [FEUX]: [issue(4, ["fire"]), issue(5, ["fire"])] }), stations: aucune, maintenant: MAINTENANT });
    assert.deepEqual(lignes, ["  STUCK RAIL  2 tickets on the rail, no manager has taken them for 14 h: no station serves this project. Add the project to a station."]);
  });

  test("aucun ticket non pris : aucune ligne, et les stations ne se lisent pas", async () => {
    const lignes = await lignesDuRailBloque({ depot: DEPOT, lire: lireDe({ [FEUX]: [issue(4, ["fire", "model:opus", "effort:medium"])] }), stations: () => assert.fail("no station read"), maintenant: MAINTENANT });
    assert.deepEqual(lignes, []);
  });

  test("GitHub qui ne rend pas les tickets : la ligne dit qu'ils n'ont pas été vérifiés, et pourquoi", async () => {
    const lignes = await lignesDuRailBloque({ depot: DEPOT, lire: async () => { throw new Error("GitHub answered HTTP 502"); }, stations: aucune, maintenant: MAINTENANT });
    assert.deepEqual(lignes, [`  STUCK RAIL  not checked: the \`fire\` tickets of ${DEPOT} could not be read on GitHub — GitHub answered HTTP 502`]);
  });

  test("la ligne se pose sous la tête du bloc `awaiting`, à la fin sans bloc, et rien ne change sans elle", () => {
    const photo = ["project    parade", "", "awaiting   nothing awaits the chef", "end awaiting", "", "rail       0 on the rail"];
    assert.deepEqual(avecLeRailBloque(photo, ["  STUCK RAIL  x"]), ["project    parade", "", "awaiting   nothing awaits the chef", "  STUCK RAIL  x", "end awaiting", "", "rail       0 on the rail"]);
    assert.deepEqual(avecLeRailBloque(["project    parade"], ["  STUCK RAIL  x"]), ["project    parade", "  STUCK RAIL  x"]);
    assert.deepEqual(avecLeRailBloque(photo, []), photo);
  });
});

describe("`status` d'une station GitHub seul", () => {
  test("ses tickets `fire` non pris se lisent par son `gh`, et la ligne vient sous la tête du bloc `awaiting`", async (t) => {
    const repertoire = repertoireTemporaire(t);
    ouvrirJournal(repertoire).fermer();
    noterGitHubSeul(repertoire, { etat: "accepted" });
    const gh = fauxGh(t);
    gh.repondre(FEUX, { corps: [issue(4, ["fire"])] });
    gh.repondre(`/repos/${DEPOT}/issues/4/comments?per_page=100`, { corps: [] });
    gh.repondre(`/repos/${DEPOT}/issues/4/events?per_page=100`, { corps: [{ event: "labeled", label: { name: "fire" }, created_at: "2026-01-01T00:00:00Z" }] });
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    assert.equal(await commande.fin, 0);
    const lignes = commande.sortie().split("\n");
    const tete = lignes.findIndex((ligne) => ligne.startsWith("awaiting "));
    assert.ok(tete !== -1, commande.sortie());
    // Ce faux `gh` ne rend pas les gists du compte : la cause n'est pas devinée.
    assert.match(lignes[tete + 1] ?? "", /^ {2}STUCK RAIL {2}1 ticket on the rail, no manager has taken it for \d+ d: the cause is not known: your stations could not be read\.$/);
  });

  test("hors d'une station GitHub seul, ou sans dépôt nommé : aucune ligne, et `gh` n'est pas appelé", async (t) => {
    const repertoire = repertoireTemporaire(t);
    ouvrirJournal(repertoire).fermer();
    const gh = fauxGh(t);
    const sans = appeler(status, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    assert.equal(await sans.fin, 0);
    noterGitHubSeul(repertoire, { etat: "accepted" });
    const sansDepot = appeler(status, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GH_BIN: gh.bin });
    assert.equal(await sansDepot.fin, 0);
    assert.doesNotMatch(sans.sortie() + sansDepot.sortie(), /STUCK RAIL/);
    assert.deepEqual(gh.appels(), []);
  });
});
