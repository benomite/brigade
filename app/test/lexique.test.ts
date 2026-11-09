// Le lexique de l'app (docs/maquettes/app/, section Lexicon de Main.dc.html ; ticket 2910) : un mot par chose, sur tous les écrans.
// Les mots qu'il a remplacés ne reviennent dans aucune chaîne de la vue, et ceux qu'il retient viennent de src/vue/lexique.js.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import * as lexique from "../src/vue/lexique.js";
import { type Chaine, chainesDeVue } from "./aides/chaines-de-vue.ts";

const VUE = join(import.meta.dirname, "..", "src", "vue");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? fichiers(join(dossier, entree.name)) : [join(dossier, entree.name)]));
}
const sources = fichiers(VUE).filter((chemin) => chemin.endsWith(".js") && !chemin.endsWith("lexique.js"));
const pages = fichiers(VUE).filter((chemin) => chemin.endsWith(".html"));

// Chaque ligne du tableau « Same thing said with different words » (docs/design/inventaire/README.md) : les mots que le lexique remplace.
// `sauf` : une chaîne qui n'est pas dite à l'écran (une valeur comparée, un état de donnée).
type Regle = { chose: string; remplace: RegExp; mot: string; sauf?: (chaine: Chaine) => boolean };
const COMPARAISON = /(===|!==|case|state:)\s*$/;
const REGLES: Regle[] = [
  { chose: "this computer", remplace: /\bthis (machine|mac|pc)\b/i, mot: "CET_ORDINATEUR" },
  { chose: "Cancel", remplace: /^(cancel|no|Cancel the .*)$/, mot: "ANNULER" },
  { chose: "confirmation answers", remplace: /^(yes, [a-z]|yes, launch it)/, mot: "OUI" },
  { chose: "Save · Saving…", remplace: /(\bsaving…|^(SAUVER|ENREGISTRER)$)/, mot: "ENREGISTREMENT" },
  { chose: "Try again", remplace: /^(Retry|retry|try again)$/, mot: "REESSAYER" },
  { chose: "Add a project", remplace: /\badd .*to the (app|kitchen)\b/i, mot: "AJOUTER_UN_PROJET" },
  { chose: "Update now", remplace: /\binstall now\b/i, mot: "METTRE_A_JOUR" },
  { chose: "closing pass", remplace: /\bclean-?up\b/i, mot: "PASSE_DE_FERMETURE" },
  { chose: "not reached", remplace: /\b(unavailable|could not reach|couldn't reach)\b/i, mot: "NON_ATTEINT", sauf: ({ texte, avant }) => texte === "unavailable" && COMPARAISON.test(avant) },
  { chose: "empty lines", remplace: /^((no|none|nothing)\b.*\byet|(No|None|Nothing)\b[^.]*\byet(?!\.))/, mot: "PAS_ENCORE" },
  { chose: "running reads", remplace: /^reading\b.*…$/, mot: "LECTURE_DE" },
];

// Les mots retenus : une vue les importe, elle n'en écrit pas de copie. « Add a project » reste libre dans index.html (du HTML ne s'importe pas).
const RETENUS = [lexique.CET_ORDINATEUR, lexique.PASSE_DE_FERMETURE, lexique.METTRE_A_JOUR, lexique.REESSAYER, lexique.AJOUTER_UN_PROJET, lexique.ENREGISTREMENT, lexique.ANNULER];

/** Les mots remplacés qui se lisent encore dans les chaînes de la vue, un par ligne : « fichier:ligne règle « texte » ». */
export function retours(chemin: string, source: string): string[] {
  const dits: string[] = [];
  for (const chaine of chainesDeVue(source)) {
    for (const regle of REGLES) {
      if (regle.remplace.test(chaine.texte) && regle.sauf?.(chaine) !== true) dits.push(`${relative(VUE, chemin)}:${chaine.ligne} ${regle.chose} — « ${chaine.texte} » (use ${regle.mot} from lexique.js)`);
    }
    for (const mot of RETENUS) {
      if (chaine.texte.includes(mot)) dits.push(`${relative(VUE, chemin)}:${chaine.ligne} « ${mot} » copied in « ${chaine.texte} » (import it from lexique.js)`);
    }
  }
  return dits;
}

describe("le lexique : un mot par chose, sur chaque écran", () => {
  test("les mots remplacés ne reviennent dans aucune chaîne de la vue", () => {
    const trouves = sources.flatMap((chemin) => retours(chemin, readFileSync(chemin, "utf8")));
    assert.deepEqual(trouves, []);
  });

  test("le lecteur de chaînes passe les commentaires et les regex, lit les gabarits et leurs expressions", () => {
    const source = ['// "this machine"', '/* "cancel" */ const a = /unavailable/.test(x) ? "kept" : `Add ${"inner"} to the kitchen`;', "const b = 'no';"].join("\n");
    assert.deepEqual(chainesDeVue(source).map(({ texte }) => texte), ["kept", "Add ", "inner", " to the kitchen", "no"]);
  });

  test("un mot remplacé qui revient est refusé, un mot retenu recopié aussi", () => {
    assert.deepEqual(retours(join(VUE, "x.js"), 'bouton("cancel", f);\nconst a = "Try again";\nif (etat === "unavailable") f();\nconst b = "history unavailable";'), [
      "x.js:1 Cancel — « cancel » (use ANNULER from lexique.js)",
      "x.js:2 « Try again » copied in « Try again » (import it from lexique.js)",
      "x.js:4 not reached — « history unavailable » (use NON_ATTEINT from lexique.js)",
    ]);
  });

  test("index.html ne dit aucun mot remplacé", () => {
    for (const chemin of pages) {
      const sansCommentaires = readFileSync(chemin, "utf8").replace(/<!--[\s\S]*?-->/g, "");
      const textes = [...sansCommentaires.matchAll(/>([^<>]+)</g), ...sansCommentaires.matchAll(/"([^"<>]+)"/g)].map((m) => (m[1] ?? "").trim());
      const trouves = textes.flatMap((texte) => REGLES.filter((regle) => regle.remplace.test(texte)).map((regle) => `${relative(VUE, chemin)} ${regle.chose} — « ${texte} »`));
      assert.deepEqual(trouves, []);
    }
  });
});
