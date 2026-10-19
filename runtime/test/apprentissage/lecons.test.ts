import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { carnetVide, ecrireCarnet, type Entree, LeconInconnue, lireCarnet, memeTicket, proposer, reconfirmer } from "../../src/apprentissage/lecons.ts";
import { appliquerSortie, consignesDeRetro, lireSortie, RetroInvalide } from "../../src/apprentissage/retro.ts";
import { repertoireTemporaire } from "../outils.ts";

const o = (retro: string, ticket: number) => ({ retro, ticket });

describe("ids des leçons", () => {
  test("l'id d'une leçon ne change pas quand elle est reconfirmée", () => {
    const { carnet, id } = proposer(carnetVide(), "lire le CLAUDE.md d'abord", o("retro-1", 10));
    const apres = reconfirmer(carnet, id, o("retro-2", 11));
    assert.equal(apres.lecons.length, 1);
    assert.equal(apres.lecons[0]!.id, id);
    assert.equal(apres.lecons[0]!.texte, "lire le CLAUDE.md d'abord");
    assert.equal(apres.lecons[0]!.entrees.length, 2);
  });

  test("deux leçons ont deux ids, et un id n'est jamais réutilisé", () => {
    const a = proposer(carnetVide(), "a", o("r1", 1));
    const b = proposer(a.carnet, "b", o("r1", 1));
    assert.notEqual(a.id, b.id);
    const sans = { ...b.carnet, lecons: b.carnet.lecons.slice(0, 1) };
    assert.notEqual(proposer(sans, "c", o("r2", 2)).id, b.id);
  });

  test("le carnet relu garde ses ids", (t) => {
    const f = join(repertoireTemporaire(t), "lecons.json");
    const { carnet, id } = proposer(carnetVide(), "a", o("r1", 1));
    ecrireCarnet(f, carnet);
    assert.equal(lireCarnet(f).lecons[0]!.id, id);
    assert.deepEqual(lireCarnet(join(f, "..", "absent.json")), carnetVide());
  });

  test("la rétro voit les leçons provisoires et promues avec leur id", () => {
    let c = proposer(carnetVide(), "provisoire un", o("r1", 1)).carnet;
    c = proposer(c, "promue deux", o("r1", 1)).carnet;
    c = { ...c, lecons: c.lecons.map((l) => (l.texte === "promue deux" ? { ...l, statut: "promue" as const } : l)) };
    const vue = consignesDeRetro(c);
    assert.match(vue, /- L1 \[provisoire\] provisoire un/);
    assert.match(vue, /- L2 \[promue\] promue deux/);
  });
});

describe("sortie d'une rétro", () => {
  const base = proposer(carnetVide(), "lire le CLAUDE.md d'abord", o("r0", 5)).carnet;

  test("reconfirm <id> et propose <leçon> sont lus", () => {
    const s = lireSortie("reconfirm L1\n\npropose lancer les gates avant de commiter\n", base);
    assert.deepEqual(s, [{ genre: "reconfirm", id: "L1" }, { genre: "propose", texte: "lancer les gates avant de commiter" }]);
    const apres = appliquerSortie(base, s, o("r1", 6));
    assert.equal(apres.lecons.length, 2);
    assert.equal(apres.lecons[0]!.entrees[1]!.genre, "reconfirme");
    assert.equal(apres.lecons[1]!.id, "L2");
    assert.equal(apres.lecons[1]!.entrees[0]!.genre, "propose");
  });

  test("un id inconnu est refusé, clairement", () => {
    assert.throws(() => lireSortie("reconfirm L9", base), (e) => e instanceof RetroInvalide && /« L9 »/.test(e.message));
    assert.throws(() => reconfirmer(base, "L9", o("r1", 6)), LeconInconnue);
  });

  test("une ligne illisible est refusée", () => {
    assert.throws(() => lireSortie("bof", base), RetroInvalide);
  });
});

describe("entrées", () => {
  test("chaque entrée porte la rétro et le ticket ; deux du même ticket se distinguent de celles d'un autre", () => {
    let c = proposer(carnetVide(), "a", o("r1", 7)).carnet;
    c = reconfirmer(c, "L1", o("r2", 7));
    c = reconfirmer(c, "L1", o("r3", 8));
    const [a, b, d] = c.lecons[0]!.entrees as [Entree, Entree, Entree];
    assert.deepEqual([a.retro, a.ticket], ["r1", 7]);
    assert.ok(memeTicket(a, b));
    assert.ok(!memeTicket(a, d));
    assert.notEqual(a.retro, b.retro);
  });

  test("une entrée sans retro ou sans ticket est refusée", () => {
    assert.throws(() => proposer(carnetVide(), "a", o("", 1)));
    assert.throws(() => proposer(carnetVide(), "a", o("r", 0)));
  });
});
