// L'accent de Brigade hors d'un projet est un blanc cassé chaud et neutre, plus l'orange de la
// palette des projets ; dans l'espace d'un projet, c'est la couleur de ce projet — y compris
// l'orange, qui reste une couleur de projet.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER } from "../src/facts.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { type Fake, type Played, playTheVue, repos } from "./helpers/false-vue.ts";

const TOKENS = readFileSync(join(import.meta.dirname, "../src/vue/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("l'accent hors d'un projet est un blanc cassé neutre, dans un projet celui du projet", () => {
  test("hors d'un projet, --accent est un blanc cassé chaud, lisible sur le fond sombre, et plus l'orange des projets", () => {
    const accent = /--accent:\s*(#[0-9a-f]{6})\s*;/i.exec(TOKENS)?.[1]?.toLowerCase() ?? assert.fail("pas d'--accent dans tokens.css");
    assert.notEqual(accent, "#f2994a");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16)) as [number, number, number];
    assert.ok(r >= g && g >= b, `${accent} n'est pas chaud (r ≥ g ≥ b)`);
    assert.ok(r - b <= 40, `${accent} n'est pas neutre : trop saturé`);
    assert.ok(Math.min(r, g, b) >= 0xd0, `${accent} n'est pas un blanc cassé`);
    assert.equal(PALETTE.find(({ nom: name }) => name === "orange")?.valeur, "#f2994a", "l'orange reste une couleur de projet");
  });

  const ORANGE: Project = { nom: "parade", dossier: "/tmp/parade", couleurs: { onglet: "#f2994a", accent: "#f2994a" } };
  const BLUE: Project = { nom: "fanfare", dossier: "/tmp/fanfare", couleurs: { onglet: "#7fb2f0", accent: "#25c0c5" } };
  const play = (projects: Project[]): Promise<Played> =>
    playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: projects }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: {},
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const accent = () => (globalThis as unknown as { document: { documentElement: Fake } }).document.documentElement.style.getPropertyValue("--accent");

  test("dans l'espace d'un projet, l'accent est celui du projet ; en sortant, la peau reprend le sien", async () => {
    const vue = await play([ORANGE, BLUE]);
    const bar = vue.element("projets");
    assert.equal(accent(), "");
    bar.children[1]?.click();
    await repos();
    assert.equal(accent(), "#f2994a");
    bar.children[2]?.click();
    await repos();
    assert.equal(accent(), "#25c0c5");
    bar.children[0]?.click();
    await repos();
    assert.equal(accent(), "");
  });
});
