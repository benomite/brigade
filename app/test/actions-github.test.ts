// Le geste du second écrit sur GitHub même : déparquer un ticket retire `parked` de son issue (#4129, d'abord `waiting`).
// Joué contre un GitHub en mémoire, qui note chaque demande.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { unpark, WITHOUT_DONE } from "../src/actions-github.ts";
import type { ClientOfThePriority } from "../src/priority.ts";
import type { AnswerGitHub } from "../src/board/client.ts";

// Les labels d'avant parked que la cuisine lit encore comme parqués (runtime/src/kitchen/decide.ts).
const LABELS_BEFORE_PARKED = ["waiting", "blocked-on-human"];
const REPOSITORY = "chef/parade";

// Un GitHub en mémoire : chaque écriture notée, et la réponse que `repondre` rend — ou ce qu'il lève.
function github(reply: (method: string, path: string) => AnswerGitHub = () => ({ status: 200, data: [] })) {
  const requests: string[] = [];
  const client: ClientOfThePriority = {
    lire: async () => assert.fail("rien ne se lit"),
    ecrire: async (method, path, body) => (requests.push(`${method} ${path}${body === undefined ? "" : ` ${JSON.stringify(body)}`}`), reply(method, path)),
  };
  return { client, demandes: requests };
}
const REFUSES = { status: 403, data: { message: "Resource not accessible by integration. See the docs." } };

describe("déparquer : retirer le label `parked` de l'issue du ticket", () => {
  test("« back to the kitchen » sur un ticket de TODO : `parked` retiré", async () => {
    const { client, demandes: requests } = github();
    assert.deepEqual(await unpark(REPOSITORY, 31, client), {
      fait: "back to the kitchen on GitHub: #31 no longer carries `parked` and `parked:chef` — it resumes exactly where it was",
      detail: "https://github.com/chef/parade/issues/31",
    });
    assert.deepEqual(requests, ["parked", "parked:chef", ...LABELS_BEFORE_PARKED].map((label) => `DELETE /repos/chef/parade/issues/31/labels/${encodeURIComponent(label)}`));
  });

  // #4260 : un ticket qu'un label d'attente d'avant parked parque (`blocked-on-human`) est parqué pour la
  // cuisine (runtime/src/kitchen/decide.ts) : « back to the kitchen » le lui retire aussi, ou il ne reprendrait jamais.
  test("« back to the kitchen » sur un ticket parqué par un label d'avant parked : ce label retiré aussi — il reprend ; refusé, la phrase dit que `parked` est retiré, pas lui", async () => {
    const [old] = LABELS_BEFORE_PARKED.filter((label) => label !== "waiting");
    const door = new Set(["parked", old as string]);
    const { client, demandes: requests } = github((method, path) => {
      const label = decodeURIComponent(path.split("/labels/")[1] ?? "");
      return method === "DELETE" && door.delete(label) ? { status: 200, data: [] } : { status: 404, data: { message: "Label does not exist" } };
    });
    assert.ok("fait" in (await unpark(REPOSITORY, 31, client)));
    assert.deepEqual([...door], []);
    assert.ok(requests.includes(`DELETE /repos/chef/parade/issues/31/labels/${encodeURIComponent(old as string)}`), requests.join("\n"));
    const refuses = github((_, path) => (path.endsWith(`/labels/${encodeURIComponent(old as string)}`) ? REFUSES : { status: 200, data: [] }));
    const said = await unpark(REPOSITORY, 31, refuses.client);
    assert.ok("refus" in said, JSON.stringify(said));
    assert.equal(said.refus, `\`parked\` is removed, but GitHub did not remove \`${old}\` from #31`);
  });

  test("une issue qui ne porte déjà plus le label (404) : c'est fait", async () => {
    const { client } = github(() => ({ status: 404, data: { message: "Label does not exist" } }));
    assert.ok("fait" in (await unpark(REPOSITORY, 31, client)));
  });

  test("GitHub qui refuse, ou qui ne répond pas : rien n'est changé, la phrase le dit, et ce que GitHub a dit est au survol", async () => {
    assert.deepEqual(await unpark(REPOSITORY, 31, github(() => REFUSES).client), {
      refus: "nothing was changed: GitHub did not remove `parked` from #31",
      detail: "GitHub refused the removal of `parked` (HTTP 403): Resource not accessible by integration",
    });
    const connection = await unpark(REPOSITORY, 31, github(() => ({ status: 401, data: {} })).client);
    assert.ok("refus" in connection && connection.detail.includes("sign in to GitHub again"), JSON.stringify(connection));
    const silent = await unpark(REPOSITORY, 31, github(() => assert.fail(new Error("GitHub gave no answer within 30 s"))).client);
    assert.deepEqual(silent, { refus: "nothing was changed: GitHub did not remove `parked` from #31", detail: "GitHub gave no answer within 30 s" });
  });

  test("les gestes sans fait sur GitHub ont leur phrase, qui dit que rien n'est parti", () => {
    for (const sentence of Object.values(WITHOUT_DONE)) assert.match(sentence, /^nothing was (done|posted|changed|sent): /);
  });
});
