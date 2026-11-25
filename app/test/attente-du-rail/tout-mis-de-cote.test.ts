// #3875 : la lecture de l'alerte « tout mis de côté » dans l'app, et ce que le rail lit d'un ticket parqué par ses échecs (#4260).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import { alertesDuRailLues } from "../../src/vue/attente-du-rail/attente-du-rail.ts";
import { lireLeRailSurGithub } from "../../src/vue/rail/github.ts";
import { corpsDuParking } from "../../../runtime/src/attente-github/marque.ts";

const LU = "2026-11-19T12:00:00.000Z";

test("une alerte tout-mis-de-cote est lue sans cause ; la cause connue d'une autre alerte est gardée", () => {
  const brute = { sorte: "tout-mis-de-cote", phrase: "Nothing is served.", fait: { depuis: LU, ticket: 3 }, geste: "Remove the label.", geree: null };
  assert.deepEqual(alertesDuRailLues([{ ...brute, cause: "tout-mis-de-cote" }]), { alertesDuRail: [brute] });
  assert.deepEqual(alertesDuRailLues([{ ...brute, sorte: "cuisine-muette", cause: "base-rouge" }]), { alertesDuRail: [{ ...brute, sorte: "cuisine-muette", cause: "base-rouge" }] });
});

// La station parque un ticket en arrêtant la boucle de ses échecs (#4129) : `parked`, et son commentaire de parking le dit
// (runtime/src/attente/attente-par-le-cook.ts) ; d'abord le label `set-aside:failures`, qui ne se lit plus comme une mise de côté.
const PARKING = (failures: boolean) => corpsDuParking({ what: "its cooks failed too many times, the station stopped relaunching it. The reason: the guard refuses", who: "the supervisor", followUp: "2026-11-23T11:17:00.000Z", fact: "the supervisor answers", ...(failures ? { failures: true as const } : {}) });
const github = (label: string, corps: string): AppelGitHub => async (chemin) => {
  const ok = (data: unknown) => ({ status: 200, data });
  if (chemin.includes("/issues?")) return ok([{ number: 9, title: "T", html_url: "u", created_at: "2026-11-10T09:00:00Z", labels: [{ name: "fire" }, { name: label }] }]);
  if (chemin.includes("/pulls?")) return ok([]);
  if (chemin.includes("/issues/9/comments")) return ok([{ id: 1, body: corps, author_association: "OWNER", created_at: "2026-11-16T11:17:00Z" }]);
  if (chemin.includes("/issues/9/events")) return ok([]);
  return { status: 404, data: {} };
};

test("le ticket que la station a parqué par ses échecs porte la date et la raison de son parking ; parqué pour un autre, ou `out-of-kitchen`, non ; aucun champ vide", async () => {
  const lu = async (label: string, corps: string) => (await lireLeRailSurGithub({ depot: "a/b", appeler: github(label, corps), maintenant: () => new Date(LU) })).tickets[0];
  const echecs = await lu("parked", PARKING(true));
  assert.deepEqual(echecs?.parqueParEchecs, { depuis: "2026-11-16T11:17:00Z", raison: "its cooks failed too many times, the station stopped relaunching it. The reason: the guard refuses" });
  assert.equal(echecs?.etat, "WAITING");
  assert.deepEqual(Object.keys(echecs ?? {}).sort(), ["creeLe", "etat", "parqueParEchecs", "pr", "prise", "priorite", "qui", "ticket", "titre", "url"].sort());
  assert.equal((await lu("parked", PARKING(false)))?.parqueParEchecs, undefined);
  // Un commentaire de parking que personne du dépôt n'a écrit ne dit rien.
  const etranger = await lireLeRailSurGithub({ depot: "a/b", appeler: async (chemin) => (chemin.includes("/issues/9/comments") ? { status: 200, data: [{ id: 1, body: PARKING(true), author_association: "NONE", created_at: "2026-11-16T11:17:00Z" }] } : github("parked", "")(chemin)), maintenant: () => new Date(LU) });
  assert.equal(etranger.tickets[0]?.parqueParEchecs, undefined);
  const cuisine = await lu("out-of-kitchen", "Station `parade-box/claude`: the guard refuses (out-of-kitchen).");
  assert.equal(cuisine?.parqueParEchecs, undefined);
  assert.equal(cuisine?.etat, "86");
});
