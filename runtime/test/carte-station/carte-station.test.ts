// Jamais au chef une installation, un service à démarrer, une base de données
// (#3058) : le manager lit un tel geste dans le blocage d'un cook, la station ne
// pose aucune carte du ticket ; le serveur qu'un humain installe une fois a une
// seule carte par station. Les tests passent par la station (`stationDuDepot`),
// sur un faux GitHub, comme ceux du blocage au manager.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { MARQUE_DE_LA_CONSULTATION } from "../../src/blocage-au-manager.ts";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { lireLeGeste, MARQUE_CARTE_STATION, poserLaCarteDeLaStation } from "../../src/carte-station/carte-station.ts";
import type { GitHub } from "../../src/github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "../faux-github.ts";

const TICKETS = [75, 76, 77];
const QUESTION = "The app cannot reach its database, what do I do?";

// Le client du faux, avec la lecture des issues et la création d'issue de la station.
const clientDe = (faux: FauxGitHub): GitHub => {
  const bas = faux.pour("box");
  return { ...fauxClient(faux), issuesDepuis: bas.issuesDepuis, creerIssue: bas.creerIssue } as GitHub;
};

// Une station dont les cooks des `tickets` s'arrêtent bloqués, et dont le manager
// répond `geste` à chaque consultation. Un tour par ticket, `tours` fois.
async function bloque(t: TestContext, geste: string, { tickets = TICKETS, tours = tickets.length, issuesIllisibles = false }: { tickets?: number[]; tours?: number; issuesIllisibles?: boolean } = {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "carte-station-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  for (const numero of tickets) faux.feu(numero, ["fire", "model:opus", "effort:medium"], "## Context\n\nA ticket that needs the database.");
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args.some((arg) => arg.startsWith(MARQUE_DE_LA_CONSULTATION));
    const message = consulte ? JSON.stringify({ issue: "geste", geste }) : `I stopped.\n<livrable>\n<bloque>${QUESTION}</bloque>\n</livrable>`;
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertissements: string[] = [];
  const client = clientDe(faux);
  const github: GitHub = { ...client, issuesDepuis: async (instant) => (issuesIllisibles ? Promise.reject(new Error("HTTP 500")) : client.issuesDepuis(instant)) };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github, depot: depotNeuf(repertoire), manager: () => ({ model: "opus", effort: "high" }), flux: repertoire, lancer, avertir: (texte) => void avertissements.push(texte) });
  if ("refus" in station) throw new Error(station.refus);
  const tour = async () => {
    await station.tour();
    await station.calme();
  };
  for (let rang = 0; rang < tours; rang += 1) await tour();
  const cartes = () => [...faux.tickets.values()].filter((ticket) => ticket.corps.includes(MARQUE_CARTE_STATION));
  const commentairesDe = (numero: number) => (faux.commentaires.get(numero) ?? []).map((c) => c.body);
  return { faux, tour, cartes, commentairesDe, avertissements, labelDe: (numero: number) => faux.ticket(numero).labels };
}

for (const [genre, geste] of [
  ["a failed install", "Run `npm install` in the worktree, the dependencies are missing"],
  ["an unreachable local service", "Start the local redis service with `systemctl start redis`, it is not running"],
  ["a missing database", "Create the database `app_dev` with `createdb app_dev` then run the migrations"],
] as const) {
  test(`${genre}: no per-ticket gesture card for the chef, the ticket waits`, async (t) => {
    const { labelDe, commentairesDe } = await bloque(t, geste, { tickets: [75] });
    assert.equal(labelDe(75).has(A_LA_MAIN), false);
    assert.ok(commentairesDe(75).every((corps) => !corps.startsWith("**Gesture for the chef:**")), commentairesDe(75).join("\n"));
    assert.ok(commentairesDe(75).some((corps) => corps.startsWith("<!-- brigade:attente")));
  });
}

