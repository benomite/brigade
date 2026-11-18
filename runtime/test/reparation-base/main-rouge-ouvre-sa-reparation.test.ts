// Critère 1 de #3815 : main passe rouge, un ticket « Repair main: <test en échec> »
// est sur le rail dans le tour, avec le label `repair-main`, et son corps tient
// le nom du test et son erreur.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stationGitHub } from "../../src/brigade-github.ts";
import { FauxGitHub } from "../faux-github.ts";

const JOURNAL = ["2026-11-17T16:40:00.0000000Z ##[group]Run npm test", "2026-11-17T16:40:01.0000000Z not ok 1 - parses the clock", "2026-11-17T16:40:02.0000000Z AssertionError: expected 2 to equal 3", "2026-11-17T16:40:03.0000000Z ##[error]Process completed with exit code 1."].join("\n");

test("when main turns red, one scheduler cycle puts 'Repair main: <failing test>' on the rail with label repair-main, its body holding the test name and its error", async () => {
  const faux = new FauxGitHub();
  const github = faux.pour("A");
  const creer = github.creerIssue;
  github.creerIssue = async (issue) => {
    const numero = await creer(issue);
    faux.ticket(numero).title = issue.titre;
    return numero;
  };
  github.journalDuCheck = async () => JOURNAL;
  const station = stationGitHub({ nom: "A", places: 0, base: "main", github, prise: faux.prise(github, "A"), cuisiner: async () => assert.fail("no cook"), juger: async () => assert.fail("no review"), avertir: () => {} });
  faux.base = "red";
  await station.tour();
  const reparations = [...faux.tickets.values()].filter((ticket) => ticket.state === "open" && ticket.labels.has("repair-main"));
  assert.equal(reparations.length, 1);
  const [reparation] = reparations;
  assert.equal(reparation?.title, "Repair main: parses the clock");
  assert.ok(reparation?.corps.includes("parses the clock"));
  assert.ok(reparation?.corps.includes("AssertionError: expected 2 to equal 3"));
});
