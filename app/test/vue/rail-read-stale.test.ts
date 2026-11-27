// Le rail d'une lecture périmée, d'un refus de GitHub et d'une lecture absente (#3008) : l'état de lecture
// `{ reading, readAt, stale, refusal }`, joué avec des fixtures devant un faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tellTheRead, setTheRead, type StateOfRead } from "../../src/vue/rail-read-stale.js";
import { Fake } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const a = (hour: number, minute: number) => new Date(2026, 10, 9, hour, minute).getTime();
const text = (state: StateOfRead, context: Parameters<typeof tellTheRead>[1]) => setTheRead(doc, tellTheRead(state, context)).map(({ textContent }: Fake) => textContent);
const RAIL = { colonnes: ["On the rail"] };

describe("une lecture périmée dessine le rail et dit son âge", () => {
  test("lue il y a 4 minutes : « read 4 min ago », et aucune ligne d'erreur ne prend la place du rail", () => {
    const saidOne = tellTheRead({ reading: RAIL, readAt: a(9, 41), stale: true, refusal: { kind: "other" } }, { maintenant: a(9, 45), panneauVisible: false });
    assert.equal(saidOne.sorte, "rail");
    const lines = setTheRead(doc, saidOne) as Fake[];
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.balise, "p");
    assert.match(lines[0]?.textContent ?? "", /read 4 min ago/);
    assert.doesNotMatch(lines[0]?.textContent ?? "", /not drawn/);
  });

  test("une lecture fraîche ne pose rien", () => {
    assert.deepEqual(text({ reading: RAIL, readAt: a(9, 45), stale: false, refusal: null }, { maintenant: a(9, 45), panneauVisible: true }), []);
  });
});

describe("un refus par limite de débit se dit en clair", () => {
  test("reprise à 9:50, lecture de 9:41 : la phrase nomme les deux heures", () => {
    const [line] = text({ reading: RAIL, readAt: a(9, 41), stale: true, refusal: { kind: "rate-limit", resetAt: a(9, 50) } }, { maintenant: a(9, 45), panneauVisible: false });
    assert.match(line ?? "", /GitHub limits this account's requests until 9:50/);
    assert.match(line ?? "", /the rail shows the 9:41 reading/);
    assert.match(line ?? "", /read 4 min ago/);
  });
});

describe("aucun renvoi vers un panneau qui n'est pas à l'écran", () => {
  const reason = "API rate limit exceeded";
  const theCase: [string, StateOfRead][] = [
    ["périmée", { reading: RAIL, readAt: a(9, 41), stale: true, refusal: { kind: "other" } }],
    ["limitée", { reading: RAIL, readAt: a(9, 41), stale: true, refusal: { kind: "rate-limit", resetAt: a(9, 50) } }],
    ["sans lecture", { reading: null, readAt: null, stale: false, refusal: { kind: "other" } }],
  ];
  for (const [name, state] of theCase) {
    test(`${name}, panneau absent : ni « on the right », ni « panel », ni le détail`, () => {
      const said = text(state, { maintenant: a(9, 45), essaiA: a(9, 45), titre: "NOT READ FROM GITHUB", pourquoi: reason, panneauVisible: false }).join("\n");
      assert.doesNotMatch(said, /on the right|panel/i);
      assert.doesNotMatch(said, new RegExp(reason));
    });
    test(`${name}, panneau à l'écran : le détail est dit, sans renvoi`, () => {
      const said = setTheRead(doc, tellTheRead(state, { maintenant: a(9, 45), essaiA: a(9, 45), titre: "NOT READ FROM GITHUB", pourquoi: reason, panneauVisible: true })).map((l: Fake) => `${l.textContent} ${l.title ?? ""}`).join("\n");
      assert.match(said, new RegExp(reason));
      assert.doesNotMatch(said, /on the right|panel/i);
    });
  }
});

describe("un refus sans aucune lecture", () => {
  test("une ligne d'erreur simple, titre et heure de l'essai, sans renvoi", () => {
    const lines = setTheRead(doc, tellTheRead({ reading: null, readAt: null, stale: false, refusal: { kind: "other" } }, { maintenant: a(9, 45), essaiA: a(9, 45), titre: "NOT READ FROM GITHUB", panneauVisible: false })) as Fake[];
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.textContent, "the rail is not drawn: NOT READ FROM GITHUB — tried at 9:45");
  });

  test("une limite de débit sans lecture se dit aussi en clair", () => {
    const [line] = text({ reading: null, readAt: null, stale: false, refusal: { kind: "rate-limit", resetAt: a(9, 50) } }, { maintenant: a(9, 45), essaiA: a(9, 45), panneauVisible: false });
    assert.match(line ?? "", /until 9:50/);
  });
});
