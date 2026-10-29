// Les faits que l'app dessine, dans une forme destinée à un programme :
// `npm run faits`. La forme est un contrat — ces tests la figent.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Captures } from "../src/captures.ts";
import { decrireEtat, ETATS_DE_PROJET, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { principal as commande } from "../src/faits.ts";
import { principal as montrerStation } from "../src/montrer-station.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { PROJECTIONS } from "../src/projections.ts";
import { ouvrirRail } from "../src/rail.ts";
import { appeler, jourDecale, JOUR_HORLOGE, horloge, photographier, repertoireTemporaire } from "./outils.ts";
import { projetSurGit } from "./aides/projet-sur-git.ts";

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
      `"compteurs":{"rail":2,"auTravail":1,"aLaPass":1,"attend":0,"livres24h":1},` +
      `"dernierEvenement":{"seq":15,"at":"${JOUR_HORLOGE}T10:00:14.000Z","type":"ticket.served","ticket":19},` +
      `"rail":[` +
      `{"ticket":14,"etat":"pris","titre":"Ticket 14","url":"https://exemple.test/14","depuis":"${JOUR_HORLOGE}T10:00:08.000Z","essais":[{"depuis":"${JOUR_HORLOGE}T10:00:08.000Z","jusqua":null,"arret":null,"enCours":true}],"activite":{"fait":"la station prépare le poste du cook","faitEn":"the station is setting up the cook's post","cible":null,"depuis":"${JOUR_HORLOGE}T10:00:08.000Z"},"attente":null,"tiers":null,"raison":null},` +
      `{"ticket":15,"etat":"en pass","titre":"Ticket 15","url":"https://exemple.test/15","depuis":"${JOUR_HORLOGE}T10:00:10.000Z","activite":null,"attente":null,"tiers":null,"raison":null},` +
      `{"ticket":16,"etat":"en attente","titre":"Ticket 16","url":"https://exemple.test/16","depuis":"${JOUR_HORLOGE}T10:00:03.000Z","activite":null,"attente":null,"tiers":null,"raison":null},` +
      `{"ticket":17,"etat":"86","titre":"Ticket 17","url":"https://exemple.test/17","depuis":"${JOUR_HORLOGE}T10:00:11.000Z","activite":null,"attente":{"raison":"attend : quota du compte épuisé","colonne":"86","retour":"${JOUR_HORLOGE}T15:00:00.000Z"},"tiers":null,"raison":null},` +
      `{"ticket":19,"etat":"servi","titre":"Ticket 19","url":"https://exemple.test/19","depuis":"${JOUR_HORLOGE}T10:00:14.000Z","activite":null,"attente":null,"tiers":null,"raison":null},` +
      `{"ticket":18,"etat":"en attente","titre":"Ticket 18","url":"https://exemple.test/18","depuis":"${JOUR_HORLOGE}T10:00:06.000Z","activite":null,"attente":null,"tiers":null,"raison":null}],` +
      `"cooks":[],` +
      // #18 attend #12, parti l'issue ouverte : il l'attend sur le rail, et rien n'attend le chef (#1834).
      `"attend":[],` +
      `"livres":[{"ticket":19,"titre":"Ticket 19","url":"https://exemple.test/19","livre":"${JOUR_HORLOGE}T10:00:14.000Z","station":"box/claude-opus","pr":null,"relecture":null}],` +
      `"urgence":null,"retenues":[],"cuisineOisive":null,"stations":[]}`,
  );
});

