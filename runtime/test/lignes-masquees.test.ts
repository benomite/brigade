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

  // Un jeton dont le corps porte lui-même un début de jeton : la coupe ne
  // tombe pas sur ce second début tant que le premier peut encore être reconnu.
  test("borné, un jeton dont le corps porte un début de jeton, dans une suite sans fin : rien n'en est écrit en clair", () => {
    const debut = ["sk", "ant", "oat01", "abcde"].join("-");
    for (const avant of [0, 1, 20, 119, 120, 121, 125, 130, 137, 140, 300]) {
      const texte = `${"a".repeat(avant)}${debut}${["sk", "ant", ""].join("-")}${"B".repeat(400)}`;
      const attendu = masquerIdentifiants(texte);
      assert.equal(attendu.masques, 1);
      for (const borne of [70, 200, 257]) {
        for (const pas of [1, 7, 64, 1000]) {
          assert.deepEqual(livrer(texte, pas, borne), { ecrit: attendu.texte, masques: 1 }, `${avant} avant, borne ${borne}, morceaux de ${pas}`);
        }
      }
    }
  });

  // Tiré au hasard, graine fixée : des textes faits de ce qui trompe la coupe
  // — débuts de jeton, en-têtes, corps trop courts ou assez longs, collés les
  // uns aux autres ou séparés —, livrés par morceaux inégaux. Seule la forme
  // `sk-ant-…` est tirée : la structure du fichier du compte se reconnaît sur
  // une ligne, et ne tient pas cette équivalence.
  test("borné, quel que soit le texte, le découpage et la borne : ce qui est écrit et compté est ce que le masquage du texte entier donne", () => {
    let graine = 237;
    // mulberry32
    const hasard = () => {
      graine = (graine + 0x6d2b79f5) | 0;
      let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const entier = (max: number) => Math.floor(hasard() * max);
    const parmi = <T>(choix: readonly T[]): T => choix[entier(choix.length)] as T;
    const corps = (longueur: number) => Array.from({ length: longueur }, () => parmi([..."abBZ09_-sk"])).join("");
    const prefixe = ["sk", "ant", ""].join("-");
    const morceaux: (() => string)[] = [
      () => prefixe,
      () => prefixe.slice(0, 1 + entier(prefixe.length)),
      () => `${prefixe}${parmi(["oat01", "ort01", "api03", "abcdefgh12", "a01", "oat1", "abcdefghi01"])}-`,
      () => `${prefixe}oat01`.slice(0, prefixe.length + entier(6)),
      () => corps(entier(12)),
      () => corps(30 + entier(20)),
      () => corps(entier(300)),
      () => parmi([".", " ", "\r", "é", "€", "😀"]),
      () => "\n",
    ];
    // Les séparateurs sont rares : c'est dans les longues suites que la coupe se joue.
    const tirer = () => (hasard() < 0.06 ? parmi(morceaux.slice(7)) : parmi(morceaux.slice(0, 7)))();
    let masques = 0;
    let coupesDansUneSuite = 0;
    for (let essai = 0; essai < 3000; essai++) {
      const texte = Array.from({ length: 1 + entier(25) }, tirer).join("");
      const attendu = masquerIdentifiants(texte);
      const borne = parmi([1, 20, 58, 70, 100, 200, 257, 1000]);
      const pasMax = parmi([1, 3, 7, 64, 300, 2000]);
      const { recevoir, vider, ecrits, masques: comptes } = tampon(borne);
      const octets = Buffer.from(texte);
      for (let i = 0; i < octets.length; ) {
        const pas = 1 + entier(pasMax);
        recevoir(octets.subarray(i, i + pas));
        i += pas;
      }
      vider();
      const ou = `essai ${essai}, borne ${borne}, morceaux d'au plus ${pasMax} : ${JSON.stringify(texte)}`;
      assert.equal(ecrits.join(""), attendu.texte, ou);
      assert.equal(comptes(), attendu.masques, ou);
      masques += attendu.masques;
      if (new RegExp(`[A-Za-z0-9_-]{${borne + 1}}`).test(texte)) coupesDansUneSuite++;
    }
    // Le tirage éprouve bien ce qu'il prétend : des jetons, et des suites plus
    // longues que leur borne.
    assert.ok(masques > 1000, `${masques} jetons tirés`);
    assert.ok(coupesDansUneSuite > 1000, `${coupesDansUneSuite} suites plus longues que la borne`);
  });
});
