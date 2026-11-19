// L'accent de Brigade hors d'un projet est un blanc cassé chaud et neutre, plus l'orange de la
// palette des projets ; dans l'espace d'un projet, c'est la couleur de ce projet — y compris
// l'orange, qui reste une couleur de projet.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { type Faux, type Jouee, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const JETONS = readFileSync(join(import.meta.dirname, "../src/vue/jetons.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("l'accent hors d'un projet est un blanc cassé neutre, dans un projet celui du projet", () => {
  test("hors d'un projet, --accent est un blanc cassé chaud, lisible sur le fond sombre, et plus l'orange des projets", () => {
    const accent = /--accent:\s*(#[0-9a-f]{6})\s*;/i.exec(JETONS)?.[1]?.toLowerCase() ?? assert.fail("pas d'--accent dans jetons.css");
    assert.notEqual(accent, "#f2994a");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16)) as [number, number, number];
    assert.ok(r >= g && g >= b, `${accent} n'est pas chaud (r ≥ g ≥ b)`);
    assert.ok(r - b <= 40, `${accent} n'est pas neutre : trop saturé`);
    assert.ok(Math.min(r, g, b) >= 0xd0, `${accent} n'est pas un blanc cassé`);
    assert.equal(PALETTE.find(({ nom }) => nom === "orange")?.valeur, "#f2994a", "l'orange reste une couleur de projet");
  });

  const ORANGE: Projet = { nom: "parade", dossier: "/tmp/parade", couleurs: { onglet: "#f2994a", accent: "#f2994a" } };
  const BLEU: Projet = { nom: "fanfare", dossier: "/tmp/fanfare", couleurs: { onglet: "#7fb2f0", accent: "#25c0c5" } };
  const jouer = (projets: Projet[]): Promise<Jouee> =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const accent = () => (globalThis as unknown as { document: { documentElement: Faux } }).document.documentElement.style.getPropertyValue("--accent");

  // brigade:guard
  test("dans l'espace d'un projet, l'accent est celui du projet ; en sortant, la peau reprend le sien", async () => {
    const vue = await jouer([ORANGE, BLEU]);
    const barre = vue.element("projets");
    assert.equal(accent(), "");
    barre.children[1]?.click();
    await repos();
    assert.equal(accent(), "#f2994a");
    barre.children[2]?.click();
    await repos();
    assert.equal(accent(), "#25c0c5");
    barre.children[0]?.click();
    await repos();
    assert.equal(accent(), "");
  });
});
