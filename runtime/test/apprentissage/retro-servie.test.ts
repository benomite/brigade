// La rétro d'un ticket servi : le cook la délimite dans son dernier message, la
// station la garde à son compte-rendu, et la pass l'écrit quand elle sert le
// ticket — au plus trois leçons, provisoires, rangées au projet du ticket.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { carnetVide, proposer } from "../../src/apprentissage/lecons.ts";
import { carnetDuProjet, enregistrerRetro, leconsProvisoires, retroDuTicket, retrosDuProjet } from "../../src/apprentissage/provisoires.ts";
import { CONSIGNE_DE_RETRO, extraireRetro, LECONS_MAX, phrases, trierRetro } from "../../src/apprentissage/retro.ts";
import { consigne, consigneDeSuite } from "../../src/claude.ts";
import { ouvrirJournal, type Journal } from "../../src/journal.ts";
import { consigneDeRenvoi, consigneDeReprise } from "../../src/pass.ts";
import { chef, cuisine, issue } from "../aides/cuisine.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

// Un cook a fini sur `ticket` de `projet`, et le ticket est servi.
function servi(journal: Journal, projet: string, ticket: number, retro: string | null) {
  const run = `run-${projet}-${ticket}`;
  journal.ajouter({
    project: projet,
    ticket,
    author: "station:box/claude",
    type: "cook.reported",
    payload: { run, ending: "done", reason: null, summary: "fait", deliverable: "fait", ...(retro === null ? {} : { retro }), branch: `cook/${ticket}`, pr: null },
  });
  return enregistrerRetro(journal, { projet, ticket, run, auteur: "pass" });
}

describe("la rétro du cook, dans son dernier message", () => {
  test("seule la dernière délimitation fermée compte ; une balise citée n'en est pas une", () => {
    assert.equal(extraireRetro("rien"), null);
    assert.equal(extraireRetro("ma rétro entre `<retro>` et `</retro>`"), null);
    assert.equal(extraireRetro("<retro>\n\n</retro>"), null);
    assert.equal(extraireRetro("<retro>propose a</retro>\n<retro>\npropose b\n</retro>"), "propose b");
    assert.equal(extraireRetro("<retro>propose a</retro>\n<retro>propose b"), "propose a");
  });

  test("chaque consigne de cook la demande, et ne délimite elle-même aucune rétro", () => {
    const mission = { ticket: 7, titre: "t", depot: "o/r", base: "v2" };
    const consignes = [
      consigne(mission),
      consigneDeSuite({ ...mission, branche: "cook/7" }),
      consigneDeRenvoi({ ...mission, branche: "cook/7", n: 1, findings: ["f"] }),
      consigneDeReprise({ base: "v2", branche: "cook/7", worktree: "/w", n: 1, findings: ["f"] }),
    ];
    for (const texte of consignes) {
      assert.ok(texte.includes(CONSIGNE_DE_RETRO));
      assert.equal(extraireRetro(texte), null);
    }
    assert.match(CONSIGNE_DE_RETRO, /Au plus 3 leçons, chacune en une ou deux phrases/);
  });

  test("les phrases se comptent à la ponctuation suivie d'un blanc, pas à un point dans un mot", () => {
    assert.equal(phrases("Lancer les gates."), 1);
    assert.equal(phrases("Lancer les gates. Puis commiter !"), 2);
    assert.equal(phrases("`pass.ts` se lit en v2.1 avant tout"), 1);
    assert.equal(phrases("Un. Deux ? Trois…"), 3);
  });

  test("au-delà de trois leçons, ou d'une leçon de plus de deux phrases, ce qui dépasse est écarté et dit", () => {
    const tri = trierRetro(
      ["propose Un.", "propose Deux. Encore deux.", "propose Trois. Trois. Trois.", "n'importe quoi", "propose Un.", "reconfirm L9", "- propose Quatre.", "propose Cinq."].join("\n"),
      carnetVide(),
    );
    assert.deepEqual(tri.kept, [
      { kind: "propose", text: "Un." },
      { kind: "propose", text: "Deux. Encore deux." },
      { kind: "propose", text: "Quatre." },
    ]);
    assert.deepEqual(tri.dropped, [
      { line: "propose Trois. Trois. Trois.", reason: "too-long" },
      { line: "n'importe quoi", reason: "unreadable" },
      { line: "propose Un.", reason: "duplicate" },
      { line: "reconfirm L9", reason: "unknown-id" },
      { line: "propose Cinq.", reason: "over-limit" },
    ]);
    assert.equal(trierRetro(`propose ${"a".repeat(401)}`, carnetVide()).dropped[0]?.reason, "too-long");
    // Une reconfirmation compte parmi les leçons de la rétro.
    const carnet = proposer(carnetVide(), "lire le CLAUDE.md", { retro: "r0", ticket: 1 }).carnet;
    assert.deepEqual(trierRetro("reconfirm L1\npropose a\npropose b\npropose c", carnet).kept.length, LECONS_MAX);
  });
});

