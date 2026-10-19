import assert from "node:assert/strict";
import { test } from "node:test";
import { card, illisible, MARQUEUR, hasCard, requises } from "../src/card.ts";

const CARD = [
  MARQUEUR,
  "**Fiche du ticket** — lue par le runtime, corrigeable à la main.",
  "- attend : #68, #69",
  "- zone : runtime/src/rail.ts, runtime/test/rail.test.ts",
].join("\n");

const lue = (...lignes: string[]) => card([[MARQUEUR, ...lignes].join("\n")]);

test("la fiche d'un ticket se lit dans le commentaire qui porte le marqueur", () => {
  assert.deepEqual(card(["Un commentaire quelconque.", CARD, "Un autre."]), {
    waitsFor: [68, 69],
    zone: ["runtime/src/rail.ts", "runtime/test/rail.test.ts"],
    problems: [],
  });
});

test("une issue sans commentaire marqué n'a pas de fiche — ce n'est pas une fiche vide", () => {
  assert.equal(card([]), null);
  assert.equal(card(["- attend : #68", "- zone : runtime/"]), null);
  assert.deepEqual(lue("**Fiche du ticket**"), { waitsFor: [], zone: [], problems: [] });
});

test("une fiche retouchée à la main se lit encore : casse, gras, espaces, puces, retours Windows", () => {
  const attendue = { waitsFor: [68, 69], zone: ["runtime/src/rail.ts", "docs/"], problems: [] };
  assert.deepEqual(lue("* **Attend** : #68 #69", "* **Zone** : `runtime/src/rail.ts`, `docs/`"), attendue);
  assert.deepEqual(lue("attend: #68,#69", "zone:runtime/src/rail.ts ,docs/ ,"), attendue);
  assert.deepEqual(lue("- ATTEND : #68, #69, #68", "", "Une note du chef, sans effet.", "", "- zone : runtime/src/rail.ts, docs/, docs/"), attendue);
  assert.deepEqual(card([`  <!--brigade:FICHE-->  \r\n- **attend :** #68, #69\r\n- zone : runtime/src/rail.ts, docs/\r\n`]), attendue);
});

test("une valeur collée aux deux-points garde ses premiers caractères : étoile, tiret bas, accent grave", () => {
  assert.match(lue("zone:*.md")?.problems[0] ?? "", /zone : « \*\.md » est un motif/);
  assert.deepEqual(lue("- zone:_drafts/, _a.md")?.zone, ["_drafts/", "_a.md"]);
  assert.deepEqual(lue("- zone:`runtime/`")?.zone, ["runtime/"]);
  assert.deepEqual(lue("- **zone :**_drafts/")?.zone, ["_drafts/"]);
  assert.deepEqual(lue("- `zone`: __tests__/, `_a.md`")?.zone, ["__tests__/", "_a.md"]);
});

test("un champ vide, ou « rien », dit que le ticket n'attend personne ou ne possède rien", () => {
  assert.deepEqual(lue("- attend :", "- zone : aucune"), { waitsFor: [], zone: [], problems: [] });
  assert.deepEqual(lue("- attend : rien", "- zone : —"), { waitsFor: [], zone: [], problems: [] });
  assert.deepEqual(lue("- zone : runtime/"), { waitsFor: [], zone: ["runtime/"], problems: [] });
});

test("le marqueur ne compte qu'en tête de ligne, hors d'un bloc de code : citer le format n'est pas poser une fiche", () => {
  assert.equal(hasCard(CARD), true);
  assert.equal(hasCard(`La fiche est le commentaire marqué \`${MARQUEUR}\`.`), false);
  assert.equal(hasCard(`> ${MARQUEUR}\n> - attend : #68`), false);
  assert.equal(hasCard(["Le format :", "```", MARQUEUR, "- attend : #68", "```"].join("\n")), false);
  assert.equal(hasCard(["~~~md", MARQUEUR, "~~~", "", MARQUEUR, "- attend : #70"].join("\n")), true);
});

