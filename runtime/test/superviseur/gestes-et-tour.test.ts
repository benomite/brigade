// La porte des six gestes et le tour du superviseur (#3914), au-delà des critères gelés : un geste mal formé est
// refusé, un geste qui échoue le dit, une cause n'ouvre qu'un correctif par tour, et la trace va sur le ticket où le tour
// a agi — et nulle part quand il n'a agi sur aucun.
import assert from "node:assert/strict";
import { test } from "node:test";
import { executer, jouer, refusDe, type Geste, type GitHubDuSuperviseur } from "../../src/superviseur/gestes.ts";
import { lireReponse, consigneDuSuperviseur } from "../../src/superviseur/manager.ts";
import { direGeste, MARQUE_DU_SUPERVISEUR, tourDuSuperviseur } from "../../src/superviseur/tour.ts";
import { composerDossier } from "../../src/superviseur/dossier.ts";

type Faux = GitHubDuSuperviseur & { appels: { nom: string; args: unknown[] }[] };

function faux(options: { apresRelance?: "vert" | "rouge"; casse?: string; commenterCasse?: boolean } = {}): Faux {
  const appels: Faux["appels"] = [];
  const noter = (nom: string, ...args: unknown[]) => {
    appels.push({ nom, args });
    if (options.casse === nom) throw new Error(`HTTP 502 on ${nom}`);
  };
  let suivant = 300;
  return {
    appels,
    relancerLesJobs: async () => (noter("relancerLesJobs"), options.apresRelance ?? "rouge"),
    remettreSurLeRail: async (ticket, note) => noter("remettreSurLeRail", ticket, note),
    mettreEnAttente: async (ticket, tiers) => noter("mettreEnAttente", ticket, tiers),
    fermer: async (ticket, doublonDe) => noter("fermer", ticket, doublonDe),
    ticketsOuverts: async () => [],
    ouvrirCorrectif: async (correctif) => (noter("ouvrirCorrectif", correctif), suivant++),
    poserCarte: async (carte) => noter("poserCarte", carte),
    commenter: async (ticket, texte) => {
      appels.push({ nom: "commenter", args: [ticket, texte] });
      if (options.commenterCasse === true) throw new Error("HTTP 403");
    },
  };
}

test("a gesture with a ticket that is not a positive whole number, or a fix ticket without a body, is refused", () => {
  for (const ticket of [2.5, 0, -3, "7"]) assert.notEqual(refusDe({ geste: "remettre-sur-le-rail", ticket, note: "n" }), null, String(ticket));
  assert.equal(refusDe({ geste: "remettre-sur-le-rail", ticket: 7, note: "n" }), null);
  assert.notEqual(refusDe({ geste: "remettre-sur-le-rail", ticket: 7, note: "  " }), null);
  assert.notEqual(refusDe({ geste: "ouvrir-un-correctif", titre: "Fix it", corps: "", cause: { genre: "ci", check: "unit" } }), null);
  assert.notEqual(refusDe({ geste: "ouvrir-un-correctif", titre: "", corps: "why", cause: { genre: "ci", check: "unit" } }), null);
  assert.notEqual(refusDe({ geste: "ouvrir-un-correctif", titre: "Fix it", corps: "why", cause: { genre: "ci" } }), null);
  assert.notEqual(refusDe({ geste: "ouvrir-un-correctif", titre: "Fix it", corps: "why", cause: { genre: "code", identite: "" } }), null);
  assert.notEqual(refusDe({ geste: "ouvrir-un-correctif", titre: "Fix it", corps: "why" }), null);
  assert.notEqual(refusDe({ geste: "fermer-un-doublon", ticket: 3, doublonDe: 3 }), null, "a ticket is not a duplicate of itself");
  assert.notEqual(refusDe({ geste: "poser-une-carte-todo", nature: "produit", question: "Which?", ticket: 1.5 }), null);
  assert.equal(refusDe({ geste: "poser-une-carte-todo", nature: "design", question: "Which?", ticket: 8 }), null);
  assert.notEqual(refusDe("rerun everything"), null);
  assert.notEqual(refusDe(null), null);
});

