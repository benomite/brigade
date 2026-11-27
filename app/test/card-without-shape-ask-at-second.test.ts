// Une carte qui attend le chef sans prendre la forme d'une carte de TODO — un « Gesture for the chef: … » que le tableau
// ne lit pas comme une question à choix — a « ask the second », comme toute carte de TODO (ticket 3363). La vue est jouée
// telle qu'elle est, devant un faux document et un faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import type { Terminal } from "../src/terminals.ts";
import { cardOfTicket, type Fake, playTheVue, repos } from "./helpers/false-vue.ts";

const A = "2026-11-12T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const ISSUE = `https://github.com/benomite/parade/issues/3228`;
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
// #3228 attend le chef pour un geste, sans carte lue : ni question à choix, ni carte du chef.
const FACTS: Facts = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [{ ticket: 3228, etat: "en attente", titre: "Un geste du chef", url: ISSUE, activite: null }],
  cooks: [],
  attend: [{ ticket: 3228, titre: "Un geste du chef", url: ISSUE }],
} as Facts;
const button = (or: Fake) => or.dessous("button").find(({ dataset }) => dataset.geste === "demande-second");

describe("une carte du chef sans forme de carte de TODO (#3363)", () => {
  test("« ask the second » est sur la carte, et son clic la passe au second par la passation qui existe", async () => {
    const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], machines: () => [], passerAuSecond: () => ({ ...SECOND, demandeEcrite: true }) });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const receivedOne = holdFacts().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await repos();
    const card = cardOfTicket(vue, 3228) ?? assert.fail("pas de carte #3228");
    const ask = button(card) ?? assert.fail("pas de « ask the second »");
    assert.equal(ask.textContent, "ask the second");
    ask.click();
    await repos();
    assert.deepEqual(vue.dernier("passerAuSecond"), ["parade", 3228, null]);
  });
});
