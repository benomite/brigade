// Le plafond de calibrage d'un projet, sur son onglet Cooks (ticket 1284) : la page dit sa valeur et d'où elle vient —
// le défaut, ou le chef —, et le change d'un geste, sans `sudo`, redémarrage ni fichier : la commande `station` du
// runtime part là où la cuisine du projet tourne, et la lecture suivante montre le plafond neuf.
// La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test } from "node:test";
import type { Lu, Rendu } from "../src/box.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { plafondVu, reglerLePlafond, type PlafondLu, type RenduDuPlafond } from "../src/plafond-de-calibrage.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { BOUTONS as BOUTONS_DU_PLAFOND, TITRE } from "../src/vue/plafond-de-calibrage.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";
const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "fil repris", arrete: false };
const PROJETS = [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }];
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: PROJETS, hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// Le plafond tel que le runtime le rend dans `facts` (runtime/src/faits.ts), mot pour mot.
const DEFAUT: PlafondLu = { modele: "opus", effort: "high", parLeChef: { modele: false, effort: false } };
const POSE: PlafondLu = { modele: "sonnet", effort: "medium", parLeChef: { modele: true, effort: true } };
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};

const lire = (plafond: PlafondLu | undefined) => {
  const recu = tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations: [], ...(plafond === undefined ? {} : { plafondDeCalibrage: plafond }) }) }] });
  return recu;
};

describe("ce que `facts` dit du plafond", () => {
  test("rien n'est posé : la page dit le défaut, et que c'est le défaut", () => {
    const recu = lire(DEFAUT);
    assert.ok("tableau" in recu);
    assert.deepEqual(recu.tableau.plafondDeCalibrage, { modele: "opus", effort: "high", dit: "opus / high", source: "default", parLeChef: false, modeles: MODELES, efforts: EFFORTS });
  });

  test("posé par le chef, en tout ou en partie : la source le dit, dimension par dimension", () => {
    assert.equal(plafondVu(POSE).source, "set by you");
    assert.equal(plafondVu({ ...POSE, parLeChef: { modele: true, effort: false } }).source, "model set by you, effort by default");
    assert.equal(plafondVu({ ...POSE, parLeChef: { modele: false, effort: true } }).source, "effort set by you, model by default");
    assert.equal(plafondVu({ ...POSE, parLeChef: { modele: false, effort: true } }).parLeChef, true);
  });

  test("un runtime d'avant ce champ : rien ne se pose ; une forme qui ne se lit pas est dite", () => {
    const avant = lire(undefined);
    assert.ok("tableau" in avant);
    assert.equal(avant.tableau.plafondDeCalibrage, undefined);
    const informe = lire({ modele: "opus", effort: "high" } as unknown as PlafondLu);
    assert.ok(!("tableau" in informe));
  });
});

