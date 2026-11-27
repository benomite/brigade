// Les tokens perdus de la page des coûts de l'app (vue/cost/lost.js, #911, #1022) : le total des essais rouges et des
// cooks interrompus que `station` liste, la liste derrière le chiffre, et « not communicated » quand la
// box ne dit rien. Les cinq tickets les plus chers de la même page (vue/cost/expensive.js, #910, #1022) : triés du plus cher
// au moins cher, coupés à cinq, chacun avec son numéro, son titre, ses tokens et ses essais, « not communicated » pour ce
// que la box ne dit pas, et un clic qui ouvre sa fiche. Les modules sont lus seuls, puis la vue jouée telle qu'elle est
// (helpers/false-vue.ts). Ces blocs ne sont plus sur la page d'un projet (#1699) : ils étaient sous Settings →
// Reliability, à côté de la fiabilité de ses cooks (#1022) ; quand la fiabilité est devenue une section de l'onglet
// Cooks, ils n'ont pas suivi — un second chiffre de tokens perdus, compté autrement, aurait côtoyé celui de la
// fiabilité. Le projet n'a toujours pas d'onglet Cost.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../src/power-up.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE, type Project } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNER } from "../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../src/actions.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import { HOW_MANY, cooksOf, moreExpensive, setExpensive } from "../../src/vue/cost/expensive.js";
import { INTERRUPTED, lost, lostOf, setLost, RED } from "../../src/vue/cost/lost.js";
import { NOT_COMMUNICATED } from "../../src/vue/cost/head.js";
import { Fake, type Played, playTheVue, openTheCosts, openTab, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };
const A = "2026-10-17T10:00:00.000Z";
const n = (figures: string) => figures.replaceAll(" ", " ");

// Un cook de « derniers cooks », mot pour mot (runtime/src/montrer-station.ts) ; sans tokens, un cook qui n'a rien déclaré.
const cook = (ticket: number, end: string, tokens?: string) =>
  `  2026-10-13T09:48:02.000Z  #${ticket}  r-${ticket}  sonnet / medium  ${end}  ${tokens === undefined ? "" : `31 tours · ${n(tokens)} tokens · 9,2 min  `}https://github.com/chef/p/pull/${ticket}`;
const finished = (ticket: number, tokens?: string) => cook(ticket, "fini", tokens);
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
const readOne = (project: string, text: string) => ({ projet: project, demande: 0, a: A, sorties: [{ commande: "station", texte: text }] });
const PARADE = { nom: "parade" };
const CANTINE = { nom: "cantine" };
// La vue jouée, ces projets ouverts dans la barre.
const play = (projects: Project[]) =>
  playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: projects }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
  });

describe("les cooks perdus que `station` liste", () => {
  test("un essai rouge ou un cook interrompu ; pas un cook fini, ni le cook en cours, ni le bloc suivant", () => {
    const text = station(cook(30, "fini", "412 806"), cook(7, "échoué", "641 207"), cook(14, "interrompu (runtime arrêté)", "88 530"), cook(5, "arrêté par « stop »"), cook(6, "refusé par le modèle", "1 000"));
    assert.deepEqual(lostOf(text)?.map(({ ticket, tokens, cause }) => [ticket, tokens, cause]), [
      [7, 641_207, RED],
      [14, 88_530, INTERRUPTED],
      [5, null, INTERRUPTED],
      [6, 1_000, RED],
    ]);
  });

  test("« aucun » est zéro cook perdu ; sans le bloc, la box ne communique rien", () => {
    assert.deepEqual(lostOf("derniers cooks        aucun\nconsommé  rien"), []);
    assert.equal(lostOf("station  x"), null);
  });
});

