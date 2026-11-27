// #4039: the gestures of the other agents go through the same gate as the closer's. The supervisor's run is held on
// `propose` until the chef's approval; the manager's split of an epic creates its tickets at once by default (#4247),
// and is held until approved when the chef sets it to `propose`. GitHub is a fake that counts its calls; the clock is given; no `claude` is launched.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { enregistrementDe, OUTCOME } from "../../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux } from "../../../src/autonomie/agents/niveaux.ts";
import { gestesEnAttente, porteDesGestes } from "../../../src/autonomie/agents/porte.ts";
import { ouvrirDecoupage, type Atelier } from "../../../src/decoupage.ts";
import { empreinteDEpique } from "../../../src/decouper.ts";
import type { Ajout } from "../../../src/evenements.ts";
import type { TicketPrevu } from "../../../src/events/manager.ts";
import type { IssueOuverte } from "../../../src/github.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import type { FaitsDuProjet } from "../../../src/superviseur/declencheur.ts";
import { superviseur } from "../../../src/superviseur/superviseur.ts";
import { FauxDepot } from "../../superviseur/faux-depot.ts";
import { repertoireTemporaire } from "../../outils.ts";

const A = (hhmm: string) => () => new Date(`2026-11-23T${hhmm}:00.000Z`);

// A supervisor's run, woken by #40 taken three times, whose manager asks to put #40 back on the rail. #40 is held off the
// rail without being parked (`served-elsewhere`): a parked ticket is refused (#4129).
async function unRun(t: TestContext, projet: string, options: { repertoireEtat?: string; porte?: ReturnType<typeof porteDesGestes> }) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const depot = new FauxDepot();
  depot.issue(40, ["served-elsewhere"]);
  const pris: FaitsDuProjet = { dernierMerge: null, cuisinables: [], prises: [{ ticket: 40, prises: 3 }], mainRougeDepuis: null };
  const consultations = { n: 0 };
  await superviseur({
    projet,
    depot: "acme/shop",
    sources: { journal, github: depot.client(), branche: "main", ...(options.repertoireEtat === undefined ? {} : { repertoireEtat: options.repertoireEtat }) },
    manager: async () => (consultations.n++, { saw: "#40 does not move", gesture: { gesture: "back-on-rail", ticket: 40, note: "the client answered" } }),
    maintenant: A("17:01"),
    ...(options.porte === undefined ? {} : { porte: options.porte }),
  })(pris);
  return { depot, consultations };
}

test("the supervisor on propose: its gesture is not done until the chef's approval, then once, and logged", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const projet = "porte-superviseur";
  magasinDeNiveaux(repertoire).poser(projet, "supervisor", "propose");
  const porte = porteDesGestes({ repertoire, projet, horloge: A("17:01") });
  const { depot, consultations } = await unRun(t, projet, { repertoireEtat: repertoire, porte });
  assert.equal(consultations.n, 1);
  assert.deepEqual(depot.ecrits(), []);
  assert.deepEqual(depot.labelsDe(40), ["served-elsewhere"]);
  assert.deepEqual(enregistrementDe(repertoire, "supervisor").gestures, []);
  assert.deepEqual(gestesEnAttente(repertoire).map(({ id, agent, line, reason }) => ({ id, agent, line, reason })), [{ id: 1, agent: "supervisor", line: 'back-on-rail {"ticket":40,"note":"the client answered"}', reason: "#40 was taken 3 times without delivering" }]);

  await porte.approuver(1);
  assert.deepEqual(depot.labelsDe(40), ["fire"]);
  assert.equal((depot.commentaires.get(40) ?? []).length, 1);
  const { gestures } = enregistrementDe(repertoire, "supervisor");
  assert.equal(gestures.length, 1);
  assert.match(gestures[0]?.line ?? "", /^put #40 back on the rail/);
  assert.equal(gestures[0]?.outcome, OUTCOME.FIXED_BY_SELF);

  assert.equal(await porte.approuver(1), null);
  assert.equal((depot.commentaires.get(40) ?? []).length, 1);
});

test("a supervisor given no gate takes the one of its state directory, at its level; with no state directory, it acts as before, with no log", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const projet = "porte-superviseur-defaut";
  magasinDeNiveaux(repertoire).poser(projet, "supervisor", "propose");
  const tenu = await unRun(t, projet, { repertoireEtat: repertoire });
  assert.deepEqual(tenu.depot.labelsDe(40), ["served-elsewhere"]);
  assert.deepEqual(gestesEnAttente(repertoire).map(({ agent }) => agent), ["supervisor"]);

  const sans = await unRun(t, projet, {});
  assert.deepEqual(sans.depot.labelsDe(40), ["fire"]);
});

const PREVU: TicketPrevu = { title: "The rail counts its tickets", context: "c", criteria: ["a test covers it"], waitsFor: [], zone: ["runtime/src/rail.ts"], model: "sonnet", effort: "low", calibration: "small and clear" };

