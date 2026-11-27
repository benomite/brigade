// Ce que la lecture du rail tire de GitHub (#2059, app/src/board/rail-github.ts) : les mots des états, le ticket
// qu'une PR livre, l'état de la base d'après ses checks, et les lectures conditionnelles — un 304 ne coûte rien et rend
// la réponse gardée. Le rail entier, joué sur un faux GitHub, est dans test/vue/rail/github.test.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TONES_OF_TICKET } from "../../src/facts.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/board/client.ts";
import { stateOfTheBaseGithub, readConditional, WORD_OF_THE_STATE, ticketOfThePR, type MemoryOfReads } from "../../src/board/rail-github.ts";

const ok = (data: unknown, etag?: string): AnswerGitHub => ({ status: 200, data, ...(etag === undefined ? {} : { etag }) });

describe("ce que GitHub dit d'un ticket du rail", () => {
  test("chaque état de GitHub a son mot du rail, que la vue sait colorer", () => {
    assert.deepEqual(WORD_OF_THE_STATE, { taken: "pris", pass: "en pass", parked: "WAITING", "base-red": "base rouge" });
    for (const word of Object.values(WORD_OF_THE_STATE)) assert.ok(TONES_OF_TICKET.has(word), word);
  });

  test("une PR livre le ticket de sa branche ou de son « Closes »", () => {
    assert.equal(ticketOfThePR("cook/2059-1268b49d", ""), 2059);
    assert.equal(ticketOfThePR("feature", "Closes #12"), 12);
    assert.equal(ticketOfThePR("feature", "rien"), null);
  });

  test("la base : rouge dès qu'un check l'est, en cours dès qu'un court, verte sinon — inconnue sans aucun check", () => {
    assert.equal(stateOfTheBaseGithub([{ conclusion: "success" }, { conclusion: "skipped" }]), "green");
    assert.equal(stateOfTheBaseGithub([{ conclusion: "success" }, { conclusion: "failure" }]), "red");
    assert.equal(stateOfTheBaseGithub([{ conclusion: "timed_out" }]), "red");
    assert.equal(stateOfTheBaseGithub([{ conclusion: "success" }, { conclusion: null }]), "pending");
    assert.equal(stateOfTheBaseGithub([]), null);
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