describe("le total perdu", () => {
  test("la somme des tokens des cooks perdus, tous projets confondus — les cooks finis n'y comptent pas", () => {
    const readings = new Map([
      ["parade", readOne("parade", station(cook(30, "fini", "412 806"), cook(7, "échoué", "641 207"), cook(14, "86 (quota épuisé)", "88 530")))],
      ["cantine", readOne("cantine", station(cook(3, "échoué", "142 096")))],
    ]);
    const { total, minimum, partiel: partial, lignes: lines } = lost([PARADE, CANTINE], readings);
    assert.equal(total, 641_207 + 88_530 + 142_096);
    assert.deepEqual([minimum, partial], [false, false]);
    assert.deepEqual(lines.map(({ projet: project, ticket }) => [project.nom, ticket]), [["parade", 7], ["cantine", 3], ["parade", 14]]);
  });

  test("zéro quand la box liste ses cooks et qu'aucun n'est perdu", () => {
    assert.equal(lost([PARADE], new Map([["parade", readOne("parade", station(cook(30, "fini", "10")))]])).total, 0);
  });

  test("un cook perdu sans tokens rend le total minimal ; une box muette le rend partiel", () => {
    const readings = new Map([
      ["parade", readOne("parade", station(cook(7, "échoué", "100"), cook(8, "échoué")))],
      ["cantine", readOne("cantine", "station  x")],
    ]);
    const { total, minimum, partiel: partial } = lost([PARADE, CANTINE], readings);
    assert.deepEqual([total, minimum, partial], [100, true, true]);
  });

  test("aucune box ne communique : null ; une box pas encore lue : undefined", () => {
    const error = { projet: "parade", demande: 0, a: A, erreur: "refused", atteinte: false, cas: null } as any;
    assert.equal(lost([PARADE], new Map([["parade", error]])).total, null);
    assert.equal(lost([PARADE], new Map()).total, undefined);
  });
});

describe("le bloc", () => {
  const readings = new Map([["parade", readOne("parade", station(cook(7, "échoué", "641 207"), cook(14, "interrompu (runtime arrêté)", "88 530")))]]);
  const pose = (opened: boolean, toggle = () => {}) => setLost(doc, [PARADE], readings, (_project, ticket) => (ticket === 7 ? "Le titre" : undefined), opened, toggle);

  test("replié : le chiffre seul, sans liste ; un clic le bascule", () => {
    let clics = 0;
    const block = pose(false, () => clics++);
    const figure = block.dessous("button")[0] ?? assert.fail("pas de chiffre");
    assert.equal(figure.textContent, "729,737");
    assert.equal(figure.ariaExpanded, "false");
    assert.equal(block.dessous("li").length, 0);
    figure.click();
    assert.equal(clics, 1);
  });

  test("déployé : une ligne par cook — ticket, titre, tokens, cause — et un bouton de fermeture", () => {
    let clics = 0;
    const block = pose(true, () => clics++);
    assert.equal(block.dessous("button")[0]?.ariaExpanded, "true");
    assert.deepEqual(block.dessous("li").map((l: Fake) => l.dessous("span").map((s: Fake) => s.textContent).slice(1)), [
      ["#7", "Le titre", "641,207", RED],
      ["#14", NOT_COMMUNICATED, "88,530", INTERRUPTED],
    ]);
    const close = block.dessous("button").at(-1) ?? assert.fail("pas de bouton de fermeture");
    assert.equal(close.textContent, "close");
    close.click();
    assert.equal(clics, 1);
  });

  test("donnée absente : « not communicated », et aucun bouton ni liste, même déployé", () => {
    const block = setLost(doc, [PARADE], new Map([["parade", readOne("parade", "station  x")]]), () => undefined, true, () => {});
    assert.deepEqual(block.dessous("p").map((p: Fake) => p.textContent), [NOT_COMMUNICATED]);
    assert.equal(block.dessous("button").length, 0);
    assert.equal(block.dessous("li").length, 0);
  });
});

