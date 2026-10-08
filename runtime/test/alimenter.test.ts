import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { alimenter, avecRail, configRail, priorite } from "../src/alimenter.ts";
import { MARQUEUR } from "../src/fiche.ts";
import type { Commentaire, GitHub, Issue } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { ouvrirRail } from "../src/rail.ts";
import { ConfigInvalide, demarrer } from "../src/runtime.ts";
import { DEPOT, jusqua, repertoireTemporaire } from "./outils.ts";

const CIBLE = { projet: "brigade", depot: DEPOT };

function issue(number: number, options: Partial<Issue> = {}): Issue {
  return {
    number,
    title: `Ticket ${number}`,
    labels: ["fire"],
    state: "open",
    createdAt: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`,
    updatedAt: "2026-10-08T09:00:00Z",
    url: `https://github.com/${DEPOT}/issues/${number}`,
    ...options,
  };
}

// Un GitHub de test : ce que le dépôt contient, que le test modifie à la main.
function depot(...issues: Issue[]) {
  const etat = new Map(issues.map((i) => [i.number, i]));
  const compte = { sondages: 0, confirmes: 0, lectures: 0, commentaires: 0, fermetures: 0 };
  const commentaires = new Map<number, Commentaire[]>();
  let confirme = false;
  let panne: Error | null = null;
  let sansCommentaires = false;
  const github: GitHub = {
    async tickets() {
      compte.sondages++;
      if (panne) throw panne;
      if (confirme) return { inchange: true };
      const ouvertes = [...etat.values()].filter((i) => i.state === "open" && i.labels.includes("fire"));
      return { inchange: false, issues: ouvertes, confirmer: () => void ((confirme = true), compte.confirmes++) };
    },
    async issue(numero) {
      compte.lectures++;
      return etat.get(numero) ?? null;
    },
    async commentaires(numero) {
      compte.commentaires++;
      if (sansCommentaires) throw new Error("gh api : HTTP 502");
      return commentaires.get(numero) ?? [];
    },
    commenter: async () => {},
    ouvrirPR: async () => "",
    prDeBranche: async () => null,
    ci: async () => [],
    merger: async () => ({ fait: true }),
    fermerIssue: async () => {},
    fermer: () => void compte.fermetures++,
  };
  return {
    github,
    compte,
    poser(i: Issue) {
      etat.set(i.number, i);
      confirme = false;
    },
    retirer(numero: number) {
      etat.delete(numero);
      confirme = false;
    },
    // Pose les commentaires d'une issue — ce qui, sur GitHub, la modifie.
    commenter(numero: number, updatedAt: string, ...corps: Array<string | Partial<Commentaire>>) {
      commentaires.set(numero, corps.map((c) => ({ body: "", author: "chef", association: "OWNER", ...(typeof c === "string" ? { body: c } : c) })));
      const connue = etat.get(numero);
      if (connue) etat.set(numero, { ...connue, updatedAt });
      confirme = false;
    },
    tomber: (erreur: Error | null) => void (panne = erreur),
    perdreLesCommentaires: (perdus: boolean) => void (sansCommentaires = perdus),
  };
}

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  return { journal, rail: ouvrirRail(journal, { projet: "brigade", dureeBailMs: 600_000 }) };
}

const faits = (journal: ReturnType<typeof ouvrirJournal>) => journal.tout().map((e) => [e.ticket, e.type, e.author]);

test("la priorité d'un ticket se lit dans ses labels", () => {
  assert.equal(priorite(["fire", "prio:2", "feature"]), 2);
  assert.equal(priorite(["prio:3", "prio:1"]), 1);
  assert.equal(priorite(["fire", "prio:haute"]), null);
  assert.equal(priorite(["prio:0"]), null);
  assert.equal(priorite(["prio:10"]), null);
  assert.equal(priorite(["prio:99999999999999999999", "prio:2"]), 2);
  assert.equal(priorite([]), null);
});

test("les issues ouvertes qui portent le label arrivent sur le rail, une fois", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14, { labels: ["fire", "prio:1"] }), issue(13, { labels: ["feature"] }), issue(12, { state: "closed" }));

  assert.equal(await alimenter(journal, gh.github, CIBLE), 1);
  assert.equal(await alimenter(journal, gh.github, CIBLE), 0);

  assert.deepEqual(faits(journal), [[14, "ticket.arrived", "github"]]);
  assert.deepEqual(
    rail.tickets().map((ticket) => [ticket.ticket, ticket.title, ticket.priority, ticket.createdAt, ticket.state]),
    [[14, "Ticket 14", 1, "2026-10-01T00:00:14Z", "waiting"]],
  );
  assert.equal(gh.compte.confirmes, 1);
});

