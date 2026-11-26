// #4260 (règle 13 de docs/superpowers/specs/2026-11-24-simplified-process.md) : un ticket parqué à chacune des trois
// étapes — au backlog, en cuisson (`taken`), à la pass (`in-pass`) — reprend exactement où il était quand la personne
// répond (« resume ») et quand son fait arrive (« it arrived, back to the kitchen ») : les deux gestes de l'app, que le
// second joue aussi (`deparquer`). Sa reprise à la date est celle du tour de la station
// (runtime/test/parked/parquer-a-chaque-etape.test.ts). L'étape est lue comme la station la lit (`etatDuTicket`).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { corpsDuParking } from "../../../runtime/src/attente-github/marque.ts";
import { estParque, etatDuTicket } from "../../../runtime/src/github-etat/etats.ts";
import type { ClientDeLaPriority } from "../../src/priority.ts";
import type { TableauLu } from "../../src/tableau/read.ts";
import { waitSurGithub, parquer } from "../../src/vue/wait/wait-github.ts";

const REPOSITORY = "acme/shop";
const TICKET = 40;
const AUJOURDHUI = new Date(2026, 10, 25, 10);
const PR_OUVERTE = { state: "open" as const, merged: false };

const STEPS = [
  { etape: "backlog", labels: ["fire", "model:opus", "effort:medium"] },
  { etape: "being cooked", labels: ["fire", "model:opus", "effort:medium", "taken"] },
  { etape: "at the pass", labels: ["fire", "model:opus", "effort:medium", "in-pass"] },
];

// Un GitHub qui tient les labels et les commentaires de l'issue du ticket, lus et écrits par l'app.
function issueA(labels: string[]) {
  const tenus = [...labels];
  const commentaires: string[] = [];
  const client: ClientDeLaPriority = {
    lire: () => assert.fail("rien ne se lit"),
    ecrire: async (methode, chemin, corps) => {
      if (methode === "POST" && chemin === `/repos/${REPOSITORY}/issues/${TICKET}/comments`) {
        commentaires.push((corps as { body: string }).body);
        return { status: 201, data: { html_url: `https://github.com/${REPOSITORY}/issues/${TICKET}#c${commentaires.length}` } };
      }
      if (methode === "POST" && chemin === `/repos/${REPOSITORY}/issues/${TICKET}/labels`) {
        for (const label of (corps as { labels: string[] }).labels) if (!tenus.includes(label)) tenus.push(label);
        return { status: 200, data: [] };
      }
      const retire = new RegExp(`^/repos/${REPOSITORY}/issues/${TICKET}/labels/(.+)$`).exec(chemin)?.[1];
      if (methode === "DELETE" && retire !== undefined) {
        const rang = tenus.indexOf(decodeURIComponent(retire));
        if (rang < 0) return { status: 404, data: { message: "Label does not exist" } };
        tenus.splice(rang, 1);
        return { status: 200, data: [] };
      }
      return assert.fail(`${methode} ${chemin}`);
    },
  };
  // La dernière lecture du rail : elle porte le ticket.
  const lu = { depot: REPOSITORY, faits: { rail: [{ ticket: TICKET }], attend: [], attendAutres: [] } } as unknown as TableauLu;
  const state = () => etatDuTicket({ state: "open", labels: [...tenus], pr: PR_OUVERTE });
  const action = (id: string) => waitSurGithub({ id, ticket: TICKET, saisie: undefined, aujourdhui: AUJOURDHUI, lu, client });
  return { tenus, commentaires, client, etat: state, geste: action };
}

for (const { etape: step, labels } of STEPS) {
  describe(`a ticket parked ${step}`, () => {
    test("parked until a date by the app: when the person answers (« resume »), it resumes at the same step", async () => {
      const t = issueA(labels);
      const avant = t.etat();
      const pose = await parquer(REPOSITORY, TICKET, { quoi: "the signed quote", qui: "the client", relance: "2026-12-02" }, AUJOURDHUI, t.client);
      assert.ok("fait" in pose, JSON.stringify(pose));
      assert.equal(estParque(t.tenus), true);
      assert.equal(t.etat(), "parked");
      assert.ok("fait" in (await t.geste("attente-reprendre")));
      assert.deepEqual(t.tenus, labels);
      assert.equal(estParque(t.tenus), false);
      assert.equal(t.etat(), avant);
    });

    test("parked until a fact by the station: when the fact happens (« it arrived »), it resumes at the same step", async () => {
      const t = issueA([...labels, "parked"]);
      t.commentaires.push(corpsDuParking({ what: "the API key", who: "the client", followUp: "2026-12-02T10:00:00.000Z", fact: "the client sends the key" }));
      assert.equal(t.etat(), "parked");
      assert.ok("fait" in (await t.geste("attente-arrivee")));
      assert.deepEqual(t.tenus, labels);
      assert.equal(estParque(t.tenus), false);
      assert.equal(etatDuTicket({ state: "open", labels: labels, pr: PR_OUVERTE }), t.etat());
    });
  });
}