test("ce qui précède le marqueur, et un bloc de code après lui, ne sont pas lus", () => {
  const corps = ["- attend : #1", MARQUEUR, "- attend : #68", "```", "- zone : /etc", "- budget : 40", "```"].join("\n");
  assert.deepEqual(card([corps]), { waitsFor: [68], zone: [], problems: [] });
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
  // Un motif ne se compare pas à un autre chemin : deux zones doivent pouvoir se dire disjointes.
  for (const motif of ["runtime/**/*.ts", "docs/?.md"]) {
    assert.match(lue(`- zone : ${motif}`)?.problems[0] ?? "", /est un motif, pas un chemin/, motif);
  }
  // Des crochets ne font pas un motif : c'est le chemin d'une route.
  assert.deepEqual(lue("- zone : app/[id]/page.tsx")?.zone, ["app/[id]/page.tsx"]);
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
  const resultat = card([CARD, `${MARQUEUR}\n- attend : #70`]);
  assert.deepEqual([resultat?.waitsFor, resultat?.zone], [[], []]);
  assert.match(resultat?.problems[0] ?? "", /2 fiches.*une seule/);
  assert.match(card([`${CARD}\n${MARQUEUR}\n- zone : docs/`])?.problems[0] ?? "", /2 fiches/);
});

test("une fiche lisible, ou absente, n'a rien d'illisible", () => {
  assert.equal(illisible(null), null);
  assert.equal(illisible(card([CARD])), null);
});

test("une ligne `requiert` porte les capacités que le ticket demande à sa station", () => {
  assert.deepEqual(lue("- attend : #68", "- zone : runtime/src", "- requiert : chrome-connecté"), {
    waitsFor: [68],
    zone: ["runtime/src"],
    problems: [],
    requires: ["chrome-connecté"],
  });
  // Plusieurs, retouchées à la main : gras, code, espaces, doublon — et un
  // accent écrit en deux caractères est le même nom.
  assert.deepEqual(lue("- **Requiert :** `navigateur-headless`,  chrome-connecté, navigateur-headless")?.requires, ["navigateur-headless", "chrome-connecté"]);
  assert.deepEqual(requises(lue("- requiert : gpu")), ["gpu"]);
  // Ce qui n'est pas un nom de capacité est dit, jamais lu comme vide.
  const fautive = lue("- requiert : chrome/connecté");
  assert.match(fautive?.problems[0] ?? "", /^requiert : « chrome\/connecté » n'est pas un nom de capacité — attendu des lettres, des chiffres et des tirets/);
  // Une fiche illisible ne demande rien : ce qu'elle dit ne fait pas foi.
  assert.deepEqual(requises(lue("- requiert : gpu", "- budget : 40 tours")), []);
  assert.match(lue("- requiert : gpu", "- requiert : code")?.problems[0] ?? "", /« requiert » figure deux fois/);
});

test("une fiche sans ligne `requiert` se lit exactement comme avant : aucun champ de plus, aucune capacité demandée", () => {
  // Les mêmes objets, champ pour champ, que ceux que le rail gardait déjà.
  assert.deepEqual(card([CARD]), { waitsFor: [68, 69], zone: ["runtime/src/rail.ts", "runtime/test/rail.test.ts"], problems: [] });
  assert.deepEqual(lue("- attend : rien", "- zone : aucune"), { waitsFor: [], zone: [], problems: [] });
  assert.equal(Object.hasOwn(card([CARD]) ?? {}, "requires"), false);
  assert.equal(JSON.stringify(lue("- attend : #68")), '{"waitsFor":[68],"zone":[],"problems":[]}');
  assert.deepEqual(requises(card([CARD])), []);
  assert.deepEqual(requises(null), []);
  // Une ligne qui ne demande rien vaut pas de ligne.
  for (const rien of ["", "rien", "aucune", "-"]) assert.deepEqual(lue("- attend : #68", `- requiert : ${rien}`), { waitsFor: [68], zone: [], problems: [] }, rien);
});

test("une clé encore inconnue rend toujours la fiche illisible, à côté d'une ligne `requiert`", () => {
  const resultat = lue("- requiert : chrome-connecté", "- domaine : sécu");
  assert.deepEqual(resultat?.problems, ["clé inconnue « domaine » — connues : attend, zone, requiert"]);
  assert.match(illisible(resultat) ?? "", /domaine/);
  // Les noms qu'on aurait pu donner à la ligne n'en sont pas.
  for (const autre of ["capacités", "capacites", "requires", "demande"]) assert.match(lue(`- ${autre} : gpu`)?.problems[0] ?? "", /clé inconnue/, autre);
});
