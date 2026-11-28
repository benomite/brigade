// Le client GitHub de l'app (priority.ts) : ce qui part, tel que la plateforme l'envoie.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clientOfThePriority, sendByFetch } from "../src/priority.ts";

const REPOSITORY = "chef/parade";
const ISSUE = `/repos/${REPOSITORY}/issues/22`;

describe("les demandes, telles qu'elles partent", () => {
  test("un `POST` porte le jeton et son corps en JSON ; un `DELETE` n'a pas de corps ; la lecture est le `GET` du tableau", async () => {
    const sends: { adresse: string; init: RequestInit }[] = [];
    const fake = (async (address: string, init: RequestInit) => (sends.push({ adresse: address, init }), new Response(JSON.stringify([]), { status: 200 }))) as unknown as typeof fetch;
    const readOnes: string[] = [];
    const client = clientOfThePriority({ jeton: async () => "gho_jeton", appeler: async (path) => (readOnes.push(path), { status: 200, data: { labels: [] } }), envoyer: sendByFetch({ fetch: fake }) });

    await client.ecrire("POST", `${ISSUE}/labels`, { labels: ["prio:1"] });
    await client.ecrire("DELETE", `${ISSUE}/labels/prio%3A3`);
    await client.lire(ISSUE);

    assert.deepEqual(
      sends.map(({ adresse: address, init }) => [address, init.method, init.body, (init.headers as Record<string, string>).Authorization, (init.headers as Record<string, string>)["Content-Type"]]),
      [
        [`https://api.github.com${ISSUE}/labels`, "POST", '{"labels":["prio:1"]}', "Bearer gho_jeton", "application/json"],
        [`https://api.github.com${ISSUE}/labels/prio%3A3`, "DELETE", undefined, "Bearer gho_jeton", undefined],
      ],
    );
    assert.deepEqual(readOnes, [ISSUE]);
  });
});
