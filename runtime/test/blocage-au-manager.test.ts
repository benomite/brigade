// La question d'un cook bloqué va au manager avant tout `blocked-on-human`
// (#2894). Les tests passent par la station (`stationDuDepot`), sur un faux
// GitHub : le faux `claude` est un cook qui finit sur un `<bloque>`, ou le
// manager consulté, reconnu à la marque de sa consigne.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { lireAvis, MARQUE_DE_DECISION, MARQUE_DE_LA_CONSULTATION, MARQUE_DE_REPONSE } from "../src/blocage-au-manager.ts";
import { A_LA_MAIN, stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { LABEL_TAKEN } from "../src/github-etat/etats.ts";
import type { GitHub } from "../src/github.ts";
import { MARQUE_D_ECHEC } from "../src/qualite-github.ts";
import { FauxGitHub, STATION_DU_DEPOT, depotNeuf, fauxClient } from "./faux-github.ts";

const TICKET = 75;
const CORPS = "## Context\n\nTake real captures of the app at phone width.";
const QUESTION = "Which capture tool do I use, and on which public ticket?";
const TECHNIQUE = (n: number) => JSON.stringify({ issue: "technique", reponse: `answer ${n}: the tool is scripts/capture-ecran/, and benomite/brigade is public`, decision: `decision ${n}: use scripts/capture-ecran/ on any ticket the kitchen served` });

type Options = { tours?: number; manager?: ((n: number) => string) | null; commentaires?: string[]; ecrire?: (numero: number, corps: string) => Promise<void>; commentairesIllisibles?: boolean };

// Une station dont le cook du ticket s'arrête bloqué sur `QUESTION` à chacun de
// ses `tours`, et dont le manager répond `manager(n)` à sa n-ième consultation.
// `manager: null` : la station n'a pas de manager à consulter.
async function bloque(t: TestContext, { tours = 1, manager = TECHNIQUE, commentaires = [], ecrire, commentairesIllisibles = false }: Options = {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "blocage-au-manager-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(TICKET, ["fire", "model:opus", "effort:medium"], CORPS);
  for (const corps of commentaires) faux.poster(TICKET, "box", corps);
  let cooks = 0;
  let illisibles = false;
  const consultations: string[][] = [];
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args.some((arg) => arg.startsWith(MARQUE_DE_LA_CONSULTATION));
    if (consulte) consultations.push(args);
    else cooks += 1;
    // Le cook a lu son ticket : ce sont les lectures d'après qui échouent.
    if (commentairesIllisibles) illisibles = true;
    const message = consulte ? (manager as (n: number) => string)(consultations.length) : `I stopped.\n<livrable>\n<bloque>${QUESTION}</bloque>\n</livrable>`;
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertissements: string[] = [];
  const client = fauxClient(faux);
  const github: GitHub = { ...client, commentaires: async (numero) => (illisibles && numero === TICKET ? Promise.reject(new Error("HTTP 500")) : client.commentaires(numero)), ecrireCorps: ecrire ?? (async (numero, nouveau) => void (faux.ticket(numero).corps = nouveau)) };
  const station = stationDuDepot({
    ...STATION_DU_DEPOT,
    github,
    depot: depotNeuf(repertoire),
    ...(manager === null ? {} : { manager: () => ({ model: "opus", effort: "high" }) }),
    flux: repertoire,
    lancer,
    avertir: (texte) => void avertissements.push(texte),
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < tours; tour += 1) {
    await station.tour();
    await station.calme();
  }
  const lus = (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);
  return { ticket: faux.ticket(TICKET), cooks: () => cooks, consultations, avertissements, commentaires: lus, du: (marque: string) => lus.filter((corps) => corps.startsWith(marque)) };
}

test("a blocked cook never sets blocked-on-human itself: its question goes to the manager, with the manager's calibration, in the ticket's branch", async (t) => {
  const { consultations } = await bloque(t, { manager: () => JSON.stringify({ issue: "produit", question: "Which layout?" }) });
  assert.equal(consultations.length, 1);
  const [args] = consultations as [string[]];
  const consigne = args[args.indexOf("-p") + 1] ?? "";
  assert.ok(consigne.includes(`<question>\n${QUESTION}\n</question>`), consigne);
  assert.match(consigne, /Issue #75 — /);
  assert.deepEqual([args[args.indexOf("--model") + 1], args[args.indexOf("--effort") + 1]], ["opus", "high"]);
  assert.equal(args[args.indexOf("--tools") + 1], "Read,Grep,Glob", "the manager reads the repo, it writes nothing");
});

test("a technical question: the manager answers it on the issue with its decision, and the ticket is re-queued from its branch, with no blocked-on-human", async (t) => {
  const { ticket, cooks, du, commentaires } = await bloque(t, { tours: 2 });
  assert.equal(ticket.labels.has(A_LA_MAIN), false);
  assert.equal(ticket.labels.has("fire"), true, "the ticket stays on the rail");
  assert.equal(cooks(), 2, "a second cook took the ticket back at the next turn");
  const [premiere] = du(MARQUE_DE_REPONSE);
  assert.match(premiere ?? "", /^<!-- brigade:reponse-au-blocage n=1 -->\n\*\*Manager — the cook's block is technical[\s\S]*> Which capture tool[\s\S]*\*\*Answer\.\*\* answer 1: the tool is scripts\/capture-ecran\/[\s\S]*\*\*Decision\.\*\* decision 1: use scripts\/capture-ecran\/[\s\S]*re-queued from its branch/);
  assert.equal(commentaires.some((corps) => corps.startsWith(MARQUE_D_ECHEC)), false, "a re-queue is not a failed cook");
  assert.equal(ticket.corps, CORPS, "two answers stay in comments");
});

test("a product or a design question: only then blocked-on-human, and the comment carries the question on one line", async (t) => {
  for (const [issue, nom] of [["produit", "product"], ["design", "design"]] as const) {
    const { ticket, commentaires } = await bloque(t, { manager: () => JSON.stringify({ issue, question: "Which of the two\nlayouts does the chef want?" }) });
    assert.equal(ticket.labels.has(A_LA_MAIN), true);
    assert.equal(ticket.labels.has(LABEL_TAKEN), false);
    const carte = commentaires.find((corps) => corps.startsWith("**Question for the chef"));
    assert.equal(carte?.split("\n")[0], `**Question for the chef (${nom}):** Which of the two layouts does the chef want?`);
    assert.match(carte ?? "", new RegExp(`the cook stopped, blocked[\\s\\S]*> ${QUESTION.replace("?", "\\?")}`));
  }
});

test("nothing to decide but a gesture only the chef can make: the card names the exact gesture, never the cook's text alone", async (t) => {
  const geste = "Run `gh auth refresh -s project` under the station's account";
  const { ticket, commentaires } = await bloque(t, { manager: () => JSON.stringify({ issue: "geste", geste }) });
  assert.equal(ticket.labels.has(A_LA_MAIN), true);
  const carte = commentaires.find((corps) => corps.startsWith("**Gesture for the chef:**"));
  assert.equal(carte?.split("\n")[0], `**Gesture for the chef:** ${geste}`);
  assert.ok(commentaires.every((corps) => !corps.startsWith("Station")), "no comment relays the cook's question alone");
});

test("the same technical block twice: the third goes back to the manager with both answers, its decision is written into the body once, then a further block is a failed cook — no loop, never the chef", async (t) => {
  const { ticket, cooks, consultations, du, avertissements } = await bloque(t, { tours: 4 });
  assert.equal(cooks(), 4);
  assert.equal(consultations.length, 4);
  const troisieme = consultations[2]?.[(consultations[2]?.indexOf("-p") ?? 0) + 1] ?? "";
  assert.match(troisieme, /Tu as déjà répondu 2 fois[\s\S]*<reponse n="1">[\s\S]*answer 1:[\s\S]*<reponse n="2">[\s\S]*answer 2:/);
  assert.equal(ticket.labels.has(A_LA_MAIN), false);
  assert.equal(ticket.corps.split(MARQUE_DE_DECISION).length, 2, "the decision is written once");
  assert.match(ticket.corps, /## Manager's decision \(added by the station\)[\s\S]*decision 3:/);
  assert.equal(du(MARQUE_DE_REPONSE).length, 3);
  assert.match(du(MARQUE_DE_REPONSE)[2] ?? "", /n=3 -->[\s\S]*written into the ticket's body/);
  const [echec] = du(MARQUE_D_ECHEC);
  assert.match(echec ?? "", /the cook blocked again on a technical question after the manager's decision was written into the ticket: Which capture tool/);
  assert.ok(avertissements.some((a) => a.includes("its decision is written into the ticket")), avertissements.join("\n"));
});

test("a decision the station cannot write into the body re-queues nothing: the block counts as a failed cook, never blocked-on-human", async (t) => {
  const deja = [1, 2].map((n) => `${MARQUE_DE_REPONSE} n=${n} -->\nanswer ${n}`);
  const { ticket, du, consultations } = await bloque(t, {
    commentaires: deja,
    ecrire: async () => {
      throw new Error("HTTP 502");
    },
  });
  assert.equal(consultations.length, 1);
  assert.equal(ticket.labels.has(A_LA_MAIN), false);
  assert.equal(ticket.corps, CORPS);
  assert.match(du(MARQUE_D_ECHEC)[0] ?? "", /the manager's decision on the cook's block could not be written into the ticket: HTTP 502/);
});

test("a manager that cannot answer — unreadable answer, or no manager on this station — sends nothing to the chef: the ticket waits, then a failed cook after repeated tries", async (t) => {
  const illisible = await bloque(t, { manager: () => "I am not sure." });
  assert.equal(illisible.ticket.labels.has(A_LA_MAIN), false);
  assert.equal(illisible.ticket.labels.has(LABEL_TAKEN), false);
  assert.match(illisible.du("<!-- brigade:attente")[0] ?? "", /^<!-- brigade:attente until=\d+ manager -->\nStation `box`: the cook stopped, blocked, and the manager could not answer its question — no JSON object in the answer/);

  const sans = await bloque(t, { manager: null });
  assert.equal(sans.consultations.length, 0);
  assert.equal(sans.ticket.labels.has(A_LA_MAIN), false);
  assert.match(sans.du("<!-- brigade:attente")[0] ?? "", /this station has no manager to consult/);

  const passees = [1, 2].map(() => "<!-- brigade:attente until=1 manager -->\nStation `box`: the manager could not answer");
  const usee = await bloque(t, { manager: () => "", commentaires: passees });
  assert.equal(usee.ticket.labels.has(A_LA_MAIN), false);
  assert.match(usee.du(MARQUE_D_ECHEC)[0] ?? "", /the manager could not answer it, 3 times \(no answer\)/);
});

test("comments the station cannot read to count the manager's answers: nothing goes to the chef, the ticket waits", async (t) => {
  const { ticket, consultations, avertissements } = await bloque(t, { commentairesIllisibles: true });
  assert.equal(consultations.length, 0);
  assert.equal(ticket.labels.has(A_LA_MAIN), false);
  assert.ok(avertissements.some((a) => a.includes("the issue's comments could not be read to count the manager's previous answers")), avertissements.join("\n"));
});

test("the manager's answer is read strictly: an unknown outcome or a missing field is unreadable, never a guess", () => {
  assert.deepEqual(lireAvis(TECHNIQUE(1)), { avis: { issue: "technique", reponse: "answer 1: the tool is scripts/capture-ecran/, and benomite/brigade is public", decision: "decision 1: use scripts/capture-ecran/ on any ticket the kitchen served" } });
  assert.deepEqual(lireAvis(null), { illisible: "no answer" });
  assert.deepEqual(lireAvis('{"issue": "chef"}'), { illisible: 'unknown outcome "chef" — expected technique, produit, design, geste' });
  assert.deepEqual(lireAvis('{"issue": "technique", "reponse": "yes"}'), { illisible: "a technical answer with no `decision`" });
  assert.deepEqual(lireAvis('{"issue": "geste", "geste": " "}'), { illisible: "a gesture with no `geste`" });
  assert.deepEqual(lireAvis('{"issue": "design"}'), { illisible: "a design question with no `question`" });
});
