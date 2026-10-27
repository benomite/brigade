// Un ordinateur ajouté depuis l'accueil à un projet qu'une station sert déjà (#1790, épique 1785) : le runtime le fait
// rejoindre la cuisine qui tourne, ou refuse en une phrase (#1789, runtime/src/projets/rejoindre.ts), et l'écrit dans le
// suivi du gist de la station (`rejoindre`). L'app l'y lit (stations-du-compte.ts) : rejoint, l'ordinateur est une station
// de plus du projet — sous « Its stations », à côté de la première, sans cuisine à lui ; refusé, la phrase se lit sous sa
// case au moment de l'ajout, et les stations du projet ne changent pas. Les suivis sont écrits par les fonctions mêmes du
// runtime (`issueDeLAjout`, `rejoindreDe`, `documentDeSuivi`) : ce que l'app lit est ce que la station publiera.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationAppairee } from "../../../runtime/src/appairage/stations-du-chef.ts";
import * as contrat from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDuGist } from "../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { documentDeSuivi, FICHIER_SUIVI, type SuiviDuProjet } from "../../../runtime/src/projets/demande.ts";
import { issueDeLAjout, rejoindreDe } from "../../../runtime/src/projets/rejoindre.ts";
import { type Accueil, type LigneDeStation, ligneDeStation } from "../../src/accueil.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE, type Projet } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import type { Faits as FaitsDuRuntime } from "../../../runtime/src/etat.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ajoutsDuSuivi, avecLeursAjouts, type StationEnregistree, type StationsDuCompte } from "../../src/stations-du-compte.ts";
import type { StationVue, VuDesStations } from "../../src/stations/stations.ts";
import { DEMANDEE, REFUSEE, REJOINTE } from "../../src/vue/stations-du-compte.js";
import { type Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../aides/fausse-vue.ts";

const VU = "2026-10-27T08:42:00.000Z";
const LU = Date.parse(VU) + 1_000;
const DEPOT = "benomite/brigade";

// L'enregistrement qu'une station publie, et sa sélection, tels quels (runtime/src/enregistrement-station/README.md).
const enregistrement = (name: string, platform: string, machine: string) =>
  JSON.stringify({ brigade: "station-registration", format: 1, name, platform, machine, version: "1.4.0", registeredAt: "2026-10-26T09:00:00.000Z", lastSeen: VU, refreshMs: 120_000, stoppedAt: null });
const selection = (repositories: string[]) => JSON.stringify({ brigade: "station-selection", format: 1, repositories, updatedAt: VU });
function lue(id: string, fichiers: Record<string, string>): StationEnregistree {
  const station = stationDuGist(id, fichiers, "chef", LU);
  return "illisible" in station ? assert.fail(station.illisible) : station;
}

// parade-box sert brigade, appairée sous le gist f0a1 ; le Mac vient de cocher benomite/brigade sur l'accueil.
const BOX_APPAIREE: StationAppairee = { id: "f0a1", name: "parade-box", machine: "Debian 12", kind: null, cooks: true, version: "1.4.0", online: true, lastSeen: VU, stoppedAt: null, projects: [{ name: "brigade", repository: DEPOT }] };
// Ce que le runtime du Mac décide de l'ajout, d'après les stations appairées du compte : parade-box en ligne, il en
// rejoint la cuisine ; arrêtée, il refuse.
const issue = (box: StationAppairee) => {
  const decidee = issueDeLAjout({ etat: { state: "listed", stations: [box], unreadable: [] }, gists: new Map() }, DEPOT, { nom: "macbook", gist: "f0b2" });
  return decidee.issue === "seule" ? assert.fail("le Mac se croit seul") : rejoindreDe(decidee);
};
const REJOINT = issue(BOX_APPAIREE);
const REFUSE = issue({ ...BOX_APPAIREE, online: false, stoppedAt: "2026-10-27T08:30:00.000Z" });
const PHRASE = REFUSE.issue === "refusee" ? REFUSE.phrase : assert.fail("pas refusé");

// Le suivi que le Mac écrit dans son gist, tel que `tenir.ts` le pose : rejoint, le projet y est secondaire et cuit sur
// parade-box ; refusé, il y est refusé, avec la même phrase.
const suiviDuMac = (rejoindre: SuiviDuProjet["rejoindre"]) =>
  documentDeSuivi(
    [
      rejoindre?.issue === "rejointe"
        ? { nom: "brigade", etat: "secondaire", dit: `joined the kitchen that ${rejoindre.principale} runs`, autoriser: [], serviLe: null, cuitSur: rejoindre.principale, rejoindre }
        : { nom: "brigade", etat: "refuse", dit: PHRASE, autoriser: [], serviLe: null, ...(rejoindre === undefined ? {} : { rejoindre }) },
    ],
    LU,
    { nom: "macbook", locale: true },
  );

const BOX = lue("e3e5", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("parade-box", "linux", "Linux 6.1.0"), [contrat.FICHIER_SELECTION]: selection([DEPOT]) });
const macAvec = (fichiers: Record<string, string> = {}) => lue("e1c3", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("macbook", "macos", "macOS 25.0.0"), [contrat.FICHIER_SELECTION]: selection([DEPOT]), ...fichiers });

