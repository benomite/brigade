// Les appels de la box à GitHub sur la page de sa station (#1418, épique 1415) : le runtime les publie dans `faits`
// (`appelsGithub`), l'app les lit (`comprendre`), les range sous la station qui les a rendus (`tenirAccueil`), et la
// page les montre — ou un tiret neutre quand le runtime est d'avant ce champ.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Accueil, LigneDeStation } from "../../src/accueil.ts";
import { tenirAccueil } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, comprendre, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { poserLesAppels } from "../../src/vue/appels-de-la-station.js";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const APPELS = { total: 42, topProject: { name: "parade", calls: 30 }, topKind: { name: "issues", calls: 25 } };
const A = "2026-10-22T12:00:00.000Z";

// Les faits minimaux qu'un runtime publie, avec ou sans le compteur.
const faitsJson = (plus: object) =>
  JSON.stringify({ etat: "ouverte", lu: A, dernierTick: A, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], ...plus });

describe("la lecture des faits", () => {
  test("les appels publiés sont lus tels quels", () => {
    const compris = comprendre(faitsJson({ appelsGithub: { ...APPELS, byProject: [], byKind: [] } })) as Faits;
    assert.deepEqual(compris.appelsGithub, APPELS);
  });

  test("zéro appel : un total nul et personne en tête", () => {
    const compris = comprendre(faitsJson({ appelsGithub: { total: 0, topProject: null, topKind: null } })) as Faits;
    assert.deepEqual(compris.appelsGithub, { total: 0, topProject: null, topKind: null });
  });

  test("un runtime d'avant le champ : les faits restent lus, sans appels", () => {
    const compris = comprendre(faitsJson({})) as Faits;
    assert.equal("appelsGithub" in compris, false);
  });
});

describe("l'accueil range les appels sous la station qui les rend", () => {
  const STATION: StationVue = { id: "g1", nom: "box", machine: "Linux", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: ["parade"], max: null };
  const lire = (appelsGithub: object | undefined) => {
    const accueil = tenirAccueil({ projets: () => [{ nom: "parade", servi: true }], maintenant: () => Date.parse(A) });
    accueil.stations({ a: A, stations: [STATION] });
    accueil.faits({ projet: "parade", demande: 1, a: A, sorties: [{ commande: "facts", texte: faitsJson(appelsGithub === undefined ? {} : { appelsGithub }) }] });
    accueil.status({ projet: "parade", demande: 1, a: A, attend: undefined, sorties: [{ commande: "status", texte: "head\n\ncooks      none running — box: 3 at most — 8 cores\n" }] });
    return accueil.vu().stations?.[0] as LigneDeStation;
  };

  test("avec le compteur : la ligne de la station le porte", () => {
    assert.deepEqual(lire(APPELS).appels, APPELS);
  });

  test("sans le compteur : rien", () => {
    assert.equal(lire(undefined).appels, undefined);
  });
});

describe("la ligne posée par le module", () => {
  test("le total et ce qui en a fait le plus", () => {
    const ligne = poserLesAppels(doc, APPELS);
    assert.equal(ligne.dataset.appels, "lus");
    assert.match(ligne.textContent ?? "", /GitHub calls, last hour: 42 — most from parade \(30\), mostly issues \(25\)/);
  });

  test("zéro appel : le total seul", () => {
    const ligne = poserLesAppels(doc, { total: 0, topProject: null, topKind: null });
    assert.match(ligne.textContent ?? "", /GitHub calls, last hour: 0$/);
  });

  test("absents : un tiret neutre, et son survol", () => {
    const ligne = poserLesAppels(doc, undefined);
    assert.equal(ligne.dataset.appels, "absents");
    assert.match(ligne.textContent ?? "", /GitHub calls, last hour: —/);
    assert.ok(ligne.dessous("button").length > 0, "le survol dit pourquoi");
  });
});

describe("sur la page de la station", () => {
  const BOX: StationVue = { id: "g1", nom: "box", machine: "Linux 6.1.0", coeurs: 8, etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.4.0", projets: [], max: null };
  const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", depot: "benomite/parade", base: "main" };

  async function laPage(appels: LigneDeStation["appels"]) {
    const ligne: LigneDeStation = { id: "g1", nom: "box", ton: "vert", dit: "online", phrase: "online", survol: "", ...(appels === undefined ? {} : { appels }) };
    const accueil: Accueil = { projets: [], stations: [ligne], sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
    const demarrage = () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
      stations: { a: A, stations: [BOX] } satisfies VuDesStations,
      accueil,
      projetsDesStations: undefined,
    });
    const jouee = await jouerLaVue({ demarrage: demarrage as never, espace: () => [], autoriserSurGitHub: () => true });
    (jouee.element("accueil-stations").dessous("button")[0] ?? assert.fail("pas de ligne de station")).click();
    await repos();
    return jouee.element("station");
  }

  test("les appels de l'heure et le plus gros consommateur sont sur la page", async () => {
    const page = await laPage(APPELS);
    const ligne = page.dessous("p").find((p) => p.className === "appels-de-la-station") ?? assert.fail("pas de ligne d'appels");
    assert.match(ligne.textContent ?? "", /GitHub calls, last hour: 42 — most from parade \(30\), mostly issues \(25\)/);
  });

  test("sans chiffres : la page se dessine et la ligne dit un tiret", async () => {
    const page = await laPage(undefined);
    const ligne = page.dessous("p").find((p) => p.className === "appels-de-la-station") ?? assert.fail("pas de ligne d'appels");
    assert.match(ligne.textContent ?? "", /GitHub calls, last hour: —/);
  });
});
