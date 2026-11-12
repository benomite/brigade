// Le rail bloqué (#3358) : des tickets `fire` qu'aucun manager n'a pris au-delà du délai — combien, depuis combien de
// temps, la cause en mots simples, et le geste qui débloque quand il y en a un.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DE_CONFIANCE } from "../../src/alimenter.ts";
import { corpsDePriseDuManager, corpsDeTravailFait, estUnePriseDuManager } from "../../src/github-etat/prise-du-manager.ts";
import { MARQUEUR_MANAGER } from "../../src/juger.ts";
import { lireLesNonPris } from "../../src/rail-bloque/lecture.ts";
import { AUTEURS_DE_CONFIANCE, DELAI_MS, diagnostiquer, MARQUE_DE_PRISE, MARQUEUR_DU_MANAGER, prisParUnManager, type StationDuCompte, type StationsLues, type TicketNonPris } from "../../src/rail-bloque/rail-bloque.ts";

const DEPOT = "benomite/secondes";
const MAINTENANT = Date.parse("2026-11-12T02:30:00.000Z");
// Huit tickets `fire` posés la veille à 12:25 : quatorze heures avant.
const HUIT: TicketNonPris[] = [4, 5, 6, 7, 8, 9, 10, 11].map((ticket) => ({ ticket, depuis: "2026-11-11T12:25:00.000Z" }));
const station = (name: string, autres: Partial<StationDuCompte> = {}): StationDuCompte => ({ name, lastSeen: "2026-11-12T02:29:00.000Z", stoppedAt: null, refreshMs: 120_000, selection: [DEPOT], ...autres });
const avec = (...lues: StationDuCompte[]): StationsLues => ({ lues });
const diagnostic = (stations: StationsLues, nonPris = HUIT) => diagnostiquer({ depot: DEPOT, nonPris, stations, maintenant: MAINTENANT });

describe("le diagnostic", () => {
  test("aucune station ne sert le projet : la cause le dit, et le geste est de l'ajouter à une station", () => {
    for (const stations of [avec(), avec(station("box", { selection: ["benomite/autre"] })), avec(station("box", { selection: null }))]) {
      const bloque = diagnostic(stations);
      assert.equal(bloque?.cause, "aucune-station");
      assert.equal(bloque?.geste, "ajouter-a-une-station");
      assert.equal(bloque?.phrase, "8 tickets on the rail, no manager has taken them for 14 h: no station serves this project. Add the project to a station.");
    }
  });

  test("la station qui le sert est arrêtée : elle est nommée, et le geste est de la démarrer", () => {
    const bloque = diagnostic(avec(station("box", { lastSeen: "2026-11-11T12:00:00.000Z", stoppedAt: "2026-11-11T12:01:00.000Z" })));
    assert.equal(bloque?.cause, "arretee");
    assert.deepEqual(bloque?.stations, ["box/claude"]);
    assert.equal(bloque?.geste, "demarrer-la-station");
    assert.equal(bloque?.constat, "8 tickets on the rail, no manager has taken them for 14 h: its station box/claude is stopped.");
    assert.equal(bloque?.phrase, `${bloque?.constat} Start the station.`);
  });

  test("la station qui le sert s'est tue : hors ligne, le geste est de la démarrer", () => {
    const bloque = diagnostic(avec(station("Mac de Chef", { lastSeen: "2026-11-11T12:00:00.000Z" })));
    assert.equal(bloque?.cause, "hors-ligne");
    assert.equal(bloque?.phrase, "8 tickets on the rail, no manager has taken them for 14 h: its station mac-de-chef/claude is offline. Start the station.");
  });

  test("la station qui le sert n'a plus de quota GitHub : jusqu'à quand, et aucun geste", () => {
    const heldBy = { limit: "primary", since: "2026-11-12T02:00:00.000Z", until: "2026-11-12T03:05:00.000Z" };
    const bloque = diagnostic(avec(station("box", { heldBy })));
    assert.equal(bloque?.cause, "sans-quota");
    assert.equal(bloque?.geste, null);
    assert.equal(bloque?.phrase, "8 tickets on the rail, no manager has taken them for 14 h: its station box/claude is out of GitHub quota until 03:05 UTC.");
  });

  test("une station en ligne le sert : son manager tourne mais ne prend rien, et aucun geste", () => {
    const bloque = diagnostic(avec(station("box"), station("pc", { lastSeen: "2026-11-11T12:00:00.000Z" })));
    assert.equal(bloque?.cause, "manager-muet");
    assert.deepEqual(bloque?.stations, ["box/claude"]);
    assert.equal(bloque?.geste, null);
    assert.equal(bloque?.phrase, "8 tickets on the rail, no manager has taken them for 14 h: the manager runs on box/claude but takes nothing.");
  });

  test("les stations ne se lisent pas : la cause n'est pas devinée, et aucun geste", () => {
    const bloque = diagnostic({ illisibles: "GitHub refused" });
    assert.equal(bloque?.cause, "inconnue");
    assert.equal(bloque?.geste, null);
    assert.match(bloque?.phrase ?? "", /: the cause is not known: your stations could not be read\.$/);
  });

  test("un seul ticket se dit au singulier ; le compte et la durée sont ceux des tickets qui ont passé le délai", () => {
    const recent = { ticket: 12, depuis: new Date(MAINTENANT - 60_000).toISOString() };
    const bloque = diagnostic(avec(), [{ ticket: 3, depuis: "2026-11-12T02:00:00.000Z" }, recent]);
    assert.deepEqual(bloque?.tickets, [3]);
    assert.match(bloque?.phrase ?? "", /^1 ticket on the rail, no manager has taken it for 30 min: /);
  });

  test("aucun ticket non pris, ou le délai pas encore passé : rien n'est bloqué", () => {
    assert.equal(diagnostic(avec(), []), null);
    assert.equal(diagnostic(avec(), [{ ticket: 4, depuis: new Date(MAINTENANT - DELAI_MS).toISOString() }]), null);
    assert.equal(diagnostic(avec(), [{ ticket: 4, depuis: new Date(MAINTENANT - 60_000).toISOString() }]), null);
    assert.ok(DELAI_MS <= 10 * 60_000, "a short delay of a few minutes");
  });
});