describe("l'app lit, dans le gist de chaque station, ce qu'elle a fait des dépôts choisis pour elle", () => {
  test("rejoint : la cuisine de la principale ; refusé : la phrase du runtime ; servi seul : rien de plus ; pas encore lu : rien", () => {
    assert.deepEqual(ajoutsDuSuivi(suiviDuMac(REJOINT), [DEPOT]), [{ depot: DEPOT, issue: "rejointe", principale: "parade-box" }]);
    assert.deepEqual(ajoutsDuSuivi(suiviDuMac(REFUSE), [DEPOT]), [{ depot: DEPOT, issue: "refusee", phrase: PHRASE }]);
    assert.match(PHRASE, /^benomite\/brigade is already served by parade-box, which is not reached/);
    // La station le sert elle-même : son suivi ne porte pas `rejoindre`.
    const seule = documentDeSuivi([{ nom: "brigade", etat: "servi", dit: "served", autoriser: [], serviLe: VU }], LU);
    assert.deepEqual(ajoutsDuSuivi(seule, [DEPOT]), [{ depot: DEPOT, issue: "seule" }]);
    assert.deepEqual(ajoutsDuSuivi(undefined, [DEPOT]), []);
    assert.deepEqual(ajoutsDuSuivi(suiviDuMac(REJOINT), ["acme/shop"]), [], "un dépôt que la station n'a pas encore lu n'y est pas");
  });

  test("les stations du compte en reviennent avec leurs ajouts ; un gist illisible les laisse telles que le runtime les a lues", async () => {
    const mac = macAvec();
    const lues: StationsDuCompte = { state: "listed", stations: [BOX, mac], unreadable: [] };
    const gists: Record<string, Record<string, string>> = { [mac.id]: { [FICHIER_SUIVI]: suiviDuMac(REJOINT) } };
    const lus: string[] = [];
    const avec = await avecLeursAjouts(lues, async (id) => {
      lus.push(id);
      if (id === BOX.id) throw new Error("HTTP 502");
      return gists[id] ?? null;
    });
    assert.equal(avec.state, "listed");
    if (avec.state !== "listed") return;
    assert.deepEqual(avec.stations.find(({ id }) => id === mac.id)?.ajouts, [{ depot: DEPOT, issue: "rejointe", principale: "parade-box" }]);
    assert.deepEqual(avec.stations.find(({ id }) => id === BOX.id), BOX);
    // Une station à qui rien n'est choisi ne coûte aucune lecture.
    const sansChoix = lue("a0a0", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("nas", "linux", "Linux 6.1.0") });
    lus.length = 0;
    await avecLeursAjouts({ state: "listed", stations: [sansChoix], unreadable: [] }, async (id) => (lus.push(id), null));
    assert.deepEqual(lus, []);
  });
});