test("a gesture GitHub refuses is said as a failure, not as done", async () => {
  const github = faux({ casse: "remettreSurLeRail" });
  const reponse = await executer(github, { geste: "remettre-sur-le-rail", ticket: 5, note: "retry" });
  assert.deepEqual(reponse, { fait: false, echec: "HTTP 502 on remettreSurLeRail" });
});

test("a cause files one fix ticket per run, however many times the manager asks for it", async () => {
  const github = faux();
  const deposees = new Set<string>();
  const correctif: Geste = { geste: "ouvrir-un-correctif", titre: "Fix the parser", corps: "cause", cause: { genre: "code", identite: "parser" } };
  assert.deepEqual(await jouer(github, correctif, deposees), { fait: true, correctif: 300 });
  const second = await jouer(github, correctif, deposees);
  assert.equal(second.fait, false);
  assert.ok("refus" in second && /already filed in this run/.test(second.refus));
  assert.deepEqual(github.appels.filter(({ nom }) => nom === "ouvrirCorrectif").map(({ args }) => args[0]), [{ titre: "Fix the parser", corps: "cause", cause: "code:parser" }]);
});

test("a TODO card goes on the ticket it names, and names none when the manager gave none", async () => {
  const github = faux();
  await executer(github, { geste: "poser-une-carte-todo", nature: "produit", question: " Which price? " });
  await executer(github, { geste: "poser-une-carte-todo", nature: "design", question: "Which layout?", ticket: 8 });
  assert.deepEqual(github.appels.map(({ args }) => args[0]), [{ nature: "produit", question: "Which price?" }, { nature: "design", question: "Which layout?", ticket: 8 }]);
});

test("each gesture done says what it did, in one line", () => {
  assert.equal(direGeste({ geste: "relancer-les-jobs" }, { fait: true, apresRelance: "vert" }), "failed jobs of main rerun: green after the rerun");
  assert.equal(direGeste({ geste: "relancer-les-jobs" }, { fait: true, apresRelance: "rouge" }), "failed jobs of main rerun: still red after the rerun");
  assert.equal(direGeste({ geste: "mettre-en-attente", ticket: 2, tiers: "the bank" }, { fait: true }), "#2 set aside in WAITING for the bank");
  assert.equal(direGeste({ geste: "fermer-un-doublon", ticket: 3, doublonDe: 4 }, { fait: true }), "#3 closed as a duplicate of #4");
  assert.equal(direGeste({ geste: "ouvrir-un-correctif", titre: "Fix it", corps: "c", cause: { genre: "ci", check: "unit" } }, { fait: true, correctif: 300 }), "fix ticket #300 filed: Fix it");
  assert.equal(direGeste({ geste: "poser-une-carte-todo", nature: "produit", question: "Which?" }, { fait: true }), "TODO card posted (produit question): Which?");
  assert.equal(direGeste({ geste: "poser-une-carte-todo", nature: "design", question: "Which?", ticket: 8 }, { fait: true }), "TODO card posted on #8 (design question): Which?");
  assert.equal(direGeste({ geste: "remettre-sur-le-rail", ticket: 1, note: "n" }, { fait: false, refus: "no" }), "refused remettre-sur-le-rail: no");
  assert.equal(direGeste({ geste: "remettre-sur-le-rail", ticket: 1, note: "n" }, { fait: false, echec: "HTTP 502" }), "remettre-sur-le-rail failed: HTTP 502");
});

