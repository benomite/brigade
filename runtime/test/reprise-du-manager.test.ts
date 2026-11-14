// Après le troisième essai raté, le ticket va au manager, pas au chef (#3513).
// Le premier test passe par la station du dépôt (`stationDuDepot`), sur un faux
// GitHub : le faux `claude` est un cook qui finit sans rien commiter, ou le
// manager consulté, reconnu à la marque de sa consigne. Les suivants passent par
// la station du faux GitHub, dont le manager est une doublure.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { ticketsDeLaListe } from "../src/epique.ts";
import type { GitHub } from "../src/github.ts";
import { MARQUE_D_ECHEC, MARQUE_DE_RENVOI } from "../src/qualite-github.ts";
import { lireReprise, MARQUE_DE_LA_REPRISE, type ReprendreLeTicket } from "../src/reprise-du-manager.ts";

// La consigne du manager se reconnaît à sa première ligne ; le corps réécrit, à la sienne.
const MARQUE_DE_LA_CONSIGNE = "<!-- brigade:reprise-au-manager -->";
const MARQUE_DE_REECRITURE = "<!-- brigade:reecrit-par-le-manager -->";
type ReponseDeReprise = Awaited<ReturnType<ReprendreLeTicket>>;
type Reprise = Extract<ReponseDeReprise, { reprise: unknown }>["reprise"];
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "./faux-github.ts";

const TICKET = 77;
const CORPS = "## Context\n\nMake the rail faster.\n\n## Acceptance criteria\n\n- the rail loads in under a second";
const ECHECS = "set-aside:failures";
const PLAFOND = { model: "opus", effort: "high" };
const REECRIRE = { choix: "reecrire", motif: "Each cook guessed which rail was meant: the ticket never names the file.", corps: "Make `runtime/src/rail.ts` read the tickets once per turn.\n\n## Acceptance criteria\n\n- the rail loads in under a second" };

test("through the station of the repository: after its failed tries, the ticket goes to the manager with the tries' reasons, is rewritten, and goes back to a cook — not to the chef", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "reprise-du-manager-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:sonnet", "effort:medium"], CORPS);
  let cooks = 0;
  const consultations: string[][] = [];
  const lancer: Lancer = ({ args, flux }) => {
    const manager = args.some((arg) => arg.startsWith(MARQUE_DE_LA_CONSIGNE));
    if (manager) consultations.push(args);
    else cooks += 1;
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: manager ? JSON.stringify(REECRIRE) : `I tried, try ${cooks}.` })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const github: GitHub = { ...fauxClient(faux), ecrireCorps: async (numero, nouveau) => void (faux.ticket(numero).corps = nouveau) };
  const station = stationDuDepot({ ...STATION_DU_DEPOT, github, depot: depotNeuf(repertoire), manager: () => ({ model: "opus", effort: "medium" }), flux: repertoire, lancer, avertir: () => {} });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < 6 && consultations.length === 0; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(consultations.length, 1);
  const [args] = consultations as [string[]];
  const consigne = args[args.indexOf("-p") + 1] ?? "";
  assert.match(consigne, /<essais>\n1\. [^\n]+\n2\. [^\n]+/);
  assert.match(consigne, /Calibrage du ticket : `sonnet` \/ `medium`/);
  assert.match(consigne, /jamais au-dessus du plafond du projet, `opus` \/ `high`/, "the default ceiling, with none given");
  assert.deepEqual([args[args.indexOf("--model") + 1], args[args.indexOf("--effort") + 1]], ["opus", "medium"]);
  assert.equal(args[args.indexOf("--tools") + 1], "Read,Grep,Glob", "the manager reads the repo, it writes nothing");
  const ticket = faux.ticket(TICKET);
  assert.equal(ticket.labels.has(ECHECS), false, "not set aside for the chef");
  assert.equal(ticket.labels.has(A_LA_MAIN), false);
  assert.ok(ticket.labels.has("fire"));
  assert.ok(ticket.corps.startsWith(MARQUE_DE_REECRITURE));
  assert.match(ticket.corps, /Make `runtime\/src\/rail\.ts` read the tickets once per turn[\s\S]*<details>[\s\S]*Make the rail faster\./);
  const commentaires = (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);
  const reprises = commentaires.filter((corps) => corps.startsWith(MARQUE_DE_LA_REPRISE));
  assert.equal(reprises.length, 1, "one comment says which, and why");
  assert.match(reprises[0] ?? "", /^<!-- brigade:reprise-du-manager choix=reecrire -->\n\*\*Manager — after \d failed tries, the ticket is rewritten more precisely, not tried again, and not sent to the chef\.\*\*[\s\S]*\*\*Why\.\*\* Each cook guessed which rail was meant/);
  assert.match(commentaires.filter((corps) => corps.startsWith(MARQUE_D_ECHEC)).at(-1) ?? "", /the ticket went to the manager, not to the chef/);
  // Le ticket repart sur le rail : un cook le reprend au tour suivant, sans geste du chef.
  const avant = cooks;
  await station.tour();
  await station.calme();
  assert.equal(cooks, avant + 1);
  assert.equal(faux.ticket(TICKET).labels.has(ECHECS), false, "its tries count again from the manager's comment");
});

