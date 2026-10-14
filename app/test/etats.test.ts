// Les états se lisent sans lire : une forme et une couleur par état, selon la maquette — la
// pastille, la pilule, le point. Chaque forme se lit sans la couleur (niveaux de gris), et le
// libellé de chaque état reste dans le DOM. Rien n'est demandé au runtime : tout vient de ce que
// la box dit déjà (faits, status, manager, grant). La vue est jouée devant un faux document.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, type Dessinable } from "../src/faits.ts";
import { entete } from "../src/fiche.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS, type Vu as VuDesGrants } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER, type Vu as VuDuManager } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { type Faux, jouerLaVue, type Reponses, ouvrirLecture, repos } from "./aides/fausse-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const css = readFileSync(join(VUE, "vue.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const A = "2026-10-13T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS, rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
const faits = (etat: string, ton: string | undefined, arretee = false): Dessinable => ({
  projet: PARADE,
  demande: 0,
  a: A,
  tableau: {
    etat,
    ...(ton === undefined ? {} : { ton }),
    arretee,
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
    version: { etat: "à jour", ton: "vert", faits: [{ libelle: "en service", valeur: "3b0177804de6", exact: true }], lignes: ["rien n'attend d'être mis en service"], gestes: [] },
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

describe("les trois états de pilotage ont chacun leur forme et leur couleur", () => {
  async function entete(lecture: object) {
    const vue = await ouvrir();
    vue.dire("surLecture", { projet: PARADE, demande: vue.dernier("regarder")[1] as number, a: A, ...lecture } as never, { projet: PARADE, pages: [], illisibles: [], empeche: [] });
    return vue.element("lu");
  }

  test("pilotable, joignable mais plus pilotable, pas joignable : trois états, trois formes", async () => {
    const pilotable = await entete({ sorties: [{ commande: "status", texte: "ok" }] });
    const plus = await entete({ erreur: "x", atteinte: true, cas: null });
    const pas = await entete({ erreur: "x", atteinte: false, cas: "ssh-en-echec" });

    assert.deepEqual([pilotable.dataset.etat, plus.dataset.etat, pas.dataset.etat], ["pilotable", "plus-pilotable", "pas-joint"]);
    // Le libellé est toujours dans le DOM.
    assert.match(pilotable.textContent, /^read at /);
    assert.match(plus.textContent, /^REACHED, BUT NO LONGER/);
    assert.match(pas.textContent, /^NOT REACHED/);

    // Trois formes distinctes, posées par la vue, et que la feuille dessine chacune à sa façon.
    const formes = [pilotable, plus, pas].map((tete) => tete.dataset.forme ?? "");
    assert.deepEqual(formes, ["disque", "losange", "carre"]);
    assert.equal(new Set(formes.map((forme) => silhouette(regle(`#lu[data-forme="${forme}"]::before`)))).size, 3, "deux formes se dessinent pareil");
    // Et trois couleurs.
    assert.deepEqual([pilotable, plus, pas].map((tete) => tete.dataset.ton), ["vert", "jaune", "rouge"]);
  });

  test("les cas « joint mais » partagent la forme de « plus pilotable » : ni disque, ni carré", async () => {
    const inconnu = await entete({ erreur: "x", atteinte: true, cas: "projet-inconnu" });
    assert.deepEqual([inconnu.dataset.etat, inconnu.dataset.ton, inconnu.dataset.forme], ["inconnu", "jaune", "losange"]);
    assert.match(inconnu.textContent, /^REACHED, BUT UNKNOWN TO THE BOX/);
  });
});

describe("la cuisine, le grant, le manager : une pastille à forme, et son libellé", () => {
  test("cuisine ouverte : disque vert ; arrêtée : carré rouge — le mot est dans la pilule", async () => {
    const vue = await ouvrir();
    const numero = () => vue.dernier("faits")[0] as number;
    vue.dire("surFaits", { ...faits("ouverte", "vert"), demande: numero() });
    const pilule = (vue.element("carte").dessous("span").find((s) => s.className === "pilule") ?? assert.fail("pas de pilule")) as Faux;
    const [point] = pilule.dessous("span");
    assert.equal(pilule.textContent, "ouverte");
    assert.deepEqual([point?.dataset.ton, point?.dataset.forme], ["vert", "disque"]);

    vue.dire("surFaits", { ...faits("arrêtée", "rouge", true), demande: numero() });
    const arretee = (vue.element("carte").dessous("span").find((s) => s.className === "pilule") ?? assert.fail("pas de pilule")) as Faux;
    assert.equal(arretee.textContent, "arrêtée");
    assert.deepEqual([arretee.dessous("span")[0]?.dataset.ton, arretee.dessous("span")[0]?.dataset.forme], ["rouge", "carre"]);
    // La pastille de la barre prend la même forme.
    const barre = vue.element("projets").dessous("span").find((s) => s.className === "pastille") ?? assert.fail("pas de pastille dans la barre");
    assert.deepEqual([barre.dataset.ton, barre.dataset.forme], ["rouge", "carre"]);
  });

  test("un mot hors des listes fermées garde la pastille vide : ni ton, ni forme, et le texte nu", async () => {
    const vue = await ouvrir();
    vue.dire("surFaits", { ...faits("un mot inconnu", undefined), demande: vue.dernier("faits")[0] as number });
    const pilule = vue.element("carte").dessous("span").find((s) => s.className === "pilule") ?? assert.fail("pas de pilule");
    assert.equal(pilule.textContent, "un mot inconnu");
    assert.deepEqual([pilule.dessous("span")[0]?.dataset.ton, pilule.dessous("span")[0]?.dataset.forme], [undefined, undefined]);
  });

  test("grant actif ; grant éteint : deux formes, deux libellés", async () => {
    const vue = await ouvrir();
    await ouvrirLecture(vue, "Grants");
    const numero = vue.dernier("onglet")[2] as number;
    const vide = { lignes: [], illisibles: [] };
    const grants: VuDesGrants = {
      projet: PARADE,
      demande: numero,
      a: A,
      grants: [
        { action: "merge", commandable: true, actif: true, mot: "ACTIF", ton: "vert", limites: [], dit: "", usages: vide },
        { action: "fire", commandable: true, actif: false, mot: "ABSENT", ton: "gris", limites: [], dit: "jamais posé", usages: vide },
      ],
      interdits: vide,
      illisibles: [],
    };
    vue.dire("surContenu", { projet: PARADE, demande: numero, a: A, sorties: [{ commande: "x", texte: "" }] }, undefined, grants);
    const poses = vue.element("grants").dessous("p").filter((p) => p.className === "interrupteur");
    const lu = poses.map((p) => ({ mots: p.textContent, forme: p.dessous("span").find((s) => s.className === "pastille")?.dataset.forme }));
    assert.deepEqual(lu, [{ mots: "grant mergeACTIF", forme: "disque" }, { mots: "grant fireABSENT", forme: "anneau" }]);
  });

  test("manager allumé ; éteint", async () => {
    const vue = await ouvrir();
    await ouvrirLecture(vue, "Manager");
    const numero = vue.dernier("onglet")[2] as number;
    const vide = { lignes: [], illisibles: [] };
    for (const [allume, mot, ton, forme] of [[true, "ALLUMÉ", "vert", "disque"], [false, "ÉTEINT", "gris", "anneau"]] as const) {
      const manager: VuDuManager = { projet: PARADE, demande: numero, a: A, interrupteur: { allume, mot, ton, dit: "…" } as VuDuManager extends { interrupteur: infer I } ? I : never, decisions: vide, ecartees: vide };
      vue.dire("surContenu", { projet: PARADE, demande: numero, a: A, sorties: [{ commande: "x", texte: "" }] }, manager, undefined);
      const [tete] = vue.element("manager").dessous("p").filter((p) => p.className === "interrupteur");
      assert.equal(tete?.textContent, mot);
      assert.equal(tete?.dessous("span")[0]?.dataset.forme, forme);
    }
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
    const formes = ["losange", "carre", "anneau", "triangle"].map((forme) => silhouette(regle(`.pastille[data-forme="${forme}"]`)));
    // Le disque est la pastille nue : cercle plein.
    formes.push(silhouette(regle(".pastille")));
    assert.equal(new Set(formes).size, 5, formes.join(" ; "));
  });

  test("la vue ne pose une forme que d'un ton de la liste fermée, et ne la déduit de rien d'autre", () => {
    const source = readFileSync(join(VUE, "vue.js"), "utf8");
    assert.match(source, /FORMES = \{ vert: "disque", jaune: "losange", rouge: "carre", bleu: "triangle", gris: "anneau" \}/);
  });
});
