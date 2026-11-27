// La ligne d'état du rail (#3523) : au-dessus des colonnes, la bande du haut et — seulement quand quelque chose retient la
// cuisine — une seule ligne ; aucun bandeau Backlog (#4354). Une issue que la cuisine a ouverte sur elle-même n'est jamais un besoin du Backlog : son contenu est cette
// ligne. Et la ligne ne dit jamais « no reason is found » devant une raison connue. Le module pur d'abord, puis la vue jouée.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { POWER_UP } from "../../../src/power-up.ts";
import { COMMAND, holdUpstream, see } from "../../../src/upstream.ts";
import type { Reading } from "../../../src/box.ts";
import { forTheBar } from "../../../src/bar.ts";
import { EXAMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/colors.ts";
import { KITCHEN_ACTIONS } from "../../../src/kitchen.ts";
import { BANNER, holdFacts, type Facts } from "../../../src/facts.ts";
import { actionsOfCard } from "../../../src/card-actions.ts";
import { CONFIRMED, DIRECT } from "../../../src/actions.ts";
import { TABS, HEADINGS } from "../../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../../src/projects/projects.ts";
import type { CallGitHub } from "../../../src/board/client.ts";
import { readTheBoardOfRepository } from "../../../src/board/read.ts";
import { readOfBoard } from "../../../src/board/rail.ts";
import type { Terminal } from "../../../src/terminals.ts";
import { Fake, type Played, playTheVue, openTab, repos } from "../../helpers/false-vue.ts";
import { lineOfAlerts, sentenceOfTheWait, heldKnown } from "../../../src/vue/line-of-status/line-of-status.js";

const PARADE = "parade";
const REPOSITORY = "chef/parade";
const A = "2026-10-15T09:12:04.000Z";
const url = (ticket: number) => `https://github.com/${REPOSITORY}/issues/${ticket}`;

type Open = { number: number; title: string; labels: { name: string }[]; created_at: string; html_url: string; body: string };
const openOne = (number: number, labels: string[] = [], title = `Ticket ${number}`, body = ""): Open => ({ number, title, labels: labels.map((name) => ({ name })), created_at: `2026-10-01T00:00:${String(number).padStart(2, "0")}Z`, html_url: url(number), body });
const LIST = (tickets: number[]) => ["<!-- brigade:tickets -->", ...tickets.map((t) => `| #${t} | t |`), "<!-- /brigade:tickets -->"].join("\n");

// Le dépôt de référence de test/upstream.test.ts — huit issues avant le rail, dans quatre états —, plus #16, une épique
// découpée en #10 (au feu, sur le rail) et #30 (fermé, servi), et #17 qui t'attend (sa carte est dans Awaiting you).
const ISSUES = [
  openOne(10, ["fire", "model:haiku", "effort:low"], "Sur le rail", "Epic: #16"),
  openOne(11, ["model:opus", "effort:high", "prio:2"], "Prêt sans feu"),
  openOne(12, ["blocked-on-human"]),
  openOne(13, ["served-elsewhere"]),
  openOne(14, ["model:opus"]),
  openOne(16, ["epic", "prio:1"], "Une épique", `## Context\n\nGroups book in one gesture.\n\n${LIST([10, 30])}`),
  openOne(17, ["epic"], "Une question"),
  openOne(20, [], "Pas encore lue"),
  openOne(21),
  openOne(22, ["fire", "model:opus", "effort:high"]),
];
const github = (issues: Open[]): CallGitHub => async (path) => {
  if (path.includes("/issues?") && path.includes("labels=fire")) return { status: 200, data: issues.filter(({ labels }) => labels.some(({ name }) => name === "fire")) };
  if (path.includes("/issues?state=closed")) return { status: 200, data: [] };
  if (path.includes("/issues?")) return { status: 200, data: issues };
  if (path.includes("/pulls?")) return { status: 200, data: [] };
  return { status: 404, data: {} };
};
async function upstreamOf(issues: Open[]): Promise<Reading> {
  const readOne = await readTheBoardOfRepository({ depot: REPOSITORY, appeler: github(issues), maintenant: () => new Date(A) });
  return readOfBoard(readOne, PARADE, 3, [COMMAND]);
}
const reading = (text: string): Reading => ({ projet: PARADE, demande: 3, a: A, sorties: [{ commande: COMMAND, texte: text }] });

const SECOND: Terminal = { id: 1, projet: PARADE, genre: "second", titre: "second · claude", note: "session neuve", arrete: false };
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
const RAIL_EMPTY: Facts = { ...FACTS, compteurs: { ...FACTS.compteurs, rail: 0, attend: 0 }, rail: [], attend: [] };
// Une lecture de maintenant : une lecture vieille se dit d'elle-même, en ligne d'état (rail.test.ts).
function receiveFacts(vue: Played, facts: Facts): void {
  const receivedOne = holdFacts().recevoir({ projet: PARADE, demande: 0, a: new Date().toISOString(), sorties: [{ commande: "facts", texte: JSON.stringify(facts) }] });
  vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
}


const children = (vue: Played): Fake[] => vue.element("rail").children;
const beforeTheColumns = (vue: Played): Fake[] => children(vue).slice(0, children(vue).findIndex(({ className }) => className === "colonnes"));
const status = (vue: Played): Fake | undefined => children(vue).find(({ className }) => className.split(" ").includes("statut-du-rail") || className.split(" ").includes("attente-du-rail"));

// Les issues que la cuisine a ouvertes sur elle-même (la cuisine oisive, plus ouverte depuis #3945), et #21, mise de côté.
const INERT = openOne(35, ["bug"], "The kitchen is idle: no merge for 60 minutes with 2 cookable ticket(s) (no-station)");
const LONG = "The wait is longer than usual: the oldest queued ticket has waited 3 d and no reason is found. It resolves by itself.";
const QUEUED_FACTS = { ...FACTS, attenteDuRail: { raison: "normale", phrase: LONG, geste: null } };
const factsWith = (facts: object): Facts => facts as Facts;

describe("la ligne d'état : ce que la cuisine dit d'elle-même, jamais un besoin", () => {
  test("une alerte de la cuisine : son contenu est la ligne d'état, et la carte du supervisor la dit en deux mots", async () => {
    const vue = await open();
    receiveFacts(vue, FACTS);
    vue.dire("surAmont", holdUpstream().recevoir(await upstreamOf([...ISSUES, INERT])));
    const supervisor = children(vue)[0]?.dessous("button").find(({ dataset }) => dataset.agent === "supervisor");
    assert.equal(supervisor?.textContent, "supervisoralert: #35");

    // La ligne d'état : celle de la cuisine oisive — et une seule, sous la bande du haut (#4238).
    assert.match(status(vue)?.textContent ?? "", /^Kitchen idle: no merge for 60 minutes/);
    assert.deepEqual(beforeTheColumns(vue).map(({ className }) => className), ["bande-du-haut", "statut-du-rail"]);
  });

  test("la cuisine oisive, seule : sa ligne dit « Kitchen idle », et son seul geste ouvre l'issue que la cuisine a ouverte (#4238)", async () => {
    const vue = await open();
    receiveFacts(vue, FACTS);
    vue.dire("surAmont", holdUpstream().recevoir(await upstreamOf([...ISSUES, INERT])));
    assert.match(status(vue)?.textContent ?? "", /^Kitchen idle: no merge for 60 minutes with 2 cookable ticket\(s\)/);
    const actions = status(vue)?.dessous("button") ?? [];
    assert.deepEqual(actions.map(({ textContent }) => textContent), ["open #35"]);
    actions[0]?.click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 35]);
  });

  test("rien ne retient la cuisine : aucune ligne d'état — la bande du haut est seule au-dessus des colonnes (#4354)", async () => {
    const vue = await open();
    receiveFacts(vue, FACTS);
    vue.dire("surAmont", holdUpstream().recevoir(await upstreamOf(ISSUES)));
    assert.deepEqual(beforeTheColumns(vue).map(({ className }) => className), ["bande-du-haut"]);
  });

  test("la file attend et un ticket est mis de côté : la ligne nomme cette raison, jamais « no reason is found »", async () => {
    const vue = await open();
    receiveFacts(vue, factsWith(QUEUED_FACTS));
    // Sans raison connue de la vue, la phrase du runtime est dite telle quelle ; son geste, relire (#4238).
    const sentence = () => status(vue)?.dessous("strong")[0]?.textContent;
    assert.equal(sentence(), LONG);
    assert.deepEqual(status(vue)?.dessous("button").map(({ textContent }) => textContent), ["read again"]);
    vue.dire("surAmont", holdUpstream().recevoir(await upstreamOf(ISSUES)));
    assert.equal(sentence(), "The queue waits: #12, #13 are set aside.");
    assert.doesNotMatch(vue.element("rail").textContent, /no reason is found/);
    assert.deepEqual(beforeTheColumns(vue).map(({ className }) => className.split(" ")[0]), ["bande-du-haut", "attente-du-rail"]);
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
  test("les raisons connues : le ticket de côté, la cuisine arrêtée ; la phrase du runtime ne change que pour « normale »", () => {
    assert.deepEqual(heldKnown({ misDeCote: [], arretee: false }), []);
    assert.deepEqual(heldKnown({ misDeCote: [21], arretee: true }), ["the kitchen is stopped", "#21 is set aside"]);
    const normal = { raison: "normale", phrase: LONG, geste: null, stations: [] as string[] } as const;
    assert.equal(sentenceOfTheWait(normal, []), normal);
    assert.equal(sentenceOfTheWait(normal, ["#21 is set aside"]).phrase, "The queue waits: #21 is set aside.");
    const outage = { raison: "arretee", phrase: "The station is stopped.", geste: "demarrer-la-station", stations: [] as string[] } as const;
    assert.equal(sentenceOfTheWait(outage, ["#21 is set aside"]), outage);
  });
});