test("three tickets blocked by the same missing Postgres server on one station: exactly one card, naming the station and the prerequisite", async (t) => {
  const { cartes, labelDe, commentairesDe } = await bloque(t, "Install the PostgreSQL server on the station, then start it with `systemctl start postgresql`");
  const [carte, ...autres] = cartes();
  assert.deepEqual(autres, []);
  assert.ok(carte, "one card");
  assert.match(carte.corps, /Station `box`.*PostgreSQL server/);
  assert.match(carte.corps, /prerequis=postgres/);
  assert.match(carte.corps, /station=box/);
  assert.equal(carte.labels.has(A_LA_MAIN), true);
  for (const numero of TICKETS) {
    assert.equal(labelDe(numero).has(A_LA_MAIN), false, `#${numero} stays out of the chef's queue`);
    assert.ok(commentairesDe(numero).some((corps) => corps.includes(`single card is #${carte.number}`)), commentairesDe(numero).join("\n"));
  }
});

test("the same detection run again opens no second card for the same station and prerequisite", async (t) => {
  const { cartes, tour } = await bloque(t, "Install the PostgreSQL server on the station", { tickets: [75], tours: 1 });
  assert.equal(cartes().length, 1);
  // Même détection avec un autre processus de la station (rien en mémoire), sur les mêmes issues.
  const faux = new FauxGitHub();
  const deja = new Map<string, number>();
  const github = clientDe(faux);
  const premiere = await poserLaCarteDeLaStation({ github, deja }, "box", { cle: "postgres", nom: "PostgreSQL server" });
  const seconde = await poserLaCarteDeLaStation({ github, deja: new Map() }, "box", { cle: "postgres", nom: "PostgreSQL server" });
  assert.ok("ouverte" in premiere && premiere.ouverte);
  assert.deepEqual(seconde, { carte: (premiere as { carte: number }).carte, ouverte: false });
  assert.equal(faux.creations.length, 1);
  await tour();
  assert.equal(cartes().length, 1);
});

test("a station and a prerequisite each have their own card", async (t) => {
  const faux = new FauxGitHub();
  const github = clientDe(faux);
  const deja = new Map<string, number>();
  await poserLaCarteDeLaStation({ github, deja }, "box", { cle: "postgres", nom: "PostgreSQL server" });
  await poserLaCarteDeLaStation({ github, deja }, "autre", { cle: "postgres", nom: "PostgreSQL server" });
  await poserLaCarteDeLaStation({ github, deja }, "box", { cle: "redis", nom: "Redis server" });
  assert.equal(faux.creations.length, 3);
  t.diagnostic("three cards");
});

test("issues that cannot be read open no card: a duplicate is worse than a missing card, and the ticket still waits", async (t) => {
  const { cartes, labelDe, avertissements } = await bloque(t, "Install the PostgreSQL server on the station", { tickets: [75], issuesIllisibles: true });
  assert.equal(cartes().length, 0);
  assert.equal(labelDe(75).has(A_LA_MAIN), false);
  assert.ok(avertissements.some((a) => a.includes("could not be read to find the card")), avertissements.join("\n"));
});

test("other kinds of gesture cards are still created as before", async (t) => {
  const geste = "Run `gh auth refresh -s project` under the station's account";
  const { labelDe, commentairesDe, cartes } = await bloque(t, geste, { tickets: [75] });
  assert.equal(labelDe(75).has(A_LA_MAIN), true);
  assert.equal(commentairesDe(75).find((corps) => corps.startsWith("**Gesture for the chef:**"))?.split("\n")[0], `**Gesture for the chef:** ${geste}`);
  assert.equal(cartes().length, 0);
});

test("the gesture is read by its kind, and the server it names", () => {
  assert.deepEqual(lireLeGeste("Install the PostgreSQL server"), { sorte: "install", serveur: { cle: "postgres", nom: "PostgreSQL server" } });
  assert.deepEqual(lireLeGeste("Run `npm install`"), { sorte: "install", serveur: null });
  assert.deepEqual(lireLeGeste("Run `prisma migrate deploy`: the migrations are pending"), { sorte: "base", serveur: null });
  assert.equal(lireLeGeste("Install the Claude GitHub app on the repository"), null);
  assert.equal(lireLeGeste("Grant the station's account the `project` scope"), null);
});
