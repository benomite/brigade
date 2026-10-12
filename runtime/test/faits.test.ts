// Les faits que l'app dessine, dans une forme destinée à un programme :
// `npm run faits`. La forme est un contrat — ces tests la figent.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { decrireEtat, ETATS_DE_PROJET, faits, lireEtat } from "../src/etat.ts";
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
      `{"ticket":14,"etat":"pris","titre":"Ticket 14","url":"https://exemple.test/14"},` +
      `{"ticket":15,"etat":"en pass","titre":"Ticket 15","url":"https://exemple.test/15"},` +
      `{"ticket":16,"etat":"en attente","titre":"Ticket 16","url":"https://exemple.test/16"},` +
      `{"ticket":17,"etat":"86","titre":"Ticket 17","url":"https://exemple.test/17"},` +
      `{"ticket":19,"etat":"servi","titre":"Ticket 19","url":"https://exemple.test/19"},` +
      `{"ticket":18,"etat":"BLOQUÉ","titre":"Ticket 18","url":"https://exemple.test/18"}],` +
      `"cooks":[]}`,
  );
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

test("un journal vide a une forme : éteinte, des zéros, aucun événement, un rail vide, aucun cook", (t) => {
  const { lire } = cuisine(t);

  assert.deepEqual(lire(`${JOUR_HORLOGE}T10:00:00.000Z`).forme, {
    etat: "éteinte",
    lu: `${JOUR_HORLOGE}T10:00:00.000Z`,
    dernierTick: null,
    compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [],
    cooks: [],
  });
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
  assert.deepEqual(Object.keys(forme), ["etat", "lu", "dernierTick", "compteurs", "dernierEvenement", "rail", "cooks"]);
  // La commande lit à l'heure de la machine : le service de cette cuisine,
  // daté du jour de l'horloge des tests, a plus de 24 h.
  assert.deepEqual(forme.compteurs, { rail: 2, auTravail: 1, aLaPass: 1, attend: 1, livres24h: 0 });
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
