// Toute la bande d'alertes suit la même règle (#907) : une alerte tient en une ligne — ce qui ne va
// pas — et un contrôle — le geste qui le lève. Le prix de ce geste n'est pas posé à côté : la
// confirmation, au clic, le dit. Ce que la box en écrit, mot pour mot, est derrière « detail ». Et l'espace
// n'a qu'un interrupteur, celui du projet (#1406).
// La bande est celle que le process principal dirait (alerts.ts), d'après des sorties de `status`
// telles que le runtime les écrit ; la vue est jouée telle qu'elle est, devant un faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { holdBands, type Band } from "../src/alerts.ts";
import { putAside } from "../src/awaiting.ts";
import { forTheBar } from "../src/bar.ts";
import type { Reading } from "../src/box.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import type { Kitchen } from "../src/box.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, type Facts } from "../src/facts.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { type Fake, type Played, playTheVue, type Answers, repos } from "./helpers/false-vue.ts";

const A = "2026-10-13T10:00:01.000Z";
const KITCHEN: Kitchen = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const reading = (command: string, text: string): Reading => ({ projet: "parade", demande: 1, a: A, sorties: [{ commande: command, texte: text }] });

// Les lignes de tête de `status` (runtime/src/etat.ts, `decrireEtat`), mot pour mot.
const CONNECTION = "connexion  Max DÉCONNECTÉE depuis 18 min sur box/claude — plus aucun ticket n'est pris : `claude /login` sous le compte du service";
const BASE_RED = "base       ROUGE depuis 1 h 10 sur abc1234 — la station ne prend plus de ticket, la pass ne juge ni ne merge";
const GRANT_OF_BEFORE = "grant      merge ACTIF, BIENTÔT ÉTEINT : encore 30 min — une pass verte est mergée sans toi";
const statusWith = (...heads: string[]) => ["projet     parade", "cuisine    ouverte", ...heads, "", "rail       vide", ""].join("\n");
const value = (line: string) => line.slice(11);

// `manager`, tel que le runtime l'écrit, allumé par le chef.
const MANAGER_LIT = "manager               ALLUMÉ depuis le 2026-10-13T09:25:21.838Z (par chef) — il juge les issues ouvertes, pose `fire` et le calibrage\n";

const FACTS: Facts = {
  etat: "retenue",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};

// La bande que le process principal dirait : `facts`, `status` (sans lui, rien n'est lu) et `manager` lus.
// `etat` : celui de la cuisine dans `facts` — retenue, ce qui la retient fait ses lignes.
function bandRead(status?: string, state: Facts["etat"] = "retenue"): Band {
  const bands = holdBands({ etablir: 1, minimum: 0 });
  bands.ouvrir(["parade"]);
  bands.faits(reading("facts", JSON.stringify({ ...FACTS, etat: state })));
  if (status !== undefined) bands.status(putAside(reading("status", status)));
  return bands.manager(reading("manager", MANAGER_LIT));
}

