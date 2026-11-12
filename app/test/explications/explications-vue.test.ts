// Les explications des mots de la cuisine (#3308) : la première fois que le chef rencontre rail, pass, cook, second, TODO ou
// WAITING, une ligne l'explique à côté du mot — la ligne même de docs/glossary.md. Vue, ou écartée, elle ne revient pas
// quand l'app se recharge, ni sur un autre appareil du chef : le registre est celui du runtime, par chef. Settings les
// remontre toutes. D'abord les textes contre le glossaire, puis la vue jouée entière (vue.js tel qu'il est, un faux pont
// devant un faux registre du runtime, partagé par deux sessions comme par deux appareils).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { mettreAPart } from "../../src/attend.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Terminal } from "../../src/terminaux.ts";
import type { MotExplique } from "../../src/vue/explications/explications-box.ts";
import { EXPLICATIONS, MOT_A_L_ECRAN, MOTS, MOTS_EXPLIQUES } from "../../src/vue/explications/explications.js";
import { type Faux, jouerLaVue, type Jouee, ouvrirLecture, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

// Le glossaire : la ligne de chaque mot, prise dans sa section — la cellule de son entrée, ou sa première phrase quand
// l'entrée en a plusieurs (cook, TODO : le PR le dit).
const GLOSSAIRE = readFileSync(join(import.meta.dirname, "..", "..", "..", "docs", "glossary.md"), "utf8");
/** La troisième cellule de la rangée de la section `section` dont la première cellule est `francais`. */
function entree(section: string, francais: string): string {
  const debut = GLOSSAIRE.indexOf(`\n## ${section}`);
  assert.ok(debut >= 0, section);
  const fin = GLOSSAIRE.indexOf("\n## ", debut + 1);
  const rangee = GLOSSAIRE.slice(debut, fin === -1 ? undefined : fin)
    .split("\n")
    .map((ligne) => ligne.split("|").map((cellule) => cellule.trim()))
    .find((cellules) => cellules[1] === francais);
  return rangee?.[3] ?? assert.fail(`pas d'entrée ${francais} en ${section}`);
}
const premierePhrase = (texte: string) => /^.*?\.(?=\s|$)/.exec(texte)?.[0] ?? assert.fail(texte);
const DU_GLOSSAIRE: Record<MotExplique, string> = {
  rail: entree("3.", "`rail`"),
  pass: entree("2.", "`en pass` / `Pass`"),
  cook: premierePhrase(entree("1.", "`cuisiner` / `cuisiné par`")),
  second: entree("2.", "`second`"),
  TODO: premierePhrase(entree("2.", "`attend` (bloc, ligne, pilule)")),
  WAITING: entree("2.", "`WAITING`"),
};

describe("les textes : la ligne du glossaire, mot pour mot", () => {
  test("chacun des six mots a son explication, identique à sa ligne de docs/glossary.md", () => {
    assert.deepEqual(Object.keys(EXPLICATIONS), [...MOTS_EXPLIQUES]);
    assert.deepEqual(MOTS_EXPLIQUES, ["rail", "pass", "cook", "second", "TODO", "WAITING"]);
    for (const mot of MOTS_EXPLIQUES) assert.equal(EXPLICATIONS[mot], DU_GLOSSAIRE[mot], mot);
  });
});

// La vue jouée entière.
const PARADE = "parade";
const A = "2026-11-11T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "", arrete: false };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const entreeDuRail = (ticket: number, etat: string) => ({ ticket, etat, titre: `Ticket ${ticket}`, url: `https://github.com/o/parade/issues/${ticket}`, activite: null, attente: null });
const FAITS: Faits = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 1, auTravail: 1, aLaPass: 1, attend: 0, livres24h: 1 },
  dernierEvenement: null,
  rail: [entreeDuRail(21, "en attente"), entreeDuRail(30, "pris"), entreeDuRail(31, "en pass"), entreeDuRail(12, "servi")],
  cooks: [],
  attend: [],
};
function dessinable() {
  const tenus = tenirFaits();
  const recue = tenus.recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  return tenus.attendre(mettreAPart({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "status", texte: "projet     parade\ncuisine    ouverte\n" }] })) ?? recue;
}

