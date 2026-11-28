// Le TODO du chef montre un ticket en WAITING (parqué pour un autre, `parked`) avec sa date de relance (#3814).
import assert from "node:assert/strict";
import { test } from "node:test";
import { blockOfChef, readWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { parkingBody as corpsDuParking } from "../parking-body.ts";

const REPOSITORY = "acme/kitchen";
const READ = "2026-11-18T12:00:00.000Z";

test("the chef's TODO block lists a ticket in WAITING with its follow-up date", async () => {
  const brand = corpsDuParking({ what: "the client's production API key", who: "the client", followUp: "2026-11-25T00:00:00.000Z" });
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  const call: CallGitHub = async (path) => {
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(path)?.[1];
    if (label !== undefined) return ok(label === "parked" ? [{ number: 41, title: "Ticket 41", html_url: `https://github.com/${REPOSITORY}/issues/41`, created_at: "2026-11-17T00:00:00Z", labels: [{ name: "fire" }, { name: "parked" }] }] : []);
    if (path.includes("/pulls?")) return ok([]);
    if (/\/issues\/41\/comments/.test(path)) return ok([{ body: brand, created_at: "2026-11-17T01:00:00Z", author_association: "OWNER" }]);
    if (/\/issues\/\d+\/(comments|events)/.test(path)) return ok([]);
    return { status: 404, data: { message: "Not Found" } };
  };
  const reading = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: call, maintenant: () => new Date(READ), enWaiting: true });
  assert.ok(reading.lue, JSON.stringify(reading));
  const block = blockOfChef({ lu: READ, attentes: reading.attentes, illisibles: reading.illisibles }).join("\n");
  assert.match(block, /#41/);
  assert.match(block, /2026-11-25/);
  assert.match(block, /API key/);
});
