// Ce Mac gardé éveillé tant qu'un cook cuit (#3642) : ce que le chef en voit. La carte de la station de cet ordinateur,
// dans l'onglet Stations, dit qu'elle le garde éveillé exactement quand elle tient l'assertion ; le menu de l'icône de la
// station le dit aussi, et porte la case du réglage ; hors d'un Mac, ni ligne ni case. Derrière le pont, l'état est celui
// que le runtime écrit et lit, dans un répertoire du test.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { ecrireEtat, ecrireReglage, lireVeille, REGLAGE, type Veille } from "../../../runtime/src/veille-machine/contrat.ts";
import type { Accueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { mettreAPart } from "../../src/attend.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { Panne } from "../../src/pannes/pannes.ts";
import { calibrageRecommande, EFFORTS, machineProposee, MODELES, type ProjetVu, type VuDesProjets } from "../../src/projets/projets.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { menuDuFond } from "../../src/tray-fond/tray-fond.ts";
import { suivreLaVeille } from "../../src/vue/veille-machine/suivre.ts";
import { GARDE_EVEILLE, GARDER_EVEILLE } from "../../src/vue/veille-machine/veille-machine.js";
import { type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-15T10:00:00.000Z";
const DEPOT = "benomite/parade";
const MAC: StationVue = { id: "gmac", nom: "macbook", machine: "macOS 25.0.0", coeurs: 12, etat: "en-ligne", ligne: "online", pannes: [] as Panne[], dit: "online", version: "2.4.0", projets: ["parade"], max: "connectee" };
const ACCUEIL: Accueil = { projets: [], stations: [], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: DEPOT, base: "main" };
const ICI: ProjetVu = { nom: "parade", depot: DEPOT, base: "main", suiviPar: { id: "gmac", nom: "macbook" }, stations: [{ id: "gmac", nom: "macbook", etat: "servi", dit: "", autoriser: [] }], servi: null, cuitSur: { id: "gmac", nom: "macbook", ici: true }, demenagement: null } as never;
const VU: VuDesProjets = { a: A, projets: [ICI], locale: "gmac", recommandee: "gmac", avertissements: {}, machines: { gmac: machineProposee(MAC) }, calibrage: calibrageRecommande([]) };
const COOK = { ticket: 14, titre: "Le journal en ajout seul", station: "macbook/claude" };
const FAITS = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [COOK],
  attend: [],
  livres: [],
  stations: [{ station: "macbook/claude", distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, presente: true, cooks: [COOK] }],
} as unknown as Faits;

const racines: string[] = [];
after(() => {
  for (const racine of racines) rmSync(racine, { recursive: true, force: true });
});
const racineDuTest = () => {
  const racine = mkdtempSync(join(tmpdir(), "veille-machine-"));
  racines.push(racine);
  return racine;
};
// Tous les process vivent : ceux du test sont des pids inventés.
const tousVivants = () => true;

// L'onglet Stations de parade, que ce Mac cuit ; `veille` : ce que le pont rend de la veille de sa station.
async function laPage(veille: () => Veille | undefined) {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true, (nom) => nom === "parade"),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [MAC] } satisfies VuDesStations,
      accueil: ACCUEIL,
      projetsDesStations: VU,
    }),
    espace: () => [],
    projetsServis: () => ({ depots: [DEPOT] }),
    veilleMachine: veille,
  } as never);
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case « parade »")).click();
  await repos();
  const tenus = tenirFaits();
  const recue = tenus.recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
  const dessinable = tenus.attendre(mettreAPart({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "status", texte: "" }] })) ?? recue;
  vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
  await repos();
  await ouvrirOnglet(vue, "Stations");
  return vue;
}

const carteDIci = (vue: Jouee) =>
  vue
    .element("rail")
    .dessous("section")
    .find(({ className, dataset }) => className === "carte-de-station" && dataset.station === "gmac") ?? assert.fail("pas de carte pour ce Mac");
const ligneDeVeille = (vue: Jouee) => carteDIci(vue).dessous("p").filter(({ className }) => className === "veille-machine");

