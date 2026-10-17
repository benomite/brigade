// Les cinq tickets les plus chers de l'onglet Cost (vue/cost/chers.js, #910) : triés du plus cher au
// moins cher, coupés à cinq, chacun avec son numéro, son titre, ses tokens et ses essais, « not
// communicated » pour ce que la box ne dit pas, et un clic qui ouvre sa fiche. Le module est lu seul,
// puis la vue jouée telle qu'elle est (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { EFFORTS, MODELES } from "../../src/installation.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { COMBIEN, cooksDe, plusChers, poserChers } from "../../src/vue/cost/chers.js";
import { NON_COMMUNIQUE } from "../../src/vue/cost/tete.js";
import { Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-10-17T10:00:00.000Z";
const n = (chiffres: string) => chiffres.replaceAll(" ", " ");

// Un cook de « derniers cooks », mot pour mot (runtime/src/montrer-station.ts) ; sans tokens, un cook qui n'a rien déclaré.
const cook = (ticket: number, tokens?: string) =>
  `  2026-10-13T09:48:02.000Z  #${ticket}  r-${ticket}  sonnet / medium  fini  ${tokens === undefined ? "" : `31 tours · ${n(tokens)} tokens · 9,2 min  `}https://github.com/chef/p/pull/${ticket}`;
const station = (...cooks: string[]) =>
  [
    "station               box/claude — moteur claude, fournit : claude",
    "cooks en cours        1",
    "  #99  r-4f2a  opus / high  lancé le 2026-10-13T09:52:11.000Z  cook/99-4f2a",
    "derniers cooks        ",
    ...cooks,
    `consommé              en cours : 1 lancement · 4 tours · ${n("12 000")} tokens`,
    "décisions du chef     `station -- <geste> <valeur>` pour en poser une",
  ].join("\n");
const lu = (projet: string, texte: string) => ({ projet, demande: 0, a: A, sorties: [{ commande: "station", texte }] });
const PARADE = { nom: "parade" };
const CANTINE = { nom: "cantine" };

describe("ce que `station` dit de chaque cook", () => {
  test("les cooks finis, leur ticket et leurs tokens — pas le cook en cours, ni le bloc suivant", () => {
    assert.deepEqual(cooksDe(station(cook(30, "412 806"), cook(12), cook(30, "1 000"))), [
      { ticket: 30, tokens: 412_806 },
      { ticket: 12, tokens: null },
      { ticket: 30, tokens: 1_000 },
    ]);
    assert.deepEqual(cooksDe("station  x"), []);
  });
});

describe("les tickets les plus chers", () => {
  test("du plus cher au moins cher, coupés à cinq — un ticket somme ses essais", () => {
    const parade = station(cook(1, "100"), cook(2, "900"), cook(3, "300"), cook(4, "700"), cook(5, "500"), cook(6, "200"), cook(2, "50"));
    const chers = plusChers([PARADE], new Map([["parade", lu("parade", parade)]]));
    assert.equal(COMBIEN, 5);
    assert.deepEqual(chers.map(({ ticket, tokens, essais }) => [ticket, tokens, essais]), [
      [2, 950, 2],
      [4, 700, 1],
      [5, 500, 1],
      [3, 300, 1],
      [6, 200, 1],
    ]);
  });

  test("tous projets confondus ; un coût que la box ne dit pas passe après les autres, et un cook muet rend la somme minimale", () => {
    const lectures = new Map([
      ["parade", lu("parade", station(cook(7), cook(8, "10")))],
      ["cantine", lu("cantine", station(cook(9, "5"), cook(9)))],
    ]);
    const chers = plusChers([PARADE, CANTINE], lectures);
    assert.deepEqual(chers.map(({ projet, ticket, tokens, minimum }) => [projet.nom, ticket, tokens, minimum]), [
      ["parade", 8, 10, false],
      ["cantine", 9, 5, true],
      ["parade", 7, null, true],
    ]);
  });

  test("une box injoignable ou sans cook ne donne aucun ticket", () => {
    const lectures = new Map<string, any>([
      ["parade", { projet: "parade", demande: 0, a: A, erreur: "ssh: refused", atteinte: false, cas: "ssh-en-echec" }],
      ["cantine", lu("cantine", station())],
    ]);
    assert.deepEqual(plusChers([PARADE, CANTINE], lectures), []);
  });

  test("le bloc : une ligne par ticket, numéro, titre, tokens, essais ; « not communicated » pour ce qui manque ; un clic ouvre la fiche", () => {
    const lectures = new Map([["parade", lu("parade", station(cook(30, "412 806"), cook(30, "1 000"), cook(12)))]]);
    const ouverts: [string, number][] = [];
    const bloc = poserChers(doc, [PARADE], lectures, (_projet, ticket) => (ticket === 30 ? "Le titre" : undefined), (projet, ticket) => ouverts.push([projet, ticket]));
    const lignes = bloc.dessous("button");
    assert.deepEqual(lignes.map((l: Faux) => l.dessous("span").map((s: Faux) => s.textContent).slice(1)), [
      ["#30", "Le titre", "413,806", "2 attempts"],
      ["#12", NON_COMMUNIQUE, NON_COMMUNIQUE, "1 attempt"],
    ]);
    lignes[0]?.click();
    assert.deepEqual(ouverts, [["parade", 30]]);
  });
});

describe("l'onglet Cost joué", () => {
  const PROJET: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };

  async function ouvrirCost(): Promise<Jouee> {
    const vue = await jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET], hotes: ["box"] }),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        boutons: BOUTONS,
        gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
    await repos();
    (vue.element("onglets").children.find(({ textContent }) => textContent === "Cost") ?? assert.fail("pas d'onglet Cost")).click();
    await repos();
    return vue;
  }

  test("cliquer une ligne ouvre la fiche de son ticket, par-dessus l'onglet", async () => {
    const vue = await ouvrirCost();
    const demande = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { ...lu("parade", station(cook(30, "412 806"), cook(12, "9"))), demande }, undefined, undefined);
    await repos();
    const lignes = vue.element("cout").dessous("button");
    assert.equal(lignes.length, 2);
    assert.equal(vue.element("fiche").hidden, true);
    lignes[0]?.click();
    await repos();
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok(vue.element("fiche").dessous("span").some(({ textContent }) => textContent === "#30"));
  });
});