async function open(answers: Answers = {}): Promise<Played> {
  const vue = await playTheVue({
    demarrage: () => ({
      configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
      palette: PALETTE,
      exemple: EXAMPLE,
      onglets: TABS,
      rubriques: HEADINGS,
      gestes: {},
      banniere: BANNER,
      calibrage: { modeles: MODELS, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
    ...answers,
  });
  vue.element("projets").children[1]?.click();
  await repos();
  return vue;
}

const lines = (vue: Played) => vue.element("alertes").children;
const lineOf = (vue: Played, start: string): Fake => lines(vue).find((line) => line.children[0]?.textContent.includes(start)) ?? assert.fail(`pas de ligne « ${start} »`);
// Les boutons d'une ligne de la bande, hors survols : son contrôle, et « detail ».
const buttonsOf = (line: Fake) => (line.children[0]?.children ?? []).filter(({ balise }) => balise === "button");
const controlOf = (line: Fake) => buttonsOf(line).find(({ className }) => className !== "detail") ?? assert.fail("pas de contrôle");
const detailOf = (line: Fake) => buttonsOf(line).find(({ className }) => className === "detail") ?? assert.fail("pas de « detail »");
const confirmationOf_ = (line: Fake) => line.children.find(({ className }) => className === "confirmation");
const callsOf = (vue: Played, ...actions: string[]) => vue.appels.filter(({ geste: action }) => actions.includes(action)).map(({ geste: action, args }) => [action, ...args]);

describe("une alerte : une ligne, un contrôle", () => {
  test("chaque ligne de la bande tient en une ligne — sa pastille, ce qui ne va pas, « detail », son contrôle — sans phrase de plus, ni sortie brute, ni prix", async () => {
    const vue = await open();
    vue.dire("surAlertes", bandRead(statusWith(CONNECTION, BASE_RED)));
    await repos();

    assert.deepEqual(
      lines(vue).map((line) => line.children[0]?.children.find(({ balise }) => balise === "strong")?.textContent),
      ["Max connection down: no ticket is taken any more", "base red: the station takes no more tickets, the pass neither judges nor merges"],
    );
    for (const line of lines(vue)) {
      // Un seul enfant : la ligne. Rien dessous tant que le chef ne déplie ni ne clique.
      assert.deepEqual(line.children.map(({ balise, className }) => `${balise}.${className}`), ["p.ligne"]);
      // Un contrôle, et « detail » : aucun autre bouton, aucun survol de prix à côté.
      assert.deepEqual(buttonsOf(line).map(({ className }) => className === "detail"), [true, false]);
      assert.deepEqual(line.dessous("button").filter(({ className }) => className === "aide"), []);
      assert.deepEqual(line.dessous("pre"), []);
    }
    const written = vue.element("alertes").textContent;
    assert.doesNotMatch(written, /DÉCONNECTÉE|ROUGE|abc1234|claude \/login/, "la sortie brute de la box est dans la bande");
    assert.doesNotMatch(written, /start again|interrupted|replayed/, "un prix est posé dans la bande");
  });

  test("« detail » déplie, dessous, ce que la ligne sait de plus — la box mot pour mot, jamais le geste à recopier ; une relecture ne le replie pas, un second clic si", async () => {
    const vue = await open();
    const readEntry = bandRead(statusWith(CONNECTION, BASE_RED));
    vue.dire("surAlertes", readEntry);
    await repos();

    const unfold = detailOf(lineOf(vue, "base red"));
    assert.equal(unfold.textContent, "detail");
    assert.equal(unfold.ariaExpanded, "false");
    unfold.click();
    const base = lineOf(vue, "base red");
    assert.equal(detailOf(base).ariaExpanded, "true");
    const detail = base.children.find(({ className }) => className === "detail") ?? assert.fail("rien de déplié");
    assert.deepEqual(detail.dessous("pre").map(({ textContent }) => textContent), [value(BASE_RED)]);
    // Le geste n'y est pas : le seul geste montré est le bouton de la ligne (règle #830).
    assert.doesNotMatch(detail.textContent, /to lift it|clear what makes it red|replay its gates/);
    // Le prix n'est pas dans le détail non plus : c'est la confirmation qui le dit.
    assert.doesNotMatch(detail.textContent, /replayed/);
    // L'autre ligne reste repliée.
    assert.equal(lineOf(vue, "Max connection").children.length, 1);

    // La bande relue — la même, ou une autre lecture : le détail reste ouvert.
    vue.dire("surAlertes", { ...readEntry, alertes: [...readEntry.alertes] });
    await repos();
    assert.equal(lineOf(vue, "base red").children.length, 2);

    detailOf(lineOf(vue, "base red")).click();
    assert.equal(lineOf(vue, "base red").children.length, 1);

    // La connexion Max : son détail dit ce que la box en écrit, sans la commande qui la rétablit (règle #830).
    detailOf(lineOf(vue, "Max connection")).click();
    const connection = lineOf(vue, "Max connection").children.find(({ className }) => className === "detail") ?? assert.fail("rien de déplié");
    assert.deepEqual(connection.dessous("pre").map(({ textContent }) => textContent), ["Max DÉCONNECTÉE depuis 18 min sur box/claude — plus aucun ticket n'est pris"]);
    assert.doesNotMatch(connection.textContent, /claude \/login|to lift it/);
  });
});

describe("le prix est dans la confirmation, au clic", () => {
  test("une demande au second dont le geste coûte : le clic ouvre la confirmation, qui dit son prix en une ligne ; le « oui » écrit la demande, sans l'envoyer", async () => {
    const vue = await open({ demanderAlerte: () => ({ id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "écrit", arrete: false }) });
    vue.dire("surAlertes", bandRead(statusWith(BASE_RED)));
    await repos();

    const control = controlOf(lineOf(vue, "base red"));
    assert.equal(control.textContent, "ask the second…");
    control.click();
    await repos();
    assert.deepEqual(callsOf(vue, "demanderAlerte", "geste", "confirmer"), [], "rien ne part avant le « oui »");
    const openOne = confirmationOf_(lineOf(vue, "base red")) ?? assert.fail("pas de confirmation sous la ligne");
    assert.equal(openOne.dessous("p").find(({ className }) => className === "titre")?.textContent, "⚠️ ask the second to lift it");
    const price = openOne.dessous("p").filter(({ className }) => className === "prix");
    assert.deepEqual(price.map(({ textContent }) => textContent), ["no cook is interrupted: its gates are replayed?"]);

    (openOne.dessous("button").find(({ dataset }) => dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(callsOf(vue, "demanderAlerte", "geste"), [["demanderAlerte", "parade", "cuisine", "base red: the station takes no more tickets, the pass neither judges nor merges"]]);
    assert.equal(confirmationOf_(lineOf(vue, "base red")), undefined);
  });

  test("« non » referme sans rien écrire ; recliqué, le contrôle la referme aussi", async () => {
    const vue = await open();
    vue.dire("surAlertes", bandRead(statusWith(BASE_RED)));
    await repos();

    controlOf(lineOf(vue, "base red")).click();
    const not = confirmationOf_(lineOf(vue, "base red"))?.dessous("button").find(({ textContent }) => textContent === "no, write nothing") ?? assert.fail("pas de « non »");
    not.click();
    assert.equal(confirmationOf_(lineOf(vue, "base red")), undefined);
    controlOf(lineOf(vue, "base red")).click();
    assert.notEqual(confirmationOf_(lineOf(vue, "base red")), undefined);
    assert.equal(controlOf(lineOf(vue, "base red")).ariaExpanded, "true");
    controlOf(lineOf(vue, "base red")).click();
    assert.equal(confirmationOf_(lineOf(vue, "base red")), undefined);
    assert.deepEqual(callsOf(vue, "demanderAlerte", "geste"), []);
  });

  test("une demande dont le geste ne coûte rien s'écrit au clic, sans confirmation", async () => {
    const vue = await open({ demanderAlerte: () => undefined });
    const readEntry = bandRead(statusWith());
    vue.dire("surAlertes", { ...readEntry, alertes: [{ sujet: "cuisine", verifie: true, ton: "rouge", dit: "station “box” missing", geste: "put `claude` back on the box", bouton: "ask the second", appel: { demande: true }, prix: "none for the kitchen: it is done on the box itself" }] });
    await repos();

    const control = controlOf(lineOf(vue, "station"));
    assert.equal(control.textContent, "ask the second");
    control.click();
    await repos();
    assert.deepEqual(callsOf(vue, "demanderAlerte"), [["demanderAlerte", "parade", "cuisine", "station “box” missing"]]);
    assert.equal(confirmationOf_(lineOf(vue, "station")), undefined);
  });
});

// Un seul interrupteur pour tout le projet (#1406). Le grant `merge` n'existe plus : une ligne `grant` de `status`,
// que le runtime n'écrit plus, ne dit rien de plus.
describe("l'espace n'a qu'un interrupteur", () => {
  test("la bande ne porte que l'état du projet, et l'espace n'a aucun interrupteur", async () => {
    assert.equal("merge" in bandRead(statusWith(), "ouverte"), false);
    const vue = await open();
    vue.dire("surAlertes", bandRead(statusWith(), "ouverte"));
    await repos();

    assert.throws(() => vue.element("interrupteur-merge"), /aucun élément/);
    assert.throws(() => vue.element("interrupteur-manager"), /aucun élément/);
    assert.deepEqual(vue.poses().filter(({ className }) => className === "interrupteur-de-tete"), []);
    assert.throws(() => vue.element("interrupteur-projet"), /aucun élément/);
  });

  test("une ligne `grant` d'avant, dans `status`, ne fait ni ligne de bande ni interrupteur", async () => {
    const vue = await open();
    vue.dire("surAlertes", bandRead(statusWith(GRANT_OF_BEFORE), "ouverte"));
    await repos();
    assert.equal(vue.element("alertes").hidden, true);
    assert.throws(() => vue.element("interrupteur-merge"), /aucun élément/);
  });
});
