// Les refus des stations sur la page du projet (#3198, épique #3196) : une ligne par station qui refuse — son nom, sa raison
// et le geste qui la lève —, aucune quand aucune ne refuse, et elle part quand la station ne refuse plus. Le module est joué
// devant une fabrique de faux éléments ; la page entière, contre le faux pont (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Faits as FaitsDuRuntime } from "../../../../runtime/src/etat.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { lignesDeRefus } from "../../../src/vue/projet/rail/refus-de-station.js";
import { Faux, type Jouee, jouerLaVue, repos } from "../../aides/fausse-vue.ts";

const A = "2026-11-11T10:04:12.000Z";
const PARADE = "parade";
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

type DuRuntime = FaitsDuRuntime["stations"][number];
const station = (nom: string, plus: Partial<DuRuntime> = {}): DuRuntime => ({
  station: nom, distante: false, plafond: 2, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking", arreteeDepuis: null, refus: null, cooks: [], ...plus,
});
const PUSH = { status: "refused" as const, code: "push-blocked" as const, message: "The repository refuses to let the station write to it.", action: "Give the station's GitHub account write access to the repository, then wait for the next check.", noRemedy: "Only an owner of the repository can grant access." };
const FETCH = { status: "refused" as const, code: "fetch-blocked" as const, message: "The repository refuses to let the station read it.", action: "Give the station's GitHub account read access to the repository, then wait for the next check.", noRemedy: "Only an owner of the repository can grant access." };
const FAITS: Faits = {
  etat: "ouverte", lu: "2026-11-11T10:04:11.000Z", dernierTick: "2026-11-11T10:04:02.000Z",
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [],
};

async function ouvrir(stations: DuRuntime[]) {
  const vue = await jouerLaVue({ demarrage, espace: () => [], machines: () => [{ id: "poste", titre: "this computer" }] });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case pour parade")).click();
  await repos();
  recevoir(vue, stations);
  return vue;
}
function recevoir(vue: Jouee, stations: DuRuntime[]): void {
  const dessinable = tenirFaits(() => new Map()).recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify({ ...FAITS, stations }) }] });
  vue.dire("surFaits", { ...dessinable, demande: vue.dernier("faits")[0] as number });
}
const refus = (vue: Jouee) => vue.element("rail").dessous("p").filter((p) => p.className === "refus-de-station").map(({ textContent }) => textContent);

describe("la page du projet dit le refus d'une station", () => {
  test("une station refuse : une seule ligne — son nom, sa raison, le geste qui la lève", async () => {
    const vue = await ouvrir([station("box/claude", { cuisson: "refused", refus: PUSH }), station("mac/claude", { distante: true })]);
    assert.deepEqual(refus(vue), [`box/claude refuses the project: ${PUSH.message} ${PUSH.action}`]);
  });

  test("aucune station ne refuse : aucune ligne", async () => {
    const vue = await ouvrir([station("box/claude"), station("mac/claude", { distante: true })]);
    assert.deepEqual(refus(vue), []);
  });

  test("plusieurs stations refusent : chacune sa ligne", async () => {
    const vue = await ouvrir([station("box/claude", { cuisson: "refused", refus: PUSH }), station("atelier/claude", { cuisson: "refused", refus: FETCH })]);
    assert.deepEqual(refus(vue), [`box/claude refuses the project: ${PUSH.message} ${PUSH.action}`, `atelier/claude refuses the project: ${FETCH.message} ${FETCH.action}`]);
  });

  test("la ligne part quand la station ne refuse plus", async () => {
    const vue = await ouvrir([station("box/claude", { cuisson: "refused", refus: PUSH })]);
    assert.equal(refus(vue).length, 1);
    recevoir(vue, [station("box/claude")]);
    await repos();
    assert.deepEqual(refus(vue), []);
  });
});

describe("lignesDeRefus", () => {
  test("une station qui refuse sans dire pourquoi garde les mots de cuisson.ts ; celles qui ne refusent pas n'ont rien", () => {
    const doc = { createElement: (balise: string) => new Faux(balise) };
    const poses = lignesDeRefus(doc, [
      { station: "box/claude", etat: "refused", dit: "the station refuses the project", survol: "the station does not say why" },
      { station: "mac/claude", etat: "cooking", dit: "", survol: "" },
    ]) as unknown as Faux[];
    assert.deepEqual(poses.map(({ textContent }) => textContent), ["box/claude refuses the project: the station refuses the project the station does not say why"]);
  });
});
