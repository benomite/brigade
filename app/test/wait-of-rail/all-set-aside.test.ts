// #3875 : la lecture de l'alerte « tout mis de côté » dans l'app, et ce que le rail lit d'un ticket parqué par ses échecs (#4260).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CallGitHub } from "../../src/board/client.ts";
import { alertsOfRailRead } from "../../src/vue/wait-of-rail/wait-of-rail.ts";
import type { BoardRead } from "../../src/board/read.ts";
import { withTheRail, readTheRailOnGithub } from "../../src/vue/rail/github.ts";
import { corpsDuParking } from "../../../runtime/src/attente-github/marque.ts";

const READ = "2026-11-19T12:00:00.000Z";
const EMPTY: BoardRead = {
  lu: true,
  depot: "a/b",
  luLe: READ,
  cuisine: { rubriques: [] },
  faits: { etat: "ouverte", lu: READ, dernierTick: null, dernierEvenement: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, rail: [] },
  file: [],
  bilans: [],
  lignesDuRail: [],
  activites: [],
};

test("une alerte tout-mis-de-cote est lue sans cause ; la cause connue d'une autre alerte est gardée", () => {
  const raw = { sorte: "tout-mis-de-cote", phrase: "Nothing is served.", fait: { depuis: READ, ticket: 3 }, geste: "Remove the label.", geree: null };
  assert.deepEqual(alertsOfRailRead([{ ...raw, cause: "tout-mis-de-cote" }]), { alertesDuRail: [raw] });
  assert.deepEqual(alertsOfRailRead([{ ...raw, sorte: "cuisine-muette", cause: "base-rouge" }]), { alertesDuRail: [{ ...raw, sorte: "cuisine-muette", cause: "base-rouge" }] });
});

// La station parque un ticket en arrêtant la boucle de ses échecs (#4129) : `parked`, et son commentaire de parking le dit
// (runtime/src/attente/attente-par-le-cook.ts) ; d'abord le label `set-aside:failures`, qui ne se lit plus comme une mise de côté.
const PARKING = (failures: boolean) => corpsDuParking({ what: "its cooks failed too many times, the station stopped relaunching it. The reason: the guard refuses", who: "the supervisor", followUp: "2026-11-23T11:17:00.000Z", fact: "the supervisor answers", ...(failures ? { failures: true as const } : {}) });
const github = (label: string, body: string): CallGitHub => async (path) => {
  const ok = (data: unknown) => ({ status: 200, data });
  if (path.includes("/issues?")) return ok([{ number: 9, title: "T", html_url: "u", created_at: "2026-11-10T09:00:00Z", labels: [{ name: "fire" }, { name: label }] }]);
  if (path.includes("/pulls?")) return ok([]);
  if (path.includes("/issues/9/comments")) return ok([{ id: 1, body: body, author_association: "OWNER", created_at: "2026-11-16T11:17:00Z" }]);
  if (path.includes("/issues/9/events")) return ok([]);
  return { status: 404, data: {} };
};

test("le ticket que la station a parqué par ses échecs porte la date et la raison de son parking ; parqué pour un autre, ou `out-of-kitchen`, non ; aucun champ vide", async () => {
  const readOne = async (label: string, body: string) => (await readTheRailOnGithub({ depot: "a/b", appeler: github(label, body), maintenant: () => new Date(READ) })).tickets[0];
  const failures = await readOne("parked", PARKING(true));
  assert.deepEqual(failures?.parqueParEchecs, { depuis: "2026-11-16T11:17:00Z", raison: "its cooks failed too many times, the station stopped relaunching it. The reason: the guard refuses" });
  assert.equal(failures?.etat, "WAITING");
  assert.deepEqual(Object.keys(failures ?? {}).sort(), ["creeLe", "etat", "parqueParEchecs", "pr", "prise", "priorite", "qui", "ticket", "titre", "url"].sort());
  assert.equal((await readOne("parked", PARKING(false)))?.parqueParEchecs, undefined);
  // Un commentaire de parking que personne du dépôt n'a écrit ne dit rien.
  const foreign = await readTheRailOnGithub({ depot: "a/b", appeler: async (path) => (path.includes("/issues/9/comments") ? { status: 200, data: [{ id: 1, body: PARKING(true), author_association: "NONE", created_at: "2026-11-16T11:17:00Z" }] } : github("parked", "")(path)), maintenant: () => new Date(READ) });
  assert.equal(foreign.tickets[0]?.parqueParEchecs, undefined);
  const kitchen = await readOne("out-of-kitchen", "Station `parade-box/claude`: the guard refuses (out-of-kitchen).");
  assert.equal(kitchen?.parqueParEchecs, undefined);
  assert.equal(kitchen?.etat, "86");
});

test("parqué par ses échecs, seul ticket `fire` : l'alerte du rail le nomme, depuis son parking et avec sa raison ; parqué pour un autre, aucune", async () => {
  const alerts = async (body: string) => (withTheRail(EMPTY, await readTheRailOnGithub({ depot: "a/b", appeler: github("parked", body), maintenant: () => new Date(READ) }), { lus: [] }).faits as { alertesDuRail?: { sorte: string; phrase: string; fait: { ticket?: number; depuis: string } }[] }).alertesDuRail ?? [];
  const [alert] = (await alerts(PARKING(true))).filter(({ sorte: kind }) => kind === "tout-mis-de-cote");
  assert.deepEqual(alert?.fait, { depuis: "2026-11-16T11:17:00Z", ticket: 9 });
  assert.match(alert?.phrase ?? "", /^Nothing is served: #9 is parked by its failures .*: its cooks failed too many times, the station stopped relaunching it\. The reason: the guard refuses\. /);
  assert.deepEqual((await alerts(PARKING(false))).filter(({ sorte: kind }) => kind === "tout-mis-de-cote"), []);
});
