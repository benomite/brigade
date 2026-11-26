// Stations, Verify (la vérification d'un projet) et Settings suivent les mêmes règles que le reste de l'app :
// aucun mode d'emploi à plat, chaque geste un bouton, aucune commande écrite, une lecture qui manque en
// une ligne — l'explication, la commande et le détail au survol. La vue est jouée telle qu'elle est.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { EXEMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import type { Kitchen } from "../src/box.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Jouee, jouerLaVue, ouvrirRead, repos } from "./aides/fausse-vue.ts";

const KITCHEN: Kitchen = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };

async function ouvrir(answers = {}): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
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
  // Un seul interrupteur pour tout le projet (#1406), en tête de l'espace : sa confirmation, qui dit son
  // prix en une ligne, est éprouvée là (switch-project.test.ts).
  test("ni page ni bouton du manager dans Settings : le manager suit l'interrupteur du projet", async () => {
    const vue = await ouvrir({ confirmer: (_: string, id: string) => confirmationDe(id, PARADE, { sans: "pas lus" }, KITCHEN) });
    await ouvrirRead(vue, "Settings");
    assert.throws(() => vue.element("manager"), /aucun élément « manager »/);
    assert.deepEqual(vue.element("etat").dessous("button").filter(({ textContent }) => /manager|^(?:on|off)(?:…)?$/i.test(textContent)), []);
    assert.deepEqual(vue.element("interrupteur-projet").dessous("button").filter(({ className }) => className === "bascule").length, 1);
  });
});
