// Stations, Verify (la vérification d'un projet) et Settings suivent les mêmes règles que le reste de l'app :
// aucun mode d'emploi à plat, chaque geste un bouton, aucune commande écrite, une lecture qui manque en
// une ligne — l'explication, la commande et le détail au survol. La vue est jouée telle qu'elle est.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import type { Cuisine } from "../src/box.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE } from "../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, type Jouee, jouerLaVue, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

const CUISINE: Cuisine = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade" };
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const A = "2026-10-16T10:00:00.000Z";
// Ce qui ne s'écrit jamais à plat sur ces écrans.
const TECHNIQUE = /usage|exit code|code de sortie|`/;

async function ouvrir(reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this computer" }],
    ...reponses,
  });
  (vue.element("projets").children[1] ?? assert.fail("pas de case")).click();
  await repos();
  return vue;
}
const survols = (ou: Faux) => ou.dessous("button").filter(({ className }) => className === "aide").map(({ ariaLabel }) => ariaLabel);
// Le texte posé à plat : celui des éléments, sans le contenu d'un `pre` ni le nom accessible d'une aide.
const aPlat = (ou: Faux) => ou.textContent;

describe("Settings n'a plus de page Manager (#1700)", () => {
  // Un seul interrupteur pour tout le projet (#1406), en tête de l'espace : sa confirmation, qui dit son
  // prix en une ligne, est éprouvée là (interrupteur-projet.test.ts).
  test("ni page ni bouton du manager dans Settings : le manager suit l'interrupteur du projet", async () => {
    const vue = await ouvrir({ confirmer: (_: string, id: string) => confirmationDe(id, PARADE, { sans: "pas lus" }, CUISINE) });
    await ouvrirLecture(vue, "Settings");
    assert.throws(() => vue.element("manager"), /aucun élément « manager »/);
    assert.deepEqual(vue.element("etat").dessous("button").filter(({ textContent }) => /manager|^(?:on|off)(?:…)?$/i.test(textContent)), []);
    assert.deepEqual(vue.element("interrupteur-projet").dessous("button").filter(({ className }) => className === "bascule").length, 1);
  });
});
