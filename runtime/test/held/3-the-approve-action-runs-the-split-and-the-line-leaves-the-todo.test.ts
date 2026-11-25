// #4271, critère 3 : l'action d'approbation d'un id tenu fait comme `manager approve <id>` : le découpage se fait et la ligne quitte le TODO.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { magasinDeNiveaux } from "../../src/autonomie/agents/niveaux.ts";
import { porteDesGestes } from "../../src/autonomie/agents/porte.ts";
import { ouvrirDecoupage, type Atelier } from "../../src/decoupage.ts";
import { empreinteDEpique } from "../../src/decouper.ts";
import type { Ajout } from "../../src/evenements.ts";
import type { TicketPrevu } from "../../src/events/manager.ts";
import type { IssueOuverte } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal as status } from "../../src/status.ts";
import { appeler, repertoireTemporaire } from "../outils.ts";

const PROJET = "held";
const A9 = () => new Date("2026-11-25T09:30:00.000Z");
const PREVU: TicketPrevu = { title: "The rail counts its tickets", context: "c", criteria: ["a test covers it"], waitsFor: [], zone: ["runtime/src/rail.ts"], model: "sonnet", effort: "low", calibration: "small and clear" };

// A manager whose split-epic level is `propose`, with the epics `numeros` already split in its log, on one state
// directory shared by the log, the gate and `status`. GitHub is a fake that records the tickets and comments.
function cuisine(t: TestContext, numeros: number[] = [30]) {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "manager split-epic", "propose");
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } } as Ajout);
  const epics = new Map<number, IssueOuverte>();
  for (const n of numeros) {
    const epic = { number: n, title: `Count the tickets ${n}`, body: "The chef wants to see how many tickets wait.", labels: ["epic"], association: "OWNER", state: "open", createdAt: "2026-11-25T09:00:00Z", updatedAt: "2026-11-25T09:00:00Z" } as unknown as IssueOuverte;
    epics.set(n, epic);
    journal.ajouter({ project: PROJET, ticket: n, author: "manager", type: "manager.split", payload: { run: `r${n}`, fingerprint: empreinteDEpique(epic as never, []), reason: "one ticket per part", order: "as given", tickets: [PREVU, { ...PREVU, title: "The doc says the count", zone: ["docs/runtime.md"] }] } } as Ajout);
  }
  const creees: string[] = [];
  const commentaires: Array<[number, string]> = [];
  const github = {
    issue: async (numero: number) => epics.get(numero) ?? null,
    creerIssue: async ({ titre }: { titre: string }) => (creees.push(titre), 500 + creees.length),
    commentaires: async () => [],
    commenter: async (numero: number, corps: string) => void commentaires.push([numero, corps]),
    labelliser: async () => {},
    delabelliser: async () => {},
  };
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A9 });
  const decoupage = ouvrirDecoupage({
    journal,
    github,
    depotGitHub: "acme/shop",
    fichiers: () => [],
    noter: (ticket: number | null, fait: object) => journal.ajouter({ project: PROJET, ticket, author: "manager", ...fait } as Ajout),
    demander: async () => null,
    peutJuger: () => false,
    arrete: () => false,
    eteint: () => false,
    avertir: () => {},
    signature: () => "",
    porte,
  } as unknown as Atelier);
  const traiter = async (n: number) => decoupage.traiter(epics.get(n) as IssueOuverte, []);
  // `status`, as the chef reads it right now.
  const lire = async () => {
    const commande = appeler(status, [], { BRIGADE_STATE_DIR: repertoire });
    await commande.fin;
    return commande.sortie();
  };
  return { repertoire, porte, creees, commentaires, traiter, lire };
}
// The contract the app builds against (runtime/src/held/held.ts): `gestesTenus(repertoire)` lists the held gestures
// of a project, `approuverGesteTenu(repertoire, id)` is the approve action.
import { approuverGesteTenu, gestesTenus } from "../../src/held/held.ts";

test("the approve action for a held id runs the split and the line leaves the TODO, as `manager approve` does", async (t) => {
  const c = cuisine(t);
  assert.equal(await c.traiter(30), false);
  const [tenu] = gestesTenus(c.repertoire);
  assert.ok(tenu, "the split is listed as held");
  assert.match(String(tenu.summary), /split #30 into 2 tickets/);
  assert.deepEqual(c.creees, []);
  assert.match(await c.lire(), /split #30 into 2 tickets/);

  await approuverGesteTenu(c.repertoire, tenu.id);
  // The runtime does it at its next tick, as for the chef's command.
  await c.porte.relever();
  assert.deepEqual(c.creees, ["The rail counts its tickets", "The doc says the count"]);
  assert.deepEqual(gestesTenus(c.repertoire), []);
  assert.doesNotMatch(await c.lire(), /split #30 into 2 tickets/);

  // Done once: a second approval does not split again.
  await c.porte.relever();
  assert.equal(c.creees.length, 2);
});
