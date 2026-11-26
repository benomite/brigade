// Pourquoi la file du rail ne part pas, dans l'app (ticket 3433) : la lecture du rail pose la phrase du runtime et la ligne de
// chaque carte dans `facts`, qui les portent jusqu'au tableau, à la carte et à la ligne en tête du rail.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CallGitHub } from "../../src/tableau/client.ts";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { comprendre, rail, tableau, type Card, type Facts } from "../../src/facts.ts";
import { queuedLine, PRET } from "../../src/line-card.ts";
import type { TableauLu } from "../../src/tableau/read.ts";
import { statusDuTableau } from "../../src/tableau/rail.ts";
import { waitDuRailLue, linesDesCardsLues } from "../../src/vue/wait-du-rail/wait-du-rail.ts";
import { lineDeLWait } from "../../src/vue/wait-du-rail/line-de-l-wait.js";
import { avecLeRail, lireLeRailSurGithub, type RailSurGithub, type TicketSurGithub } from "../../src/vue/rail/github.ts";
import { Faux } from "../aides/fausse-vue.ts";

const REPOSITORY = "chef/secondes";
const LU = "2026-11-12T10:00:00.000Z";
const doc = { createElement: (balise: string) => new Faux(balise) };
const station = (autres: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "box", lastSeen: "2026-11-12T09:59:30.000Z", stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY], ...autres });
const EMPTY: TableauLu = {
  lu: true,
  depot: REPOSITORY,
  luLe: LU,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: LU, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const ticket = (numero: number, autres: Partial<TicketSurGithub> = {}): TicketSurGithub => ({ ticket: numero, titre: `Ticket ${numero}`, url: `https://github.com/${REPOSITORY}/issues/${numero}`, etat: "en attente", priorite: null, creeLe: "2026-11-12T09:00:00.000Z", pr: null, prise: null, entreLe: "2026-11-12T09:58:00.000Z", ...autres });
const read = (tickets: TicketSurGithub[], stations: StationDuCompte[]) => avecLeRail(EMPTY, { lu: LU, tickets } satisfies RailSurGithub, { lus: stations });
const factsDe = (lu: TableauLu) => comprendre(JSON.stringify(lu.faits)) as Facts;
const card = (facts: Facts, numero: number): Card => {
  const dessine = rail(facts);
  return [...dessine.colonnes.flatMap(({ cartes: cards }) => cards), ...dessine.hors].find((une) => une.ticket === numero) ?? assert.fail(`pas de carte #${numero}`);
};
const taken = ticket(3, { etat: "pris", prise: { station: "box/claude", le: "2026-11-12T09:30:00.000Z" }, entreLe: undefined });

describe("la lecture du rail pose la phrase et les lignes des cartes dans `facts`", () => {
  test("des tickets en file, une station en ligne : l'attente normale, et `facts` la porte jusqu'au tableau", () => {
    const facts = factsDe(read([ticket(4), ticket(5)], [station()]));
    assert.deepEqual(facts.attenteDuRail, { raison: "normale", phrase: "Normal wait: a cook takes the ticket within minutes (the oldest has waited 2 min). It resolves by itself.", geste: null, stations: [] });
    assert.equal(facts.lignesDesCartes, undefined);
    assert.deepEqual(tableau(facts).attenteDuRail, facts.attenteDuRail);
  });

  test("aucune station ne sert le projet : la raison 1, et son geste", () => {
    const facts = factsDe(read([ticket(4)], [station({ selection: ["chef/autre"] })]));
    assert.deepEqual(facts.attenteDuRail, { raison: "aucune-station", phrase: "No station serves this project, so no cook can start. Add the project to a station.", geste: "ajouter-a-une-station", stations: [] });
  });

  test("les signes de vie qui ne se lisent pas : aucune raison de station n'est devinée", () => {
    const lu = avecLeRail(EMPTY, { lu: LU, tickets: [ticket(4)] }, { illisible: "no answer" });
    assert.equal(factsDe(lu).attenteDuRail?.raison, "normale");
  });

  test("un cook tourne, ou rien n'est en file : aucune phrase", () => {
    assert.equal(factsDe(read([ticket(4), taken], [])).attenteDuRail, undefined);
    assert.equal(factsDe(read([], [])).attenteDuRail, undefined);
    assert.equal(factsDe(read([taken], [])).attenteDuRail, undefined);
  });

  test("une livraison en pass : la raison 6", () => {
    const enPass = ticket(3, { etat: "en pass", prise: { station: "box/claude", le: "2026-11-12T09:30:00.000Z" }, entreLe: undefined });
    assert.equal(factsDe(read([ticket(4), enPass], [station()])).attenteDuRail?.raison, "pass");
  });

  test("un ticket mis de côté ou en WAITING n'est pas en file : seul, il n'attend rien", () => {
    assert.equal(factsDe(read([ticket(4, { etat: "86" }), ticket(5, { etat: "WAITING" })], [])).attenteDuRail, undefined);
  });

  test("un `attenteDuRail` ou des `lignesDesCartes` mal formés ne sont pas posés", () => {
    for (const brut of [null, [], { raison: "inconnue", phrase: "x", geste: null }, { raison: "normale", phrase: "", geste: null }, { raison: "normale", phrase: "x", geste: "autre" }, { raison: "normale", phrase: "x" }]) {
      assert.deepEqual(waitDuRailLue(brut), {}, JSON.stringify(brut));
    }
    for (const brut of [null, [], {}, { x: "waits for #4 — read from the card" }, { 5: "" }, { 5: 4 }]) assert.deepEqual(linesDesCardsLues(brut), {}, JSON.stringify(brut));
    assert.deepEqual(linesDesCardsLues({ 5: "waits for #4 — read from the card" }), { lignesDesCartes: { 5: "waits for #4 — read from the card" } });
  });
});

describe("la ligne de chaque carte en file", () => {
  const depend = (...numeros: number[]) => ({ depend: numeros });

  test("derrière un ticket en file comme derrière un ticket tenu, l'attente et sa source (ticket 3763) ; la carte qui part ensuite n'en a aucune", () => {
    const facts = factsDe(read([ticket(4), ticket(5, depend(4)), ticket(6, depend(3)), taken], [station()]));
    assert.deepEqual(facts.lignesDesCartes, { 5: "waits for #4 — read from the body", 6: "waits for #3 — read from the body" });
    assert.equal(card(facts, 5).ligne, "waits for #4 — read from the body");
    assert.deepEqual(card(facts, 5).liens, [4]);
    assert.equal(card(facts, 6).ligne, "waits for #3 — read from the body");
    // La carte qui part ensuite garde sa phrase d'avant : elle n'a pas de dépendance.
    assert.equal(card(facts, 4).ligne, PRET);
  });

  test("la ligne se dit même quand un cook tourne : c'est la carte qui attend, pas la file", () => {
    const facts = factsDe(read([ticket(5, depend(3)), taken], []));
    assert.equal(facts.attenteDuRail, undefined);
    assert.equal(card(facts, 5).ligne, "waits for #3 — read from the body");
  });

  test("ce qui retient déjà la carte, et ses messages (« Will not start », mise de côté), passent avant", () => {
    const derriere = { ligne: "waits for #4 — read from the card", attendus: [4] };
    assert.deepEqual(queuedLine("en attente", "blocked by #9", derriere), { ligne: "Waiting for #9", liens: [9] });
    assert.deepEqual(queuedLine("en attente", undefined, derriere), { ligne: "waits for #4 — read from the card", liens: [4] });
    assert.deepEqual(queuedLine("en attente", undefined, undefined), { ligne: PRET });
    const refusee = ticket(5, { etat: "86", depend: [4], miseDeCote: { label: "served-elsewhere", raison: "already done", liens: [], auChef: false } });
    const facts = factsDe(read([ticket(4), refusee], [station()]));
    assert.match(card(facts, 5).ligne ?? "", /^Will not start: /);
    assert.equal(card(facts, 5).signal, "set aside");
  });
});

describe("la ligne en tête du rail", () => {
  test("une panne (raisons 1 à 3) : FAULT, la phrase, et le geste en bouton qui ouvre Stations", () => {
    const wait = factsDe(read([ticket(4)], [])).attenteDuRail;
    const calls: string[] = [];
    const [line] = lineDeLWait(doc, wait, { ouvrirStations: () => calls.push("stations") }) as unknown as Faux[];
    assert.ok(line !== undefined);
    assert.equal(line.role, "alert");
    assert.deepEqual(line.children.map((enfant) => enfant.textContent), ["FAULT", wait?.phrase, "Add the project to a station"]);
    line.dessous("button")[0]?.click();
    assert.deepEqual(calls, ["stations"]);
  });

  test("la station de cet ordinateur est arrêtée : le bouton la démarre, et la phrase ne renvoie pas à « its computer » (#3637)", () => {
    const wait = factsDe(read([ticket(4)], [station({ stoppedAt: "2026-11-12T09:59:40.000Z" })])).attenteDuRail;
    const calls: string[] = [];
    const [line] = lineDeLWait(doc, wait, { ouvrirStations: () => calls.push("stations"), demarrerIci: () => calls.push("demarrer") }) as unknown as Faux[];
    assert.deepEqual(line?.children.map((enfant) => enfant.textContent), ["FAULT", "Station box/claude is stopped, so no cook can start.", "Start this computer's station"]);
    line?.dessous("button")[0]?.click();
    assert.deepEqual(calls, ["demarrer"]);
  });

  test("la station d'un autre ordinateur est arrêtée : aucun bouton, la phrase dit où la démarrer (#3637)", () => {
    const wait = factsDe(read([ticket(4)], [station({ stoppedAt: "2026-11-12T09:59:40.000Z" })])).attenteDuRail;
    const calls: string[] = [];
    const [line] = lineDeLWait(doc, wait, { ouvrirStations: () => calls.push("stations") }) as unknown as Faux[];
    assert.deepEqual(line?.children.map((enfant) => enfant.textContent), ["FAULT", "Station box/claude is stopped, so no cook can start. Start it on its computer."]);
    assert.deepEqual(line?.dessous("button"), []);
    assert.deepEqual(calls, []);
  });

  test("une attente qui passe seule : la phrase, sans alarme ni bouton", () => {
    const wait = factsDe(read([ticket(4)], [station()])).attenteDuRail;
    const [line] = lineDeLWait(doc, wait, { ouvrirStations: () => {} }) as unknown as Faux[];
    assert.ok(line !== undefined);
    assert.notEqual(line.role, "alert");
    assert.deepEqual(line.children.map((enfant) => enfant.textContent), [wait?.phrase]);
  });

  test("sans attente, ou en lecture seule : aucune ligne, ou aucun bouton", () => {
    assert.deepEqual(lineDeLWait(doc, undefined, null), []);
    const wait = factsDe(read([ticket(4)], [])).attenteDuRail;
    const [line] = lineDeLWait(doc, wait, null) as unknown as Faux[];
    assert.deepEqual(line?.dessous("button"), []);
  });
});

describe("le `status` que l'app tire de sa lecture", () => {
  test("la phrase au-dessus de la ligne `rail`, puis la ligne de chaque carte", () => {
    const lines = statusDuTableau(read([ticket(4), ticket(5, { depend: [4] })], [station()])).split("\n");
    const rang = lines.findIndex((line) => line.startsWith("queue wait "));
    assert.ok(rang !== -1, lines.join("\n"));
    assert.match(lines[rang] ?? "", /^queue wait Normal wait: a cook takes the ticket within minutes \(the oldest has waited 2 min\)\. It resolves by itself\.$/);
    assert.equal(lines[rang + 1], "  #5  waits for #4 — read from the body");
    assert.ok(lines.findIndex((line) => line.startsWith("rail ")) > rang);
  });

  test("rien n'attend : aucune ligne", () => {
    assert.doesNotMatch(statusDuTableau(read([ticket(4), taken], [station()])), /queue wait/);
  });
});

describe("la lecture du rail sur GitHub", () => {
  const FEUX = `/repos/${REPOSITORY}/issues?state=open&labels=fire&sort=created&direction=asc&per_page=100&page=1`;
  const lire = (events: { status: number; data: unknown }): { appeler: CallGitHub; chemins: string[] } => {
    const chemins: string[] = [];
    const appeler: CallGitHub = async (chemin) => {
      chemins.push(chemin);
      if (chemin === FEUX) return { status: 200, data: [{ number: 4, title: "T4", html_url: "u", body: "Depends on #9", created_at: "2026-11-12T08:00:00Z", labels: [{ name: "fire" }] }] };
      if (chemin.includes("/events")) return events;
      return { status: 200, data: [] };
    };
    return { appeler, chemins };
  };

  test("un ticket en file porte l'instant où `fire` lui a été posé, et ses dépendances", async () => {
    const { appeler } = lire({ status: 200, data: [{ event: "labeled", label: { name: "fire" }, created_at: "2026-11-12T09:57:00Z" }] });
    const { tickets } = await lireLeRailSurGithub({ depot: REPOSITORY, appeler, maintenant: () => new Date(LU) });
    assert.deepEqual(tickets.map(({ ticket, etat: state, entreLe, depend }) => ({ ticket, etat: state, entreLe, depend })), [{ ticket: 4, etat: "en attente", entreLe: "2026-11-12T09:57:00Z", depend: [9] }]);
  });

  test("des événements qui ne se lisent pas : le rail reste lu, sans l'instant — la durée n'est pas dite", async () => {
    const { appeler } = lire({ status: 502, data: null });
    const lu = await lireLeRailSurGithub({ depot: REPOSITORY, appeler, maintenant: () => new Date(LU) });
    assert.equal(lu.tickets[0]?.entreLe, null);
    const facts = factsDe(avecLeRail(EMPTY, lu, { lus: [station()] }));
    assert.equal(facts.attenteDuRail?.phrase, "A cook takes the ticket within minutes. It resolves by itself.");
  });
});