// La vue jouée : brigade, projet de l'app, cuit sur parade-box ; le Mac est la station de cet ordinateur.
const BRIGADE: Projet = { nom: "brigade", dossier: "/tmp/brigade", depot: DEPOT, base: "v2", box: { hote: "parade-box" } };
const presence = (id: string, nom: string, machine: string, projets: string[]): StationVue => ({ id, nom, machine, etat: "en-ligne", ligne: "", pannes: [], dit: "online", version: "1.4.0", projets, max: null });
const APPAIREES = [presence("f0a1", "parade-box", "Debian 12", ["brigade"]), presence("f0b2", "macbook", "macOS 25.0.0", [])];
const STATIONS: VuDesStations = { a: VU, stations: APPAIREES };
const ACCUEIL: Accueil = { projets: [], stations: APPAIREES.map((station): LigneDeStation => ligneDeStation(station, 0, false)), sante: { ton: "vert", dit: "Max ✓  ·  GitHub ✓", survol: "" } };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [BRIGADE], hotes: ["parade-box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  stations: STATIONS,
  accueil: ACCUEIL,
});

// L'app, ses stations du compte lues comme main.ts les lit : par le runtime, puis leurs ajouts dans leur gist.
async function jouer(gistDuMac: () => Record<string, string>, selectionDuMac: () => string[] = () => [DEPOT]) {
  const lire = async (): Promise<StationsDuCompte> => {
    const mac = lue("e1c3", { [contrat.FICHIER_ENREGISTREMENT]: enregistrement("macbook", "macos", "macOS 25.0.0"), [contrat.FICHIER_SELECTION]: selection(selectionDuMac()) });
    return avecLeursAjouts({ state: "listed", stations: [BOX, mac], unreadable: [] }, async (id) => (id === mac.id ? gistDuMac() : null));
  };
  const vue = await jouerLaVue({ demarrage, espace: () => [], stationsDuCompte: lire, depotsDuChef: () => ({ depots: [{ depot: DEPOT, base: "v2" }] }), choisirLesProjets: async (_id: string, depots: string[]) => ({ selection: depots }) });
  vue.element("entree-tous").click();
  await repos();
  return vue;
}
const sections = (vue: Jouee) => vue.element("accueil-stations");
async function pageDuMac(vue: Jouee) {
  const ligne = sections(vue).dessous("button").find((bouton) => bouton.className === "ligne" && bouton.dessous("strong")[0]?.textContent === "macbook") ?? assert.fail("pas de ligne macbook");
  ligne.click();
  await repos();
  return vue.element("station");
}
const caseDe = (page: Faux) => page.dessous("label").find((label) => label.className.startsWith("capacite") && label.dessous("input")[0]?.ariaLabel === DEPOT) ?? assert.fail(`pas de case ${DEPOT}`);
// Ce que `facts` de parade-box rend de ses stations (runtime/src/etat.ts) : les siennes, et celles qu'elle déclare.
type DuRuntime = FaitsDuRuntime["stations"][number];
const station = (nom: string, distante = false): DuRuntime => ({ station: nom, distante, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [] });
const FAITS: Faits = { etat: "ouverte", lu: VU, dernierTick: VU, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [] };
async function pageDuProjet(vue: Jouee, stations: DuRuntime[] = [station("parade-box/claude")]) {
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case brigade")).click();
  await repos();
  assert.equal(vue.element("espace").textContent, "brigade");
  const dessinable = tenirFaits(() => new Map()).recevoir({ projet: "brigade", demande: 0, a: VU, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations }) }] });
  vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
  await ouvrirOnglet(vue, "Cooks");
  return vue.element("stations-du-projet");
}
// Les stations sous « Its stations » : leur nom, dans l'ordre.
const sesStations = (vue: Jouee) => vue.element("rail").dessous("li").filter((li) => li.className === "station-de-cuisson").map((li) => li.dataset.station);

