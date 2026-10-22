// Un renvoi devenu leçon : la raison mise d'une ligne, les leçons qu'un renvoi
// écrit au journal, et leur place parmi celles des rétros — mêmes ids, même
// chemin, même horloge de tickets servis.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "../support/posix.ts";
import type { EntreeRetenue } from "../../src/apprentissage/evenements.ts";
import { candidatesDuProjet, carnetDuProjet, leconsProvisoires, retrosDuProjet } from "../../src/apprentissage/provisoires.ts";
import { leconDeLaRaison, leconsDuRenvoi, noterLeRenvoi } from "../../src/apprentissage/renvoi.ts";
import { LECON_MAX_CARACTERES } from "../../src/apprentissage/retro.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { histoireDesRetros } from "../../src/peremption/peremption.ts";
import { changementDuCarnet } from "../../src/promotion/changement.ts";
import { lireSeuils } from "../../src/seuils/seuils.ts";
import { repertoireTemporaire } from "../outils.ts";

const P = "boutique";

function cuisine(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  t.after(() => journal.fermer());
  const servir = (ticket: number, ...kept: EntreeRetenue[]) =>
    journal.ajouter({ project: P, ticket, type: "retro.recorded", author: "pass", payload: { run: null, text: null, kept, dropped: [] } });
  const renvoyer = (ticket: number, raisons: string[], origine: "pass-send-back" | "chef-correction" = "pass-send-back", projet = P) =>
    journal.base.transaction(() => noterLeRenvoi(journal, { projet, ticket, auteur: origine === "pass-send-back" ? "pass" : "chef", origine, raisons }));
  return { journal, servir, renvoyer };
}

describe("la raison, mise en leçon", () => {
  test("d'une ligne, ses blancs resserrés, sans la fin de sortie des gates ni son bloc de code", () => {
    const gates = ["Gates rouges : `.claude/brigade/gates.sh` est sorti en 1.", "FAIL  tests du projet en échec", "Fin de sortie :", "```", "ok    JSON valide", "gates : ROUGE", "```"].join("\n");
    assert.equal(leconDeLaRaison(gates), "Gates rouges : `.claude/brigade/gates.sh` est sorti en 1. FAIL tests du projet en échec");
    assert.equal(leconDeLaRaison("  Relecture — constat bloquant :\n\tle cas d'erreur est avalé.  "), "Relecture — constat bloquant : le cas d'erreur est avalé.");
    assert.equal(leconDeLaRaison(" \n "), null);
    assert.equal(leconDeLaRaison("```\nrien que du code\n```"), null);
  });

  test("trop longue, elle est coupée au dernier mot qui tient, et le dit", () => {
    const lecon = leconDeLaRaison("mot ".repeat(200)) ?? "";
    assert.ok(lecon.length <= LECON_MAX_CARACTERES, `${lecon.length} caractères`);
    assert.match(lecon, /^(mot )+mot…$/);
    const juste = "a".repeat(LECON_MAX_CARACTERES);
    assert.equal(leconDeLaRaison(juste), juste);
  });

  test("un renvoi laisse une leçon par raison, dans l'ordre, sans doublon ni raison vide, au plus trois", () => {
    assert.deepEqual(leconsDuRenvoi(["Un.", "  ", "Un.", "Deux.", "Trois.", "Quatre."]), ["Un.", "Deux.", "Trois."]);
    assert.deepEqual(leconsDuRenvoi([]), []);
  });
});