test("le calibrage posé sur l'issue arrive avec le ticket, et ses changements sont journalisés", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14, { labels: ["fire", "model:sonnet"] }));
  await alimenter(journal, gh.github, CIBLE);
  assert.deepEqual(rail.tickets().map((ticket) => [ticket.model, ticket.effort]), [["sonnet", null]]);

  gh.poser(issue(14, { labels: ["fire", "model:sonnet", "effort:low"], updatedAt: "2026-10-08T11:00:00Z" }));
  assert.equal(await alimenter(journal, gh.github, CIBLE), 1);

  assert.deepEqual(journal.duTicket(14).at(-1)?.payload, { title: "Ticket 14", priority: null, model: "sonnet", effort: "low", card: null });
  assert.deepEqual(rail.tickets().map((ticket) => [ticket.model, ticket.effort]), [["sonnet", "low"]]);
});

const ficheDe = (...lignes: string[]) => [MARQUEUR, "**Fiche du ticket**", ...lignes].join("\n");

test("la fiche posée en commentaire arrive avec le ticket ; corrigée à la main, elle est relue et journalisée", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14), issue(15), issue(16));
  gh.commenter(16, "2026-10-08T09:00:00Z", "Un commentaire.", ficheDe("- attend : #14, #15", "- zone : runtime/src/rail.ts"));

  assert.equal(await alimenter(journal, gh.github, CIBLE), 3);
  assert.deepEqual(rail.tickets().map((ticket) => ticket.card), [null, null, { waitsFor: [14, 15], zone: ["runtime/src/rail.ts"], problems: [] }]);

  gh.commenter(16, "2026-10-08T11:00:00Z", ficheDe("- attend : #14", "- zone : runtime/src/rail.ts, docs/"));
  assert.equal(await alimenter(journal, gh.github, CIBLE), 1);
  assert.equal(await alimenter(journal, gh.github, CIBLE), 0);

  const [type, payload] = [journal.duTicket(16).at(-1)?.type, journal.duTicket(16).at(-1)?.payload];
  assert.deepEqual([type, payload], [
    "ticket.changed",
    { title: "Ticket 16", priority: null, model: null, effort: null, card: { waitsFor: [14], zone: ["runtime/src/rail.ts", "docs/"], problems: [] } },
  ]);
  assert.deepEqual(rail.tickets()[2]?.card?.waitsFor, [14]);
});

test("une fiche supprimée se reporte aussi : le ticket n'en porte plus", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14));
  gh.commenter(14, "2026-10-08T09:00:00Z", ficheDe("- zone : docs/"));
  await alimenter(journal, gh.github, CIBLE);

  gh.commenter(14, "2026-10-08T11:00:00Z");
  assert.equal(await alimenter(journal, gh.github, CIBLE), 1);

  assert.equal(rail.tickets()[0]?.card, null);
});

test("une fiche que le runtime ne comprend pas arrive avec ses problèmes : le rail les porte", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14));
  gh.commenter(14, "2026-10-08T09:00:00Z", ficheDe("- budget : 40 tours"), ficheDe("- attend : #15"));

  await alimenter(journal, gh.github, CIBLE);

  assert.match(rail.tickets()[0]?.card?.problems[0] ?? "", /2 fiches/);
});

test("un ticket attendu qui ne désigne aucune issue, ou le ticket lui-même, rend la fiche illisible", async (t) => {
  const { journal, rail } = cuisine(t);
  // #12 est fermée et #13 hors du rail : elles existent, on peut les attendre.
  const gh = depot(issue(12, { state: "closed" }), issue(13, { labels: [] }), issue(14), issue(15));
  gh.commenter(14, "2026-10-08T09:00:00Z", ficheDe("- attend : #12, #13, #15, #14, #99"));

  await alimenter(journal, gh.github, CIBLE);

  const card = rail.tickets()[0]?.card;
  assert.deepEqual(card?.waitsFor, [12, 13, 15, 14, 99]);
  assert.deepEqual(card?.problems, ["attend : #14 est ce ticket lui-même", "attend : #99 ne désigne aucune issue du dépôt"]);
});

