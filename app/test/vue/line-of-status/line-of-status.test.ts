// La ligne d'état du rail (#3523) : au-dessus des colonnes, la bande du haut et — seulement quand quelque chose retient la
// cuisine — une seule ligne ; aucun bandeau Backlog (#4354). Une issue que la cuisine a ouverte sur elle-même n'est jamais un besoin du Backlog : son contenu est cette
// ligne. Le module pur d'abord, puis la vue jouée.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { actionsOfCard } from "../../../src/card-actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { Fake, type Played, playTheVue, openTab, repos } from "../../helpers/false-vue.ts";
import { lineOfAlerts } from "../../../src/vue/line-of-status/line-of-status.js";

const PARADE = "parade";
const REPOSITORY = "chef/parade";
const A = "2026-10-15T09:12:04.000Z";
const url = (ticket: number) => `https://github.com/${REPOSITORY}/issues/${ticket}`;

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
const startup = () => ({
  configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
async function open(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [SECOND], ouvrirIssue: () => true, gestesDeFiche: (card) => actionsOfCard(card) });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}

// Le rail : #10 et #22 en attente ; #17, l'épique qui attend le chef, nommée par la file.
const FACTS: Facts = {
  etat: "ouverte",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 2, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 10, etat: "en attente", titre: "Sur le rail", url: url(10), activite: null },
    { ticket: 22, etat: "en attente", titre: "Ticket 22", url: url(22), activite: null },
  ],
  cooks: [],
  attend: [{ ticket: 17, titre: "Une question", url: url(17) }],
};
// Une lecture de maintenant : une lecture vieille se dit d'elle-même, en ligne d'état (rail.test.ts).
function receiveFacts(vue: Played, facts: Facts): void {
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: new Date().toISOString(), sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
}

const children = (vue: Played): Fake[] => vue.element("rail").children;
const beforeTheColumns = (vue: Played): Fake[] => children(vue).slice(0, children(vue).findIndex(({ className }) => className === "colonnes"));
const status = (vue: Played): Fake | undefined => children(vue).find(({ className }) => className.split(" ").includes("statut-du-rail") || className.split(" ").includes("attente-du-rail"));

describe("la ligne d'état : ce que la cuisine dit d'elle-même, jamais un besoin", () => {
  test("rien ne retient la cuisine : aucune ligne d'état — la bande du haut est seule au-dessus des colonnes (#4354)", async () => {
    const vue = await open();
    receiveFacts(vue, FACTS);
    assert.deepEqual(beforeTheColumns(vue).map(({ className }) => className), ["bande-du-haut"]);
  });
});

describe("le TODO du haut est replié par défaut, et ne reste pas ouvert d'une visite à l'autre (#4354)", () => {
  test("ouvert d'un clic sur sa ligne, replié d'un second ; quitté pour Stations, il est replié au retour", async () => {
    const vue = await open();
    receiveFacts(vue, FACTS);
    await repos();
    const line = () => (children(vue).find(({ className }) => className === "avis-du-todo") ?? assert.fail("pas de TODO")).dessous("button")[0] ?? assert.fail("pas de ligne");
    assert.equal(line().ariaExpanded, "false");
    line().click();
    assert.equal(line().ariaExpanded, "true");
    line().click();
    assert.equal(line().ariaExpanded, "false");
    line().click();
    await openTab(vue, "Stations");
    await openTab(vue, "Rail");
    assert.equal(line().ariaExpanded, "false");
  });
});

describe("le module pur de la ligne d'état", () => {
  const doc = { createElement: (balise: string) => new Fake(balise) };
  test("les alertes : la première (par ticket) ; aucune alerte, aucune ligne", () => {
    assert.deepEqual(lineOfAlerts(doc, undefined), []);
    assert.deepEqual(lineOfAlerts(doc, []), []);
    const [line] = lineOfAlerts(doc, [
      { ticket: 36, titre: "The kitchen is idle: y", genre: "inerte", dit: "Kitchen idle: y" },
      { ticket: 35, titre: "The kitchen is idle: x", genre: "inerte", dit: "Kitchen idle: x" },
    ]);
    assert.equal(line?.textContent, "Kitchen idle: x");
    assert.equal(line?.title, "The kitchen is idle: x — filed by the kitchen on issue #35");
  });
});