// Une station du faux GitHub dont chaque cook rate, au motif `motif(n)`, et
// dont le manager répond `manager(n)` à sa n-ième consultation.
function station(faux: FauxGitHub, manager: ((n: number) => ReponseDeReprise) | null, motif: (n: number) => string = (n) => `reason ${n}`) {
  let cooks = 0;
  const consultations: Array<{ ticket: number; motifs: string[] }> = [];
  const a = faux.station("A", {
    cuisiner: async () => ({ echec: motif((cooks += 1)) }),
    avertir: () => {},
    ...(manager === null
      ? {}
      : {
          reprendre: async (ticket, { motifs }) => {
            consultations.push({ ticket: ticket.number, motifs });
            return manager(consultations.length);
          },
        }),
  });
  return { a, consultations, cooks: () => cooks };
}

const tourner = async (a: { tour(): Promise<void>; calme(): Promise<void> }, tours: number, fini: () => boolean = () => false) => {
  for (let i = 0; i < tours && !fini(); i += 1) {
    await a.tour();
    await a.calme();
  }
};

const reprisesDe = (faux: FauxGitHub, issue: number) => (faux.commentaires.get(issue) ?? []).filter((c) => c.body.startsWith(MARQUE_DE_LA_REPRISE)).map((c) => c.body);
const reprise = (valeur: Reprise) => () => ({ reprise: valeur });

test("a rewritten ticket that fails its tries again goes to the chef, once, with what was tried — the manager is not consulted twice", async () => {
  const faux = new FauxGitHub();
  faux.corpsEcrivables = true;
  faux.feu(TICKET, ["fire", "model:sonnet", "effort:medium"], CORPS);
  const { a, consultations } = station(faux, reprise({ choix: "reecrire", motif: "The ticket never names the file.", corps: "Edit `runtime/src/rail.ts`." }));
  await tourner(a, 12, () => faux.ticket(TICKET).labels.has(ECHECS));
  assert.equal(consultations.length, 1);
  assert.deepEqual(consultations[0]?.motifs, ["reason 1", "reason 2", "reason 3"]);
  assert.ok(faux.ticket(TICKET).labels.has(ECHECS));
  const echecs = (faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.startsWith(MARQUE_D_ECHEC)).map((c) => c.body);
  assert.equal(echecs.length, 6, "three tries before the rewrite, three after");
  assert.match(echecs[5] ?? "", /n=3 -->[\s\S]*Set aside by its failure count[\s\S]*\*\*What was tried\.\*\* The manager already reworked this ticket after its first failed tries: it was rewritten more precisely — The ticket never names the file\./);
  assert.match(echecs[5] ?? "", /The ticket never names the file\.[\s\S]*1\. reason 4\n2\. reason 5\n3\. reason 6/);
  assert.equal(reprisesDe(faux, TICKET).length, 1);
  // Une seule fois : mis de côté, plus aucun cook ni commentaire.
  const avant = (faux.commentaires.get(TICKET) ?? []).length;
  await tourner(a, 3);
  assert.equal((faux.commentaires.get(TICKET) ?? []).length, avant);
});

