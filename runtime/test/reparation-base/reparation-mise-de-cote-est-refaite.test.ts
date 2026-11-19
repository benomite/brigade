// Critère 3 de #3815 : la réparation est mise de côté, une nouvelle naît du
// dernier commit rouge de main, et son corps nomme le ticket mis de côté.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stationGitHub } from "../../src/brigade-github.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

test("when the repair ticket is set aside, a new one is created from the latest red commit of main, and its body names the set-aside ticket", async () => {
  const faux = new FauxGitHub();
  faux.feu(680, [...CALIBRE, "repair-main", "set-aside:failures"], "Repair main: the failing test, set aside after failures");
  faux.ticket(680).title = "Repair main: parses the clock";
  faux.base = "red";
  faux.teteDeLaBase = "d".repeat(40);
  const github = faux.pour("A");
  const creer = github.creerIssue;
  github.creerIssue = async (issue) => {
    const numero = await creer(issue);
    faux.ticket(numero).title = issue.titre;
    return numero;
  };
  github.journalDuCheck = async () => "not ok 1 - parses the clock\nAssertionError: expected 2 to equal 3";
  const station = stationGitHub({ nom: "A", places: 0, base: "main", github, prise: faux.prise(github, "A"), cuisiner: async () => assert.fail("no cook"), juger: async () => assert.fail("no review"), avertir: () => {} });
  await station.tour();
  const neuves = [...faux.tickets.values()].filter((ticket) => ticket.number !== 680 && ticket.state === "open" && ticket.labels.has("repair-main"));
  assert.equal(neuves.length, 1);
  const [neuve] = neuves;
  assert.ok(neuve?.title.startsWith("Repair main:"));
  assert.ok(neuve?.corps.includes("#680"));
  assert.ok(neuve?.corps.includes("d".repeat(40)));
});
