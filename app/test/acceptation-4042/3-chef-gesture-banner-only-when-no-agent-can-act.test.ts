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

// Un geste que le chef doit faire n'est demandé que là où aucun agent ne peut le faire. Le cas nommé : aucune station ne
// sert le projet — ajouter le projet à une station est un geste du chef, aucun agent ne le fait. Une boucle de relances
// sur un ticket que le système peut mettre en WAITING lui-même ne demande aucun geste.
const SANS_STATION = [station({ selection: ["chef/autre"] })];

test("cas : aucune station ne sert le projet — le bandeau demande au chef d'ajouter le projet à une station, car aucun agent ne peut le faire", () => {
  const facts = factsDe([ticket(4)], SANS_STATION);
  const alert = facts.alertesDuRail?.find(({ sorte }) => sorte === "aucune-station");
  assert.ok(alert, "le cas « aucune station » reste un bandeau");
  assert.equal(alert.bouton, "ajouter-a-une-station");
});

test("cas : un ticket relancé en boucle qu'un agent peut mettre en WAITING — le bandeau ne demande aucun geste au chef", () => {
  const facts = factsDe([ticket(3813, { etat: "pris", prise: { station: "parade-box/claude", le: iso(T0 - 60_000) }, entreLe: undefined, prises: BOUCLE }), ticket(4)]);
  const boucle = facts.alertesDuRail?.find(({ sorte }) => sorte === "relance-en-boucle");
  assert.ok(boucle, "la boucle se dit");
  assert.equal(boucle.geste, null, "aucun geste demandé au chef");
  assert.equal(boucle.bouton, undefined);
  assert.doesNotMatch(boucle.phrase, /\b(Put|Set|Place|Move)\b[^.]*\bWAITING\b/);
  assert.match(boucle.geree ?? "", /\S/, "elle dit ce que la cuisine fait");
});
