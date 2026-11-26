// Le superviseur branché sur la boucle du runtime (#3945, `superviseur/brancher.ts`) : à
// chaque réveil, ce que le tour GitHub seul a vu passe au superviseur ; réveillé, il
// donne au manager du projet sa consigne et son dossier, et joue le geste rendu. Le
// runtime est réduit à son journal et à son réveil, que le test donne à la main ; le
// GitHub du projet est le vrai client sur un faux dépôt (`faux-depot.ts`).
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { GitHubDuTour } from "../../src/brigade-github.ts";
import { cartesEnTodo } from "../../src/carte-todo.ts";
import { ticketDuCheck } from "../../src/carte-ci-windows.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import type { Runtime } from "../../src/runtime.ts";
import { brancherSuperviseur, type ManagerDuSuperviseur } from "../../src/superviseur/brancher.ts";
import { suivreLeTour, type SuiviDuTour } from "../../src/superviseur/tour.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";
import { FauxDepot } from "./faux-depot.ts";

const A = (hhmm: string) => `2026-11-20T${hhmm}:00.000Z`;
const RERUN = JSON.stringify({ saw: "main is red on tests (linux)", gesture: { gesture: "fix", cause: "tests fail on linux", title: "Fix the linux tests", body: "Red.", check: "tests (linux)" } });

// Un projet branché : son journal, son tour observé, son faux dépôt — `tests (linux)` rouge, run 7 —, et le manager
// que le test fait répondre. `reveiller` joue un réveil du runtime ; `lu` fait lire au tour les checks de la base.
function projet(t: TestContext, options: { tour?: boolean; manager?: ManagerDuSuperviseur | null; github?: (depot: FauxDepot) => ReturnType<FauxDepot["client"]> } = {}) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  let instant = A("10:00");
  const maintenant = () => new Date(instant);
  const depot = new FauxDepot();
  depot.checkRouge("tests (linux)", 7);
  const tour = suivreLeTour(maintenant);
  const checks = [{ name: "tests (linux)", outcome: "red" as const }, { name: "runtime-windows", outcome: "red" as const }];
  const client = tour.envelopper({ checksDeLaBase: async () => checks, fires: async () => [{ number: 40, title: "Ticket 40", labels: ["fire"], state: "open" }], commenter: async () => {} } as unknown as GitHubDuTour);
  const consignes: string[] = [];
  let manager = options.manager === undefined ? async (consigne: string) => (consignes.push(consigne), { message: RERUN }) : options.manager;
  const dits: string[] = [];
  let ecouter: (() => void) | null = null;
  const runtime = { projet: "shop", journal, surReveil: (ecoute: () => void) => ((ecouter = ecoute), () => {}) } as unknown as Runtime;
  const rendu = brancherSuperviseur(runtime, {
    tour: options.tour === false ? null : tour,
    github: options.github?.(depot) ?? depot.client(),
    depot: "acme/shop",
    branche: "main",
    consulter: () => {
      const lui = manager;
      return lui === null ? null : async (consigne) => lui(consigne);
    },
    maintenant,
    dire: (ligne) => void dits.push(ligne),
  });
  assert.equal(rendu, runtime);
  return {
    journal,
    depot,
    tour: tour as SuiviDuTour,
    consignes,
    dits,
    a: (hhmm: string) => void (instant = A(hhmm)),
    lu: () => client.checksDeLaBase(),
    // #40, pris trois fois sans livrer : la station l'a écrit sur son issue.
    pris: () => client.commenter(40, "<!-- brigade:echec n=3 -->\nStation `box/claude`: the cook stopped without a delivery — boom"),
    reveiller: () => ecouter?.(),
    manager: (autre: ManagerDuSuperviseur | null) => void (manager = autre),
    noter: (fait: Fait) => journal.ajouter({ project: "shop", ticket: null, author: "chef", ...fait }),
  };
}

test("main rouge depuis 10 min : le manager reçoit la consigne du superviseur et son dossier, et le geste qu'il rend se joue", async (t) => {
  const p = projet(t);
  await p.lu();
  p.tour.sauter(12, "#12: no station provides `gpu`");
  p.a("10:09");
  p.reveiller();
  assert.deepEqual(p.consignes, []);
  p.a("10:11");
  p.reveiller();
  await jusqua(() => p.depot.creees().length > 0);
  assert.equal(p.depot.creees().length, 1);
  assert.deepEqual(p.depot.relances(), []);
  const [consigne] = p.consignes;
  assert.match(consigne ?? "", /^Tu es le manager de la brigade sur le dépôt acme\/shop, et le superviseur de ce run/);
  assert.match(consigne ?? "", /"cause": "main-red"/);
  assert.match(consigne ?? "", /"skipped": \[\]/);
  assert.deepEqual(p.dits, []);
});

test("ce que la porte de prise a dit des cuisinables qu'elle a sautés va au dossier du manager", async (t) => {
  const p = projet(t);
  const fires = p.tour.envelopper({ fires: async () => [{ number: 12, title: "GPU", labels: ["fire", "model:opus", "effort:medium"], state: "open" }] } as unknown as GitHubDuTour);
  await fires.fires();
  await p.lu();
  p.tour.sauter(12, "#12: no station provides `gpu`");
  p.a("10:11");
  p.reveiller();
  await jusqua(() => p.depot.creees().length > 0);
  assert.match(p.consignes[0] ?? "", /"skipped": \[\n\s+"#12: no station provides `gpu`"\n\s+\]/);
});

