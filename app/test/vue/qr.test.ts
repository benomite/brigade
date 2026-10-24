// Le QR que la vue dessine elle-même (#1598) : rien ne part le dessiner ailleurs. Il est vérifié contre ce que la
// norme fixe (ISO/IEC 18004) — les codewords de correction d'un exemple connu, les bits de format et de version, les
// blocs de chaque version —, puis sur sa matrice : sa taille, ses repères, son rythme et son module sombre.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alignementsDe, bitsDeFormat, bitsDeVersion, blocsDe, codewordsDeDonnees, correctionDe, imageDuQr, matriceDuQr, modulesDeDonnees, VERSION_MAX, versionPour } from "../../src/vue/qr.js";

describe("ce que la norme fixe", () => {
  test("« HELLO WORLD » en version 1-M : ses dix codewords de correction sont ceux de l'exemple de référence", () => {
    const donnees = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    assert.deepEqual(correctionDe(donnees, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  test("les bits de format du niveau M, masque par masque", () => {
    const attendus = ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
    assert.deepEqual(
      attendus.map((_, masque) => bitsDeFormat(masque).toString(2).padStart(15, "0")),
      attendus,
    );
  });

  test("les bits de version, à partir de la septième", () => {
    assert.equal(bitsDeVersion(7).toString(2).padStart(18, "0"), "000111110010010100");
    assert.equal(bitsDeVersion(10).toString(2).padStart(18, "0"), "001010010011010011");
  });

  test("chaque version porte autant de codewords que ses modules de données en tiennent", () => {
    for (let version = 1; version <= VERSION_MAX; version++) {
      const { correction, premiers, seconds, donnees } = blocsDe(version);
      assert.equal(donnees + correction * (premiers + seconds), Math.floor(modulesDeDonnees(version) / 8), `version ${version}`);
    }
  });

  test("les centres des alignements", () => {
    assert.deepEqual(alignementsDe(1), []);
    assert.deepEqual(alignementsDe(2), [6, 18]);
    assert.deepEqual(alignementsDe(7), [6, 22, 38]);
    assert.deepEqual(alignementsDe(20), [6, 34, 62, 90]);
  });

  test("les données : le mode octets, la longueur, les octets, puis le remplissage alterné", () => {
    const codewords = codewordsDeDonnees([0x61, 0x62], 1);
    assert.equal(codewords.length, 16);
    assert.deepEqual(codewords.slice(0, 4), [0x40, 0x26, 0x16, 0x20]);
    assert.deepEqual(codewords.slice(4, 8), [0xec, 0x11, 0xec, 0x11]);
  });
});

describe("la matrice", () => {
  const QR = "brigade://pair?code=7KQ2-M9XD&url=https%3A%2F%2Fbox.tail1234.ts.net";

  test("un QR d'appairage tient en version 5 : 37 × 37 modules", () => {
    assert.equal(versionPour(new TextEncoder().encode(QR).length), 5);
    const matrice = matriceDuQr(QR);
    assert.equal(matrice.length, 37);
    assert.ok(matrice.every((ligne) => ligne.length === 37));
  });

  test("ses trois repères, son rythme et son module sombre sont à leur place", () => {
    const m = matriceDuQr(QR);
    const n = m.length;
    const repere = ["1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"];
    for (const [x0, y0] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ])
      assert.deepEqual(
        repere.map((_, dy) => m[(y0 as number) + dy]?.slice(x0, (x0 as number) + 7).map((sombre) => (sombre ? "1" : "0")).join("")),
        repere,
      );
    for (let i = 8; i < n - 8; i++) {
      assert.equal(m[6]?.[i], i % 2 === 0);
      assert.equal(m[i]?.[6], i % 2 === 0);
    }
    assert.equal(m[n - 8]?.[8], true);
  });

  test("le même texte donne le même QR ; un autre texte, un autre", () => {
    assert.deepEqual(matriceDuQr(QR), matriceDuQr(QR));
    assert.notDeepEqual(matriceDuQr(QR), matriceDuQr(QR.replace("7KQ2", "H3PW")));
  });

  test("l'image est un SVG en adresse data:, sa marge de quatre modules autour, sans aucune couleur écrite", () => {
    const { src, cote } = imageDuQr(QR);
    assert.equal(cote, 45);
    const svg = decodeURIComponent(src.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 45 45"/);
    assert.doesNotMatch(svg, /fill|#[0-9a-f]{3}/i);
  });

  test("un texte trop long pour la vingtième version est refusé, pas tronqué", () => {
    assert.throws(() => matriceDuQr("x".repeat(700)), RangeError);
  });
});
