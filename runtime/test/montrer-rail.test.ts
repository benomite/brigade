// La commande par laquelle le chef lit le rail : `npm run rail`.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { openLog } from "../src/log.ts";
import { principal as montrerRail } from "../src/montrer-rail.ts";
import { lireRail, ticketDuRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "../src/rail.ts";
import { appeler, DEPOT, fauxGh, horloge, issueGitHub, lancer, repertoireTemporaire, JOUR_HORLOGE } from "./outils.ts";

const MONTRER = join(import.meta.dirname, "../src/montrer-rail.ts");

test("le rail se lit ticket par ticket, dans l'ordre de service, chacun avec son état", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const log = openLog(repertoire, { maintenant: horloge() });
  t.after(() => log.fermer());
  const rail = ouvrirRail(log, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:30:00.000Z`) });
  for (const [ticket, priority] of [[14, 1], [15, 1], [16, 2], [17, 2], [18, null]] as const) {
    log.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `Ticket ${ticket}`, priority, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}` },
    });
  }
  rail.prendre("box/claude-opus");
  rail.prendre("box/claude-sonnet");
  rail.envoyerEnPass(15, "box/claude-sonnet");
  rail.prendre("mac/claude");
  rail.envoyerEnPass(16, "mac/claude");
  rail.servir(16);
  rail.quatreVingtSix(17, { motif: "quota", retour: new Date(`${JOUR_HORLOGE}T15:00:00.000Z`) });

  const commande = lancer(t, MONTRER, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.deepEqual(commande.sortie().trimEnd().split("\n"), [
    `#14  taken  prio:1  by box/claude-opus since ${JOUR_HORLOGE}T10:00:05.000Z, last progress ${JOUR_HORLOGE}T10:00:05.000Z, lease until ${JOUR_HORLOGE}T10:40:00.000Z  Ticket 14`,
    `#15  in pass  prio:1  since ${JOUR_HORLOGE}T10:00:07.000Z, cooked by box/claude-sonnet  Ticket 15`,
    `#16  served  prio:2  since ${JOUR_HORLOGE}T10:00:10.000Z, cooked by mac/claude  Ticket 16`,
    `#17  86  prio:2  since ${JOUR_HORLOGE}T10:00:11.000Z (quota), back at ${JOUR_HORLOGE}T15:00:00.000Z  Ticket 17`,
    `#18  queued  -  since ${JOUR_HORLOGE}T10:00:04.000Z  Ticket 18`,
  ]);
});

test("sous chaque ticket qui en porte une, sa fiche : ce qu'il attend, sa zone, et ce que le runtime n'y comprend pas", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const log = openLog(repertoire, { maintenant: horloge() });
  t.after(() => log.fermer());
  const cards = {
    14: { waitsFor: [12, 13], zone: ["runtime/src/rail.ts", "docs/"], problems: [] },
    15: { waitsFor: [], zone: [], problems: [] },
    16: { waitsFor: [14], zone: [], problems: ["clé inconnue « budget » — connues : attend, zone", "zone: « /etc » n'est pas un chemin du dépôt"] },
    17: null,
  };
  for (const [ticket, card] of Object.entries(cards)) {
    const payload = { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card };
    log.ajouter({ project: "brigade", ticket: Number(ticket), author: "github", type: "ticket.arrived", payload });
  }

  const commande = appeler(montrerRail, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.deepEqual(commande.sortie().trimEnd().split("\n"), [
    `#14  queued  -  awaiting #12, #13 — since ${JOUR_HORLOGE}T10:00:00.000Z  Ticket 14`,
    "     card — awaiting: #12, #13 · zone: runtime/src/rail.ts, docs/",
    `#15  queued  -  since ${JOUR_HORLOGE}T10:00:01.000Z  Ticket 15`,
    "     card — awaiting: nothing · zone: none",
    `#16  queued  -  awaiting #14 — since ${JOUR_HORLOGE}T10:00:02.000Z  Ticket 16`,
    "     card — awaiting: #14 · zone: none",
    "     UNREADABLE CARD — clé inconnue « budget » — connues : attend, zone",
    "     UNREADABLE CARD — zone: « /etc » n'est pas un chemin du dépôt",
    `#17  queued  -  since ${JOUR_HORLOGE}T10:00:03.000Z  Ticket 17`,
  ]);
});

