// #3875, critère 2 : la bannière « Nothing served » ne nomme jamais un ticket mis de côté comme prêt — sur espace, avec #1029
// pour seul ticket `fire`, elle ne dit pas « #1029 is ready ».
// Test d'acceptation gelé (#3725).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { corpsDuParking } from "../../../runtime/src/attente-github/marque.ts";
import type { Facts } from "../../src/facts.ts";
import type { CallGitHub } from "../../src/board/client.ts";
import type { BoardRead } from "../../src/board/read.ts";
import { withTheRail, readTheRailOnGithub, type SignsOfLife } from "../../src/vue/rail/github.ts";

const REPOSITORY = "BOBL-tech/espace";
const NOW = new Date("2026-11-19T12:00:00.000Z");
const SET_ASIDE_THE = "2026-11-16T11:17:00Z";
const REASON = "the cook's guard refuses gh workflow run";
const station: StationDuCompte = { name: "parade-box", lastSeen: "2026-11-19T11:59:30.000Z", stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY] };
const SIGNS: SignsOfLife = { lus: [station] };
const EMPTY: BoardRead = {
  lu: true,
  depot: REPOSITORY,
  luLe: NOW.toISOString(),
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: NOW.toISOString(), dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

// #1029 porte `fire` depuis le 2026-11-10 et `label` ; la station a dit pourquoi, en le parquant par ses échecs, le 2026-11-16 à
// 11:17 : son commentaire de parking (#4260 ; d'abord le label `set-aside:failures`).
const PARKING = corpsDuParking({ what: `its cooks failed too many times, the station stopped relaunching it. The reason: ${REASON}`, who: "the supervisor", followUp: "2026-11-23T11:17:00.000Z", fact: "the supervisor answers", failures: true });
function github(label: string): CallGitHub {
  const ok = (data: unknown) => ({ status: 200, data });
  return async (path) => {
    if (path.includes("/issues?")) {
      return ok([{ number: 1029, title: "Ticket 1029", html_url: `https://github.com/${REPOSITORY}/issues/1029`, created_at: "2026-11-10T09:00:00Z", labels: [{ name: "fire" }, { name: label }] }]);
    }
    if (path.includes("/pulls?")) return ok([]);
    if (path.includes("/issues/1029/comments")) {
      return ok([{ id: 1, body: PARKING, author_association: "OWNER", created_at: SET_ASIDE_THE }]);
    }
    if (path.includes("/issues/1029/events")) return ok([{ event: "labeled", label: { name: "fire" }, created_at: "2026-11-10T09:05:00Z" }]);
    return { status: 404, data: {} };
  };
}

async function read(label: string) {
  const rail = await readTheRailOnGithub({ depot: REPOSITORY, appeler: github(label), maintenant: () => NOW });
  return { rail, lu: withTheRail(EMPTY, rail, SIGNS) };
}

test("the Nothing served banner does not say #1029 is ready when it is set aside by its failures", async () => {
  const { lu: readOne } = await read("parked");
  const alerts = (readOne.faits as unknown as Facts).alertesDuRail ?? [];
  for (const { phrase: sentence } of alerts) {
    assert.doesNotMatch(sentence, /#1029 is ready/, sentence);
    assert.doesNotMatch(sentence, /Nothing served[^.]*while #1029/, sentence);
  }
});
