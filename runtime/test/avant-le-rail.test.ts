// Ce qui est avant le rail (#1836, amont.ts, `avantLeRail`) : les issues ouvertes du dépôt que le rail ne porte pas et
// qui n'y sont pas en route, chacune dans un seul de cinq états — pas lue, refusée incomplète, épique, prête sans
// `fire`, mise de côté. Un tableau de référence : un nombre connu d'issues dans chaque état, et les comptes attendus.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { avantLeRail, ETATS_AVANT_LE_RAIL } from "../src/amont.ts";
import type { Fait } from "../src/evenements.ts";
import type { Issue } from "../src/github.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const REFUS = { run: "juge-a", fingerprint: "e1", verdict: "refused", kind: "incomplete", reason: "Sans critère\nd'acceptation.", missing: "Un critère.", model: null, effort: null, calibration: null } as const;
const LANCE = { ...REFUS, verdict: "fire", kind: "ticket", missing: null, model: "sonnet", effort: "low", calibration: "Mécanique." } as const;

function journal(t: TestContext) {
  const ouvert = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  t.after(() => ouvert.fermer());
  const noter = (fait: Fait, ticket: number, author = "manager") => ouvert.ajouter({ project: "brigade", ticket, author, ...fait });
  return { base: ouvert.base, noter };
}

const issue = (number: number, labels: string[] = [], autres: Partial<Issue> = {}): Issue => ({
  number,
  title: `Ticket ${number}`,
  labels,
  state: "open",
  createdAt: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`,
  updatedAt: `2026-10-02T00:00:${String(number).padStart(2, "0")}Z`,
  url: `https://github.com/acme/brigade/issues/${number}`,
  ...autres,
});

test("un tableau de référence : chaque issue dans un seul des cinq états, et les comptes attendus", (t) => {
  const { base, noter } = journal(t);
  // Refusées : deux tickets incomplets ; une question et une issue de décision, que le manager laisse au chef.
  noter({ type: "manager.judged", payload: REFUS }, 20);
  noter({ type: "manager.judged", payload: REFUS }, 21);
  noter({ type: "manager.judged", payload: { ...REFUS, kind: "question" } }, 40);
  noter({ type: "manager.judged", payload: { ...REFUS, kind: "decision" } }, 41);
  // Jugée épique par le manager, sans `epic` posé.
  noter({ type: "manager.judged", payload: { ...REFUS, kind: "epic" } }, 31);
  // Mise sur le rail par le manager, `fire` pas encore posé.
  noter({ type: "manager.judged", payload: LANCE }, 34);
  // Écartées par le code : un `blocked-on-human`, et `hors-cuisine` jugé.
  noter({ type: "manager.set-aside", payload: { reason: "blocked-on-human", fired: false } }, 42);
  noter({ type: "manager.set-aside", payload: { reason: "hors-cuisine", fired: false } }, 43);
  const ouvertes = [
    issue(10),
    issue(11, ["prio:1"]),
    issue(12, ["bug"]),
    issue(20),
    issue(21, ["prio:2"]),
    issue(30, ["epic"]),
    issue(31),
    issue(32, ["epic", "prio:3"]),
    issue(33, ["model:opus", "effort:high"]),
    issue(34),
    issue(35, ["model:sonnet", "effort:low", "prio:1"]),
    issue(40),
    issue(41),
    issue(42, ["blocked-on-human"]),
    issue(43, ["hors-cuisine"]),
    // `hors-cuisine` l'emporte sur tout le reste : calibrée, épique, elle est mise de côté.
    issue(44, ["hors-cuisine", "epic", "model:opus", "effort:high"]),
    // Lancée : le rail la prend à son prochain sondage — elle n'est plus avant lui.
    issue(50, ["fire", "model:opus", "effort:high"]),
    // Une PR n'est jamais un ticket.
    issue(51, [], { pr: true }),
  ];

  const avant = avantLeRail(base, ouvertes);
  const comptes = Object.fromEntries(ETATS_AVANT_LE_RAIL.map((etat) => [etat, avant.filter((issue) => issue.etat === etat).map(({ ticket }) => ticket)]));
  assert.deepEqual(comptes, {
    "non-lue": [11, 10, 12],
    incomplete: [21, 20],
    epique: [32, 30, 31],
    prete: [35, 33, 34],
    "mise-de-cote": [40, 41, 42, 43, 44],
  });
  // Dans l'ordre où le manager les lit : `prio:1` d'abord, sans priorité en dernier, la plus ancienne à égalité.
  assert.deepEqual(avant.map(({ ticket }) => ticket), [11, 35, 21, 32, 10, 12, 20, 30, 31, 33, 34, 40, 41, 42, 43, 44]);
  // Ce qui la retient, en une ligne : les mots de `enAmont`, la raison du manager sans ses retours à la ligne.
  const de = (ticket: number) => avant.find((issue) => issue.ticket === ticket);
  assert.deepEqual(de(11), { ticket: 11, titre: "Ticket 11", priorite: 1, etat: "non-lue", dit: "the manager has not judged it yet" });
  assert.match(de(20)?.dit ?? "", /Sans critère d'acceptation\./);
  assert.doesNotMatch(de(20)?.dit ?? "", /\n/);
  assert.equal(de(30)?.dit, "it carries `epic`: not split yet");
  assert.match(de(34)?.dit ?? "", /put on the rail by the manager, sonnet \/ low/);
});

test("une issue sur le rail n'est pas avant lui", (t) => {
  const { base, noter } = journal(t);
  noter({ type: "ticket.arrived", payload: { title: "Ticket 60", priority: null, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/60", card: { waitsFor: [], zone: [], problems: [] } } }, 60, "github");
  assert.deepEqual(
    avantLeRail(base, [issue(60, ["fire", "model:opus", "effort:high"]), issue(61)]).map(({ ticket, etat }) => [ticket, etat]),
    [[61, "non-lue"]],
  );
});

test("rien d'ouvert hors du rail : rien avant lui", (t) => {
  const { base } = journal(t);
  assert.deepEqual(avantLeRail(base, []), []);
});