describe("ce que `station` dit de chaque cook", () => {
  test("les cooks finis, leur ticket et leurs tokens — pas le cook en cours, ni le bloc suivant", () => {
    assert.deepEqual(cooksOf(station(finished(30, "412 806"), finished(12), finished(30, "1 000"))), [
      { ticket: 30, tokens: 412_806 },
      { ticket: 12, tokens: null },
      { ticket: 30, tokens: 1_000 },
    ]);
    assert.deepEqual(cooksOf("station  x"), []);
  });
});

describe("les tickets les plus chers", () => {
  test("du plus cher au moins cher, coupés à cinq — un ticket somme ses essais", () => {
    const parade = station(finished(1, "100"), finished(2, "900"), finished(3, "300"), finished(4, "700"), finished(5, "500"), finished(6, "200"), finished(2, "50"));
    const expensive = moreExpensive([PARADE], new Map([["parade", readOne("parade", parade)]]));
    assert.equal(HOW_MANY, 5);
    assert.deepEqual(expensive.map(({ ticket, tokens, essais: trials }) => [ticket, tokens, trials]), [
      [2, 950, 2],
      [4, 700, 1],
      [5, 500, 1],
      [3, 300, 1],
      [6, 200, 1],
    ]);
  });

  test("tous projets confondus ; un coût que la box ne dit pas passe après les autres, et un cook muet rend la somme minimale", () => {
    const readings = new Map([
      ["parade", readOne("parade", station(finished(7), finished(8, "10")))],
      ["cantine", readOne("cantine", station(finished(9, "5"), finished(9)))],
    ]);
    const expensive = moreExpensive([PARADE, CANTINE], readings);
    assert.deepEqual(expensive.map(({ projet: project, ticket, tokens, minimum }) => [project.nom, ticket, tokens, minimum]), [
      ["parade", 8, 10, false],
      ["cantine", 9, 5, true],
      ["parade", 7, null, true],
    ]);
  });

  test("une box injoignable ou sans cook ne donne aucun ticket", () => {
    const readings = new Map<string, any>([
      ["parade", { projet: "parade", demande: 0, a: A, erreur: "spawn node ENOENT", atteinte: false, cas: null }],
      ["cantine", readOne("cantine", station())],
    ]);
    assert.deepEqual(moreExpensive([PARADE, CANTINE], readings), []);
  });

  test("le bloc : une ligne par ticket, numéro, titre, tokens, essais ; « not communicated » pour ce qui manque ; un clic ouvre la fiche", () => {
    const readings = new Map([["parade", readOne("parade", station(finished(30, "412 806"), finished(30, "1 000"), finished(12)))]]);
    const openOnes: [string, number][] = [];
    const block = setExpensive(doc, [PARADE], readings, (_project, ticket) => (ticket === 30 ? "Le titre" : undefined), (project, ticket) => openOnes.push([project, ticket]));
    const lines = block.dessous("button");
    assert.deepEqual(lines.map((l: Fake) => l.dessous("span").map((s: Fake) => s.textContent).slice(1)), [
      ["#30", "Le titre", "413,806", "2 attempts"],
      ["#12", NOT_COMMUNICATED, NOT_COMMUNICATED, "1 attempt"],
    ]);
    lines[0]?.click();
    assert.deepEqual(openOnes, [["parade", 30]]);
  });
});
describe("la page des coûts de l'app jouée (#1022)", () => {
  const PROJECT: Project = { nom: "parade", dossier: "/tmp/parade" };

  async function openThePage(): Promise<Played> {
    const vue = await play([PROJECT]);
    await openTheCosts(vue);
    return vue;
  }

  test("un clic sur le chiffre déploie la liste, un second la replie ; le bouton de fermeture aussi", async () => {
    const vue = await openThePage();
    const request = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { ...readOne("parade", station(cook(7, "échoué", "641 207"), cook(14, "interrompu (runtime arrêté)", "88 530"))), demande: request }, undefined);
    await repos();
    const lines = () => vue.element("cout").dessous("li").filter((l: Fake) => l.dessous("span").some((s: Fake) => s.className === "cause"));
    const figure = () => vue.element("cout").dessous("button").find((b: Fake) => b.className === "perdus-total") ?? assert.fail("pas de chiffre");
    assert.equal(figure().textContent, "729,737");
    assert.equal(lines().length, 0);
    figure().click();
    await repos();
    assert.equal(lines().length, 2);
    figure().click();
    await repos();
    assert.equal(lines().length, 0);
    figure().click();
    await repos();
    assert.equal(lines().length, 2);
    (vue.element("cout").dessous("button").find((b: Fake) => b.className === "perdus-fermer") ?? assert.fail("pas de fermeture")).click();
    await repos();
    assert.equal(lines().length, 0);
  });

  test("une ligne de la liste ouvre son projet, puis la fiche de son ticket", async () => {
    const vue = await openThePage();
    const request = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { ...readOne("parade", station(cook(7, "échoué", "641 207"))), demande: request }, undefined);
    await repos();
    (vue.element("cout").dessous("button").find((b: Fake) => b.className === "perdus-total") ?? assert.fail("pas de chiffre")).click();
    await repos();
    const line = vue.element("cout").dessous("button").find((b: Fake) => b.className === "ticket-perdu") ?? assert.fail("pas de ligne cliquable");
    assert.equal(line.title, "open the sheet of #7 · parade");
    line.click();
    await repos();
    assert.deepEqual(vue.dernier("espace"), ["parade"]);
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok(vue.element("fiche").dessous("span").some(({ textContent }) => textContent === "#7"));
  });

  test("cliquer une ligne ouvre son projet, puis la fiche de son ticket, par-dessus le rail", async () => {
    const vue = await openThePage();
    const request = vue.dernier("onglet")[2] as number;
    vue.dire("surContenu", { ...readOne("parade", station(finished(30, "412 806"), finished(12, "9"))), demande: request }, undefined);
    await repos();
    const lines = vue.element("cout").dessous("button").filter(({ className }) => className.startsWith("ticket-cher"));
    assert.equal(lines.length, 2);
    assert.equal(vue.element("fiche").hidden, true);
    lines[0]?.click();
    await repos();
    assert.deepEqual(vue.dernier("espace"), ["parade"]);
    assert.equal(vue.element("espace").textContent, "parade");
    assert.equal(vue.element("fiche").hidden, false);
    assert.ok(vue.element("fiche").dessous("span").some(({ textContent }) => textContent === "#30"));
  });
});

