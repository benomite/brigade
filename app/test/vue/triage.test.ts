// Le triage, jour par jour, en tête de la file (#1283, épique #1277) : la vue jouée telle qu'elle est, devant
// un faux document (aides/fausse-vue.ts), sur ce que le process principal range des faits de la box (faits.ts,
// triage.ts). Un jour avec des comptes les montre ; un jour sans activité dit 0 et 0, jamais un blanc.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { poserTriage, SEUL, TITRE, VERS_TODO } from "../../src/vue/triage.js";
import { Faux, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-21T10:04:12.000Z";
const PARADE = "parade";

// Sept jours (UTC), le plus ancien d'abord, tels que `facts` les donne : le 19 sans issue, les autres avec.
const TRIAGE = [
  { day: "2026-10-15", decidedAlone: 4, sentToTodo: 1 },
  { day: "2026-10-16", decidedAlone: 0, sentToTodo: 2 },
  { day: "2026-10-17", decidedAlone: 3, sentToTodo: 0 },
  { day: "2026-10-18", decidedAlone: 1, sentToTodo: 1 },
  { day: "2026-10-19", decidedAlone: 0, sentToTodo: 0 },
  { day: "2026-10-20", decidedAlone: 5, sentToTodo: 2 },
  { day: "2026-10-21", decidedAlone: 2, sentToTodo: 1 },
];

const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-10-21T10:04:11.000Z",
  dernierTick: "2026-10-21T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
  triage: TRIAGE,
};

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
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

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], lireCapture: () => ({ image: "data:image/png;base64,iVBORw0KGgo=" }), ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
// Les faits que la box rend, en JSON, passés par le process principal tel qu'il est : la vue reçoit ce qu'il range.
function recevoir(vue: Jouee, faits: unknown = FAITS) {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}
// Les lignes du triage, en tête de la file : le nom du jour, puis ses deux comptes.
const lignes = (vue: Jouee) =>
  (vue.element("rail").dessous("section").find((pose) => pose.className === "triage") ?? assert.fail("pas de triage en tête de la file")).dessous("li").map((ligne) => ({
    jour: ligne.children[0]?.textContent,
    seul: ligne.children[1]?.children[0]?.textContent,
    versTodo: ligne.children[2]?.children[0]?.textContent,
    libelles: [ligne.children[1]?.children[1]?.textContent, ligne.children[2]?.children[1]?.textContent],
  }));

describe("le triage, jour par jour, dans la file", () => {
  test("chaque jour montre « decided alone » et « sent to TODO », le plus récent d'abord", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const jours = lignes(vue);
    assert.deepEqual(
      jours.map(({ jour, seul, versTodo }) => [jour, seul, versTodo]),
      [["today", "2", "1"], ["yesterday", "5", "2"], ["Oct 19", "0", "0"], ["Oct 18", "1", "1"], ["Oct 17", "3", "0"], ["Oct 16", "0", "2"], ["Oct 15", "4", "1"]],
    );
    for (const { libelles } of jours) assert.deepEqual(libelles, [SEUL, VERS_TODO]);
  });

  test("un jour sans activité dit 0 et 0, jamais un blanc", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const sans = lignes(vue).find(({ jour }) => jour === "Oct 19");
    assert.deepEqual([sans?.seul, sans?.versTodo], ["0", "0"]);
    for (const { seul, versTodo } of lignes(vue)) assert.match(`${seul}${versTodo}`, /^\d+$/);
  });

  test("un runtime qui ne donne pas le triage n'en pose rien", async () => {
    const vue = await ouvrir();
    const { triage: _, ...sans } = FAITS;
    recevoir(vue, sans);
    assert.equal(vue.element("rail").dessous("section").some((pose) => pose.className === "triage"), false);
  });

  test("le module se lit seul, sur un faux document : un titre, et une ligne par jour", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const [section] = poserTriage(doc as never, [{ jour: "today", date: "2026-10-21", decidedAlone: 0, sentToTodo: 0 }]) as Faux[];
    assert.equal(section?.dessous("h4")[0]?.textContent?.startsWith(TITRE), true);
    assert.equal(section?.dessous("li").length, 1);
    assert.deepEqual(poserTriage(doc as never, undefined), []);
  });
});
