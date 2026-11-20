// Le rail bloqué dans `brigade <project> status` (#3358) : sa ligne vient sous la tête du bloc `awaiting` — la file du
// second —, la même que l'app écrit (app/test/rail-bloque/meme-ligne.test.ts les compare).
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../../src/evenements.ts";
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

// La cuisine retenue (#3601). Le 2026-11-15, le disjoncteur de Secondes, ouvert à 07:47 après trois échecs, tenait la
// cuisine ; à 17:06, six tickets sur le rail, la file du second disait « nothing awaits the chef » et la ligne du rail
// bloqué, que le manager ne prenait rien — et le second conseillait d'arrêter et de rouvrir la cuisine.
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const SIX = [40, 41, 42, 43, 44, 45];
const ilYA = (heures: number) => new Date(Date.now() - heures * 3_600_000);

// Une station GitHub seul dont le journal s'écrit à l'heure dite, et son `gh` qui rend les tickets `fire` non pris.
function stationGitHubSeul(t: TestContext, tickets: number[]) {
  const repertoire = repertoireTemporaire(t);
  let instant = ilYA(10);
  const journal = ouvrirJournal(repertoire, { maintenant: () => instant });
  noterGitHubSeul(repertoire, { etat: "accepted" });
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => journal.ajouter({ project: "secondes", ticket, author, ...fait });
  const a = (heures: number) => {
    instant = ilYA(heures);
  };
  const gh = fauxGh(t);
  gh.repondre(FEUX, { corps: tickets.map((numero) => issue(numero, ["fire"])) });
  for (const numero of tickets) {
    gh.repondre(`/repos/${DEPOT}/issues/${numero}/comments?per_page=100`, { corps: [] });
    gh.repondre(`/repos/${DEPOT}/issues/${numero}/events?per_page=100`, { corps: [{ event: "labeled", label: { name: "fire" }, created_at: ilYA(1.2).toISOString() }] });
  }
  const statuer = async () => {
    journal.fermer();
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin });
    assert.equal(await commande.fin, 0);
    return commande.sortie();
  };
  return { noter, a, statuer };
}

const ligneDuRail = (sortie: string) => sortie.split("\n").find((ligne) => ligne.startsWith("  STUCK RAIL  ")) ?? assert.fail(sortie);
const bloc = (sortie: string) => {
  const lignes = sortie.split("\n");
  const tete = lignes.findIndex((ligne) => ligne.startsWith("awaiting "));
  return lignes.slice(tete, lignes.indexOf("end awaiting", tete) + 1);
};