describe("le geste part là où la cuisine tourne", () => {
  const BOX: Lu = { nom: PARADE, cuisine: { box: { hote: "box" } } } as unknown as Lu;
  const lances: string[] = [];
  const reussi = async (_: Lu, commande: string): Promise<Rendu> => {
    lances.push(commande);
    return { lance: `$ ssh box brigade parade ${commande}`, erreur: null, sortie: "", erreurs: `brigade : ${commande.split(" ")[1]}: set\n` };
  };

  test("un modèle et un effort : les deux décisions partent, l'une après l'autre", async () => {
    lances.length = 0;
    const rendu = await reglerLePlafond(PARADE, BOX, DEFAUT, { modele: "sonnet", effort: "xhigh" }, reussi);
    assert.deepEqual(lances, ["station ceiling-modele sonnet", "station ceiling-effort xhigh"]);
    assert.deepEqual(rendu, { fait: "the ceiling is sonnet / xhigh: the manager reads it at its next reaction, no restart", detail: "$ ssh box brigade parade station ceiling-modele sonnet\nbrigade : ceiling-modele: set\n$ ssh box brigade parade station ceiling-effort xhigh\nbrigade : ceiling-effort: set" });
  });

  test("seule la dimension qui change part ; le défaut choisi tel quel se pose, c'est ta décision", async () => {
    lances.length = 0;
    await reglerLePlafond(PARADE, BOX, POSE, { modele: "sonnet", effort: "high" }, reussi);
    assert.deepEqual(lances, ["station ceiling-effort high"]);
    lances.length = 0;
    await reglerLePlafond(PARADE, BOX, DEFAUT, { modele: "opus", effort: "high" }, reussi);
    assert.deepEqual(lances, ["station ceiling-modele opus", "station ceiling-effort high"]);
  });

  test("le retour au défaut retire ce que le chef a posé, et rien d'autre", async () => {
    lances.length = 0;
    const rendu = await reglerLePlafond(PARADE, BOX, { ...POSE, parLeChef: { modele: false, effort: true } }, "defaut", reussi);
    assert.deepEqual(lances, ["station remove ceiling-effort"]);
    assert.match("fait" in rendu ? rendu.fait : "", /^the ceiling is back to the default/);
  });

  test("rien ne part pour une valeur inconnue, un plafond déjà en vigueur, un projet sans station ou pas encore lu", async () => {
    lances.length = 0;
    assert.match((await reglerLePlafond(PARADE, BOX, DEFAUT, { modele: "gpt", effort: "high" }, reussi) as { refus: string }).refus, /takes a model \(opus, sonnet, haiku\) and an effort/);
    assert.match((await reglerLePlafond(PARADE, BOX, POSE, { modele: "sonnet", effort: "medium" }, reussi) as { refus: string }).refus, /already sonnet \/ medium, set by you/);
    assert.match((await reglerLePlafond(PARADE, BOX, DEFAUT, "defaut", reussi) as { refus: string }).refus, /already the default/);
    assert.match((await reglerLePlafond(PARADE, undefined, DEFAUT, "defaut", reussi) as { refus: string }).refus, /has no station/);
    assert.match((await reglerLePlafond(PARADE, BOX, undefined, "defaut", reussi) as { refus: string }).refus, /not read yet/);
    assert.deepEqual(lances, []);
  });

  test("le runtime refuse : rien n'est dit fait, et ce qu'il a répondu est au survol", async () => {
    const refuse = async (): Promise<Rendu> => ({ lance: "$ ssh box brigade parade station ceiling-modele sonnet", erreur: Object.assign(new Error("exit 2"), { code: 2 }) as ExecFileException, sortie: "", erreurs: "brigade : ceiling-modele refused\n" });
    const rendu = await reglerLePlafond(PARADE, BOX, DEFAUT, { modele: "sonnet", effort: "high" }, refuse);
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "the ceiling was not changed: the runtime did not take it — nothing was changed");
    assert.match(rendu.detail ?? "", /ceiling-modele refused/);
  });
});

// Ce que le pont répond au geste : rien tant que le test ne le lâche pas.
type Reponse = { projet: string; choix: unknown; rendre(rendu: RenduDuPlafond): void };

async function ouvrir(plafond: PlafondLu | null = DEFAUT) {
  const reponses: Reponse[] = [];
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [SECOND],
    machines: () => [{ id: "poste", titre: "this Mac" }],
    reglerLePlafondDeCalibrage: (projet, choix) => new Promise<RenduDuPlafond>((rendre) => reponses.push({ projet, choix, rendre })) as unknown as RenduDuPlafond,
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  recevoir(vue, plafond ?? undefined);
  return { vue, reponses };
}
function recevoir(vue: Jouee, plafond: PlafondLu | undefined): void {
  vue.dire("surFaits", { ...lire(plafond), demande: vue.dernier("faits")[0] as number });
}

const section = (vue: Jouee) => vue.element("rail").dessous("section").find((pose) => pose.className === "plafond-de-calibrage");
const bouton = (pose: Faux, libelle: string) => pose.dessous("button").find((candidat) => candidat.textContent === libelle);
const liste = (pose: Faux, nom: string) => pose.dessous("select").find((select) => select.ariaLabel === `ceiling ${nom}`) ?? assert.fail(`pas de liste ${nom}`);