test("les stations : une d'ici prend les tickets ordinaires ; une distante, selon le réglage du chef et le bac à sable de son poste ; chacune dit ce qu'elle fournit, et si la principale la voit — la forme est figée", (t) => {
  const { noter, lire } = cuisine(t);
  demarrer(noter);
  noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["code"], maxCooks: 2 } });
  noter({ type: "station.announced", payload: { station: "mac/claude", engine: "claude", provides: ["chrome-connecté"], maxCooks: 1, remote: true, ordinary: true } });
  noter({ type: "station.announced", payload: { station: "win/claude", engine: "claude", provides: ["obs"], maxCooks: 1, remote: true } });
  noter({ type: "station.sandbox", payload: { station: "mac/claude", available: false, reason: "Seatbelt est introuvable", version: null } }); // 10:00:04
  // Le Mac s'est manifesté à la principale ; win ne l'a jamais fait.
  noter({ type: "station.present", payload: { station: "mac/claude" } }); // 10:00:05

  assert.equal(
    JSON.stringify(lire(`${JOUR_HORLOGE}T10:04:11.000Z`).forme.stations),
    `[{"station":"box/claude","distante":false,"plafond":2,"ordinaires":false,"ensemble":false,"bacASable":null,"prendOrdinaires":true,"cuisson":"cooking","arreteeDepuis":null,"refus":null,"cooks":[],"fournit":["code"],"presente":true,"vueLe":null},` +
      `{"station":"mac/claude","distante":true,"plafond":1,"ordinaires":true,"ensemble":false,"bacASable":{"disponible":false,"raison":"Seatbelt est introuvable","version":null,"depuis":"${JOUR_HORLOGE}T10:00:04.000Z"},"prendOrdinaires":false,"cuisson":"cooking","arreteeDepuis":null,"refus":null,"cooks":[],"fournit":["chrome-connecté"],"presente":true,"vueLe":"${JOUR_HORLOGE}T10:00:05.000Z"},` +
      `{"station":"win/claude","distante":true,"plafond":1,"ordinaires":false,"ensemble":false,"bacASable":null,"prendOrdinaires":false,"cuisson":"cooking","arreteeDepuis":null,"refus":null,"cooks":[],"fournit":["obs"],"presente":false,"vueLe":null}]`,
  );
  noter({ type: "station.sandbox", payload: { station: "mac/claude", available: true, reason: null, version: "2.1.250" } });
  assert.deepEqual(lire(`${JOUR_HORLOGE}T10:04:11.000Z`).forme.stations[1]?.prendOrdinaires, true);
});

test("une issue qui attend sans être sur le rail a son adresse : celle que le dépôt de la box donne, et aucun titre — sans dépôt, aucune adresse", (t) => {
  const { noter, arriver, journal, lire } = cuisine(t);
  arriver(14, 1);
  noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 378, "manager");
  const a = new Date(`${JOUR_HORLOGE}T10:04:11.000Z`);
  // Sa carte de TODO : un seul geste, la lui rendre avec la réponse du chef.
  const carte = {
    type: "ecartee",
    resume: "#378 is held back by the blocked-on-human label. Your answer is written on the issue and the label removed, so the manager judges it again.",
    question: null,
    choix: [{ texte: "Hand it back to the manager with my answer", suite: "resume" }],
    reponseLibre: true,
    secondaire: { action: "ask-second", texte: "ask the second" },
    captures: null,
  };

  assert.deepEqual(faits(lireEtat(journal, a), a, "acme/brigade").attend, [{ ticket: 378, titre: "", url: "https://github.com/acme/brigade/issues/378", decision: { quoi: "ecartee", motif: "blocked-on-human", cause: null, pr: null }, carte }]);
  assert.deepEqual(lire(`${JOUR_HORLOGE}T10:04:11.000Z`).forme.attend, [{ ticket: 378, titre: "", url: null, decision: { quoi: "ecartee", motif: "blocked-on-human", cause: null, pr: null }, carte }]);
  // Un nom de dépôt qui n'en est pas un ne donne rien : rien n'est composé de travers.
  assert.deepEqual(faits(lireEtat(journal, a), a, "pas un dépôt").attend, [{ ticket: 378, titre: "", url: null, decision: { quoi: "ecartee", motif: "blocked-on-human", cause: null, pr: null }, carte }]);
});

