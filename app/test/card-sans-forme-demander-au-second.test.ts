// Une carte qui attend le chef sans prendre la forme d'une carte de TODO — un « Gesture for the chef: … » que le tableau
// ne lit pas comme une question à choix — a « ask the second », comme toute carte de TODO (ticket 3363). La vue est jouée
// telle qu'elle est, devant un faux document et un faux pont.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { EXEMPLE } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE, holdFacts, type Facts } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import type { Terminal } from "../src/terminaux.ts";
import { cardDuTicket, type Faux, jouerLaVue, repos } from "./aides/fausse-vue.ts";

const A = "2026-11-12T10:04:12.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "", arrete: false };
const ISSUE = `https://github.com/benomite/parade/issues/3228`;
const demarrage = () => ({
  configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
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
  attend: [{ ticket: 3228, titre: "Un geste du chef", url: ISSUE, decision: { quoi: "carte", motif: "product", cause: "Gesture for the chef: run gh issue create …", pr: null } }],
} as Facts;
const button = (ou: Faux) => ou.dessous("button").find(({ dataset }) => dataset.geste === "demande-second");

describe("une carte du chef sans forme de carte de TODO (#3363)", () => {
  test("« ask the second » est sur la carte, et son clic la passe au second par la passation qui existe", async () => {
    const vue = await jouerLaVue({ demarrage, espace: () => [SECOND], machines: () => [], passerAuSecond: () => ({ ...SECOND, demandeEcrite: true }) });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const recue = holdFacts().recevoir({ projet: "parade", demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
    await repos();
    const card = cardDuTicket(vue, 3228) ?? assert.fail("pas de carte #3228");
    const demander = button(card) ?? assert.fail("pas de « ask the second »");
    assert.equal(demander.textContent, "ask the second");
    demander.click();
    await repos();
    assert.deepEqual(vue.dernier("passerAuSecond"), ["parade", 3228, null]);
  });
});
