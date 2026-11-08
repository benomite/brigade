// Les états se lisent sans lire : une forme et une couleur par état, selon la maquette — la
// pastille, la pilule, le point. Chaque forme se lit sans la couleur (niveaux de gris), et le
// libellé de chaque état reste dans le DOM. Rien n'est demandé au runtime : tout vient de ce que
// la box dit déjà (faits). La vue est jouée devant un faux document.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, type Dessinable } from "../src/faits.ts";
import { entete } from "../src/fiche.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const A = "2026-10-13T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS, rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const REPONSES: Reponses & Required<Pick<Reponses, "demarrage">> = { demarrage, espace: () => [SECOND] };

async function ouvrir() {
  const vue = await jouerLaVue(REPONSES);
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const faits = (etat: string, ton: string | undefined, arretee = false, stations: { lignes: []; alerte: null } | null = { lignes: [], alerte: null }): Dessinable => ({
  projet: PARADE,
  demande: 0,
  a: A,
  tableau: {
    etat,
    ...(ton === undefined ? {} : { ton }),
    ...(stations === null ? {} : { stations }),
    arretee,
    apprentissage: { lecons: [], profils: [] },
    tick: "dernier tick il y a 12 s",
    compteurs: [{ libelle: "rail", nombre: 1 }],
    cooks: { enCours: [], vide: "aucun cook en cours" },
    evenement: "rien",
    rail: {
      colonnes: [
        { nom: "T'attend", ton: "rouge", compte: "1", cartes: [{ ticket: 12, etat: "servi", ton: "vert", titre: "Validation SIRET", fiche: entete({ titre: "Validation SIRET" }), ouvrable: true, attendu: true, attend: ["livraison verte, non mergée"], dit: [] }], vide: "aucun ticket" },
      ],
      hors: [],
      attendLu: A,
    },
  },
});

// Les règles de la feuille qui portent ce sélecteur, déclarations comprises.
const regle = (selecteur: string): Map<string, string> => {
  const trouvees = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, tete = ""]) => tete.split(",").map((s) => s.trim().replace(/\s+/g, " ")).includes(selecteur));
  assert.ok(trouvees.length > 0, `aucune règle pour ${selecteur}`);
  return new Map(trouvees.flatMap(([, , corps = ""]) => corps.split(";").map((d) => d.trim()).filter(Boolean).map((d): [string, string] => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()])));
};
// La silhouette qu'une règle donne à la forme d'une pastille : rond, losange, carré, anneau, triangle.
const silhouette = (declarations: Map<string, string>) => `${declarations.get("border-radius") ?? ""}|${declarations.get("transform") ?? ""}|${declarations.get("clip-path") ?? ""}|${declarations.get("background") ?? ""}`;

describe("la cuisine : une pastille à forme, et son libellé", () => {
  test("cuisine ouverte : disque vert ; arrêtée : carré rouge — sur la pastille de la barre", async () => {
    const vue = await ouvrir();
    const numero = () => vue.dernier("faits")[0] as number;
    const barre = () => vue.element("projets").dessous("span").find((s) => s.className === "pastille") ?? assert.fail("pas de pastille dans la barre");
    vue.dire("surFaits", { ...faits("ouverte", "vert"), demande: numero() });
    assert.deepEqual([barre().dataset.ton, barre().dataset.forme], ["vert", "disque"]);

    vue.dire("surFaits", { ...faits("arrêtée", "rouge", true), demande: numero() });
    assert.deepEqual([barre().dataset.ton, barre().dataset.forme], ["rouge", "carre"]);
  });
});

describe("un ticket qui t'attend", () => {
  test("sa pilule dit « t'attend » en mots, avec la forme de la colonne — et l'état du ticket garde la sienne", async () => {
    const vue = await ouvrir();
    // Le rail est au centre de l'espace : aucun onglet n'est à ouvrir pour le lire.
    vue.dire("surFaits", { ...faits("ouverte", "vert"), demande: vue.dernier("faits")[0] as number });

    const pilules = vue.element("rail").dessous("span").filter((s) => s.className.split(" ").includes("etat-ticket"));
    assert.deepEqual(
      pilules.map((s) => [s.textContent, s.dataset.ton, s.dataset.forme, s.className.split(" ").includes("attendu")]),
      [["servi", "vert", "disque", false], ["awaiting you", "rouge", "carre", true]],
    );
    const [colonne] = vue.element("rail").dessous("section");
    assert.deepEqual([colonne?.dataset.ton, colonne?.dataset.forme], ["rouge", "carre"]);
  });
});

describe("la forme se lit sans la couleur", () => {
  test("chaque forme de pastille a sa règle, et aucune n'en copie une autre", () => {
    const formes = ["losange", "carre", "anneau", "triangle", "pause"].map((forme) => silhouette(regle(`.pastille[data-forme="${forme}"]`)));
    // Le disque est la pastille nue : cercle plein.
    formes.push(silhouette(regle(".pastille")));
    assert.equal(new Set(formes).size, 6, formes.join(" ; "));
  });

  test("la vue ne pose une forme que d'un ton de la liste fermée, et ne la déduit de rien d'autre", () => {
    const source = readFileSync(join(VUE, "vue.js"), "utf8");
    assert.match(source, /FORMES = \{ vert: "disque", jaune: "losange", rouge: "carre", bleu: "triangle", gris: "anneau", orange: "pause" \}/);
  });
});
