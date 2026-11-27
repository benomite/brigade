// Test d'acceptation gelé (#4042). Les bandeaux FAULT de la vue projet, tels que `alertsOfRail` les compose : aucun ne
// demande au chef de mettre un ticket en WAITING.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { alertsOfRail, type EntryOfAlerts } from "../../src/wait-of-rail/alerts.ts";

const REPOSITORY = "chef/secondes";
const READ = "2026-11-23T12:00:00.000Z";
const T0 = Date.parse(READ);
const iso = (ms: number) => new Date(ms).toISOString();
const station = (others: Partial<StationDuCompte> = {}): StationDuCompte => ({ name: "parade-box", lastSeen: iso(T0 - 30_000), stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY], ...others });

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
