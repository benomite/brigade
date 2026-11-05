// L'épreuve de l'épique 2484 (#2495) : chaque réglage que l'épique nomme se trouve en deux clics au plus depuis la page du
// projet, et aucun onglet ne mêle des réglages de niveaux différents — Settings : le projet seul. La vue est jouée telle
// qu'elle est, devant un faux document (aides/fausse-vue.ts), et le test marche le menu comme le chef.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { NIVEAUX } from "../../../src/vue/niveaux.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const PROJETS = [{ nom: PARADE, dossier: "/tmp/parade" }];
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});


async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this Mac" }] });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  return vue;
}

// Les onglets du menu, et le chemin de clics qui y mène depuis la page du projet : Rail est ouvert d'office.
type Onglet = "Rail" | "Stations" | "Health" | "Cooks" | "Settings";
const CHEMINS: Readonly<Record<Onglet, readonly ("Kitchen" | Onglet)[]>> = {
  Rail: [],
  Stations: ["Stations"],
  Health: ["Kitchen", "Health"],
  Cooks: ["Kitchen", "Cooks"],
  Settings: ["Settings"],
};
// Marche le menu comme le chef — un clic par entrée — et dit combien de clics il a fallu.
async function marcher(vue: Jouee, onglet: Onglet): Promise<number> {
  for (const etape of CHEMINS[onglet]) {
    if (etape === "Settings") {
      (vue.element("onglets-du-projet").children.find((entree) => entree.textContent === "Settings") ?? assert.fail("pas d'entrée Settings")).click();
      await repos();
    } else await ouvrirOnglet(vue, etape);
  }
  return CHEMINS[onglet].length;
}
// Settings est une seule page, en groupes : la fausse vue ne rejoue pas la place des éléments de index.html, le test la lit donc
// dans le fichier — chaque groupe (`<section class="groupe">`) avec son niveau (le titre `niveau-…`) et les `id` qu'il porte.
const GROUPES = (() => {
  const html = readFileSync(join(import.meta.dirname, "../../../src/vue/index.html"), "utf8");
  const settings = html.slice(html.indexOf('<section id="etat"'), html.indexOf('<p id="lu-onglet"'));
  return settings
    .split('<section id="')
    .slice(2)
    .map((morceau) => ({ niveau: /id="niveau-(\w+)"/.exec(morceau)?.[1] ?? "", ids: [...morceau.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id ?? "") }));
})();
// Ce que la page Settings montre, avec le niveau du groupe qui le porte.
const deSettings = (vue: Jouee): { niveau: string; pose: Faux }[] =>
  vue.element("etat").hidden ? [] : GROUPES.flatMap(({ niveau, ids }) => ids.map((id) => ({ niveau, pose: vue.element(id) }))).filter(({ pose }) => montre(pose));
// Les éléments où chercher un réglage dans un onglet.
const racines = (vue: Jouee, onglet: Onglet): Faux[] => (onglet === "Settings" ? deSettings(vue).map(({ pose }) => pose) : [vue.element("rail")]);

// Un élément se montre quand lui et tous ses parents le font.
function montre(pose: Faux): boolean {
  for (let p: Faux | null = pose; p !== null; p = p.parentElement) if (p.hidden) return false;
  return true;
}
const montres = (dans: Faux): Faux[] => [dans, ...dans.descendants()].filter(montre);

// Où un réglage nommé par l'épique se trouve : il porte soit son bloc (`data-bloc`), soit sa clé (`data-cle`, une ligne).
type Reglage = { nom: string; bloc?: string; cle?: string };
const REGLAGES: readonly Reglage[] = [
  { nom: "station settings", bloc: "reglages-station" },
  { nom: "local station settings", bloc: "station-locale" },
  { nom: "duration caps", bloc: "plafonds-duree" },
  { nom: "closer settings", bloc: "closer" },
  { nom: "specializations", bloc: "specialisations" },
  { nom: "notebook", bloc: "cahier" },
  { nom: "project colors", cle: "couleurs" },
  { nom: "project label", cle: "sigle" },
];
const estLe = (pose: Faux, { bloc, cle }: Reglage) => (bloc !== undefined && pose.dataset.bloc === bloc) || (cle !== undefined && pose.dataset.cle === cle);

