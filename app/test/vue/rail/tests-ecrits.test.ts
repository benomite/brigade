// L'étape `tests written` du rail, lue de GitHub (ticket 3725, épique 3724) : un ticket dont les tests d'acceptation sont
// écrits et gelés porte le label `tests-written`. Entre `queued` et `taken`, la vue du rail le dit « tests written », dans
// On the rail — aucun cook ne l'a encore pris —, sa ligne de `status` et la ligne `rail` le comptent à part. Pris, il est
// `taken`, quel que soit ce label. Joué sur un faux GitHub, puis rendu par le rail de l'app.
import assert from "node:assert/strict";
import { test } from "node:test";
import { porter } from "../../../src/slip.ts";
import { comprendre, tableau as tableauDe, type Facts, type Tableau } from "../../../src/facts.ts";
import type { CallGitHub, AnswerGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuRepository, type ReadDuTableauDuRepository } from "../../../src/tableau/read.ts";
import { statusDuTableau } from "../../../src/tableau/rail.ts";

const REPOSITORY = "acme/kitchen";
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-03T21:00:00Z", labels: labels.map((name) => ({ name })) });
const taking = { id: 11, body: "<!-- brigade:prise station=box/claude -->\nTaken by station `box/claude`.", author_association: "OWNER", created_at: "2026-11-04T02:58:00Z" };

// Le projet : #1 en file, #7 en file avec ses tests écrits, #8 pris après ses tests.
const github: CallGitHub = async (chemin) => {
  if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return ok([issue(1, ["fire"]), issue(7, ["fire", "tests-written", "prio:2"]), issue(8, ["fire", "tests-written", "taken"])]);
  if (chemin.includes("/issues?")) return ok([]);
  if (chemin.includes("/pulls?")) return ok([]);
  if (chemin.includes("/issues/8/comments")) return ok([taking]);
  if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
  return { status: 404, data: {} };
};

const lire = () => lireLeTableauDuRepository({ depot: REPOSITORY, appeler: github, maintenant: () => new Date("2026-11-04T03:02:03.076Z") });
function dessine(lu: ReadDuTableauDuRepository): Tableau {
  assert.ok(lu.lu, "the rail is read");
  const facts = comprendre(JSON.stringify(lu.faits));
  assert.ok(!("informe" in facts), `facts are in shape: ${"informe" in facts ? facts.informe : ""}`);
  return tableauDe(facts as Facts, undefined, { texte: statusDuTableau(lu), a: lu.luLe });
}

test("a ticket whose acceptance tests are written shows 'tests written' on the rail, between 'queued' and 'taken'", async () => {
  const lu = await lire();
  assert.ok(lu.lu);
  const vu = dessine(lu);
  const cards = Object.fromEntries(vu.rail.colonnes.map(({ nom: name, cartes: cards }) => [name, cards.map(({ ticket, mot: word, etat: state, ton }) => `#${ticket} ${word ?? state} ${ton ?? "-"}`)]));
  // Pas encore pris : dans On the rail, sous son mot, au ton du rail ; pris, il est `taken`.
  assert.deepEqual(cards["On the rail"], ["#7 tests written gris", "#1 queued gris"]);
  assert.deepEqual(cards["Taken"], ["#8 taken bleu"]);
  // La ligne `rail` de `status` le compte à part, entre `taken` et `queued`.
  assert.match(statusDuTableau(lu), /^rail {7}1 taken · 1 tests written · 1 queued$/m);
});

test("its card reads its 'tests written' line: since when it is on the rail, and its priority", async () => {
  const lu = await lire();
  assert.ok(lu.lu);
  const line = lu.lignesDuRail.find(({ ticket }) => ticket === 7)?.ligne.replace(/^ {2}#\d+ {2}/, "");
  assert.equal(line, "tests written  prio:2  since 2026-11-03 21:00 UTC  Ticket 7");
  assert.deepEqual(porter({ etat: "tests écrits", titre: "Ticket 7" }, { lignes: [line ?? ""], bloque: false }).dit.slice(0, 1), [{ libelle: "since", valeur: "2026-11-03 21:00 UTC" }]);
  assert.equal(dessine(lu).rail.colonnes.find(({ nom: name }) => name === "On the rail")?.cartes.find(({ ticket }) => ticket === 7)?.prio, "prio:2");
});
