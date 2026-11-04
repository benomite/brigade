// Sur l'onglet Cooks, les stations cloud du projet (#2232, épique #2223) : leur coût par ticket servi — ou « not
// available yet » —, ses trois plafonds, et « Add a cloud station ». Un clic ajoute la station, une fois posé un plafond
// au moins et approuvé, une fois, ce qu'une station reçoit ; la seconde ne redemande pas l'approbation. La vue jouée
// telle qu'elle est, devant un faux document (aides/fausse-vue.ts) ; ce que le process principal lit arrive par
// `stationsCloud`, l'ajout part par `ajouterStationCloud`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { AjoutCloud, CloudAjoute, VuDuCloud } from "../../../src/stations-cloud/stations-cloud.ts";
import { AJOUTER, APPROUVER, auClic, BORNES, COUT, coutDit, JAMAIS, lireLaSaisie, NON_LU, PAS_ENCORE, RECOIT, RENONCER, SANS_PLAFOND, saisieDe } from "../../../src/vue/stations-cloud/stations-cloud.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const A = "2026-10-23T10:04:12.000Z";
const PARADE = "parade";

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-23T10:04:11.000Z",
  dernierTick: "2026-10-23T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};

const SANS_STATION: VuDuCloud = {
  projet: PARADE,
  ajoutees: 0,
  plafonds: {},
  recoit: { recoit: ["A GitHub token scoped to benomite/parade", "The repository to work on: benomite/parade"], jamais: ["Your Max session", "Any other secret"] },
  approuvee: false,
  cout: { projet: PARADE, coutTotal: 0, ticketsServis: 0, coutParTicket: "n/a" },
  periode: "this month",
};
const UNE_STATION: VuDuCloud = { ...SANS_STATION, ajoutees: 1, plafonds: { aLaFois: 2, heuresParJour: 4 }, approuvee: true, cout: { projet: PARADE, coutTotal: 12.6, ticketsServis: 7, coutParTicket: 1.8 } };

const PROJET: Projet = { nom: PARADE, dossier: "/tmp/parade" };

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PROJET] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

// L'espace de parade ouvert sur Cooks. `lus` : ce que chaque lecture des stations cloud rend, dans l'ordre — la
// dernière se répète ; `ajout` : ce que l'ajout rend.
async function ouvrir(lus: (VuDuCloud | { refus: string; detail?: string } | undefined)[], ajout: (ajout: AjoutCloud) => CloudAjoute = () => ({ fait: "A cloud station is added to parade" })): Promise<Jouee> {
  let lecture = 0;
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [],
    stationsCloud: () => lus[Math.min(lecture++, lus.length - 1)],
    ajouterStationCloud: (_projet, voulu) => ajout(voulu),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Cooks");
  await repos();
  return vue;
}

