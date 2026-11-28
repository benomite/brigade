// Stations, Verify (la vérification d'un projet) et Settings suivent les mêmes règles que le reste de l'app :
// aucun mode d'emploi à plat, chaque geste un bouton, aucune commande écrite, une lecture qui manque en
// une ligne — l'explication, la commande et le détail au survol. La vue est jouée telle qu'elle est.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import type { Kitchen } from "../src/box.ts";

import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import type { Terminal } from "../src/terminals.ts";
import { type Played, playTheVue, openRead, repos } from "./helpers/false-vue.ts";

const KITCHEN: Kitchen = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

async function open(answers = {}): Promise<Played> {
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: {},
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      }),
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this computer" }],
    ...answers,
  });
  (vue.element("projets").children[1] ?? assert.fail("pas de case")).click();
  await repos();
  return vue;
}

describe("Settings n'a plus de page Manager (#1700)", () => {
  test("ni page ni bouton du manager dans Settings : le manager suit l'interrupteur du projet", async () => {
    const vue = await open({});
    await openRead(vue, "Settings");
    assert.throws(() => vue.element("manager"), /aucun élément « manager »/);
    assert.deepEqual(vue.element("etat").dessous("button").filter(({ textContent }) => /manager|^(?:on|off)(?:…)?$/i.test(textContent)), []);
    assert.throws(() => vue.element("interrupteur-projet"), /aucun élément/);
  });
});
