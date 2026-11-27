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

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { alertsOfRail, type EntryOfAlerts } from "../../src/wait-of-rail/alerts.ts";
import { fileURLToPath } from "node:url";

const entry = (surcharge: Partial<EntryOfAlerts> = {}): EntryOfAlerts => ({
  depot: REPOSITORY,
  maintenant: T0,
  tickets: [{ ticket: 4, etat: "queued", entreLe: iso(T0 - 3_600_000), depend: [] }],
  stations: { lues: [station()] },
  plafondAtteint: false,
  entete: { cuisinent: [] },
  cookEnCours: false,
  dernierCook: null,
  baseRouge: null,
  relances: [],
  dernierServiLe: iso(T0 - 3_600_000),
  ...surcharge,
});

const files = (folder: string): string[] => readdirSync(folder).flatMap((name) => (statSync(join(folder, name)).isDirectory() ? (name === "node_modules" ? [] : files(join(folder, name))) : /\.(ts|js)$/.test(name) ? [join(folder, name)] : []));

test("aucun texte de bandeau FAULT de la vue projet ne demande au chef de mettre un ticket en WAITING", () => {
  const theCase = [
    entry({ stations: { lues: [] } }),
    entry({ stations: { lues: [station({ lastSeen: iso(T0 - 3_600_000) })] } }),
    entry({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: 3812 } }),
    entry({ relances: [{ ticket: 3813, fois: 1198, depuis: iso(T0 - 7_200_000) }] }),
    entry({ tickets: [], misDeCoteParEchecs: [{ ticket: 9, depuis: iso(T0 - 7_200_000), raison: null }] }),
  ];
  for (const alert of theCase.flatMap((oneOf) => alertsOfRail(oneOf))) {
    for (const text of [alert.phrase, alert.geste ?? "", alert.geree ?? ""]) assert.doesNotMatch(text, /\b(Put|Set|Place|Move)\b[^.]*\bin WAITING\b/, `${alert.sorte} : ${text}`);
  }
  // Et aucune phrase de ce genre n'est écrite dans les sources de l'app qui composent ces bandeaux.
  for (const file of files(fileURLToPath(new URL("../../src", import.meta.url)))) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /["'`]Put [^"'`]*in WAITING/, file);
  }
});