describe("rejoint : l'ordinateur ajouté est une station de plus de la cuisine qui tourne", () => {
  test("sur la page du Mac, sa case dit la cuisine qu'il a rejointe", async () => {
    const vue = await jouer(() => ({ [FICHIER_SUIVI]: suiviDuMac(REJOINT) }));
    const coche = caseDe(await pageDuMac(vue));
    assert.equal(coche.dessous("input")[0]?.checked, true);
    assert.equal(coche.dessous("small")[0]?.textContent, REJOINTE("parade-box"));
    assert.doesNotMatch(vue.element("station").textContent, new RegExp(REFUSEE));
  });

  test("sur la page du projet, la première station et le Mac sont sous « Its stations », et rien ne dit que la cuisine tourne ici", async () => {
    const vue = await jouer(() => ({ [FICHIER_SUIVI]: suiviDuMac(REJOINT) }));
    const bloc = await pageDuProjet(vue);
    assert.deepEqual(sesStations(vue), ["parade-box/claude", "macbook"]);
    const ligne = vue.element("rail").dessous("li").find((li) => li.dataset.station === "macbook") ?? assert.fail("pas de ligne macbook");
    // Une station de cuisson, pas la principale : parade-box garde le manager et la pass.
    assert.match(ligne.textContent, /^macbookcooking station/);
    // En tête : il cuit sur parade-box, le Mac en renfort.
    assert.match(bloc.textContent, /^Cooks on parade-box · macbook \(second station\)/);
    assert.doesNotMatch(bloc.textContent, /its kitchen stops when you close the app/);
    assert.doesNotMatch(bloc.textContent, /was not added/);
  });

  test("parade-box le déclare déjà dans sa cuisine : le Mac n'y est qu'une fois, sous le nom qu'elle lui donne", async () => {
    const vue = await jouer(() => ({ [FICHIER_SUIVI]: suiviDuMac(REJOINT) }));
    await pageDuProjet(vue, [station("parade-box/claude"), station("macbook/claude", true)]);
    assert.deepEqual(sesStations(vue), ["parade-box/claude", "macbook/claude"]);
  });
});

describe("refusé : la phrase du runtime au moment de l'ajout, et le projet tel qu'il était", () => {
  test("coché sur la page du Mac : la case dit qu'il attend la réponse de la station, puis le refus et sa phrase entière", async () => {
    let choisi: string[] = [];
    let repondu = false;
    const vue = await jouer(
      (): Record<string, string> => (repondu ? { [FICHIER_SUIVI]: suiviDuMac(REFUSE) } : {}),
      () => choisi,
    );
    const page = await pageDuMac(vue);
    const coche = caseDe(page).dessous("input")[0] ?? assert.fail("pas de case");
    assert.equal(coche.checked, false);
    coche.checked = true;
    coche.declencher("change");
    await repos();
    choisi = [DEPOT];
    assert.deepEqual(vue.dernier("choisirLesProjets"), ["e1c3", [DEPOT]]);
    assert.equal(caseDe(vue.element("station")).dessous("small")[0]?.textContent, DEMANDEE);
    // La station répond : à la relecture suivante des stations du compte, son refus se lit sous la case.
    repondu = true;
    vue.element("entree-tous").click();
    await repos();
    const relue = await pageDuMac(vue);
    assert.equal(caseDe(relue).dessous("small")[0]?.textContent, REFUSEE);
    const dite = relue.dessous("p").filter(({ className }) => className === "refus");
    assert.deepEqual(dite.map(({ textContent }) => textContent), [PHRASE]);
    assert.equal(dite[0]?.role, "alert");
  });

  test("sur la page du projet, ses stations ne changent pas, et la phrase dit pourquoi le Mac n'y est pas", async () => {
    const vue = await jouer(() => ({ [FICHIER_SUIVI]: suiviDuMac(REFUSE) }));
    const bloc = await pageDuProjet(vue);
    assert.deepEqual(sesStations(vue), ["parade-box/claude"]);
    assert.match(bloc.textContent, /^Cooks on parade-box/);
    assert.doesNotMatch(bloc.textContent, /second station|its kitchen stops when you close the app/);
    const refus = bloc.dessous("div").find(({ className }) => className === "ajout-refuse") ?? assert.fail("pas de refus");
    assert.equal(refus.hidden, false);
    assert.equal(refus.textContent, `macbook was not added: ${PHRASE}`);
  });
});
