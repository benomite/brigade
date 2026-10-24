// A decision routed by the project's autonomy table: applied alone, applied and
// written for the daily report, or put to the chef as a card with its choices
// — the rows always `I decide` always as a card, the table read again on every
// decision, and a project with no table routed as before it existed.
// Everything runs in process, at the time given.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { aiguiller, cartes, consigner, DecisionInvalide, rapport, voieDe, type Accompli, type Decision } from "../../../src/autonomie/decision/aiguillage.ts";
import { appliquerProfil, AUJOURDHUI, FIXES, NOMS_DES_PROFILS, poserRangee, POSITIONS, RANGEES, type Fixe, type Position, type Rangee } from "../../../src/autonomie/table.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { aArreter, faitInconnu, horloge, repertoireTemporaire, JOUR_HORLOGE } from "../../outils.ts";

const MAINTENANT = new Date(`${JOUR_HORLOGE}T12:00:00.000Z`);
const LIEN = "https://github.com/acme/brigade/pull/1561";

function projet(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  // A project's log is never empty when a decision arises in it.
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", ...faitInconnu("test.seeded") });
  const geste = { projet: "brigade", auteur: "runtime", maintenant: MAINTENANT };
  const decision = (row: Rangee | Fixe, id = `${row}:#1561`): Decision => ({
    row,
    id,
    ticket: 1561,
    question: `Apply the ${row} decision on #1561?`,
    choices: [
      { id: "apply", label: "Apply it" },
      { id: "leave", label: "Leave it as it is" },
    ],
  });
  // The kitchen's own way of applying a decision: counted, so a test sees
  // whether the routing had it applied.
  const appliques: string[] = [];
  const appliquer = (id: string) => (): Accompli & { applied: string } => {
    appliques.push(id);
    return { what: `applied ${id}`, link: LIEN, applied: id };
  };
  const router = (row: Rangee | Fixe, id?: string) => {
    const d = decision(row, id);
    return aiguiller(journal, geste, d, appliquer(d.id));
  };
  const poser = (row: Rangee, position: Position) => poserRangee(journal, { projet: "brigade", auteur: "chef", maintenant: MAINTENANT, row, position });
  const ecrits = () => journal.tout().filter(({ type }) => type.startsWith("autonomy.") && type !== "autonomy.changed");
  return { repertoire, journal, geste, decision, appliques, router, poser, ecrits };
}

describe("a kind set to `brigade decides`", () => {
  for (const row of RANGEES) {
    test(`${row}: the decision is applied, with no card and no report entry`, async (t) => {
      const { router, poser, appliques, ecrits, journal } = projet(t);
      poser(row, "brigade-decides");

      const route = await router(row);
      assert.equal(route.voie, "brigade-decides");
      assert.deepEqual(route.voie === "brigade-decides" && route.resultat.applied, `${row}:#1561`);
      assert.deepEqual(appliques, [`${row}:#1561`]);
      assert.deepEqual(ecrits(), []);
      assert.deepEqual([cartes(journal.base), rapport(journal.base)], [[], []]);
    });
  }
});

