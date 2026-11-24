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

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { alertesDuRail, type EntreeDesAlertes } from "../../src/attente-du-rail/alertes.ts";

const entree = (surcharge: Partial<EntreeDesAlertes> = {}): EntreeDesAlertes => ({
  depot: DEPOT,
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

const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap((nom) => (statSync(join(dossier, nom)).isDirectory() ? (nom === "node_modules" ? [] : fichiers(join(dossier, nom))) : /\.(ts|js)$/.test(nom) ? [join(dossier, nom)] : []));

test("aucun texte de bandeau FAULT de la vue projet ne demande au chef de mettre un ticket en WAITING", () => {
  const cas = [
    entree({ stations: { lues: [] } }),
    entree({ stations: { lues: [station({ lastSeen: iso(T0 - 3_600_000) })] } }),
    entree({ baseRouge: { depuis: iso(T0 - 7_200_000), check: "runtime tests", ticket: 3812 } }),
    entree({ relances: [{ ticket: 3813, fois: 1198, depuis: iso(T0 - 7_200_000) }] }),
    entree({ tickets: [], misDeCoteParEchecs: [{ ticket: 9, depuis: iso(T0 - 7_200_000), raison: null }] }),
  ];
  for (const alerte of cas.flatMap((un) => alertesDuRail(un))) {
    for (const texte of [alerte.phrase, alerte.geste ?? "", alerte.geree ?? ""]) assert.doesNotMatch(texte, /\b(Put|Set|Place|Move)\b[^.]*\bin WAITING\b/, `${alerte.sorte} : ${texte}`);
  }
  // Et aucune phrase de ce genre n'est écrite dans les sources de l'app qui composent ces bandeaux.
  for (const fichier of fichiers(new URL("../../src", import.meta.url).pathname)) {
    assert.doesNotMatch(readFileSync(fichier, "utf8"), /["'`]Put [^"'`]*in WAITING/, fichier);
  }
});