test("une fiche posée par qui n'a pas la main sur le dépôt est ignorée, et le runtime le dit", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14));
  const erreurs = t.mock.method(console, "error", () => {});
  gh.commenter(14, "2026-10-08T09:00:00Z", { body: ficheDe("- zone : /"), author: "passant", association: "NONE" }, ficheDe("- zone : docs/"));

  await alimenter(journal, gh.github, CIBLE);

  assert.deepEqual(rail.tickets()[0]?.card, { waitsFor: [], zone: ["docs/"], problems: [] });
  assert.equal(erreurs.mock.callCount(), 1);
  assert.match(String(erreurs.mock.calls[0]?.arguments[0]), /fiche ignorée sur le ticket #14 — posée par passant.*NONE/);
});

test("les commentaires ne se relisent que pour les issues qui ont changé", async (t) => {
  const { journal } = cuisine(t);
  const gh = depot(issue(14), issue(15), issue(16, { title: "" }));
  t.mock.method(console, "error", () => {});
  const fiches = new Map();
  await alimenter(journal, gh.github, CIBLE, fiches);
  assert.equal(gh.compte.commentaires, 2);

  gh.poser(issue(15, { title: "Renommé", updatedAt: "2026-10-08T11:00:00Z" }));
  await alimenter(journal, gh.github, CIBLE, fiches);
  assert.equal(gh.compte.commentaires, 3);

  await alimenter(journal, gh.github, CIBLE, fiches);
  assert.equal(gh.compte.commentaires, 3);
  assert.deepEqual([...fiches.keys()], [14, 15]);

  gh.poser(issue(14, { state: "closed", updatedAt: "2026-10-08T12:00:00Z" }));
  await alimenter(journal, gh.github, CIBLE, fiches);
  assert.deepEqual([...fiches.keys()], [15]);
});

test("des commentaires illisibles font échouer le sondage entier : rien n'arrive sans sa fiche, et le suivant rattrape", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14));
  gh.commenter(14, "2026-10-08T09:00:00Z", ficheDe("- zone : docs/"));
  const fiches = new Map();

  gh.perdreLesCommentaires(true);
  await assert.rejects(alimenter(journal, gh.github, CIBLE, fiches), /HTTP 502/);
  assert.deepEqual([rail.tickets(), gh.compte.confirmes], [[], 0]);

  gh.perdreLesCommentaires(false);
  assert.equal(await alimenter(journal, gh.github, CIBLE, fiches), 1);
  assert.deepEqual(rail.tickets()[0]?.card?.zone, ["docs/"]);
});

test("un label de priorité hors plage ne gèle pas le sondage : le ticket arrive sans priorité, les autres aussi", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14, { labels: ["fire", "prio:99999999999999999999"] }), issue(15, { labels: ["fire", "prio:1"] }));

  assert.equal(await alimenter(journal, gh.github, CIBLE), 2);

  assert.deepEqual(rail.tickets().map((ticket) => [ticket.ticket, ticket.priority]), [[15, 1], [14, null]]);
});

test("une issue illisible est écartée seule : les autres arrivent et partent quand même", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14), issue(16));
  await alimenter(journal, gh.github, CIBLE);
  const erreurs = t.mock.method(console, "error", () => {});

  gh.poser(issue(15, { title: "" }));
  gh.poser(issue(17, { createdAt: undefined as never }));
  gh.poser(issue(18));
  gh.poser(issue(16, { state: "closed", updatedAt: "2026-10-08T11:00:00Z" }));
  assert.equal(await alimenter(journal, gh.github, CIBLE), 2);

  assert.deepEqual(rail.tickets().map((ticket) => ticket.ticket), [14, 18]);
  assert.equal(erreurs.mock.callCount(), 2);
  assert.match(String(erreurs.mock.calls[0]?.arguments[0]), /issue GitHub illisible, écartée du rail.*"number":15/);
});

test("une issue fermée disparaît du rail, même prise ; le journal dit pourquoi", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14), issue(15));
  await alimenter(journal, gh.github, CIBLE);
  assert.equal(rail.prendre("box/claude")?.ticket, 14);

  gh.poser(issue(14, { state: "closed", updatedAt: "2026-10-08T11:00:00Z" }));
  await alimenter(journal, gh.github, CIBLE);

  assert.deepEqual(rail.tickets().map((ticket) => ticket.ticket), [15]);
  const [depart] = journal.duTicket(14).slice(-1);
  assert.deepEqual([depart?.type, depart?.author, depart?.payload], ["ticket.left", "github", { reason: "closed" }]);
});

