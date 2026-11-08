// Un ticket qui dépend d'un ticket ouvert l'attend sur le rail, jamais le chef
// (#2968). Les tests passent par la station (`stationDuDepot`), sur un faux
// GitHub : le faux `claude` est un cook qui finit sur un `<bloque>` qui nomme
// le ticket dont il dépend, ou sur un mot sans blocage.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { attendusDesCommentaires, attendusDuBlocage, corpsDeLAttente, MARQUE_D_ATTENTE_DE_TICKET } from "../../src/attente-ticket/attente-ticket.ts";
import { MARQUE_DE_LA_CONSULTATION } from "../../src/blocage-au-manager.ts";
import { A_LA_MAIN, priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import type { GitHub } from "../../src/github.ts";
import { CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";

const B = 20;
const A = 10;
const C = 11;
const CALIBRE = ["fire", "model:opus", "effort:medium"];
// Un ticket de la cuisine qu'aucun cook ne prend ici : son calibrage est incomplet.
const OUVERT = ["fire", "model:opus"];

type Options = { bloque?: string | null; avant?: (faux: FauxGitHub) => void };

// Une station où #B est prenable. Son premier cook finit sur `bloque` (null :
// sans blocage), les suivants sans blocage. `tour()` joue un tour de la station
// et rend les lignes de saut qu'elle a dites.
function station(t: TestContext, { bloque = null, avant }: Options = {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "attente-ticket-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(B, CALIBRE, "## Context\n\nThe dashboard's second screen.");
  avant?.(faux);
  let cooks = 0;
  const consultations: string[][] = [];
  const lancer: Lancer = ({ args, flux }) => {
    const consulte = args.some((arg) => arg.startsWith(MARQUE_DE_LA_CONSULTATION));
    if (consulte) consultations.push(args);
    else cooks += 1;
    const message = consulte ? JSON.stringify({ issue: "geste", geste: "merge the PR" }) : cooks === 1 && bloque !== null ? `I stopped.\n<livrable>\n<bloque>${bloque}</bloque>\n</livrable>` : "Done.\n<livrable>\nNothing.\n</livrable>";
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertissements: string[] = [];
  const sauts = new Map<number, string>();
  const client = fauxClient(faux);
  const github: GitHub = { ...client };
  const ouverte = stationDuDepot({
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
    manager: () => ({ model: "opus", effort: "high" }),
    flux: repertoire,
    lancer,
    avertir: (texte) => void avertissements.push(texte),
    sauter: (ticket, ligne) => void sauts.set(ticket, ligne),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    sauts.clear();
    await ouverte.tour();
    await ouverte.calme();
    return sauts.get(B) ?? null;
  };
  const commentaires = () => (faux.commentaires.get(B) ?? []).map((c) => c.body);
  return { faux, github, tour, cooks: () => cooks, consultations, avertissements, commentaires };
}

test("the tickets a blocked cook names as unmerged dependencies are the open kitchen tickets of its dependency sentences", () => {
  const ouverts = new Set([A, C, B, 30]);
  assert.deepEqual(attendusDuBlocage(`This ticket builds on #${A}, whose PR #2908 is not merged yet.`, B, ouverts), [A]);
  assert.deepEqual(attendusDuBlocage(`Ce ticket dépend de #${C} et de #${A}, pas encore mergés.`, B, ouverts), [A, C]);
  assert.deepEqual(attendusDuBlocage(`Which layout does the chef want? See #30 for the palette.`, B, ouverts), [], "a ticket named outside a dependency sentence is not awaited");
  assert.deepEqual(attendusDuBlocage(`It depends on #99, which is not merged.`, B, ouverts), [], "a ticket that is not an open kitchen ticket is not awaited");
  assert.deepEqual(attendusDuBlocage(`#${B} depends on its own branch.`, B, ouverts), [], "never itself");
});

test("the awaited tickets read from the comments: the fiche's `attend` line and the station's waiting marks", () => {
  const marque = corpsDeLAttente({ station: "box", attendus: [A, C], question: `Depends on #${A} and #${C}.\nAnd also #77 in the quote.` });
  assert.ok(marque.startsWith(`${MARQUE_D_ATTENTE_DE_TICKET} #${A}, #${C} -->`));
  assert.deepEqual(attendusDesCommentaires([`${MARQUEUR}\n- attend : #5\n- zone : src`, marque, "an ordinary comment naming #6"]).sort((x, y) => x - y), [5, A, C]);
  assert.deepEqual(attendusDesCommentaires(["nothing"]), []);
});

test("a cook that stops on an open ticket's unmerged work: the ticket waits for #A on the rail — no blocked-on-human, no TODO card, no manager — and its skip line names #A", async (t) => {
  const s = station(t, { bloque: `This ticket builds on the work of #${A}, which is not merged yet: I cannot start before it is.`, avant: (faux) => faux.feu(A, OUVERT) });
  assert.equal(await s.tour(), null, "first turn: the cook takes the ticket");
  assert.equal(s.cooks(), 1);
  const ticket = s.faux.ticket(B);
  assert.equal(ticket.labels.has(A_LA_MAIN), false, "not blocked-on-human");
  assert.equal(ticket.labels.has(CHEF_TODO), false, "no chef TODO card");
  assert.equal(ticket.labels.has(LABEL_TAKEN), false, "given back to the rail");
  assert.equal(ticket.labels.has("fire"), true);
  assert.equal(s.consultations.length, 0, "the manager is not consulted: nothing to decide");
  const attente = s.commentaires().find((corps) => corps.startsWith(MARQUE_D_ATTENTE_DE_TICKET));
  assert.match(attente ?? "", new RegExp(`^${MARQUE_D_ATTENTE_DE_TICKET} #${A} -->\\nStation \`box\`: the cook stopped because this ticket builds on the unmerged work of #${A}\\.`));
  assert.ok(s.commentaires().every((corps) => !corps.startsWith("**Gesture for the chef") && !corps.startsWith("**Question for the chef")), "no card for the chef");
  const saut = await s.tour();
  assert.equal(saut, `#${B} is claimable but not claimed, the claim gate skipped it: waiting for #${A} — it starts on its own once it is served`);
  assert.equal(s.cooks(), 1, "it waits while #A is open");
  // #A est servi : son issue se ferme. Au tour suivant, un cook prend #B, sans geste de personne.
  s.faux.ticket(A).state = "closed";
  assert.equal(await s.tour(), null);
  assert.equal(s.cooks(), 2, "a cook takes the ticket on the next pass once #A is served");
});

test("a ticket waiting on two open tickets starts only once both are served", async (t) => {
  const s = station(t, {
    bloque: `I need #${A} and #${C}: this ticket depends on both, and neither is merged.`,
    avant: (faux) => {
      faux.feu(A, OUVERT);
      faux.feu(C, OUVERT);
    },
  });
  await s.tour();
  assert.match(s.commentaires().find((corps) => corps.startsWith(MARQUE_D_ATTENTE_DE_TICKET)) ?? "", new RegExp(`^${MARQUE_D_ATTENTE_DE_TICKET} #${A}, #${C} -->`));
  assert.equal(await s.tour(), `#${B} is claimable but not claimed, the claim gate skipped it: waiting for #${A}, #${C} — it starts on its own once they are all served`);
  s.faux.ticket(A).state = "closed";
  assert.equal(await s.tour(), `#${B} is claimable but not claimed, the claim gate skipped it: waiting for #${C} — it starts on its own once it is served`);
  assert.equal(s.cooks(), 1, "one of the two is still open");
  s.faux.ticket(C).state = "closed";
  await s.tour();
  assert.equal(s.cooks(), 2, "both served: a cook takes it");
});

test("a fiche that says `attend : #A`: no cook takes the ticket while #A is open, even when #A is not a `fire` ticket — read on GitHub — and one does once #A is closed", async (t) => {
  const s = station(t, {
    avant: (faux) => {
      faux.feu(A, ["model:opus"]);
      faux.poster(B, "box", `${MARQUEUR}\n- attend : #${A}\n- zone : src/screen`);
    },
  });
  assert.equal(await s.tour(), `#${B} is claimable but not claimed, the claim gate skipped it: waiting for #${A} — it starts on its own once it is served`);
  assert.equal(s.cooks(), 0);
  s.faux.ticket(A).state = "closed";
  assert.equal(await s.tour(), null);
  assert.equal(s.cooks(), 1);
});

test("a blocked cook that names no open ticket keeps its way: the manager reads its question", async (t) => {
  const s = station(t, { bloque: "Which of the two layouts does the chef want?", avant: (faux) => faux.feu(A, OUVERT) });
  await s.tour();
  assert.equal(s.consultations.length, 1);
  assert.ok(s.commentaires().every((corps) => !corps.startsWith(MARQUE_D_ATTENTE_DE_TICKET)));
});

test("an awaited ticket that cannot be read on GitHub holds the ticket, and the station says why", async (t) => {
  const s = station(t, { avant: (faux) => faux.poster(B, "box", `${MARQUEUR}\n- attend : #${A}\n- zone : src/screen`) });
  const issue = s.github.issue.bind(s.github);
  s.github.issue = async (numero) => (numero === A ? Promise.reject(new Error("HTTP 502")) : issue(numero));
  await s.tour();
  assert.equal(s.cooks(), 0, "an unreadable awaited ticket holds it, as an unreadable dependency does");
  assert.ok(s.avertissements.some((texte) => texte.includes(`#${B}`) && texte.includes("HTTP 502")), s.avertissements.join("\n"));
});