// Trois cooks qui échouent d'affilée, puis le disjoncteur qui s'ouvre.
function ouvrirLeDisjoncteur(noter: (fait: Fait, ticket?: number | null) => unknown, a: (heures: number) => void) {
  a(10);
  noter({ type: "guard.configured", payload: { limits: LIMITES, breakerThreshold: 3 } });
  for (const [i, ticket] of [37, 38, 39].entries()) {
    a(9.6 - i * 0.1);
    noter({ type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl` } }, ticket);
    noter({ type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "failed", code: 1, signal: null, turns: 4 + i, tokens: 1000 * (i + 1), durationMs: 1000 } }, ticket);
  }
  a(9.3);
  noter({ type: "breaker.opened", payload: { failures: 3, threshold: 3 } });
}

describe("la cuisine retenue (#3601)", () => {
  test("le 2026-11-15 : disjoncteur ouvert après 3 échecs, 6 tickets sur le rail — la file nomme le disjoncteur, un échec par ligne, et le seul geste qui le lève", async (t) => {
    const { noter, a, statuer } = stationGitHubSeul(t, SIX);
    ouvrirLeDisjoncteur(noter, a);
    a(9.2);
    noter({ type: "kitchen.held", payload: { since: ilYA(9.3).toISOString(), tickets: SIX, cause: { kind: "breaker", since: ilYA(9.3).toISOString() }, gesture: "the supervisor re-runs the check that tripped the breaker and closes it by itself — nothing to do", change: false } });
    // Le redémarrage de 17:04 : la retenue levée, faute de ticket vu, le disjoncteur toujours ouvert.
    a(0.05);
    noter({ type: "kitchen.hold-lifted", payload: { since: ilYA(9.3).toISOString(), reason: "nothing-waits" } });
    const sortie = await statuer();
    const awaiting = bloc(sortie);

    assert.doesNotMatch(sortie, /nothing awaits the chef/);
    const entree = awaiting.findIndex((ligne) => ligne.startsWith("  breaker  for "));
    assert.ok(entree !== -1, awaiting.join("\n"));
    assert.match(awaiting[entree] ?? "", /breaker open: 3 failures in a row \(threshold 3\) — no cook leaves any more — nothing to do: the supervisor re-runs the check that tripped it and closes it by itself$/);
    assert.deepEqual(awaiting.slice(entree + 1, entree + 4), ["    #37: exit 1, 4 turns, 1000 tokens", "    #38: exit 1, 5 turns, 2000 tokens", "    #39: exit 1, 6 turns, 3000 tokens"]);

    const rail = ligneDuRail(sortie);
    assert.match(rail, /^ {2}STUCK RAIL {2}6 tickets on the rail, none taken for 1 h: the kitchen is held, cause breaker — its breaker has been open since \d\d:\d\d UTC, after 3 failures in a row, no cook leaves\. To lift it: the supervisor re-runs the check that tripped the breaker and closes it by itself — nothing to do\.$/);
    assert.doesNotMatch(rail, /manager/);
    // Ni la file ni la ligne ne conseillent d'arrêter puis de rouvrir la cuisine : le seul geste est celui qui lève le disjoncteur.
    // La ligne du rail bloqué est dans le bloc, sous sa tête.
    assert.equal(awaiting[1], rail);
    const lu = awaiting.join("\n");
    assert.doesNotMatch(lu, /\bstop\b|reopen|re-open|restart|resume the kitchen/i);
    assert.deepEqual(lu.match(/to (do|lift it): [^.\n]*/gi), ["To lift it: the supervisor re-runs the check that tripped the breaker and closes it by itself — nothing to do", "to do: the supervisor re-runs the check that tripped it and closes it by itself"]);
  });

  test("cause `breaker` : la ligne du rail bloqué nomme le disjoncteur que le `kitchen.held` du journal tient, et non le manager", async (t) => {
    const { noter, a, statuer } = stationGitHubSeul(t, SIX);
    a(2);
    noter({ type: "kitchen.held", payload: { since: ilYA(2).toISOString(), tickets: SIX, cause: { kind: "breaker", since: ilYA(2).toISOString(), station: "box/claude" }, gesture: "the supervisor re-runs the check that tripped the breaker and closes it by itself — nothing to do", change: false } });
    assert.match(ligneDuRail(await statuer()), /^ {2}STUCK RAIL {2}6 tickets on the rail, none taken for 1 h: the kitchen is held, cause breaker — the breaker of station box\/claude has been open since \d\d:\d\d UTC, no cook leaves\. To lift it: the supervisor re-runs the check that tripped the breaker and closes it by itself — nothing to do\.$/);
  });

  test("cause `stop` : la ligne du rail bloqué nomme le « stop » du chef, et le geste qui reprend la cuisine", async (t) => {
    const { noter, a, statuer } = stationGitHubSeul(t, SIX);
    a(2);
    noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
    const rail = ligneDuRail(await statuer());
    assert.match(rail, /^ {2}STUCK RAIL {2}6 tickets on the rail, none taken for 1 h: the kitchen is held, cause stop — the chef stopped it at \d\d:\d\d UTC, no cook leaves\. To resume it: the `resume the kitchen` button on the `Kitchen` line of the project's Settings\.$/);
    assert.doesNotMatch(rail, /manager/);
  });

  test("cause du `kitchen.held` en cours (`github-limit`) : la ligne du rail bloqué la nomme du même mot que le journal", async (t) => {
    const { noter, a, statuer } = stationGitHubSeul(t, SIX);
    a(2);
    noter({ type: "kitchen.held", payload: { since: ilYA(2).toISOString(), tickets: SIX, cause: { kind: "github-limit", limit: null, backAt: ilYA(-1).toISOString() }, gesture: null, change: false } });
    const rail = ligneDuRail(await statuer());
    assert.match(rail, /^ {2}STUCK RAIL {2}6 tickets on the rail, none taken for 1 h: the kitchen is held, cause github-limit — GitHub is rate-limiting calls \(limit reached\), back around \d\d:\d\d\.$/);
    assert.doesNotMatch(rail, /manager/);
  });

  test("un journal qui ne se lit pas : la ligne le dit, sans tenir la cuisine pour ouverte ni retenue", async () => {
    const lignes = await lignesDuRailBloque({
      depot: DEPOT,
      lire: lireDe({ [FEUX]: [issue(4, ["fire"])] }),
      stations: async () => ({ illisibles: "no answer in 5 s" }),
      maintenant: MAINTENANT,
      cuisine: () => {
        throw new Error("no such table: guard_state");
      },
    });
    assert.deepEqual(lignes, ["  STUCK RAIL  1 ticket on the rail, no manager has taken it for 14 h: the cause is not known: your stations could not be read. The kitchen's state could not be read from its journal: no such table: guard_state."]);
  });
});
