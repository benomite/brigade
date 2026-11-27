// #3924 : le bandeau de la cuisine arrêtée dans la vue telle qu'elle est (vue.js, devant un faux document) — en tête du rail,
// au-dessus de la ligne d'état ; il part à la lecture suivante qui ne porte plus l'arrêt, sans rechargement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { playTheVue, repos, type Played } from "../../helpers/false-vue.ts";

const PARADE = "parade";
const A = "2026-11-20T12:00:00.000Z";
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});

// Deux tickets en file, rien de pris ni en pass ; `arretCuisine` tel que la lecture du rail le pose (stop-of-rail.ts).
const STOPPED = {
  etat: "ouverte",
  lu: "2026-11-20T11:59:50.000Z",
  dernierTick: "2026-11-20T11:59:40.000Z",
  compteurs: { rail: 2, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: "https://github.com/chef/parade/issues/21", activite: null },
    { ticket: 22, etat: "en attente", titre: "Un ticket libre", url: "https://github.com/chef/parade/issues/22", activite: null },
  ],
  cooks: [],
  attend: [],
  arretCuisine: { cause: { kind: "frozen-zone", ticket: 30, zone: "app/src/vue/" }, since: "2026-11-20T08:30:00.000Z" },
};
// La lecture suivante : #21 est pris, l'arrêt n'est plus dans `facts`.
const { arretCuisine: _, ...withoutStop } = STOPPED;
const SPREAD = { ...withoutStop, compteurs: { ...STOPPED.compteurs, auTravail: 1 }, rail: [{ ...STOPPED.rail[0], etat: "pris" }, STOPPED.rail[1]] };

function receive(vue: Played, facts: unknown) {
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(facts as Facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
}

test("the kitchen stopped: the rail opens with the STOPPED notice, above the status line; the next reading with a card taken removes it", async () => {
  const vue = await playTheVue({ demarrage: startup, espace: () => [], machines: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("no project entry")).click();
  await repos();
  receive(vue, STOPPED);
  const rail = vue.element("rail");
  const head = rail.children[0] ?? assert.fail("nothing at the head of the rail");
  assert.equal(head.className, "hote-bandeau-arret");
  // Son geste, sur le rail (#4238) : ouvrir le ticket gelé.
  assert.equal(head.textContent, "STOPPEDThe kitchen is stopped since 08:30 UTC: frozen ticket #30 holds the file zone app/src/vue/.open #30");
  receive(vue, SPREAD);
  assert.equal(rail.dessous("p").filter(({ className }) => className.split(" ").includes("bandeau-arret")).length, 0);
  assert.equal(rail.textContent.includes("kitchen is stopped"), false);
});