test("the trace goes on the first ticket a gesture acted on — not on one a refused gesture named", async () => {
  const github = faux();
  const bilan = await tourDuSuperviseur({
    github,
    declenchement: { cause: "prises-sans-livraison", ticket: 12 },
    vu: "taken 3 times",
    actions: [{ geste: "remettre-sur-le-rail", ticket: 7, note: "" }, { geste: "mettre-en-attente", ticket: 5, tiers: "the client" }],
  });
  assert.equal(bilan.ticket, 5);
  const [trace] = github.appels.filter(({ nom }) => nom === "commenter");
  assert.equal(trace?.args[0], 5);
  assert.ok(String(trace?.args[1]).startsWith(`${MARQUE_DU_SUPERVISEUR}\n**Supervisor run** — #12 was taken 3 times without delivering.`));
  assert.match(String(trace?.args[1]), /- refused remettre-sur-le-rail: putting a ticket back on the rail needs the ticket and a note\n- #5 set aside in WAITING for the client/);
});

test("a run on a ticket at fault that decides nothing still writes its trace there; a run on no ticket writes none", async () => {
  const surLeTicket = faux();
  const bilan = await tourDuSuperviseur({ github: surLeTicket, declenchement: { cause: "prises-sans-livraison", ticket: 12 }, vu: "taken 3 times", actions: [] });
  assert.equal(bilan.ticket, 12);
  assert.match(String(surLeTicket.appels.find(({ nom }) => nom === "commenter")?.args[1]), /\*\*What it did:\*\*\n\n- nothing: no gesture was needed$/);
  const surRien = faux();
  assert.deepEqual(await tourDuSuperviseur({ github: surRien, declenchement: { cause: "rien-livre" }, vu: "nothing merged", actions: [] }), { ticket: null, fait: [], trace: null });
  assert.deepEqual(surRien.appels, []);
});

test("on a red main, the trace of the run goes on the fix ticket it filed", async () => {
  const github = faux({ apresRelance: "rouge" });
  const bilan = await tourDuSuperviseur({
    github,
    declenchement: { cause: "base-rouge", check: "unit" },
    vu: "main red on unit",
    actions: [{ geste: "relancer-les-jobs" }, { geste: "ouvrir-un-correctif", titre: "Repair main: unit", corps: "the stack", cause: { genre: "ci", check: "unit" } }],
  });
  assert.equal(bilan.ticket, 300);
  assert.deepEqual(bilan.fait, ["failed jobs of main rerun: still red after the rerun", "fix ticket #300 filed: Repair main: unit"]);
  assert.equal(github.appels.filter(({ nom }) => nom === "relancerLesJobs").length, 1, "the rerun is the run's own, once");
  assert.equal(github.appels.find(({ nom }) => nom === "commenter")?.args[0], 300);
});

test("a trace GitHub refuses is said in the run's outcome", async () => {
  const bilan = await tourDuSuperviseur({ github: faux({ commenterCasse: true }), declenchement: { cause: "prises-sans-livraison", ticket: 12 }, vu: "taken", actions: [] });
  assert.equal(bilan.echecDeLaTrace, "HTTP 403");
});

test("the manager's answer is read for what it saw and its gestures; an answer without them does no gesture in its place", () => {
  assert.deepEqual(lireReponse('Here: {"vu": "lint is red on every take", "gestes": [{"geste": "relancer-les-jobs"}]}'), { vu: "lint is red on every take", gestes: [{ geste: "relancer-les-jobs" }] });
  assert.deepEqual(lireReponse(null), { illisible: "no answer" });
  assert.deepEqual(lireReponse("  "), { illisible: "no answer" });
  assert.deepEqual(lireReponse("I would rerun the jobs."), { illisible: "no JSON object in the answer" });
  assert.deepEqual(lireReponse('{"gestes": []}'), { illisible: "no `vu`: what the manager saw" });
  assert.deepEqual(lireReponse('{"vu": "all fine"}'), { illisible: "no `gestes` list" });
});

test("the manager's brief names the trigger, the six gestures, and carries the dossier as data", async () => {
  const dossier = await composerDossier({ lectures: { file: async () => [{ ticket: 41, titre: "Queued forty-one" }], queueDuJournal: async () => [], etapeEnEchec: async () => null, historique: async () => [] }, ticketFautif: null });
  const consigne = consigneDuSuperviseur({ depot: "acme/shop", declenchement: { cause: "rien-livre" }, dossier });
  assert.match(consigne, /dépôt acme\/shop\. La cuisine ne bouge pas : nothing merged for 30 min while a ticket is cookable\./);
  for (const geste of ["relancer-les-jobs", "remettre-sur-le-rail", "mettre-en-attente", "fermer-un-doublon", "ouvrir-un-correctif", "poser-une-carte-todo"]) assert.ok(consigne.includes(`"geste": "${geste}"`), geste);
  assert.match(consigne, /<dossier>\n[\s\S]*- #41 Queued forty-one[\s\S]*<\/dossier>$/);
});
