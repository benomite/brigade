// Les faits que l'app dessine, dans une forme destinée à un programme :
// `npm run faits`. La forme est un contrat — ces tests la figent.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, ETATS_DE_MISE_EN_SERVICE, ETATS_DE_PROJET, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { principal as commande } from "../src/faits.ts";
import { principal as montrerStation } from "../src/montrer-station.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { PROJECTIONS } from "../src/projections.ts";
import { ouvrirRail } from "../src/rail.ts";
import { appeler, jourDecale, JOUR_HORLOGE, horloge, photographier, repertoireTemporaire } from "./outils.ts";

function cuisine(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") =>
    journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const arriver = (ticket: number, priority: number | null, card?: { waitsFor: number[]; zone: string[]; problems: string[] }) =>
    noter(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}`, card } },
      ticket,
      "github",
    );
  const lire = (maintenant: string) => {
    const etat = lireEtat(journal, new Date(maintenant));
    return { forme: faits(etat, new Date(maintenant)), texte: decrireEtat(etat, new Date(maintenant)) };
  };
  return { repertoire, journal, noter, arriver, lire };
}

const demarrer = (noter: ReturnType<typeof cuisine>["noter"]) => noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });

// Une cuisine qui a de tout : un ticket pris, un en pass, deux en attente dont
// un bloqué, un 86 qui reviendra, un servi.
function garnie(t: TestContext) {
  const c = cuisine(t);
  const { journal, noter, arriver } = c;
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:30.000Z`) });
  demarrer(noter); // 10:00:00
  for (const [ticket, priority] of [[14, 1], [15, 1], [16, 2], [17, 2], [19, 3]] as const) arriver(ticket, priority); // 10:00:01 à 05
  arriver(18, null, { waitsFor: [12], zone: [], problems: [] }); // 10:00:06
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 12, "github"); // 10:00:07
  rail.prendre("box/claude-opus"); // 14
  rail.prendre("box/claude-sonnet"); // 15
  rail.envoyerEnPass(15, "box/claude-sonnet");
  rail.quatreVingtSix(17, { motif: "quota", retour: new Date(`${JOUR_HORLOGE}T15:00:00.000Z`) });
  noter({ type: "ticket.taken", payload: { station: "box/claude-opus", leaseUntil: `${JOUR_HORLOGE}T10:10:30.000Z` } }, 19, "station:box/claude-opus");
  noter({ type: "ticket.passing", payload: { station: "box/claude-opus" } }, 19, "station:box/claude-opus");
  rail.servir(19); // 10:00:14
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } }); // 10:00:15
  return c;
}

test("la forme d'une cuisine connue est figée, au caractère près : un champ renommé, déplacé ou ajouté se voit ici", (t) => {
  const { lire } = garnie(t);

  assert.equal(
    JSON.stringify(lire(`${JOUR_HORLOGE}T10:04:11.000Z`).forme),
    `{"etat":"ouverte","lu":"${JOUR_HORLOGE}T10:04:11.000Z","dernierTick":"${JOUR_HORLOGE}T10:00:15.000Z",` +
      `"compteurs":{"rail":2,"auTravail":1,"aLaPass":1,"attend":1,"livres24h":1},` +
      `"dernierEvenement":{"seq":15,"at":"${JOUR_HORLOGE}T10:00:14.000Z","type":"ticket.served","ticket":19},` +
      `"rail":[` +
      `{"ticket":14,"etat":"pris","titre":"Ticket 14","url":"https://exemple.test/14","activite":{"fait":"la station prépare le poste du cook","cible":null,"depuis":"${JOUR_HORLOGE}T10:00:08.000Z"}},` +
      `{"ticket":15,"etat":"en pass","titre":"Ticket 15","url":"https://exemple.test/15","activite":null},` +
      `{"ticket":16,"etat":"en attente","titre":"Ticket 16","url":"https://exemple.test/16","activite":null},` +
      `{"ticket":17,"etat":"86","titre":"Ticket 17","url":"https://exemple.test/17","activite":null},` +
      `{"ticket":19,"etat":"servi","titre":"Ticket 19","url":"https://exemple.test/19","activite":null},` +
      `{"ticket":18,"etat":"BLOQUÉ","titre":"Ticket 18","url":"https://exemple.test/18","activite":null}],` +
      `"cooks":[],` +
      `"attend":[{"ticket":18,"titre":"Ticket 18","url":"https://exemple.test/18"}],` +
      `"version":null,` +
      `"miseEnService":{"etat":"aucune","depuis":null,"coupe":false,"enVol":[],"tokens":0},` +
      `"livres":[{"ticket":19,"titre":"Ticket 19","url":"https://exemple.test/19","livre":"${JOUR_HORLOGE}T10:00:14.000Z","station":"box/claude-opus","pr":null}]}`,
  );
});

