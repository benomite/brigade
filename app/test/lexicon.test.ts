// Le lexique de l'app (docs/maquettes/app/, section Lexicon de Main.dc.html ; ticket 2910) : un mot par chose, sur tous les écrans.
// Les mots qu'il a remplacés ne reviennent dans aucune chaîne de la vue, et ceux qu'il retient viennent de src/vue/lexicon.js.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import * as lexicon from "../src/vue/lexicon.js";
import { type String, stringsOfVue } from "./helpers/strings-of-vue.ts";

const VUE = join(import.meta.dirname, "..", "src", "vue");

function files(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(folder, entry.name)) : [join(folder, entry.name)]));
}
const sources = files(VUE).filter((path) => path.endsWith(".js") && !path.endsWith("lexicon.js"));
const pages = files(VUE).filter((path) => path.endsWith(".html"));

// Chaque ligne du tableau « Same thing said with different words » (docs/design/inventaire/README.md) : les mots que le lexique remplace.
// `sauf` : une chaîne qui n'est pas dite à l'écran (une valeur comparée, un état de donnée).
type Rule = { chose: string; remplace: RegExp; mot: string; sauf?: (string: String) => boolean };
const COMPARISON = /(===|!==|case|state:)\s*$/;
const RULES: Rule[] = [
  { chose: "this computer", remplace: /\bthis (machine|mac|pc)\b/i, mot: "CET_ORDINATEUR" },
  { chose: "Cancel", remplace: /^(cancel|no|Cancel the .*)$/, mot: "ANNULER" },
  { chose: "confirmation answers", remplace: /^(yes, [a-z]|yes, launch it)/, mot: "OUI" },
  { chose: "Save · Saving…", remplace: /(\bsaving…|^(SAUVER|ENREGISTRER)$)/, mot: "ENREGISTREMENT" },
  { chose: "Try again", remplace: /^(Retry|retry|try again)$/, mot: "REESSAYER" },
  { chose: "Add a project", remplace: /\badd .*to the (app|kitchen)\b/i, mot: "AJOUTER_UN_PROJET" },
  { chose: "Update now", remplace: /\binstall now\b/i, mot: "METTRE_A_JOUR" },
  { chose: "closing pass", remplace: /\bclean-?up\b/i, mot: "PASSE_DE_FERMETURE" },
  { chose: "not reached", remplace: /\b(unavailable|could not reach|couldn't reach)\b/i, mot: "NON_ATTEINT", sauf: ({ texte: text, avant: before }) => (text === "unavailable" && COMPARISON.test(before)) },
  { chose: "empty lines", remplace: /^((no|none|nothing)\b.*\byet|(No|None|Nothing)\b[^.]*\byet(?!\.))/, mot: "PAS_ENCORE" },
  { chose: "running reads", remplace: /^reading\b.*…$/, mot: "LECTURE_DE" },
];

// Les mots retenus : une vue les importe, elle n'en écrit pas de copie. « Add a project » reste libre dans index.html (du HTML ne s'importe pas).
const HELD = [lexicon.THIS_COMPUTER, lexicon.PASS_OF_CLOSING, lexicon.PUT_A_DAY, lexicon.RETRY, lexicon.ADD_ONE_PROJECT, lexicon.RECORDING, lexicon.CANCEL];

/** Les mots remplacés qui se lisent encore dans les chaînes de la vue, un par ligne : « fichier:ligne règle « texte » ». */
export function returns(path: string, source: string): string[] {
  const saidOnes: string[] = [];
  for (const string of stringsOfVue(source)) {
    for (const rule of RULES) {
      if (rule.remplace.test(string.texte) && rule.sauf?.(string) !== true) saidOnes.push(`${relative(VUE, path)}:${string.ligne} ${rule.chose} — « ${string.texte} » (use ${rule.mot} from lexicon.js)`);
    }
    for (const word of HELD) {
      if (string.texte.includes(word)) saidOnes.push(`${relative(VUE, path)}:${string.ligne} « ${word} » copied in « ${string.texte} » (import it from lexicon.js)`);
    }
  }
  return saidOnes;
}

describe("le lexique : un mot par chose, sur chaque écran", () => {
  test("les mots remplacés ne reviennent dans aucune chaîne de la vue", () => {
    const found = sources.flatMap((path) => returns(path, readFileSync(path, "utf8")));
    assert.deepEqual(found, []);
  });

  test("le lecteur de chaînes passe les commentaires et les regex, lit les gabarits et leurs expressions", () => {
    const source = ['// "this machine"', '/* "cancel" */ const a = /unavailable/.test(x) ? "kept" : `Add ${"inner"} to the kitchen`;', "const b = 'no';"].join("\n");
    assert.deepEqual(stringsOfVue(source).map(({ texte: text }) => text), ["kept", "Add ", "inner", " to the kitchen", "no"]);
  });

  test("un mot remplacé qui revient est refusé, un mot retenu recopié aussi", () => {
    assert.deepEqual(returns(join(VUE, "x.js"), 'bouton("cancel", f);\nconst a = "Try again";\nif (etat === "unavailable") f();\nconst b = "history unavailable";'), [
      "x.js:1 Cancel — « cancel » (use ANNULER from lexicon.js)",
      "x.js:2 « Try again » copied in « Try again » (import it from lexicon.js)",
      "x.js:4 not reached — « history unavailable » (use NON_ATTEINT from lexicon.js)",
    ]);
  });

  test("index.html ne dit aucun mot remplacé", () => {
    for (const path of pages) {
      const withoutComments = readFileSync(path, "utf8").replace(/<!--[\s\S]*?-->/g, "");
      const texts = [...withoutComments.matchAll(/>([^<>]+)</g), ...withoutComments.matchAll(/"([^"<>]+)"/g)].map((m) => (m[1] ?? "").trim());
      const found = texts.flatMap((text) => RULES.filter((rule) => rule.remplace.test(text)).map((rule) => `${relative(VUE, path)} ${rule.chose} — « ${text} »`));
      assert.deepEqual(found, []);
    }
  });
});
