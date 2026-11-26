// #3780 — ce que le changement livre hors d'un projet : rouge sur main (l'accent y était l'orange des projets).
// L'accent de Brigade hors d'un projet est un blanc cassé chaud et neutre, plus l'orange de la
// palette des projets ; dans l'espace d'un projet, c'est la couleur de ce projet — y compris
// l'orange, qui reste une couleur de projet.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { EXEMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const SRC = join(import.meta.dirname, "../src");
const sansCommentaires = (texte: string): string => texte.replace(/\/\*[\s\S]*?\*\//g, "");
const TOKENS = sansCommentaires(readFileSync(join(SRC, "vue/tokens.css"), "utf8"));
const defaut = /--accent:\s*(#[0-9a-f]{6})\s*;/i.exec(TOKENS)?.[1]?.toLowerCase() ?? assert.fail("pas d'--accent dans tokens.css");

const fichiers = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiers(join(dossier, e.name)) : [join(dossier, e.name)]));

describe("hors d'un projet, Brigade a son accent : un blanc cassé, jamais l'orange des projets", () => {
  test("l'--accent de tokens.css est le blanc cassé, pas #f2994a", () => {
    assert.equal(defaut, "#ece6dc");
    assert.notEqual(defaut, "#f2994a");
  });

  test("dans app/src/, #f2994a n'est que l'orange de la palette et le jeton d'état --orange ; l'onglet actif, les boutons et les contours suivent --accent ou --teinte", () => {
    for (const fichier of fichiers(SRC)) {
      for (const line of readFileSync(fichier, "utf8").split("\n")) {
        if (!/#f2994a/i.test(line)) continue;
        const permis = fichier.endsWith("couleurs.ts") ? /nom: "orange"/.test(line) : /^\s*--orange:\s*#f2994a;/i.test(line);
        assert.ok(permis, `${fichier} : #f2994a ne dit pas un état ni une couleur de projet : ${line.trim()}`);
      }
    }
    const css = sansCommentaires(readFileSync(join(SRC, "vue/vue.css"), "utf8"));
    assert.match(css, /outline:\s*2px solid var\(--accent\)/);
    assert.match(css, /border-bottom-color:\s*var\(--accent\)/);
    assert.match(css, /background:\s*var\(--accent\)/);
    assert.match(TOKENS, /--teinte:\s*var\(--accent\)/);
  });

  const ORANGE: Project = { nom: "parade", dossier: "/tmp/parade", couleurs: { onglet: "#f2994a", accent: "#f2994a" } };
  const BLEU: Project = { nom: "fanfare", dossier: "/tmp/fanfare", couleurs: { onglet: "#7fb2f0", accent: "#25c0c5" } };
  const jouer = (projects: Project[]): Promise<Jouee> =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: projects }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const accent = () => (globalThis as unknown as { document: { documentElement: Faux } }).document.documentElement.style.getPropertyValue("--accent");

  test("quand la vue sort d'un projet, aucun --accent de projet ne reste posé : l'accent qui vaut est celui des jetons, le blanc cassé", async () => {
    const vue = await jouer([ORANGE, BLEU]);
    const bar = vue.element("projets");
    bar.children[1]?.click();
    await repos();
    assert.equal(accent(), "#f2994a");
    bar.children[0]?.click();
    await repos();
    assert.equal(accent() || defaut, "#ece6dc");
    assert.equal(accent(), "");
  });
});
