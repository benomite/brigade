// A project's autonomy table, read from its log: today's behavior when nothing
// is set, the three positions read
// back at the next read, the rows no command changes, the profiles, and the
// log entry of every change. Everything runs in process, at the time given.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { AUJOURDHUI, appliquerProfil, AutonomieRefusee, FIXES, lireAutonomie, NOMS_DES_PROFILS, poserRangee, positionDe, POSITIONS, PROFILS, RANGEES, type Position, type Rangee } from "../../src/autonomie/table.ts";
import type { Fait } from "../../src/evenements.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, faitInconnu, horloge, repertoireTemporaire, JOUR_HORLOGE } from "../outils.ts";

const MAINTENANT = new Date(`${JOUR_HORLOGE}T12:00:00.000Z`);

function projet(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire, { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  const noter = (fait: Fait, author = "chef") => journal.ajouter({ project: "brigade", ticket: null, author, ...fait });
  // A project's log is never empty when the chef acts on it: something is written in it.
  noter(faitInconnu("test.seeded"), "runtime");
  const geste = { projet: "brigade", auteur: "chef", maintenant: MAINTENANT };
  const table = (maintenant = MAINTENANT) => lireAutonomie(journal.base, maintenant);
  const positions = (maintenant = MAINTENANT) => Object.fromEntries(table(maintenant).rows.map(({ row, position }) => [row, position]));
  const changements = () => journal.tout().filter((evenement) => evenement.type === "autonomy.changed");
  return { repertoire, journal, noter, geste, table, positions, changements };
}

const TOUT: (position: Position) => Record<Rangee, Position> = (position) => Object.fromEntries(RANGEES.map((row) => [row, position])) as Record<Rangee, Position>;

describe("a project with no table", () => {
  test("every kind of decision holds today's behavior, read as its default", (t) => {
    const { table } = projet(t);

    assert.deepEqual(
      table().rows,
      RANGEES.map((row) => ({ row, position: AUJOURDHUI[row], source: "default", fixed: false })),
    );
    assert.deepEqual(AUJOURDHUI, { merge: "brigade-decides", screens: "brigade-decides", specification: "brigade-decides", priorities: "i-decide", cost: "brigade-decides", dependencies: "i-decide", publishing: "brigade-decides" });
    assert.deepEqual(
      table().fixed.map(({ row, position, fixed }) => [row, position, fixed]),
      FIXES.map((row) => [row, "i-decide", true]),
    );
  });

  test("reading it writes nothing to the log", (t) => {
    const { journal, table } = projet(t);
    const avant = journal.dernierSeq();
    table();
    positionDe(journal.base, "screens", MAINTENANT);
    assert.equal(journal.dernierSeq(), avant);
  });
});

describe("the Merge row", () => {
  test("is an ordinary row: `brigade decides` by default, and setting it writes only `autonomy.changed`", (t) => {
    const { journal, geste, positions, table } = projet(t);
    assert.deepEqual(table().rows.find(({ row }) => row === "merge"), { row: "merge", position: "brigade-decides", source: "default", fixed: false });

    const avant = journal.dernierSeq();
    poserRangee(journal, { ...geste, row: "merge", position: "i-decide", auteur: "app:chef" });
    assert.equal(positions().merge, "i-decide");
    assert.equal(table().rows.find(({ row }) => row === "merge")?.source, "set");
    assert.deepEqual(
      journal.tout().filter(({ seq }) => seq > avant).map(({ type, author, payload }) => [type, author, payload]),
      [["autonomy.changed", "app:chef", { row: "merge", previous: "brigade-decides", position: "i-decide", profile: null }]],
    );
  });
});

describe("a row set to a position", () => {
  for (const position of POSITIONS) {
    test(`set to “${position}”, every row is read back so at the next read — from the same log, and from another handle on it`, (t) => {
      const { repertoire, journal, geste, positions } = projet(t);
      for (const row of RANGEES) poserRangee(journal, { ...geste, row, position });

      assert.deepEqual(positions(), TOUT(position));
      // Another process reads the same table, with nothing rebuilt.
      const autre = ouvrirJournal(repertoire, { lectureSeule: true });
      aArreter(t, () => autre.fermer());
      assert.deepEqual(Object.fromEntries(lireAutonomie(autre.base, MAINTENANT).rows.map(({ row, position: lue }) => [row, lue])), TOUT(position));
      for (const row of RANGEES) assert.equal(positionDe(autre.base, row, MAINTENANT), position);
    });
  }

  test("changed again while another handle stays open, the next read of that handle sees the new position", (t) => {
    const { repertoire, journal, geste } = projet(t);
    const autre = ouvrirJournal(repertoire, { lectureSeule: true });
    aArreter(t, () => autre.fermer());
    for (const position of POSITIONS) {
      poserRangee(journal, { ...geste, row: "cost", position });
      assert.equal(positionDe(autre.base, "cost", MAINTENANT), position);
    }
  });

  test("set to the position it already holds, nothing is written — but a row at its default is written: the chef chose it", (t) => {
    const { journal, geste, table } = projet(t);
    assert.notEqual(poserRangee(journal, { ...geste, row: "screens", position: AUJOURDHUI.screens }), null);
    assert.equal(table().rows.find(({ row }) => row === "screens")?.source, "set");
    assert.equal(poserRangee(journal, { ...geste, row: "screens", position: AUJOURDHUI.screens }), null);
  });

  test("an unknown row or position is refused, and nothing is written", (t) => {
    const { journal, geste } = projet(t);
    const avant = journal.dernierSeq();
    assert.throws(() => poserRangee(journal, { ...geste, row: "deploy", position: "i-decide" }), AutonomieRefusee);
    assert.throws(() => poserRangee(journal, { ...geste, row: "cost", position: "maybe" }), AutonomieRefusee);
    assert.throws(() => appliquerProfil(journal, { ...geste, profil: "startup" }), AutonomieRefusee);
    assert.equal(journal.dernierSeq(), avant);
  });
});

describe("the rows no command changes", () => {
  for (const row of FIXES) {
    test(`${row}: every attempt to change it is refused, nothing is written, and it stays “I decide”`, (t) => {
      const { journal, geste, table } = projet(t);
      const avant = journal.dernierSeq();
      for (const position of POSITIONS) {
        assert.throws(() => poserRangee(journal, { ...geste, row, position }), (erreur: unknown) => erreur instanceof AutonomieRefusee && /always “I decide”/.test(erreur.message));
      }
      // Not even a profile, nor a fact written by hand, moves it.
      for (const profil of NOMS_DES_PROFILS) appliquerProfil(journal, { ...geste, profil });
      assert.deepEqual(journal.tout().filter(({ seq, type, payload }) => seq > avant && type === "autonomy.changed" && (payload.row as string) === row), []);
      journal.ajouter({ project: "brigade", ticket: null, author: "chef", ...faitInconnu("autonomy.changed", { row, previous: "i-decide", position: "brigade-decides", profile: null }) });

      assert.deepEqual(table().fixed.find((ligne) => ligne.row === row), { row, position: "i-decide", source: "fixed", fixed: true });
      assert.equal(positionDe(journal.base, row, MAINTENANT), "i-decide");
    });
  }
});

describe("the profiles", () => {
  test("each sets exactly the table it says", (t) => {
    const { journal, geste, positions } = projet(t);
    const attendus: Record<string, Record<Rangee, Position>> = {
      prototype: TOUT("brigade-decides"),
      "client-product": { ...TOUT("brigade-decides"), screens: "i-decide", specification: "i-decide" },
      "internal-tool": TOUT("brigade-decides-and-tells-me"),
    };
    assert.deepEqual(PROFILS, attendus);
    for (const profil of NOMS_DES_PROFILS) {
      appliquerProfil(journal, { ...geste, profil });
      assert.deepEqual(positions(), attendus[profil], profil);
    }
  });

  for (const profil of NOMS_DES_PROFILS) {
    test(`${profil}, then one row changed: only that row moves`, (t) => {
      const { journal, geste, positions } = projet(t);
      appliquerProfil(journal, { ...geste, profil });
      const avant = positions();
      const autre = POSITIONS.find((position) => position !== avant.dependencies) ?? "i-decide";
      poserRangee(journal, { ...geste, row: "dependencies", position: autre });
      assert.deepEqual(positions(), { ...avant, dependencies: autre });
    });
  }

  test("applied, it writes one entry per row it moves, each naming the profile, in one transaction", (t) => {
    const { journal, geste, changements } = projet(t);
    const ecrits = appliquerProfil(journal, { ...geste, profil: "client-product" });
    assert.equal(ecrits.length, RANGEES.length);
    assert.deepEqual(new Set(changements().map(({ payload }) => payload.profile)), new Set(["client-product"]));
    // Applied again, it moves nothing.
    assert.deepEqual(appliquerProfil(journal, { ...geste, profil: "client-product" }), []);
  });
});

describe("the log of a change", () => {
  test("names the row, the old and the new position, and who changed it", (t) => {
    const { journal, geste, changements } = projet(t);
    poserRangee(journal, { ...geste, row: "priorities", position: "brigade-decides-and-tells-me", auteur: "app:chef" });
    poserRangee(journal, { ...geste, row: "priorities", position: "brigade-decides", auteur: "second" });

    assert.deepEqual(
      changements().map(({ author, project, payload }) => ({ author, project, ...payload })),
      [
        { author: "app:chef", project: "brigade", row: "priorities", previous: "i-decide", position: "brigade-decides-and-tells-me", profile: null },
        { author: "second", project: "brigade", row: "priorities", previous: "brigade-decides-and-tells-me", position: "brigade-decides", profile: null },
      ],
    );
  });
});
