// La porte de TODO : seule une carte typée — product, design ou gesture — qui
// dit en une ligne ce qu'on attend du chef y entre ; une carte design montre sa
// capture. Le refus s'écrit au journal avec sa raison, et la carte refusée
// n'est pas dans la file du chef.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { attentesDuChef } from "../src/attend.ts";
import { cartesEnTodo, entrerDansTodo, jugerCarte, sortirDeTodo } from "../src/carte-todo.ts";
import { decrireEtat, faits, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const PROJET = "brigade";
const MAINTENANT = new Date(`${JOUR_HORLOGE}T12:00:00.000Z`);

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number, author = "runtime") => journal.ajouter({ project: PROJET, ticket, author, ...fait });
  const arriver = (ticket: number) =>
    noter(
      {
        type: "ticket.arrived",
        payload: { title: `Ticket ${ticket}`, priority: null, createdAt: "2026-10-01T00:00:00Z", url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone: [], problems: [] } },
      },
      ticket,
      "github",
    );
  const todo = () => attentesDuChef(journal.base, lireRail(journal.base), MAINTENANT);
  // Les lignes du bloc `awaiting` de `status` : ce que le chef lit de TODO.
  const bloc = () => {
    const lignes = decrireEtat(lireEtat(journal, MAINTENANT), MAINTENANT);
    return lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("awaiting")), lignes.indexOf("end awaiting"));
  };
  const refus = () => journal.base.lire<{ ticket: number; payload: string }>("SELECT ticket, payload FROM events WHERE type = 'todo.refused' ORDER BY seq").map(({ ticket, payload }) => ({ ticket, ...JSON.parse(payload) }));
  return { journal, noter, arriver, todo, bloc, refus };
}