describe("pris par un manager", () => {
  test("ses marques sont celles du runtime : la prise du manager, son jugement, ses auteurs de confiance", () => {
    for (const corps of [corpsDePriseDuManager("box/claude", "ab12", "cd34"), corpsDeTravailFait("box/claude", "ab12", "cd34")]) {
      assert.ok(estUnePriseDuManager(corps));
      assert.match(corps, MARQUE_DE_PRISE);
    }
    assert.equal(MARQUEUR_DU_MANAGER, MARQUEUR_MANAGER);
    assert.deepEqual(AUTEURS_DE_CONFIANCE, DE_CONFIANCE);
  });

  test("qualifié, écarté, en cuisson, pris ou jugé par le manager : pris ; sinon, non", () => {
    assert.ok(prisParUnManager(["fire", "model:opus"], []));
    assert.ok(prisParUnManager(["fire", "effort:medium"], []));
    for (const label of ["blocked-on-human", "question", "taken", "in-pass", "waiting"]) assert.ok(prisParUnManager(["fire", label], []), label);
    assert.ok(prisParUnManager(["fire"], [{ body: corpsDePriseDuManager("box/claude", "ab12", "cd34"), association: "OWNER" }]));
    assert.ok(prisParUnManager(["fire"], [{ body: `${MARQUEUR_MANAGER}\nA ticket.`, association: "MEMBER" }]));
    assert.ok(!prisParUnManager(["fire", "prio:1"], [{ body: "When will this ship?", association: "OWNER" }]));
    // Tout le monde peut commenter une issue publique : une marque d'un inconnu ne compte pas.
    assert.ok(!prisParUnManager(["fire"], [{ body: corpsDePriseDuManager("box/claude", "ab12", "cd34"), association: "NONE" }]));
  });
});

describe("la lecture sur GitHub", () => {
  const issue = (number: number, labels: string[], autres: Record<string, unknown> = {}) => ({ number, title: `#${number}`, body: "", created_at: "2026-11-01T00:00:00Z", labels: labels.map((name) => ({ name })), ...autres });
  const ISSUES = [
    issue(4, ["fire"]),
    issue(5, ["fire", "model:opus", "effort:medium"]),
    issue(6, ["fire"]),
    issue(7, ["fire"], { pull_request: {} }),
    issue(8, ["fire"], { body: "<!-- brigade:tickets -->\n- [ ] #9\n<!-- /brigade:tickets -->" }),
    issue(10, ["fire", "kitchen-board"]),
  ];
  const REPONSES: Record<string, unknown> = {
    [`/repos/${DEPOT}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`]: ISSUES,
    [`/repos/${DEPOT}/issues/4/comments?per_page=100`]: [{ body: "Any news?", author_association: "OWNER" }],
    [`/repos/${DEPOT}/issues/4/events?per_page=100`]: [{ event: "labeled", label: { name: "prio:1" }, created_at: "2026-11-10T00:00:00Z" }, { event: "labeled", label: { name: "fire" }, created_at: "2026-11-11T12:25:00Z" }],
    [`/repos/${DEPOT}/issues/6/comments?per_page=100`]: [{ body: corpsDePriseDuManager("box/claude", "ab12", "cd34"), author_association: "OWNER" }],
  };

  test("les tickets `fire` qu'aucun manager n'a pris, depuis la pose de `fire` — ni PR, ni épique, ni tableau de la cuisine", async () => {
    const lus: string[] = [];
    const nonPris = await lireLesNonPris({ depot: DEPOT, lire: async (chemin) => (lus.push(chemin), REPONSES[chemin] ?? assert.fail(`not dictated: ${chemin}`)) });
    assert.deepEqual(nonPris, [{ ticket: 4, depuis: "2026-11-11T12:25:00Z" }]);
    // #5 est qualifié d'après ses labels : ses commentaires ne se lisent pas.
    assert.ok(!lus.some((chemin) => chemin.includes("/issues/5/")));
  });

  test("sans pose de `fire` dans ses événements, depuis l'ouverture de l'issue", async () => {
    const nonPris = await lireLesNonPris({ depot: DEPOT, issues: [issue(4, ["fire"])], lire: async (chemin) => (chemin.endsWith("/comments?per_page=100") || chemin.endsWith("/events?per_page=100") ? [] : assert.fail(chemin)) });
    assert.deepEqual(nonPris, [{ ticket: 4, depuis: "2026-11-01T00:00:00Z" }]);
  });

  test("une lecture qui échoue fait échouer le tout : jamais un rail dit calme faute de l'avoir lu", async () => {
    await assert.rejects(lireLesNonPris({ depot: DEPOT, lire: async () => { throw new Error("GitHub answered HTTP 502"); } }), /HTTP 502/);
    await assert.rejects(lireLesNonPris({ depot: DEPOT, issues: [issue(4, ["fire"])], lire: async () => ({ message: "Not Found" }) }), /comments of #4/);
  });
});