test("une issue qui attend sans être sur le rail a son adresse : celle que le dépôt de la box donne, et aucun titre — sans dépôt, aucune adresse", (t) => {
  const { noter, arriver, journal, lire } = cuisine(t);
  arriver(14, 1);
  noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 378, "manager");
  const a = new Date(`${JOUR_HORLOGE}T10:04:11.000Z`);

  assert.deepEqual(faits(lireEtat(journal, a), a, "benomite/brigade").attend, [{ ticket: 378, titre: "", url: "https://github.com/benomite/brigade/issues/378" }]);
  assert.deepEqual(lire(`${JOUR_HORLOGE}T10:04:11.000Z`).forme.attend, [{ ticket: 378, titre: "", url: null }]);
  // Un nom de dépôt qui n'en est pas un ne donne rien : rien n'est composé de travers.
  assert.deepEqual(faits(lireEtat(journal, a), a, "pas un dépôt").attend, [{ ticket: 378, titre: "", url: null }]);
});

test("un ticket du rail qui attend garde l'adresse et le titre du rail, quel que soit le dépôt", (t) => {
  const { noter, journal } = cuisine(t);
  noter({ type: "ticket.arrived", payload: { title: "Ticket 18", priority: 1, createdAt: "2026-10-01T00:00:18Z", url: "https://exemple.test/18", card: { waitsFor: [12], zone: [], problems: [] } } }, 18, "github");
  const a = new Date(`${JOUR_HORLOGE}T10:04:11.000Z`);

  assert.deepEqual(faits(lireEtat(journal, a), a, "benomite/brigade").attend.map(({ ticket }) => ticket), []);
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 12, "github");
  assert.deepEqual(faits(lireEtat(journal, a), a, "benomite/brigade").attend, [{ ticket: 18, titre: "Ticket 18", url: "https://exemple.test/18" }]);
});

test("la forme et le texte de `status` disent la même chose : le rail ticket par ticket, son décompte, ce qui attend, le dernier événement", (t) => {
  const { lire } = garnie(t);

  const { forme, texte } = lire(`${JOUR_HORLOGE}T10:04:11.000Z`);

  const lignes = texte.filter((ligne) => /^  #\d+  /.test(ligne)).slice(-forme.rail.length);
  assert.deepEqual(
    forme.rail.map(({ ticket, etat, titre }) => [`#${ticket}`, etat, titre]),
    lignes.map((ligne) => ligne.trim().split("  ")).map((champs) => [champs[0], champs[1], champs.at(-1)]),
  );
  assert.ok(texte.includes("rail       1 pris · 1 en pass · 1 en attente · 1 BLOQUÉ · 1 86 · 1 servi"));
  const { rail, auTravail, aLaPass, attend } = forme.compteurs;
  assert.deepEqual([auTravail, aLaPass, rail], [1, 1, 1 + 1]);
  assert.ok(texte.some((ligne) => ligne.startsWith(`attend     ${attend} décision attend le chef`)));
  const dernier = forme.dernierEvenement;
  assert.ok(dernier && texte.at(-1)?.startsWith(`  ${dernier.seq}  ${dernier.at}  brigade  #${dernier.ticket}  ${dernier.type}  `));
});

// Deux stations, trois cooks qui tournent et un qui a fini.
function auxFourneaux(t: TestContext) {
  const c = cuisine(t);
  const { noter, arriver } = c;
  const lancerCook = (station: string, ticket: number, run: string) =>
    noter(
      { type: "cook.launched", payload: { run, limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: `runs/${run}.jsonl`, station, model: "sonnet", effort: "low", branch: `cook/${run}`, worktree: `worktrees/${run}` } },
      ticket,
    );
  demarrer(noter);
  for (const station of ["box/claude-sonnet", "box/claude-opus"]) {
    noter({ type: "station.announced", payload: { station, engine: "claude", provides: ["code"], maxCooks: 2 } });
  }
  for (const ticket of [14, 15, 16, 17]) arriver(ticket, 1);
  lancerCook("box/claude-sonnet", 16, "16-a");
  lancerCook("box/claude-opus", 15, "15-a");
  lancerCook("box/claude-sonnet", 14, "14-a");
  lancerCook("box/claude-opus", 17, "17-a");
  noter({ type: "cook.exited", payload: { run: "17-a", outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } }, 17);
  return c;
}

test("les cooks en cours sont figés eux aussi : pour chacun son ticket, le titre du ticket, sa station — station par station, le plus ancien d'abord", (t) => {
  const { lire } = auxFourneaux(t);

  assert.equal(
    JSON.stringify(lire(`${JOUR_HORLOGE}T10:04:11.000Z`).forme.cooks),
    `[{"ticket":15,"titre":"Ticket 15","station":"box/claude-opus"},` +
      `{"ticket":16,"titre":"Ticket 16","station":"box/claude-sonnet"},` +
      `{"ticket":14,"titre":"Ticket 14","station":"box/claude-sonnet"}]`,
  );
});

test("la forme et le texte de `station` disent les mêmes cooks en cours, dans le même ordre", async (t) => {
  const { repertoire, lire } = auxFourneaux(t);

  const lancee = appeler(montrerStation, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await lancee.fin, 0);

  // Le texte : une ligne de tête par station, puis une ligne par cook en cours.
  const dits: Array<[string, string]> = [];
  let station = "";
  let enCours = false;
  for (const ligne of lancee.sortie().split("\n")) {
    if (ligne.startsWith("station ")) station = ligne.slice("station".length).trim().split(" — ")[0] ?? "";
    if (!ligne.startsWith("  ")) enCours = ligne.startsWith("cooks en cours");
    else if (enCours) dits.push([ligne.trim().split("  ")[0] ?? "", station]);
  }
  assert.equal(dits.length, 3);
  assert.deepEqual(
    lire(`${JOUR_HORLOGE}T10:04:11.000Z`).forme.cooks.map(({ ticket, station }) => [`#${ticket}`, station]),
    dits,
  );
});

test("un cook dont le ticket a quitté le rail reste dit, avec un titre vide : le rail ne le connaît plus", (t) => {
  const { noter, lire } = auxFourneaux(t);
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 16, "github");

  assert.deepEqual(lire(`${JOUR_HORLOGE}T10:04:11.000Z`).forme.cooks[1], { ticket: 16, titre: "", station: "box/claude-sonnet" });
});

