// #3875 : la lecture de l'alerte « tout mis de côté » dans l'app, et ce que le rail lit d'un ticket mis de côté par ses échecs.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import { alertesDuRailLues } from "../../src/vue/attente-du-rail/attente-du-rail.ts";
import { lireLeRailSurGithub } from "../../src/vue/rail/github.ts";

const LU = "2026-11-19T12:00:00.000Z";

test("une alerte tout-mis-de-cote est lue sans cause ; la cause connue d'une autre alerte est gardée", () => {
  const brute = { sorte: "tout-mis-de-cote", phrase: "Nothing is served.", fait: { depuis: LU, ticket: 3 }, geste: "Remove the label.", geree: null };
  assert.deepEqual(alertesDuRailLues([{ ...brute, cause: "tout-mis-de-cote" }]), { alertesDuRail: [brute] });
  assert.deepEqual(alertesDuRailLues([{ ...brute, sorte: "cuisine-muette", cause: "base-rouge" }]), { alertesDuRail: [{ ...brute, sorte: "cuisine-muette", cause: "base-rouge" }] });
});

const github = (label: string): AppelGitHub => async (chemin) => {
  const ok = (data: unknown) => ({ status: 200, data });
  if (chemin.includes("/issues?")) return ok([{ number: 9, title: "T", html_url: "u", created_at: "2026-11-10T09:00:00Z", labels: [{ name: "fire" }, { name: label }] }]);
  if (chemin.includes("/pulls?")) return ok([]);
  if (chemin.includes("/issues/9/comments")) return ok([{ id: 1, body: "Station `parade-box/claude`: the guard refuses. Set aside by its failures (set-aside:failures).", author_association: "OWNER", created_at: "2026-11-16T11:17:00Z" }]);
  if (chemin.includes("/issues/9/events")) return ok([]);
  return { status: 404, data: {} };
};

test("le ticket mis de côté par ses échecs porte la date ; `out-of-kitchen` ne la porte pas ; aucun champ vide", async () => {
  const lu = async (label: string) => (await lireLeRailSurGithub({ depot: "a/b", appeler: github(label), maintenant: () => new Date(LU) })).tickets[0];
  const echecs = await lu("set-aside:failures");
  assert.equal(echecs?.miseDeCoteLe, "2026-11-16T11:17:00Z");
  assert.equal(echecs?.etat, "86");
  assert.deepEqual(Object.keys(echecs ?? {}).sort(), ["creeLe", "etat", "miseDeCote", "miseDeCoteLe", "pr", "prise", "priorite", "ticket", "titre", "url"].sort());
  const cuisine = await lu("out-of-kitchen");
  assert.equal(cuisine?.miseDeCoteLe, undefined);
  assert.equal(cuisine?.etat, "86");
});
