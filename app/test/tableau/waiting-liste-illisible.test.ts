// La liste des issues au label `parked` (#4129, d'abord `waiting`) que GitHub refuse ne fait pas tomber ce qui attend le chef (#3814) : le bloc le
// dit, et les issues en WAITING des autres listes y gardent leur ligne.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blocDuChef, lireCeQuiAwaitingLeChef } from "../../src/tableau/wait-du-chef.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/tableau/client.ts";
import { corpsDuParking } from "../../../runtime/src/attente-github/marque.ts";

const REPOSITORY = "acme/kitchen";
const LU = "2026-11-18T12:00:00.000Z";

test("the `parked` list refused by GitHub: the chef's reading still stands, the block says it, and a WAITING ticket of the rail keeps its line", async () => {
  const marque = corpsDuParking({ what: "the client's production API key", who: "the client", followUp: "2026-11-25T00:00:00.000Z" });
  const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
  const appeler: CallGitHub = async (chemin) => {
    const label = /\/issues\?.*\blabels=([^&]+)/.exec(chemin)?.[1];
    if (label === "parked") return { status: 502, data: { message: "Bad Gateway" } };
    if (label !== undefined) return ok(label === "fire" ? [{ number: 41, title: "Ticket 41", created_at: "2026-11-17T00:00:00Z", labels: [{ name: "fire" }, { name: "parked" }] }] : []);
    if (/\/issues\/41\/comments/.test(chemin)) return ok([{ body: marque, created_at: "2026-11-17T01:00:00Z", author_association: "OWNER" }]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: { message: "Not Found" } };
  };
  const read = await lireCeQuiAwaitingLeChef({ depot: REPOSITORY, appeler, maintenant: () => new Date(LU), enWaiting: true });
  assert.ok(read.lue, JSON.stringify(read));
  const bloc = blocDuChef({ lu: LU, attentes: read.attentes, illisibles: read.illisibles, depot: REPOSITORY }).join("\n");
  assert.match(bloc, /the `parked` issues were not listed from GitHub: GitHub answered HTTP 502/);
  assert.match(bloc, /#41 {2}WAITING {2}awaiting the client: “the client's production API key” — resumes where it was on its own on 2026-11-25 00:00 UTC/);
  assert.match(bloc, /nothing awaits the chef/);
});
