// La projection des découpages : où en est chaque épique, et ses tickets.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import type { TicketPrevu } from "../src/evenements/manager.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { creationsAnnoncees, decoupageDe, decoupages, decoupagesDuManager, epiquesDecoupees, epiquesEnAttente, ticketDEpique, ticketsDEpique } from "../src/projections/decoupages.ts";
import { horloge, repertoireTemporaire, JOUR_HORLOGE } from "./outils.ts";

const prevu = (title: string, waitsFor: number[] = []): TicketPrevu => ({ title, context: "", criteria: ["Un critère."], waitsFor, zone: ["docs/"], model: "haiku", effort: "low", calibration: "Doc." });
const PLAN = [prevu("Le socle"), prevu("La suite", [1])];

function histoire(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge(), projections: [decoupages] });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = 30) => journal.ajouter({ project: "brigade", ticket, author: "manager", ...fait });
  const decouper = (fingerprint = "e1") =>
    noter({ type: "manager.split", payload: { run: "decoupe-30-a", fingerprint, reason: "Deux livrables.", order: "Le socle d'abord.", tickets: PLAN } });
  return { base: journal.base, noter, decouper };
}

test("une épique découpée porte son plan, son motif, et l'avancement de ce qui en est né", (t) => {
  const { base, noter, decouper } = histoire(t);
  assert.equal(decoupageDe(base, 30), null);

  decouper();
  assert.deepEqual(decoupageDe(base, 30), {
    epic: 30,
    state: "split",
    fingerprint: "e1",
    run: "decoupe-30-a",
    reason: "Deux livrables.",
    order: "Le socle d'abord.",
    tickets: PLAN,
    done: false,
    commented: false,
    listed: null,
    at: `${JOUR_HORLOGE}T10:00:00.000Z`,
  });

  noter({ type: "manager.split-creating", payload: { index: 1 } });
  assert.deepEqual(creationsAnnoncees(base, 30), [1]);
  assert.deepEqual(ticketsDEpique(base, 30), []);

  noter({ type: "manager.split-created", payload: { epic: 30, index: 1, reconciled: false } }, 501);
  assert.deepEqual(ticketDEpique(base, 501), { ticket: 501, epic: 30, index: 1, title: "Le socle", open: true, fired: false });
  noter({ type: "manager.split-fired", payload: { epic: 30, index: 1 } }, 501);
  assert.equal(ticketDEpique(base, 501)?.fired, true);

  noter({ type: "manager.split-done", payload: {} });
  noter({ type: "manager.split-commented", payload: {} });
  noter({ type: "manager.split-listed", payload: { digest: "abc" } });
  assert.deepEqual((({ done, commented, listed }) => ({ done, commented, listed }))(decoupageDe(base, 30) ?? ({} as never)), { done: true, commented: true, listed: "abc" });
  assert.deepEqual(epiquesDecoupees(base).map((decoupage) => decoupage.epic), [30]);
});

test("une question, puis sa réponse : la décision suivante remplace la précédente, et ce qui était dit ne vaut plus", (t) => {
  const { base, noter, decouper } = histoire(t);

  noter({ type: "manager.split-asked", payload: { run: "decoupe-30-a", fingerprint: "e0", question: "Quel écran ?" } });
  noter({ type: "manager.split-commented", payload: {} });
  assert.deepEqual((({ state, reason, commented, tickets }) => ({ state, reason, commented, tickets }))(decoupageDe(base, 30) ?? ({} as never)), {
    state: "asked",
    reason: "Quel écran ?",
    commented: true,
    tickets: [],
  });
  assert.deepEqual(epiquesDecoupees(base), []);

  decouper();
  assert.deepEqual((({ state, commented }) => ({ state, commented }))(decoupageDe(base, 30) ?? ({} as never)), { state: "split", commented: false });
});

test("un découpage ne se défait ni ne se refait : aucun fait ultérieur ne le remplace", (t) => {
  const { base, noter, decouper } = histoire(t);
  decouper();
  noter({ type: "manager.split-done", payload: {} });

  noter({ type: "manager.split-asked", payload: { run: "decoupe-30-b", fingerprint: "e2", question: "Encore ?" } });
  noter({ type: "manager.split-failed", payload: { run: "decoupe-30-c", fingerprint: "e3", reason: "illisible" } });
  noter({ type: "manager.split", payload: { run: "decoupe-30-d", fingerprint: "e4", reason: "Autre.", order: "Autre.", tickets: [prevu("Un autre")] } });

  const connu = decoupageDe(base, 30);
  assert.deepEqual([connu?.state, connu?.fingerprint, connu?.done, connu?.tickets.length], ["split", "e1", true, 2]);
});

