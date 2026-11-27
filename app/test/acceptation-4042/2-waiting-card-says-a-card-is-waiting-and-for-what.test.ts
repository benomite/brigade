// Test d'acceptation gelé (#4042). Le bandeau FAULT de la vue projet, lu comme le rail le pose : `avecLeRail` tire les alertes de
// l'état des tickets (WAITING, carte du chef, prises), `ligneDesAlertesDuRail` les dessine devant un faux document.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { comprendre, type Faits } from "../../src/faits.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { ligneDesAlertesDuRail } from "../../src/vue/attente-du-rail/ligne-des-alertes.js";
import { avecLeRail, type TicketSurGithub } from "../../src/vue/rail/github.ts";
import { Faux } from "../aides/fausse-vue.ts";

const DEPOT = "chef/secondes";
const LU = "2026-11-23T12:00:00.000Z";
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
const BOUCLE = { fois: 1198, depuis: IL_Y_A_26_H };
const faitsDe = (tickets: TicketSurGithub[], stations: StationDuCompte[] = [station()]) => comprendre(JSON.stringify(avecLeRail(VIDE, { lu: LU, tickets }, { lus: stations }).faits)) as Faits;
// Le texte du bandeau FAULT que la vue dessine : sa marque, sa phrase, ce que la cuisine fait, ses boutons, et son survol.
const bandeau = (faits: Faits): string => {
  const [ligne] = ligneDesAlertesDuRail(doc, faits.alertesDuRail, null) as unknown as Faux[];
  assert.ok(ligne, "pas de bandeau FAULT");
  return [...ligne.children.map((enfant) => enfant.textContent), ligne.title].join(" ");
};

test("un ticket avec une carte qui attend le chef : le bandeau dit qu'une carte attend et pour quel besoin, sans consigne pour arrêter une boucle", () => {
  const carte = { label: "blocked-on-human", raison: "Pick the pricing plan for the launch", liens: [], auChef: true } as TicketSurGithub["miseDeCote"];
  const avecCarte = ticket(3813, { etat: "86", miseDeCote: carte, entreLe: undefined, prises: BOUCLE });
  const texte = bandeau(faitsDe([avecCarte, ticket(4, { entreLe: IL_Y_A_26_H })]));
  assert.match(texte, /#3813/);
  assert.match(texte, /\bcard\b[^.]*\bwait(s|ing)\b|\bwait(s|ing)\b[^.]*\bcard\b/i, "dit qu'une carte attend");
  assert.match(texte, /Pick the pricing plan for the launch/, "dit pour quel besoin");
  assert.doesNotMatch(texte, /stop the loop/i, "aucune consigne pour arrêter la boucle");
  assert.doesNotMatch(texte, /\bPut #3813 in WAITING/);
});