test("le code d'un saut, `zone-held` et la PR qui tient la zone, va au dossier du manager avec sa ligne (#4242)", async (t) => {
  const p = projet(t);
  const fires = p.tour.envelopper({ fires: async () => [{ number: 61, title: "README", labels: ["fire", "model:opus", "effort:medium"], state: "open" }] } as unknown as GitHubDuTour);
  await fires.fires();
  await p.lu();
  p.tour.sauter(61, "#61: zone held by open PR #4077", undefined, { code: "zone-held", pr: 4077 });
  p.a("10:11");
  p.reveiller();
  await jusqua(() => p.depot.creees().length > 0);
  assert.match(p.consignes[0] ?? "", /"skipReasons": \[\n\s+\{\n\s+"ticket": 61,\n\s+"code": "zone-held",\n\s+"pr": 4077\n\s+\}\n\s+\]/);
});

test("un check Windows rouge sur la base garde sa carte dans TODO, lue du même tour (#2413) ; avant toute lecture, aucune", async (t) => {
  const p = projet(t);
  const carte = () => cartesEnTodo(p.journal.base).some(({ ticket }) => ticket === ticketDuCheck("runtime-windows", "main"));
  p.reveiller();
  assert.equal(carte(), false);
  await p.lu();
  p.reveiller();
  assert.equal(carte(), true);
});

test("sans tour GitHub seul, rien n'est supervisé ni aucune carte posée", async (t) => {
  const p = projet(t, { tour: false });
  await p.lu();
  p.a("10:11");
  p.reveiller();
  await new Promise((fin) => setImmediate(fin));
  assert.deepEqual([p.consignes, p.dits, cartesEnTodo(p.journal.base)], [[], [], []]);
});

for (const [nom, fait] of [
  ["le « stop » du chef", { type: "kitchen.stopped", payload: {} }],
  ["le projet éteint par le chef", { type: "project.switched-off", payload: {} }],
] as const) {
  test(`une cuisine arrêtée n'est pas supervisée — ${nom} : aucun manager consulté ; rallumée, si`, async (t) => {
    const p = projet(t);
    await p.lu();
    p.noter(fait as Fait);
    p.a("10:11");
    p.reveiller();
    await new Promise((fin) => setImmediate(fin));
    assert.deepEqual(p.consignes, []);
    p.noter((fait.type === "kitchen.stopped" ? { type: "kitchen.resumed", payload: {} } : { type: "project.switched-on", payload: {} }) as Fait);
    p.reveiller();
    await jusqua(() => p.consignes.length > 0);
  });
}

test("sans manager donné par la station, rien ne part ; donné, le réveil suivant le consulte", async (t) => {
  const p = projet(t, { manager: null });
  await p.lu();
  p.a("10:11");
  p.reveiller();
  await new Promise((fin) => setImmediate(fin));
  assert.deepEqual([p.depot.creees(), p.dits], [[], []]);
  const consignes: string[] = [];
  p.manager(async (consigne) => (consignes.push(consigne), { message: RERUN }));
  p.reveiller();
  await jusqua(() => p.depot.creees().length > 0);
  assert.equal(consignes.length, 1);
});

for (const [nom, reponse, dit] of [
  ["une réponse que le manager n'a pas donnée", { illisible: "claude ended in error" }, "the manager gave no answer: claude ended in error"],
  ["une réponse sans objet JSON", { message: "I would rerun the jobs." }, "the manager's answer holds no JSON object"],
] as const) {
  test(`${nom} : aucun geste, et le run dit pourquoi il a échoué`, async (t) => {
    const p = projet(t, { manager: async () => reponse });
    await p.lu();
    p.a("10:11");
    p.reveiller();
    await jusqua(() => p.dits.length > 0);
    assert.deepEqual(p.dits, [`supervisor on shop: its run failed — ${dit}`]);
    assert.deepEqual(p.depot.creees(), []);
  });
}

test("le manager retiré pendant que le dossier se lit : le run le dit, sans geste", async (t) => {
  const p = projet(t);
  const lire = p.journal.derniers.bind(p.journal);
  p.journal.derniers = ((...args: Parameters<typeof lire>) => (p.manager(null), lire(...args))) as typeof lire;
  await p.lu();
  p.a("10:11");
  p.reveiller();
  await jusqua(() => p.dits.length > 0);
  assert.deepEqual(p.dits, ["supervisor on shop: its run failed — no manager to consult: the station did not give it"]);
});

test("le geste lit la tête de la base par le client du projet ; un client qui ne la lit pas le dit sur le ticket en faute, sans geste", async (t) => {
  const sans = projet(t, { github: (depot) => ({ ...depot.client(), teteDeLaBase: undefined }) as unknown as ReturnType<FauxDepot["client"]> });
  sans.depot.issue(40, ["fire"]);
  await sans.pris();
  sans.reveiller();
  await jusqua(() => sans.depot.ecrits().length > 0);
  assert.deepEqual(sans.depot.creees(), []);
  assert.match(sans.depot.commentaires.get(40)?.join("\n") ?? "", /cannot read the head of the integration branch/);
});

test("un tour qui ne se lit pas : le superviseur n'est pas évalué, et le réveil le dit", (t) => {
  const p = projet(t);
  p.tour.faits = () => {
    throw new Error("the tour is broken");
  };
  p.reveiller();
  assert.deepEqual(p.dits, ["supervisor on shop: not evaluated — the tour is broken"]);
});
