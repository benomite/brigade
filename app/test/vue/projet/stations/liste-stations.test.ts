// L'onglet Stations (#2487, épique #2484) : la liste des stations du projet, celle d'aujourd'hui (stations-de-cuisson.js),
// et « Add a station », qui ouvre sur place le parcours d'ajout — l'étape « station » du parcours d'un projet, cet ordinateur
// d'abord. Les modules sont joués avec le faux élément de l'app ; l'étape est un double qui tient le contrat de
// `poserEtapeStation` (parcours-projet/etape-station.js, #2477) : cet ordinateur en tête s'il est proposé, puis les stations.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LigneDeStation } from "../../../../src/cuisson.ts";
import type { StationEnregistree } from "../../../../src/stations-du-compte.ts";
import { ANNULER, poserAjoutStation, stationsAProposer, TITRE, TOUTES_Y_SONT, type DonneesDeLEtape } from "../../../../src/vue/projet/stations/AjoutStation.js";
import { AJOUTEE, AJOUTER, poserBlocListeStations } from "../../../../src/vue/projet/stations/ListeStations.js";
import { poserLesStations } from "../../../../src/vue/stations-de-cuisson.js";
import { Faux, repos } from "../../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const DEPOT = "chef/parade";

const station = (name: string, available = true): StationEnregistree => ({
  id: `gist-${name}`,
  name,
  platform: "linux",
  machine: name,
  version: "1",
  account: "chef",
  available,
  registeredAt: "2026-11-01T00:00:00.000Z",
  lastSeen: "2026-11-05T00:00:00.000Z",
  stoppedAt: null,
  refreshMs: 30_000,
  selection: null,
});
const ligne = (nom: string): LigneDeStation => ({ station: nom, distante: nom !== "box", etat: "cooking", dit: "takes tickets", survol: "", cooks: [], agents: [], geste: null });

