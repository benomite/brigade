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

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { alertsDuRail, type EntreeDesAlerts } from "../../src/wait-du-rail/alerts.ts";
import { fileURLToPath } from "node:url";

const entree = (surcharge: Partial<EntreeDesAlerts> = {}): EntreeDesAlerts => ({
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

const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap((name) => (statSync(join(dossier, name)).isDirectory() ? (name === "node_modules" ? [] : fichiers(join(dossier, name))) : /\.(ts|js)$/.test(name) ? [join(dossier, name)] : []));

test("aucun texte de bandeau FAULT de la vue projet ne demande au chef de mettre un ticket en WAITING", () => {
  const cas = [
    entree({ stations: { lues: [] } }),
    entree({ stations: { lues: [station({ lastSeen: iso(T0 - 3_600_000) })] } }),
    entree({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: 3812 } }),
    entree({ relances: [{ ticket: 3813, fois: 1198, depuis: iso(T0 - 7_200_000) }] }),
    entree({ tickets: [], misDeCoteParEchecs: [{ ticket: 9, depuis: iso(T0 - 7_200_000), raison: null }] }),
  ];
  for (const alert of cas.flatMap((un) => alertsDuRail(un))) {
    for (const texte of [alert.phrase, alert.geste ?? "", alert.geree ?? ""]) assert.doesNotMatch(texte, /\b(Put|Set|Place|Move)\b[^.]*\bin WAITING\b/, `${alert.sorte} : ${texte}`);
  }
  // Et aucune phrase de ce genre n'est écrite dans les sources de l'app qui composent ces bandeaux.
  for (const fichier of fichiers(fileURLToPath(new URL("../../src", import.meta.url)))) {
    assert.doesNotMatch(readFileSync(fichier, "utf8"), /["'`]Put [^"'`]*in WAITING/, fichier);
  }
});
