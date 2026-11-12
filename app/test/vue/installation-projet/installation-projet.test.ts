// Un projet dont la mise en place vient de passer, qu'aucune station ne sert (#3400, épique #3396) : sa page demande
// aussitôt quelle station le sert, cet ordinateur en tête. D'abord l'état tenu et la question devant un faux document ;
// puis la vue jouée entière (vue.js tel qu'il est, un faux pont) : « Add a project », un dépôt choisi et donné à une station
// du compte hors ligne, sa mise en place lue pas faite ; sa PR de mise en place mergée, la lecture suivante le dit prêt —
// aucune station ne le sert, la question vient, et « this computer » l'ajoute à la liste que sert cet ordinateur, le geste
// de Settings (`servirUnProjet`).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE, type Projet } from "../../../src/config.ts";
import type { StationEnregistree } from "../../../../runtime/src/enregistrement-station/stations-du-compte.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import type { VuDesStations } from "../../../src/stations/stations.ts";
import type { Terminal } from "../../../src/terminaux.ts";
import { FERMER, PERSONNE, PLUS_TARD, poserLaDemandeDeStation, QUESTION, SERVI_ICI, SERVI_PAR, tenirLesDemandesDeStation } from "../../../src/vue/installation-projet/installation-projet.js";
import { ICI, type Choix } from "../../../src/vue/stations-tab/choix.js";
import { Faux, jouerLaVue, type Jouee, type Reponses, repos } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const DEPOT = "chef/secondes";
const boutons = (ou: Faux) => ou.dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent);
const bouton = (ou: Faux, texte: string) => ou.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${boutons(ou).join(", ")}`);

describe("l'état tenu", () => {
  test("pas préparé puis préparé : à juger ; servi, rien n'est demandé ; sinon, la question", () => {
    const rendus: string[] = [];
    const demandes = tenirLesDemandesDeStation({ rendre: (projet) => void rendus.push(projet) });
    demandes.preparation("secondes", "manque");
    assert.equal(demandes.de("secondes"), undefined);
    demandes.preparation("secondes", "prepare");
    assert.deepEqual(demandes.de("secondes"), { etape: "a-juger" });
    demandes.juger("secondes", false);
    assert.deepEqual(demandes.de("secondes"), { etape: "question" });

    demandes.preparation("cantine", "en-route");
    demandes.preparation("cantine", "prepare");
    demandes.juger("cantine", true);
    assert.equal(demandes.de("cantine"), undefined);
    assert.deepEqual(rendus, ["secondes", "secondes", "cantine", "cantine"]);
  });

  test("prêt d'emblée, sans avoir été lu pas préparé : rien n'est demandé", () => {
    const demandes = tenirLesDemandesDeStation({ rendre: () => {} });
    demandes.preparation("secondes", "prepare");
    assert.equal(demandes.de("secondes"), undefined);
  });

  test("« not now » : la question part, et ne revient pas tant que l'app tourne", () => {
    const demandes = tenirLesDemandesDeStation({ rendre: () => {} });
    demandes.preparation("secondes", "manque");
    demandes.preparation("secondes", "prepare");
    demandes.juger("secondes", false);
    demandes.ecarter("secondes");
    assert.equal(demandes.de("secondes"), undefined);
    demandes.preparation("secondes", "manque");
    demandes.preparation("secondes", "prepare");
    demandes.juger("secondes", false);
    assert.equal(demandes.de("secondes"), undefined);
  });

  test("le choix : en cours, puis servi — ou refusé en une ligne, les boutons rendus", () => {
    const demandes = tenirLesDemandesDeStation({ rendre: () => {} });
    demandes.preparation("secondes", "manque");
    demandes.preparation("secondes", "prepare");
    demandes.juger("secondes", false);
    demandes.choisir("secondes", "g1");
    assert.deepEqual(demandes.de("secondes"), { etape: "enCours", cle: "g1" });
    demandes.choisi("secondes", { ligne: "nothing was written: GitHub refused", detail: "HTTP 403" }, { nom: "atelier", ici: false, absente: false });
    assert.deepEqual(demandes.de("secondes"), { etape: "refus", ligne: "nothing was written: GitHub refused", detail: "HTTP 403" });
    demandes.choisir("secondes", ICI);
    demandes.choisi("secondes", "ajoutee", { nom: "this computer", ici: true, absente: false });
    assert.deepEqual(demandes.de("secondes"), { etape: "servi", nom: "this computer", ici: true, absente: false });
    demandes.fermer("secondes");
    assert.equal(demandes.de("secondes"), undefined);
  });
});

describe("ce que la page dit", () => {
  const choix: Choix[] = [
    { cle: ICI, nom: "this computer", horsLigne: false, recommande: false, hote: "mac-du-chef" },
    { cle: "g1", nom: "parade-box", horsLigne: false, recommande: true },
  ];
  const gestes = () => {
    const faits: string[] = [];
    return { faits, choisir: (un: Choix) => void faits.push(`choisir ${un.cle}`), ecarter: () => void faits.push("ecarter"), fermer: () => void faits.push("fermer") };
  };

  test("la question, sa raison, un bouton par machine — cet ordinateur en tête — et « not now »", () => {
    const g = gestes();
    const carte = poserLaDemandeDeStation(doc, { depot: DEPOT, etat: { etape: "question" }, choix }, g);
    assert.equal(carte.dessous("h2")[0]?.textContent, QUESTION(DEPOT));
    assert.ok(carte.dessous("p").some(({ textContent }) => textContent === PERSONNE(DEPOT)));
    assert.deepEqual(boutons(carte), ["this computer", "parade-box", PLUS_TARD]);
    bouton(carte, "this computer").click();
    bouton(carte, PLUS_TARD).click();
    assert.deepEqual(g.faits, [`choisir ${ICI}`, "ecarter"]);
  });

  test("un choix qui s'écrit grise les boutons ; refusé, une ligne, les boutons rendus", () => {
    const enCours = poserLaDemandeDeStation(doc, { depot: DEPOT, etat: { etape: "enCours", cle: ICI }, choix }, gestes());
    assert.ok(enCours.dessous("button").filter(({ className }) => className !== "aide").every(({ disabled }) => disabled === true));
    const refus = poserLaDemandeDeStation(doc, { depot: DEPOT, etat: { etape: "refus", ligne: "nothing was written: the list cannot be read", detail: "EACCES" }, choix }, gestes());
    assert.ok(refus.descendants().some(({ textContent }) => textContent === "nothing was written: the list cannot be read"));
    assert.equal(bouton(refus, "this computer").disabled, false);
  });

  test("servi : une phrase — cet ordinateur, dans les deux minutes ; une station du compte ; une station hors ligne — et « close »", () => {
    const g = gestes();
    const ici = poserLaDemandeDeStation(doc, { depot: DEPOT, etat: { etape: "servi", nom: "this computer", ici: true, absente: false }, choix }, g);
    assert.equal(ici.dessous("p")[0]?.textContent, SERVI_ICI(DEPOT));
    assert.deepEqual(boutons(ici), [FERMER]);
    bouton(ici, FERMER).click();
    assert.deepEqual(g.faits, ["fermer"]);
    const autre = poserLaDemandeDeStation(doc, { depot: DEPOT, etat: { etape: "servi", nom: "parade-box", ici: false, absente: false }, choix }, g);
    assert.equal(autre.dessous("p")[0]?.textContent, SERVI_PAR("parade-box", DEPOT));
    const absente = poserLaDemandeDeStation(doc, { depot: DEPOT, etat: { etape: "servi", nom: "atelier", ici: false, absente: true }, choix }, g);
    assert.equal(absente.dessous("p")[0]?.textContent, `atelier is offline: it takes ${DEPOT} when it comes back.`);
  });
});

// La vue jouée entière.
const CHEMIN = "/home/chef/.config/brigade/app.json";
const A = "2026-11-12T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "secondes", genre: "second", titre: "second · claude", note: "", arrete: false };
const MANQUE = { ready: false, missingBindings: ["Gates"], missingLabels: ["fire"] };
const PRETE = { ready: true, missingBindings: [], missingLabels: [] };
const AUCUNE_STATION = { a: A, stations: [] } as unknown as VuDesStations;
// Une station du compte, hors ligne depuis hier : choisie, elle ne sert le projet qu'à son retour.
const ATELIER: StationEnregistree = {
  id: "g1",
  name: "atelier",
  platform: "linux",
  machine: "atelier",
  version: "1.0.0",
  account: "octo-chef",
  available: false,
  registeredAt: "2026-11-01T00:00:00.000Z",
  lastSeen: "2026-11-11T10:00:00.000Z",
  stoppedAt: null,
  refreshMs: 30_000,
  selection: [],
  offlineSince: "2026-11-11T10:00:00.000Z",
};
const demarrage = (stations: VuDesStations | undefined) => () => ({
  configuration: pourLaBarre({ chemin: CHEMIN, projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...(stations === undefined ? {} : { stations }),
});
// Le rail de secondes, lu sur GitHub : ses tickets fire attendent, aucun cook.
const faits = (): Faits => ({
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 9, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
});
const demande = (vue: Jouee) => vue.element("installation-projet");
const parcours = (vue: Jouee) => vue.element("parcours-premier-projet");

// « Add a project », le dépôt chef/secondes, sa page ouverte ; « qui le cuit » répondue par `machine` (`null` : une station
// le sert déjà, elle n'est pas posée) ; sa mise en place
// lue pas faite. `merger()` : la PR de mise en place mergée, la lecture suivante du rail la relit.
async function secondes(machine: string | null, reponses: Reponses = {}, stations: VuDesStations | null = AUCUNE_STATION) {
  let pret = false;
  let vue: Jouee | undefined;
  vue = await jouerLaVue({
    demarrage: demarrage(stations ?? undefined),
    stationsDuChef: () => ({ state: "listed", stations: [], unreadable: [] }),
    compteGitHub: () => ({ login: "octo-chef" }),
    stationsDuCompte: () => ({ state: "listed", stations: [ATELIER], unreadable: [] }),
    choisirLesProjets: (_, depots) => ({ selection: depots }),
    depotsDuChef: () => ({ depots: [{ depot: DEPOT, base: "main" }] }),
    ouvrirDUneStation: (nom, depot, base) => {
      vue?.dire("surConfiguration", pourLaBarre({ chemin: CHEMIN, projets: [{ nom, dossier: `/home/chef/Brigade/${nom}`, depot, base: base ?? "main" } satisfies Projet] }), []);
      return { state: "open", project: nom, repository: depot, folder: `/home/chef/Brigade/${nom}`, cloned: true };
    },
    projetsServis: () => ({ depots: [] }),
    espace: () => [SECOND],
    departDuProjet: () => ({ aucune: true }),
    checkRepoSetup: () => (pret ? PRETE : MANQUE),
    ...reponses,
  });
  (vue.poses().find((pose) => pose.id === "entree-ajout") ?? assert.fail("pas de « + »")).click();
  await repos();
  bouton(vue.element("ajout"), DEPOT).click();
  await repos();
  const jouee = vue;
  const lire = async () => {
    jouee.dire("surFaits", { ...tenirFaits(() => new Map()).recevoir({ projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits()) }] }), demande: jouee.dernier("faits")[0] as number });
    await repos();
    await repos();
  };
  await lire();
  if (machine !== null) {
    bouton(parcours(vue), machine).click();
    await repos();
    await repos();
  }
  assert.equal(vue.element("main").dataset.parcours, "setup", "the setup question is asked");
  return {
    vue,
    merger: async () => {
      pret = true;
      await lire();
    },
  };
}

describe("la vue jouée : la mise en place mergée, aucune station ne le sert", () => {
  test("la question vient aussitôt, cet ordinateur en tête ; un clic l'ajoute à la liste que sert cet ordinateur", async () => {
    const servis: [string, boolean][] = [];
    const { vue, merger } = await secondes("atelier", { servirUnProjet: (depot, servi) => (servis.push([depot, servi]), { depots: [depot] }) });
    // Tant que la mise en place n'est pas faite, rien n'est demandé.
    assert.equal(demande(vue).hidden, true);

    await merger();
    assert.equal(vue.element("main").dataset.parcours, undefined, "the project is ready");
    assert.equal(demande(vue).hidden, false);
    const carte = demande(vue).dessous("section")[0] ?? assert.fail("pas de question");
    assert.equal(carte.dessous("h2")[0]?.textContent, QUESTION(DEPOT));
    assert.ok(carte.dessous("p").some(({ textContent }) => textContent === PERSONNE(DEPOT)));
    assert.deepEqual(boutons(carte), ["this computer", "atelier", PLUS_TARD]);

    bouton(carte, "this computer").click();
    await repos();
    await repos();
    assert.deepEqual(servis, [[DEPOT, true]]);
    const servi = demande(vue).dessous("section")[0] ?? assert.fail("pas de confirmation");
    assert.equal(servi.dataset.etape, "servi");
    assert.equal(servi.dessous("p")[0]?.textContent, SERVI_ICI(DEPOT));
    bouton(servi, FERMER).click();
    await repos();
    assert.equal(demande(vue).hidden, true);
  });

  test("cet ordinateur le sert déjà : rien n'est demandé", async () => {
    let servis: string[] = [];
    const { vue, merger } = await secondes("this computer", {
      projetsServis: () => ({ depots: servis }),
      servirUnProjet: (depot) => ((servis = [depot]), { depots: servis }),
    });
    await merger();
    assert.equal(vue.element("main").dataset.parcours, undefined, "the project is ready");
    assert.equal(demande(vue).hidden, true);
  });

  test("une station dit le servir : rien n'est demandé", async () => {
    const stations = { a: A, stations: [{ id: "g1", nom: "atelier", projets: ["secondes"] }] } as unknown as VuDesStations;
    const { vue, merger } = await secondes(null, {}, stations);
    await merger();
    assert.equal(vue.element("main").dataset.parcours, undefined, "the project is ready");
    assert.equal(demande(vue).hidden, true);
  });

  test("« not now » range la question ; elle ne revient pas aux lectures suivantes", async () => {
    const { vue, merger } = await secondes("atelier");
    await merger();
    bouton(demande(vue), PLUS_TARD).click();
    await repos();
    assert.equal(demande(vue).hidden, true);
    await merger();
    vue.dire("surStations", AUCUNE_STATION);
    await repos();
    assert.equal(demande(vue).hidden, true);
  });

  test("la liste de cet ordinateur ne se lit pas : rien n'est décidé, ni demandé", async () => {
    const { vue, merger } = await secondes("atelier", { projetsServis: () => ({ refus: "this station's served projects cannot be read" }) });
    await merger();
    assert.equal(demande(vue).hidden, true);
  });

  test("les stations pas encore lues : rien n'est décidé ; lues, la question vient", async () => {
    const { vue, merger } = await secondes("atelier", {}, null);
    await merger();
    assert.equal(demande(vue).hidden, true);
    vue.dire("surStations", AUCUNE_STATION);
    await repos();
    assert.equal(demande(vue).hidden, false);
  });
});
