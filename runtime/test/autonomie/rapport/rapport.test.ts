// The daily report: the entries of the last 24 hours grouped by kind of
// decision, each with its link, an empty day said explicitly, and nothing of
// the decisions made under `brigade decides` or `I decide`. `report` prints it.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { aiguiller, type Decision } from "../../../src/autonomie/decision/aiguillage.ts";
import { direLeRapport, rapportDuJour } from "../../../src/autonomie/rapport/rapport.ts";
import { poserRangee, RANGEES, type Position, type Rangee } from "../../../src/autonomie/table.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { principal as report } from "../../../src/rapport-cli.ts";
import { aArreter, appeler, faitInconnu, repertoireTemporaire } from "../../outils.ts";

const MAINTENANT = new Date("2026-10-08T12:00:00.000Z");
const heures = (h: number) => new Date(MAINTENANT.getTime() - h * 3_600_000);

function projet(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  // The clock of the log is the one test moves: each entry is stamped by it.
  let instant = heures(1);
  const journal = ouvrirJournal(repertoire, { maintenant: () => instant });
  aArreter(t, () => journal.fermer());
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", ...faitInconnu("test.seeded") });
  const decision = (row: Rangee, ticket: number): Decision => ({
    row,
    id: `${row}:#${ticket}`,
    ticket,
    question: `Apply ${row}?`,
    choices: [{ id: "apply", label: "Apply it" }],
  });
  const poser = (row: Rangee, position: Position) => poserRangee(journal, { projet: "brigade", auteur: "chef", maintenant: MAINTENANT, row, position });
  // Decides `row` at `quand`, as the kitchen would, with its summary and link.
  const decider = async (row: Rangee, ticket: number, quand: Date, what = `did ${row} on #${ticket}`) => {
    instant = quand;
    const d = decision(row, ticket);
    return aiguiller(journal, { projet: "brigade", auteur: "runtime", maintenant: MAINTENANT }, d, () => ({ what, link: `https://example.test/pull/${ticket}` }));
  };
  return { repertoire, journal, poser, decider };
}

describe("the daily report", () => {
  test("a day with entries is grouped by kind, each entry carrying its link", async (t) => {
    const { journal, poser, decider } = projet(t);
    poser("screens", "brigade-decides-and-tells-me");
    poser("cost", "brigade-decides-and-tells-me");
    await decider("cost", 12, heures(5), "raised  the calibration\nof #12");
    await decider("screens", 10, heures(4));
    await decider("screens", 11, heures(3));
    const r = rapportDuJour(journal.base, MAINTENANT);
    assert.equal(r.vide, false);
    assert.deepEqual(r.groups.map(({ row }) => row), ["screens", "cost"]);
    assert.deepEqual(r.groups[0]?.entries.map(({ ticket, link }) => [ticket, link]), [
      [10, "https://example.test/pull/10"],
      [11, "https://example.test/pull/11"],
    ]);
    assert.equal(r.groups[1]?.entries[0]?.summary, "raised the calibration of #12");
    assert.equal(r.groups[1]?.title, "Cost");
  });

  test("entries older than 24 hours are excluded", async (t) => {
    const { journal, poser, decider } = projet(t);
    poser("screens", "brigade-decides-and-tells-me");
    await decider("screens", 1, heures(25));
    await decider("screens", 2, heures(23));
    const r = rapportDuJour(journal.base, MAINTENANT);
    assert.deepEqual(r.groups.flatMap(({ entries }) => entries.map(({ ticket }) => ticket)), [2]);
  });

  test("decisions made under `brigade decides` or `I decide` never appear", async (t) => {
    const { journal, poser, decider } = projet(t);
    poser("screens", "brigade-decides");
    poser("cost", "i-decide");
    poser("merge", "brigade-decides-and-tells-me");
    await decider("screens", 1, heures(2));
    await decider("cost", 2, heures(2));
    await decider("merge", 3, heures(2));
    const r = rapportDuJour(journal.base, MAINTENANT);
    assert.deepEqual(r.groups.map(({ row }) => row), ["merge"]);
    assert.equal(r.groups[0]?.entries.length, 1);
    for (const row of RANGEES) if (row !== "merge") assert.ok(!r.groups.some((g) => g.row === row));
  });

  test("a day without entries is an explicit empty report, not an error", (t) => {
    const { journal } = projet(t);
    const r = rapportDuJour(journal.base, MAINTENANT);
    assert.equal(r.vide, true);
    assert.deepEqual(r.groups, []);
    assert.match(direLeRapport("brigade", r).join("\n"), /Nothing decided and told in the last 24 hours/);
  });
});

describe("the `report` command", () => {
  test("prints the report so it can be read by hand, the empty day too", async (t) => {
    const { repertoire, poser, decider } = projet(t);
    const vide = appeler((appel) => report(appel, MAINTENANT), [], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await vide.fin, 0);
    assert.match(vide.sortie(), /Nothing decided and told/);
    poser("screens", "brigade-decides-and-tells-me");
    await decider("screens", 10, heures(2));
    const lu = appeler((appel) => report(appel, MAINTENANT), [], { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await lu.fin, 0);
    assert.match(lu.sortie(), /Screens \(1\)\n {2}- did screens on #10 — https:\/\/example\.test\/pull\/10/);
  });

  test("refuses a call it cannot read", async () => {
    const sans = appeler((appel) => report(appel, MAINTENANT), []);
    assert.equal(await sans.fin, 2);
    const trop = appeler((appel) => report(appel, MAINTENANT), ["x"], { BRIGADE_STATE_DIR: "/nonexistent" });
    assert.equal(await trop.fin, 2);
  });
});