test("un ticket d'interface en pass, puis livré, porte les captures de sa dernière livraison par leur adresse — un autre n'en porte aucune, et sans dépôt aucune ne se montre", (t) => {
  const { noter, arriver, journal } = cuisine(t);
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:30.000Z`) });
  arriver(14, 1);
  arriver(15, 1);
  const livrer = (ticket: number, captures?: Captures) => {
    noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T10:10:30.000Z` } }, ticket, "station:box/claude");
    noter({ type: "ticket.passing", payload: { station: "box/claude" } }, ticket, "station:box/claude");
    noter({ type: "cook.reported", payload: { run: `${ticket}-a`, ending: "done", reason: null, summary: null, branch: `cook/${ticket}-a`, pr: null, ...(captures === undefined ? {} : { captures }) } }, ticket, "station:box/claude");
  };
  // Une première livraison incomplète, puis une seconde qui porte tout : c'est la dernière qui compte.
  livrer(15, { sha: "aaa", screens: [] });
  noter({ type: "cook.reported", payload: { run: "15-b", ending: "done", reason: null, summary: null, branch: "cook/15-a", pr: null, captures: { sha: "bbb", screens: [{ screen: "fiche", before: "docs/captures/15/fiche-avant.png", after: "docs/captures/15/fiche-apres.png" }] } } }, 15, "station:box/claude");
  livrer(14);
  const a = new Date(`${JOUR_HORLOGE}T10:04:11.000Z`);
  const adresse = (moment: string) => `https://github.com/acme/brigade/blob/bbb/docs/captures/15/fiche-${moment}.png?raw=true`;
  const attendues = { complet: true, ecrans: [{ ecran: "fiche", avant: adresse("avant"), apres: adresse("apres") }] };

  const enPass = faits(lireEtat(journal, a), a, "acme/brigade");
  assert.deepEqual(enPass.rail.find(({ ticket }) => ticket === 15)?.captures, attendues);
  assert.equal("captures" in (enPass.rail.find(({ ticket }) => ticket === 14) ?? {}), false);
  // Sans dépôt connu, aucune adresse ne se compose : rien n'est montré.
  assert.equal("captures" in (faits(lireEtat(journal, a), a).rail.find(({ ticket }) => ticket === 15) ?? {}), false);

  rail.servir(15);
  rail.servir(14);
  const servis = faits(lireEtat(journal, a), a, "acme/brigade").livres;
  assert.deepEqual(servis.find(({ ticket }) => ticket === 15)?.captures, attendues);
  assert.equal("captures" in (servis.find(({ ticket }) => ticket === 14) ?? {}), false);
});

test("un ticket mis de côté faute de station se lit en WAITING : ce qu'il attend, de qui, sans relance — un autre 86 reste 86", (t) => {
  const { noter, arriver, journal, lire } = cuisine(t);
  const rail = ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000, maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:30.000Z`) });
  arriver(14, 1);
  arriver(15, 1);
  rail.quatreVingtSix(14, { motif: "no-station: chrome-connecté" });
  rail.quatreVingtSix(15, { motif: "quota" });
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  const [sans, autre] = lire(`${JOUR_HORLOGE}T10:04:11.000Z`).forme.rail;
  assert.deepEqual([sans?.ticket, sans?.etat, sans?.attente?.colonne, sans?.tiers?.relance], [14, "WAITING", "WAITING", null]);
  assert.equal(sans?.tiers?.quoi, "a station that provides chrome-connecté — attach one to the project");
  assert.equal(sans?.tiers?.qui, "a human, the chef");
  assert.equal(sans?.tiers?.aLArrivee, "the ticket goes back on the rail by itself once a station provides it");
  assert.match(sans?.attente?.raison ?? "", /humain/);
  assert.deepEqual([autre?.ticket, autre?.etat, autre?.attente?.colonne, autre?.tiers], [15, "86", "86", null]);
});

test("un ticket du rail qui en attend un autre, parti l'issue ouverte, n'attend pas le chef : il l'attend sur le rail (#1834)", (t) => {
  const { noter, journal } = cuisine(t);
  noter({ type: "ticket.arrived", payload: { title: "Ticket 18", priority: 1, createdAt: "2026-10-01T00:00:18Z", url: "https://exemple.test/18", card: { waitsFor: [12], zone: [], problems: [] } } }, 18, "github");
  const a = new Date(`${JOUR_HORLOGE}T10:04:11.000Z`);

  assert.deepEqual(faits(lireEtat(journal, a), a, "acme/brigade").attend.map(({ ticket }) => ticket), []);
  noter({ type: "ticket.left", payload: { reason: "unfired" } }, 12, "github");
  assert.deepEqual(faits(lireEtat(journal, a), a, "acme/brigade").attend, []);
  assert.deepEqual(
    faits(lireEtat(journal, a), a, "acme/brigade").rail.map(({ ticket, etat, url }) => [ticket, etat, url]),
    [[18, "en attente", "https://exemple.test/18"]],
  );
});

test("la forme et le texte de `status` disent la même chose : le rail ticket par ticket, son décompte, ce qui attend, le dernier événement", (t) => {
  const { lire } = garnie(t);

  const { forme, texte } = lire(`${JOUR_HORLOGE}T10:04:11.000Z`);

  const lignes = texte.filter((ligne) => /^  #\d+  /.test(ligne)).slice(-forme.rail.length);
  // `facts` garde les états français que l'app lit ; `status` les écrit en anglais.
  const enAnglais: Record<string, string> = { pris: "taken", "en pass": "in pass", "en attente": "queued", servi: "served", "BLOQUÉ": "BLOCKED" };
  assert.deepEqual(
    forme.rail.map(({ ticket, etat, titre }) => [`#${ticket}`, enAnglais[etat] ?? etat, titre]),
    lignes.map((ligne) => ligne.trim().split("  ")).map((champs) => [champs[0], champs[1], champs.at(-1)]),
  );
  assert.ok(texte.includes("rail       1 taken · 1 in pass · 2 queued · 1 86 · 1 served"));
  const { rail, auTravail, aLaPass, attend } = forme.compteurs;
  assert.deepEqual([auTravail, aLaPass, rail], [1, 1, 1 + 1]);
  assert.equal(attend, 0);
  assert.ok(texte.includes("awaiting   nothing awaits the chef"));
  const dernier = forme.dernierEvenement;
  assert.ok(dernier && texte.at(-1)?.startsWith(`  ${dernier.seq}  ${dernier.at}  brigade  #${dernier.ticket}  ${dernier.type}  `));
});

