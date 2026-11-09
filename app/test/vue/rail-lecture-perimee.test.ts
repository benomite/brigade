// Le rail d'une lecture périmée, d'un refus de GitHub et d'une lecture absente (#3008) : l'état de lecture
// `{ reading, readAt, stale, refusal }`, joué avec des fixtures devant un faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { direLaLecture, poserLaLecture, type EtatDeLecture } from "../../src/vue/rail-lecture-perimee.js";
import { Faux } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const a = (heure: number, minute: number) => new Date(2026, 10, 9, heure, minute).getTime();
const texte = (etat: EtatDeLecture, contexte: Parameters<typeof direLaLecture>[1]) => poserLaLecture(doc, direLaLecture(etat, contexte)).map(({ textContent }: Faux) => textContent);
const RAIL = { colonnes: ["On the rail"] };

describe("une lecture périmée dessine le rail et dit son âge", () => {
  test("lue il y a 4 minutes : « read 4 min ago », et aucune ligne d'erreur ne prend la place du rail", () => {
    const dite = direLaLecture({ reading: RAIL, readAt: a(9, 41), stale: true, refusal: { kind: "other" } }, { maintenant: a(9, 45), panneauVisible: false });
    assert.equal(dite.sorte, "rail");
    const lignes = poserLaLecture(doc, dite) as Faux[];
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0]?.balise, "p");
    assert.match(lignes[0]?.textContent ?? "", /read 4 min ago/);
    assert.doesNotMatch(lignes[0]?.textContent ?? "", /not drawn/);
  });

  test("une lecture fraîche ne pose rien", () => {
    assert.deepEqual(texte({ reading: RAIL, readAt: a(9, 45), stale: false, refusal: null }, { maintenant: a(9, 45), panneauVisible: true }), []);
  });
});

describe("un refus par limite de débit se dit en clair", () => {
  test("reprise à 9:50, lecture de 9:41 : la phrase nomme les deux heures", () => {
    const [ligne] = texte({ reading: RAIL, readAt: a(9, 41), stale: true, refusal: { kind: "rate-limit", resetAt: a(9, 50) } }, { maintenant: a(9, 45), panneauVisible: false });
    assert.match(ligne ?? "", /GitHub limits this account's requests until 9:50/);
    assert.match(ligne ?? "", /the rail shows the 9:41 reading/);
    assert.match(ligne ?? "", /read 4 min ago/);
  });
});

describe("aucun renvoi vers un panneau qui n'est pas à l'écran", () => {
  const raison = "API rate limit exceeded";
  const cas: [string, EtatDeLecture][] = [
    ["périmée", { reading: RAIL, readAt: a(9, 41), stale: true, refusal: { kind: "other" } }],
    ["limitée", { reading: RAIL, readAt: a(9, 41), stale: true, refusal: { kind: "rate-limit", resetAt: a(9, 50) } }],
    ["sans lecture", { reading: null, readAt: null, stale: false, refusal: { kind: "other" } }],
  ];
  for (const [nom, etat] of cas) {
    test(`${nom}, panneau absent : ni « on the right », ni « panel », ni le détail`, () => {
      const dit = texte(etat, { maintenant: a(9, 45), essaiA: a(9, 45), titre: "NOT READ FROM GITHUB", pourquoi: raison, panneauVisible: false }).join("\n");
      assert.doesNotMatch(dit, /on the right|panel/i);
      assert.doesNotMatch(dit, new RegExp(raison));
    });
    test(`${nom}, panneau à l'écran : le détail est dit, sans renvoi`, () => {
      const dit = poserLaLecture(doc, direLaLecture(etat, { maintenant: a(9, 45), essaiA: a(9, 45), titre: "NOT READ FROM GITHUB", pourquoi: raison, panneauVisible: true })).map((l: Faux) => `${l.textContent} ${l.title ?? ""}`).join("\n");
      assert.match(dit, new RegExp(raison));
      assert.doesNotMatch(dit, /on the right|panel/i);
    });
  }
});

describe("un refus sans aucune lecture", () => {
  test("une ligne d'erreur simple, titre et heure de l'essai, sans renvoi", () => {
    const lignes = poserLaLecture(doc, direLaLecture({ reading: null, readAt: null, stale: false, refusal: { kind: "other" } }, { maintenant: a(9, 45), essaiA: a(9, 45), titre: "NOT READ FROM GITHUB", panneauVisible: false })) as Faux[];
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0]?.textContent, "the rail is not drawn: NOT READ FROM GITHUB — tried at 9:45");
  });

  test("une limite de débit sans lecture se dit aussi en clair", () => {
    const [ligne] = texte({ reading: null, readAt: null, stale: false, refusal: { kind: "rate-limit", resetAt: a(9, 50) } }, { maintenant: a(9, 45), essaiA: a(9, 45), panneauVisible: false });
    assert.match(ligne ?? "", /until 9:50/);
  });
});
