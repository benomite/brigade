// Les échelles de la peau (#2909) : cinq tailles de texte, six pas d'espacement et les arrondis, posés dans jetons.css
// et nulle part ailleurs. Une feuille de la vue ne donne une taille, un espacement ou un arrondi que par l'un de ces
// jetons : un nombre suivi d'une unité (`12px`, `0.4rem`) y est une valeur hors de l'échelle. Restent permis le zéro nu,
// `auto`, les pourcentages, les `em` (relatifs au texte autour) et ce qui ne compte que des jetons (`calc(-1 * var(--pas-3))`).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { jetonsDe } from "./aides/fausse-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const lire = (fichier: string) => readFileSync(join(VUE, fichier), "utf8");

// Les feuilles de la vue, sous-dossiers compris — sauf jetons.css, le seul endroit où une valeur s'écrit.
const feuilles = (readdirSync(VUE, { recursive: true }) as string[]).filter((fichier) => fichier.endsWith(".css") && fichier !== "jetons.css").sort();

const PROPRIETES = /(?<![\w-])(font-size|padding(?:-[a-z-]+)?|gap|row-gap|column-gap|margin(?:-[a-z-]+)?|border(?:-[a-z]+)*-radius)\s*:\s*([^;}]*)/g;
// Un nombre non nul suivi d'une unité de longueur absolue ou relative à la racine ou à la fenêtre.
const LITTERAL = /(?<![\w.#-])-?(?:\d*\.)?\d+(?:px|rem|pt|pc|cm|mm|in|q|vh|vw|vmin|vmax|ch|ex)\b/gi;
const NUL = /^-?(?:0*\.)?0+[a-z]*$/i;

// Chaque littéral d'une feuille, avec sa ligne : les commentaires sont blanchis, leurs retours à la ligne gardés.
function litteraux(fichier: string, css: string): string[] {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, (commentaire) => commentaire.replace(/[^\n]/g, " "));
  const trouves: string[] = [];
  for (const declaration of sansCommentaires.matchAll(PROPRIETES)) {
    const [, propriete = "", valeur = ""] = declaration;
    const ligne = sansCommentaires.slice(0, declaration.index).split("\n").length;
    for (const [litteral] of valeur.matchAll(LITTERAL)) {
      if (!NUL.test(litteral)) trouves.push(`${fichier}:${ligne} — ${propriete}: ${litteral}`);
    }
  }
  return trouves;
}

describe("les échelles : tailles, pas et arrondis sont des jetons", () => {
  const jetons = jetonsDe(lire("jetons.css"));
  const famille = (prefixe: string) => Object.fromEntries([...jetons].filter(([nom]) => nom.startsWith(prefixe)));

  test("jetons.css pose cinq tailles de texte : 11, 13, 15, 20 et 28", () => {
    assert.deepEqual(famille("--taille-"), {
      "--taille-meta": "11px",
      "--taille-corps": "13px",
      "--taille-intertitre": "15px",
      "--taille-titre": "20px",
      "--taille-chiffre": "28px",
    });
  });

  test("jetons.css pose six pas d'espacement, de 4 à 32", () => {
    assert.deepEqual(famille("--pas-"), { "--pas-1": "4px", "--pas-2": "8px", "--pas-3": "12px", "--pas-4": "16px", "--pas-5": "24px", "--pas-6": "32px" });
  });

  test("jetons.css pose les arrondis 10, 8 et 4, et le rond complet de la pastille", () => {
    assert.deepEqual(famille("--rayon-"), { "--rayon-carte": "10px", "--rayon-bouton": "8px", "--rayon-bon": "4px", "--rayon-pastille": "999px" });
  });

  test("aucune feuille de la vue n'écrit une taille, un espacement ou un arrondi en dur", () => {
    assert.ok(feuilles.includes("vue.css") && feuilles.includes(join("autonomie", "autonomie.css")), feuilles.join(", "));
    const trouves = feuilles.flatMap((fichier) => litteraux(fichier, lire(fichier)));
    assert.deepEqual(trouves, [], `des littéraux à remplacer par un jeton de jetons.css :\n${trouves.join("\n")}`);
  });

  test("un littéral réintroduit est trouvé, avec son fichier et sa ligne ; remplacé par un jeton, il ne l'est plus", () => {
    const avec = ".a {\n  /* padding: 6px */\n  padding: 0 var(--pas-2);\n  margin: -12px auto 0;\n}\n.b { font-size: 12px; gap: 0.4rem 50%; border-top-left-radius: 3px; }\n";
    assert.deepEqual(litteraux("x.css", avec), ["x.css:4 — margin: -12px", "x.css:6 — font-size: 12px", "x.css:6 — gap: 0.4rem", "x.css:6 — border-top-left-radius: 3px"]);
    const sans = ".a {\n  padding: 0 var(--pas-2);\n  margin: calc(-1 * var(--pas-3)) auto 0;\n}\n.b { font-size: var(--taille-corps); gap: var(--pas-2) 50%; border-top-left-radius: var(--rayon-bon); margin: 0.5em 0px; }\n";
    assert.deepEqual(litteraux("x.css", sans), []);
  });
});