test("l'état du projet est un mot d'une liste fermée, et chacun se lit aussi en tête de `status` ; le premier vrai l'emporte", (t) => {
  const { noter, lire } = cuisine(t);
  const a = `${JOUR_HORLOGE}T11:00:00.000Z`;
  const tete = () => lire(a).texte.slice(0, 6).join("\n");

  assert.deepEqual(ETATS_DE_PROJET, ["éteinte", "arrêtée", "retenue", "ouverte"]);

  assert.equal(lire(a).forme.etat, "éteinte");
  assert.match(tete(), /^runtime    jamais démarré$/m);

  demarrer(noter);
  noter({ type: "guard.configured", payload: { limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, breakerThreshold: 1 } });
  assert.equal(lire(a).forme.etat, "ouverte");
  assert.match(tete(), /^runtime    en marche d'après le journal/m);
  assert.match(tete(), /^cuisine    ouverte · disjoncteur fermé/m);

  noter({ type: "breaker.opened", payload: { failures: 1, threshold: 1 } });
  assert.equal(lire(a).forme.etat, "retenue");
  assert.match(tete(), /disjoncteur OUVERT/);

  noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
  assert.equal(lire(a).forme.etat, "arrêtée");
  assert.match(tete(), /^cuisine    ARRÊTÉE par le chef/m);

  noter({ type: "runtime.stopped", payload: { signal: "SIGTERM" } });
  assert.equal(lire(a).forme.etat, "éteinte");
  assert.match(tete(), /^runtime    arrêté il y a/m);
});

test("une connexion Max qui manque, une base rouge : la cuisine est retenue, comme `status` le dit en tête", (t) => {
  const a = `${JOUR_HORLOGE}T11:00:00.000Z`;
  const deconnectee = cuisine(t);
  demarrer(deconnectee.noter);
  deconnectee.noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["opus"], maxCooks: 2 } });
  deconnectee.noter({ type: "station.disconnected", payload: { station: "box/claude", reason: "not-logged-in", run: null } }, null, "station:box/claude");

  assert.equal(deconnectee.lire(a).forme.etat, "retenue");
  assert.ok(deconnectee.lire(a).texte.some((ligne) => ligne.startsWith("connexion  Max ")));

  const rouge = cuisine(t);
  demarrer(rouge.noter);
  rouge.noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: { outcome: "red", code: 1, failures: [], tail: "" }, tickets: [] } });

  assert.equal(rouge.lire(a).forme.etat, "retenue");
  assert.ok(rouge.lire(a).texte.some((ligne) => ligne.startsWith("base       ROUGE ")));
});

test("la forme porte l'heure de la box et celle du dernier tick, sans rien en conclure : un runtime figé reste « ouverte »", (t) => {
  const { noter, lire } = cuisine(t);
  demarrer(noter);

  assert.equal(lire(`${JOUR_HORLOGE}T10:00:01.000Z`).forme.dernierTick, null);

  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } }); // 10:00:01
  const { forme } = lire(`${jourDecale(3)}T10:00:00.000Z`);

  assert.deepEqual([forme.etat, forme.lu, forme.dernierTick], ["ouverte", `${jourDecale(3)}T10:00:00.000Z`, `${JOUR_HORLOGE}T10:00:01.000Z`]);

  noter({ type: "runtime.stopped", payload: { signal: "SIGTERM" } });
  assert.equal(lire(`${jourDecale(3)}T10:00:00.000Z`).forme.dernierTick, null);
});

