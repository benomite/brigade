// #3875, critère 1 : un ticket qui porte `out-of-kitchen` (d'abord aussi `set-aside:failures`, parqué depuis #4260) est sur le rail mis de côté (« 86 »), jamais en file,
// et sa carte dit la raison du dernier commentaire de la station.
// Test d'acceptation gelé (#3725).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationDuCompte } from "../../../runtime/src/attente-du-rail/stations.ts";
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

// #1029 porte `fire` depuis le 2026-11-10 et `label` ; la station a dit pourquoi, en le mettant de côté, le 2026-11-16 à 11:17.
function github(label: string): CallGitHub {
  const ok = (data: unknown) => ({ status: 200, data });
  return async (path) => {
    if (path.includes("/issues?")) {
      return ok([{ number: 1029, title: "Ticket 1029", html_url: `https://github.com/${REPOSITORY}/issues/1029`, created_at: "2026-11-10T09:00:00Z", labels: [{ name: "fire" }, { name: label }] }]);
    }
    if (path.includes("/pulls?")) return ok([]);
    if (path.includes("/issues/1029/comments")) {
      return ok([{ id: 1, body: `Station \`parade-box/claude\`: ${REASON}. Set aside by its failures (${label}).`, author_association: "OWNER", created_at: SET_ASIDE_THE }]);
    }
    if (path.includes("/issues/1029/events")) return ok([{ event: "labeled", label: { name: "fire" }, created_at: "2026-11-10T09:05:00Z" }]);
    return { status: 404, data: {} };
  };
}

async function read(label: string) {
  const rail = await readTheRailOnGithub({ depot: REPOSITORY, appeler: github(label), maintenant: () => NOW });
  return { rail, lu: withTheRail(EMPTY, rail, SIGNS) };
}

// `set-aside:failures` n'est plus une mise de côté : un ticket que ses échecs arrêtent est parqué (#4260).
for (const label of ["out-of-kitchen"]) {
  test(`a ticket carrying ${label} shows as set aside, never queued, and its card says the station's reason`, async () => {
    const { rail, lu: readOne } = await read(label);
    const read1029 = rail.tickets.find(({ ticket }) => ticket === 1029) ?? assert.fail("#1029 is on the rail");
    assert.equal(read1029.etat, "86");
    assert.ok(read1029.miseDeCote?.raison?.includes(REASON), `reason: ${read1029.miseDeCote?.raison}`);
    const done = (readOne.faits as unknown as Facts).rail.find(({ ticket }) => ticket === 1029) ?? assert.fail("#1029 is in the facts");
    assert.equal(done.etat, "86");
    assert.ok(done.attente?.raison.includes(REASON), `card: ${done.attente?.raison}`);
  });
}
