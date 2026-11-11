// L'offre du téléphone juste après le premier ticket servi (#3303, offre-telephone/) : d'abord ses morceaux devant un faux
// document — le premier projet servi, l'offre tenue et son stockage, la ligne à chaque état —, puis la vue jouée entière
// contre le faux pont : la page du premier projet servi l'offre, l'accepter montre le lien de l'app Android sans passer par
// Settings, la décliner ou suivre son lien la range, et un lancement suivant ne la remontre pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Delai } from "../../src/projets/demande.ts";
import { calibrageRecommande, EFFORTS, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { REESSAYER } from "../../src/vue/lexique.js";
import {
  ACCEPTER,
  CLE_DE_L_OFFRE,
  DECLINER,
  ILLISIBLE,
  LECTURE,
  MEME_COMPTE,
  OFFRE,
  poserLOffre,
  premierProjetServi,
  TELECHARGER,
  tenirLOffre,
} from "../../src/vue/offre-telephone/offre-telephone.js";
import { Faux, FauxStockage, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const APK = "https://github.com/benomite/brigade/releases/download/android-v1.4.0/brigade.apk";
const SERVI: Delai = { ajouteLe: "2026-11-10T09:00:00.000Z", serviLe: "2026-11-10T09:20:00.000Z", duree: 20 * 60_000 };
const EN_COURS: Delai = { ajouteLe: "2026-11-10T09:00:00.000Z", serviLe: null, duree: null };
const PLUS_TOT = (delai: Delai): Delai => ({ ...delai, ajouteLe: "2026-11-01T09:00:00.000Z" });
const textes = (racine: Faux) => [...racine.descendants()].map(({ textContent }) => textContent);
const bouton = (racine: Faux, libelle: string) => racine.dessous("button").find(({ textContent }) => textContent === libelle);

describe("le premier projet servi", () => {
  test("le projet ajouté le plus tôt, une fois son premier ticket servi", () => {
    assert.equal(premierProjetServi([{ nom: "parade", delai: SERVI }, { nom: "cantine", delai: { ...SERVI, ajouteLe: "2026-11-10T10:00:00.000Z" } }]), "parade");
  });
  test("le premier projet sans ticket servi : rien, même si un projet ajouté après en a un", () => {
    assert.equal(premierProjetServi([{ nom: "parade", delai: SERVI }, { nom: "cantine", delai: PLUS_TOT(EN_COURS) }]), undefined);
  });
  test("un projet sans délai publié, ou d'un ajout illisible, ne compte pas", () => {
    assert.equal(premierProjetServi([{ nom: "cantine" }, { nom: "atelier", delai: { ...SERVI, ajouteLe: "pas une date" } }, { nom: "parade", delai: SERVI }]), "parade");
    assert.equal(premierProjetServi([]), undefined);
  });
});

describe("l'offre tenue", () => {
  // `null` : aucun stockage.
  const tenue = (lire: () => Promise<unknown>, stockage: FauxStockage | null = new FauxStockage()) => {
    const ouverts: string[] = [];
    let rendus = 0;
    const offre = tenirLOffre({ stockage: stockage ?? undefined, lire, ouvrir: (lien) => ouverts.push(lien), rendre: () => void rendus++, maintenant: () => "2026-11-11T10:00:00.000Z" });
    return { offre, ouverts, stockage, rendus: () => rendus };
  };

  test("acceptée : la lecture, puis le lien lu", async () => {
    const { offre, rendus } = tenue(async () => APK);
    assert.deepEqual(offre.etat, { etape: "offerte" });
    offre.accepter();
    assert.deepEqual(offre.etat, { etape: "lecture" });
    await repos();
    assert.deepEqual(offre.etat, { etape: "lien", lien: APK });
    assert.equal(rendus(), 2);
  });

  test("un pont qui lève, ne rend rien, ou rend autre chose qu'une adresse https : illisible, et elle se relit", async () => {
    for (const lire of [async () => Promise.reject(new Error("ipc")), async () => undefined, async () => "http://exemple.org/brigade.apk", async () => 42]) {
      const { offre } = tenue(lire);
      offre.accepter();
      await repos();
      assert.deepEqual(offre.etat, { etape: "illisible" });
      assert.equal(offre.rangee(), false, "une lecture ratée ne range pas l'offre");
    }
  });

  test("déclinée : rangée, et gardée dans le stockage", () => {
    const { offre, stockage } = tenue(async () => APK);
    assert.equal(offre.rangee(), false);
    offre.decliner();
    assert.equal(offre.rangee(), true);
    assert.deepEqual(JSON.parse(stockage?.getItem(CLE_DE_L_OFFRE) ?? "null"), { declinee: "2026-11-11T10:00:00.000Z" });
  });

  test("son lien suivi : ouvert, puis rangée et gardée", () => {
    const { offre, stockage, ouverts } = tenue(async () => APK);
    offre.suivre(APK);
    assert.deepEqual(ouverts, [APK]);
    assert.equal(offre.rangee(), true);
    assert.deepEqual(JSON.parse(stockage?.getItem(CLE_DE_L_OFFRE) ?? "null"), { suivie: "2026-11-11T10:00:00.000Z" });
  });

  test("un stockage absent ou illisible ne la montre pas ; une trace qui ne s'écrit pas la range pour ce lancement", () => {
    assert.equal(tenue(async () => APK, null).offre.rangee(), true);
    const illisible = new FauxStockage();
    illisible.getItem = () => {
      throw new Error("refusé");
    };
    assert.equal(tenue(async () => APK, illisible).offre.rangee(), true);
    const muet = new FauxStockage();
    muet.setItem = () => {
      throw new Error("plein");
    };
    const { offre } = tenue(async () => APK, muet);
    assert.equal(offre.rangee(), false);
    offre.decliner();
    assert.equal(offre.rangee(), true);
  });
});

describe("la ligne", () => {
  const gestes = () => {
    const faits: string[] = [];
    return { faits, geste: { accepter: () => faits.push("accepter"), decliner: () => faits.push("decliner"), suivre: (lien: string) => faits.push(`suivre ${lien}`) } };
  };

  test("offerte : la phrase, « set up my phone » recommandé, « no thanks »", () => {
    const { faits, geste } = gestes();
    const ligne: Faux = poserLOffre(doc, { etape: "offerte" }, geste);
    assert.equal(textes(ligne).includes(OFFRE), true);
    assert.deepEqual(ligne.dessous("button").map(({ textContent }) => textContent), [ACCEPTER, DECLINER]);
    bouton(ligne, ACCEPTER)?.click();
    bouton(ligne, DECLINER)?.click();
    assert.deepEqual(faits, ["accepter", "decliner"]);
  });

  test("en lecture : la phrase qui le dit, sans « set up my phone »", () => {
    const ligne: Faux = poserLOffre(doc, { etape: "lecture" }, gestes().geste);
    assert.equal(textes(ligne).includes(LECTURE), true);
    assert.deepEqual(ligne.dessous("button").map(({ textContent }) => textContent), [DECLINER]);
  });

  test("le lien : « download the Android app », vers l'APK, et « Sign in with the same GitHub account »", () => {
    const { faits, geste } = gestes();
    const ligne: Faux = poserLOffre(doc, { etape: "lien", lien: APK }, geste);
    const [lien] = ligne.dessous("a") as (Faux & { href?: string })[];
    assert.equal(lien?.textContent, TELECHARGER);
    assert.equal(lien?.href, APK);
    assert.equal(textes(ligne).includes(MEME_COMPTE), true);
    lien?.click();
    assert.deepEqual(faits, [`suivre ${APK}`]);
  });

  test("illisible : la ligne qui le dit, et « Try again » relance la lecture", () => {
    const { faits, geste } = gestes();
    const ligne: Faux = poserLOffre(doc, { etape: "illisible" }, geste);
    assert.equal(textes(ligne).includes(ILLISIBLE), true);
    bouton(ligne, REESSAYER)?.click();
    assert.deepEqual(faits, ["accepter"]);
  });
});

describe("sur la page du projet", () => {
  const A = "2026-11-11T10:00:00.000Z";
  const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };
  const CANTINE: Projet = { nom: "cantine", dossier: "/tmp/cantine", depot: "benomite/cantine", base: "main" };
  const vu = (nom: string, delai: Delai): ProjetVu => ({
    nom,
    depot: `benomite/${nom}`,
    base: "main",
    suiviPar: { id: "g1", nom: "box" },
    stations: [{ id: "g1", nom: "box", etat: "servi", dit: "", autoriser: [] }],
    servi: null,
    cuitSur: { id: "g1", nom: "box", ici: false },
    delai,
  });
  const demarrage = (projets: ProjetVu[]) => ({
    configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE, CANTINE] }),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: undefined,
    stations: { a: A, stations: [] } satisfies VuDesStations,
    accueil: ACCUEIL,
    projetsDesStations: { a: A, projets, recommandee: null, avertissements: {}, machines: {}, calibrage: calibrageRecommande([]) } satisfies VuDesProjets,
  });

  // `case` : 1 pour parade, 2 pour cantine.
  async function laPage(projets: ProjetVu[], { stockage = new FauxStockage(), lien = async () => APK, rang = 1 }: { stockage?: FauxStockage; lien?: () => Promise<string>; rang?: number } = {}) {
    const jouee = await jouerLaVue({ demarrage: () => demarrage(projets), espace: () => [], lienDeLApk: lien, ouvrirLaPage: () => true }, { stockage });
    (jouee.element("projets").children.at(rang) ?? assert.fail("pas de case du projet")).click();
    await repos();
    return { jouee, section: jouee.element("offre-telephone") };
  }

  test("le premier projet servi : l'offre ; acceptée, le lien de l'app Android et le même compte GitHub, sur place", async () => {
    const { jouee, section } = await laPage([vu("parade", SERVI), vu("cantine", { ...SERVI, ajouteLe: "2026-11-10T10:00:00.000Z" })]);
    assert.equal(section.hidden, false);
    assert.equal(textes(section).includes(OFFRE), true);
    bouton(section, ACCEPTER)?.click();
    await repos();
    assert.equal(jouee.appels.some(({ geste }) => geste === "lienDeLApk"), true);
    const [lien] = section.dessous("a") as (Faux & { href?: string })[];
    assert.equal(lien?.href, APK);
    assert.equal(textes(section).includes(MEME_COMPTE), true);
    assert.equal(jouee.element("onglets-du-projet").children.find((onglet) => onglet.ariaSelected === "true")?.textContent ?? "Rail", "Rail", "rien ne passe par Settings");
  });

  test("son lien suivi : la page s'ouvre, l'offre se range, et ne revient pas au lancement suivant", async () => {
    const stockage = new FauxStockage();
    const { jouee, section } = await laPage([vu("parade", SERVI)], { stockage });
    bouton(section, ACCEPTER)?.click();
    await repos();
    section.dessous("a")[0]?.click();
    assert.deepEqual(jouee.dernier("ouvrirLaPage"), [APK]);
    assert.equal(section.hidden, true);
    const relancee = await laPage([vu("parade", SERVI)], { stockage });
    assert.equal(relancee.section.hidden, true);
  });

  test("déclinée : rangée, et pas remontrée au lancement suivant", async () => {
    const stockage = new FauxStockage();
    const { section } = await laPage([vu("parade", SERVI)], { stockage });
    bouton(section, DECLINER)?.click();
    assert.equal(section.hidden, true);
    assert.notEqual(stockage.getItem(CLE_DE_L_OFFRE), null);
    assert.equal((await laPage([vu("parade", SERVI)], { stockage })).section.hidden, true);
  });

  test("ni avant le premier ticket servi, ni sur un autre projet que le premier", async () => {
    assert.equal((await laPage([vu("parade", EN_COURS)])).section.hidden, true);
    assert.equal((await laPage([vu("parade", SERVI), vu("cantine", PLUS_TOT(SERVI))])).section.hidden, true);
    assert.equal((await laPage([vu("parade", SERVI), vu("cantine", PLUS_TOT(SERVI))], { rang: 2 })).section.hidden, false);
  });
});