// Le registre du runtime, tel que `explanations` le tient pour ce chef : partagé par les sessions qui le lisent.
function registre(vus: MotExplique[] = []) {
  const seen = new Set<MotExplique>(vus);
  const tels = () => MOTS_EXPLIQUES.filter((mot) => seen.has(mot));
  return {
    seen,
    reponses: {
      lireLesExplications: () => ({ vus: tels() }),
      marquerUneExplication: (_: string, mot: MotExplique) => (seen.add(mot), { vus: tels() }),
      remontrerLesExplications: () => (seen.clear(), { vus: [] }),
    },
  };
}

// Une session de l'app : elle s'ouvre, le chef clique sur parade, son rail est lu.
async function session(reponses: Record<string, unknown>) {
  const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  vue.dire("surFaits", { ...dessinable(), demande: vue.dernier("faits")[0] as number });
  await repos();
  return vue;
}

// Les explications à l'écran : celles du rail, et celle du second sous son onglet.
const montrees = (vue: Jouee): Faux[] => [...vue.element("rail").descendants(), ...vue.element("explication-second").descendants()].filter(({ className }) => className === "explication");
const mots = (vue: Jouee) => montrees(vue).map(({ dataset }) => dataset.mot).sort();
const explication = (vue: Jouee, mot: string) => montrees(vue).find(({ dataset }) => dataset.mot === mot) ?? assert.fail(`pas d'explication de ${mot} : ${mots(vue).join(", ")}`);
const marques = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "marquerUneExplication").map(({ args }) => args[1]);
const TOUS = [...MOTS_EXPLIQUES].sort();

