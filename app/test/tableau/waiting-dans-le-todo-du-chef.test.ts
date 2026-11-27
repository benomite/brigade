// Le TODO du chef montre un ticket en WAITING (parqué pour un autre, `parked`) avec sa date de relance (#3814).
import assert from "node:assert/strict";
import { test } from "node:test";
import { blocDuChef, lireCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { corpsDuParking } from "../../../runtime/src/attente-github/marque.ts";

const DEPOT = "acme/kitchen";
const LU = "2026-11-18T12:00:00.000Z";

test("the chef's TODO block lists a ticket in WAITING with its follow-up date", async () => {
  const marque = corpsDuParking({ what: "the client's production API key", who: "the client", followUp: "2026-11-25T00:00:00.000Z" });
  const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
  const appeler: AppelGitHub = async (chemin) => {
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(chemin)?.[1];
    if (label !== undefined) return ok(label === "parked" ? [{ number: 41, title: "Ticket 41", html_url: `https://github.com/${DEPOT}/issues/41`, created_at: "2026-11-17T00:00:00Z", labels: [{ name: "fire" }, { name: "parked" }] }] : []);
    if (chemin.includes("/pulls?")) return ok([]);
    if (/\/issues\/41\/comments/.test(chemin)) return ok([{ body: marque, created_at: "2026-11-17T01:00:00Z", author_association: "OWNER" }]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: { message: "Not Found" } };
  };
  const lecture = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler, maintenant: () => new Date(LU), enWaiting: true });
  assert.ok(lecture.lue, JSON.stringify(lecture));
  const bloc = blocDuChef({ lu: LU, attentes: lecture.attentes, illisibles: lecture.illisibles, depot: DEPOT }).join("\n");
  assert.match(bloc, /#41/);
  assert.match(bloc, /2026-11-25/);
  assert.match(bloc, /API key/);
});
