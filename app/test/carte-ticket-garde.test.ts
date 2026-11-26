// Un ticket tué deux fois par le même garde-fou (#3650) : ce que l'app lit de `facts` (`gardeRepetee`), et ce que la carte du
// ticket en dit — le garde-fou et, à chaque arrêt, l'heure et l'activité où le cook en était. Un ticket qui n'en porte pas
// n'en dit rien. La vue est jouée telle qu'elle est, devant un faux document (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBarre } from "../src/barre.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, comprendre, rail, tenirFaits, type Faits } from "../src/faits.ts";
import { heureHM } from "../src/format.ts";
import { CONFIRMES, DIRECTS } from "../src/gestes.ts";
import { EFFORTS, MODELES } from "../src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import type { Terminal } from "../src/terminaux.ts";
import { carteDuTicket, type Faux, type Jouee, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-13T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const GARDE = {
  guard: "idle",
  kills: [
    { guard: "idle", run: "14-aaaa", at: "2026-10-13T07:12:40.000Z", activity: "finishing" },
    { guard: "idle", run: "14-bbbb", at: "2026-10-13T08:41:03.000Z", activity: null },
  ],
};
const FAITS = {
  etat: "ouverte",
  lu: "2026-10-13T10:04:11.000Z",
  dernierTick: "2026-10-13T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: null, gardeRepetee: GARDE },
    { ticket: 22, etat: "pris", titre: "Un ticket libre", url: "https://github.com/benomite/brigade/issues/22", activite: null },
  ],
  cooks: [],
  attend: [],
};
const lus = (brut: unknown) => {
  const faits = comprendre(JSON.stringify(brut));
  assert.ok(!("informe" in faits), JSON.stringify(faits));
  return faits as Faits;
};

describe("de `facts` à la carte", () => {
  test("le garde-fou et chaque arrêt — l'heure, l'activité — sont dits ; une activité jamais lue aussi", () => {
    const carte = rail(lus(FAITS)).colonnes.flatMap(({ cartes }) => cartes).find(({ ticket }) => ticket === 14);
    assert.deepEqual(carte?.garde, {
      ligne: "Stopped 2 times by the idle guard",
      details: [
        { dit: `${heureHM(GARDE.kills[0]?.at ?? "")} — was finishing`, survol: "run 14-aaaa" },
        { dit: `${heureHM(GARDE.kills[1]?.at ?? "")} — no activity read`, survol: "run 14-bbbb" },
      ],
    });
  });

  test("un ticket qui n'en porte pas n'en dit rien ; un seul arrêt, ou une forme étrangère, rend le ticket illisible", () => {
    const colonnes = rail(lus(FAITS)).colonnes.flatMap(({ cartes }) => cartes);
    assert.equal(colonnes.find(({ ticket }) => ticket === 22)?.garde, undefined);
    for (const mauvaise of [{ ...GARDE, kills: GARDE.kills.slice(1) }, { guard: "idle", kills: [GARDE.kills[0], { run: 3 }] }, "idle"]) {
      const faits = lus({ ...FAITS, rail: [{ ...FAITS.rail[0], gardeRepetee: mauvaise }] });
      assert.notEqual(faits.rail[0]?.illisible, undefined, JSON.stringify(mauvaise));
    }
  });
});

describe("la carte dans la vue", () => {
  async function ouvrir(): Promise<Jouee> {
    const demarrage = () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS, rubriques: RUBRIQUES,
      gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    });
    const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }] });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const recue = tenirFaits(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FAITS) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    return vue;
  }
  const bon = (vue: Jouee, numero: number): Faux => carteDuTicket(vue, numero) ?? assert.fail(`pas de bon #${numero}`);

  test("la carte de #14 dit « Stopped 2 times by the idle guard », et chaque arrêt dessous ; celle de #22 n'en dit rien", async () => {
    const vue = await ouvrir();
    const garde = bon(vue, 14).dessous("div").find(({ className }) => className === "garde-repetee") ?? assert.fail("pas de garde sur #14");
    assert.equal(garde.dessous("p")[0]?.textContent, "Stopped 2 times by the idle guard");
    assert.deepEqual(garde.dessous("li").map(({ textContent }) => textContent), [`${heureHM(GARDE.kills[0]?.at ?? "")} — was finishing`, `${heureHM(GARDE.kills[1]?.at ?? "")} — no activity read`]);
    assert.deepEqual(garde.dessous("li").map(({ title }) => title), ["run 14-aaaa", "run 14-bbbb"]);
    assert.equal(bon(vue, 22).dessous("div").some(({ className }) => className === "garde-repetee"), false);
  });
});
