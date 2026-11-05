// Ce que la lecture du rail tire de GitHub (#2059, app/src/tableau/rail-github.ts) : les mots des états, le ticket
// qu'une PR livre, l'état de la base d'après ses checks, et les lectures conditionnelles — un 304 ne coûte rien et rend
// la réponse gardée. Le rail entier, joué sur un faux GitHub, est dans test/vue/rail/github.test.ts.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { TONS_DE_TICKET } from "../../src/faits.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { etatDeLaBaseGithub, lectureConditionnelle, MOT_DE_L_ETAT, ticketDeLaPR, type MemoireDesLectures } from "../../src/tableau/rail-github.ts";

const ok = (data: unknown, etag?: string): ReponseGitHub => ({ status: 200, data, ...(etag === undefined ? {} : { etag }) });

describe("ce que GitHub dit d'un ticket du rail", () => {
  test("chaque état de GitHub a son mot du rail, que la vue sait colorer", () => {
    assert.deepEqual(MOT_DE_L_ETAT, { taken: "pris", pass: "en pass", waiting: "WAITING", "base-red": "base rouge" });
    for (const mot of Object.values(MOT_DE_L_ETAT)) assert.ok(TONS_DE_TICKET.has(mot), mot);
  });

  test("une PR livre le ticket de sa branche ou de son « Closes »", () => {
    assert.equal(ticketDeLaPR("cook/2059-1268b49d", ""), 2059);
    assert.equal(ticketDeLaPR("feature", "Closes #12"), 12);
    assert.equal(ticketDeLaPR("feature", "rien"), null);
  });

  test("la base : rouge dès qu'un check l'est, en cours dès qu'un court, verte sinon — inconnue sans aucun check", () => {
    assert.equal(etatDeLaBaseGithub([{ conclusion: "success" }, { conclusion: "skipped" }]), "green");
    assert.equal(etatDeLaBaseGithub([{ conclusion: "success" }, { conclusion: "failure" }]), "red");
    assert.equal(etatDeLaBaseGithub([{ conclusion: "timed_out" }]), "red");
    assert.equal(etatDeLaBaseGithub([{ conclusion: "success" }, { conclusion: null }]), "pending");
    assert.equal(etatDeLaBaseGithub([]), null);
  });
});

describe("les lectures conditionnelles", () => {
  test("relu avec l'ETag : un 304 ne coûte rien et rend la réponse gardée ; un changement se voit à la relecture", async () => {
    const memoire: MemoireDesLectures = new Map();
    let labels = ["taken"];
    const envoyes: (string | undefined)[] = [];
    const appeler: AppelGitHub = async (_chemin, entetes) => {
      envoyes.push(entetes?.["If-None-Match"]);
      const etag = `"i-${labels.join("+")}"`;
      return entetes?.["If-None-Match"] === etag ? { status: 304, data: null } : ok([{ number: 2, labels }], etag);
    };
    const lire = lectureConditionnelle(appeler, memoire);
    const premiere = await lire("/repos/acme/kitchen/issues?state=open");
    const seconde = await lire("/repos/acme/kitchen/issues?state=open");
    assert.deepEqual(envoyes, [undefined, '"i-taken"']);
    assert.deepEqual(seconde, premiere);
    labels = ["waiting"];
    assert.deepEqual((await lire("/repos/acme/kitchen/issues?state=open")).data, [{ number: 2, labels: ["waiting"] }]);
  });

  test("un refus oublie la réponse gardée : la lecture suivante redemande tout", async () => {
    const memoire: MemoireDesLectures = new Map();
    const reponses: ReponseGitHub[] = [ok([1], '"a"'), { status: 403, data: {} }, ok([2], '"b"')];
    const envoyes: (string | undefined)[] = [];
    const lire = lectureConditionnelle(async (_chemin, entetes) => {
      envoyes.push(entetes?.["If-None-Match"]);
      return reponses.shift() ?? assert.fail("une lecture de trop");
    }, memoire);
    await lire("/x");
    assert.equal((await lire("/x")).status, 403);
    assert.deepEqual((await lire("/x")).data, [2]);
    assert.deepEqual(envoyes, [undefined, '"a"', undefined]);
  });
});
