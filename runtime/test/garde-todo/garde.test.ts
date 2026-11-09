// La garde d'autonomie de TODO : une demande technique (merge, rebase, rerun)
// n'entre jamais dans la file du chef, elle est renvoyée au triage avec sa
// raison ; une question de produit et une relecture humaine y entrent.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { attentesDuChef } from "../../src/attend.ts";
import { entrerDansTodo, jugerCarte, type Proposition } from "../../src/carte-todo.ts";
import { refuserGesteGit } from "../../src/garde-todo/geste-git.ts";
import { refuserSansQuestion, refuserSansReponse } from "../../src/garde-todo/question-reponse.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { lireRail } from "../../src/projections/rail.ts";
import { aArreter, JOUR_HORLOGE, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date(`${JOUR_HORLOGE}T12:00:00.000Z`);
const carte = (enonce: string, type = "product"): Proposition => ({
  type,
  resume: "A delivery is waiting on the base.",
  enonce,
  choix: [{ texte: "Yes." }, { texte: "No." }],
});

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
  aArreter(t, () => journal.fermer());
  journal.ajouter({
    project: "brigade",
    ticket: 7,
    author: "github",
    type: "ticket.arrived",
    payload: { title: "Ticket 7", priority: null, createdAt: "2026-10-01T00:00:00Z", url: "https://exemple.test/7", card: { waitsFor: [], zone: [], problems: [] } },
  });
  return { journal, todo: () => attentesDuChef(journal.base, lireRail(journal.base), MAINTENANT) };
}

for (const [mot, enonce] of [
  ["merge", "Merge PR #2908?"],
  ["rebase", "Rebase branch cook/12-x on main?"],
  ["rerun", "Rerun the CI?"],
  ["rerun", "Please re-run the failing checks?"],
  ["merge", "Can you merge pull request #12?"],
] as const) {
  test(`la porte refuse « ${enonce} » avec la raison de la garde (la carte qu'un triage réécrit, laisserEntrer)`, () => {
    const jugement = jugerCarte(carte(enonce));
    assert.equal(jugement.admise, false);
    assert.match(jugement.admise ? "" : jugement.raison, new RegExp(`git gesture .*${mot}.*fix ticket`));
    assert.equal(refuserGesteGit(carte(enonce)) !== null, true);
  });
}

test("une carte de produit et une demande de relecture humaine entrent toujours dans le TODO", (t) => {
  const { journal, todo } = cuisine(t);
  assert.equal(entrerDansTodo(journal, "brigade", 7, carte("Which merge strategy should the project use, squash or rebase?"), "manager").porte, "todo");
  assert.equal(entrerDansTodo(journal, "brigade", 7, carte("Can you review the wording of the new onboarding screen?"), "manager").porte, "todo");
  assert.equal(todo().length, 1);
});

test("la garde ne lit que la question, pas les choix", () => {
  assert.equal(refuserGesteGit({ enonce: "Is the empty rail right?", choix: [{ texte: "Merge PR #1." }] }), null);
});

test("une carte sans question est refusée avec sa raison, et n'entre pas dans le TODO", (t) => {
  for (const enonce of [undefined, null, "", "  "]) {
    const sans = jugerCarte({ ...carte("x"), enonce });
    assert.equal(sans.admise, false);
    assert.equal(sans.admise ? "" : sans.raison, "no question: a TODO card asks the chef exactly one question");
  }
  assert.match(refuserSansQuestion({ enonce: " " }) ?? "", /^no question/);
  const { journal, todo } = cuisine(t);
  const entree = entrerDansTodo(journal, "brigade", 7, { ...carte("x"), enonce: "" }, "manager");
  assert.equal(entree.porte, "triage");
  assert.equal(todo().length, 0);
});

test("une carte avec sa question mais sans chemin de réponse est refusée avec sa raison", (t) => {
  for (const choix of [undefined, null, []]) {
    const sans = jugerCarte({ ...carte("Which strategy?"), choix });
    assert.equal(sans.admise, false);
    assert.equal(sans.admise ? "" : sans.raison, "no choice: a TODO card offers at least one choice to click");
  }
  assert.match(refuserSansReponse({ choix: [] }) ?? "", /^no choice/);
  const { journal, todo } = cuisine(t);
  assert.equal(entrerDansTodo(journal, "brigade", 7, { ...carte("Which strategy?"), choix: [] }, "manager").porte, "triage");
  assert.equal(todo().length, 0);
});

test("une carte avec sa question et son chemin de réponse entre dans le TODO", (t) => {
  assert.equal(refuserSansQuestion(carte("Which strategy?")), null);
  assert.equal(refuserSansReponse(carte("Which strategy?")), null);
  const { journal, todo } = cuisine(t);
  assert.equal(entrerDansTodo(journal, "brigade", 7, carte("Which strategy?"), "manager").porte, "todo");
  assert.equal(todo().length, 1);
});
