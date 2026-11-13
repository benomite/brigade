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
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
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

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "secondes", dossier: "/tmp/secondes", depot: "benomite/secondes", base: "main" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
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
  const { bloc } = await ouvrir({ ...FAITS, attenteDuRail: PANNE(["macbook-air-de-benoit/claude"]) });
  const texte = bloc.textContent;
  assert.match(texte, /Cooks on macbook-air-de-benoit\/claude/);
  assert.doesNotMatch(texte, /No station cooks/);
  assert.equal(bloc.dessous("button").some((bouton) => bouton.textContent === "choose its machine"), false);
});
