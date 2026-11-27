// Les alertes du haut du rail dans l'app (ticket 3823) : la lecture du rail sur GitHub les tire de ce qu'elle sait — l'en-tête,
// le dernier cook, la réparation de main, les prises de chaque ticket —, `facts` les porte jusqu'au tableau, et la ligne en
// tête du rail dit la première.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { understand, board, type Facts } from "../../src/facts.ts";
import type { CallGitHub } from "../../src/board/client.ts";
import type { BoardRead } from "../../src/board/read.ts";
import { alertsOfRailRead } from "../../src/vue/wait-of-rail/wait-of-rail.ts";
import { takenOfTheIssue } from "../../src/vue/cooks/taken.ts";
import { lineOfAlertsOfRail } from "../../src/vue/wait-of-rail/line-of-alerts.js";
import { withTheRail, readTheRailOnGithub, type RailOnGithub, type TicketOnGithub } from "../../src/vue/rail/github.ts";
import { Fake } from "../helpers/false-vue.ts";

const REPOSITORY = "chef/secondes";
const READ = "2026-11-18T12:00:00.000Z";
const T0 = Date.parse(READ);
const iso = (ms: number) => new Date(ms).toISOString();
const IT_Y_A_26_H = iso(T0 - 26 * 3_600_000);
const doc = { createElement: (balise: string) => new Fake(balise) };
const station = (others: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY], ...others });
const EMPTY: BoardRead = {
  lu: true,
  depot: REPOSITORY,
  luLe: READ,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: READ, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const ticket = (number: number, others: Partial<TicketOnGithub> = {}): TicketOnGithub => ({ ticket: number, titre: `Ticket ${number}`, url: `https://github.com/${REPOSITORY}/issues/${number}`, etat: "en attente", priorite: null, creeLe: IT_Y_A_26_H, pr: null, prise: null, entreLe: iso(T0 - 3_600_000), ...others });
const factsOf = (tickets: TicketOnGithub[], stations: StationDuCompte[]) => understand(JSON.stringify(withTheRail(EMPTY, { lu: READ, tickets } satisfies RailOnGithub, { lus: stations }).faits)) as Facts;
const kinds = (facts: Facts) => (facts.alertesDuRail ?? []).map(({ sorte: kind }) => kind);

describe("la lecture du rail tire les alertes de ce qu'elle sait, et `facts` les porte jusqu'au tableau", () => {
  test("aucune station ne sert le projet : l'alerte, datée par le ticket qui attend, avec le geste de l'onglet Stations", () => {
    const facts = factsOf([ticket(4)], [station({ selection: ["chef/autre"] })]);
    const alert = facts.alertesDuRail?.find(({ sorte: kind }) => kind === "aucune-station");
    assert.ok(alert);
    assert.deepEqual(alert.fait, { depuis: iso(T0 - 3_600_000), ticket: 4, check: "the stations' selection" });
    assert.equal(alert.bouton, "ajouter-a-une-station");
    assert.deepEqual(board(facts).alertesDuRail, facts.alertesDuRail);
  });

  test("l'en-tête dit une station qui cuit ce projet : aucune alerte ne dit qu'aucun cook ne peut partir", () => {
    const taken = ticket(3, { etat: "pris", prise: { station: "parade-box/claude", le: iso(T0 - 600_000) }, entreLe: undefined });
    const facts = factsOf([ticket(4), taken], [station({ selection: null, lastSeen: iso(T0 - 3_600_000) })]);
    assert.deepEqual((facts.alertesDuRail ?? []).filter(({ phrase: sentence }) => /no cook can start|No station serves/.test(sentence)), []);
  });

  test("un cook a ouvert sa PR il y a 2 min : rien ne dit qu'aucun cook ne peut partir ; il y a 10 min, l'alerte revient", () => {
    // Sa station ne le tient plus (aucune prise lue) : l'en-tête n'en dit rien, seule sa PR date le dernier cook.
    const delivers = (it: number) => ticket(3, { etat: "en pass", pr: { numero: 40, url: "", le: iso(T0 - it) }, entreLe: undefined });
    assert.deepEqual(kinds(factsOf([ticket(4), delivers(120_000)], [])).filter((kind) => kind === "aucune-station"), []);
    assert.deepEqual(kinds(factsOf([ticket(4), delivers(600_000)], [])).filter((kind) => kind === "aucune-station"), ["aucune-station"]);
  });

  test("deux PR de cooks, il y a 2 et 10 min : la plus récente date le dernier cook, quel que soit le ticket qui la porte", () => {
    const delivers = (number: number, it: number) => ticket(number, { etat: "en pass", pr: { numero: number + 40, url: "", le: iso(T0 - it) }, entreLe: undefined });
    for (const delivered of [[delivers(3, 120_000), delivers(5, 600_000)], [delivers(3, 600_000), delivers(5, 120_000)]]) {
      assert.deepEqual(kinds(factsOf([ticket(4), ...delivered], [])).filter((kind) => kind === "aucune-station"), []);
    }
  });

  test("rejeu de #3812 : la réparation de main sur le rail depuis 26 h — la base rouge, son check, et la cuisine qui la répare", () => {
    const repair = ticket(3812, { titre: "Repair main: runtime tests", priorite: 0, reparationDeMain: true, entreLe: IT_Y_A_26_H });
    const facts = factsOf([repair], [station()]);
    const base = facts.alertesDuRail?.find(({ sorte: kind }) => kind === "base-rouge");
    assert.ok(base);
    assert.deepEqual(base.fait, { depuis: IT_Y_A_26_H, ticket: 3812, check: "runtime tests" });
    assert.equal(base.geree, "The kitchen repairs it on #3812.");
    assert.match(base.phrase, /main branch has been red since \d\d:\d\d UTC \(26 h\)/);
    // La ligne en tête du rail est la cuisine muette, qui en donne la cause.
    assert.equal(facts.alertesDuRail?.[0]?.sorte, "cuisine-muette");
    assert.equal(facts.alertesDuRail?.[0]?.cause, "base-rouge");
  });

  test("une réparation de main mise de côté ne dit pas que la cuisine répare la base", () => {
    const repair = ticket(3812, { titre: "Repair main: runtime tests", reparationDeMain: true, etat: "86", miseDeCote: { label: "served-elsewhere", raison: null, liens: [], auChef: true } });
    assert.deepEqual(kinds(factsOf([repair, ticket(4)], [station()])).filter((kind) => kind === "base-rouge"), []);
  });

  test("rejeu de #3813 : un ticket pris 1 198 fois — l'alerte nomme le ticket, et dit ce que la cuisine fait : aucun geste pour le chef", () => {
    const loop = ticket(3813, { etat: "pris", prise: { station: "parade-box/claude", le: iso(T0 - 60_000) }, entreLe: undefined, prises: { fois: 1198, depuis: IT_Y_A_26_H } });
    const facts = factsOf([loop, ticket(4, { entreLe: IT_Y_A_26_H })], [station()]);
    const alert = facts.alertesDuRail?.find(({ sorte: kind }) => kind === "relance-en-boucle");
    assert.ok(alert);
    assert.equal(alert.fait.ticket, 3813);
    assert.match(alert.phrase, /#3813 has been relaunched 1,198 times/);
    assert.equal(alert.geste, null);
    assert.equal(alert.geree, "The kitchen puts #3813 in WAITING by itself.");
  });

  test("des `alertesDuRail` mal formés, ou une alerte sans geste ni prise en charge, ne sont pas posés", () => {
    const good = { sorte: "base-rouge", phrase: "Main is red.", fait: { depuis: READ, ticket: 3 }, geste: null, geree: "The kitchen repairs it on #3." };
    for (const raw of [null, {}, [{ ...good, sorte: "autre" }], [{ ...good, phrase: "" }], [{ ...good, fait: { depuis: "hier", ticket: 3 } }], [{ ...good, fait: { depuis: READ } }], [{ ...good, geree: null }], [{ ...good, geste: 4 }]]) {
      assert.deepEqual(alertsOfRailRead(raw), {}, JSON.stringify(raw));
    }
    assert.deepEqual(alertsOfRailRead([good]), { alertesDuRail: [good] });
  });
});

describe("la lecture du rail sur GitHub : les prises de chaque ticket, et sa réparation de main", () => {
  const taking = (id: number, the: string) => ({ id, body: `<!-- brigade:prise station=parade-box/claude -->\nTaken.`, author_association: "OWNER", created_at: the });
  const github = (taken: number): CallGitHub => async (path) => {
    const ok = (data: unknown) => ({ status: 200, data });
    if (path.includes("/issues?")) return ok([{ number: 7, title: "Repair main: runtime tests", html_url: "", created_at: IT_Y_A_26_H, labels: [{ name: "fire" }, { name: "taken" }, { name: "repair-main" }], body: "" }]);
    if (path.includes("/pulls?")) return ok([]);
    if (path.includes("/issues/7/comments")) return ok([...Array.from({ length: taken }, (_, n) => taking(n + 1, iso(Date.parse(IT_Y_A_26_H) + n * 180_000))), ...(taken >= 100 ? [] : [{ id: 999, body: "a comment", author_association: "NONE", created_at: READ }])]);
    if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
    return { status: 404, data: {} };
  };

  test("un ticket pris dit combien de fois, depuis la première prise ; son label `repair-main` le dit réparation de main", async () => {
    const readOne = await readTheRailOnGithub({ depot: REPOSITORY, appeler: github(12), maintenant: () => new Date(READ) });
    const [seven] = readOne.tickets;
    assert.equal(seven?.reparationDeMain, true);
    assert.deepEqual(seven?.prises, { fois: 12, depuis: IT_Y_A_26_H });
  });

  test("chaque ticket lu tel quel : les prises sur celui qui en a, rien de plus sur celui qui n'en a pas", async () => {
    const IT_Y_A_25_H = iso(Date.parse(IT_Y_A_26_H) + 3_600_000);
    const call: CallGitHub = async (path) => {
      const ok = (data: unknown) => ({ status: 200, data });
      if (path.includes("/issues?")) return ok([{ number: 7, title: "Repair main: runtime tests", html_url: "", created_at: IT_Y_A_26_H, labels: [{ name: "fire" }, { name: "taken" }, { name: "repair-main" }], body: "" }, { number: 8, title: "Autre", html_url: "", created_at: IT_Y_A_26_H, labels: [{ name: "fire" }], body: "" }]);
      if (path.includes("/pulls?")) return ok([]);
      if (path.includes("/issues/7/comments")) return ok([taking(2, IT_Y_A_25_H), taking(1, IT_Y_A_26_H)]);
      if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
      return { status: 404, data: {} };
    };
    const readOne = await readTheRailOnGithub({ depot: REPOSITORY, appeler: call, maintenant: () => new Date(READ) });
    assert.deepEqual(readOne.tickets, [
      { ticket: 7, titre: "Repair main: runtime tests", url: "", etat: "pris", priorite: null, creeLe: IT_Y_A_26_H, pr: null, prise: { station: "parade-box/claude", le: IT_Y_A_26_H }, reparationDeMain: true, prises: { fois: 2, depuis: IT_Y_A_26_H } },
      { ticket: 8, titre: "Autre", url: "", etat: "en attente", priorite: null, creeLe: IT_Y_A_26_H, pr: null, prise: null, attentes: [], commentairesLus: true, entreLe: null },
    ]);
  });

  test("les prises d'un ticket, de la plus ancienne à la plus récente, dans quelque ordre que GitHub les rende", () => {
    const instants = [IT_Y_A_26_H, iso(T0 - 3_600_000), READ];
    const comments = instants.map((the, n) => taking(n + 1, the));
    assert.deepEqual(takenOfTheIssue(comments), instants);
    assert.deepEqual(takenOfTheIssue([...comments].reverse()), instants);
  });

  test("une première page de commentaires pleine : le compte est un minimum", async () => {
    const readOne = await readTheRailOnGithub({ depot: REPOSITORY, appeler: github(100), maintenant: () => new Date(READ) });
    assert.deepEqual(readOne.tickets[0]?.prises, { fois: 100, depuis: IT_Y_A_26_H, auMoins: true });
  });
});

describe("la ligne d'alerte en tête du rail", () => {
  test("FAULT, la phrase, et le bouton du geste à sa place — le fait au survol", () => {
    const facts = factsOf([ticket(4)], [station({ selection: ["chef/autre"] })]);
    const calls: string[] = [];
    const [line] = lineOfAlertsOfRail(doc, facts.alertesDuRail, { ouvrirStations: () => calls.push("stations") }) as unknown as Fake[];
    assert.ok(line);
    assert.equal(line.role, "alert");
    assert.equal(line.dataset.sorte, "cuisine-muette");
    assert.deepEqual(line.children.map((child) => child.textContent), ["FAULT", "Nothing served for 1 h while #4 is ready. No station serves this project.", "Add the project to a station"]);
    assert.equal(line.title, `since ${iso(T0 - 3_600_000).slice(0, 16).replace("T", " ")} UTC · #4`);
    line.dessous("button")[0]?.click();
    assert.deepEqual(calls, ["stations"]);
  });

  test("une alerte que la cuisine tient le dit à côté de sa phrase", () => {
    const facts = factsOf([ticket(3812, { titre: "Repair main: runtime tests", reparationDeMain: true, entreLe: IT_Y_A_26_H })], [station()]);
    const [line] = lineOfAlertsOfRail(doc, facts.alertesDuRail, null) as unknown as Fake[];
    assert.deepEqual(line?.children.map((child) => child.textContent), ["FAULT", "Nothing served for 26 h while #3812 is ready. The main branch is red (runtime tests), so nothing merges.", "The kitchen repairs it on #3812."]);
  });

  test("sans alerte, aucune ligne", () => {
    assert.deepEqual(lineOfAlertsOfRail(doc, undefined, null), []);
    assert.deepEqual(lineOfAlertsOfRail(doc, [], null), []);
  });
});