test("split: the ticket becomes the epic of smaller tickets born on the rail with its calibration, and is no longer taken", async () => {
  const faux = new FauxGitHub();
  faux.corpsEcrivables = true;
  faux.feu(TICKET, ["fire", "model:sonnet", "effort:medium", "prio:2"], CORPS);
  const tickets = [
    { titre: "Read the tickets once per turn", corps: "## Acceptance criteria\n\n- one read per turn" },
    { titre: "Cache the rail's card", corps: "## Acceptance criteria\n\n- the card is cached" },
  ];
  const { a, consultations } = station(faux, reprise({ choix: "decouper", motif: "Two deliverables in one ticket.", tickets }));
  await tourner(a, 6, () => consultations.length > 0);
  const nes = faux.creations;
  assert.equal(nes.length, 2);
  for (const [rang, ne] of nes.entries()) {
    const sous = faux.ticket(ne);
    assert.deepEqual([...sous.labels].sort(), ["effort:medium", "fire", "model:sonnet", "prio:2"]);
    assert.match(sous.corps, new RegExp(`^Epic: #${TICKET}\n<!-- brigade:ne-d-une-reprise #${TICKET} -->`));
    assert.ok(sous.corps.includes(tickets[rang]?.corps ?? "?"));
  }
  assert.deepEqual(ticketsDeLaListe(faux.ticket(TICKET).corps), nes);
  assert.match(reprisesDe(faux, TICKET)[0] ?? "", new RegExp(`choix=decouper[\\s\\S]*split into smaller tickets[\\s\\S]*the epic of #${nes[0]}, #${nes[1]}`));
  assert.equal(faux.ticket(TICKET).labels.has(ECHECS), false);
  // L'épique ne se prend plus : seuls ses tickets partent chez un cook — qui ratent ici aussi,
  // et, nés d'une reprise, vont au chef sans seconde reprise.
  await tourner(a, 16, () => nes.every((ne) => faux.ticket(ne).labels.has(ECHECS)));
  assert.equal(consultations.length, 1);
  for (const ne of nes) {
    assert.ok(faux.ticket(ne).labels.has(ECHECS));
    const dernier = (faux.commentaires.get(ne) ?? []).filter((c) => c.body.startsWith(MARQUE_D_ECHEC)).at(-1)?.body ?? "";
    assert.match(dernier, new RegExp(`\\*\\*What was tried\\.\\*\\* This ticket was born of the manager's split of #${TICKET} after its failed tries — Two deliverables in one ticket\\.`));
  }
  assert.equal((faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.startsWith(MARQUE_D_ECHEC)).length, 3, "the epic itself is not cooked again");
});

test("recalibrate: the calibration labels are replaced and the ticket goes back on the rail", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:sonnet", "effort:low"], CORPS);
  const { a, cooks } = station(faux, reprise({ choix: "recalibrer", motif: "The ticket is clear; the cooks ran out of effort.", calibrage: { model: "opus", effort: "high" } }));
  await tourner(a, 6, () => reprisesDe(faux, TICKET).length > 0);
  const labels = faux.ticket(TICKET).labels;
  assert.deepEqual([...labels].filter((l) => /^(model|effort):/.test(l)).sort(), ["effort:high", "model:opus"]);
  assert.match(reprisesDe(faux, TICKET)[0] ?? "", /from `sonnet` \/ `low` to `opus` \/ `high`/);
  const avant = cooks();
  await tourner(a, 1);
  assert.equal(cooks(), avant + 1);
});

test("a product or design question in the reasons: only then a card for the chef, and it asks that question, not « the ticket failed »", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:sonnet", "effort:medium"], CORPS);
  const { a } = station(faux, reprise({ choix: "question", motif: "The cooks split on which view to change.", sorte: "product", question: "Should the rail show served tickets?" }), (n) => `the cook asked: which view, ${n}?`);
  await tourner(a, 6, () => reprisesDe(faux, TICKET).length > 0);
  const ticket = faux.ticket(TICKET);
  assert.ok(ticket.labels.has(A_LA_MAIN));
  assert.equal(ticket.labels.has(ECHECS), false);
  const [carte] = reprisesDe(faux, TICKET);
  assert.match(carte ?? "", /\*\*Question for the chef \(product\):\*\* Should the rail show served tickets\?/);
  assert.doesNotMatch(carte ?? "", /not sent to the chef/);
  // La carte lit la dernière ligne qui finit par « ? » : c'est la question, pas un motif d'essai.
  assert.equal((carte ?? "").split("\n").filter((ligne) => ligne.trim().endsWith("?")).at(-1), "**Question for the chef (product):** Should the rail show served tickets?");
});

test("a manager that cannot rework it, or no manager on the station: the ticket is set aside as before, and the comment says why", async () => {
  for (const [manager, dit] of [
    [() => ({ illisible: "no JSON object in the answer" }), /The manager could not rework it: no JSON object in the answer\./],
    [null, /The manager did not rework it: this station has no manager to consult\./],
  ] as const) {
    const faux = new FauxGitHub();
    faux.feu(TICKET, ["fire", "model:sonnet", "effort:medium"], CORPS);
    const { a } = station(faux, manager);
    await tourner(a, 6, () => faux.ticket(TICKET).labels.has(ECHECS));
    assert.ok(faux.ticket(TICKET).labels.has(ECHECS));
    assert.match((faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.startsWith(MARQUE_D_ECHEC)).at(-1)?.body ?? "", dit);
    assert.equal(reprisesDe(faux, TICKET).length, 0);
  }
});

