// #3875, critère 2 : la bannière « Nothing served » ne nomme jamais un ticket mis de côté comme prêt — sur espace, avec #1029
// pour seul ticket `fire`, elle ne dit pas « #1029 is ready ».
// Test d'acceptation gelé (#3725).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
import { corpsDuParking } from "../../../runtime/src/attente-github/marque.ts";
import type { Facts } from "../../src/facts.ts";
import type { CallGitHub } from "../../src/tableau/client.ts";
import type { TableauLu } from "../../src/tableau/read.ts";
import { avecLeRail, lireLeRailSurGithub, type SignesDeVie } from "../../src/vue/rail/github.ts";

const REPOSITORY = "BOBL-tech/espace";
const MAINTENANT = new Date("2026-11-19T12:00:00.000Z");
const MIS_DE_SIDE_LE = "2026-11-16T11:17:00Z";
const RAISON = "the cook's guard refuses gh workflow run";
const station: StationDuCompte = { name: "parade-box", lastSeen: "2026-11-19T11:59:30.000Z", stoppedAt: null, refreshMs: 120_000, selection: [REPOSITORY] };
const SIGNES: SignesDeVie = { lus: [station] };
const EMPTY: TableauLu = {
  lu: true,
  depot: REPOSITORY,
  luLe: MAINTENANT.toISOString(),
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: MAINTENANT.toISOString(), dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

// #1029 porte `fire` depuis le 2026-11-10 et `label` ; la station a dit pourquoi, en le parquant par ses échecs, le 2026-11-16 à
// 11:17 : son commentaire de parking (#4260 ; d'abord le label `set-aside:failures`).
const PARKING = corpsDuParking({ what: `its cooks failed too many times, the station stopped relaunching it. The reason: ${RAISON}`, who: "the supervisor", followUp: "2026-11-23T11:17:00.000Z", fact: "the supervisor answers", failures: true });
function github(label: string): CallGitHub {
  const ok = (data: unknown) => ({ status: 200, data });
  return async (chemin) => {
    if (chemin.includes("/issues?")) {
      return ok([{ number: 1029, title: "Ticket 1029", html_url: `https://github.com/${REPOSITORY}/issues/1029`, created_at: "2026-11-10T09:00:00Z", labels: [{ name: "fire" }, { name: label }] }]);
    }
    if (chemin.includes("/pulls?")) return ok([]);
    if (chemin.includes("/issues/1029/comments")) {
      return ok([{ id: 1, body: PARKING, author_association: "OWNER", created_at: MIS_DE_SIDE_LE }]);
    }
    if (chemin.includes("/issues/1029/events")) return ok([{ event: "labeled", label: { name: "fire" }, created_at: "2026-11-10T09:05:00Z" }]);
    return { status: 404, data: {} };
  };
}

async function lire(label: string) {
  const rail = await lireLeRailSurGithub({ depot: REPOSITORY, appeler: github(label), maintenant: () => MAINTENANT });
  return { rail, lu: avecLeRail(EMPTY, rail, SIGNES) };
}

test("the Nothing served banner does not say #1029 is ready when it is set aside by its failures", async () => {
  const { lu } = await lire("parked");
  const alerts = (lu.faits as unknown as Facts).alertesDuRail ?? [];
  for (const { phrase } of alerts) {
    assert.doesNotMatch(phrase, /#1029 is ready/, phrase);
    assert.doesNotMatch(phrase, /Nothing served[^.]*while #1029/, phrase);
  }
});
