// Ce que la lecture du rail tire de GitHub (#2059, app/src/tableau/rail-github.ts) : les mots des états, le ticket
// qu'une PR livre, l'état de la base d'après ses checks, et les lectures conditionnelles — un 304 ne coûte rien et rend
// la réponse gardée. Le rail entier, joué sur un faux GitHub, est dans test/vue/rail/github.test.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TONS_DE_TICKET } from "../../src/facts.ts";
import type { CallGitHub, AnswerGitHub } from "../../src/tableau/client.ts";
import { stateDeLaBaseGithub, readConditionnelle, WORD_DE_L_STATE, ticketDeLaPR, type MemoireDesLectures } from "../../src/tableau/rail-github.ts";

const ok = (data: unknown, etag?: string): AnswerGitHub => ({ status: 200, data, ...(etag === undefined ? {} : { etag }) });

describe("ce que GitHub dit d'un ticket du rail", () => {
  test("chaque état de GitHub a son mot du rail, que la vue sait colorer", () => {
    assert.deepEqual(WORD_DE_L_STATE, { taken: "pris", pass: "en pass", parked: "WAITING", "base-red": "base rouge" });
    for (const word of Object.values(WORD_DE_L_STATE)) assert.ok(TONS_DE_TICKET.has(word), word);
  });

  test("une PR livre le ticket de sa branche ou de son « Closes »", () => {
    assert.equal(ticketDeLaPR("cook/2059-1268b49d", ""), 2059);
    assert.equal(ticketDeLaPR("feature", "Closes #12"), 12);
    assert.equal(ticketDeLaPR("feature", "rien"), null);
  });

  test("la base : rouge dès qu'un check l'est, en cours dès qu'un court, verte sinon — inconnue sans aucun check", () => {
    assert.equal(stateDeLaBaseGithub([{ conclusion: "success" }, { conclusion: "skipped" }]), "green");
    assert.equal(stateDeLaBaseGithub([{ conclusion: "success" }, { conclusion: "failure" }]), "red");
    assert.equal(stateDeLaBaseGithub([{ conclusion: "timed_out" }]), "red");
    assert.equal(stateDeLaBaseGithub([{ conclusion: "success" }, { conclusion: null }]), "pending");
    assert.equal(stateDeLaBaseGithub([]), null);
  });
});

describe("les lectures conditionnelles", () => {
  test("relu avec l'ETag : un 304 ne coûte rien et rend la réponse gardée ; un changement se voit à la relecture", async () => {
    const memoire: MemoireDesLectures = new Map();
    let labels = ["taken"];
    const envoyes: (string | undefined)[] = [];
    const appeler: CallGitHub = async (_chemin, entetes) => {
      envoyes.push(entetes?.["If-None-Match"]);
      const etag = `"i-${labels.join("+")}"`;
      return entetes?.["If-None-Match"] === etag ? { status: 304, data: null } : ok([{ number: 2, labels }], etag);
    };
    const lire = readConditionnelle(appeler, memoire);
    const first = await lire("/repos/acme/kitchen/issues?state=open");
    const seconde = await lire("/repos/acme/kitchen/issues?state=open");
    assert.deepEqual(envoyes, [undefined, '"i-taken"']);
    assert.deepEqual(seconde, first);
    labels = ["parked"];
    assert.deepEqual((await lire("/repos/acme/kitchen/issues?state=open")).data, [{ number: 2, labels: ["parked"] }]);
  });

  test("un refus oublie la réponse gardée : la lecture suivante redemande tout", async () => {
    const memoire: MemoireDesLectures = new Map();
    const answers: AnswerGitHub[] = [ok([1], '"a"'), { status: 403, data: {} }, ok([2], '"b"')];
    const envoyes: (string | undefined)[] = [];
    const lire = readConditionnelle(async (_chemin, entetes) => {
      envoyes.push(entetes?.["If-None-Match"]);
      return answers.shift() ?? assert.fail("une lecture de trop");
    }, memoire);
    await lire("/x");
    assert.equal((await lire("/x")).status, 403);
    assert.deepEqual((await lire("/x")).data, [2]);
    assert.deepEqual(envoyes, [undefined, '"a"', undefined]);
  });
});