// Deux stations, trois cooks qui tournent et un qui a fini.
function auxFourneaux(t: TestContext) {
  const c = cuisine(t);
  const { noter, arriver } = c;
  const lancerCook = (station: string, ticket: number, run: string) =>
    noter(
      { type: "cook.launched", payload: { run, limits: { durationMs: 1, tokens: 1, idleMs: 1 }, stream: `runs/${run}.jsonl`, station, model: "sonnet", effort: "low", branch: `cook/${run}`, worktree: `worktrees/${run}` } },
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
    if (!ligne.startsWith("  ")) enCours = ligne.startsWith("cooks running");
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
  assert.match(tete(), /^runtime    never started$/m);

  demarrer(noter);
  noter({ type: "guard.configured", payload: { limits: { durationMs: 1, tokens: 1, idleMs: 1 }, breakerThreshold: 1 } });
  assert.equal(lire(a).forme.etat, "ouverte");
  assert.match(tete(), /^runtime    running according to the log/m);
  assert.match(tete(), /^kitchen    open · breaker closed/m);

  noter({ type: "breaker.opened", payload: { failures: 1, threshold: 1 } });
  assert.equal(lire(a).forme.etat, "retenue");
  assert.match(tete(), /breaker OPEN/);

  noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
  assert.equal(lire(a).forme.etat, "arrêtée");
  assert.match(tete(), /^kitchen    STOPPED by the chef/m);

  noter({ type: "runtime.stopped", payload: { signal: "SIGTERM" } });
  assert.equal(lire(a).forme.etat, "éteinte");
  assert.match(tete(), /^runtime    stopped \d+ min ago/m);
});

test("une connexion Max qui manque, une base rouge : la cuisine est retenue, comme `status` le dit en tête", (t) => {
  const a = `${JOUR_HORLOGE}T11:00:00.000Z`;
  const deconnectee = cuisine(t);
  demarrer(deconnectee.noter);
  deconnectee.noter({ type: "station.announced", payload: { station: "box/claude", engine: "claude", provides: ["opus"], maxCooks: 2 } });
  deconnectee.noter({ type: "station.disconnected", payload: { station: "box/claude", reason: "not-logged-in", run: null } }, null, "station:box/claude");

  assert.equal(deconnectee.lire(a).forme.etat, "retenue");
  assert.ok(deconnectee.lire(a).texte.some((ligne) => ligne.startsWith("connection Max ")));

  const rouge = cuisine(t);
  demarrer(rouge.noter);
  rouge.noter({ type: "base.checked", payload: { sha: "ba5e0004ffff", outcome: "red", gates: { outcome: "red", code: 1, failures: [], tail: "" }, tickets: [] } });

  assert.equal(rouge.lire(a).forme.etat, "retenue");
  assert.ok(rouge.lire(a).texte.some((ligne) => ligne.startsWith("base       RED ")));
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
    { ticket: 378, titre: "", url: null, livre: `${JOUR_HORLOGE}T10:00:18.000Z`, station: null, pr: "https://exemple.test/pull/378", relecture: null },
    { ticket: 16, titre: "Ticket 16", url: "https://exemple.test/16", livre: `${JOUR_HORLOGE}T10:00:14.000Z`, station: null, pr: "https://exemple.test/pull/16", relecture: null },
    { ticket: 15, titre: "Ticket 15", url: "https://exemple.test/15", livre: `${JOUR_HORLOGE}T10:00:12.000Z`, station: "box/claude-opus", pr: "https://exemple.test/pull/15", relecture: null },
    { ticket: 14, titre: "Ticket 14", url: "https://exemple.test/14", livre: `${JOUR_HORLOGE}T10:00:08.000Z`, station: "box/claude", pr: null, relecture: null },
  ]);
  assert.equal(forme.compteurs.livres24h, forme.livres.length);
  // Partis, ils ne sont plus sur le rail : seule la forme des livrés les garde.
  assert.deepEqual(
    forme.rail.map(({ ticket }) => ticket),
    [14, 18],
  );
  // L'adresse d'une livraison hors du rail se compose du dépôt de la box, comme pour `attend`.
  const a = new Date(`${JOUR_HORLOGE}T10:01:00.000Z`);
  assert.equal(faits(lireEtat(journal, a), a, "acme/brigade").livres[0]?.url, "https://github.com/acme/brigade/issues/378");

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