test("les tickets d'une épique : ceux du découpage dans leur ordre, puis ceux du chef ; ouverts ou fermés", (t) => {
  const { base, noter, decouper } = histoire(t);
  decouper();
  noter({ type: "manager.split-adopted", payload: { epic: 30, title: "Un ajout du chef" } }, 40);
  noter({ type: "manager.split-created", payload: { epic: 30, index: 2, reconciled: true } }, 502);
  noter({ type: "manager.split-created", payload: { epic: 30, index: 1, reconciled: false } }, 501);
  // Un ticket déjà né du découpage n'est pas adopté par-dessus.
  noter({ type: "manager.split-adopted", payload: { epic: 30, title: "Réécrit" } }, 501);
  noter({ type: "manager.split-seen", payload: { epic: 30, open: false } }, 502);

  assert.deepEqual(ticketsDEpique(base, 30).map(({ ticket, index, title, open }) => [ticket, index, title, open]), [
    [501, 1, "Le socle", true],
    [502, 2, "La suite", false],
    [40, null, "Un ajout du chef", true],
  ]);
  noter({ type: "manager.split-seen", payload: { epic: 30, open: true } }, 502);
  assert.equal(ticketDEpique(base, 502)?.open, true);
  assert.equal(ticketDEpique(base, 41), null);
});

test("les dernières décisions de découpage se lisent, la plus récente d'abord", (t) => {
  const { base, noter, decouper } = histoire(t);
  decouper();
  noter({ type: "manager.split-skipped", payload: { run: "decoupe-31-a", fingerprint: "e5", reason: "Elle liste déjà ses tickets." } }, 31);
  noter({ type: "manager.split-failed", payload: { run: "decoupe-32-a", fingerprint: "e6", reason: "aucun ticket" } }, 32);

  assert.deepEqual(decoupagesDuManager(base, 2).map((decoupage) => [decoupage.epic, decoupage.state, decoupage.reason]), [
    [32, "failed", "aucun ticket"],
    [31, "skipped", "Elle liste déjà ses tickets."],
  ]);
});

test("un fait de découpage sans épique, ou d'une forme inconnue, ne casse pas le rejeu", (t) => {
  const { base, noter } = histoire(t);

  noter({ type: "manager.split", payload: { run: "r", fingerprint: "e", reason: "m", order: "o", tickets: PLAN } }, null);
  noter({ type: "manager.split-created", payload: { epic: "trente", index: 1, reconciled: false } as never }, 501);
  noter({ type: "manager.split-creating", payload: {} as never });

  assert.deepEqual(epiquesDecoupees(base), []);
  assert.equal(ticketDEpique(base, 501), null);
  assert.deepEqual(creationsAnnoncees(base, 30), []);
});

test("une épique à question ou au découpage illisible attend le chef ; fermée, elle le dit, jusqu'à sa réouverture", (t) => {
  const { base, noter, decouper } = histoire(t);
  const attendues = () => epiquesEnAttente(base).map(({ epic, state, closed }) => [epic, state, closed]);
  noter({ type: "manager.split-asked", payload: { run: "decoupe-30-a", fingerprint: "e1", question: "Quel périmètre ?" } });
  noter({ type: "manager.split-failed", payload: { run: "decoupe-31-a", fingerprint: "e1", reason: "aucun objet JSON" } }, 31);
  noter({ type: "manager.split-skipped", payload: { run: "decoupe-32-a", fingerprint: "e1", reason: "Déjà listée." } }, 32);
  assert.deepEqual(attendues(), [[30, "asked", false], [31, "failed", false]]);

  noter({ type: "manager.closed", payload: {} });
  noter({ type: "manager.closed", payload: {} }, 31);
  assert.deepEqual(attendues(), [[30, "asked", true], [31, "failed", true]]);

  noter({ type: "manager.reopened", payload: {} }, 31);
  assert.deepEqual(attendues(), [[30, "asked", true], [31, "failed", false]]);

  // Rouverte puis découpée : elle n'attend plus.
  noter({ type: "manager.reopened", payload: {} });
  decouper();
  assert.deepEqual(attendues(), [[31, "failed", false]]);
});
