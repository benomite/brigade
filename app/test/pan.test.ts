// La poêle (#2984) : une petite poêle 8-bit grésille à côté de ce qu'un agent fait en ce moment — un cook sur son ticket,
// la pass qui juge une livraison, le manager qui qualifie ou découpe une issue —, et seulement tant que le travail tourne :
// ni sur ce qui attend, ni d'une lecture hors ligne ou périmée, ni la cuisine arrêtée. Le process principal dit quels
// tickets sont au travail (facts.ts, `auTravail`) ; la vue est jouée telle qu'elle est, devant un faux document
// (helpers/false-vue.ts) ; la peau est lue dans sa feuille.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Facts as FactsOfRuntime } from "../src/facts.ts"; // the app's own Facts (the old runtime's etat.ts is gone)
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, board, holdFacts, type Drawable, type Facts } from "../src/facts.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { SAYS_OF_THE_PAN, FRAMES } from "../src/vue/components/pan/pan.js";
import { cardOfTicket, type Fake, type Played, tokensOf, playTheVue, openTab, repos } from "./helpers/false-vue.ts";

const VUE = join(import.meta.dirname, "../src/vue");
const PARADE = "parade";
const a = (minute: number) => `2026-11-09T10:${String(minute).padStart(2, "0")}:00.000Z`;
const ISSUE = (ticket: number) => `https://github.com/benomite/parade/issues/${ticket}`;
const activity = (doneIn: string) => ({ fait: doneIn, faitEn: doneIn, cible: null, depuis: a(0) });

// #14 cuit ; #15 est pris mais mis de côté ; #21 attend sa place ; #30 est jugé par la pass ; #31 attend la pass.
const FACTS: Facts = {
  etat: "ouverte",
  lu: a(0),
  dernierTick: a(0),
  compteurs: { rail: 1, auTravail: 2, aLaPass: 2, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [
    { ticket: 14, etat: "pris", titre: "Le journal en ajout seul", url: ISSUE(14), activite: activity("writes the tests") },
    { ticket: 15, etat: "pris", titre: "La carte des desserts", url: ISSUE(15), activite: null, attente: { raison: "setup du projet impossible", colonne: "pris", retour: null } },
    { ticket: 21, etat: "en attente", titre: "L'export du journal", url: ISSUE(21), activite: null },
    { ticket: 30, etat: "en pass", titre: "Le menu du jour", url: ISSUE(30), activite: activity("judging") },
    { ticket: 31, etat: "en pass", titre: "La note", url: ISSUE(31), activite: activity("waiting for the pass") },
  ],
  cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }],
  attend: [],
};
const JUDGE = { role: "pass", station: "box/claude", ticket: 30, fait: "judging", depuis: a(0) };
const QUALIFIED = { role: "manager", station: "box/claude", ticket: 40, fait: "qualifying the issue", depuis: a(0) };
const CLEANS = { role: "closer", station: "box/claude", ticket: null, fait: "closing: cleaning up the project", depuis: a(0) };

describe("les tickets au travail, dits par le process principal (facts.ts)", () => {
  test("un ticket pris, et celui que la pass juge : pas un ticket mis de côté, en file, ni une livraison qui attend la pass", () => {
    assert.deepEqual(board(FACTS).auTravail, [14, 30]);
  });

  test("avec les agents que le runtime donne : le ticket que le manager qualifie aussi — le closer n'a pas de ticket", () => {
    assert.deepEqual(board({ ...FACTS, agents: [JUDGE, QUALIFIED, CLEANS] }).auTravail, [14, 30, 40]);
  });

  test("rien ne tourne : aucun ticket", () => {
    assert.deepEqual(board({ ...FACTS, rail: FACTS.rail.filter(({ etat: state }) => state === "en attente"), cooks: [] }).auTravail, []);
  });
});

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