test("un livré porte la relecture de ce qui a été servi, mot pour mot : son résumé et ses constats — aucune quand elle ne porte pas sur la livraison servie, ou ne se lit pas", (t) => {
  const { noter, arriver, lire } = cuisine(t);
  const RESUME = "Les cinq réglages du closer entrent dans les décisions du chef. Ils s'affichent par `station`, non réglé, aucune passe n'écrit.";
  const constats = [
    { severity: "remark", file: "runtime/src/etat.ts", text: "Un commentaire répète le code." },
    { severity: "remark", file: null, text: "À supprimer : l'ancien compteur." },
  ];
  const prendre = (ticket: number) => noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T11:00:00.000Z` } }, ticket, "station:box/claude");
  const juger = (ticket: number, run: string, sha: string) => noter({ type: "pass.started", payload: { run, pr: `https://exemple.test/pull/${ticket}`, number: ticket, sha } }, ticket, "pass");
  const relire = (ticket: number, run: string, sha: string, outcome: "green" | "red" | "unreadable", summary: string | null, findings: unknown[] = []) =>
    noter({ type: "pass.reviewed", payload: { run, sha, review: `review-${ticket}-${sha}`, outcome, summary, findings, reason: null, truncated: false } } as Fait, ticket, "pass");
  const servir = (ticket: number) => {
    noter({ type: "merge.done", payload: { pr: `https://exemple.test/pull/${ticket}`, sha: `m-${ticket}`, by: "pass", reconciled: false } }, ticket, "pass");
    noter({ type: "ticket.served", payload: {} }, ticket);
  };
  for (const ticket of [20, 21, 22, 23, 24]) arriver(ticket, 1);

  // #20 : relu rouge, repris, relu vert — c'est la dernière relecture, celle de ce qui a été servi, qu'il porte.
  prendre(20);
  juger(20, "20-a", "s1");
  relire(20, "20-a", "s1", "red", "Une première livraison, renvoyée.", [{ severity: "blocking", file: null, text: "Il manque le test." }]);
  prendre(20);
  juger(20, "20-b", "s2");
  relire(20, "20-b", "s2", "green", RESUME, constats);
  servir(20);
  // #21 : relu, puis un commit de plus que personne n'a relu avant le merge à la main.
  prendre(21);
  juger(21, "21-a", "s1");
  relire(21, "21-a", "s1", "green", "Ce que disait la première livraison.");
  juger(21, "21-a", "s2");
  servir(21);
  // #22 : la dernière relecture ne se lit pas.
  prendre(22);
  juger(22, "22-a", "s1");
  relire(22, "22-a", "s1", "unreadable", null);
  servir(22);
  // #23 : mergé à la main sans jamais passer à la pass.
  servir(23);
  // #24 : relu dans une prise d'avant, servi sans relecture dans la sienne.
  prendre(24);
  juger(24, "24-a", "s1");
  relire(24, "24-a", "s1", "green", "Une livraison d'une autre prise.");
  prendre(24);
  servir(24);

  const { forme } = lire(`${JOUR_HORLOGE}T10:05:00.000Z`);
  const relectures = new Map(forme.livres.map(({ ticket, relecture }) => [ticket, relecture]));
  // La forme d'une relecture est figée elle aussi, au caractère près.
  assert.equal(
    JSON.stringify(relectures.get(20)),
    `{"resume":${JSON.stringify(RESUME)},"constats":[` +
      `{"gravite":"remarque","fichier":"runtime/src/etat.ts","constat":"Un commentaire répète le code."},` +
      `{"gravite":"remarque","fichier":null,"constat":"À supprimer : l'ancien compteur."}]}`,
  );
  for (const ticket of [21, 22, 23, 24]) assert.equal(relectures.get(ticket), null, `#${ticket}`);
});