test("une issue qui perd son label quitte le rail ; une issue supprimée aussi", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14), issue(15), issue(16));
  await alimenter(journal, gh.github, CIBLE);

  gh.poser(issue(14, { labels: ["feature"], updatedAt: "2026-10-08T11:00:00Z" }));
  gh.retirer(15);
  await alimenter(journal, gh.github, CIBLE);

  assert.deepEqual(rail.tickets().map((ticket) => ticket.ticket), [16]);
  assert.deepEqual(
    journal.tout().slice(-2).map((e) => [e.ticket, e.payload]),
    [[14, { reason: "unfired" }], [15, { reason: "gone" }]],
  );
});

test("une issue qui retrouve son label revient sur le rail, en attente", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14));
  await alimenter(journal, gh.github, CIBLE);
  rail.prendre("box/claude");
  gh.poser(issue(14, { labels: [], updatedAt: "2026-10-08T11:00:00Z" }));
  await alimenter(journal, gh.github, CIBLE);

  gh.poser(issue(14, { updatedAt: "2026-10-08T12:00:00Z" }));
  await alimenter(journal, gh.github, CIBLE);

  assert.deepEqual(rail.tickets().map((ticket) => [ticket.ticket, ticket.state, ticket.station]), [[14, "waiting", null]]);
});

test("un titre ou une priorité qui change se reporte sur le rail sans toucher à l'état", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14), issue(15));
  await alimenter(journal, gh.github, CIBLE);
  rail.prendre("box/claude");

  gh.poser(issue(14, { title: "Renommé", labels: ["fire", "prio:2"], updatedAt: "2026-10-08T11:00:00Z" }));
  gh.poser(issue(15, { labels: ["fire", "tech"], updatedAt: "2026-10-08T11:00:00Z" }));
  assert.equal(await alimenter(journal, gh.github, CIBLE), 1);

  assert.deepEqual(
    rail.tickets().map((ticket) => [ticket.ticket, ticket.title, ticket.priority, ticket.state]),
    [[14, "Renommé", 2, "taken"], [15, "Ticket 15", null, "waiting"]],
  );
});

test("chaque fait de GitHub entre au journal sous une clé unique : le même changement ne s'écrit qu'une fois", async (t) => {
  const { journal } = cuisine(t);
  const gh = depot(issue(14));
  await alimenter(journal, gh.github, CIBLE);
  const [arrivee] = journal.tout();
  assert.ok(arrivee);

  const { seq: _seq, at: _at, ...fait } = arrivee;
  const doublon = journal.ajouter({ ...fait, dedupKey: `github:${DEPOT}#14:ticket.arrived:2026-10-08T09:00:00Z` });

  assert.equal(doublon, null);
  assert.equal(journal.tout().length, 1);
});

test("GitHub en panne : le rail reste tel quel, et le sondage suivant rattrape tout", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14));
  await alimenter(journal, gh.github, CIBLE);

  gh.tomber(new Error("réseau coupé"));
  gh.poser(issue(15));
  gh.poser(issue(14, { state: "closed", updatedAt: "2026-10-08T11:00:00Z" }));
  await assert.rejects(alimenter(journal, gh.github, CIBLE), /réseau coupé/);
  assert.deepEqual(rail.tickets().map((ticket) => ticket.ticket), [14]);

  gh.tomber(null);
  assert.equal(await alimenter(journal, gh.github, CIBLE), 2);
  assert.deepEqual(rail.tickets().map((ticket) => ticket.ticket), [15]);
});

test("un ticket absent de la liste mais toujours ouvert et labellisé reste sur le rail, et le sondage n'est pas confirmé", async (t) => {
  const { journal, rail } = cuisine(t);
  const gh = depot(issue(14));
  await alimenter(journal, gh.github, CIBLE);
  // La liste ne le montre plus, mais l'issue relue l'est de nouveau : rouverte
  // entre les deux requêtes.
  const github: GitHub = {
    ...gh.github,
    tickets: async () => ({ inchange: false, issues: [], confirmer: () => assert.fail("sondage confirmé à tort") }),
  };

  assert.equal(await alimenter(journal, github, CIBLE), 0);

  assert.deepEqual(rail.tickets().map((ticket) => ticket.ticket), [14]);
});

