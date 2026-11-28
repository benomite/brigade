// Les échelles de la peau (#2909) : quatre tailles de texte, six pas d'espacement et les arrondis, posés dans tokens.css
// et nulle part ailleurs. Une feuille de la vue ne donne une taille, un espacement ou un arrondi que par l'un de ces
// jetons : un nombre suivi d'une unité (`12px`, `0.4rem`) y est une valeur hors de l'échelle. Restent permis le zéro nu,
// `auto`, les pourcentages, les `em` (relatifs au texte autour) et ce qui ne compte que des jetons (`calc(-1 * var(--pas-3))`).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { tokensOf } from "./helpers/false-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const read = (file: string) => readFileSync(join(VUE, file), "utf8");

// Les feuilles de la vue, sous-dossiers compris — sauf tokens.css, le seul endroit où une valeur s'écrit.
const sheets = (readdirSync(VUE, { recursive: true }) as string[]).filter((file) => file.endsWith(".css") && file !== "tokens.css").sort();

const PROPERTIES = /(?<![\w-])(font-size|padding(?:-[a-z-]+)?|gap|row-gap|column-gap|margin(?:-[a-z-]+)?|border(?:-[a-z]+)*-radius)\s*:\s*([^;}]*)/g;
// Un nombre non nul suivi d'une unité de longueur absolue ou relative à la racine ou à la fenêtre.
const LITERAL = /(?<![\w.#-])-?(?:\d*\.)?\d+(?:px|rem|pt|pc|cm|mm|in|q|vh|vw|vmin|vmax|ch|ex)\b/gi;
const NONE = /^-?(?:0*\.)?0+[a-z]*$/i;

// Chaque littéral d'une feuille, avec sa ligne : les commentaires sont blanchis, leurs retours à la ligne gardés.
function literals(file: string, css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const found: string[] = [];
  for (const declaration of withoutComments.matchAll(PROPERTIES)) {
    const [, property = "", value = ""] = declaration;
    const line = withoutComments.slice(0, declaration.index).split("\n").length;
    for (const [literal] of value.matchAll(LITERAL)) {
      if (!NONE.test(literal)) found.push(`${file}:${line} — ${property}: ${literal}`);
    }
  }
  return found;
}

describe("les échelles : tailles, pas et arrondis sont des jetons", () => {
  const tokens = tokensOf(read("tokens.css"));
  const family = (prefix: string) => Object.fromEntries([...tokens].filter(([name]) => name.startsWith(prefix)));

  test("tokens.css pose quatre tailles de texte : 11, 13, 15 et 20", () => {
    assert.deepEqual(family("--taille-"), {
      "--taille-meta": "11px",
      "--taille-corps": "13px",
      "--taille-intertitre": "15px",
      "--taille-titre": "20px",
    });
  });

  test("tokens.css pose cinq pas d'espacement, de 4 à 24", () => {
    assert.deepEqual(family("--pas-"), { "--pas-1": "4px", "--pas-2": "8px", "--pas-3": "12px", "--pas-4": "16px", "--pas-5": "24px" });
  });

  test("tokens.css pose les arrondis 10, 8 et 4, et le rond complet de la pastille", () => {
    assert.deepEqual(family("--rayon-"), { "--rayon-carte": "10px", "--rayon-bouton": "8px", "--rayon-bon": "4px", "--rayon-pastille": "999px" });
  });

  test("aucune feuille de la vue n'écrit une taille, un espacement ou un arrondi en dur", () => {
    assert.ok(sheets.includes("vue.css"), sheets.join(", "));
    const found = sheets.flatMap((file) => literals(file, read(file)));
    assert.deepEqual(found, [], `des littéraux à remplacer par un jeton de tokens.css :\n${found.join("\n")}`);
  });

  test("un littéral réintroduit est trouvé, avec son fichier et sa ligne ; remplacé par un jeton, il ne l'est plus", () => {
    const withIt = ".a {\n  /* padding: 6px */\n  padding: 0 var(--pas-2);\n  margin: -12px auto 0;\n}\n.b { font-size: 12px; gap: 0.4rem 50%; border-top-left-radius: 3px; }\n";
    assert.deepEqual(literals("x.css", withIt), ["x.css:4 — margin: -12px", "x.css:6 — font-size: 12px", "x.css:6 — gap: 0.4rem", "x.css:6 — border-top-left-radius: 3px"]);
    const without = ".a {\n  padding: 0 var(--pas-2);\n  margin: calc(-1 * var(--pas-3)) auto 0;\n}\n.b { font-size: var(--taille-corps); gap: var(--pas-2) 50%; border-top-left-radius: var(--rayon-bon); margin: 0.5em 0px; }\n";
    assert.deepEqual(literals("x.css", without), []);
  });
});