describe("la vue : chaque mot expliqué la première fois que le chef le rencontre", () => {
  test("un registre vide : à côté de chacun des six mots, sa ligne du glossaire, et chacun marqué vu, une fois", async () => {
    const runtime = registre();
    const vue = await session(runtime.reponses);
    assert.deepEqual(mots(vue), TOUS);
    for (const mot of MOTS_EXPLIQUES) {
      const ligne = explication(vue, mot);
      assert.equal(ligne.children.find(({ className }) => className === "dit")?.textContent, DU_GLOSSAIRE[mot], mot);
      assert.equal(ligne.children.find(({ className }) => className === "mot")?.textContent, MOT_A_L_ECRAN[mot], mot);
    }
    // Pass, Awaiting you et Waiting : sous le titre de leur colonne.
    for (const [colonne, mot] of [["Pass", "pass"], ["Awaiting you", "TODO"], ["Waiting", "WAITING"]] as const) {
      const pose = vue.element("rail").dessous("section").find(({ dataset }) => dataset.colonne === colonne) ?? assert.fail(colonne);
      assert.equal(pose.children[0]?.balise, "h4");
      assert.equal(pose.children[1]?.dataset.mot, mot, colonne);
    }
    assert.deepEqual([...marques(vue)].sort(), TOUS);
    assert.deepEqual([...runtime.seen].sort(), TOUS);
    // La lecture suivante repose le rail : les explications restent à l'écran, sans être marquées de nouveau.
    vue.dire("surFaits", { ...dessinable(), demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.deepEqual(mots(vue), TOUS);
    assert.equal(marques(vue).length, MOTS_EXPLIQUES.length);
  });

  test("écartée, une explication part de l'écran ; rechargée, l'app ne remontre aucune explication vue — un mot pas encore rencontré garde la sienne", async () => {
    // Le chef n'a encore rencontré que rail, pass et cook, sur un autre écran ou un autre appareil.
    const runtime = registre(["rail", "pass", "cook"]);
    const premiere = await session(runtime.reponses);
    assert.deepEqual(mots(premiere), ["TODO", "WAITING", "second"]);
    const ecarter = explication(premiere, "WAITING").dessous("button").find(({ textContent }) => textContent === MOTS.ecarter) ?? assert.fail("pas de « got it »");
    ecarter.click();
    await repos();
    assert.deepEqual(mots(premiere), ["TODO", "second"]);
    assert.deepEqual([...runtime.seen].sort(), TOUS);
    // L'app rechargée — ou la même chef sur son PC : le même registre, rien ne se remontre, rien ne se remarque.
    const seconde = await session(runtime.reponses);
    assert.deepEqual(mots(seconde), []);
    assert.deepEqual(marques(seconde), []);
  });

  test("Settings remontre toutes les explications : le registre du chef effacé, chaque mot se réexplique ici et dans une autre session", async () => {
    const runtime = registre([...MOTS_EXPLIQUES]);
    const vue = await session(runtime.reponses);
    assert.deepEqual(mots(vue), []);
    await ouvrirLecture(vue, "Settings");
    const rangee = vue.element("explications-du-chef");
    assert.equal(rangee.hidden, false);
    assert.match(rangee.textContent, /6 of 6 seen/);
    // Le rail, sous Settings, n'est pas rencontré : rien ne s'y explique, rien ne s'y marque.
    const remontrer = rangee.dessous("button").find(({ textContent }) => textContent === MOTS.remontrer) ?? assert.fail("pas de geste");
    remontrer.click();
    await repos();
    assert.deepEqual(vue.appels.filter(({ geste }) => geste === "remontrerLesExplications").map(({ args }) => args), [[PARADE]]);
    assert.match(rangee.textContent, new RegExp(MOTS.fait));
    assert.deepEqual([...runtime.seen], ["second"], "seul le second, à l'écran à côté de Settings, est rencontré");
    assert.deepEqual(mots(vue), ["second"]);
    // De retour sur le rail : chaque mot s'y réexplique.
    await ouvrirOnglet(vue, "Rail");
    vue.dire("surFaits", { ...dessinable(), demande: vue.dernier("faits")[0] as number });
    await repos();
    assert.deepEqual(mots(vue), TOUS);
    // Sur un autre appareil du chef, après l'effacement mais avant qu'ici le rail soit revu, tout s'explique de nouveau.
    runtime.reponses.remontrerLesExplications();
    const ailleurs = await session(runtime.reponses);
    assert.deepEqual(mots(ailleurs), TOUS);
  });

  test("un registre qui ne se lit pas : aucune explication montrée ni marquée, et Settings dit pourquoi, son geste éteint", async () => {
    const vue = await session({ lireLesExplications: () => ({ sans: "explanations unavailable", detail: "explanations.json is not JSON" }), marquerUneExplication: () => assert.fail("rien ne se marque") });
    assert.deepEqual(mots(vue), []);
    await ouvrirLecture(vue, "Settings");
    const rangee = vue.element("explications-du-chef");
    assert.equal(rangee.hidden, false);
    assert.match(rangee.textContent, /explanations unavailable/);
    assert.equal(rangee.dessous("button").find(({ textContent }) => textContent === MOTS.remontrer)?.disabled, true);
  });

  test("un mot vu que le runtime ne garde pas : l'explication reste, et Settings dit qu'elle n'est pas gardée", async () => {
    const vue = await session({ lireLesExplications: () => ({ vus: ["rail", "pass", "cook", "TODO", "WAITING"] }), marquerUneExplication: () => ({ refus: "explanations.json cannot be read" }) });
    assert.deepEqual(mots(vue), ["second"]);
    await ouvrirLecture(vue, "Settings");
    assert.match(vue.element("explications-du-chef").textContent, /an explanation seen was not kept — explanations\.json cannot be read/);
  });

  test("un pont sans explications — le téléphone : rien ne se montre, et Settings n'en a pas de rangée", async () => {
    const vue = await session({});
    assert.deepEqual(mots(vue), []);
    await ouvrirLecture(vue, "Settings");
    assert.equal(vue.element("explications-du-chef").hidden, true);
  });
});