test("la configuration du rail vient de l'environnement ; le dépôt n'a pas de défaut", () => {
  assert.deepEqual(configRail({ BRIGADE_GITHUB_REPO: "benomite/brigade" }), { depot: "benomite/brigade", dureeBailMs: 1_800_000, gh: "gh" });
  assert.deepEqual(
    configRail({ BRIGADE_GITHUB_REPO: "benomite/brigade.v2", BRIGADE_LEASE_SECONDS: "90", BRIGADE_GH_BIN: "/tmp/gh" }),
    { depot: "benomite/brigade.v2", dureeBailMs: 90_000, gh: "/tmp/gh" },
  );
  assert.throws(() => configRail({}), (e: unknown) => e instanceof ConfigInvalide && /BRIGADE_GITHUB_REPO n'est pas défini/.test(e.message));
  for (const depot of ["brigade", "benomite/brigade/issues", "https://github.com/benomite/brigade", "benomite/ brigade"]) {
    assert.throws(() => configRail({ BRIGADE_GITHUB_REPO: depot }), /BRIGADE_GITHUB_REPO invalide/);
  }
  for (const bail of ["0", "-5", "dix", "1.5"]) {
    assert.throws(() => configRail({ BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_LEASE_SECONDS: bail }), /BRIGADE_LEASE_SECONDS invalide/);
  }
});

function service(t: TestContext, gh: ReturnType<typeof depot>, options: { maintenant?: () => Date } = {}) {
  const runtime = avecRail(
    demarrer({ repertoireEtat: repertoireTemporaire(t), projet: "brigade", intervalleVeilleMs: 60_000, intervalleTickMs: 2 }),
    { depot: DEPOT, dureeBailMs: 600_000, gh: "gh", github: gh.github, ...options },
  );
  t.after(() => runtime.arreter("test"));
  return runtime;
}

test("le runtime sonde GitHub dès le démarrage, puis à chaque tick", async (t) => {
  const gh = depot(issue(14));
  const runtime = service(t, gh);
  await jusqua(() => runtime.rail.tickets().length === 1);

  gh.poser(issue(15));

  await jusqua(() => runtime.rail.tickets().length === 2);
  assert.deepEqual(runtime.rail.tickets().map((ticket) => ticket.ticket), [14, 15]);
});

test("au tick, un bail échu rend son ticket sans que personne ne le demande", async (t) => {
  let instant = Date.parse("2026-10-08T10:00:00.000Z");
  const runtime = service(t, depot(issue(14)), { maintenant: () => new Date(instant) });
  await jusqua(() => runtime.rail.tickets().length === 1);
  runtime.rail.prendre("box/claude");

  instant += 600_000;

  await jusqua(() => runtime.rail.tickets()[0]?.state === "waiting");
  assert.deepEqual(runtime.journal.duTicket(14).map((e) => e.type), ["ticket.arrived", "ticket.taken", "ticket.released"]);
});

test("GitHub en panne n'arrête pas le runtime : il le dit, et reprend quand GitHub revient", async (t) => {
  const gh = depot(issue(14));
  gh.tomber(new Error("réseau coupé"));
  const erreurs = t.mock.method(console, "error", () => {});
  const runtime = service(t, gh);
  await jusqua(() => gh.compte.sondages >= 2);
  assert.match(String(erreurs.mock.calls[0]?.arguments[0]), /sondage GitHub en échec — réseau coupé/);

  gh.tomber(null);

  await jusqua(() => runtime.rail.tickets().length === 1);
});

test("arrêté, le runtime abandonne le sondage en cours et n'en lance plus", async (t) => {
  const gh = depot(issue(14));
  const runtime = service(t, gh);
  await jusqua(() => runtime.rail.tickets().length === 1);

  runtime.arreter("SIGTERM");
  const sondages = gh.compte.sondages;
  await new Promise((resoudre) => setTimeout(resoudre, 20));

  assert.equal(gh.compte.fermetures, 1);
  assert.equal(gh.compte.sondages, sondages);
});

test("après un redémarrage, le rail est celui d'avant — sans rien redemander à GitHub", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const gh = depot(issue(14, { labels: ["fire", "prio:1"] }), issue(15), issue(16));
  const options = { depot: DEPOT, dureeBailMs: 600_000, gh: "gh", github: gh.github };
  const premier = avecRail(demarrer({ repertoireEtat: repertoire, projet: "brigade" }), options);
  await jusqua(() => premier.rail.tickets().length === 3);
  premier.rail.prendre("box/claude");
  premier.rail.quatreVingtSix(15, { motif: "quota", retour: new Date("2099-01-01T00:00:00.000Z") });
  const avant = lireRail(premier.journal.base);
  premier.arreter("SIGTERM");

  gh.tomber(new Error("réseau coupé"));
  t.mock.method(console, "error", () => {});
  const second = avecRail(demarrer({ repertoireEtat: repertoire, projet: "brigade" }), options);
  t.after(() => second.arreter("test"));

  assert.deepEqual(second.rail.tickets(), avant);
  assert.deepEqual(avant.map((ticket) => [ticket.ticket, ticket.state]), [[14, "taken"], [15, "86"], [16, "waiting"]]);
});
