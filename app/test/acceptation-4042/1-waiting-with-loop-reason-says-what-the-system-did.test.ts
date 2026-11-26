// Test d'acceptation gelé (#4042). Le bandeau FAULT de la vue projet, lu comme le rail le pose : `avecLeRail` tire les alertes de
// l'état des tickets (WAITING, carte du chef, prises), `ligneDesAlertesDuRail` les dessine devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { comprendre, type Facts } from "../../src/facts.ts";
import type { TableauLu } from "../../src/tableau/read.ts";
import { lineDesAlertsDuRail } from "../../src/vue/wait-du-rail/line-des-alerts.js";
import { avecLeRail, type TicketSurGithub } from "../../src/vue/rail/github.ts";
import { Faux } from "../aides/fausse-vue.ts";

const REPOSITORY = "chef/secondes";
const LU = "2026-11-23T12:00:00.000Z";
const T0 = Date.parse(LU);
const iso = (ms: number) => new Date(ms).toISOString();
const IL_Y_A_26_H = iso(T0 - 26 * 3_600_000);
const doc = { createElement: (balise: string) => new Faux(balise) };
const station = (autres: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY], ...autres });
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
const ticket = (numero: number, autres: Partial<TicketSurGithub> = {}): TicketSurGithub => ({ ticket: numero, titre: `Ticket ${numero}`, url: `https://github.com/${REPOSITORY}/issues/${numero}`, etat: "en attente", priorite: null, creeLe: IL_Y_A_26_H, pr: null, prise: null, entreLe: iso(T0 - 3_600_000), ...autres });
const BOUCLE = { fois: 1198, depuis: IL_Y_A_26_H };
const factsDe = (tickets: TicketSurGithub[], stations: StationDuCompte[] = [station()]) => comprendre(JSON.stringify(avecLeRail(EMPTY, { lu: LU, tickets }, { lus: stations }).faits)) as Facts;
// Le texte du bandeau FAULT que la vue dessine : sa marque, sa phrase, ce que la cuisine fait, ses boutons, et son survol.
const banner = (facts: Facts): string => {
  const [line] = lineDesAlertsDuRail(doc, facts.alertesDuRail, null) as unknown as Faux[];
  assert.ok(line, "pas de bandeau FAULT");
  return [...line.children.map((enfant) => enfant.textContent), line.title].join(" ");
};

test("un ticket en WAITING avec une raison de boucle : le bandeau dit que le système l'a mis en WAITING, avec la raison, sans demander au chef de le faire", () => {
  const enWaiting = ticket(3813, { etat: "WAITING", qui: "the kitchen", entreLe: undefined, prises: BOUCLE });
  const texte = banner(factsDe([enWaiting, ticket(4, { entreLe: IL_Y_A_26_H })]));
  assert.match(texte, /#3813/);
  assert.match(texte, /\b(system|kitchen|station)\b[^.]*\b(put|placed|set)\b[^.]*#3813[^.]*\bWAITING\b/i, "dit que le système a mis le ticket en WAITING");
  assert.match(texte, /1,198 times/, "montre la raison : la boucle");
  assert.doesNotMatch(texte, /\bPut #3813 in WAITING/, "ne demande pas au chef de le mettre en WAITING");
  assert.doesNotMatch(texte, /to stop the loop/i);
});