describe("les leçons candidates, par le chemin des rétros", () => {
  test("un renvoi sans raison n'écrit rien au journal, et le carnet reste vide", (t) => {
    const { journal, renvoyer } = cuisine(t);
    const avant = journal.tout().length;
    assert.equal(renvoyer(7, []), 0);
    assert.equal(renvoyer(7, ["", "  \n"], "chef-correction"), 0);
    assert.equal(journal.tout().length, avant);
    assert.deepEqual(carnetDuProjet(journal.base, P).lecons, []);
  });

  test("candidates et rétros font naître leurs leçons dans l'ordre du journal, chacune avec son origine ; une rétro reconfirme une candidate par son id", (t) => {
    const { journal, servir, renvoyer } = cuisine(t);
    servir(101, { kind: "propose", text: "Lire le CLAUDE.md." });
    renvoyer(102, ["Le test ne prouve rien."]);
    renvoyer(103, ["Une migration se rejoue."], "chef-correction");
    // Un autre projet, dans la même base : jamais le sien.
    renvoyer(102, ["Ailleurs."], "pass-send-back", "autre");
    servir(102, { kind: "reconfirm", id: "L2" }, { kind: "propose", text: "Commiter avant de s'arrêter." });

    const lecons = carnetDuProjet(journal.base, P).lecons;
    assert.deepEqual(
      lecons.map((l) => [l.id, l.texte, l.origin, l.entrees.map((e) => [e.genre, e.ticket])]),
      [
        ["L1", "Lire le CLAUDE.md.", { kind: "retro" }, [["propose", 101]]],
        ["L2", "Le test ne prouve rien.", { kind: "pass-send-back", ticket: 102 }, [["propose", 102], ["reconfirme", 102]]],
        ["L3", "Une migration se rejoue.", { kind: "chef-correction", ticket: 103 }, [["propose", 103]]],
        ["L4", "Commiter avant de s'arrêter.", { kind: "retro" }, [["propose", 102]]],
      ],
    );
    // Une leçon née d'une rétro l'est exactement comme avant : sa référence, son origine.
    assert.deepEqual(lecons[0], { id: "L1", texte: "Lire le CLAUDE.md.", statut: "provisoire", entrees: [{ genre: "propose", retro: retrosDuProjet(journal.base, P)[0]!.ref, ticket: 101 }], origin: { kind: "retro" } });
    // Les références des candidates disent leur origine et leur fait.
    assert.deepEqual(candidatesDuProjet(journal.base, P).map((c) => [c.ref.replace(/\d+$/, "N"), c.ticket]), [["pass-send-back-N", 102], ["chef-correction-N", 103]]);
    // Provisoires, datées de leur renvoi, avec le ticket renvoyé.
    assert.deepEqual(leconsProvisoires(journal.base, P).map((l) => [l.id, l.ticket, l.at !== ""]), [["L1", 101, true], ["L2", 102, true], ["L3", 103, true], ["L4", 102, true]]);
  });

  test("une candidate qui dit mot pour mot ce que dit déjà une leçon la reconfirme, sans en faire naître une autre", (t) => {
    const { journal, servir, renvoyer } = cuisine(t);
    servir(101, { kind: "propose", text: "Couvrir le cas d'erreur." });
    renvoyer(102, ["Couvrir   le cas\nd'erreur."]);
    const [lecon, ...autres] = carnetDuProjet(journal.base, P).lecons;
    assert.deepEqual(autres, []);
    assert.deepEqual([lecon?.origin, lecon?.entrees.map((e) => [e.genre, e.ticket])], [{ kind: "retro" }, [["propose", 101], ["reconfirme", 102]]]);
  });
});

describe("l'horloge des tickets servis", () => {
  test("une candidate compte au rang du ticket servi suivant ; tant qu'aucun ne l'a été, elle n'est pas comptée", (t) => {
    const { journal, servir, renvoyer } = cuisine(t);
    servir(101);
    renvoyer(102, ["Le test ne prouve rien."]);
    const avant = histoireDesRetros(retrosDuProjet(journal.base, P), candidatesDuProjet(journal.base, P));
    assert.deepEqual(avant.map((l) => [l.id, l.origin, l.citations]), [["L1", { kind: "pass-send-back", ticket: 102 }, []]]);

    servir(102);
    const apres = histoireDesRetros(retrosDuProjet(journal.base, P), candidatesDuProjet(journal.base, P));
    assert.deepEqual(apres[0]?.citations.map((c) => [c.genre, c.ticket, c.servi]), [["propose", 102, 2]]);
    // Les tickets servis restent ceux des rétros : une candidate n'en est pas un.
    assert.equal(retrosDuProjet(journal.base, P).length, 2);
  });

  test("une candidate promue entre au carnet avec son origine, et la PR dit qu'elle vient d'un renvoi", (t) => {
    const { journal, servir, renvoyer } = cuisine(t);
    renvoyer(101, ["Le test ne prouve rien."]);
    servir(101);
    servir(102, { kind: "reconfirm", id: "L1" });
    servir(103, { kind: "reconfirm", id: "L1" });

    const retros = retrosDuProjet(journal.base, P);
    const candidates = candidatesDuProjet(journal.base, P);
    const entree = { carnet: { lessons: [] }, retros, seuils: lireSeuils({}), aujourdhui: "2026-10-21", fusionnees: [] };
    // Sans ses candidates, l'histoire ne connaît pas la leçon qu'elles ont fait naître.
    assert.equal(changementDuCarnet(entree), null);
    const changement = changementDuCarnet({ ...entree, candidates });
    assert.deepEqual(changement?.decisions, [{ kind: "promote", lesson: "L1", retros: [candidates[0]!.ref, retros[1]!.ref, retros[2]!.ref].sort() }]);
    assert.deepEqual(changement?.carnet.lessons.map((l) => [l.id, l.text, l.origin]), [["L1", "Le test ne prouve rien.", { kind: "pass-send-back", ticket: 101 }]]);
    assert.match(changement?.texte ?? "", /## L1\n- état: promoted\n- texte: Le test ne prouve rien\.\n- entrée: \d{4}-\d{2}-\d{2}\n- rétros: [^\n]+\n- origine: pass-send-back #101\n/);
    assert.match(changement?.corps ?? "", new RegExp(`- \`${candidates[0]!.ref}\` \\(renvoi de la pass\\) — ticket #101, qui l'a proposée`));
  });
});
