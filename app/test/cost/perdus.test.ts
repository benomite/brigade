// Les tokens perdus de la page des coûts de l'app (vue/cost/perdus.js, #911, #1022) : le total des essais rouges et des
// cooks interrompus que `station` liste, la liste derrière le chiffre, et « not communicated » quand la
// box ne dit rien. Les cinq tickets les plus chers de la même page (vue/cost/chers.js, #910, #1022) : triés du plus cher
// au moins cher, coupés à cinq, chacun avec son numéro, son titre, ses tokens et ses essais, « not communicated » pour ce
// que la box ne dit pas, et un clic qui ouvre sa fiche. Les modules sont lus seuls, puis la vue jouée telle qu'elle est
// (aides/fausse-vue.ts). Ces blocs ne sont plus sur la page d'un projet (#1699) : ils étaient sous Settings →
// Reliability, à côté de la fiabilité de ses cooks (#1022) ; quand la fiabilité est devenue une section de l'onglet
// Cooks, ils n'ont pas suivi — un second chiffre de tokens perdus, compté autrement, aurait côtoyé celui de la
// fiabilité. Le projet n'a toujours pas d'onglet Cost.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { COMBIEN, cooksDe, plusChers, poserChers } from "../../src/vue/cost/chers.js";
import { INTERROMPU, perdus, perdusDe, poserPerdus, ROUGE } from "../../src/vue/cost/perdus.js";
import { NON_COMMUNIQUE } from "../../src/vue/cost/tete.js";
import { Faux, type Jouee, jouerLaVue, ouvrirLesCouts, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-10-17T10:00:00.000Z";
const n = (chiffres: string) => chiffres.replaceAll(" ", " ");

// Un cook de « derniers cooks », mot pour mot (runtime/src/montrer-station.ts) ; sans tokens, un cook qui n'a rien déclaré.
const cook = (ticket: number, fin: string, tokens?: string) =>
  `  2026-10-13T09:48:02.000Z  #${ticket}  r-${ticket}  sonnet / medium  ${fin}  ${tokens === undefined ? "" : `31 tours · ${n(tokens)} tokens · 9,2 min  `}https://github.com/chef/p/pull/${ticket}`;
const fini = (ticket: number, tokens?: string) => cook(ticket, "fini", tokens);
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
// La vue jouée, ces projets ouverts dans la barre.
const jouer = (projets: Projet[]) =>
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
    const erreur = { projet: "parade", demande: 0, a: A, erreur: "refused", atteinte: false, cas: null } as any;
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

describe("ce que `station` dit de chaque cook", () => {
  test("les cooks finis, leur ticket et leurs tokens — pas le cook en cours, ni le bloc suivant", () => {
    assert.deepEqual(cooksDe(station(fini(30, "412 806"), fini(12), fini(30, "1 000"))), [
      { ticket: 30, tokens: 412_806 },
      { ticket: 12, tokens: null },
      { ticket: 30, tokens: 1_000 },
    ]);
    assert.deepEqual(cooksDe("station  x"), []);
  });
});

describe("les tickets les plus chers", () => {
  test("du plus cher au moins cher, coupés à cinq — un ticket somme ses essais", () => {
    const parade = station(fini(1, "100"), fini(2, "900"), fini(3, "300"), fini(4, "700"), fini(5, "500"), fini(6, "200"), fini(2, "50"));
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
      ["parade", lu("parade", station(fini(7), fini(8, "10")))],
      ["cantine", lu("cantine", station(fini(9, "5"), fini(9)))],
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
      ["parade", { projet: "parade", demande: 0, a: A, erreur: "spawn node ENOENT", atteinte: false, cas: null }],
      ["cantine", lu("cantine", station())],
    ]);
    assert.deepEqual(plusChers([PARADE, CANTINE], lectures), []);
  });

  test("le bloc : une ligne par ticket, numéro, titre, tokens, essais ; « not communicated » pour ce qui manque ; un clic ouvre la fiche", () => {
    const lectures = new Map([["parade", lu("parade", station(fini(30, "412 806"), fini(30, "1 000"), fini(12)))]]);
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
describe("la page des coûts de l'app jouée (#1022)", () => {
  const PROJET: Projet = { nom: "parade", dossier: "/tmp/parade" };

  async function ouvrirLaPage(): Promise<Jouee> {
    const vue = await jouer([PROJET]);
    await ouvrirLesCouts(vue);
    return vue;
  }

  test("un clic sur le chiffre déploie la liste, un second la replie ; le bouton de fermeture aussi", async () => {
    const vue = await ouvrirLaPage();
    const demande = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { ...lu("parade", station(cook(7, "échoué", "641 207"), cook(14, "interrompu (runtime arrêté)", "88 530"))), demande }, undefined);
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

  test("une ligne de la liste ouvre son projet, puis la fiche de son ticket", async () => {
    const vue = await ouvrirLaPage();
    const demande = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { ...lu("parade", station(cook(7, "échoué", "641 207"))), demande }, undefined);
    await repos();
    (vue.element("cout").dessous("button").find((b: Faux) => b.className === "perdus-total") ?? assert.fail("pas de chiffre")).click();
    await repos();
    const ligne = vue.element("cout").dessous("button").find((b: Faux) => b.className === "ticket-perdu") ?? assert.fail("pas de ligne cliquable");
    assert.equal(ligne.title, "open the sheet of #7 · parade");
    ligne.click();
    await repos();
    assert.deepEqual(vue.dernier("espace"), ["parade"]);
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok(vue.element("fiche").dessous("span").some(({ textContent }) => textContent === "#7"));
  });

  test("cliquer une ligne ouvre son projet, puis la fiche de son ticket, par-dessus le rail", async () => {
    const vue = await ouvrirLaPage();
    const demande = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { ...lu("parade", station(fini(30, "412 806"), fini(12, "9"))), demande }, undefined);
    await repos();
    const lignes = vue.element("cout").dessous("button").filter(({ className }) => className.startsWith("ticket-cher"));
    assert.equal(lignes.length, 2);
    assert.equal(vue.element("fiche").hidden, true);
    lignes[0]?.click();
    await repos();
    assert.deepEqual(vue.dernier("espace"), ["parade"]);
    assert.equal(vue.element("espace").textContent, "parade");
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok(vue.element("fiche").dessous("span").some(({ textContent }) => textContent === "#30"));
  });
});

describe("le coût d'un projet n'est plus sur sa page (#1699)", () => {
  async function ouvrirStations(): Promise<Jouee> {
    const vue = await jouer([
      { nom: "parade", dossier: "/tmp/parade" },
      { nom: "cantine", dossier: "/tmp/cantine" },
    ]);
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
    await repos();
    await ouvrirOnglet(vue, "Stations");
    return vue;
  }

  test("le projet n'a plus d'onglet Cost : son seul onglet est Settings", async () => {
    const vue = await ouvrirStations();
    assert.deepEqual(vue.element("onglets-du-projet").children.map(({ textContent }) => textContent), ["Rail", "Stations", "Settings"]);
  });

  test("Stations ne pose ni ses tokens perdus ni ses tickets les plus chers ; Settings non plus", async () => {
    const vue = await ouvrirStations();
    const poses = vue.poses();
    assert.deepEqual(poses.filter(({ className }) => /^(cout-du-projet|perdus-cout|chers-cout)$/.test(className)), []);
    assert.doesNotMatch(vue.element("rail").textContent, /cost of this project|most expensive|120,000/);
    // Settings — une seule page, sans sous-pages (#1700) — ne les pose pas non plus.
    (vue.element("onglets-du-projet").children.find(({ textContent }) => textContent === "Settings") ?? assert.fail("pas d'onglet Settings")).click();
    await repos();
    assert.deepEqual(vue.poses().filter(({ className }) => /^(cout-du-projet|perdus-cout|chers-cout)$/.test(className)), []);
  });
});
