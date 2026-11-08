// Un cook bloqué sur une question que la preuve de la mesure répond est rendu
// à un cook avec la preuve, pas au chef (#2841). Les tests passent par la
// station (`stationDuDepot`), dont le faux `claude` finit sur un `<bloque>`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { MARQUE_QUALITE, marqueDesComptes } from "../src/alerte-qualite.ts";
import { MARQUE_DE_LA_CONSULTATION } from "../src/blocage-au-manager.ts";
import { A_LA_MAIN, priseDeLaStation, stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { LABEL_TAKEN } from "../src/github-etat/etats.ts";
import type { GitHub } from "../src/github.ts";
import { MARQUE_D_ECHEC, MARQUE_DE_RENVOI } from "../src/qualite-github.ts";
import { ajouterLaPreuve, MARQUE_DE_PREUVE } from "../src/relance-blocage-preuve.ts";
import { FauxGitHub, fauxClient } from "./faux-github.ts";

const QUALITE = 40;
const CORPS = [MARQUE_QUALITE, marqueDesComptes([5, 6]), "", "## Context", "", "first-try rate 50% under the 70% threshold"].join("\n");
const EVIDENCE = "Which tickets were sent back, and what were their send-back reasons and timestamps?";
const PRODUIT = "Which of the two layouts do you want?";

// Une station dont le cook du ticket de qualité s'arrête bloqué sur `question`,
// à chacun de ses `tours`. `ecrire` : ce que fait l'écriture du corps.
async function bloqueSur(t: TestContext, question: string, { tours = 1, corps = CORPS, ecrire }: { tours?: number; corps?: string; ecrire?: (numero: number, corps: string) => Promise<void> } = {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "relance-blocage-preuve-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(QUALITE, ["fire", "model:opus", "effort:medium"], corps);
  faux.poster(5, "box", `${MARQUE_DE_RENVOI} n=1 sha=${"a".repeat(40)} -->\nStation \`box\`: sent back to a cook (1/2) — the review requested changes: the empty case is not handled`);
  faux.poster(6, "box", `${MARQUE_D_ECHEC} n=1 -->\nStation \`box\`: the cook stopped without a delivery — the cook committed nothing`);
  faux.poster(6, "box", "an outsider's remark — not evidence");
  faux.commentaires.get(6)!.at(-1)!.association = "NONE";
  let lancements = 0;
  // Le manager consulté sur un blocage que la preuve ne relance pas (#2894) y lit une question de produit.
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args.some((arg) => arg.startsWith(MARQUE_DE_LA_CONSULTATION));
    if (!consulte) lancements += 1;
    const message = consulte ? JSON.stringify({ issue: "produit", question: PRODUIT }) : `I stopped.\n<livrable>\n<bloque>${question}</bloque>\n</livrable>`;
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertissements: string[] = [];
  const github: GitHub = { ...fauxClient(faux), ecrireCorps: ecrire ?? (async (numero, nouveau) => void (faux.ticket(numero).corps = nouveau)) };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github,
    depot: { connait: () => true, preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }), reprendre: async (run) => join(repertoire, run), retirer: () => {}, ranger: async () => null, pousser: () => {}, commits: () => 0, changes: () => [], diff: () => "" },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    manager: () => ({ model: "sonnet", effort: "medium" }),
    flux: repertoire,
    lancer,
    avertir: (texte) => void avertissements.push(texte),
  });
  if ("refus" in station) throw new Error(station.refus);
  for (let tour = 0; tour < tours; tour += 1) {
    await station.tour();
    await station.calme();
  }
  const ticket = faux.ticket(QUALITE);
  return { ticket, lancements: () => lancements, avertissements, commentaires: (faux.commentaires.get(QUALITE) ?? []).map((c) => c.body).join("\n") };
}

