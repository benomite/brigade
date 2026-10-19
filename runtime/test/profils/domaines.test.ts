// Les domaines qui méritent un profil : des tickets servis écrits au journal
// comme le runtime les écrit — leur fiche, leur prise, leurs essais, leur
// merge —, et les zones que la mesure en relève.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { domainesDuJournal, releverLesDomaines, ticketsServis, type TicketServi } from "../../src/profils/domaines.ts";
import { ECART_PAR_DEFAUT, FENETRE_PAR_DEFAUT, lireReglagesDesProfils, TICKETS_PAR_DEFAUT } from "../../src/profils/reglages.ts";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { ConfigInvalide } from "../../src/runtime.ts";
import { horloge, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const PROJET = "brigade";
const PAR_DEFAUT = lireReglagesDesProfils({});

function journalDeTest(t: TestContext): Journal {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  t.after(() => journal.fermer());
  return journal;
}

// Un ticket à servir. `zone` : celle de sa fiche, absente s'il n'en porte
// pas. `essais` : le nombre de cooks lancés avant sa fin. `merge` : faux s'il
// est servi sans diff. `titre` : son titre, où se lit son type.
type Service = { ticket: number; zone?: string[]; essais?: number; merge?: boolean; titre?: string; illisible?: boolean };

let runs = 0;
function servir(journal: Journal, { ticket, zone, essais = 1, merge = true, titre = `ticket ${ticket}`, illisible = false }: Service): void {
  const noter = (fait: object) => journal.ajouter({ project: PROJET, ticket, author: "runtime", ...fait } as never);
  const card = zone === undefined ? null : { waitsFor: [], zone, problems: illisible ? ["clé inconnue « zones »"] : [] };
  noter({ type: "ticket.arrived", payload: { title: titre, priority: 3, createdAt: `${JOUR_HORLOGE}T09:00:00.000Z`, url: `https://github.com/benomite/brigade/issues/${ticket}`, card } });
  noter({ type: "ticket.taken", payload: { station: "box/claude", leaseUntil: JOUR_HORLOGE } });
  for (let i = 0; i < essais; i++) {
    const run = `run-${++runs}`;
    noter({ type: "cook.launched", payload: { run, limits: { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 }, stream: `runs/${run}.jsonl`, station: "box/claude" } });
    noter({ type: "cook.exited", payload: { run, outcome: i === essais - 1 ? "ok" : "failed", code: i === essais - 1 ? 0 : 1, signal: null, turns: 1, tokens: 1, durationMs: 1 } });
  }
  if (merge) noter({ type: "merge.done", payload: { pr: `https://github.com/benomite/brigade/pull/${ticket}`, sha: null, by: "pass", reconciled: false } });
  else noter({ type: "pass.served", payload: { verdict: 1 } });
}

// Des tickets d'une zone, dont `premiers` livrés du premier coup et les autres
// au deuxième essai, numérotés à partir de `depuis`.
const tickets = (depuis: number, combien: number, premiers: number, zone: string[], reste: Partial<Service> = {}): Service[] =>
  Array.from({ length: combien }, (_, i) => ({ ticket: depuis + i, zone, essais: i < premiers ? 1 : 2, ...reste }));

const VUE = ["app/src/vue"];
const RUNTIME = ["runtime/src"];

// Vingt tickets servis et mergés, 16 du premier coup : 80 % pour le projet.
// `app/src/vue` en porte cinq, 3 du premier coup : 60 %, 20 points dessous.
const VINGT_POINTS = [...tickets(1, 5, 3, VUE), ...tickets(6, 15, 13, RUNTIME)];

function journalDe(t: TestContext, services: Service[]): Journal {
  const journal = journalDeTest(t);
  for (const service of services) servir(journal, service);
  return journal;
}

test("les seuils de départ : 5 tickets sur les 20 derniers servis, 20 points sous la moyenne ; l'environnement les ajuste, une valeur illisible refuse", () => {
  assert.deepEqual([TICKETS_PAR_DEFAUT, FENETRE_PAR_DEFAUT, ECART_PAR_DEFAUT], [5, 20, 20]);
  assert.deepEqual(PAR_DEFAUT, { fenetre: 20, tickets: 5, ecart: 20 });
  assert.deepEqual(lireReglagesDesProfils({ BRIGADE_PROFILE_WINDOW: "30", BRIGADE_PROFILE_MIN_TICKETS: "6", BRIGADE_PROFILE_GAP_POINTS: "15" }), { fenetre: 30, tickets: 6, ecart: 15 });
  assert.deepEqual(lireReglagesDesProfils({ BRIGADE_PROFILE_WINDOW: "", BRIGADE_PROFILE_MIN_TICKETS: "", BRIGADE_PROFILE_GAP_POINTS: "" }), PAR_DEFAUT);
  for (const brut of ["0", "-3", "2.5", "cinq"]) {
    assert.throws(() => lireReglagesDesProfils({ BRIGADE_PROFILE_WINDOW: brut }), (erreur) => erreur instanceof ConfigInvalide && erreur.message.includes("BRIGADE_PROFILE_WINDOW"), brut);
    assert.throws(() => lireReglagesDesProfils({ BRIGADE_PROFILE_MIN_TICKETS: brut }), (erreur) => erreur instanceof ConfigInvalide && erreur.message.includes("BRIGADE_PROFILE_MIN_TICKETS"), brut);
  }
  for (const brut of ["0", "-5", "101", "vingt"]) {
    assert.throws(() => lireReglagesDesProfils({ BRIGADE_PROFILE_GAP_POINTS: brut }), (erreur) => erreur instanceof ConfigInvalide && erreur.message.includes("BRIGADE_PROFILE_GAP_POINTS"), brut);
  }
  // Plus de tickets que la fenêtre n'en montre : aucun domaine ne serait jamais relevé.
  assert.throws(() => lireReglagesDesProfils({ BRIGADE_PROFILE_WINDOW: "4" }), /BRIGADE_PROFILE_MIN_TICKETS/);
});

test("sur 20 tickets servis, une zone portée par exactement 5 d'entre eux et livrée du premier coup 20 points sous la moyenne est un domaine relevé", (t) => {
  const releve = domainesDuJournal(journalDe(t, VINGT_POINTS).base, PAR_DEFAUT);
  assert.deepEqual({ servis: releve.servis, premiers: releve.premiers, retenus: releve.retenus }, { servis: 20, premiers: 16, retenus: 20 });
  // `runtime/src` : 13 sur 15, au-dessus de la moyenne — pas un domaine.
  assert.deepEqual(releve.domaines, [{ zone: "app/src/vue", tickets: [1, 2, 3, 4, 5], premiers: 3, retenus: 5, ecart: 20 }]);
});

test("une zone portée par 4 tickets seulement n'est pas relevée, même loin sous la moyenne", (t) => {
  // `app/src/vue` : 4 tickets, 2 du premier coup (50 %) ; le projet : 16 sur 20 (80 %), 30 points au-dessus.
  const journal = journalDe(t, [...tickets(1, 4, 2, VUE), ...tickets(5, 16, 14, RUNTIME)]);
  const releve = domainesDuJournal(journal.base, PAR_DEFAUT);
  assert.equal(releve.premiers * 100 / releve.retenus, 80);
  assert.deepEqual(releve.domaines, []);
});

test("une zone sur 5 tickets, livrée 19 points seulement sous la moyenne, n'est pas relevée : le seuil se compare sans arrondi", (t) => {
  // `app/src/vue` : 5 tickets, dont un servi sans diff — 3 sur 4 mergés du premier coup (75 %).
  // Le projet : 18 sur 19 mergés (94,7 %) — 19,7 points d'écart, sous les 20.
  const journal = journalDe(t, [...tickets(1, 4, 3, VUE), { ticket: 5, zone: VUE, merge: false }, ...tickets(6, 15, 15, RUNTIME)]);
  const releve = domainesDuJournal(journal.base, PAR_DEFAUT);
  assert.deepEqual({ servis: releve.servis, premiers: releve.premiers, retenus: releve.retenus }, { servis: 20, premiers: 18, retenus: 19 });
  assert.deepEqual(releve.domaines, []);
  // Le même écart, sous un seuil de 19 points : relevé, et l'écart dit tel quel.
  const [domaine] = domainesDuJournal(journal.base, { ...PAR_DEFAUT, ecart: 19 }).domaines;
  assert.equal(domaine?.zone, "app/src/vue");
  assert.equal(Math.floor(domaine?.ecart ?? 0), 19);
});

test("un ticket qui porte deux zones compte une fois dans chacune", (t) => {
  const deux = ["runtime/src/profils", "runtime/test/profils"];
  const journal = journalDe(t, [...tickets(1, 5, 3, deux), ...tickets(6, 15, 13, RUNTIME)]);
  assert.deepEqual(domainesDuJournal(journal.base, PAR_DEFAUT).domaines, [
    { zone: "runtime/src/profils", tickets: [1, 2, 3, 4, 5], premiers: 3, retenus: 5, ecart: 20 },
    { zone: "runtime/test/profils", tickets: [1, 2, 3, 4, 5], premiers: 3, retenus: 5, ecart: 20 },
  ]);
  // Une zone écrite deux fois sur la même fiche ne compte qu'une fois pour son ticket.
  const servis: TicketServi[] = [...tickets(1, 5, 3, ["app/src/vue", "app/src/vue/"]), ...tickets(6, 15, 13, RUNTIME)].map(({ ticket, zone = [], essais }) => ({ ticket, zone, premierCoup: essais === 1 }));
  assert.deepEqual(releverLesDomaines(servis, PAR_DEFAUT).domaines.map(({ zone, tickets }) => ({ zone, tickets })), [{ zone: "app/src/vue", tickets: [1, 2, 3, 4, 5] }]);
});

test("le type du ticket n'a aucun effet : les mêmes tickets, de types différents, donnent le même relevé", (t) => {
  const types = ["feat", "fix", "tech"];
  const enFeature = domainesDuJournal(journalDe(t, VINGT_POINTS.map((service) => ({ ...service, titre: `feat: ticket ${service.ticket}` }))).base, PAR_DEFAUT);
  const melanges = domainesDuJournal(journalDe(t, VINGT_POINTS.map((service, i) => ({ ...service, titre: `${types[i % types.length]}: ticket ${service.ticket}` }))).base, PAR_DEFAUT);
  // Les tickets de la zone en correctifs, ceux du reste en features : rien ne bouge.
  const separes = domainesDuJournal(journalDe(t, VINGT_POINTS.map((service) => ({ ...service, titre: `${service.zone === VUE ? "fix" : "feat"}: ticket ${service.ticket}` }))).base, PAR_DEFAUT);
  assert.deepEqual(melanges, enFeature);
  assert.deepEqual(separes, enFeature);
  assert.deepEqual(enFeature.domaines.map(({ zone }) => zone), ["app/src/vue"]);
});

test("chacun des trois seuils, réglé dans l'environnement du projet, change le relevé", (t) => {
  const quatre = journalDe(t, [...tickets(1, 4, 2, VUE), ...tickets(5, 16, 14, RUNTIME)]);
  assert.deepEqual(domainesDuJournal(quatre.base, PAR_DEFAUT).domaines, []);
  assert.deepEqual(domainesDuJournal(quatre.base, lireReglagesDesProfils({ BRIGADE_PROFILE_MIN_TICKETS: "4" })).domaines.map(({ zone, tickets }) => ({ zone, tickets })), [{ zone: "app/src/vue", tickets: [1, 2, 3, 4] }]);

  const vingt = journalDe(t, VINGT_POINTS);
  assert.deepEqual(domainesDuJournal(vingt.base, lireReglagesDesProfils({ BRIGADE_PROFILE_GAP_POINTS: "21" })).domaines, []);
  // Une fenêtre de 15 ne voit plus les cinq tickets de `app/src/vue`, servis les premiers.
  const quinze = domainesDuJournal(vingt.base, lireReglagesDesProfils({ BRIGADE_PROFILE_WINDOW: "15" }));
  assert.deepEqual({ servis: quinze.servis, domaines: quinze.domaines }, { servis: 15, domaines: [] });
});

test("seuls comptent les derniers tickets servis : ni un ticket en cours, ni ceux d'avant la fenêtre", (t) => {
  const journal = journalDe(t, [...tickets(101, 5, 0, ["docs"]), ...VINGT_POINTS]);
  // Un ticket pris, pas encore servi : hors du relevé.
  journal.ajouter({ project: PROJET, ticket: 200, author: "runtime", type: "ticket.taken", payload: { station: "box/claude", leaseUntil: JOUR_HORLOGE } } as never);
  const releve = domainesDuJournal(journal.base, PAR_DEFAUT);
  assert.equal(releve.servis, 20);
  assert.deepEqual(releve.domaines.map(({ zone }) => zone), ["app/src/vue"]);
  // Sur 25, les cinq tickets de `docs`, jamais livrés du premier coup, entrent dans la fenêtre — et
  // la moyenne tombe à 64 % : `app/src/vue`, à 60 %, n'est plus assez loin dessous.
  assert.deepEqual(domainesDuJournal(journal.base, { ...PAR_DEFAUT, fenetre: 25 }).domaines.map(({ zone }) => zone), ["docs"]);
});

test("un ticket sans fiche, ou à la fiche illisible, compte dans la fenêtre et la moyenne, dans aucune zone", (t) => {
  const journal = journalDe(t, [
    ...tickets(1, 5, 3, VUE),
    { ticket: 6, essais: 1 },
    { ticket: 7, zone: VUE, essais: 2, illisible: true },
    ...tickets(8, 13, 12, RUNTIME),
  ]);
  const servis = ticketsServis(journal.base);
  assert.deepEqual(servis.slice(5, 7), [{ ticket: 6, zone: [], premierCoup: true }, { ticket: 7, zone: [], premierCoup: false }]);
  const releve = domainesDuJournal(journal.base, PAR_DEFAUT);
  // Le projet : 16 sur 20 ; `app/src/vue` : ses cinq tickets lisibles, 3 du premier coup.
  assert.deepEqual({ premiers: releve.premiers, retenus: releve.retenus }, { premiers: 16, retenus: 20 });
  assert.deepEqual(releve.domaines.map(({ zone, tickets }) => ({ zone, tickets })), [{ zone: "app/src/vue", tickets: [1, 2, 3, 4, 5] }]);
});

test("la zone d'un ticket est celle que sa fiche portait quand il a été servi", (t) => {
  const journal = journalDe(t, tickets(1, 5, 0, VUE));
  // Sa fiche corrigée après son service ne déplace pas un ticket servi.
  journal.ajouter({ project: PROJET, ticket: 1, author: "runtime", type: "ticket.changed", payload: { title: "ticket 1", priority: 3, card: { waitsFor: [], zone: ["docs"], problems: [] } } } as never);
  assert.deepEqual(ticketsServis(journal.base)[0], { ticket: 1, zone: VUE, premierCoup: false });
});
