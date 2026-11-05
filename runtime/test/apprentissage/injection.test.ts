// Les leçons qu'un cook reçoit à son lancement : les provisoires de son projet,
// jamais d'un autre, les plus récentes d'abord, au plus le plafond du projet
// (`apprentissage/injection.ts`), et le bloc que sa consigne en porte.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { blocDesLecons, LECONS_INJECTEES_PAR_DEFAUT, leconsAInjecter, lirePlafondDesLecons, VARIABLE_LECONS_INJECTEES } from "../../src/apprentissage/injection.ts";
import { writeCarnet } from "../../src/carnet/carnet.ts";
import { consigne, consigneDeSuite } from "../../src/claude.ts";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { ConfigInvalide } from "../../src/runtime.ts";
import { repertoireTemporaire } from "../outils.ts";

// La rétro du ticket `ticket` de `projet`, servi, laisse une leçon par texte.
function retro(journal: Journal, projet: string, ticket: number, ...textes: string[]) {
  journal.ajouter({ project: projet, ticket, author: "pass", type: "retro.recorded", payload: { run: null, text: null, kept: textes.map((text) => ({ kind: "propose" as const, text })), dropped: [] } });
}

// `combien` tickets servis du projet, une leçon chacun : « Leçon <n> de <projet>. ».
function garnir(journal: Journal, projet: string, combien: number) {
  for (let n = 1; n <= combien; n++) retro(journal, projet, n, `Leçon ${n} de ${projet}.`);
}

describe("les leçons qu'un cook reçoit", () => {
  test("les plus récentes du projet d'abord, au plus le plafond : vingt par défaut sur vingt-cinq, puis autant que le réglage", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    garnir(journal, "a", 25);

    const parDefaut = leconsAInjecter(journal.base, "a", { plafond: LECONS_INJECTEES_PAR_DEFAUT, carnet: null });
    assert.equal(parDefaut.length, 20);
    assert.deepEqual(parDefaut.map((l) => l.id), Array.from({ length: 20 }, (_, i) => `L${25 - i}`));
    assert.deepEqual(parDefaut[0], { id: "L25", texte: "Leçon 25 de a." });
    assert.deepEqual(leconsAInjecter(journal.base, "a", { plafond: 3, carnet: null }).map((l) => l.id), ["L25", "L24", "L23"]);
    assert.equal(leconsAInjecter(journal.base, "a", { plafond: 40, carnet: null }).length, 25);
    assert.deepEqual(leconsAInjecter(journal.base, "a", { plafond: 0, carnet: null }), []);
  });

  test("jamais une leçon d'un autre projet, même dans la même base et sous le même id", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    garnir(journal, "a", 2);
    garnir(journal, "b", 3);

    assert.deepEqual(leconsAInjecter(journal.base, "a", { plafond: 20, carnet: null }).map((l) => l.texte), ["Leçon 2 de a.", "Leçon 1 de a."]);
    assert.deepEqual(leconsAInjecter(journal.base, "b", { plafond: 20, carnet: null }).map((l) => l.texte), ["Leçon 3 de b.", "Leçon 2 de b.", "Leçon 1 de b."]);
    assert.deepEqual(leconsAInjecter(journal.base, "c", { plafond: 20, carnet: null }), []);
  });

  test("une leçon que le carnet du dépôt tient, promue ou sortie, n'est plus provisoire : elle n'est pas reçue ; un carnet illisible n'en retire aucune", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    garnir(journal, "a", 4);
    const carnet = writeCarnet({
      lessons: [
        { id: "L1", text: "Leçon 1 de a.", state: "promoted", entered: "2026-10-01", retros: ["retro-1"], origin: { kind: "retro" } },
        { id: "L3", text: "Leçon 3 de a.", state: "retired", entered: "2026-10-01", retros: ["retro-3"], origin: { kind: "retro" }, exit: { date: "2026-10-02", reason: "manual" } },
      ],
    });

    assert.deepEqual(leconsAInjecter(journal.base, "a", { plafond: 20, carnet }).map((l) => l.id), ["L4", "L2"]);
    // Le plafond compte ce qui est reçu, pas ce que le carnet retire.
    assert.deepEqual(leconsAInjecter(journal.base, "a", { plafond: 1, carnet }).map((l) => l.id), ["L4"]);
    assert.deepEqual(leconsAInjecter(journal.base, "a", { plafond: 20, carnet: "pas un carnet" }).map((l) => l.id), ["L4", "L3", "L2", "L1"]);
  });

  test("le plafond est un réglage du projet : vingt par défaut, zéro les coupe, une valeur illisible refuse le démarrage en nommant la variable", () => {
    assert.equal(lirePlafondDesLecons({}), 20);
    assert.equal(lirePlafondDesLecons({ [VARIABLE_LECONS_INJECTEES]: "" }), 20);
    assert.equal(lirePlafondDesLecons({ [VARIABLE_LECONS_INJECTEES]: "7" }), 7);
    assert.equal(lirePlafondDesLecons({ [VARIABLE_LECONS_INJECTEES]: "0" }), 0);
    for (const valeur of ["-1", "2.5", "vingt"]) {
      assert.throws(() => lirePlafondDesLecons({ [VARIABLE_LECONS_INJECTEES]: valeur }), (erreur: unknown) => erreur instanceof ConfigInvalide && erreur.message.includes(VARIABLE_LECONS_INJECTEES));
    }
  });

  test("chaque consigne de cook les porte, avec leur id ; sans leçon, elle reste ce qu'elle était", () => {
    const lecons = [{ id: "L2", texte: "Lancer les gates avant de commiter." }, { id: "L1", texte: "Lire le CLAUDE.md." }];
    const mission = { ticket: 7, titre: "t", depot: "o/r", base: "v2" };
    const consignes = [
      (l?: typeof lecons) => consigne({ ...mission, lecons: l }),
      (l?: typeof lecons) => consigneDeSuite({ ...mission, branche: "cook/7", lecons: l }),
    ];
    for (const ecrire of consignes) {
      const texte = ecrire(lecons);
      assert.ok(texte.includes("- L2 : Lancer les gates avant de commiter.\n- L1 : Lire le CLAUDE.md."));
      assert.ok(texte.indexOf("- L2") < texte.indexOf("- L1"));
      assert.equal(ecrire([]), ecrire());
      assert.doesNotMatch(ecrire(), /leçons provisoires/);
    }
    assert.deepEqual(blocDesLecons([]), []);
  });
});
