// Un ticket tué deux fois par le même garde-fou (#3650) : ce que l'app lit de `facts` (`gardeRepetee`), et ce que la carte du
// ticket en dit — le garde-fou et, à chaque arrêt, l'heure et l'activité où le cook en était. Un ticket qui n'en porte pas
// n'en dit rien. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER, understand, rail, holdFacts, type Facts } from "../src/facts.ts";
import { hourHM } from "../src/format.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import type { Terminal } from "../src/terminals.ts";
import { cardOfTicket, type Fake, type Played, playTheVue, repos } from "./helpers/false-vue.ts";

const A = "2026-10-13T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const GUARD = {
  guard: "idle",
  kills: [
    { guard: "idle", run: "14-aaaa", at: "2026-10-13T07:12:40.000Z", activity: "finishing" },
    { guard: "idle", run: "14-bbbb", at: "2026-10-13T08:41:03.000Z", activity: null },
  ],
};
const FACTS = {
  etat: "ouverte",
  lu: "2026-10-13T10:04:11.000Z",
  dernierTick: "2026-10-13T10:04:02.000Z",
  compteurs: { rail: 1, auTravail: 1, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: "https://github.com/benomite/brigade/issues/14", activite: null, gardeRepetee: GUARD },
    { ticket: 22, etat: "pris", titre: "Un ticket libre", url: "https://github.com/benomite/brigade/issues/22", activite: null },
  ],
  cooks: [],
  attend: [],
};
const readOnes = (raw: unknown) => {
  const facts = understand(JSON.stringify(raw));
  assert.ok(!("informe" in facts), JSON.stringify(facts));
  return facts as Facts;
};

describe("de `facts` à la carte", () => {
  test("le garde-fou et chaque arrêt — l'heure, l'activité — sont dits ; une activité jamais lue aussi", () => {
    const card = rail(readOnes(FACTS)).colonnes.flatMap(({ cartes: cards }) => cards).find(({ ticket }) => ticket === 14);
    assert.deepEqual(card?.garde, {
      ligne: "Stopped 2 times by the idle guard",
      details: [
        { dit: `${hourHM(GUARD.kills[0]?.at ?? "")} — was finishing`, survol: "run 14-aaaa" },
        { dit: `${hourHM(GUARD.kills[1]?.at ?? "")} — no activity read`, survol: "run 14-bbbb" },
      ],
    });
  });

  test("un ticket qui n'en porte pas n'en dit rien ; un seul arrêt, ou une forme étrangère, rend le ticket illisible", () => {
    const columns = rail(readOnes(FACTS)).colonnes.flatMap(({ cartes: cards }) => cards);
    assert.equal(columns.find(({ ticket }) => ticket === 22)?.garde, undefined);
    for (const bad of [{ ...GUARD, kills: GUARD.kills.slice(1) }, { guard: "idle", kills: [GUARD.kills[0], { run: 3 }] }, "idle"]) {
      const facts = readOnes({ ...FACTS, rail: [{ ...FACTS.rail[0], gardeRepetee: bad }] });
      assert.notEqual(facts.rail[0]?.illisible, undefined, JSON.stringify(bad));
    }
  });
});

describe("la carte dans la vue", () => {
  async function open(): Promise<Played> {
    const startup = () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS, rubriques: HEADINGS,
      gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
    });
    const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [{ id: "poste", titre: "this computer" }] });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const receivedOne = holdFacts(() => new Map()).recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    return vue;
  }
  const slip = (vue: Played, number: number): Fake => cardOfTicket(vue, number) ?? assert.fail(`pas de bon #${number}`);

  test("la carte de #14 dit « Stopped 2 times by the idle guard », et chaque arrêt dessous ; celle de #22 n'en dit rien", async () => {
    const vue = await open();
    const guard = slip(vue, 14).dessous("div").find(({ className }) => className === "garde-repetee") ?? assert.fail("pas de garde sur #14");
    assert.equal(guard.dessous("p")[0]?.textContent, "Stopped 2 times by the idle guard");
    assert.deepEqual(guard.dessous("li").map(({ textContent }) => textContent), [`${hourHM(GUARD.kills[0]?.at ?? "")} — was finishing`, `${hourHM(GUARD.kills[1]?.at ?? "")} — no activity read`]);
    assert.deepEqual(guard.dessous("li").map(({ title }) => title), ["run 14-aaaa", "run 14-bbbb"]);
    assert.equal(slip(vue, 22).dessous("div").some(({ className }) => className === "garde-repetee"), false);
  });
});
