// Le tampon qui masque ce qu'un process dit avant de l'écrire : ligne à
// ligne, et borné. Les morceaux sont donnés à la main — le découpage d'un
// vrai tube ne se commande pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { JETON_MASQUE, masquerIdentifiants } from "../src/identifiants.ts";
import { lignesMasquees } from "../src/lignes-masquees.ts";

// Fabriqué, et assemblé ici : la forme n'est écrite en clair nulle part.
const JETON = ["sk", "ant", "oat01", "aB3_".repeat(24)].join("-");

function tampon(borne?: number) {
  const ecrits: string[] = [];
  let masques = 0;
  const lignes = lignesMasquees(
    (texte) => {
      const lu = masquerIdentifiants(texte);
      masques += lu.masques;
      return lu.texte;
    },
    (texte) => ecrits.push(texte),
    borne,
  );
  return { ...lignes, ecrits, masques: () => masques };
}

// Le texte, livré par morceaux de `pas` octets.
function livrer(texte: string, pas: number, borne: number) {
  const { recevoir, vider, ecrits, masques } = tampon(borne);
  const octets = Buffer.from(texte);
  for (let i = 0; i < octets.length; i += pas) recevoir(octets.subarray(i, i + pas));
  vider();
  return { ecrit: ecrits.join(""), masques: masques() };
}

describe("lignesMasquees", () => {
  test("une ligne n'est écrite qu'entière, et ce qui attend encore l'est quand plus rien ne viendra", () => {
    const { recevoir, vider, ecrits } = tampon();

    recevoir(Buffer.from("un début"));
    assert.deepEqual(ecrits, []);
    recevoir(Buffer.from(" et sa fin\nla suite"));
    assert.deepEqual(ecrits, ["un début et sa fin\n"]);
    vider();
    assert.deepEqual(ecrits, ["un début et sa fin\n", "la suite"]);
    // Rien n'attend plus : vider deux fois n'écrit rien de plus.
    vider();
    assert.equal(ecrits.length, 2);
  });

  test("une sortie sans saut de ligne n'attend pas sans borne : au-delà, elle est écrite telle quelle", () => {
    const { recevoir, ecrits } = tampon(100);
    const progression = "téléchargement 42 %\r";

    for (let i = 0; i < 50; i++) recevoir(Buffer.from(progression));

    // Rien n'est fini, et presque tout est écrit : seul attend ce qui ne
    // remplit pas la borne.
    const ecrit = ecrits.join("");
    assert.ok(progression.repeat(50).startsWith(ecrit));
    assert.ok(Buffer.byteLength(progression.repeat(50)) - Buffer.byteLength(ecrit) < 100 + Buffer.byteLength(progression));
  });

  // Quel que soit l'endroit où le tube coupe et où la borne tombe, ce qui est
  // écrit est ce qu'un masquage du texte entier aurait donné.
  const TEXTES: Record<string, string> = {
    "un jeton entre des mots": `${"mot ".repeat(60)}le jeton est ${JETON} et la suite ${"mot ".repeat(60)}`,
    "un jeton collé à ce qui le précède": `${"\r".repeat(90)}cle=${JETON}\r${"\r".repeat(90)}`,
    "un jeton au milieu d'une suite sans fin de ses propres caractères": `${"a".repeat(300)}${JETON}${"b".repeat(300)}`,
    "deux jetons dans une suite sans fin": `${"x".repeat(150)}.${JETON}${"y".repeat(170)}.${"z".repeat(70)}${JETON}`,
    "des caractères de plusieurs octets, sans aucun jeton": "é€😀".repeat(80),
    "des lignes ordinaires, dont une porte un jeton": `une ligne\n${"longue ".repeat(40)}${JETON}\nune autre`,
  };
  for (const [cas, texte] of Object.entries(TEXTES)) {
    test(`borné, ${cas} : rien d'un jeton n'est écrit en clair, coupé en deux ou non`, () => {
      const attendu = masquerIdentifiants(texte);
      for (const borne of [70, 100, 257]) {
        for (const pas of [1, 3, 7, 50, 64, 101, 1000]) {
          const { ecrit, masques } = livrer(texte, pas, borne);
          assert.equal(ecrit, attendu.texte, `borne ${borne}, morceaux de ${pas}`);
          assert.equal(masques, attendu.masques, `borne ${borne}, morceaux de ${pas}`);
        }
      }
      assert.equal(attendu.texte.includes(JETON_MASQUE), texte.includes(JETON));
    });
  }
});