test("a rewrite the station cannot write goes to the chef with the reason, never a rework said but not done", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:sonnet", "effort:medium"], CORPS);
  const { a } = station(faux, reprise({ choix: "reecrire", motif: "Unclear.", corps: "Clearer." }));
  await tourner(a, 6, () => faux.ticket(TICKET).labels.has(ECHECS));
  assert.match((faux.commentaires.get(TICKET) ?? []).filter((c) => c.body.startsWith(MARQUE_D_ECHEC)).at(-1)?.body ?? "", /The manager chose to rewrite it, but this station cannot write the ticket's body\./);
  assert.equal(faux.ticket(TICKET).corps, CORPS);
  assert.equal(reprisesDe(faux, TICKET).length, 0);
});

test("after its last send-back by the pass, the ticket goes to the manager too, and back on the rail under the same PR", async () => {
  const faux = new FauxGitHub();
  faux.corpsEcrivables = true;
  faux.feu(31);
  const consultations: string[][] = [];
  const a = faux.station("A", {
    avertir: () => {},
    reprendre: async (_ticket, { motifs }) => {
      consultations.push(motifs);
      return { reprise: { choix: "reecrire", motif: "The CI fails on a test the ticket never names.", corps: "Fix the `tests` check first." } };
    },
  });
  await a.tour();
  await a.calme();
  const pr = faux.prs.find((p) => p.issue === 31);
  assert.ok(pr);
  faux.ciRouge.add(pr.number);
  await tourner(a, 12, () => consultations.length > 0);
  assert.equal(consultations.length, 1);
  assert.equal(consultations[0]?.length, 3);
  assert.match(consultations[0]?.[0] ?? "", /the CI is red/);
  assert.equal(faux.ticket(31).labels.has(ECHECS), false);
  const renvois = (faux.commentaires.get(31) ?? []).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI)).map((c) => c.body);
  assert.match(renvois.at(-1) ?? "", /still not mergeable after 2 sends back[\s\S]*the ticket went to the manager, not to the chef/);
  assert.equal(reprisesDe(faux, 31).length, 1);
  assert.match(faux.ticket(31).corps, /Fix the `tests` check first\./);
  // Ses renvois se recomptent : le suivant est le premier.
  await tourner(a, 2, () => (faux.commentaires.get(31) ?? []).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI)).length > renvois.length);
  assert.match((faux.commentaires.get(31) ?? []).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI)).at(-1)?.body ?? "", /sent back to a cook \(1\/2\)/);
});

test("the manager's answer is read strictly: a choice it cannot make is not guessed", () => {
  const avant = { model: "sonnet", effort: "medium" };
  assert.deepEqual(lireReprise(JSON.stringify(REECRIRE), avant, PLAFOND), { reprise: REECRIRE });
  assert.deepEqual(lireReprise("```json\n{\"choix\": \"question\", \"motif\": \"m\", \"sorte\": \"design\", \"question\": \"Which\\nlayout?\"}\n```", avant, PLAFOND), { reprise: { choix: "question", motif: "m", sorte: "design", question: "Which layout?" } });
  assert.deepEqual(lireReprise(JSON.stringify({ choix: "recalibrer", motif: "m", modele: "opus", effort: "high" }), avant, PLAFOND), { reprise: { choix: "recalibrer", motif: "m", calibrage: { model: "opus", effort: "high" } } });
  for (const [message, illisible] of [
    [null, /no answer/],
    ["I would retry.", /no JSON object/],
    [JSON.stringify({ choix: "retry", motif: "m" }), /unknown choice "retry"/],
    [JSON.stringify({ choix: "reecrire" }), /no `motif`/],
    [JSON.stringify({ choix: "reecrire", motif: "m" }), /a rewrite with no `corps`/],
    [JSON.stringify({ choix: "decouper", motif: "m", tickets: [{ titre: "a", corps: "b" }] }), /a split into 1 tickets — expected 2 to 5/],
    [JSON.stringify({ choix: "decouper", motif: "m", tickets: [{ titre: "a", corps: "b" }, { titre: "c" }] }), /no `titre` or no `corps`/],
    [JSON.stringify({ choix: "recalibrer", motif: "m", modele: "sonnet", effort: "medium" }), /the same calibration/],
    [JSON.stringify({ choix: "recalibrer", motif: "m", modele: "gpt", effort: "medium" }), /unknown calibration/],
    [JSON.stringify({ choix: "recalibrer", motif: "m", modele: "opus", effort: "max" }), /above the project's ceiling `opus` \/ `high`/],
    [JSON.stringify({ choix: "question", motif: "m", sorte: "technical", question: "q?" }), /expected product or design/],
    [JSON.stringify({ choix: "question", motif: "m", sorte: "product" }), /a question with no `question`/],
    [JSON.stringify({ choix: "question", motif: "m", sorte: "product", question: "The ticket failed." }), /not a question/],
  ] as const) {
    const lu = lireReprise(message, avant, PLAFOND);
    assert.ok("illisible" in lu, String(message));
    assert.match(lu.illisible, illisible);
  }
});