test("un ticket retenu dit pourquoi : ce qu'il attend encore, ou l'abandon qui le bloque — jamais un ticket déjà servi", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const log = openLog(repertoire, { maintenant: horloge() });
  t.after(() => log.fermer());
  const rail = ouvrirRail(log, { projet: "brigade", dureeBailMs: 600_000 });
  const arriver = (ticket: number, waitsFor: number[]) =>
    log.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: {
        title: `Ticket ${ticket}`,
        priority: null,
        createdAt: `2026-10-01T00:00:${ticket}Z`,
        url: `https://exemple.test/${ticket}`,
        card: waitsFor.length === 0 ? null : { waitsFor, zone: [], problems: [] },
      },
    });
  for (const ticket of [11, 12, 13]) arriver(ticket, []);
  arriver(14, [11, 12]);
  arriver(15, [11, 12, 13]);
  arriver(16, [11]);
  rail.prendre("box/claude");
  rail.envoyerEnPass(11, "box/claude");
  rail.servir(11);
  log.ajouter({ project: "brigade", ticket: 11, author: "github", type: "ticket.left", payload: { reason: "closed" } });
  log.ajouter({ project: "brigade", ticket: 13, author: "github", type: "ticket.left", payload: { reason: "closed" } });

  const commande = appeler(montrerRail, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.deepEqual(commande.sortie().trimEnd().split("\n"), [
    `#12  queued  -  since ${JOUR_HORLOGE}T10:00:01.000Z  Ticket 12`,
    `#14  queued  -  awaiting #12 — since ${JOUR_HORLOGE}T10:00:03.000Z  Ticket 14`,
    "     card — awaiting: #11, #12 · zone: none",
    `#15  BLOCKED  -  #13 dropped (issue closed without being served) · also awaiting #12 — since ${JOUR_HORLOGE}T10:00:04.000Z  Ticket 15`,
    "     card — awaiting: #11, #12, #13 · zone: none",
    `#16  queued  -  since ${JOUR_HORLOGE}T10:00:05.000Z  Ticket 16`,
    "     card — awaiting: #11 · zone: none",
  ]);
});

test("le rail montre qui possède quoi : la zone de chaque ticket, qui tient celle d'un ticket retenu, et les chemins communs", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const log = openLog(repertoire, { maintenant: horloge() });
  t.after(() => log.fermer());
  const rail = ouvrirRail(log, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:30:00.000Z`) });
  log.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "rail.commons", payload: { paths: ["docs/runtime.md", "CHANGELOG.md"] } });
  const zones = { 14: ["runtime/src", "docs/runtime.md"], 15: ["runtime/src/rail.ts", "docs/runtime.md"], 16: ["runtime/test"] };
  for (const [ticket, zone] of Object.entries(zones)) {
    const payload = { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone, problems: [] } };
    log.ajouter({ project: "brigade", ticket: Number(ticket), author: "github", type: "ticket.arrived", payload });
  }
  rail.prendre("box/claude");

  const commande = appeler(montrerRail, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.deepEqual(commande.sortie().trimEnd().split("\n"), [
    "common paths, held by no one: CHANGELOG.md, docs/runtime.md",
    `#14  taken  -  by box/claude since ${JOUR_HORLOGE}T10:00:04.000Z, last progress ${JOUR_HORLOGE}T10:00:04.000Z, lease until ${JOUR_HORLOGE}T10:40:00.000Z  Ticket 14`,
    "     card — awaiting: nothing · zone: runtime/src, docs/runtime.md",
    `#15  queued  -  zone held by #14 (runtime/src/rail.ts) — since ${JOUR_HORLOGE}T10:00:02.000Z  Ticket 15`,
    "     card — awaiting: nothing · zone: runtime/src/rail.ts, docs/runtime.md",
    `#16  queued  -  since ${JOUR_HORLOGE}T10:00:03.000Z  Ticket 16`,
    "     card — awaiting: nothing · zone: runtime/test",
  ]);
});

