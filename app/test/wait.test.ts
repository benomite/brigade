// WAITING sur le rail (#591), devenu le parking (#4129) : deux colonnes, TODO — ce que le chef peut trancher maintenant —
// et WAITING — ce qui attend un tiers. Sur une carte de TODO, « waiting for… » ouvre un formulaire : ce qu'elle attend, de
// qui, la relance proposée à sept jours ; validé, il s'écrit sur l'issue, jamais par une commande de la box (#4262). Une
// carte de WAITING dit sans clic ce qu'elle attend, de qui, depuis quand, sa relance et ce qui se passera à l'arrivée, et
// porte « resume » et « it arrived, back to the kitchen ». Une carte revenue de WAITING le dit — pas pourquoi : le runtime
// ne le rend pas dans `faits`. La vue est jouée telle qu'elle est, devant un faux document (helpers/false-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { rail, type Facts } from "../src/facts.ts";
import type { ClientOfThePriority } from "../src/priority.ts";
import type { Terminal } from "../src/terminals.ts";
import { park } from "../src/vue/wait/wait-github.ts";
import { inputRead, type Input } from "../src/vue/wait/input.ts";
import { type Fake, type Played } from "./helpers/false-vue.ts";

// Le jour du poste, fixé : la relance se borne d'après lui.
const TODAY = new Date(2026, 9, 15, 14, 30);
const refusal = (input: unknown) => {
  const readEntry = inputRead(input, TODAY);
  assert.ok("refus" in readEntry, `rien n'est refusé : ${JSON.stringify(readEntry)}`);
  return readEntry.refus;
};

describe("les gestes de WAITING et ce que « waiting for… » demande", () => {

  test("rien n'est écrit sans ce que la commande demande : quoi, de qui, une relance à venir", () => {
    const full = { quoi: "sa réponse", qui: "le client", relance: "2026-10-22" };
    assert.deepEqual(inputRead({ ...full, quoi: "  sa validation écrite du devis  " }, TODAY), { ...full, quoi: "sa validation écrite du devis" });
    assert.match(refusal({ ...full, quoi: "   " }), /say what it waits for/);
    assert.match(refusal({ ...full, qui: "" }), /say whom it waits for/);
    assert.match(refusal({ quoi: "sa réponse" }), /say whom it waits for/);
    for (const relaunch of ["", "22/10/2026", "2026-02-30", "2026-10-22T09:00", "7j"]) assert.match(refusal({ ...full, relance: relaunch }), /is not a day of the calendar/, relaunch);
    for (const relaunch of ["2026-10-15", "2026-10-01"]) assert.match(refusal({ ...full, relance: relaunch }), /is not after today/, relaunch);
    assert.match(refusal({ ...full, quoi: "une ligne\npuis une autre" }), /control character/);
  });

  test("« waiting for… » parque le ticket : le commentaire de parking dit qui, pour quoi, jusqu'à quand, puis `parked` est posé", async () => {
    const readEntry = inputRead({ quoi: "sa validation écrite du devis", qui: "le client", relance: "2026-10-22" }, TODAY);
    const writtenOnes: [string, string, unknown][] = [];
    const client: ClientOfThePriority = {
      lire: () => assert.fail("rien ne se lit"),
      ecrire: (method, path, body) => (writtenOnes.push([method, path, body]), Promise.resolve(path.endsWith("/comments") ? { status: 201, data: { html_url: "https://github.com/o/r/issues/8#c1" } } : { status: 200, data: [] })),
    };
    const written = await park("o/r", 8, readEntry as Input, TODAY, client);
    assert.ok("fait" in written, JSON.stringify(written));
    const [[, path, workstation] = [], [, pathOfLabel, label] = []] = writtenOnes;
    assert.equal(path, "/repos/o/r/issues/8/comments");
    const body = (workstation as { body: string }).body;
    // La marque que la carte relit (vue/wait/wait-github.ts) : qui, quoi, jusqu'à quand.
    assert.match(body, /^<!-- brigade:parked \{"what":"sa validation écrite du devis","who":"le client","followUp":"2026-10-2[12]T\d\d:00:00\.000Z"\} -->\n\*\*PARKED: waits for le client\.\*\*/);
    assert.match(body, /- \*\*until\*\*: 2026-10-2[12] \d\d:00 UTC/);
    assert.deepEqual([pathOfLabel, label], ["/repos/o/r/issues/8/labels", { labels: ["parked"] }]);
  });
});

const THIRD = { quoi: "sa validation écrite du devis", qui: "le client", depuis: "2026-10-12T10:04:20.000Z", relance: "2026-10-21T00:00:00.000Z", aLArrivee: "il repart en cuisine, sans repasser par TODO : il est remis sur le rail, et un cook le prend à son tour" };
const ranks = (facts: Facts) => rail(facts).colonnes.map(({ nom: name, compte: account, cartes: cards }) => [name, account, cards.map(({ ticket: number }) => number)]);

describe("le rail en TODO et WAITING", () => {




});

const A = "2026-10-15T10:04:20.000Z";
const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "session neuve", arrete: false };

const STATUS = "projet     parade\n\nattend     2 décisions\n  #30  depuis 3 min  revenu de WAITING\n  #31  depuis 1 min  revenu de WAITING\nfin attend\n";
const column = (vue: Played, name: string): Fake => vue.element("rail").dessous("section").find((pose) => pose.children[0]?.children[0]?.textContent === name) ?? assert.fail(`pas de colonne ${name}`);
const slipOf = (vue: Played, number: number): Fake =>
  vue
    .element("rail")
    .dessous("li")
    .find((slip) => slip.className === "bon" && slip.children[0]?.children[0]?.textContent === `#${number}`) ?? assert.fail(`pas de bon #${number}`);

describe("sur l'écran, les cartes de WAITING et leurs gestes", () => {

});

const card = (vue: Played) => vue.element("fiche");