describe("le coût d'un projet n'est plus sur sa page (#1699)", () => {
  async function openStations(): Promise<Played> {
    const vue = await play([
      { nom: "parade", dossier: "/tmp/parade" },
      { nom: "cantine", dossier: "/tmp/cantine" },
    ]);
    (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
    await repos();
    await openTab(vue, "Stations");
    return vue;
  }

  test("le projet n'a plus d'onglet Cost : son seul onglet est Settings", async () => {
    const vue = await openStations();
    assert.deepEqual(vue.element("onglets-du-projet").children.map(({ textContent }) => textContent), ["Rail", "Stations", "Agents", "Settings"]);
  });

  test("Stations ne pose ni ses tokens perdus ni ses tickets les plus chers ; Settings non plus", async () => {
    const vue = await openStations();
    const poses = vue.poses();
    assert.deepEqual(poses.filter(({ className }) => /^(cout-du-projet|perdus-cout|chers-cout)$/.test(className)), []);
    assert.doesNotMatch(vue.element("rail").textContent, /cost of this project|most expensive|120,000/);
    // Settings — une seule page, sans sous-pages (#1700) — ne les pose pas non plus.
    (vue.element("onglets-du-projet").children.find(({ textContent }) => textContent === "Settings") ?? assert.fail("pas d'onglet Settings")).click();
    await repos();
    assert.deepEqual(vue.poses().filter(({ className }) => /^(cout-du-projet|perdus-cout|chers-cout)$/.test(className)), []);
  });
});