test("un rail sans ticket le dit", async (t) => {
  const repertoire = repertoireTemporaire(t);
  openLog(repertoire).fermer();

  const commande = appeler(montrerRail, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.equal(commande.sortie().trim(), "empty rail");
});

test("sans répertoire d'état, sans journal, ou avec un argument, la commande échoue en disant pourquoi", async (t) => {
  const sansVariable = lancer(t, MONTRER, []);
  const withoutLog = appeler(montrerRail, [], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });
  const avecArgument = appeler(montrerRail, ["14"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) });

  assert.equal(await sansVariable.fin, 2);
  assert.match(sansVariable.sortie(), /BRIGADE_STATE_DIR is not set/);
  assert.equal(await withoutLog.fin, 1);
  assert.match(withoutLog.sortie(), /no log in/);
  assert.equal(await avecArgument.fin, 2);
  assert.match(avecArgument.sortie(), /usage/);
});

test("un journal dont le rail date d'avant la date de progrès dit de redémarrer le runtime, sans trace", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const log = openLog(repertoire);
  log.base.script("DROP TABLE rail; CREATE TABLE rail (ticket INTEGER PRIMARY KEY, title TEXT) STRICT;");
  log.fermer();

  const commande = appeler(montrerRail, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 1);
  assert.match(commande.sortie(), /restart the runtime/);
  assert.doesNotMatch(commande.sortie(), /at .*\.ts/);
});

test("un journal d'avant le rail dit aussi de redémarrer le runtime", async (t) => {
  const repertoire = repertoireTemporaire(t);
  openLog(repertoire, { projections: [] }).fermer();

  const commande = appeler(montrerRail, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 1);
  assert.match(commande.sortie(), /restart the runtime/);
  assert.doesNotMatch(commande.sortie(), /at .*\.ts/);
});

test("la fiche d'un ticket qui demande une capacité la montre, et son 86 dit laquelle manque", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const log = openLog(repertoire, { maintenant: horloge() });
  t.after(() => log.fermer());
  const rail = ouvrirRail(log, { projet: "brigade", dureeBailMs: 600_000 });
  const arriver = (ticket: number, requires: string[]) =>
    log.ajouter({
      project: "brigade",
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone: ["e2e/"], problems: [], requires } },
    });
  arriver(14, ["navigateur-headless", "code"]);
  arriver(15, ["chrome-connecté"]);
  rail.quatreVingtSix(15, { motif: "no-station: chrome-connecté" });

  const commande = appeler(montrerRail, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await commande.fin, 0);
  assert.deepEqual(commande.sortie().trimEnd().split("\n"), [
    `#14  queued  -  since ${JOUR_HORLOGE}T10:00:00.000Z  Ticket 14`,
    "     card — awaiting: nothing · zone: e2e/ · `requiert`: navigateur-headless, code",
    `#15  86  -  since ${JOUR_HORLOGE}T10:00:02.000Z (no-station: chrome-connecté), no return time  Ticket 15`,
    "     card — awaiting: nothing · zone: e2e/ · `requiert`: chrome-connecté",
  ]);
});

