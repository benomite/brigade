// La page d'un projet ne dit jamais « No station cooks » à côté d'une panne qui nomme sa station (#3472) : la station
// que la panne du rail nomme est celle qui le sert, arrêtée ou non — la ligne la nomme, et « choose its machine » ne
// s'offre pas.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import type { Lecture } from "../../src/box.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { calibrageRecommande, EFFORTS, MODELES, type VuDesProjets } from "../../src/projets/projets.ts";
import type { VuDesStations } from "../../src/stations/stations.ts";
import { type Jouee, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const A = "2026-11-13T10:04:12.000Z";
const FAITS: Faits = {
  etat: "ouverte",
  lu: "2026-11-13T10:04:11.000Z",
  dernierTick: "2026-11-13T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};
const PANNE = (stations: string[], raison = "arretee") => ({ raison, phrase: `Station ${stations.join(", ")} is stopped, so no cook can start. Start the station.`, geste: "demarrer-la-station", stations });

const SILENCIEUSE = { station: "macbook-air-de-benoit/claude", distante: false, plafond: null, ordinaires: false, bacASable: null, prendOrdinaires: false, cuisson: "silent", cooks: [], vueLe: A };
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "secondes", dossier: "/tmp/secondes", depot: "benomite/secondes", base: "main" }] }, () => false),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  // Les stations du compte, lues, sans que l'app en connaisse une qui serve le projet : seul `facts` dit celle qui le sert.
  stations: { a: A, stations: [] } satisfies VuDesStations,
  projetsDesStations: { a: A, projets: [], recommandee: null, avertissements: {}, machines: {}, calibrage: calibrageRecommande([]) } as VuDesProjets,
});
async function ouvrir(faits?: unknown): Promise<{ vue: Jouee; bloc: ReturnType<Jouee["element"]> }> {
  const vue = await jouerLaVue({ demarrage, espace: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  if (faits !== undefined) {
    const lecture: Lecture = { projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] };
    vue.dire("surFaits", { ...tenirFaits().recevoir(lecture), demande: vue.dernier("faits")[0] as number });
    await repos();
  }
  return { vue, bloc: vue.element("stations-du-projet") };
}

test("la panne nomme la station arrêtée : la page dit « Cooks on », jamais « No station cooks »", async () => {
  const { bloc } = await ouvrir({ ...FAITS, stations: [SILENCIEUSE], attenteDuRail: PANNE(["macbook-air-de-benoit/claude"]) });
  const texte = bloc.textContent;
  assert.match(texte, /Cooks on macbook-air-de-benoit\/claude/);
  assert.doesNotMatch(texte, /No station cooks/);
  assert.equal(bloc.dessous("button").some((bouton) => bouton.textContent === "choose its machine"), false);
});

test("la panne du rail bloqué nomme la station : « Cooks on », le geste une seule fois, pas « choose its machine »", async () => {
  const bloque = { tickets: [4], depuis: A, cause: "arretee", stations: ["macbook-air-de-benoit/claude"], geste: "demarrer-la-station", constat: "queued", phrase: "Station macbook-air-de-benoit/claude is stopped, so no cook can start. Start the station." };
  const { bloc } = await ouvrir({ ...FAITS, stations: [SILENCIEUSE], railBloque: bloque });
  assert.match(bloc.textContent, /Cooks on macbook-air-de-benoit\/claude/);
  assert.doesNotMatch(bloc.textContent, /No station cooks/);
  assert.equal(bloc.dessous("button").some((bouton) => bouton.textContent === "choose its machine"), false);
  assert.equal((bloc.textContent.match(/Start the station/g) ?? []).length, 0);
});

const boutons = (bloc: ReturnType<Jouee["element"]>) => bloc.dessous("button").map((bouton) => bouton.textContent);

test("une station arrêtée, la file vide : aucune panne, et la page la nomme — jamais « No station cooks », jamais « choose its machine » (secondes)", async () => {
  const { bloc } = await ouvrir({ ...FAITS, stations: [SILENCIEUSE] });
  assert.match(bloc.textContent, /Cooks on macbook-air-de-benoit\/claude/);
  assert.doesNotMatch(bloc.textContent, /No station cooks/);
  assert.equal(boutons(bloc).includes("choose its machine"), false);
});

test("secondes : la station arrêtée est nommée par la ligne des stations, et le geste qui la démarre ne se dit qu'une fois dans la page", async () => {
  const { vue, bloc } = await ouvrir({ ...FAITS, stations: [SILENCIEUSE], attenteDuRail: PANNE(["macbook-air-de-benoit/claude"]) });
  assert.match(bloc.textContent, /Cooks on macbook-air-de-benoit\/claude/);
  assert.equal((bloc.textContent.match(/Start the station/g) ?? []).length, 0);
  assert.doesNotMatch(bloc.textContent, /No station cooks/);
  assert.equal(boutons(bloc).includes("choose its machine"), false);
  assert.equal((vue.element("rail").textContent.match(/Start the station/g) ?? []).length, 2, "la phrase de la panne et son bouton : un seul geste");
});

test("« choose its machine » ne s'offre que sans station : aucune n'a servi le projet, ou celle qui le servait est retirée", async () => {
  const { vue, bloc } = await ouvrir({ ...FAITS, stations: [] });
  assert.match(bloc.textContent, /No station cooks/);
  assert.equal(boutons(bloc).includes("choose its machine"), true);
  // Une station le sert, arrêtée : le bouton s'en va et la station est nommée.
  const lecture = (faits: unknown): Lecture => ({ projet: "secondes", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...tenirFaits().recevoir(lecture({ ...FAITS, stations: [SILENCIEUSE] })), demande: vue.dernier("faits")[0] as number });
  await repos();
  assert.match(bloc.textContent, /Cooks on macbook-air-de-benoit\/claude/);
  assert.equal(boutons(bloc).includes("choose its machine"), false);
  // Retirée : la ligne et le bouton reviennent.
  vue.dire("surFaits", { ...tenirFaits().recevoir(lecture({ ...FAITS, stations: [] })), demande: vue.dernier("faits")[0] as number });
  await repos();
  assert.match(bloc.textContent, /No station cooks/);
  assert.equal(boutons(bloc).includes("choose its machine"), true);
});
