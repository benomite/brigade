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

// Un geste que le chef doit faire n'est demandé que là où aucun agent ne peut le faire. Le cas nommé : aucune station ne
// sert le projet — ajouter le projet à une station est un geste du chef, aucun agent ne le fait. Une boucle de relances
// sur un ticket que le système peut mettre en WAITING lui-même ne demande aucun geste.
const WITHOUT_STATION = [station({ selection: ["chef/autre"] })];

test("cas : aucune station ne sert le projet — le bandeau demande au chef d'ajouter le projet à une station, car aucun agent ne peut le faire", () => {
  const facts = factsOf([ticket(4)], WITHOUT_STATION);
  const alert = facts.alertesDuRail?.find(({ sorte: kind }) => kind === "aucune-station");
  assert.ok(alert, "le cas « aucune station » reste un bandeau");
  assert.equal(alert.bouton, "ajouter-a-une-station");
});

test("cas : un ticket relancé en boucle qu'un agent peut mettre en WAITING — le bandeau ne demande aucun geste au chef", () => {
  const facts = factsOf([ticket(3813, { etat: "pris", prise: { station: "parade-box/claude", le: iso(T0 - 60_000) }, entreLe: undefined, prises: LOOP }), ticket(4)]);
  const loop = facts.alertesDuRail?.find(({ sorte: kind }) => kind === "relance-en-boucle");
  assert.ok(loop, "la boucle se dit");
  assert.equal(loop.geste, null, "aucun geste demandé au chef");
  assert.equal(loop.bouton, undefined);
  assert.doesNotMatch(loop.phrase, /\b(Put|Set|Place|Move)\b[^.]*\bWAITING\b/);
  assert.match(loop.geree ?? "", /\S/, "elle dit ce que la cuisine fait");
});