const bloc = (vue: Jouee) => vue.element("rail").dessous("section").find((pose) => pose.className === "stations-cloud");
const textes = (pose: Faux, balise: string) => pose.dessous(balise).map(({ textContent }) => textContent);
const bouton = (pose: Faux, texte: string) => pose.dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de « ${texte} » : ${textes(pose, "button").join(", ")}`);
const champ = (pose: Faux, borne: string) => pose.dessous("input").find(({ dataset }) => dataset.champ === borne) ?? assert.fail(`pas de champ ${borne}`);
async function taper(pose: Faux, borne: string, texte: string) {
  const tape = champ(pose, borne);
  tape.value = texte;
  tape.declencher("input");
  await repos();
}
const ajouts = (vue: Jouee) => vue.appels.filter(({ geste }) => geste === "ajouterStationCloud").map(({ args }) => args);

describe("les stations cloud du projet, sur l'onglet Cooks", () => {
  test("sous ses stations : le coût par ticket servi — « not available yet » sans ticket —, ses trois plafonds et « Add a cloud station », recommandé", async () => {
    const vue = await ouvrir([SANS_STATION]);
    const pose = bloc(vue) ?? assert.fail("pas de stations cloud sur Cooks");
    const cout = pose.dessous("p").find(({ className }) => className === "cout") ?? assert.fail("pas de coût");
    assert.deepEqual(cout.children.slice(0, 2).map(({ textContent }) => textContent), [COUT, PAS_ENCORE]);
    assert.deepEqual(pose.dessous("label").map((label) => label.children[0]?.textContent), Object.values(BORNES));
    assert.deepEqual(pose.dessous("input").map(({ value }) => value), ["", "", ""]);
    assert.equal(bouton(pose, AJOUTER).className, "recommande");
    // Son prix — l'hôte facture ses heures — est au survol, pas écrit sous le bouton.
    assert.equal(pose.dessous("p").some(({ textContent }) => /bills/.test(textContent)), false);
    // Rien de ce qu'une station reçoit n'est montré avant le clic.
    assert.equal(textes(pose, "h5").length, 0);
    const ids = vue.element("rail").children.map(({ id }) => id);
    assert.ok(ids.indexOf("cloud-du-projet") > ids.indexOf("cuisson-du-projet"), ids.join(", "));
    assert.ok(ids.indexOf("cloud-du-projet") < ids.indexOf("activite-du-projet"), ids.join(", "));
  });

  test("ajouter sans plafond est retenu, et la ligne le dit sous le bouton : rien ne part", async () => {
    const vue = await ouvrir([SANS_STATION]);
    bouton(bloc(vue) ?? assert.fail("pas de bloc"), AJOUTER).click();
    await repos();
    const pose = bloc(vue) ?? assert.fail("plus de bloc");
    const retenu = pose.dessous("p").find(({ className }) => className === "retenu") ?? assert.fail("rien ne dit pourquoi");
    assert.equal(retenu.textContent, SANS_PLAFOND);
    assert.equal(retenu.role, "alert");
    assert.equal(textes(pose, "h5").length, 0);
    assert.deepEqual(ajouts(vue), []);
  });

  test("avant la première station, le clic montre ce qu'elle reçoit et ce qu'elle ne reçoit jamais ; « Approve and add » l'ajoute, approbation comprise", async () => {
    const vue = await ouvrir([SANS_STATION, { ...UNE_STATION, plafonds: { heuresParJour: 4 } }]);
    await taper(bloc(vue) ?? assert.fail("pas de bloc"), "heuresParJour", "4");
    bouton(bloc(vue) ?? assert.fail("plus de bloc"), AJOUTER).click();
    await repos();
    let pose = bloc(vue) ?? assert.fail("plus de bloc");
    assert.deepEqual(textes(pose, "h5"), [RECOIT, JAMAIS]);
    assert.deepEqual(textes(pose, "li"), [...SANS_STATION.recoit.recoit, ...SANS_STATION.recoit.jamais]);
    // La confirmation dit son prix en une ligne ; le bouton d'ajout attend la réponse.
    const confirmation = pose.dessous("section").find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.equal(confirmation.dessous("p").filter(({ className }) => className === "prix").length, 1);
    assert.equal(bouton(pose, AJOUTER).disabled, true);
    assert.deepEqual(ajouts(vue), []);
    bouton(pose, APPROUVER).click();
    await repos();
    assert.deepEqual(ajouts(vue), [[PARADE, { plafonds: { heuresParJour: 4 }, approuver: true }]]);
    pose = bloc(vue) ?? assert.fail("plus de bloc");
    assert.ok(textes(pose, "p").includes("A cloud station is added to parade"));
    // Relue, la liste approuvée est repliée.
    assert.equal(pose.dessous("section").some(({ className }) => className === "confirmation"), false);
    assert.ok(pose.dessous("details").length === 1);
  });

  test("« Cancel » referme la liste sans rien ajouter", async () => {
    const vue = await ouvrir([SANS_STATION]);
    await taper(bloc(vue) ?? assert.fail("pas de bloc"), "aLaFois", "1");
    bouton(bloc(vue) ?? assert.fail("plus de bloc"), AJOUTER).click();
    await repos();
    bouton(bloc(vue) ?? assert.fail("plus de bloc"), RENONCER).click();
    await repos();
    const pose = bloc(vue) ?? assert.fail("plus de bloc");
    assert.equal(textes(pose, "h5").length, 0);
    assert.equal(bouton(pose, AJOUTER).disabled, false);
    // Ce que le chef a tapé reste.
    assert.equal(champ(pose, "aLaFois").value, "1");
    assert.deepEqual(ajouts(vue), []);
  });

  test("approuvée, la seconde station s'ajoute d'un clic, sans redemander l'approbation ; le coût par ticket servi est un nombre", async () => {
    const vue = await ouvrir([UNE_STATION]);
    let pose = bloc(vue) ?? assert.fail("pas de bloc");
    assert.ok(textes(pose, "strong").includes("$1.80"));
    assert.deepEqual(pose.dessous("input").map(({ value }) => value), ["2", "4", ""]);
    bouton(pose, AJOUTER).click();
    await repos();
    assert.deepEqual(ajouts(vue), [[PARADE, { plafonds: { aLaFois: 2, heuresParJour: 4 }, approuver: false }]]);
    pose = bloc(vue) ?? assert.fail("plus de bloc");
    assert.equal(pose.dessous("section").some(({ className }) => className === "confirmation"), false);
  });

  test("un ajout refusé se dit en une ligne, son détail au survol", async () => {
    const vue = await ouvrir([UNE_STATION], () => ({ refus: "No cloud station was added: the host refused", detail: "HTTP 402 Payment Required" }));
    bouton(bloc(vue) ?? assert.fail("pas de bloc"), AJOUTER).click();
    await repos();
    const pose = bloc(vue) ?? assert.fail("plus de bloc");
    const ligne = pose.dessous("p").find(({ className }) => className === "indisponible") ?? assert.fail("pas de refus");
    assert.equal(ligne.children[0]?.textContent, "No cloud station was added: the host refused");
    assert.equal(textes(pose, "p").some((texte) => /402/.test(texte)), false);
  });

  test("une lecture qui échoue se dit en une ligne ; un pont qui ne rend rien ne pose aucun bloc", async () => {
    const echec = await ouvrir([{ refus: "the cloud host did not answer", detail: "ECONNREFUSED" }]);
    const pose = bloc(echec) ?? assert.fail("pas de bloc");
    assert.equal(pose.dessous("p").find(({ className }) => className === "indisponible")?.children[0]?.textContent, NON_LU);
    assert.equal(pose.dessous("button").some(({ textContent }) => textContent === AJOUTER), false);
    const muet = await ouvrir([undefined]);
    assert.equal(bloc(muet), undefined);
    assert.equal(muet.element("rail").children.find(({ id }) => id === "cloud-du-projet")?.children.length, 0);
  });
});

describe("ce qu'un clic sur « Add a cloud station » fait", () => {
  const saisie = (champs: Partial<Record<"aLaFois" | "heuresParJour" | "heuresParMois", string>>) => ({ ...saisieDe(SANS_STATION), ...champs });

  test("un champ vide ne borne rien ; aucun plafond, ou un champ qui n'est pas un nombre, retient l'ajout", () => {
    assert.deepEqual(lireLaSaisie(saisie({})), { retenu: SANS_PLAFOND });
    assert.deepEqual(lireLaSaisie(saisie({ heuresParMois: " 60 " })), { plafonds: { heuresParMois: 60 } });
    assert.deepEqual(lireLaSaisie(saisie({ heuresParJour: "1.5" })), { plafonds: { heuresParJour: 1.5 } });
    assert.deepEqual(lireLaSaisie(saisie({ aLaFois: "1.5" })), { retenu: `${BORNES.aLaFois}: a whole number of stations, above zero` });
    for (const casse of [{ aLaFois: "0" }, { aLaFois: "1.5" }, { heuresParJour: "-2" }, { heuresParMois: "beaucoup" }]) {
      assert.ok("retenu" in lireLaSaisie(saisie(casse)), JSON.stringify(casse));
    }
  });

  test("le plafond d'abord, puis l'approbation la première fois, puis l'ajout", () => {
    assert.deepEqual(auClic(SANS_STATION, saisie({})), { retenu: SANS_PLAFOND });
    assert.deepEqual(auClic(SANS_STATION, saisie({ aLaFois: "1" })), { approuver: { aLaFois: 1 } });
    assert.deepEqual(auClic({ ...SANS_STATION, approuvee: true }, saisie({ aLaFois: "1" })), { ajouter: { aLaFois: 1 } });
  });

  test("le coût par ticket servi, et ce qui le fait au survol", () => {
    assert.deepEqual(coutDit(UNE_STATION), { dit: "$1.80", survol: "$12.60 billed this month, 7 tickets served" });
    assert.deepEqual(coutDit(SANS_STATION), { dit: PAS_ENCORE, survol: "no ticket served by a cloud station this month" });
    assert.deepEqual(coutDit({ ...SANS_STATION, cout: { ...SANS_STATION.cout, coutTotal: 0.9 } }).survol, "no ticket served by a cloud station this month — $0.90 billed");
  });
});