describe("les leçons provisoires d'un projet", () => {
  test("une rétro de plus de trois leçons n'en laisse que trois au projet, chacune provisoire, avec son ticket, lisible aussitôt", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    const retro = servi(journal, "a", 12, "propose Un.\npropose Deux.\npropose Trois.\npropose Quatre.");

    assert.deepEqual(retro?.kept.length, 3);
    assert.deepEqual(retro?.dropped, [{ line: "propose Quatre.", reason: "over-limit" }]);
    const lecons = leconsProvisoires(journal.base, "a");
    assert.deepEqual(
      lecons.map((l) => [l.id, l.texte, l.statut, l.project, l.ticket]),
      [
        ["L1", "Un.", "provisoire", "a", 12],
        ["L2", "Deux.", "provisoire", "a", 12],
        ["L3", "Trois.", "provisoire", "a", 12],
      ],
    );
    assert.equal(lecons[0]?.entrees[0]?.retro, retro?.ref);
    assert.equal(lecons[0]?.at, retro?.at);
  });

  test("lire les leçons du projet A ne rend jamais une leçon écrite pour le projet B, même dans la même base", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    servi(journal, "a", 1, "propose Leçon de A.");
    servi(journal, "b", 1, "propose Leçon de B.");
    servi(journal, "b", 2, "propose Autre leçon de B.");
    // Un id de B, cité par une rétro de A, n'y est celui d'aucune leçon.
    const croisee = servi(journal, "a", 3, "reconfirm L2");

    assert.deepEqual(croisee?.dropped, [{ line: "reconfirm L2", reason: "unknown-id" }]);
    assert.deepEqual(leconsProvisoires(journal.base, "a").map((l) => [l.project, l.texte]), [["a", "Leçon de A."]]);
    assert.deepEqual(leconsProvisoires(journal.base, "b").map((l) => [l.project, l.texte]), [["b", "Leçon de B."], ["b", "Autre leçon de B."]]);
    assert.deepEqual(retrosDuProjet(journal.base, "a").map((r) => [r.project, r.ticket]), [["a", 1], ["a", 3]]);
    assert.equal(retroDuTicket(journal.base, "b", 3), null);
    assert.deepEqual(leconsProvisoires(journal.base, "c"), []);
  });

  test("une rétro qui reconfirme une leçon du projet par son id l'ajoute à son histoire, sans en faire une autre", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    servi(journal, "a", 1, "propose Lire le CLAUDE.md.");
    const seconde = servi(journal, "a", 2, "reconfirm L1");

    const [lecon] = carnetDuProjet(journal.base, "a").lecons;
    assert.deepEqual(seconde?.kept, [{ kind: "reconfirm", id: "L1" }]);
    assert.deepEqual(lecon?.entrees.map((e) => [e.genre, e.ticket]), [["propose", 1], ["reconfirme", 2]]);
    assert.equal(leconsProvisoires(journal.base, "a")[0]?.ticket, 1);
  });

  test("un cook qui n'a écrit aucune rétro laisse une rétro vide : le ticket servi a la sienne, sans leçon", (t) => {
    const journal = ouvrirJournal(repertoireTemporaire(t));
    t.after(() => journal.fermer());
    const retro = servi(journal, "a", 4, null);

    assert.deepEqual([retro?.text, retro?.kept, retro?.dropped], [null, [], []]);
    assert.deepEqual(leconsProvisoires(journal.base, "a"), []);
    // Le même service redit n'écrit pas une seconde rétro.
    assert.equal(enregistrerRetro(journal, { projet: "a", ticket: 4, run: "run-a-4", auteur: "pass" }), null);
    assert.equal(retrosDuProjet(journal.base, "a").length, 1);
  });
});

describe("le ticket servi par la pass", () => {
  test("sa rétro est écrite avec lui, au plus trois leçons, et ses leçons sont lisibles dès qu'il est servi", async (t) => {
    const { repertoire, journal, gh } = cuisine(t, { pass: true, issues: [issue(17)], scenario: "livre-et-retient" });
    chef(repertoire, "grant.activated");
    await jusqua(() => journal.duTicket(17).some((e) => e.type === "ticket.served"));

    const types = journal.duTicket(17).map((e) => e.type);
    // Écrite dans la transaction qui le sert, juste après.
    assert.equal(types[types.indexOf("ticket.served") + 1], "retro.recorded");
    const retro = retroDuTicket(journal.base, "brigade", 17);
    const run = journal.duTicket(17).findLast((e) => e.type === "cook.launched")?.payload as { run: string } | undefined;
    assert.equal(retro?.run, run?.run);
    assert.deepEqual(retro?.kept, [
      { kind: "propose", text: "Lire le CLAUDE.md avant d'écrire quoi que ce soit." },
      { kind: "propose", text: "Les gates jouent les tests du runtime. Les lancer avant de commiter évite un renvoi." },
      { kind: "propose", text: "Un test attend un fait, jamais une durée." },
    ]);
    assert.deepEqual(
      retro?.dropped.map((d) => d.reason),
      ["too-long", "over-limit"],
    );
    assert.deepEqual(
      leconsProvisoires(journal.base, "brigade").map((l) => [l.statut, l.ticket, l.project]),
      [
        ["provisoire", 17, "brigade"],
        ["provisoire", 17, "brigade"],
        ["provisoire", 17, "brigade"],
      ],
    );
    // La rétro n'est pas le livrable : le corps de la PR, qui le porte, n'en dit rien.
    assert.equal(gh.prs.length, 1);
    assert.match(gh.prs[0]?.corps ?? "", /J'ai ajouté `travail.txt`/);
    assert.doesNotMatch(gh.prs[0]?.corps ?? "", /propose/);
  });
});