// Les niveaux dits sur ce qui se montre dans un onglet : les étiquettes des lignes (`.niveau`) et celles des groupes.
const niveauxDits = (dans: Faux): string[] => montres(dans).flatMap((pose) => (pose.dataset.niveau !== undefined ? [pose.dataset.niveau] : []));
// Les réglages (lignes à clé) montrés dans un onglet, avec le niveau que la table donne à leur clé.
const niveauxDesCles = (dans: Faux): string[] => montres(dans).flatMap((pose) => (pose.dataset.cle !== undefined && NIVEAUX[pose.dataset.cle] !== undefined ? [NIVEAUX[pose.dataset.cle] as string] : []));
// Ce qui n'est pas du projet dans ce que montre une page : le niveau de son groupe, ou celui que disent ses étiquettes et ses clés.
const horsDuProjet = (poses: { niveau: string; pose: Faux }[]): string[] => [
  ...new Set(poses.flatMap(({ niveau, pose }) => [niveau === "you" || niveau === "machine" ? niveau : "project", ...niveauxDits(pose), ...niveauxDesCles(pose)])),
].filter((niveau) => niveau !== "project");

describe("l'épreuve de l'épique 2484 (#2495)", () => {
  test("chaque réglage de l'épique s'atteint en deux clics au plus depuis la page du projet", async () => {
    const vue = await ouvrir();
    const trouves = new Map<string, { onglet: Onglet; clics: number }>();
    for (const onglet of Object.keys(CHEMINS) as Onglet[]) {
      const clics = await marcher(vue, onglet);
      for (const reglage of REGLAGES) {
        if (!trouves.has(reglage.nom) && racines(vue, onglet).some((racine) => montres(racine).some((pose) => estLe(pose, reglage)))) trouves.set(reglage.nom, { onglet, clics });
      }
    }
    for (const { nom } of REGLAGES) {
      const trouve = trouves.get(nom) ?? assert.fail(`« ${nom} » n'est sur aucun onglet du menu`);
      assert.ok(trouve.clics <= 2, `« ${nom} » demande ${trouve.clics} clics (${trouve.onglet})`);
    }
  });

  test("Settings ne montre que le projet : ni réglage de la machine, ni préférence de toi", async () => {
    const vue = await ouvrir();
    await marcher(vue, "Settings");
    assert.deepEqual(horsDuProjet(deSettings(vue)), []);
  });

  test("Stations montre ses réglages avec leur niveau", async () => {
    const vue = await ouvrir();
    await marcher(vue, "Stations");
    for (const niveau of niveauxDits(vue.element("rail"))) assert.ok(["project", "machine", "you"].includes(niveau), `niveau inconnu « ${niveau} »`);
  });

  test("le garde-fou voit un réglage de la machine ou de toi posé dans Settings", () => {
    for (const [cle, niveau] of [["cooks", "machine"], ["couleurs", "you"]] as const) {
      const ligne = new Faux("div");
      ligne.dataset.cle = cle;
      assert.deepEqual(horsDuProjet([{ niveau: "project", pose: ligne }]), [niveau]);
      const etiquette = new Faux("span");
      etiquette.dataset.niveau = niveau;
      assert.deepEqual(horsDuProjet([{ niveau: "project", pose: etiquette }]), [niveau]);
      assert.deepEqual(horsDuProjet([{ niveau, pose: new Faux("div") }]), [niveau]);
    }
    // Ce qui est caché ne compte pas : une ligne sous un parent caché ne se montre pas.
    const cachee = new Faux("section");
    cachee.hidden = true;
    const ligne = new Faux("div");
    cachee.append(ligne);
    assert.equal(montre(ligne), false);
  });
});