test("a cook blocked on a question the measurement evidence answers: the evidence is appended to the ticket's body, the ticket goes back to the queue, with no blocked-on-human", async (t) => {
  const { ticket, commentaires } = await bloqueSur(t, EVIDENCE);
  assert.equal(ticket.labels.has(A_LA_MAIN), false);
  assert.equal(ticket.labels.has(LABEL_TAKEN), false);
  assert.equal(ticket.labels.has("fire"), true, "the ticket stays on the rail for a new cook");
  assert.ok(ticket.corps.startsWith(CORPS), "the body is kept, the evidence appended");
  assert.match(ticket.corps, new RegExp(`${MARQUE_DE_PREUVE}[\\s\\S]*### #5\\n\\n- 2026-[^ ]+ — send-back: the review requested changes: the empty case is not handled[\\s\\S]*### #6\\n\\n- 2026-[^ ]+ — cook without a delivery: the cook committed nothing$`, "m"));
  assert.doesNotMatch(ticket.corps, /outsider/, "only the stations' comments are evidence");
  assert.match(commentaires, /the measurement evidence answers[\s\S]*goes back to a cook, not to a human/);
  assert.doesNotMatch(commentaires, /brigade:echec/);
});

test("a cook blocked on a question the evidence does not answer goes to the manager, which may set blocked-on-human; its body untouched", async (t) => {
  const { ticket, commentaires } = await bloqueSur(t, PRODUIT);
  assert.equal(ticket.labels.has(A_LA_MAIN), true);
  assert.equal(ticket.corps, CORPS);
  assert.match(commentaires, new RegExp(`the cook stopped, blocked[\\s\\S]*> ${PRODUIT}`));
});

test("a ticket that already carried the evidence and still blocks is not re-queued again: after one re-queue it goes to the manager, here to blocked-on-human", async (t) => {
  const { ticket, lancements, avertissements } = await bloqueSur(t, EVIDENCE, { tours: 3 });
  assert.equal(lancements(), 2, "one re-queue, then the second cook's block goes to the manager and the chef, and nothing takes it after");
  assert.equal(ticket.labels.has(A_LA_MAIN), true);
  assert.equal(ticket.corps.split(MARQUE_DE_PREUVE).length, 2, "the evidence is appended once");
  assert.ok(avertissements.some((a) => a.includes("already carried the evidence")), avertissements.join("\n"));
});

test("evidence the station cannot write re-queues nothing: the block goes to the manager as any other, and the station says why", async (t) => {
  const { ticket, avertissements } = await bloqueSur(t, EVIDENCE, {
    ecrire: async () => {
      throw new Error("HTTP 502");
    },
  });
  assert.equal(ticket.labels.has(A_LA_MAIN), true);
  assert.equal(ticket.corps, CORPS);
  assert.ok(avertissements.some((a) => a.includes("could not be gathered or written: HTTP 502")), avertissements.join("\n"));
});

test("a ticket that is not a measurement, or counts no ticket, is not a case of evidence; unreadable counted tickets or body re-queue nothing", async () => {
  const lu = (corps: string, commentaires: () => Promise<never[]> = async () => []) => ({ corpsDuTicket: async () => corps, commentaires, ecrireCorps: async () => assert.fail("nothing is written") });
  assert.equal(await ajouterLaPreuve(lu("an ordinary ticket"), 1, EVIDENCE), null);
  assert.equal(await ajouterLaPreuve(lu(`${MARQUE_QUALITE}\n${marqueDesComptes([])}`), 1, EVIDENCE), null);
  assert.equal(await ajouterLaPreuve(lu(CORPS), 1, PRODUIT), null);
  const illisibles = await ajouterLaPreuve(lu(CORPS, async () => Promise.reject(new Error("HTTP 500"))), 1, EVIDENCE);
  assert.deepEqual(illisibles, { relance: false, pourquoi: "the evidence could not be gathered or written: HTTP 500" });
  const corpsIllisible = await ajouterLaPreuve({ corpsDuTicket: async () => Promise.reject(new Error("HTTP 404")), commentaires: async () => [], ecrireCorps: async () => {} }, 1, EVIDENCE);
  assert.deepEqual(corpsIllisible, { relance: false, pourquoi: "the ticket's body could not be read: HTTP 404" });
  const sansEcriture = await ajouterLaPreuve({ corpsDuTicket: async () => CORPS, commentaires: async () => [] }, 1, EVIDENCE);
  assert.deepEqual(sansEcriture, { relance: false, pourquoi: "this GitHub client cannot write the ticket's body" });
});
