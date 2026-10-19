// La projection des découpages : où en est chaque épique, et ses tickets.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import type { TicketPrevu } from "../src/events/manager.ts";
import { openLog } from "../src/log.ts";
import { creationsAnnoncees, splitOf, splits, managerSplits, splitEpics, queuedEpics, epicTicket, epicTickets } from "../src/projections/splits.ts";
import { horloge, repertoireTemporaire, JOUR_HORLOGE } from "./outils.ts";

const prevu = (title: string, waitsFor: number[] = []): TicketPrevu => ({ title, context: "", criteria: ["Un critère."], waitsFor, zone: ["docs/"], model: "haiku", effort: "low", calibration: "Doc." });
const PLAN = [prevu("Le socle"), prevu("La suite", [1])];

function histoire(t: TestContext) {
  const log = openLog(repertoireTemporaire(t), { maintenant: horloge(), projections: [splits] });
  t.after(() => log.fermer());
  const noter = (fait: Fait, ticket: number | null = 30) => log.ajouter({ project: "brigade", ticket, author: "manager", ...fait });
  const decouper = (fingerprint = "e1") =>
    noter({ type: "manager.split", payload: { run: "decoupe-30-a", fingerprint, reason: "Deux livrables.", order: "Le socle d'abord.", tickets: PLAN } });
  return { base: log.base, noter, decouper };
}

test("une épique découpée porte son plan, son motif, et l'avancement de ce qui en est né", (t) => {
  const { base, noter, decouper } = histoire(t);
  assert.equal(splitOf(base, 30), null);

  decouper();
  assert.deepEqual(splitOf(base, 30), {
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
  assert.deepEqual(epicTickets(base, 30), []);

  noter({ type: "manager.split-created", payload: { epic: 30, index: 1, reconciled: false } }, 501);
  assert.deepEqual(epicTicket(base, 501), { ticket: 501, epic: 30, index: 1, title: "Le socle", open: true, fired: false });
  noter({ type: "manager.split-fired", payload: { epic: 30, index: 1 } }, 501);
  assert.equal(epicTicket(base, 501)?.fired, true);

  noter({ type: "manager.split-done", payload: {} });
  noter({ type: "manager.split-commented", payload: {} });
  noter({ type: "manager.split-listed", payload: { digest: "abc" } });
  assert.deepEqual((({ done, commented, listed }) => ({ done, commented, listed }))(splitOf(base, 30) ?? ({} as never)), { done: true, commented: true, listed: "abc" });
  assert.deepEqual(splitEpics(base).map((split) => split.epic), [30]);
});

test("une question, puis sa réponse : la décision suivante remplace la précédente, et ce qui était dit ne vaut plus", (t) => {
  const { base, noter, decouper } = histoire(t);

  noter({ type: "manager.split-asked", payload: { run: "decoupe-30-a", fingerprint: "e0", question: "Quel écran ?" } });
  noter({ type: "manager.split-commented", payload: {} });
  assert.deepEqual((({ state, reason, commented, tickets }) => ({ state, reason, commented, tickets }))(splitOf(base, 30) ?? ({} as never)), {
    state: "asked",
    reason: "Quel écran ?",
    commented: true,
    tickets: [],
  });
  assert.deepEqual(splitEpics(base), []);

  decouper();
  assert.deepEqual((({ state, commented }) => ({ state, commented }))(splitOf(base, 30) ?? ({} as never)), { state: "split", commented: false });
});

test("un découpage ne se défait ni ne se refait : aucun fait ultérieur ne le remplace", (t) => {
  const { base, noter, decouper } = histoire(t);
  decouper();
  noter({ type: "manager.split-done", payload: {} });

  noter({ type: "manager.split-asked", payload: { run: "decoupe-30-b", fingerprint: "e2", question: "Encore ?" } });
  noter({ type: "manager.split-failed", payload: { run: "decoupe-30-c", fingerprint: "e3", reason: "illisible" } });
  noter({ type: "manager.split", payload: { run: "decoupe-30-d", fingerprint: "e4", reason: "Autre.", order: "Autre.", tickets: [prevu("Un autre")] } });

  const connu = splitOf(base, 30);
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

  assert.deepEqual(epicTickets(base, 30).map(({ ticket, index, title, open }) => [ticket, index, title, open]), [
    [501, 1, "Le socle", true],
    [502, 2, "La suite", false],
    [40, null, "Un ajout du chef", true],
  ]);
  noter({ type: "manager.split-seen", payload: { epic: 30, open: true } }, 502);
  assert.equal(epicTicket(base, 502)?.open, true);
  assert.equal(epicTicket(base, 41), null);
});

test("les dernières décisions de découpage se lisent, la plus récente d'abord", (t) => {
  const { base, noter, decouper } = histoire(t);
  decouper();
  noter({ type: "manager.split-skipped", payload: { run: "decoupe-31-a", fingerprint: "e5", reason: "Elle liste déjà ses tickets." } }, 31);
  noter({ type: "manager.split-failed", payload: { run: "decoupe-32-a", fingerprint: "e6", reason: "aucun ticket" } }, 32);

  assert.deepEqual(managerSplits(base, 2).map((split) => [split.epic, split.state, split.reason]), [
    [32, "failed", "aucun ticket"],
    [31, "skipped", "Elle liste déjà ses tickets."],
  ]);
});

test("un fait de découpage sans épique, ou d'une forme inconnue, ne casse pas le rejeu", (t) => {
  const { base, noter } = histoire(t);

  noter({ type: "manager.split", payload: { run: "r", fingerprint: "e", reason: "m", order: "o", tickets: PLAN } }, null);
  noter({ type: "manager.split-created", payload: { epic: "trente", index: 1, reconciled: false } as never }, 501);
  noter({ type: "manager.split-creating", payload: {} as never });

  assert.deepEqual(splitEpics(base), []);
  assert.equal(epicTicket(base, 501), null);
  assert.deepEqual(creationsAnnoncees(base, 30), []);
});

test("une épique à question ou au découpage illisible attend le chef ; fermée, elle le dit, jusqu'à sa réouverture", (t) => {
  const { base, noter, decouper } = histoire(t);
  const attendues = () => queuedEpics(base).map(({ epic, state, closed }) => [epic, state, closed]);
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