// An epic the manager has split, in its log, and the split that carries it to GitHub.
function epiqueDecoupee(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const projet = "porte-manager";
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const epic: IssueOuverte = { number: 30, title: "Count the tickets", body: "The chef wants to see how many tickets wait.", labels: ["epic"], association: "OWNER", state: "open", createdAt: "2026-11-23T09:00:00Z", updatedAt: "2026-11-23T09:00:00Z" } as unknown as IssueOuverte;
  journal.ajouter({ project: projet, ticket: 30, author: "manager", type: "manager.split", payload: { run: "r1", fingerprint: empreinteDEpique(epic as never, []), reason: "one ticket per part", order: "as given", tickets: [PREVU, { ...PREVU, title: "The doc says the count", zone: ["docs/runtime.md"] }] } } as Ajout);
  const creees: string[] = [];
  const github = {
    issue: async (numero: number) => (numero === 30 ? epic : null),
    creerIssue: async ({ titre }: { titre: string }) => (creees.push(titre), 500 + creees.length),
    commentaires: async () => [],
    commenter: async () => {},
    labelliser: async () => {},
    delabelliser: async () => {},
  };
  const avertissements: string[] = [];
  const porte = porteDesGestes({ repertoire, projet, horloge: A("09:30") });
  const decoupage = ouvrirDecoupage({
    journal,
    github,
    depotGitHub: "acme/shop",
    fichiers: () => [],
    noter: (ticket: number | null, fait: object) => journal.ajouter({ project: projet, ticket, author: "manager", ...fait } as Ajout),
    demander: async () => null,
    peutJuger: () => false,
    arrete: () => false,
    eteint: () => false,
    avertir: (texte: string) => void avertissements.push(texte),
    signature: () => "",
    porte,
  } as unknown as Atelier);
  return { repertoire, epic, creees, porte, avertissements, traiter: () => decoupage.traiter(epic, []) };
}

// The chef still puts the split back on hold by setting its level (#4247): unchanged.
test("the manager's split of an epic set to propose is held: no ticket is created until the chef's approval, then each once", async (t) => {
  const { repertoire, creees, porte, avertissements, traiter } = epiqueDecoupee(t);
  magasinDeNiveaux(repertoire).poser("porte-manager", "manager split-epic", "propose");
  assert.equal(await traiter(), false);
  assert.equal(await traiter(), false);
  assert.deepEqual(creees, []);
  assert.deepEqual(enregistrementDe(repertoire, "manager").gestures, []);
  assert.deepEqual(gestesEnAttente(repertoire).map(({ id, agent, line }) => ({ id, agent, line })), [{ id: 1, agent: "manager", line: "split the epic #30 into 2 tickets" }]);
  assert.match(avertissements[0] ?? "", /split of the epic #30 held for the chef's OK \(gesture 1\) — it creates its tickets once approved/);

  await porte.approuver(1);
  assert.deepEqual(creees, ["The rail counts its tickets", "The doc says the count"]);
  assert.deepEqual(enregistrementDe(repertoire, "manager").gestures, [{ at: A("09:30")().toISOString(), line: "split the epic #30 into 2 tickets", reason: "one ticket per part", outcome: OUTCOME.FIXED_BY_SELF }]);
  assert.equal(await porte.approuver(1), null);
  assert.equal(creees.length, 2);
});

test("the manager's split of an epic set to act creates its tickets at once, and logs it", async (t) => {
  const { repertoire, creees, traiter } = epiqueDecoupee(t);
  magasinDeNiveaux(repertoire).poser("porte-manager", "manager split-epic", "act");
  assert.equal(await traiter(), true);
  assert.equal(creees.length, 2);
  assert.deepEqual(enregistrementDe(repertoire, "manager").gestures.map(({ line }) => line), ["split the epic #30 into 2 tickets"]);
  assert.deepEqual(gestesEnAttente(repertoire), []);
});

test("by default, the manager's split of an epic creates its tickets at the same pass, with no chef's OK and nothing held (#4247)", async (t) => {
  const { repertoire, creees, avertissements, traiter } = epiqueDecoupee(t);
  assert.equal(await traiter(), true);
  assert.deepEqual(creees, ["The rail counts its tickets", "The doc says the count"]);
  assert.deepEqual(enregistrementDe(repertoire, "manager").gestures.map(({ line }) => line), ["split the epic #30 into 2 tickets"]);
  assert.deepEqual(gestesEnAttente(repertoire), []);
  assert.deepEqual(avertissements, []);
});

test("an epic whose split was held for the chef's OK before the delivery is split at the next pass, and no longer pending (#4247)", async (t) => {
  const { repertoire, creees, traiter } = epiqueDecoupee(t);
  magasinDeNiveaux(repertoire).poser("porte-manager", "manager split-epic", "propose");
  assert.equal(await traiter(), false);
  assert.equal(gestesEnAttente(repertoire).length, 1);
  // The level goes back to its default, as on a station whose chef never set it.
  writeFileSync(join(repertoire, "autonomy-levels.json"), "{}\n");
  assert.equal(await traiter(), true);
  assert.equal(creees.length, 2);
  assert.deepEqual(gestesEnAttente(repertoire), []);
});
