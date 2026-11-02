// Les états du rail lus sur GitHub seul (#2059) : chaque ticket du rail porte l'état que ses labels, sa PR et la base disent
// (`etatDuTicket`), quoi que la box ait écrit — joué sur un faux GitHub, puis rangé en colonnes par le rail de l'app.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { rail, type Faits } from "../../src/faits.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { avecLesEtatsGithub, lesEtatsSurGithub, ticketDeLaPR, type MemoireDesLectures } from "../../src/tableau/rail-github.ts";

const issue = (number: number, labels: string[], extra: object = {}) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/acme/kitchen/issues/${number}`, labels: labels.map((name) => ({ name })), ...extra });
const ok = (data: unknown, etag?: string): ReponseGitHub => ({ status: 200, data, ...(etag === undefined ? {} : { etag }) });

// Un faux GitHub : des issues dont une PR (que l'API des issues rend comme une issue), les PR ouvertes, les checks de la base.
function github(conclusions: (string | null)[]): AppelGitHub {
  return async (chemin) => {
    if (chemin.includes("/issues?")) return ok([issue(1, ["fire"]), issue(2, ["taken"]), issue(3, ["in-pass"]), issue(4, ["waiting", "taken"]), issue(5, ["in-pass"]), issue(6, []), issue(40, [], { pull_request: {} })]);
    if (chemin.includes("/pulls?")) return ok([{ number: 40, state: "open", head: { ref: "cook/3-abcd" }, body: "" }]);
    if (chemin.endsWith("/repos/acme/kitchen")) return ok({ default_branch: "main" });
    if (chemin.includes("/commits/main/check-runs")) return ok({ check_runs: conclusions.map((conclusion) => ({ conclusion })) });
    return { status: 404, data: {} };
  };
}

// Ce que la box a écrit : tout en pris, comme si elle ne savait rien — ou se trompait.
const MOTS_DE_LA_BOX = ["pris", "pris", "pris", "pris", "pris", "pris", "servi"];
const tableau = (): TableauLu => ({ lu: true, depot: "acme/kitchen", faits: { rail: [1, 2, 3, 4, 5, 6, 7].map((ticket) => ({ ticket, etat: MOTS_DE_LA_BOX[ticket - 1], titre: `Ticket ${ticket}`, url: `https://github.com/acme/kitchen/issues/${ticket}` })) } }) as unknown as TableauLu;
const colonnesDe = async (conclusions: string[]) => {
  const lu = await avecLesEtatsGithub(tableau(), github(conclusions));
  return Object.fromEntries(rail({ ...lu.faits, rail: lu.faits?.rail } as unknown as Faits).colonnes.map(({ nom, cartes }) => [nom, cartes.map(({ ticket, mot, etat, ton }) => `#${ticket} ${mot ?? etat} ${ton ?? ""}`.trim())]));
};

describe("l'état du rail est celui de GitHub", () => {
  test("base verte : taken, in pass et waiting dans leur colonne, d'après les labels et la PR seuls", async () => {
    const colonnes = await colonnesDe(["success", "skipped"]);
    assert.deepEqual(colonnes["Taken"], ["#2 taken bleu"]);
    assert.deepEqual(colonnes["Pass"], ["#3 in pass jaune"]);
    assert.deepEqual(colonnes["WAITING"], ["#4 waiting gris"]);
    // #1 sans état ni la box ni GitHub n'en dit un : en attente. #5 en pass sans PR et #6 sans label : GitHub n'en dit aucun
    // des quatre, la box ne l'emporte pas. #7, servi : GitHub n'a pas d'état pour lui, le mot de la box reste.
    assert.deepEqual(colonnes["On the rail"], ["#1 queued gris", "#5 queued gris", "#6 queued gris"]);
  });

  test("base rouge : le ticket en pass est « base red », en rouge, dans Pass — et lui seul", async () => {
    const colonnes = await colonnesDe(["success", "failure"]);
    assert.deepEqual(colonnes["Pass"], ["#3 base red rouge"]);
    assert.deepEqual(colonnes["Taken"], ["#2 taken bleu"]);
  });

  test("GitHub qui refuse ou ne répond pas : le tableau tel que la box l'a écrit", async () => {
    const lu = tableau();
    assert.equal(await avecLesEtatsGithub(lu, async () => ({ status: 403, data: {} })), lu);
    assert.equal(await avecLesEtatsGithub(lu, async () => Promise.reject(new Error("offline"))), lu);
    assert.equal(await lesEtatsSurGithub({ depot: "acme/kitchen", appeler: async () => ({ status: 404, data: {} }) }), null);
  });

  test("relu avec l'ETag : un 304 ne coûte rien et rend le rail gardé ; un changement de label se voit à la relecture", async () => {
    const memoire: MemoireDesLectures = new Map();
    let labels = ["taken"];
    const envoyes: (string | undefined)[] = [];
    const appeler: AppelGitHub = async (chemin, entetes) => {
      envoyes.push(entetes?.["If-None-Match"]);
      if (chemin.includes("/pulls?")) return ok([], '"p"');
      const etag = `"i-${labels.join("+")}"`;
      return entetes?.["If-None-Match"] === etag ? { status: 304, data: null } : ok([issue(2, labels)], etag);
    };
    const premiere = await lesEtatsSurGithub({ depot: "acme/kitchen", appeler, memoire });
    const seconde = await lesEtatsSurGithub({ depot: "acme/kitchen", appeler, memoire });
    assert.deepEqual(envoyes, [undefined, undefined, '"i-taken"', '"p"']);
    assert.deepEqual([...(seconde ?? [])], [...(premiere ?? [])]);
    labels = ["waiting"];
    assert.deepEqual([...((await lesEtatsSurGithub({ depot: "acme/kitchen", appeler, memoire })) ?? [])], [[2, "WAITING"]]);
  });

  test("une PR livre le ticket de sa branche ou de son « Closes »", () => {
    assert.equal(ticketDeLaPR("cook/2059-1268b49d", ""), 2059);
    assert.equal(ticketDeLaPR("feature", "Closes #12"), 12);
    assert.equal(ticketDeLaPR("feature", "rien"), null);
  });
});