describe("a kind set to `brigade decides and tells me`", () => {
  for (const row of RANGEES) {
    test(`${row}: the decision is applied, with no card, and one report entry says what was done and links to it`, async (t) => {
      const { router, poser, appliques, journal } = projet(t);
      poser(row, "brigade-decides-and-tells-me");

      const route = await router(row);
      assert.equal(route.voie, "brigade-decides-and-tells-me");
      assert.deepEqual(appliques, [`${row}:#1561`]);
      assert.deepEqual(cartes(journal.base), []);
      const entrees = rapport(journal.base);
      assert.equal(entrees.length, 1);
      const [entree] = entrees;
      assert.deepEqual(
        { row: entree?.row, ticket: entree?.ticket, decision: entree?.decision, what: entree?.what, link: entree?.link },
        { row, ticket: 1561, decision: `${row}:#1561`, what: `applied ${row}:#1561`, link: LIEN },
      );
      // Its timestamp is the moment it was written.
      assert.match(entree?.at ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      assert.deepEqual(route.voie === "brigade-decides-and-tells-me" && route.entree, entree);
      // The log carries it, for the daily report.
      assert.deepEqual(
        journal.tout().filter(({ type }) => type === "autonomy.reported").map(({ type, project, ticket, author, payload }) => ({ type, project, ticket, author, payload })),
        [{ type: "autonomy.reported", project: "brigade", ticket: 1561, author: "runtime", payload: { row, decision: `${row}:#1561`, what: `applied ${row}:#1561`, link: LIEN } }],
      );
    });
  }

  test("the report reads the entries written since an instant", async (t) => {
    const { router, poser, journal } = projet(t);
    poser("cost", "brigade-decides-and-tells-me");
    await router("cost", "cost:a");
    const [premiere] = rapport(journal.base);
    await router("cost", "cost:b");

    assert.deepEqual(rapport(journal.base).map(({ decision }) => decision), ["cost:a", "cost:b"]);
    const apres = new Date(Date.parse(premiere?.at ?? "") + 1).toISOString();
    assert.deepEqual(rapport(journal.base, apres).map(({ decision }) => decision), ["cost:b"]);
  });
});

describe("a kind set to `I decide`", () => {
  for (const row of RANGEES) {
    test(`${row}: nothing is applied, and a card lists its choices`, async (t) => {
      const { router, poser, appliques, journal } = projet(t);
      // With no grant, Merge already reads `I decide` and setting it writes
      // nothing: the chef moves it there from a `brigade` position.
      if (row === "merge") poser(row, "brigade-decides");
      poser(row, "i-decide");

      const route = await router(row);
      assert.equal(route.voie, "i-decide");
      assert.deepEqual(appliques, []);
      assert.deepEqual(rapport(journal.base), []);
      const lues = cartes(journal.base).map(({ row, ticket, decision, question, choices }) => ({ row, ticket, decision, question, choices }));
      assert.deepEqual(lues, [
        {
          row,
          ticket: 1561,
          decision: `${row}:#1561`,
          question: `Apply the ${row} decision on #1561?`,
          choices: [
            { id: "apply", label: "Apply it" },
            { id: "leave", label: "Leave it as it is" },
          ],
        },
      ]);
      assert.deepEqual(route.voie === "i-decide" && [route.nouvelle, route.carte], [true, cartes(journal.base)[0]]);
    });
  }

  test("the same decision arising again raises no second card", async (t) => {
    const { router, poser, journal } = projet(t);
    poser("dependencies", "i-decide");
    await router("dependencies");
    const encore = await router("dependencies");

    assert.deepEqual(encore.voie === "i-decide" && encore.nouvelle, false);
    assert.equal(cartes(journal.base).length, 1);
    await router("dependencies", "dependencies:other");
    assert.equal(cartes(journal.base).length, 2);
  });
});

describe("the rows always `I decide`", () => {
  for (const row of FIXES) {
    test(`${row}: a card, whatever the table says — with no table, and under every profile`, async (t) => {
      const { router, journal, appliques, geste, decision } = projet(t);
      const etats: Array<() => void> = [() => {}, ...NOMS_DES_PROFILS.map((profil) => () => void appliquerProfil(journal, { projet: "brigade", auteur: "chef", maintenant: MAINTENANT, profil }))];
      // Even a fact written by hand, which the table ignores, moves nothing.
      etats.push(() => void journal.ajouter({ project: "brigade", ticket: null, author: "chef", ...faitInconnu("autonomy.changed", { row, previous: "i-decide", position: "brigade-decides", profile: null }) }));

      for (const [rang, poser] of etats.entries()) {
        poser();
        assert.deepEqual(voieDe(journal.base, row, MAINTENANT), { voie: "i-decide", position: "i-decide" });
        const route = await router(row, `${row}:${rang}`);
        assert.equal(route.voie, "i-decide");
      }
      assert.deepEqual(appliques, []);
      assert.deepEqual(rapport(journal.base), []);
      assert.deepEqual(cartes(journal.base).map(({ row: lue, decision: id }) => [lue, id]), etats.map((_, rang) => [row, `${row}:${rang}`]));
      // And brigade cannot write a report entry for one.
      assert.throws(() => consigner(journal, geste, decision(row), { what: "done", link: LIEN }), DecisionInvalide);
    });
  }
});

describe("the table is read again on every decision", () => {
  test("a row changed between two calls: the second follows the new position, with no restart", async (t) => {
    const { router, poser, appliques, journal } = projet(t);
    poser("specification", "i-decide");
    assert.equal((await router("specification", "specification:a")).voie, "i-decide");

    poser("specification", "brigade-decides-and-tells-me");
    assert.equal((await router("specification", "specification:b")).voie, "brigade-decides-and-tells-me");

    poser("specification", "brigade-decides");
    assert.equal((await router("specification", "specification:c")).voie, "brigade-decides");

    assert.deepEqual(appliques, ["specification:b", "specification:c"]);
    assert.deepEqual(cartes(journal.base).map(({ decision }) => decision), ["specification:a"]);
    assert.deepEqual(rapport(journal.base).map(({ decision }) => decision), ["specification:b"]);
  });

  test("a row changed by another handle on the same log holds at the next decision of a handle that stayed open", async (t) => {
    const { repertoire, router } = projet(t);
    const chef = ouvrirJournal(repertoire);
    aArreter(t, () => chef.fermer());
    for (const position of POSITIONS) {
      poserRangee(chef, { projet: "brigade", auteur: "chef", maintenant: MAINTENANT, row: "publishing", position });
      assert.equal((await router("publishing", `publishing:${position}`)).voie, position);
    }
  });
});

describe("a project with no table", () => {
  test("every kind routes `today`, at the position of today's behavior: nothing is applied, nothing written", async (t) => {
    const { router, appliques, ecrits, journal } = projet(t);
    const avant = journal.dernierSeq();

    for (const row of RANGEES) {
      const route = await router(row);
      assert.deepEqual(route, { voie: "today", position: row === "merge" ? "i-decide" : AUJOURDHUI[row] }, row);
    }
    assert.deepEqual(appliques, []);
    assert.deepEqual(ecrits(), []);
    assert.equal(journal.dernierSeq(), avant);
  });

  test("the `merge` grant enabled by `grant` alone still routes `today`: the pass keeps its own reading of it", async (t) => {
    const { router, journal } = projet(t);
    journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "grant.activated", payload: { action: "merge", uses: 2 } });

    assert.deepEqual(await router("merge"), { voie: "today", position: "brigade-decides" });
  });

  test("a row the chef sets leaves the others on today's path", async (t) => {
    const { router, poser } = projet(t);
    poser("cost", "i-decide");

    assert.equal((await router("cost")).voie, "i-decide");
    assert.deepEqual(await router("screens"), { voie: "today", position: AUJOURDHUI.screens });
    assert.deepEqual(await router("merge"), { voie: "today", position: "i-decide" });
  });

  test("once the table has set the Merge row, merging follows it — `grant` commanding it afterwards included", async (t) => {
    const { router, poser, journal } = projet(t);
    poser("merge", "brigade-decides-and-tells-me");
    assert.equal((await router("merge", "merge:a")).voie, "brigade-decides-and-tells-me");

    journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "grant.revoked", payload: { action: "merge" } });
    assert.equal((await router("merge", "merge:b")).voie, "i-decide");
  });
});

describe("a decision the routing cannot carry", () => {
  test("no id, no choice or a choice listed twice: refused before anything is applied or written", async (t) => {
    const { journal, geste, decision, appliques, poser } = projet(t);
    poser("cost", "brigade-decides");
    const avant = journal.dernierSeq();
    const appliquer = () => {
      appliques.push("applied");
      return { what: "done", link: LIEN };
    };

    for (const fautive of [
      { ...decision("cost"), id: " " },
      { ...decision("cost"), choices: [] },
      { ...decision("cost"), choices: [{ id: "apply", label: "Apply" }, { id: "apply", label: "Apply again" }] },
    ]) {
      await assert.rejects(aiguiller(journal, geste, fautive, appliquer), DecisionInvalide);
    }
    assert.deepEqual(appliques, []);
    assert.equal(journal.dernierSeq(), avant);
  });
});
