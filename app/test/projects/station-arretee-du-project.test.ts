// La page d'un projet ne dit jamais « No station cooks » à côté d'une panne qui nomme sa station (#3472) : la station
// que la panne du rail nomme est celle qui le sert, arrêtée ou non — la ligne la nomme, et « choose its machine » ne
// s'offre pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBar } from "../../src/bar.ts";
import type { Read } from "../../src/box.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { calibrationRecommande, EFFORTS, MODELES, type VuDesProjects } from "../../src/projects/projects.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-13T10:04:12.000Z";
const FACTS: Facts = {
  etat: "ouverte",
  lu: "2026-11-13T10:04:11.000Z",
  dernierTick: "2026-11-13T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};
const OUTAGE = (stations: string[], raison = "arretee") => ({ raison, phrase: `Station ${stations.join(", ")} is stopped, so no cook can start. Start it on its computer.`, geste: "demarrer-la-station", stations });

const SILENCIEUSE = { station: "macbook-air-de-benoit/claude", distante: false, plafond: null, ordinaires: false, bacASable: null, prendOrdinaires: false, cuisson: "stopped", cooks: [], vueLe: A };
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "secondes", dossier: "/tmp/secondes", depot: "benomite/secondes", base: "main" }] }, () => false),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  // Les stations du compte, lues, sans que l'app en connaisse une qui serve le projet : seul `facts` dit celle qui le sert.
  stations: { a: A, stations: [] } satisfies VuDesStations,
  projetsDesStations: { a: A, projets: [], recommandee: null, avertissements: {}, machines: {}, calibrage: calibrationRecommande([]) } as VuDesProjects,
});
async function ouvrir(facts?: unknown): Promise<{ vue: Jouee; bloc: ReturnType<Jouee["element"]> }> {
  const vue = await jouerLaVue({ demarrage, espace: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  if (facts !== undefined) {
    const read: Read = { projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] };
    vue.dire("surFaits", { ...holdFacts().recevoir(read), demande: vue.dernier("faits")[0] as number });
    await repos();
  }
  return { vue, bloc: vue.element("stations-du-projet") };
}

test("la panne nomme la station arrêtée : l'étiquette de Stations la nomme, jamais « No station cooks »", async () => {
  const { vue, bloc } = await ouvrir({ ...FACTS, stations: [SILENCIEUSE], attenteDuRail: OUTAGE(["macbook-air-de-benoit/claude"]) });
  const texte = bloc.textContent;
  assert.equal(vue.element("etiquette-de-station").textContent, "macbook-air-de-benoit/claude · stopped");
  assert.doesNotMatch(texte, /No station cooks/);
  assert.equal(bloc.dessous("button").some((button) => button.textContent === "choose its machine"), false);
});

test("la panne du rail bloqué nomme la station : « Cooks on », le geste une seule fois, pas « choose its machine »", async () => {
  const blocked = { tickets: [4], depuis: A, cause: "arretee", stations: ["macbook-air-de-benoit/claude"], geste: "demarrer-la-station", constat: "queued", phrase: "Station macbook-air-de-benoit/claude is stopped, so no cook can start. Start it on its computer." };
  const { vue, bloc } = await ouvrir({ ...FACTS, stations: [SILENCIEUSE], railBloque: blocked });
  assert.equal(vue.element("etiquette-de-station").textContent, "macbook-air-de-benoit/claude · stopped");
  assert.doesNotMatch(bloc.textContent, /No station cooks/);
  assert.equal(bloc.dessous("button").some((button) => button.textContent === "choose its machine"), false);
  assert.equal((bloc.textContent.match(/Start it on its computer/g) ?? []).length, 0);
});

const boutons = (bloc: ReturnType<Jouee["element"]>) => bloc.dessous("button").map((button) => button.textContent);

test("une station arrêtée, la file vide : aucune panne, et la page la nomme — jamais « No station cooks », jamais « choose its machine » (secondes)", async () => {
  const { vue, bloc } = await ouvrir({ ...FACTS, stations: [SILENCIEUSE] });
  assert.equal(vue.element("etiquette-de-station").textContent, "macbook-air-de-benoit/claude · stopped");
  assert.doesNotMatch(bloc.textContent, /No station cooks/);
  assert.equal(boutons(bloc).includes("choose its machine"), false);
});

test("secondes : la station arrêtée est nommée par la ligne des stations, et le geste qui la démarre ne se dit qu'une fois dans la page", async () => {
  const { vue, bloc } = await ouvrir({ ...FACTS, stations: [SILENCIEUSE], attenteDuRail: OUTAGE(["macbook-air-de-benoit/claude"]) });
  assert.equal(vue.element("etiquette-de-station").textContent, "macbook-air-de-benoit/claude · stopped");
  assert.equal((bloc.textContent.match(/Start it on its computer/g) ?? []).length, 0);
  assert.doesNotMatch(bloc.textContent, /No station cooks/);
  assert.equal(boutons(bloc).includes("choose its machine"), false);
  // Au plus une ligne d'état au-dessus des colonnes (#3523) : la phrase de la panne et son bouton, jamais deux fois.
  assert.ok((vue.element("rail").textContent.match(/Start it on its computer/g) ?? []).length <= 1, "la phrase de la panne, sans bouton : un seul geste");
});

test("« choose its machine » ne s'offre que sans station : aucune n'a servi le projet, ou celle qui le servait est retirée", async () => {
  const { vue, bloc } = await ouvrir({ ...FACTS, stations: [] });
  assert.match(bloc.textContent, /No station cooks/);
  assert.equal(boutons(bloc).includes("choose its machine"), true);
  // Une station le sert, arrêtée : le bouton s'en va et la station est nommée.
  const read = (facts: unknown): Read => ({ projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...holdFacts().recevoir(read({ ...FACTS, stations: [SILENCIEUSE] })), demande: vue.dernier("faits")[0] as number });
  await repos();
  assert.equal(vue.element("etiquette-de-station").textContent, "macbook-air-de-benoit/claude · stopped");
  assert.equal(boutons(bloc).includes("choose its machine"), false);
  // Retirée : la ligne et le bouton reviennent.
  vue.dire("surFaits", { ...holdFacts().recevoir(read({ ...FACTS, stations: [] })), demande: vue.dernier("faits")[0] as number });
  await repos();
  assert.match(bloc.textContent, /No station cooks/);
  assert.equal(boutons(bloc).includes("choose its machine"), true);
});