test("chacun des trois types entre dans TODO : la carte y dit son type et son énoncé en une ligne, dans `status` comme dans `faits`", (t) => {
  const { journal, arriver, todo, bloc } = cuisine(t);
  for (const ticket of [1, 2, 3]) arriver(ticket);
  const admises = [
    entrerDansTodo(journal, PROJET, 1, { type: "product", enonce: "  one list per project, or one for all projects?  " }, "manager"),
    entrerDansTodo(journal, PROJET, 2, { type: "design", enonce: "validate the empty rail screen", capture: "docs/captures/2/rail-vide-apres.png" }, "pass"),
    entrerDansTodo(journal, PROJET, 3, { type: "Gesture", enonce: "give the service account read access to the client's repository" }, "station:box/claude"),
  ];
  assert.deepEqual(
    admises.map((jugement) => jugement.admise),
    [true, true, true],
  );

  assert.deepEqual(
    todo().map((attente) => (attente.quoi === "carte" ? { ticket: attente.ticket, ...attente.carte } : attente.quoi)),
    [
      { ticket: 1, type: "product", enonce: "one list per project, or one for all projects?", capture: null },
      { ticket: 2, type: "design", enonce: "validate the empty rail screen", capture: "docs/captures/2/rail-vide-apres.png" },
      { ticket: 3, type: "gesture", enonce: "give the service account read access to the client's repository", capture: null },
    ],
  );
  const lignes = bloc();
  assert.match(lignes[0] ?? "", /^awaiting {3}3 decisions await the chef — the oldest for /);
  assert.match(lignes[1] ?? "", /^ {2}#1 {2}for .* {2}product: one list per project, or one for all projects\? {2}Ticket 1$/);
  assert.match(lignes[2] ?? "", /^ {2}#2 {2}for .* {2}design: validate the empty rail screen — capture: `docs\/captures\/2\/rail-vide-apres\.png` {2}Ticket 2$/);
  assert.match(lignes[3] ?? "", /^ {2}#3 {2}for .* {2}gesture: give the service account read access to the client's repository {2}Ticket 3$/);

  const attend = faits(lireEtat(journal, MAINTENANT), MAINTENANT).attend;
  assert.deepEqual(attend[0]?.decision, { quoi: "carte", motif: "product", cause: "one list per project, or one for all projects?", pr: null });
  assert.deepEqual(attend[1]?.carte, { type: "design", enonce: "validate the empty rail screen", capture: "docs/captures/2/rail-vide-apres.png" });
  assert.equal(attend[2]?.carte?.type, "gesture");
  // L'entrée est au journal, au nom de qui l'a posée.
  const entrees = journal.base.lire<{ ticket: number; author: string; payload: string }>("SELECT ticket, author, payload FROM events WHERE type = 'todo.entered' ORDER BY seq");
  assert.deepEqual(
    entrees.map(({ ticket, author, payload }) => [ticket, author, JSON.parse(payload).kind]),
    [
      [1, "manager", "product"],
      [2, "pass", "design"],
      [3, "station:box/claude", "gesture"],
    ],
  );
});

test("une carte sans type est refusée : la raison est au journal et dans ce qui est rendu, et la carte n'est pas dans TODO", (t) => {
  const { journal, arriver, todo, bloc, refus } = cuisine(t);
  arriver(4);
  for (const type of [undefined, null, "", "   "]) {
    const jugement = entrerDansTodo(journal, PROJET, 4, { type, enonce: "merge the PR by hand" }, "pass");
    assert.deepEqual(jugement, { admise: false, raison: "no type: a TODO card says whether it is product, design or gesture" });
  }
  assert.deepEqual(todo(), []);
  assert.deepEqual(bloc(), ["awaiting   nothing awaits the chef"]);
  assert.deepEqual(refus().map(({ ticket, kind, statement, reason }) => [ticket, kind, statement, reason]), Array.from({ length: 4 }, () => [4, null, "merge the PR by hand", "no type: a TODO card says whether it is product, design or gesture"]));
});

test("une carte d'un type inconnu est refusée, en nommant le type proposé", (t) => {
  const { journal, arriver, todo, refus } = cuisine(t);
  arriver(5);
  for (const type of ["merge", "split", "produit", "decision"]) {
    const jugement = entrerDansTodo(journal, PROJET, 5, { type, enonce: "something to settle" }, "manager");
    assert.deepEqual(jugement, { admise: false, raison: `unknown type “${type}”: a TODO card is product, design or gesture` });
  }
  assert.deepEqual(todo(), []);
  assert.deepEqual(
    refus().map(({ kind }) => kind),
    ["merge", "split", "produit", "decision"],
  );
});

test("une carte design sans capture est refusée ; avec, elle entre et la montre", (t) => {
  const { journal, arriver, todo, refus } = cuisine(t);
  arriver(6);
  for (const capture of [undefined, null, "", "  "]) {
    const jugement = entrerDansTodo(journal, PROJET, 6, { type: "design", enonce: "validate the card sheet" }, "station:box/claude");
    assert.equal(jugement.admise, false);
    assert.equal(jugerCarte({ type: "design", enonce: "validate the card sheet", capture }).admise, false);
  }
  assert.deepEqual(todo(), []);
  assert.equal(refus()[0]?.reason, "design card without a capture: a screen or render to validate is shown with its capture");

  assert.equal(entrerDansTodo(journal, PROJET, 6, { type: "design", enonce: "validate the card sheet", capture: "https://exemple.test/fiche.png" }, "station:box/claude").admise, true);
  assert.deepEqual(cartesEnTodo(journal.base).map(({ ticket, capture }) => [ticket, capture]), [[6, "https://exemple.test/fiche.png"]]);
  assert.equal(todo().length, 1);
});

test("l'énoncé est dit, et en une ligne : vide ou sur plusieurs lignes, la carte est refusée", () => {
  for (const enonce of [undefined, null, "", "  "]) assert.deepEqual(jugerCarte({ type: "product", enonce }), { admise: false, raison: "no statement: a TODO card says in one line what is expected of the chef" });
  for (const enonce of ["choose A\nor B", "choose A\r\nor B"]) assert.deepEqual(jugerCarte({ type: "gesture", enonce }), { admise: false, raison: "statement on several lines: a TODO card says in one line what is expected of the chef" });
  assert.equal(jugerCarte({ type: "design", enonce: "validate", capture: "a.png\nb.png" }).admise, false);
  // Une capture sur une carte produit ou geste est permise, sans être exigée.
  assert.deepEqual(jugerCarte({ type: "product", enonce: "A or B?", capture: "docs/captures/9/a.png" }), { admise: true, carte: { type: "product", enonce: "A or B?", capture: "docs/captures/9/a.png" } });
});

test("une carte sort de TODO par son geste, quand son ticket quitte le rail ou est servi ; une nouvelle carte remplace l'ancienne ; un refus ne touche pas la carte en place", (t) => {
  const { journal, noter, arriver, todo } = cuisine(t);
  for (const ticket of [7, 8, 9]) arriver(ticket);
  for (const ticket of [7, 8, 9]) entrerDansTodo(journal, PROJET, ticket, { type: "product", enonce: `choice for #${ticket}` }, "manager");

  entrerDansTodo(journal, PROJET, 7, { type: "gesture", enonce: "set the secret" }, "manager");
  entrerDansTodo(journal, PROJET, 7, { type: "nothing", enonce: "ignored" }, "manager");
  assert.deepEqual(
    cartesEnTodo(journal.base).map(({ ticket, type, enonce }) => [ticket, type, enonce]),
    [
      [8, "product", "choice for #8"],
      [9, "product", "choice for #9"],
      [7, "gesture", "set the secret"],
    ],
  );

  assert.equal(sortirDeTodo(journal, PROJET, 8, "decided on the issue", "chef"), true);
  assert.equal(sortirDeTodo(journal, PROJET, 8, "again", "chef"), false);
  noter({ type: "ticket.left", payload: { reason: "closed" } }, 9, "github");
  assert.deepEqual(
    todo().map(({ ticket }) => ticket),
    [7],
  );
  noter({ type: "ticket.served", payload: {} }, 7);
  assert.deepEqual(todo(), []);
});

test("la carte d'un ticket qui attend un tiers n'est pas dans TODO", (t) => {
  const { journal, noter, arriver, todo } = cuisine(t);
  arriver(10);
  entrerDansTodo(journal, PROJET, 10, { type: "gesture", enonce: "open the client's account" }, "manager");
  noter({ type: "ticket.waiting", payload: { what: "the client's answer", who: "the client", followUp: "2026-12-01T00:00:00.000Z" } }, 10, "chef");
  assert.deepEqual(todo(), []);
});