test("« livrés 24 h » compte les tickets servis dans les 24 h avant la lecture — par la pass, à la main, sans merge —, chacun une fois", (t) => {
  const { noter, arriver, lire } = cuisine(t);
  const livres = (maintenant: string) => lire(maintenant).forme.compteurs.livres24h;
  const servir = (ticket: number) => {
    noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T11:00:00.000Z` } }, ticket, "station:box/claude");
    noter({ type: "ticket.passing", payload: { station: "box/claude" } }, ticket, "station:box/claude");
    noter({ type: "ticket.served", payload: {} }, ticket);
  };
  for (const ticket of [14, 15, 16]) arriver(ticket, 1); // 10:00:00 à 02

  assert.equal(livres(`${JOUR_HORLOGE}T10:00:03.000Z`), 0);

  servir(14); // servi sans merge, à 10:00:05
  servir(15); // 10:00:08
  noter({ type: "merge.done", payload: { pr: "https://exemple.test/pull/15", sha: "sha-15", by: "pass", reconciled: false } }, 15, "pass"); // 10:00:09
  // Mergé à la main sans avoir été servi par le rail, puis sorti du rail.
  noter({ type: "merge.done", payload: { pr: "https://exemple.test/pull/16", sha: "sha-16", by: "outside", reconciled: false } }, 16, "pass"); // 10:00:10
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 16, "github");

  assert.equal(livres(`${JOUR_HORLOGE}T10:01:00.000Z`), 3);
  // À l'horloge de la lecture : 24 h après le premier service, il n'y est plus.
  assert.equal(livres(`${jourDecale(1)}T10:00:05.000Z`), 3);
  assert.equal(livres(`${jourDecale(1)}T10:00:06.000Z`), 2);
  assert.equal(livres(`${jourDecale(1)}T10:00:11.000Z`), 0);
});

test("les livrés restent dans la forme après la fermeture de leur issue, 24 h durant : un par service compté, le plus récent d'abord, avec sa station et sa PR mergée", (t) => {
  const { noter, arriver, journal, lire } = cuisine(t);
  const servir = (ticket: number, station = "box/claude") => {
    noter({ type: "ticket.taken", payload: { station, leaseUntil: `${JOUR_HORLOGE}T11:00:00.000Z` } }, ticket, `station:${station}`);
    noter({ type: "ticket.passing", payload: { station } }, ticket, `station:${station}`);
    noter({ type: "ticket.served", payload: {} }, ticket);
  };
  const merger = (ticket: number, by: "pass" | "outside" = "pass") =>
    noter({ type: "merge.done", payload: { pr: `https://exemple.test/pull/${ticket}`, sha: `sha-${ticket}`, by, reconciled: false } }, ticket, "pass");
  const partir = (ticket: number) => noter({ type: "ticket.left", payload: { reason: "closed" } }, ticket, "github");
  for (const ticket of [14, 15, 16, 17, 18]) arriver(ticket, 1); // 10:00:00 à 04

  // #14 servi sans merge, sa PR d'une livraison d'avant ne compte pas : il en a été repris.
  merger(14); // 10:00:05
  servir(14); // 10:00:08
  // #15 mergé par la pass, servi, puis son issue fermée et renommée : il quitte le rail.
  servir(15, "box/claude-opus"); // 10:00:11
  merger(15); // 10:00:12
  partir(15); // 10:00:13
  // #16 mergé à la main sans avoir été servi par le rail, puis sorti du rail.
  merger(16, "outside"); // 10:00:14
  partir(16); // 10:00:15
  // #17 fermé sans merge : abandonné, jamais servi.
  noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T11:00:00.000Z` } }, 17, "station:box/claude"); // 10:00:16
  partir(17); // 10:00:17
  // #378, une livraison hors du rail, mergée : le journal ne connaît ni son titre ni son issue.
  merger(378); // 10:00:18

  const { forme } = lire(`${JOUR_HORLOGE}T10:01:00.000Z`);
  assert.deepEqual(forme.livres, [
    { ticket: 378, titre: "", url: null, livre: `${JOUR_HORLOGE}T10:00:18.000Z`, station: null, pr: "https://exemple.test/pull/378" },
    { ticket: 16, titre: "Ticket 16", url: "https://exemple.test/16", livre: `${JOUR_HORLOGE}T10:00:14.000Z`, station: null, pr: "https://exemple.test/pull/16" },
    { ticket: 15, titre: "Ticket 15", url: "https://exemple.test/15", livre: `${JOUR_HORLOGE}T10:00:12.000Z`, station: "box/claude-opus", pr: "https://exemple.test/pull/15" },
    { ticket: 14, titre: "Ticket 14", url: "https://exemple.test/14", livre: `${JOUR_HORLOGE}T10:00:08.000Z`, station: "box/claude", pr: null },
  ]);
  assert.equal(forme.compteurs.livres24h, forme.livres.length);
  // Partis, ils ne sont plus sur le rail : seule la forme des livrés les garde.
  assert.deepEqual(
    forme.rail.map(({ ticket }) => ticket),
    [14, 18],
  );
  // L'adresse d'une livraison hors du rail se compose du dépôt de la box, comme pour `attend`.
  const a = new Date(`${JOUR_HORLOGE}T10:01:00.000Z`);
  assert.equal(faits(lireEtat(journal, a), a, "benomite/brigade").livres[0]?.url, "https://github.com/benomite/brigade/issues/378");

  // Le compte et la liste glissent ensemble, à l'horloge de la lecture.
  for (const [maintenant, tickets] of [
    [`${jourDecale(1)}T10:00:08.000Z`, [378, 16, 15, 14]],
    [`${jourDecale(1)}T10:00:09.000Z`, [378, 16, 15]],
    [`${jourDecale(1)}T10:00:18.000Z`, [378]],
    [`${jourDecale(1)}T10:00:19.000Z`, []],
  ] as const) {
    const plusTard = lire(maintenant).forme;
    assert.deepEqual(
      plusTard.livres.map(({ ticket }) => ticket),
      tickets,
      maintenant,
    );
    assert.equal(plusTard.compteurs.livres24h, tickets.length, maintenant);
  }
});

test("un livré porte le titre du jour de son issue, renommée après son service", (t) => {
  const { noter, arriver, lire } = cuisine(t);
  arriver(14, 1);
  noter({ type: "ticket.served", payload: {} }, 14);
  noter({ type: "ticket.changed", payload: { title: "Ticket 14, renommé", priority: 1 } }, 14, "github");
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 14, "github");

  assert.deepEqual(
    lire(`${JOUR_HORLOGE}T10:01:00.000Z`).forme.livres.map(({ titre }) => titre),
    ["Ticket 14, renommé"],
  );
});

test("un journal vide a une forme : éteinte, des zéros, aucun événement, un rail vide, aucun cook, rien qui attende", (t) => {
  const { lire } = cuisine(t);

  assert.deepEqual(lire(`${JOUR_HORLOGE}T10:00:00.000Z`).forme, {
    etat: "éteinte",
    lu: `${JOUR_HORLOGE}T10:00:00.000Z`,
    dernierTick: null,
    compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [],
    cooks: [],
    attend: [],
    version: null,
    miseEnService: { etat: "aucune", depuis: null, coupe: false, enVol: [], tokens: 0 },
    livres: [],
  });
});

// Le champ `version` : ce que le runtime en marche a constaté en comparant la
// version qu'il sert à la branche que le clone de brigade suit, lue sur son
// origine — la même chose que l'entrée `version` du bloc `attend`, pour un
// programme. Toujours les mêmes six champs, dans cet ordre :
//   `etat`       un mot de la liste fermée `à jour`, `en attente`, `non comparée`
//   `depuis`     en attente : l'instant de la plus ancienne livraison qui n'est
//                pas en service ; sinon, depuis quand la comparaison répond ainsi
//   `branche`    la branche comparée (`origin/v2`) ; `null` quand le clone n'a
//                pas dit laquelle il suit
//   `enService`  le commit de la version en service
//   `enAttente`  en attente : le commit de tête de la branche ; sinon `null`
//   `livraisons` en attente : combien de livraisons ne sont pas en service ; sinon `null`
//   `raison`     non comparée : ce qui a empêché de comparer ; sinon `null`
// Et `null` à la place de l'objet tant que le runtime en marche n'a rien
// comparé : l'absence de réponse ne se lit jamais « à jour ».
test("la version en attente est dans la forme, sous `version` : son état d'un mot, depuis quand, la branche, le commit en service, celui qui attend, le nombre de livraisons non en service — ou le motif qui a empêché de comparer", (t) => {
  const { noter, lire } = cuisine(t);
  const [servie, tete] = ["a".repeat(40), "b".repeat(40)];
  const version = () => JSON.stringify(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).forme.version);
  demarrer(noter); // 10:00:00
  assert.equal(version(), "null");

  noter({ type: "version.compared", payload: { outcome: "current", served: servie, branch: "origin/v2" } }); // 10:00:01
  assert.equal(version(), `{"etat":"à jour","depuis":"${JOUR_HORLOGE}T10:00:01.000Z","branche":"origin/v2","enService":"${servie}","enAttente":null,"livraisons":null,"raison":null}`);
  assert.equal(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).forme.compteurs.attend, 0);

  noter({ type: "version.compared", payload: { outcome: "waiting", served: servie, branch: "origin/v2", head: tete, since: `${JOUR_HORLOGE}T08:21:07.000Z`, deliveries: 26 } });
  assert.equal(version(), `{"etat":"en attente","depuis":"${JOUR_HORLOGE}T08:21:07.000Z","branche":"origin/v2","enService":"${servie}","enAttente":"${tete}","livraisons":26,"raison":null}`);
  // Elle compte parmi ce qui attend le chef, comme dans le bloc ; `attend` ne nomme que des tickets.
  assert.equal(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).forme.compteurs.attend, 1);
  assert.deepEqual(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).forme.attend, []);

  noter({ type: "version.compared", payload: { outcome: "unreadable", served: servie, branch: null, reason: "le clone ne se lit pas" } }); // 10:00:03
  assert.equal(version(), `{"etat":"non comparée","depuis":"${JOUR_HORLOGE}T10:00:03.000Z","branche":null,"enService":"${servie}","enAttente":null,"livraisons":null,"raison":"le clone ne se lit pas"}`);
  assert.equal(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).forme.compteurs.attend, 1);

  // Un runtime qui redémarre n'a encore rien comparé.
  demarrer(noter);
  assert.equal(version(), "null");
  assert.equal(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).forme.compteurs.attend, 0);
});

// Le champ `miseEnService` : la mise en service que le chef a demandée au
// runtime (`run mise-en-service`), et ce qu'elle interromprait — de quoi le
// montrer avant de la demander. Toujours là, toujours les mêmes cinq champs,
// dans cet ordre :
//   `etat`    un mot de la liste fermée `aucune`, `demandée`, `lancée` —
//             `demandée` : elle attend le rail calme, ou le prochain réveil du
//             runtime ; `lancée` : le geste de box est parti
//   `depuis`  l'instant de la demande ; `null` sans demande
//   `coupe`   le chef a demandé de ne pas attendre le rail calme
//   `enVol`   les cooks en vol à la lecture, le plus ancien d'abord : `ticket`
//             (`null` pour un jugement du manager), `run`, `station`, et
//             `tokens` — ce qu'il a déjà dépensé à son dernier relevé, `null`
//             tant qu'aucun relevé n'en dit rien
//   `tokens`  ce que les cooks en vol ont déjà dépensé en tout
test("la mise en service demandée est dans la forme, sous `miseEnService` : son état d'un mot, depuis quand, si elle coupe, les cooks en vol et ce qu'ils ont déjà dépensé, chacun et en tout", (t) => {
  const { noter, lire } = cuisine(t);
  const limits = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
  const service = () => JSON.stringify(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).forme.miseEnService);
  demarrer(noter); // 10:00:00
  assert.equal(service(), `{"etat":"aucune","depuis":null,"coupe":false,"enVol":[],"tokens":0}`);

  // Deux cooks en vol, et un jugement du manager sans relevé : ils se lisent avant toute demande.
  noter({ type: "cook.launched", payload: { run: "12-aa", limits, stream: "runs/12-aa.jsonl", station: "box/claude" } }, 12);
  noter({ type: "cook.launched", payload: { run: "14-bb", limits, stream: "runs/14-bb.jsonl", station: "box/claude" } }, 14);
  noter({ type: "cook.launched", payload: { run: "juge-cc", limits, stream: "runs/juge-cc.jsonl", station: "manager" } });
  noter({ type: "cook.progressed", payload: { run: "12-aa", turns: 40, tokens: 230_000 } }, 12);
  noter({ type: "cook.progressed", payload: { run: "14-bb", turns: 38, tokens: 220_775 } }, 14);
  const enVol = `[{"ticket":12,"run":"12-aa","station":"box/claude","tokens":230000},{"ticket":14,"run":"14-bb","station":"box/claude","tokens":220775},{"ticket":null,"run":"juge-cc","station":"manager","tokens":null}]`;
  assert.equal(service(), `{"etat":"aucune","depuis":null,"coupe":false,"enVol":${enVol},"tokens":450775}`);

  assert.equal(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).forme.etat, "ouverte");
  noter({ type: "deploy.requested", payload: { cut: false } }, null, "chef"); // 10:00:06
  // Plus aucun cook ne part : la cuisine est retenue, comme `status` le dit en tête.
  assert.equal(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).forme.etat, "retenue");
  assert.ok(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).texte.includes("version    MISE EN SERVICE DEMANDÉE depuis 1 h 59 — plus aucun cook ne part, la cuisine se vide avant le redémarrage : `run mise-en-service -- voir`"));
  assert.equal(service(), `{"etat":"demandée","depuis":"${JOUR_HORLOGE}T10:00:06.000Z","coupe":false,"enVol":${enVol},"tokens":450775}`);
  noter({ type: "deploy.requested", payload: { cut: true } }, null, "chef");
  assert.equal(service(), `{"etat":"demandée","depuis":"${JOUR_HORLOGE}T10:00:06.000Z","coupe":true,"enVol":${enVol},"tokens":450775}`);
  noter({ type: "deploy.launched", payload: { command: ["sudo"], flying: [], log: "mise-en-service.log", served: null } });
  assert.equal(service(), `{"etat":"lancée","depuis":"${JOUR_HORLOGE}T10:00:06.000Z","coupe":true,"enVol":${enVol},"tokens":450775}`);
  assert.ok(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).texte.some((ligne) => ligne.startsWith("version    MISE EN SERVICE LANCÉE depuis 1 h 59 — le geste de box tourne")));

  assert.deepEqual(ETATS_DE_MISE_EN_SERVICE, ["aucune", "demandée", "lancée"]);

  // Le geste rend la main sans rien redémarrer, ou le runtime redémarre : plus de demande.
  noter({ type: "deploy.exited", payload: { code: 69, signal: null, tail: "" } });
  assert.equal(lire(`${JOUR_HORLOGE}T12:00:00.000Z`).forme.etat, "ouverte");
  assert.equal(service(), `{"etat":"aucune","depuis":null,"coupe":false,"enVol":${enVol},"tokens":450775}`);
  noter({ type: "deploy.requested", payload: { cut: false } }, null, "chef");
  demarrer(noter);
  assert.equal(JSON.parse(service()).etat, "aucune");
});

test("la commande rend la forme sur une seule ligne de JSON, sans rien écrire au journal ni à ses projections", async (t) => {
  const { repertoire, journal } = garnie(t);
  const avant = [journal.tout(), photographier(journal, PROJECTIONS)];

  const lancee = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire });

  assert.equal(await lancee.fin, 0);
  const lignes = lancee.sortie().split("\n");
  assert.equal(lignes.length, 2);
  assert.equal(lignes[1], "");
  const forme = JSON.parse(lignes[0] ?? "");
  assert.deepEqual(Object.keys(forme), ["etat", "lu", "dernierTick", "compteurs", "dernierEvenement", "rail", "cooks", "attend", "version", "miseEnService", "livres"]);
  // La commande lit à l'heure de la machine : le service de cette cuisine,
  // daté du jour de l'horloge des tests, a plus de 24 h.
  assert.deepEqual(forme.compteurs, { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 0 });
  assert.deepEqual(forme.livres, []);
  assert.ok(Math.abs(Date.parse(forme.lu) - Date.now()) < 3_600_000);
  assert.deepEqual([journal.tout(), photographier(journal, PROJECTIONS)], avant);
});

test("la commande refuse un argument, un répertoire d'état absent ou sans journal, en le disant", async (t) => {
  const repertoire = repertoireTemporaire(t);

  const sansEtat = appeler(commande, [], {});
  assert.equal(await sansEtat.fin, 2);
  assert.match(sansEtat.sortie(), /^brigade : BRIGADE_STATE_DIR n'est pas défini\nusage : /);

  const avecArgument = appeler(commande, ["--json"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await avecArgument.fin, 2);
  assert.match(avecArgument.sortie(), /^brigade : usage : /);

  const sansJournal = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await sansJournal.fin, 1);
  assert.match(sansJournal.sortie(), /^brigade : /);
});

// Un ticket pris par box/claude, son cook lancé à 10:00:04.
function auTravail(t: TestContext) {
  const c = cuisine(t);
  const { noter, arriver, journal } = c;
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 3_600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  demarrer(noter); // 10:00:00
  arriver(14, 1); // 10:00:01
  rail.prendre("box/claude"); // 10:00:02
  const ticket = () => lireEtat(journal, new Date(`${JOUR_HORLOGE}T10:10:00.000Z`)).rail.find((surLeRail) => surLeRail.ticket === 14);
  const lancer = (run: string, station = "box/claude", numero: number | null = 14) =>
    noter({ type: "cook.launched", payload: { run, limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: `runs/${run}.jsonl`, station } }, numero);
  const activite = (a = `${JOUR_HORLOGE}T10:10:00.000Z`) => lire(a).forme.rail.find((surLeRail) => surLeRail.ticket === 14)?.activite;
  const { lire } = c;
  return { ...c, rail, ticket, lancer, activite };
}

test("la carte d'un ticket pris dit ce que son cook fait en ce moment, et depuis quand : la station prépare son poste, il démarre, il lit, il écrit — puis elle livre", (t) => {
  const { noter, lancer, activite, lire, ticket } = auTravail(t);
  assert.equal(ticket()?.state, "taken");
  assert.deepEqual(activite(), { fait: "la station prépare le poste du cook", cible: null, depuis: `${JOUR_HORLOGE}T10:00:02.000Z` });

  lancer("14-a"); // 10:00:03
  assert.deepEqual(activite(), { fait: "démarre", cible: null, depuis: `${JOUR_HORLOGE}T10:00:03.000Z` });

  noter({ type: "cook.progressed", payload: { run: "14-a", turns: 3, tokens: 300, activity: { doing: "reading", target: "runtime/src/etat.ts", since: `${JOUR_HORLOGE}T10:00:03.500Z` } } }, 14);
  assert.deepEqual(activite(), { fait: "lit", cible: "runtime/src/etat.ts", depuis: `${JOUR_HORLOGE}T10:00:03.500Z` });
  noter({ type: "cook.progressed", payload: { run: "14-a", turns: 9, tokens: 900, activity: { doing: "fixing-tests", target: "app/src/bon.ts", since: `${JOUR_HORLOGE}T10:00:04.500Z` } } }, 14);
  assert.deepEqual(activite(), { fait: "tests rouges, corrige", cible: "app/src/bon.ts", depuis: `${JOUR_HORLOGE}T10:00:04.500Z` });
  // `status` le dit aussi, sur la ligne du cook : là où il en est, depuis quand.
  assert.ok(lire(`${JOUR_HORLOGE}T10:10:00.000Z`).texte.some((ligne) => ligne.startsWith("  #14  14-a  ") && ligne.endsWith("en ce moment : tests rouges, corrige app/src/bon.ts, depuis 9 min")));

  noter({ type: "cook.exited", payload: { run: "14-a", outcome: "ok", code: 0, signal: null, turns: 10, tokens: 1000, durationMs: 1 } }, 14);
  assert.equal(ticket()?.state, "taken");
  assert.deepEqual(activite(), { fait: "la station livre son travail", cible: null, depuis: `${JOUR_HORLOGE}T10:00:06.000Z` });
});

test("un cook dont le relevé ne dit pas ce qu'il fait — une station distante — n'a pas d'activité : la forme le dit nulle, sans rien inventer", (t) => {
  const { noter, lancer, activite } = auTravail(t);
  lancer("14-a");
  noter({ type: "cook.progressed", payload: { run: "14-a", turns: 3, tokens: 300 } }, 14);
  assert.equal(activite(), null);
});

test("la carte d'un ticket en pass dit où en est la pass : gates, relecture, jugement — puis son verdict", (t) => {
  const { noter, lancer, activite, rail } = auTravail(t);
  lancer("14-a"); // 10:00:03
  noter({ type: "cook.reported", payload: { run: "14-a", ending: "done", reason: null, summary: null, branch: "cook/14-a", pr: null } }, 14); // 10:00:04
  rail.envoyerEnPass(14, "box/claude"); // 10:00:05
  assert.deepEqual(activite(), { fait: "attend la pass", cible: null, depuis: `${JOUR_HORLOGE}T10:00:04.000Z` });

  noter({ type: "pass.started", payload: { run: "14-a", pr: "https://exemple.test/pr/1", number: 1, sha: "abc" } }, 14); // 10:00:06
  assert.deepEqual(activite(), { fait: "gates en cours", cible: null, depuis: `${JOUR_HORLOGE}T10:00:06.000Z` });

  lancer("review-14-x", "reviewer", null); // 10:00:07
  assert.deepEqual(activite(), { fait: "relecture en cours", cible: null, depuis: `${JOUR_HORLOGE}T10:00:07.000Z` });
  // La relecture d'un autre ticket n'est pas la sienne.
  lancer("review-140-y", "reviewer", null);
  assert.deepEqual(activite(), { fait: "relecture en cours", cible: null, depuis: `${JOUR_HORLOGE}T10:00:07.000Z` });

  noter({ type: "cook.exited", payload: { run: "review-14-x", outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } }); // 10:00:09
  noter({ type: "pass.reviewed", payload: { run: "14-a", sha: "abc", review: "review-14-x", outcome: "green", summary: null, findings: [], reason: null, truncated: false } }, 14);
  assert.deepEqual(activite(), { fait: "jugement en cours", cible: null, depuis: `${JOUR_HORLOGE}T10:00:09.000Z` });

  const gates = { outcome: "green" as const, code: 0, failures: [], tail: "" };
  noter(
    { type: "pass.judged", payload: { run: "14-a", pr: "https://exemple.test/pr/1", number: 1, sha: "abc", verdict: "green", gates, ci: { outcome: "none", checks: [] }, findings: [], judgeModified: false, review: { outcome: "green", run: "review-14-x", summary: null, findings: [] }, noDiff: false } },
    14,
  ); // 10:00:11
  assert.deepEqual(activite(), { fait: "jugée verte, la pass décide", cible: null, depuis: `${JOUR_HORLOGE}T10:00:11.000Z` });
});
