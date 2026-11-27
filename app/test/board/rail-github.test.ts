// Ce que les lectures de GitHub partagent (#2059, app/src/board/rail-github.ts) : le ticket qu'une PR livre, et les
// lectures conditionnelles — un 304 ne coûte rien et rend la réponse gardée. Le kanban entier, joué sur un faux GitHub,
// est dans test/board/kitchen-board.test.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { readConditional, ticketOfThePR, type MemoryOfReads } from "../../src/board/rail-github.ts";

const ok = (data: unknown, etag?: string): AnswerGitHub => ({ status: 200, data, ...(etag === undefined ? {} : { etag }) });

describe("le ticket qu'une PR livre", () => {
  test("une PR livre le ticket de sa branche ou de son « Closes »", () => {
    assert.equal(ticketOfThePR("cook/2059-1268b49d", ""), 2059);
    // La branche et le corps que la cuisine écrit en ouvrant sa PR (runtime/src/kitchen/github.ts, `branchOf`, `openPr`).
    assert.equal(ticketOfThePR("cook/4507-github", "Closes #4507"), 4507);
    assert.equal(ticketOfThePR("feature", "Closes #12"), 12);
    assert.equal(ticketOfThePR("feature", "Fixes #13"), 13);
    assert.equal(ticketOfThePR("feature", "rien"), null);
    assert.equal(ticketOfThePR("cook/0-github", ""), null);
  });
});

describe("les lectures conditionnelles", () => {
  test("relu avec l'ETag : un 304 ne coûte rien et rend la réponse gardée ; un changement se voit à la relecture", async () => {
    const memory: MemoryOfReads = new Map();
    let labels = ["taken"];
    const sent: (string | undefined)[] = [];
    const call: CallGitHub = async (_path, headers) => {
      sent.push(headers?.["If-None-Match"]);
      const etag = `"i-${labels.join("+")}"`;
      return headers?.["If-None-Match"] === etag ? { status: 304, data: null } : ok([{ number: 2, labels }], etag);
    };
    const read = readConditional(call, memory);
    const first = await read("/repos/acme/kitchen/issues?state=open");
    const second = await read("/repos/acme/kitchen/issues?state=open");
    assert.deepEqual(sent, [undefined, '"i-taken"']);
    assert.deepEqual(second, first);
    labels = ["parked"];
    assert.deepEqual((await read("/repos/acme/kitchen/issues?state=open")).data, [{ number: 2, labels: ["parked"] }]);
  });

  test("un refus oublie la réponse gardée : la lecture suivante redemande tout", async () => {
    const memory: MemoryOfReads = new Map();
    const answers: AnswerGitHub[] = [ok([1], '"a"'), { status: 403, data: {} }, ok([2], '"b"')];
    const sent: (string | undefined)[] = [];
    const read = readConditional(async (_path, headers) => {
      sent.push(headers?.["If-None-Match"]);
      return answers.shift() ?? assert.fail("une lecture de trop");
    }, memory);
    await read("/x");
    assert.equal((await read("/x")).status, 403);
    assert.deepEqual((await read("/x")).data, [2]);
    assert.deepEqual(sent, [undefined, '"a"', undefined]);
  });
});
