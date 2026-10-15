// Le markdown d'une issue, rendu comme GitHub le montre, mais en un arbre que la vue pose élément
// par élément — jamais en HTML (markdown.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { liensDe, rendre } from "../src/markdown.ts";

describe("le markdown d'une issue est rendu, pas affiché brut", () => {
  test("titres, emphase, code dans la ligne et liens", () => {
    assert.deepEqual(rendre("## Contexte\n\nUn *mot*, du **gras**, ~~barré~~, `du code` et [un lien](https://github.com/benomite/brigade/issues/683)."), [
      { titre: 2, contenu: [{ texte: "Contexte" }] },
      {
        paragraphe: [
          { texte: "Un " },
          { italique: [{ texte: "mot" }] },
          { texte: ", du " },
          { gras: [{ texte: "gras" }] },
          { texte: ", " },
          { barre: [{ texte: "barré" }] },
          { texte: ", " },
          { code: "du code" },
          { texte: " et " },
          { lien: "https://github.com/benomite/brigade/issues/683", contenu: [{ texte: "un lien" }] },
          { texte: "." },
        ],
      },
    ]);
  });

  test("les listes, imbriquées, numérotées, et les listes de tâches", () => {
    assert.deepEqual(rendre("- un\n- deux\n  - a\n  - b\n\n3. trois\n4. quatre\n\n- [x] fait\n- [ ] à faire"), [
      { liste: [{ blocs: [{ paragraphe: [{ texte: "un" }] }] }, { blocs: [{ paragraphe: [{ texte: "deux" }] }, { liste: [{ blocs: [{ paragraphe: [{ texte: "a" }] }] }, { blocs: [{ paragraphe: [{ texte: "b" }] }] }] }] }] },
      { liste: [{ blocs: [{ paragraphe: [{ texte: "trois" }] }] }, { blocs: [{ paragraphe: [{ texte: "quatre" }] }] }], debut: 3 },
      { liste: [{ coche: true, blocs: [{ paragraphe: [{ texte: "fait" }] }] }, { coche: false, blocs: [{ paragraphe: [{ texte: "à faire" }] }] }] },
    ]);
  });

  test("un élément de liste continue sur ses lignes en retrait, et après un blanc", () => {
    assert.deepEqual(rendre("- **Bloquant** — le texte\n  continue ici\n\n  et reprend\n- suivant"), [
      {
        liste: [
          { blocs: [{ paragraphe: [{ gras: [{ texte: "Bloquant" }] }, { texte: " — le texte" }, { saut: true }, { texte: "continue ici" }] }, { paragraphe: [{ texte: "et reprend" }] }] },
          { blocs: [{ paragraphe: [{ texte: "suivant" }] }] },
        ],
      },
    ]);
  });

  test("un bloc de code garde ses lignes, ses blancs et ce qui ressemble à du markdown ou du HTML", () => {
    assert.deepEqual(rendre("```ts\nconst a = `x` * 2;\n  <!-- gardé -->\n# pas un titre\n```"), [{ code: "const a = `x` * 2;\n  <!-- gardé -->\n# pas un titre", langue: "ts" }]);
    assert.deepEqual(rendre("~~~\nsans langue\n~~~"), [{ code: "sans langue" }]);
  });

  test("citations, traits, tableaux et replis `<details>`", () => {
    assert.deepEqual(rendre("> cité\n> **encore**\n\n---\n\n| a | b |\n|---|:-:|\n| 1 | `2` |\n\n<details>\n<summary>Le reste</summary>\n\nCaché *ici*\n\n</details>"), [
      { citation: [{ paragraphe: [{ texte: "cité" }, { saut: true }, { gras: [{ texte: "encore" }] }] }] },
      { trait: true },
      { tableau: { tete: [[{ texte: "a" }], [{ texte: "b" }]], lignes: [[[{ texte: "1" }], [{ code: "2" }]]] } },
      { replie: { resume: [{ texte: "Le reste" }], blocs: [{ paragraphe: [{ texte: "Caché " }, { italique: [{ texte: "ici" }] }] }] } },
    ]);
  });

  test("un retour à la ligne dans un paragraphe en est un, comme dans un commentaire GitHub", () => {
    assert.deepEqual(rendre("ligne 1\nligne 2  \nligne 3<br>ligne 4"), [{ paragraphe: [{ texte: "ligne 1" }, { saut: true }, { texte: "ligne 2" }, { saut: true }, { texte: "ligne 3" }, { saut: true }, { texte: "ligne 4" }] }]);
  });

  test("les commentaires HTML — les marqueurs du runtime — ne se montrent pas, comme sur GitHub", () => {
    assert.deepEqual(rendre("<!-- brigade:fiche -->\n- attend : #683"), [{ liste: [{ blocs: [{ paragraphe: [{ texte: "attend : #683" }] }] }] }]);
    assert.deepEqual(rendre("<!-- brigade:question\nsur deux lignes -->"), []);
    assert.deepEqual(rendre(""), []);
  });

  test("le HTML qui n'est pas connu se lit en texte, et seule une adresse http(s) devient un lien", () => {
    assert.deepEqual(rendre('<script>alert(1)</script> <img src=x onerror="alert(1)">'), [{ paragraphe: [{ texte: '<script>alert(1)</script> <img src=x onerror="alert(1)">' }] }]);
    assert.deepEqual(rendre("[clic](javascript:alert(1)) et [local](file:///etc/passwd)"), [{ paragraphe: [{ texte: "clic et local" }] }]);
  });

  test("une adresse nue devient un lien, sans la ponctuation qui la suit", () => {
    assert.deepEqual(rendre("Voir https://github.com/benomite/brigade/pull/779. Et (https://x.y/a_(b))."), [
      {
        paragraphe: [
          { texte: "Voir " },
          { lien: "https://github.com/benomite/brigade/pull/779", contenu: [{ texte: "https://github.com/benomite/brigade/pull/779" }] },
          { texte: ". Et (" },
          { lien: "https://x.y/a_(b)", contenu: [{ texte: "https://x.y/a_(b)" }] },
          { texte: ")." },
        ],
      },
    ]);
  });

  test("ce qui n'est pas de l'emphase reste tel quel : snake_case, 2 * 3 * 4, un signe échappé", () => {
    assert.deepEqual(rendre("snake_case_mot, 2 * 3 * 4, \\*pas d'emphase\\* et **pas fermé"), [{ paragraphe: [{ texte: "snake_case_mot, 2 * 3 * 4, *pas d'emphase* et **pas fermé" }] }]);
  });

  test("une issue démesurée ou trop imbriquée se rend, sans faire tomber la vue", () => {
    const profonde = rendre(`${">".repeat(200)} fond`);
    assert.equal(profonde.length, 1);
    const enorme = rendre(`${"**a".repeat(20_000)}${"[".repeat(5_000)}`);
    assert.equal(enorme.length, 1);
  });

  test("les adresses que le texte rendu ouvre, une fois chacune", () => {
    assert.deepEqual(liensDe(rendre("[a](https://a.b/1) https://a.b/1\n\n> **[c](https://c.d/)**\n\n| [t](https://t.u/) |\n|---|")), ["https://a.b/1", "https://c.d/", "https://t.u/"]);
  });
});