test("un livré mergé à la main malgré une relecture rouge en porte les constats bloquants, nommés comme tels", (t) => {
  const { noter, arriver, lire } = cuisine(t);
  arriver(30, 1);
  noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: `${JOUR_HORLOGE}T11:00:00.000Z` } }, 30, "station:box/claude");
  noter({ type: "pass.started", payload: { run: "30-a", pr: null, number: null, sha: "s1" } }, 30, "pass");
  noter(
    { type: "pass.reviewed", payload: { run: "30-a", sha: "s1", review: "review-30", outcome: "red", summary: "Le diff casse la forme.", findings: [{ severity: "blocking", file: "a.ts", text: "La forme change." }], reason: null, truncated: false } },
    30,
    "pass",
  );
  noter({ type: "merge.done", payload: { pr: "https://exemple.test/pull/30", sha: "m-30", by: "outside", reconciled: false } }, 30, "pass");

  assert.deepEqual(lire(`${JOUR_HORLOGE}T10:05:00.000Z`).forme.livres[0]?.relecture, {
    resume: "Le diff casse la forme.",
    constats: [{ gravite: "bloquant", fichier: "a.ts", constat: "La forme change." }],
  });
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
    livres: [],
    urgence: null,
    retenues: [],
    cuisineOisive: null,
    stations: [],
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
  assert.deepEqual(Object.keys(forme), ["etat", "lu", "dernierTick", "compteurs", "dernierEvenement", "rail", "cooks", "attend", "livres", "urgence", "retenues", "cuisineOisive", "stations", "plafondDeCalibrage", "triage", "activiteCuisine", "cadence", "rolesCuisine", "coutDesGates"]);
  // Aucune gate jouée, aucun budget posé : le défaut, rien de dépassé, un jour à zéro.
  assert.deepEqual(forme.coutDesGates, {
    budget: { durationSeconds: 100, cpuSeconds: 400, parLeChef: { durationSeconds: false, cpuSeconds: false } },
    base: { budget: { durationSeconds: 400, cpuSeconds: 1600, parLeChef: { durationSeconds: false, cpuSeconds: false } }, latest: null, overBudget: false },
    latest: null,
    overBudget: false,
    lastDay: { runs: 0, durationSeconds: 0, cpuSeconds: 0 },
    lastHour: { runs: 0, durationSeconds: 0, cpuSeconds: 0 },
    averages: { lastHour: { durationSeconds: null, cpuSeconds: null }, lastDay: { durationSeconds: null, cpuSeconds: null } },
    trend: { durationSeconds: null, cpuSeconds: null },
    ticket: null,
  });
  // Sept jours (UTC), le dernier est aujourd'hui ; aucun triage n'a eu lieu : chaque jour est à zéro, jamais absent.
  assert.equal(forme.triage.length, 7);
  assert.ok(forme.triage.every((jour: { decidedAlone: number; sentToTodo: number }) => jour.decidedAlone === 0 && jour.sentToTodo === 0));
  assert.equal(forme.triage.at(-1).day, new Date().toISOString().slice(0, 10));
  // Personne ne l'a posé : c'est le défaut.
  assert.deepEqual(forme.plafondDeCalibrage, { modele: "opus", effort: "high", parLeChef: { modele: false, effort: false } });
  // La commande lit à l'heure de la machine : le service de cette cuisine,
  // daté du jour de l'horloge des tests, a plus de 24 h.
  assert.deepEqual(forme.compteurs, { rail: 2, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 0 });
  assert.deepEqual(forme.livres, []);
  assert.ok(Math.abs(Date.parse(forme.lu) - Date.now()) < 3_600_000);
  assert.deepEqual([journal.tout(), photographier(journal, PROJECTIONS)], avant);
});

