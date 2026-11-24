// Les alertes du haut du rail dans l'app (ticket 3823) : la lecture du rail sur GitHub les tire de ce qu'elle sait — l'en-tête,
// le dernier cook, la réparation de main, les prises de chaque ticket —, `facts` les porte jusqu'au tableau, et la ligne en
// tête du rail dit la première.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { comprendre, tableau, type Faits } from "../../src/faits.ts";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { alertesDuRailLues } from "../../src/vue/attente-du-rail/attente-du-rail.ts";
import { prisesDeLIssue } from "../../src/vue/cooks/prises.ts";
import { ligneDesAlertesDuRail } from "../../src/vue/attente-du-rail/ligne-des-alertes.js";
import { avecLeRail, lireLeRailSurGithub, type RailSurGithub, type TicketSurGithub } from "../../src/vue/rail/github.ts";
import { Faux } from "../aides/fausse-vue.ts";

const DEPOT = "chef/secondes";
const LU = "2026-11-18T12:00:00.000Z";
const T0 = Date.parse(LU);
const iso = (ms: number) => new Date(ms).toISOString();
const IL_Y_A_26_H = iso(T0 - 26 * 3_600_000);
const doc = { createElement: (balise: string) => new Faux(balise) };
const station = (autres: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT], ...autres });
const VIDE: TableauLu = {
  lu: true,
  depot: DEPOT,
  luLe: LU,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: LU, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};
const ticket = (numero: number, autres: Partial<TicketSurGithub> = {}): TicketSurGithub => ({ ticket: numero, titre: `Ticket ${numero}`, url: `https://github.com/${DEPOT}/issues/${numero}`, etat: "en attente", priorite: null, creeLe: IL_Y_A_26_H, pr: null, prise: null, entreLe: iso(T0 - 3_600_000), ...autres });
const faitsDe = (tickets: TicketSurGithub[], stations: StationDuCompte[]) => comprendre(JSON.stringify(avecLeRail(VIDE, { lu: LU, tickets } satisfies RailSurGithub, { lus: stations }).faits)) as Faits;
const sortes = (faits: Faits) => (faits.alertesDuRail ?? []).map(({ sorte }) => sorte);