type Station = FactsOfRuntime["stations"][number];
const station = (name: string, more: Partial<Station> = {}): Station => ({
  station: name,
  distante: false,
  plafond: 2,
  ordinaires: false,
  bacASable: null,
  prendOrdinaires: true,
  cuisson: "cooking",
  arreteeDepuis: null,
  refus: null,
  cooks: [],
  ...more,
});
// #14 cuit sur la box ; #16 finit sur le Mac, que le chef a arrêté.
const STATIONS: Station[] = [
  station("box/claude", { cooks: [{ ticket: 14, titre: "Le journal en ajout seul", station: "box/claude" }] }),
  station("mac/claude", { distante: true, cuisson: "stopped", arreteeDepuis: a(0), cooks: [{ ticket: 16, titre: "La soupe", station: "mac/claude" }] }),
];

async function open(): Promise<Played> {
  const vue = await playTheVue({ demarrage: startup, espace: () => [] });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
const readOne = (facts: Facts, minute = 0, stations?: Station[]): Drawable =>
  holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(minute), sorties: [{ commande: "facts", texte: JSON.stringify(stations === undefined ? facts : { ...facts, stations }) }] });
const receive = (vue: Played, receivedOne: Drawable) => vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
// Sans réseau (board/rail.ts), et une lecture ratée en ligne, après un rail lu (#2151).
const outsideLine = (minute: number): Drawable => holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(minute), erreur: "GitHub could not be reached to read the Kitchen board of benomite/parade: fetch failed.", atteinte: true, cas: null, duTableau: true, horsLigne: true });
const missed = (minute: number): Drawable => holdFacts().recevoir({ projet: PARADE, demande: 0, a: a(minute), erreur: "GitHub refused to read the rail of benomite/parade (HTTP 403): API rate limit exceeded for user ID 1.", atteinte: true, cas: null, duTableau: true });

const pans = (pose: Fake) => pose.dessous("span").filter(({ className }) => className === "poele");
const cook = (vue: Played, tickets: number[]) => tickets.filter((ticket) => pans(cardOfTicket(vue, ticket) ?? assert.fail(`pas de carte #${ticket}`)).length > 0);

describe("la poêle sur le rail : à côté du bon d'un ticket au travail, tant que la lecture le dit vrai", () => {
  test("le ticket que son cook cuit et celui que la pass juge la portent, au bout de leur tête ; ce qui attend, non", async () => {
    const vue = await open();
    receive(vue, readOne(FACTS));
    assert.deepEqual(cook(vue, [14, 15, 21, 30, 31]), [14, 30]);
    const slip = cardOfTicket(vue, 14) ?? assert.fail("pas de carte #14");
    const [setOne] = pans(slip);
    assert.equal(setOne?.parentElement, slip.children[0], "la poêle est dans la tête du bon");
    assert.equal(setOne?.role, "img");
    assert.equal(setOne?.ariaLabel, SAYS_OF_THE_PAN);
    // Elle ne dit rien dans le texte de la carte : son dessin n'a pas de mot.
    assert.equal(setOne?.textContent, "");
  });

  test("le travail fini, la poêle part : #14 servi, #30 renvoyé au rail", async () => {
    const vue = await open();
    receive(vue, readOne(FACTS));
    const rail = FACTS.rail.map((line) => (line.ticket === 14 ? { ...line, etat: "servi", activite: undefined } : line.ticket === 30 ? { ...line, etat: "en attente", activite: null } : line));
    receive(vue, readOne({ ...FACTS, rail }, 1));
    assert.deepEqual(cook(vue, [14, 15, 21, 30, 31]), []);
  });

  test("un ticket pris qui t'attend ne la porte pas : il attend le chef", async () => {
    const vue = await open();
    receive(vue, readOne({ ...FACTS, attend: [{ ticket: 14, titre: "Le journal en ajout seul", url: ISSUE(14) }] }));
    assert.deepEqual(cook(vue, [14, 30]), [30]);
  });

  test("la cuisine arrêtée : aucune poêle", async () => {
    const vue = await open();
    receive(vue, readOne({ ...FACTS, etat: BANNER.etat }));
    assert.deepEqual(cook(vue, [14, 30]), []);
  });

  test("hors ligne, le rail lu en dernier reste, sans poêle ; GitHub joint de nouveau, elle revient", async () => {
    const vue = await open();
    receive(vue, readOne(FACTS));
    receive(vue, outsideLine(1));
    assert.deepEqual(cook(vue, [14, 30]), []);
    receive(vue, readOne(FACTS, 2));
    assert.deepEqual(cook(vue, [14, 30]), [14, 30]);
  });

  test("une lecture périmée — les suivantes ont raté — ne la porte pas non plus", async () => {
    const vue = await open();
    receive(vue, readOne(FACTS));
    receive(vue, missed(1));
    assert.ok(vue.element("rail").dessous("p").some(({ className }) => className.split(" ").includes("perime")), "le rail ne se dit pas périmé");
    assert.deepEqual(cook(vue, [14, 30]), []);
  });
});