describe("l'onglet Cooks : le plafond de calibrage du projet", () => {
  test("rien n'est posé : la page dit opus / high, que c'est le défaut, et les listes le montrent", async () => {
    const { vue } = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    const pose = section(vue) ?? assert.fail("pas de plafond sur Cooks");
    assert.equal(pose.children[0]?.textContent, `${TITRE}project`);
    assert.equal(pose.dessous("p").find((p) => p.className === "valeur")?.textContent, "opus / highdefault");
    assert.equal(liste(pose, "model").value, "opus");
    assert.equal(liste(pose, "effort").value, "high");
    // Rien à retirer : pas de retour au défaut.
    assert.equal(bouton(pose, BOUTONS_DU_PLAFOND.defaut.libelle), undefined);
  });

  test("sur Rail, il ne se montre pas ; d'un runtime qui ne le donne pas, nulle part", async () => {
    const { vue } = await ouvrir();
    await ouvrirOnglet(vue, "Rail");
    assert.equal(section(vue), undefined);
    const avant = await ouvrir(null);
    await ouvrirOnglet(avant.vue, "Cooks");
    assert.equal(section(avant.vue), undefined);
  });

  test("le changer en un geste : choisir, « set ceiling », la box est relue, et la page dit le plafond neuf, posé par toi", async () => {
    const { vue, reponses } = await ouvrir();
    await ouvrirOnglet(vue, "Cooks");
    const pose = section(vue) ?? assert.fail("pas de plafond");
    const modele = liste(pose, "model");
    modele.value = "sonnet";
    modele.declencher("change");
    await repos();
    // Le choix tient d'une lecture à l'autre, tant qu'il n'est pas envoyé.
    recevoir(vue, DEFAUT);
    await repos();
    const effort = liste(section(vue) ?? assert.fail("pas de plafond"), "effort");
    assert.equal(liste(section(vue) ?? assert.fail(), "model").value, "sonnet");
    effort.value = "medium";
    effort.declencher("change");
    await repos();
    bouton(section(vue) ?? assert.fail(), BOUTONS_DU_PLAFOND.regler.libelle)?.click();
    await repos();
    assert.deepEqual(reponses.map(({ projet, choix }) => [projet, choix]), [[PARADE, { modele: "sonnet", effort: "medium" }]]);
    // Tant que le runtime n'a pas répondu, le bouton dit qu'il s'y met, et ne se reclique pas.
    const enCours = bouton(section(vue) ?? assert.fail(), BOUTONS_DU_PLAFOND.regler.enCours) ?? assert.fail("le bouton ne dit pas qu'il s'y met");
    assert.equal(enCours.disabled, true);
    const relectures = vue.appels.filter(({ geste }) => geste === "relireBox").length;
    reponses[0]?.rendre({ fait: "the ceiling is sonnet / medium: the manager reads it at its next reaction, no restart", detail: "$ ssh box brigade parade station ceiling-modele sonnet" });
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, relectures + 1);
    assert.match(section(vue)?.textContent ?? "", /the ceiling is sonnet \/ medium/);

    // La lecture suivante : le plafond neuf, et d'où il vient ; le retour au défaut s'offre.
    recevoir(vue, POSE);
    await repos();
    const neuve = section(vue) ?? assert.fail();
    assert.equal(neuve.dessous("p").find((p) => p.className === "valeur")?.textContent, "sonnet / mediumset by you");
    assert.equal(bouton(neuve, BOUTONS_DU_PLAFOND.regler.libelle)?.disabled, true);
    bouton(neuve, BOUTONS_DU_PLAFOND.defaut.libelle)?.click();
    await repos();
    assert.deepEqual(reponses.at(-1)?.choix, "defaut");
  });

  test("le pont ne porte pas le geste — un téléphone : la page le dit, sans rien lever", async () => {
    const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this Mac" }] });
    (vue.element("projets").children.at(1) ?? assert.fail()).click();
    await repos();
    recevoir(vue, DEFAUT);
    await ouvrirOnglet(vue, "Cooks");
    bouton(section(vue) ?? assert.fail(), BOUTONS_DU_PLAFOND.regler.libelle)?.click();
    await repos();
    assert.match(section(vue)?.textContent ?? "", /the ceiling was not changed: nothing was sent/);
  });
});