// Tous les éléments sous `racine`, elle comprise.
const tous = (racine: Faux): Faux[] => [racine, ...racine.children.flatMap(tous)];
const bouton = (racine: Faux, texte: string): Faux => tous(racine).find((pose) => pose.balise === "button" && pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const boutons = (racine: Faux): string[] => tous(racine).filter((pose) => pose.balise === "button").map((pose) => pose.textContent);

// Le double de l'étape « station » : ce qu'elle a reçu, et un bouton par machine — cet ordinateur d'abord, s'il est
// proposé — dont le clic fait le geste de l'étape puis passe à la suite.
function etapeDouble() {
  const recues: DonneesDeLEtape[] = [];
  const etape = (fabrique: typeof doc, donnees: DonneesDeLEtape) => {
    recues.push(donnees);
    const racine = fabrique.createElement("section");
    racine.className = "etape-station";
    const machine = (nom: string, geste: () => Promise<unknown>) => {
      const clic = fabrique.createElement("button");
      clic.textContent = nom;
      clic.addEventListener("click", () => void geste().then(() => donnees.suivante(nom)));
      racine.append(clic);
    };
    const { servirIci } = donnees;
    if (servirIci !== undefined) machine(donnees.ici, () => servirIci(donnees.depot));
    if (Array.isArray(donnees.stations)) for (const une of donnees.stations as readonly StationEnregistree[]) machine(une.name, () => donnees.choisir(une.id, [...(une.selection ?? []), donnees.depot]));
    return racine;
  };
  return { etape, recues };
}

describe("le parcours d'ajout d'une station", () => {
  test("il pose l'étape du parcours d'un projet : cet ordinateur proposé d'abord, puis les stations qui ne cuisent pas le projet", () => {
    const { etape, recues } = etapeDouble();
    const pose = poserAjoutStation(doc, {
      projet: "parade",
      depot: DEPOT,
      ici: "this Mac",
      nomIci: "macbook",
      stations: [station("box"), station("macbook"), station("atelier")],
      servantes: ["box"],
      servirIci: async () => ({ depots: [DEPOT] }),
      choisir: async () => ({ selection: [DEPOT] }),
      etape,
      fini: () => {},
      annuler: () => {},
    });
    assert.equal(pose.children[0]?.textContent, TITRE("parade"));
    assert.equal(recues.length, 1);
    const recue = recues[0] ?? assert.fail();
    assert.equal(recue.depot, DEPOT);
    assert.equal(recue.ici, "this Mac");
    assert.equal(recue.nomIci, "macbook");
    assert.ok(recue.servirIci !== undefined, "cet ordinateur est proposé");
    // La box cuit déjà le projet : elle n'est plus proposée. Cet ordinateur, lui, l'est en tête — l'étape le retire de la liste.
    assert.deepEqual((recue.stations as StationEnregistree[]).map(({ name }) => name), ["macbook", "atelier"]);
    assert.deepEqual(boutons(pose), ["this Mac", "macbook", "atelier", ANNULER]);
  });

  test("cet ordinateur qui cuit déjà le projet ne se propose pas ; toutes les stations y étant, une ligne le dit", () => {
    const { etape, recues } = etapeDouble();
    const servirIci = async () => ({ depots: [DEPOT] });
    const choisir = async () => ({ selection: [DEPOT] });
    const autre = poserAjoutStation(doc, { projet: "parade", depot: DEPOT, ici: "this Mac", nomIci: "MacBook", stations: [station("box"), station("macbook"), station("atelier")], servantes: ["box", "macbook"], servirIci, choisir, etape, fini: () => {}, annuler: () => {} });
    assert.equal(recues[0]?.servirIci, undefined);
    assert.deepEqual(boutons(autre), ["atelier", ANNULER]);

    const toutes = poserAjoutStation(doc, { projet: "parade", depot: DEPOT, ici: "this Mac", nomIci: "macbook", stations: [station("box"), station("macbook")], servantes: ["box", "macbook"], servirIci, choisir, etape, fini: () => {}, annuler: () => {} });
    assert.equal(recues.length, 1, "l'étape ne se pose pas : il n'y a rien à proposer");
    assert.ok(toutes.textContent.includes(TOUTES_Y_SONT));
  });

  test("les stations à proposer : celles qui ne cuisent pas le projet, sans égard à la casse", () => {
    assert.deepEqual(stationsAProposer([station("Box"), station("atelier")], ["box"]).map(({ name }) => name), ["atelier"]);
  });
});

describe("l'onglet Stations", () => {
  const options = { enCours: new Map(), dits: new Map(), jouer: () => {}, pastille: (mot: string) => Object.assign(new Faux("span"), { textContent: mot }) };

  test("la liste est celle d'aujourd'hui : le bloc pose l'élément que la vue lui donne, tel quel", () => {
    const liste = poserLesStations(doc, { ...options, lignes: [ligne("box")] });
    const bloc = poserBlocListeStations(doc, { liste: () => liste });
    assert.equal(bloc.children[0]?.textContent, "Stations");
    assert.equal(bloc.children[1]?.children[0], liste);
    assert.deepEqual(boutons(bloc).includes(AJOUTER), false, "sans ajout, pas de bouton");
  });

  test("« Add a station » ouvre le parcours dans l'onglet, cet ordinateur d'abord ; fini, la station ajoutée est dans la liste", async () => {
    const lignes = [ligne("box")];
    const { etape } = etapeDouble();
    const servis: string[] = [];
    let relues = 0;
    const bloc = poserBlocListeStations(doc, {
      liste: () => poserLesStations(doc, { ...options, lignes }),
      ajout: {
        projet: "parade",
        depot: DEPOT,
        ici: "this Mac",
        nomIci: "macbook",
        stations: [station("box"), station("macbook"), station("atelier")],
        servantes: lignes.map(({ station: nom }) => nom),
        servirIci: async (depot) => {
          servis.push(depot);
          return { depots: [depot] };
        },
        choisir: async () => ({ selection: [DEPOT] }),
        etape,
        // La vue relit les stations du projet : celle de cet ordinateur cuit désormais le projet.
        relire: async () => {
          relues += 1;
          lignes.push(ligne("macbook"));
        },
      },
    });
    assert.ok(!bloc.textContent.includes("macbook"));
    bouton(bloc, AJOUTER).click();
    // Le parcours est ouvert dans le bloc, sans quitter l'onglet ; le bouton qui l'ouvre ne se montre plus.
    assert.ok(bloc.textContent.includes(TITRE("parade")));
    const ouvrir = tous(bloc).find((pose) => pose.className === "ajouter-une-station") ?? assert.fail();
    assert.equal(ouvrir.hidden, true);
    const parcours = tous(bloc).find((pose) => pose.className === "parcours-ajout-station") ?? assert.fail();
    assert.equal(boutons(parcours)[0], "this Mac", "cet ordinateur est le premier choix");

    bouton(bloc, "this Mac").click();
    while (relues === 0) await repos();
    await repos();
    assert.deepEqual(servis, [DEPOT]);
    assert.equal(ouvrir.hidden, false);
    assert.ok(!bloc.textContent.includes(TITRE("parade")), "le parcours se referme");
    assert.ok(bloc.textContent.includes(AJOUTEE("this Mac")));
    const liste = bloc.children[1]?.children[0] ?? assert.fail();
    assert.equal(liste.className, "stations-de-cuisson");
    assert.ok(liste.textContent.includes("macbook"), "la station ajoutée est dans la liste");
  });

  test("« cancel » referme le parcours sans rien écrire", () => {
    const { etape } = etapeDouble();
    let ecrit = 0;
    const bloc = poserBlocListeStations(doc, {
      ajout: { projet: "parade", depot: DEPOT, ici: "this Mac", stations: [station("atelier")], servantes: [], choisir: async () => ((ecrit += 1), { selection: [] }), etape, relire: async () => {} },
    });
    bouton(bloc, AJOUTER).click();
    bouton(bloc, ANNULER).click();
    assert.ok(!bloc.textContent.includes(TITRE("parade")));
    assert.deepEqual(boutons(bloc), [AJOUTER]);
    assert.equal(ecrit, 0);
  });
});