describe("la poêle sur Stations : à côté de chaque cook et de chaque agent qui tourne", () => {
  // La carte de la station sur l'onglet Stations (#3195).
  const cooking = (vue: Played, name: string) => vue.element("rail").dessous("section").find((card) => card.className === "carte-de-station" && card.dataset.station === name) ?? assert.fail(`pas de carte pour ${name}`);
  const lines = (pose: Fake) => (pose.dessous("ul").find((ul) => ul.className.startsWith("cooks")) ?? assert.fail("pas de liste de cooks")).children;

  test("sur la station qui cuit, le cook, la pass, le manager qui qualifie et le closer la portent ; sur celle qu'on a arrêtée, le cook qui finit non", async () => {
    const vue = await open();
    receive(vue, readOne({ ...FACTS, agents: [JUDGE, QUALIFIED, CLEANS] }, 0, STATIONS));
    await openTab(vue, "Stations");
    const box = lines(cooking(vue, "box/claude"));
    assert.equal(box.length, 4);
    assert.deepEqual(box.map((li) => pans(li).length), [1, 1, 1, 1]);
    // Au bout de la ligne : son texte reste ce qu'il était.
    assert.ok(box.every((li) => li.children.at(-1)?.className === "poele"));
    assert.deepEqual(lines(cooking(vue, "mac/claude")).map((li) => pans(li).length), [0]);
  });

  test("hors ligne, ou la cuisine arrêtée : aucune", async () => {
    const vue = await open();
    receive(vue, readOne({ ...FACTS, agents: [JUDGE] }, 0, STATIONS));
    receive(vue, outsideLine(1));
    await openTab(vue, "Stations");
    assert.deepEqual(lines(cooking(vue, "box/claude")).map((li) => pans(li).length), [0, 0]);
    receive(vue, readOne({ ...FACTS, etat: BANNER.etat, agents: [JUDGE] }, 2, STATIONS));
    assert.deepEqual(lines(cooking(vue, "box/claude")).map((li) => pans(li).length), [0, 0]);
  });
});

describe("sa peau : petite, aux couleurs des jetons, immobile quand le système le demande", () => {
  const css = readFileSync(join(VUE, "components/pan/pan.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = tokensOf(readFileSync(join(VUE, "tokens.css"), "utf8"));

  test("trois trames qui se suivent, et la première seule, immobile, sous « reduce motion »", () => {
    assert.equal(FRAMES.length, 3);
    assert.match(css, /\.poele \.trame \{[^}]*animation: poele-gresille [^;]+ infinite;/);
    const [, reduit = ""] = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/.exec(css) ?? [];
    assert.match(reduit, /\.poele \.trame \{\s*animation: none;\s*\}/);
    assert.match(reduit, /\.poele \.trame-1 \{\s*opacity: 1;\s*\}/);
  });

  test("ses couleurs sont des jetons, et le fer se lit sur le papier d'un bon comme sur le sombre", () => {
    const named = [...css.matchAll(/fill: var\((--[a-z-]+)\)/g)].map(([, name = ""]) => name);
    assert.deepEqual(named, ["--gris", "--accent", "--discret"]);
    for (const name of named) assert.ok(tokens.has(name), name);
  });

  test("elle tient dans une ligne : 22 × 14 px, et ne passe jamais à la ligne seule", () => {
    const vue = readFileSync(join(VUE, "components/pan/pan.js"), "utf8");
    assert.match(vue, /width: "22", height: "14"/);
    assert.match(css, /\.poele \{[^}]*flex: none;/);
  });
});