describe("la lecture du rail tire les alertes de ce qu'elle sait, et `facts` les porte jusqu'au tableau", () => {
  test("aucune station ne sert le projet : l'alerte, datée par le ticket qui attend, avec le geste de l'onglet Stations", () => {
    const faits = faitsDe([ticket(4)], [station({ selection: ["chef/autre"] })]);
    const alerte = faits.alertesDuRail?.find(({ sorte }) => sorte === "aucune-station");
    assert.ok(alerte);
    assert.deepEqual(alerte.fait, { depuis: iso(T0 - 3_600_000), ticket: 4, check: "the stations' selection" });
    assert.equal(alerte.bouton, "ajouter-a-une-station");
    assert.deepEqual(tableau(faits).alertesDuRail, faits.alertesDuRail);
  });

  test("l'en-tête dit une station qui cuit ce projet : aucune alerte ne dit qu'aucun cook ne peut partir", () => {
    const pris = ticket(3, { etat: "pris", prise: { station: "parade-box/claude", le: iso(T0 - 600_000) }, entreLe: undefined });
    const faits = faitsDe([ticket(4), pris], [station({ selection: null, lastSeen: iso(T0 - 3_600_000) })]);
    assert.deepEqual((faits.alertesDuRail ?? []).filter(({ phrase }) => /no cook can start|No station serves/.test(phrase)), []);
  });

  test("un cook a ouvert sa PR il y a 2 min : rien ne dit qu'aucun cook ne peut partir ; il y a 10 min, l'alerte revient", () => {
    // Sa station ne le tient plus (aucune prise lue) : l'en-tête n'en dit rien, seule sa PR date le dernier cook.
    const livre = (il: number) => ticket(3, { etat: "en pass", pr: { numero: 40, url: "", le: iso(T0 - il) }, entreLe: undefined });
    assert.deepEqual(sortes(faitsDe([ticket(4), livre(120_000)], [])).filter((sorte) => sorte === "aucune-station"), []);
    assert.deepEqual(sortes(faitsDe([ticket(4), livre(600_000)], [])).filter((sorte) => sorte === "aucune-station"), ["aucune-station"]);
  });

  test("deux PR de cooks, il y a 2 et 10 min : la plus récente date le dernier cook, quel que soit le ticket qui la porte", () => {
    const livre = (numero: number, il: number) => ticket(numero, { etat: "en pass", pr: { numero: numero + 40, url: "", le: iso(T0 - il) }, entreLe: undefined });
    for (const livres of [[livre(3, 120_000), livre(5, 600_000)], [livre(3, 600_000), livre(5, 120_000)]]) {
      assert.deepEqual(sortes(faitsDe([ticket(4), ...livres], [])).filter((sorte) => sorte === "aucune-station"), []);
    }
  });

  test("rejeu de #3812 : la réparation de main sur le rail depuis 26 h — la base rouge, son check, et la cuisine qui la répare", () => {
    const reparation = ticket(3812, { titre: "Repair main: runtime tests", priorite: 0, reparationDeMain: true, entreLe: IL_Y_A_26_H });
    const faits = faitsDe([reparation], [station()]);
    const base = faits.alertesDuRail?.find(({ sorte }) => sorte === "base-rouge");
    assert.ok(base);
    assert.deepEqual(base.fait, { depuis: IL_Y_A_26_H, ticket: 3812, check: "runtime tests" });
    assert.equal(base.geree, "The kitchen repairs it on #3812.");
    assert.match(base.phrase, /main branch has been red since \d\d:\d\d UTC \(26 h\)/);
    // La ligne en tête du rail est la cuisine muette, qui en donne la cause.
    assert.equal(faits.alertesDuRail?.[0]?.sorte, "cuisine-muette");
    assert.equal(faits.alertesDuRail?.[0]?.cause, "base-rouge");
  });

  test("une réparation de main mise de côté ne dit pas que la cuisine répare la base", () => {
    const reparation = ticket(3812, { titre: "Repair main: runtime tests", reparationDeMain: true, etat: "86", miseDeCote: { label: "set-aside:failures", raison: null, auChef: true } as TicketSurGithub["miseDeCote"] });
    assert.deepEqual(sortes(faitsDe([reparation, ticket(4)], [station()])).filter((sorte) => sorte === "base-rouge"), []);
  });

  test("rejeu de #3813 : un ticket pris 1 198 fois — l'alerte nomme le ticket, et dit ce que la cuisine fait : aucun geste pour le chef", () => {
    const boucle = ticket(3813, { etat: "pris", prise: { station: "parade-box/claude", le: iso(T0 - 60_000) }, entreLe: undefined, prises: { fois: 1198, depuis: IL_Y_A_26_H } });
    const faits = faitsDe([boucle, ticket(4, { entreLe: IL_Y_A_26_H })], [station()]);
    const alerte = faits.alertesDuRail?.find(({ sorte }) => sorte === "relance-en-boucle");
    assert.ok(alerte);
    assert.equal(alerte.fait.ticket, 3813);
    assert.match(alerte.phrase, /#3813 has been relaunched 1,198 times/);
    assert.equal(alerte.geste, null);
    assert.equal(alerte.geree, "The kitchen puts #3813 in WAITING by itself.");
  });

  test("des `alertesDuRail` mal formés, ou une alerte sans geste ni prise en charge, ne sont pas posés", () => {
    const bonne = { sorte: "base-rouge", phrase: "Main is red.", fait: { depuis: LU, ticket: 3 }, geste: null, geree: "The kitchen repairs it on #3." };
    for (const brut of [null, {}, [{ ...bonne, sorte: "autre" }], [{ ...bonne, phrase: "" }], [{ ...bonne, fait: { depuis: "hier", ticket: 3 } }], [{ ...bonne, fait: { depuis: LU } }], [{ ...bonne, geree: null }], [{ ...bonne, geste: 4 }]]) {
      assert.deepEqual(alertesDuRailLues(brut), {}, JSON.stringify(brut));
    }
    assert.deepEqual(alertesDuRailLues([bonne]), { alertesDuRail: [bonne] });
  });
});

describe("la lecture du rail sur GitHub : les prises de chaque ticket, et sa réparation de main", () => {
  const prise = (id: number, le: string) => ({ id, body: `<!-- brigade:prise station=parade-box/claude -->\nTaken.`, author_association: "OWNER", created_at: le });
  const github = (prises: number): AppelGitHub => async (chemin) => {
    const ok = (data: unknown) => ({ status: 200, data });
    if (chemin.includes("/issues?")) return ok([{ number: 7, title: "Repair main: runtime tests", html_url: "", created_at: IL_Y_A_26_H, labels: [{ name: "fire" }, { name: "taken" }, { name: "repair-main" }], body: "" }]);
    if (chemin.includes("/pulls?")) return ok([]);
    if (chemin.includes("/issues/7/comments")) return ok([...Array.from({ length: prises }, (_, n) => prise(n + 1, iso(Date.parse(IL_Y_A_26_H) + n * 180_000))), ...(prises >= 100 ? [] : [{ id: 999, body: "a comment", author_association: "NONE", created_at: LU }])]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: {} };
  };

  test("un ticket pris dit combien de fois, depuis la première prise ; son label `repair-main` le dit réparation de main", async () => {
    const lu = await lireLeRailSurGithub({ depot: DEPOT, appeler: github(12), maintenant: () => new Date(LU) });
    const [sept] = lu.tickets;
    assert.equal(sept?.reparationDeMain, true);
    assert.deepEqual(sept?.prises, { fois: 12, depuis: IL_Y_A_26_H });
  });

  test("chaque ticket lu tel quel : les prises sur celui qui en a, rien de plus sur celui qui n'en a pas", async () => {
    const IL_Y_A_25_H = iso(Date.parse(IL_Y_A_26_H) + 3_600_000);
    const appeler: AppelGitHub = async (chemin) => {
      const ok = (data: unknown) => ({ status: 200, data });
      if (chemin.includes("/issues?")) return ok([{ number: 7, title: "Repair main: runtime tests", html_url: "", created_at: IL_Y_A_26_H, labels: [{ name: "fire" }, { name: "taken" }, { name: "repair-main" }], body: "" }, { number: 8, title: "Autre", html_url: "", created_at: IL_Y_A_26_H, labels: [{ name: "fire" }], body: "" }]);
      if (chemin.includes("/pulls?")) return ok([]);
      if (chemin.includes("/issues/7/comments")) return ok([prise(2, IL_Y_A_25_H), prise(1, IL_Y_A_26_H)]);
      if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
      return { status: 404, data: {} };
    };
    const lu = await lireLeRailSurGithub({ depot: DEPOT, appeler, maintenant: () => new Date(LU) });
    assert.deepEqual(lu.tickets, [
      { ticket: 7, titre: "Repair main: runtime tests", url: "", etat: "pris", priorite: null, creeLe: IL_Y_A_26_H, pr: null, prise: { station: "parade-box/claude", le: IL_Y_A_26_H }, reparationDeMain: true, prises: { fois: 2, depuis: IL_Y_A_26_H } },
      { ticket: 8, titre: "Autre", url: "", etat: "en attente", priorite: null, creeLe: IL_Y_A_26_H, pr: null, prise: null, attentes: [], commentairesLus: true, entreLe: null },
    ]);
  });

  test("les prises d'un ticket, de la plus ancienne à la plus récente, dans quelque ordre que GitHub les rende", () => {
    const instants = [IL_Y_A_26_H, iso(T0 - 3_600_000), LU];
    const commentaires = instants.map((le, n) => prise(n + 1, le));
    assert.deepEqual(prisesDeLIssue(commentaires), instants);
    assert.deepEqual(prisesDeLIssue([...commentaires].reverse()), instants);
  });

  test("une première page de commentaires pleine : le compte est un minimum", async () => {
    const lu = await lireLeRailSurGithub({ depot: DEPOT, appeler: github(100), maintenant: () => new Date(LU) });
    assert.deepEqual(lu.tickets[0]?.prises, { fois: 100, depuis: IL_Y_A_26_H, auMoins: true });
  });
});

describe("la ligne d'alerte en tête du rail", () => {
  test("FAULT, la phrase, et le bouton du geste à sa place — le fait au survol", () => {
    const faits = faitsDe([ticket(4)], [station({ selection: ["chef/autre"] })]);
    const appels: string[] = [];
    const [ligne] = ligneDesAlertesDuRail(doc, faits.alertesDuRail, { ouvrirStations: () => appels.push("stations") }) as unknown as Faux[];
    assert.ok(ligne);
    assert.equal(ligne.role, "alert");
    assert.equal(ligne.dataset.sorte, "cuisine-muette");
    assert.deepEqual(ligne.children.map((enfant) => enfant.textContent), ["FAULT", "Nothing served for 1 h while #4 is ready. No station serves this project.", "Add the project to a station"]);
    assert.equal(ligne.title, `since ${iso(T0 - 3_600_000).slice(0, 16).replace("T", " ")} UTC · #4`);
    ligne.dessous("button")[0]?.click();
    assert.deepEqual(appels, ["stations"]);
  });

  test("une alerte que la cuisine tient le dit à côté de sa phrase", () => {
    const faits = faitsDe([ticket(3812, { titre: "Repair main: runtime tests", reparationDeMain: true, entreLe: IL_Y_A_26_H })], [station()]);
    const [ligne] = ligneDesAlertesDuRail(doc, faits.alertesDuRail, null) as unknown as Faux[];
    assert.deepEqual(ligne?.children.map((enfant) => enfant.textContent), ["FAULT", "Nothing served for 26 h while #3812 is ready. The main branch is red (runtime tests), so nothing merges.", "The kitchen repairs it on #3812."]);
  });

  test("sans alerte, aucune ligne", () => {
    assert.deepEqual(ligneDesAlertesDuRail(doc, undefined, null), []);
    assert.deepEqual(ligneDesAlertesDuRail(doc, [], null), []);
  });
});
