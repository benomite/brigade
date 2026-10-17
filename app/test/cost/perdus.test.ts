// Les tokens perdus de l'onglet Cost (vue/cost/perdus.js, #911) : le total des essais rouges et des
// cooks interrompus que `station` liste, la liste derrière le chiffre, et « not communicated » quand la
// box ne dit rien. Le module est lu seul, puis la vue jouée telle qu'elle est (aides/fausse-vue.ts).
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
import { INTERROMPU, perdus, perdusDe, poserPerdus, ROUGE } from "../../src/vue/cost/perdus.js";
import { NON_COMMUNIQUE } from "../../src/vue/cost/tete.js";
import { Faux, type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-10-17T10:00:00.000Z";
const n = (chiffres: string) => chiffres.replaceAll(" ", " ");

// Un cook de « derniers cooks », mot pour mot (runtime/src/montrer-station.ts) ; sans tokens, un cook qui n'a rien déclaré.
const cook = (ticket: number, fin: string, tokens?: string) =>
  `  2026-10-13T09:48:02.000Z  #${ticket}  r-${ticket}  sonnet / medium  ${fin}  ${tokens === undefined ? "" : `31 tours · ${n(tokens)} tokens · 9,2 min  `}https://github.com/chef/p/pull/${ticket}`;
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

describe("les cooks perdus que `station` liste", () => {
  test("un essai rouge ou un cook interrompu ; pas un cook fini, ni le cook en cours, ni le bloc suivant", () => {
    const texte = station(cook(30, "fini", "412 806"), cook(7, "échoué", "641 207"), cook(14, "interrompu (runtime arrêté)", "88 530"), cook(5, "arrêté par « stop »"), cook(6, "refusé par le modèle", "1 000"));
    assert.deepEqual(perdusDe(texte)?.map(({ ticket, tokens, cause }) => [ticket, tokens, cause]), [
      [7, 641_207, ROUGE],
      [14, 88_530, INTERROMPU],
      [5, null, INTERROMPU],
      [6, 1_000, ROUGE],
    ]);
  });

  test("« aucun » est zéro cook perdu ; sans le bloc, la box ne communique rien", () => {
    assert.deepEqual(perdusDe("derniers cooks        aucun\nconsommé  rien"), []);
    assert.equal(perdusDe("station  x"), null);
  });
});

describe("le total perdu", () => {
  test("la somme des tokens des cooks perdus, tous projets confondus — les cooks finis n'y comptent pas", () => {
    const lectures = new Map([
      ["parade", lu("parade", station(cook(30, "fini", "412 806"), cook(7, "échoué", "641 207"), cook(14, "86 (quota épuisé)", "88 530")))],
      ["cantine", lu("cantine", station(cook(3, "échoué", "142 096")))],
    ]);
    const { total, minimum, partiel, lignes } = perdus([PARADE, CANTINE], lectures);
    assert.equal(total, 641_207 + 88_530 + 142_096);
    assert.deepEqual([minimum, partiel], [false, false]);
    assert.deepEqual(lignes.map(({ projet, ticket }) => [projet.nom, ticket]), [["parade", 7], ["cantine", 3], ["parade", 14]]);
  });

  test("zéro quand la box liste ses cooks et qu'aucun n'est perdu", () => {
    assert.equal(perdus([PARADE], new Map([["parade", lu("parade", station(cook(30, "fini", "10")))]])).total, 0);
  });

  test("un cook perdu sans tokens rend le total minimal ; une box muette le rend partiel", () => {
    const lectures = new Map([
      ["parade", lu("parade", station(cook(7, "échoué", "100"), cook(8, "échoué")))],
      ["cantine", lu("cantine", "station  x")],
    ]);
    const { total, minimum, partiel } = perdus([PARADE, CANTINE], lectures);
    assert.deepEqual([total, minimum, partiel], [100, true, true]);
  });

  test("aucune box ne communique : null ; une box pas encore lue : undefined", () => {
    const erreur = { projet: "parade", demande: 0, a: A, erreur: "ssh: refused", atteinte: false, cas: "ssh-en-echec" } as any;
    assert.equal(perdus([PARADE], new Map([["parade", erreur]])).total, null);
    assert.equal(perdus([PARADE], new Map()).total, undefined);
  });
});

describe("le bloc", () => {
  const lectures = new Map([["parade", lu("parade", station(cook(7, "échoué", "641 207"), cook(14, "interrompu (runtime arrêté)", "88 530")))]]);
  const pose = (ouvert: boolean, bascule = () => {}) => poserPerdus(doc, [PARADE], lectures, (_projet, ticket) => (ticket === 7 ? "Le titre" : undefined), ouvert, bascule);

  test("replié : le chiffre seul, sans liste ; un clic le bascule", () => {
    let clics = 0;
    const bloc = pose(false, () => clics++);
    const chiffre = bloc.dessous("button")[0] ?? assert.fail("pas de chiffre");
    assert.equal(chiffre.textContent, "729,737");
    assert.equal(chiffre.ariaExpanded, "false");
    assert.equal(bloc.dessous("li").length, 0);
    chiffre.click();
    assert.equal(clics, 1);
  });

  test("déployé : une ligne par cook — ticket, titre, tokens, cause — et un bouton de fermeture", () => {
    let clics = 0;
    const bloc = pose(true, () => clics++);
    assert.equal(bloc.dessous("button")[0]?.ariaExpanded, "true");
    assert.deepEqual(bloc.dessous("li").map((l: Faux) => l.dessous("span").map((s: Faux) => s.textContent).slice(1)), [
      ["#7", "Le titre", "641,207", ROUGE],
      ["#14", NON_COMMUNIQUE, "88,530", INTERROMPU],
    ]);
    const fermer = bloc.dessous("button").at(-1) ?? assert.fail("pas de bouton de fermeture");
    assert.equal(fermer.textContent, "close");
    fermer.click();
    assert.equal(clics, 1);
  });

  test("donnée absente : « not communicated », et aucun bouton ni liste, même déployé", () => {
    const bloc = poserPerdus(doc, [PARADE], new Map([["parade", lu("parade", "station  x")]]), () => undefined, true, () => {});
    assert.deepEqual(bloc.dessous("p").map((p: Faux) => p.textContent), [NON_COMMUNIQUE]);
    assert.equal(bloc.dessous("button").length, 0);
    assert.equal(bloc.dessous("li").length, 0);
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

  test("un clic sur le chiffre déploie la liste, un second la replie ; le bouton de fermeture aussi", async () => {
    const vue = await ouvrirCost();
    const demande = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { ...lu("parade", station(cook(7, "échoué", "641 207"), cook(14, "interrompu (runtime arrêté)", "88 530"))), demande }, undefined, undefined);
    await repos();
    const lignes = () => vue.element("cout").dessous("li").filter((l: Faux) => l.dessous("span").some((s: Faux) => s.className === "cause"));
    const chiffre = () => vue.element("cout").dessous("button").find((b: Faux) => b.className === "perdus-total") ?? assert.fail("pas de chiffre");
    assert.equal(chiffre().textContent, "729,737");
    assert.equal(lignes().length, 0);
    chiffre().click();
    await repos();
    assert.equal(lignes().length, 2);
    chiffre().click();
    await repos();
    assert.equal(lignes().length, 0);
    chiffre().click();
    await repos();
    assert.equal(lignes().length, 2);
    (vue.element("cout").dessous("button").find((b: Faux) => b.className === "perdus-fermer") ?? assert.fail("pas de fermeture")).click();
    await repos();
    assert.equal(lignes().length, 0);
  });
});
