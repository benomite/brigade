import assert from "node:assert/strict";
import { test } from "node:test";
import { fiche, illisible, MARQUEUR, porteFiche } from "../src/fiche.ts";

const FICHE = [
  MARQUEUR,
  "**Fiche du ticket** — lue par le runtime, corrigeable à la main.",
  "- attend : #68, #69",
  "- zone : runtime/src/rail.ts, runtime/test/rail.test.ts",
].join("\n");

const lue = (...lignes: string[]) => fiche([[MARQUEUR, ...lignes].join("\n")]);

test("la fiche d'un ticket se lit dans le commentaire qui porte le marqueur", () => {
  assert.deepEqual(fiche(["Un commentaire quelconque.", FICHE, "Un autre."]), {
    waitsFor: [68, 69],
    zone: ["runtime/src/rail.ts", "runtime/test/rail.test.ts"],
    problems: [],
  });
});

test("une issue sans commentaire marqué n'a pas de fiche — ce n'est pas une fiche vide", () => {
  assert.equal(fiche([]), null);
  assert.equal(fiche(["- attend : #68", "- zone : runtime/"]), null);
  assert.deepEqual(lue("**Fiche du ticket**"), { waitsFor: [], zone: [], problems: [] });
});

test("une fiche retouchée à la main se lit encore : casse, gras, espaces, puces, retours Windows", () => {
  const attendue = { waitsFor: [68, 69], zone: ["runtime/src/rail.ts", "docs/"], problems: [] };
  assert.deepEqual(lue("* **Attend** : #68 #69", "* **Zone** : `runtime/src/rail.ts`, `docs/`"), attendue);
  assert.deepEqual(lue("attend: #68,#69", "zone:runtime/src/rail.ts ,docs/ ,"), attendue);
  assert.deepEqual(lue("- ATTEND : #68, #69, #68", "", "Une note du chef, sans effet.", "", "- zone : runtime/src/rail.ts, docs/, docs/"), attendue);
  assert.deepEqual(fiche([`  <!--brigade:FICHE-->  \r\n- **attend :** #68, #69\r\n- zone : runtime/src/rail.ts, docs/\r\n`]), attendue);
});

test("une valeur collée aux deux-points garde ses premiers caractères : étoile, tiret bas, accent grave", () => {
  assert.deepEqual(lue("zone:*.md")?.zone, ["*.md"]);
  assert.deepEqual(lue("- zone:_drafts/, *.md")?.zone, ["_drafts/", "*.md"]);
  assert.deepEqual(lue("- zone:`runtime/`")?.zone, ["runtime/"]);
  assert.deepEqual(lue("- **zone :**_drafts/")?.zone, ["_drafts/"]);
  assert.deepEqual(lue("- `zone`: __tests__/, `*.md`")?.zone, ["__tests__/", "*.md"]);
});

test("un champ vide, ou « rien », dit que le ticket n'attend personne ou ne possède rien", () => {
  assert.deepEqual(lue("- attend :", "- zone : aucune"), { waitsFor: [], zone: [], problems: [] });
  assert.deepEqual(lue("- attend : rien", "- zone : —"), { waitsFor: [], zone: [], problems: [] });
  assert.deepEqual(lue("- zone : runtime/"), { waitsFor: [], zone: ["runtime/"], problems: [] });
});

test("le marqueur ne compte qu'en tête de ligne, hors d'un bloc de code : citer le format n'est pas poser une fiche", () => {
  assert.equal(porteFiche(FICHE), true);
  assert.equal(porteFiche(`La fiche est le commentaire marqué \`${MARQUEUR}\`.`), false);
  assert.equal(porteFiche(`> ${MARQUEUR}\n> - attend : #68`), false);
  assert.equal(porteFiche(["Le format :", "```", MARQUEUR, "- attend : #68", "```"].join("\n")), false);
  assert.equal(porteFiche(["~~~md", MARQUEUR, "~~~", "", MARQUEUR, "- attend : #70"].join("\n")), true);
});

test("ce qui précède le marqueur, et un bloc de code après lui, ne sont pas lus", () => {
  const corps = ["- attend : #1", MARQUEUR, "- attend : #68", "```", "- zone : /etc", "- budget : 40", "```"].join("\n");
  assert.deepEqual(fiche([corps]), { waitsFor: [68], zone: [], problems: [] });
});

test("une clé inconnue rend la fiche illisible, et le problème la nomme", () => {
  const resultat = lue("- attend : #68", "- budget : 40 tours");
  assert.deepEqual(resultat?.waitsFor, [68]);
  assert.equal(resultat?.problems.length, 1);
  assert.match(resultat?.problems[0] ?? "", /clé inconnue « budget ».*attend, zone/);
  assert.match(illisible(resultat) ?? "", /budget/);
  assert.match(lue("Attention : ne pas toucher")?.problems[0] ?? "", /clé inconnue « attention »/);
});

test("une valeur que le runtime ne comprend pas est dite, jamais lue comme vide", () => {
  assert.match(lue("- attend : #68, le ticket du rail")?.problems[0] ?? "", /attend : « le » n'est pas un numéro de ticket/);
  assert.match(lue("- attend : 68")?.problems[0] ?? "", /« 68 ».*#68/);
  assert.match(lue("- attend : #0")?.problems[0] ?? "", /« #0 »/);
  assert.match(lue("- attend : #99999999999999999999")?.problems[0] ?? "", /n'est pas un numéro de ticket/);
  assert.match(lue("- zone : /etc/passwd")?.problems[0] ?? "", /zone : « \/etc\/passwd » n'est pas un chemin du dépôt/);
  assert.match(lue("- zone : runtime/../../ailleurs")?.problems[0] ?? "", /n'est pas un chemin du dépôt/);
  assert.match(lue("- zone : ~/Dev")?.problems[0] ?? "", /n'est pas un chemin du dépôt/);
  assert.deepEqual(lue("- attend : #68, #x, #y")?.problems.length, 2);
});

test("une puce qui n'est pas « clé : valeur » est dite ; une ligne de prose ne l'est pas", () => {
  assert.match(lue("- attend #68")?.problems[0] ?? "", /ligne illisible : « - attend #68 ».*clé : valeur/);
  assert.deepEqual(lue("Posée par le manager le 8 octobre.", "https://github.com/benomite/brigade/issues/75", "- attend : #68")?.problems, []);
});

test("une clé posée deux fois : le runtime ne choisit pas", () => {
  const resultat = lue("- attend : #68", "- attend : #69");
  assert.match(resultat?.problems[0] ?? "", /« attend » figure deux fois/);
});

test("deux fiches sur une issue : aucune n'est lue, et le problème dit d'en garder une", () => {
  const resultat = fiche([FICHE, `${MARQUEUR}\n- attend : #70`]);
  assert.deepEqual([resultat?.waitsFor, resultat?.zone], [[], []]);
  assert.match(resultat?.problems[0] ?? "", /2 fiches.*une seule/);
  assert.match(fiche([`${FICHE}\n${MARQUEUR}\n- zone : docs/`])?.problems[0] ?? "", /2 fiches/);
});

test("une fiche lisible, ou absente, n'a rien d'illisible", () => {
  assert.equal(illisible(null), null);
  assert.equal(illisible(fiche([FICHE])), null);
});