test("le plafond de calibrage se règle d'un geste de `station`, sans redémarrage : `facts` et `station` disent sa valeur et d'où elle vient", async (t) => {
  const { repertoire } = garnie(t);
  const lire = async () => {
    const lancee = appeler(commande, [], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await lancee.fin, 0);
    return JSON.parse(lancee.sortie().split("\n")[0] ?? "").plafondDeCalibrage;
  };
  const station = async (...args: string[]) => {
    const lancee = appeler(montrerStation, args, { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await lancee.fin, 0, lancee.sortie());
    return lancee.sortie();
  };

  assert.match(await station(), /^calibration ceiling +opus \/ high — default — `station -- ceiling-modele <model>`/m);
  assert.match(await station(), /^  ceiling-modele +not set — the default, opus$/m);

  assert.match(await station("ceiling-modele", "sonnet"), /^brigade : ceiling-modele: sonnet \(was: not set\) — read by the runtime at its next read, without a restart/);
  assert.deepEqual(await lire(), { modele: "sonnet", effort: "high", parLeChef: { modele: true, effort: false } });
  assert.match(await station(), /^calibration ceiling +sonnet \(set by you\) \/ high \(default\)/m);

  await station("ceiling-effort", "max");
  assert.deepEqual(await lire(), { modele: "sonnet", effort: "max", parLeChef: { modele: true, effort: true } });
  assert.match(await station(), /^calibration ceiling +sonnet \/ max — set by you, replaces the default opus \/ high/m);

  // Retiré, c'est le défaut qui revient.
  assert.match(await station("remove", "ceiling-modele"), /^brigade : ceiling-modele: withdrawn \(was: sonnet\) — back to the default, opus/);
  assert.deepEqual(await lire(), { modele: "opus", effort: "max", parLeChef: { modele: false, effort: true } });

  // Une valeur que le runtime ne lirait pas est refusée, et rien n'est écrit.
  const refusee = appeler(montrerStation, ["ceiling-effort", "extreme"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await refusee.fin, 2);
  assert.match(refusee.sortie(), /ceiling-effort refused, nothing is written — BRIGADE_CEILING_EFFORT invalid/);
  assert.deepEqual(await lire(), { modele: "opus", effort: "max", parLeChef: { modele: false, effort: true } });
});

test("le plafond et le calibrage que porte le dépôt du projet passent avant ceux de la box : `facts` et `station` le disent, et un geste qui les pose sur la box est dit ignoré", async (t) => {
  const { repertoire } = garnie(t);
  const { clone } = projetSurGit(t, { reglages: { integrationBranch: "v2", defaultCalibrations: { manager: { model: "opus", effort: "high" } }, calibrationCeiling: { model: "sonnet", effort: "low" } } });
  const env = { BRIGADE_STATE_DIR: repertoire, BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: "v2" };
  const lire = async () => {
    const lancee = appeler(commande, [], env);
    assert.equal(await lancee.fin, 0);
    return JSON.parse(lancee.sortie().split("\n")[0] ?? "").plafondDeCalibrage;
  };
  const station = async (...args: string[]) => {
    const lancee = appeler(montrerStation, args, env);
    assert.equal(await lancee.fin, 0, lancee.sortie());
    return lancee.sortie();
  };

  assert.deepEqual(await lire(), { modele: "sonnet", effort: "low", parLeChef: { modele: false, effort: false }, depuisLeDepot: true });
  assert.match(await station(), /^calibration ceiling +sonnet \/ low — from the project's repository \(\.claude\/brigade\/projet\.json\), replaces what is set on the box — a pull request on \.claude\/brigade\/projet\.json to change it$/m);
  assert.match(await station(), /^  manager-modele +opus — from the project's repository \(\.claude\/brigade\/projet\.json\)$/m);

  // Posé sur la box, il est écrit — et dit ignoré tant que le dépôt le porte.
  assert.match(await station("ceiling-modele", "opus"), /^brigade : ceiling-modele: opus \(was: not set\) — read by the runtime.*\nbut the project's repository sets it \(\.claude\/brigade\/projet\.json: sonnet\): this decision is ignored while it does$/m);
  assert.deepEqual(await lire(), { modele: "sonnet", effort: "low", parLeChef: { modele: false, effort: false }, depuisLeDepot: true });
  assert.match(await station(), /^  ceiling-modele +sonnet — from the project's repository \(\.claude\/brigade\/projet\.json\); set on the box: opus, ignored$/m);
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
    noter({ type: "cook.launched", payload: { run, limits: { durationMs: 1, tokens: 1, idleMs: 1 }, stream: `runs/${run}.jsonl`, station } }, numero);
  const activite = (a = `${JOUR_HORLOGE}T10:10:00.000Z`) => lire(a).forme.rail.find((surLeRail) => surLeRail.ticket === 14)?.activite;
  const { lire } = c;
  return { ...c, rail, ticket, lancer, activite };
}

test("la carte d'un ticket pris dit ce que son cook fait en ce moment, et depuis quand : la station prépare son poste, il démarre, il lit, il écrit — puis elle livre", (t) => {
  const { noter, lancer, activite, lire, ticket } = auTravail(t);
  assert.equal(ticket()?.state, "taken");
  assert.deepEqual(activite(), { fait: "la station prépare le poste du cook", faitEn: "the station is setting up the cook's post", cible: null, depuis: `${JOUR_HORLOGE}T10:00:02.000Z` });

  lancer("14-a"); // 10:00:03
  assert.deepEqual(activite(), { fait: "démarre", faitEn: "starting", cible: null, depuis: `${JOUR_HORLOGE}T10:00:03.000Z` });

  noter({ type: "cook.progressed", payload: { run: "14-a", turns: 3, tokens: 300, activity: { doing: "reading", target: "runtime/src/etat.ts", since: `${JOUR_HORLOGE}T10:00:03.500Z` } } }, 14);
  assert.deepEqual(activite(), { fait: "lit", faitEn: "reading", cible: "runtime/src/etat.ts", depuis: `${JOUR_HORLOGE}T10:00:03.500Z` });
  noter({ type: "cook.progressed", payload: { run: "14-a", turns: 9, tokens: 900, activity: { doing: "fixing-tests", target: "app/src/bon.ts", since: `${JOUR_HORLOGE}T10:00:04.500Z` } } }, 14);
  assert.deepEqual(activite(), { fait: "tests rouges, corrige", faitEn: "tests red, fixing", cible: "app/src/bon.ts", depuis: `${JOUR_HORLOGE}T10:00:04.500Z` });
  // `status` le dit aussi, sur la ligne du cook : là où il en est, depuis quand.
  assert.ok(lire(`${JOUR_HORLOGE}T10:10:00.000Z`).texte.some((ligne) => ligne.startsWith("  #14  14-a  ") && ligne.endsWith("right now: tests red, fixing app/src/bon.ts, since 9 min")));

  noter({ type: "cook.exited", payload: { run: "14-a", outcome: "ok", code: 0, signal: null, turns: 10, tokens: 1000, durationMs: 1 } }, 14);
  assert.equal(ticket()?.state, "taken");
  assert.deepEqual(activite(), { fait: "la station livre son travail", faitEn: "the station is delivering the work", cible: null, depuis: `${JOUR_HORLOGE}T10:00:06.000Z` });
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
  assert.deepEqual(activite(), { fait: "attend la pass", faitEn: "waiting for the pass", cible: null, depuis: `${JOUR_HORLOGE}T10:00:04.000Z` });

  noter({ type: "pass.started", payload: { run: "14-a", pr: "https://exemple.test/pr/1", number: 1, sha: "abc" } }, 14); // 10:00:06
  assert.deepEqual(activite(), { fait: "gates en cours", faitEn: "running the gates", cible: null, depuis: `${JOUR_HORLOGE}T10:00:06.000Z` });

  lancer("review-14-x", "reviewer", null); // 10:00:07
  assert.deepEqual(activite(), { fait: "relecture en cours", faitEn: "review in progress", cible: null, depuis: `${JOUR_HORLOGE}T10:00:07.000Z` });
  // La relecture d'un autre ticket n'est pas la sienne.
  lancer("review-140-y", "reviewer", null);
  assert.deepEqual(activite(), { fait: "relecture en cours", faitEn: "review in progress", cible: null, depuis: `${JOUR_HORLOGE}T10:00:07.000Z` });

  noter({ type: "cook.exited", payload: { run: "review-14-x", outcome: "ok", code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1 } }); // 10:00:09
  noter({ type: "pass.reviewed", payload: { run: "14-a", sha: "abc", review: "review-14-x", outcome: "green", summary: null, findings: [], reason: null, truncated: false } }, 14);
  assert.deepEqual(activite(), { fait: "jugement en cours", faitEn: "judging", cible: null, depuis: `${JOUR_HORLOGE}T10:00:09.000Z` });

  const gates = { outcome: "green" as const, code: 0, failures: [], tail: "" };
  noter(
    { type: "pass.judged", payload: { run: "14-a", pr: "https://exemple.test/pr/1", number: 1, sha: "abc", verdict: "green", gates, ci: { outcome: "none", checks: [] }, findings: [], judgeModified: false, review: { outcome: "green", run: "review-14-x", summary: null, findings: [] }, noDiff: false } },
    14,
  ); // 10:00:11
  assert.deepEqual(activite(), { fait: "jugée verte, la pass décide", faitEn: "judged green, the pass decides", cible: null, depuis: `${JOUR_HORLOGE}T10:00:11.000Z` });
});
