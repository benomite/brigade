// Test d'acceptation gelé (#4042). Le bandeau FAULT de la vue projet, lu comme le rail le pose : `avecLeRail` tire les alertes de
// l'état des tickets (WAITING, carte du chef, prises), `ligneDesAlertesDuRail` les dessine devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { understand, type Facts } from "../../src/facts.ts";
import type { BoardRead } from "../../src/board/read.ts";
import { lineOfAlertsOfRail } from "../../src/vue/wait-of-rail/line-of-alerts.js";
import { withTheRail, type TicketOnGithub } from "../../src/vue/rail/github.ts";
import { Fake } from "../helpers/false-vue.ts";

const REPOSITORY = "chef/secondes";
const READ = "2026-11-23T12:00:00.000Z";
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
const LOOP = { fois: 1198, depuis: IT_Y_A_26_H };
const factsOf = (tickets: TicketOnGithub[], stations: StationDuCompte[] = [station()]) => understand(JSON.stringify(withTheRail(EMPTY, { lu: READ, tickets }, { lus: stations }).faits)) as Facts;
// Le texte du bandeau FAULT que la vue dessine : sa marque, sa phrase, ce que la cuisine fait, ses boutons, et son survol.
const banner = (facts: Facts): string => {
  const [line] = lineOfAlertsOfRail(doc, facts.alertesDuRail, null) as unknown as Fake[];
  assert.ok(line, "pas de bandeau FAULT");
  return [...line.children.map((child) => child.textContent), line.title].join(" ");
};

test("un ticket en WAITING avec une raison de boucle : le bandeau dit que le système l'a mis en WAITING, avec la raison, sans demander au chef de le faire", () => {
  const enWaiting = ticket(3813, { etat: "WAITING", qui: "the kitchen", entreLe: undefined, prises: LOOP });
  const text = banner(factsOf([enWaiting, ticket(4, { entreLe: IT_Y_A_26_H })]));
  assert.match(text, /#3813/);
  assert.match(text, /\b(system|kitchen|station)\b[^.]*\b(put|placed|set)\b[^.]*#3813[^.]*\bWAITING\b/i, "dit que le système a mis le ticket en WAITING");
  assert.match(text, /1,198 times/, "montre la raison : la boucle");
  assert.doesNotMatch(text, /\bPut #3813 in WAITING/, "ne demande pas au chef de le mettre en WAITING");
  assert.doesNotMatch(text, /to stop the loop/i);
});
