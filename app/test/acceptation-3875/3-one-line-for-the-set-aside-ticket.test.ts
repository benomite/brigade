// #3875, critère 3 : quand les seuls tickets `fire` sont mis de côté par leurs échecs, le rail le dit en une ligne — quel
// ticket, depuis quand, la raison de la station —, jamais « the queue waits for a free turn ».
// Test d'acceptation gelé (#3725).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/rail-bloque/rail-bloque.ts";
import type { Faits } from "../../src/faits.ts";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { avecLeRail, lireLeRailSurGithub, type SignesDeVie } from "../../src/vue/rail/github.ts";

const DEPOT = "BOBL-tech/espace";
const MAINTENANT = new Date("2026-11-19T12:00:00.000Z");
const MIS_DE_COTE_LE = "2026-11-16T11:17:00Z";
const RAISON = "the cook's guard refuses gh workflow run";
const station: StationDuCompte = { name: "parade-box", lastSeen: "2026-11-19T11:59:30.000Z", stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] };
const SIGNES: SignesDeVie = { lus: [station] };
const VIDE: TableauLu = {
  lu: true,
  depot: DEPOT,
  luLe: MAINTENANT.toISOString(),
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: MAINTENANT.toISOString(), dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

// #1029 porte `fire` depuis le 2026-11-10 et `label` ; la station a dit pourquoi, en le mettant de côté, le 2026-11-16 à 11:17.
function github(label: string): AppelGitHub {
  const ok = (data: unknown) => ({ status: 200, data });
  return async (chemin) => {
    if (chemin.includes("/issues?")) {
      return ok([{ number: 1029, title: "Ticket 1029", html_url: `https://github.com/${DEPOT}/issues/1029`, created_at: "2026-11-10T09:00:00Z", labels: [{ name: "fire" }, { name: label }] }]);
    }
    if (chemin.includes("/pulls?")) return ok([]);
    if (chemin.includes("/issues/1029/comments")) {
      return ok([{ id: 1, body: `Station \`parade-box/claude\`: ${RAISON}. Set aside by its failures (${label}).`, author_association: "OWNER", created_at: MIS_DE_COTE_LE }]);
    }
    if (chemin.includes("/issues/1029/events")) return ok([{ event: "labeled", label: { name: "fire" }, created_at: "2026-11-10T09:05:00Z" }]);
    return { status: 404, data: {} };
  };
}

async function lire(label: string) {
  const rail = await lireLeRailSurGithub({ depot: DEPOT, appeler: github(label), maintenant: () => MAINTENANT });
  return { rail, lu: avecLeRail(VIDE, rail, SIGNES) };
}

test("when the only fire ticket is set aside by its failures, the rail says which, since when and why, in one line", async () => {
  const { lu } = await lire("set-aside:failures");
  const alertes = (lu.faits as unknown as Faits).alertesDuRail ?? [];
  assert.ok(alertes.length > 0, "the rail shows an alert");
  const alerte = alertes.find(({ phrase }) => phrase.includes("#1029")) ?? assert.fail(`no alert names #1029: ${JSON.stringify(alertes)}`);
  assert.doesNotMatch(alerte.phrase, /\n/);
  assert.match(alerte.phrase, /11:17/, "since when");
  assert.ok(alerte.phrase.includes(RAISON), `the station's reason: ${alerte.phrase}`);
  for (const { phrase } of alertes) assert.doesNotMatch(phrase, /free turn/, phrase);
});