describe("la carte de la station de ce Mac (#3642)", () => {
  test("elle dit qu'elle garde ce Mac éveillé tant que l'assertion est tenue, et rien quand elle ne l'est plus", async () => {
    const racine = racineDuTest();
    ecrireEtat(racine, { tenue: true, caffeinate: 4242, station: 4241 });
    const vue = await laPage(() => lireVeille(racine, "darwin", tousVivants));
    assert.deepEqual(
      ligneDeVeille(vue).map(({ textContent }) => textContent),
      [GARDE_EVEILLE],
    );
    // Le dernier cook a fini : la station a relâché l'assertion, le process principal le redit.
    ecrireEtat(racine, { tenue: false });
    vue.dire("surVeilleMachine", lireVeille(racine, "darwin", tousVivants));
    await repos();
    assert.equal(ligneDeVeille(vue).length, 0);
  });

  test("une station tuée laisse un état « tenue » qui ne se montre pas : son caffeinate est mort avec elle", async () => {
    const racine = racineDuTest();
    ecrireEtat(racine, { tenue: true, caffeinate: 4242, station: 4241 });
    const vue = await laPage(() => lireVeille(racine, "darwin", (pid) => pid !== 4242));
    assert.equal(ligneDeVeille(vue).length, 0);
  });

  test("hors d'un Mac, ou sans rien de lu, la carte n'en dit rien", async () => {
    const racine = racineDuTest();
    ecrireEtat(racine, { tenue: true, caffeinate: 4242, station: 4241 });
    assert.equal(ligneDeVeille(await laPage(() => lireVeille(racine, "win32", tousVivants))).length, 0);
    assert.equal(ligneDeVeille(await laPage(() => undefined)).length, 0);
  });
});

describe("le menu de l'icône de la station (#3642)", () => {
  const station = { pause: false, arret: false };
  const libelles = (veille: Veille | undefined) => menuDuFond([], station, veille).filter((entree) => entree.genre !== "separateur").map((entree) => ("libelle" in entree ? entree.libelle : ""));
  const laCase = (veille: Veille | undefined) => menuDuFond([], station, veille).find((entree) => entree.genre === "case");

  test("la ligne sous l'état de la cuisine tant que l'assertion est tenue, et la case cochée", () => {
    const racine = racineDuTest();
    ecrireEtat(racine, { tenue: true, caffeinate: 4242, station: 4241 });
    const veille = lireVeille(racine, "darwin", tousVivants);
    assert.equal(libelles(veille)[1], GARDE_EVEILLE);
    assert.deepEqual(laCase(veille), { genre: "case", geste: "veille", libelle: GARDER_EVEILLE, coche: true, actif: true });
  });

  test("le réglage éteint : ni ligne, la case décochée ; illisible, la case grisée le dit", () => {
    const racine = racineDuTest();
    assert.deepEqual(ecrireReglage(racine, false), { fait: true });
    ecrireEtat(racine, { tenue: false });
    const eteinte = lireVeille(racine, "darwin", tousVivants);
    assert.ok(!libelles(eteinte).includes(GARDE_EVEILLE));
    assert.deepEqual(laCase(eteinte), { genre: "case", geste: "veille", libelle: GARDER_EVEILLE, coche: false, actif: true });
    writeFileSync(join(racine, REGLAGE), "pas du json");
    const illisible = laCase(lireVeille(racine, "darwin", tousVivants));
    assert.equal(illisible?.genre === "case" && illisible.actif, false);
    assert.match(illisible?.libelle ?? "", /setting unreadable/);
  });

  test("hors d'un Mac : ni ligne ni case, le menu est celui d'avant", () => {
    const racine = racineDuTest();
    ecrireEtat(racine, { tenue: true, caffeinate: 4242, station: 4241 });
    const ailleurs = lireVeille(racine, "win32", tousVivants);
    assert.deepEqual(menuDuFond([], station, ailleurs), menuDuFond([], station));
    assert.equal(laCase(ailleurs), undefined);
  });
});

describe("le process principal suit la veille (#3642)", () => {
  test("il dit à la vue chaque changement, une fois, et une lecture qui échoue la laisse inconnue", async () => {
    let lu: Veille | Error = { sorte: "mac", reglage: { garderEveille: true }, tenue: true };
    const dites: (Veille | undefined)[] = [];
    const avertis: string[] = [];
    const suivi = suivreLaVeille({ lire: async () => (lu instanceof Error ? Promise.reject(lu) : lu), dire: (veille) => dites.push(veille), avertir: (ligne) => avertis.push(ligne), intervalleMs: 3_600_000 });
    try {
      await suivi.relire();
      assert.equal(dites.length, 1, "la même lecture ne se redit pas");
      lu = { sorte: "mac", reglage: { garderEveille: true }, tenue: false };
      assert.deepEqual(await suivi.relire(), lu);
      lu = new Error("module introuvable");
      assert.equal(await suivi.relire(), undefined);
      await suivi.relire();
      assert.deepEqual(dites, [{ sorte: "mac", reglage: { garderEveille: true }, tenue: true }, { sorte: "mac", reglage: { garderEveille: true }, tenue: false }, undefined]);
      assert.equal(avertis.length, 1);
    } finally {
      suivi.arreter();
    }
  });
});