// Les gestes du chef sur un ticket du rail (geste-ticket.ts), tels que la fiche de l'app les
// lance : `brigade <projet> rail remove <ticket>`, `… rail priority <ticket> <1-9 | none>`,
// `… rail merge <ticket>`.
describe("remove, priority et merge", () => {
  const ISSUE = (numero: number) => `repos/${DEPOT}/issues/${numero}`;
  const LABELS = (numero: number) => `${ISSUE(numero)}/labels`;

  // Le ticket 18 queued, le 14 pris.
  function kitchen(t: TestContext) {
    const repertoire = repertoireTemporaire(t);
    const log = openLog(repertoire, { maintenant: horloge() });
    t.after(() => log.fermer());
    const rail = ouvrirRail(log, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:30:00.000Z`) });
    for (const ticket of [14, 18]) {
      const payload = { title: `Ticket ${ticket}`, priority: ticket === 14 ? 1 : 5, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}` };
      log.ajouter({ project: "brigade", ticket, author: "github", type: "ticket.arrived", payload });
    }
    rail.prendre("box/claude");
    const gh = fauxGh(t);
    const jouer = (args: string[], env: Record<string, string> = {}) =>
      appeler(montrerRail, args, { BRIGADE_STATE_DIR: repertoire, BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin, ...env });
    return { repertoire, journal: log, gh, jouer };
  }

  test("remove retire du rail un ticket queued : le label `fire` quitte l'issue, le rail ne le porte plus, et le prix est dit", async (t) => {
    const { journal: log, gh, jouer } = kitchen(t);
    gh.repondre(`${LABELS(18)}/fire`, { corps: [] });

    const commande = jouer(["remove", "18"]);

    assert.equal(await commande.fin, 0);
    assert.match(commande.sortie(), /^#18 removed from the rail — cost: the ticket leaves the rail/);
    assert.deepEqual(gh.appels(), [["api", "-i", "-X", "DELETE", `${LABELS(18)}/fire`]]);
    assert.deepEqual(lireRail(log.base).map(({ ticket }) => ticket), [14]);
  });

  test("remove refuse un ticket pris, sans rien toucher : la raison et le prix, en code 1", async (t) => {
    const { journal: log, gh, jouer } = kitchen(t);

    const commande = jouer(["remove", "14"]);

    assert.equal(await commande.fin, 1);
    assert.match(commande.sortie(), /#14 is not touched: #14 is taken: a ticket in progress is not touched .* — cost: none: nothing was changed/);
    assert.deepEqual(gh.appels(), []);
    assert.equal(ticketDuRail(log.base, 14)?.state, "taken");
  });

  test("merge refuse un ticket dont aucune livraison n'attend d'être mergée par le chef, sans rien demander à GitHub : la raison et le prix, en code 1", async (t) => {
    const { gh, jouer } = kitchen(t);

    const commande = jouer(["merge", "18"]);

    assert.equal(await commande.fin, 1);
    assert.match(commande.sortie(), /#18 is not touched: #18 has no delivery waiting for you to merge it — cost: none: nothing was changed/);
    assert.deepEqual(gh.appels(), []);
  });

  test("priority change la priorité d'un ticket, même pris : le nouveau label est posé, l'ancien retiré, le rail la lit aussitôt", async (t) => {
    const { journal: log, gh, jouer } = kitchen(t);
    gh.repondre(ISSUE(14), { corps: issueGitHub(14, { labels: ["fire", "prio:1"] }) });
    gh.repondre(LABELS(14), { corps: [] });
    gh.repondre(`${LABELS(14)}/prio%3A1`, { corps: [] });

    const commande = jouer(["priority", "14", "3"]);

    assert.equal(await commande.fin, 0);
    assert.match(commande.sortie(), /^#14: priority prio:3 — cost: none: only the order of service changes/);
    assert.deepEqual(gh.appels().map((appel) => appel.at(-1)), [ISSUE(14), LABELS(14), `${LABELS(14)}/prio%3A1`]);
    assert.equal(ticketDuRail(log.base, 14)?.priority, 3);
    assert.equal(ticketDuRail(log.base, 14)?.state, "taken");
  });

  test("priority none retire la priorité ; une valeur hors de 1 à 9 est refusée sans rien demander à GitHub", async (t) => {
    const { journal: log, gh, jouer } = kitchen(t);
    gh.repondre(ISSUE(18), { corps: issueGitHub(18, { labels: ["fire", "prio:5"] }) });
    gh.repondre(`${LABELS(18)}/prio%3A5`, { corps: [] });

    const hors = jouer(["priority", "18", "12"]);
    assert.equal(await hors.fin, 1);
    assert.match(hors.sortie(), /priority 12 is not valid/);
    assert.deepEqual(gh.appels(), []);

    const aucune = jouer(["priority", "18", "none"]);
    assert.equal(await aucune.fin, 0);
    assert.match(aucune.sortie(), /^#18: priority removed — cost: /);
    assert.equal(ticketDuRail(log.base, 18)?.priority, null);
  });

  test("une demande mal formée, ou sans dépôt déclaré, est refusée en 2 avant que rien ne parte", async (t) => {
    const { gh, jouer } = kitchen(t);
    for (const args of [["remove"], ["remove", "x"], ["remove", "18", "3"], ["priority", "18"], ["priority", "18", "3", "4"], ["merge"], ["merge", "18", "now"], ["supprimer", "18"]]) {
      const commande = jouer(args);
      assert.equal(await commande.fin, 2, args.join(" "));
      assert.match(commande.sortie(), /usage/, args.join(" "));
    }
    const sansDepot = jouer(["remove", "18"], { BRIGADE_GITHUB_REPO: "" });
    assert.equal(await sansDepot.fin, 2);
    assert.match(sansDepot.sortie(), /BRIGADE_GITHUB_REPO is not set/);
    assert.deepEqual(gh.appels(), []);
  });
});
