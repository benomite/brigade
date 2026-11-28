// #4260 (règle 13 de docs/superpowers/specs/2026-11-24-simplified-process.md) : un ticket parqué à chacune des trois
// étapes — au backlog, en cuisson (`taken`), à la pass (`in-pass`) — reprend exactement où il était quand la personne
// répond (« resume ») et quand son fait arrive (« it arrived, back to the kitchen ») : les deux gestes de l'app, que le
// second joue aussi (`deparquer`). Sa reprise à la date est celle du tour de la station
// (runtime/test/parked/parquer-a-chaque-etape.test.ts). L'étape est lue comme la station la lisait (`etatDuTicket`, copie locale).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { corpsDuParking } from "../../../runtime/src/attente-github/marque.ts";
import type { ClientOfThePriority } from "../../src/priority.ts";
import type { BoardRead } from "../../src/board/read.ts";
import { waitOnGithub, park } from "../../src/vue/wait/wait-github.ts";

// The old station's reading of a ticket (github-etat/etats.ts, deleted in #4775), kept as small local copies: a ticket is
// parked when it carries `parked` or one of the waiting labels from before it (#4260); else `in-pass` (with an open,
// unmerged PR) is "pass", `taken` is "taken".
const LABELS_BEFORE_PARKED = ["waiting", "set-aside:failures", "blocked-on-human", "decision", "question", "product-question"];
const estParque = (labels: readonly string[]) => labels.includes("parked") || LABELS_BEFORE_PARKED.some((label) => labels.includes(label));
function etatDuTicket(issue: { state: string; labels: readonly string[]; pr: { state: string; merged: boolean } | null }): "parked" | "pass" | "taken" | null {
  if (issue.state !== "open") return null;
  if (estParque(issue.labels)) return "parked";
  if (issue.labels.includes("in-pass")) return issue.pr !== null && issue.pr.state === "open" && !issue.pr.merged ? "pass" : null;
  if (issue.labels.includes("taken")) return "taken";
  return null;
}

const REPOSITORY = "acme/shop";
const TICKET = 40;
const TODAY = new Date(2026, 10, 25, 10);
const PR_OPEN = { state: "open" as const, merged: false };

const STEPS = [
  { etape: "backlog", labels: ["fire", "model:opus", "effort:medium"] },
  { etape: "being cooked", labels: ["fire", "model:opus", "effort:medium", "taken"] },
  { etape: "at the pass", labels: ["fire", "model:opus", "effort:medium", "in-pass"] },
];

// Un GitHub qui tient les labels et les commentaires de l'issue du ticket, lus et écrits par l'app.
function issueA(labels: string[]) {
  const heldOnes = [...labels];
  const comments: string[] = [];
  const client: ClientOfThePriority = {
    lire: () => assert.fail("rien ne se lit"),
    ecrire: async (method, path, body) => {
      if (method === "POST" && path === `/repos/${REPOSITORY}/issues/${TICKET}/comments`) {
        comments.push((body as { body: string }).body);
        return { status: 201, data: { html_url: `https://github.com/${REPOSITORY}/issues/${TICKET}#c${comments.length}` } };
      }
      if (method === "POST" && path === `/repos/${REPOSITORY}/issues/${TICKET}/labels`) {
        for (const label of (body as { labels: string[] }).labels) if (!heldOnes.includes(label)) heldOnes.push(label);
        return { status: 200, data: [] };
      }
      const removed = new RegExp(`^/repos/${REPOSITORY}/issues/${TICKET}/labels/(.+)$`).exec(path)?.[1];
      if (method === "DELETE" && removed !== undefined) {
        const rank = heldOnes.indexOf(decodeURIComponent(removed));
        if (rank < 0) return { status: 404, data: { message: "Label does not exist" } };
        heldOnes.splice(rank, 1);
        return { status: 200, data: [] };
      }
      return assert.fail(`${method} ${path}`);
    },
  };
  // La dernière lecture du rail : elle porte le ticket.
  const readOne = { depot: REPOSITORY, faits: { rail: [{ ticket: TICKET }], attend: [], attendAutres: [] } } as unknown as BoardRead;
  const state = () => etatDuTicket({ state: "open", labels: [...heldOnes], pr: PR_OPEN });
  const action = (id: string) => waitOnGithub({ id, ticket: TICKET, saisie: undefined, aujourdhui: TODAY, lu: readOne, client });
  return { tenus: heldOnes, commentaires: comments, client, etat: state, geste: action };
}

for (const { etape: step, labels } of STEPS) {
  describe(`a ticket parked ${step}`, () => {
    test("parked until a date by the app: when the person answers (« resume »), it resumes at the same step", async () => {
      const t = issueA(labels);
      const before = t.etat();
      const pose = await park(REPOSITORY, TICKET, { quoi: "the signed quote", qui: "the client", relance: "2026-12-02" }, TODAY, t.client);
      assert.ok("fait" in pose, JSON.stringify(pose));
      assert.equal(estParque(t.tenus), true);
      assert.equal(t.etat(), "parked");
      assert.ok("fait" in (await t.geste("attente-reprendre")));
      assert.deepEqual(t.tenus, labels);
      assert.equal(estParque(t.tenus), false);
      assert.equal(t.etat(), before);
    });

    test("parked until a fact by the station: when the fact happens (« it arrived »), it resumes at the same step", async () => {
      const t = issueA([...labels, "parked"]);
      t.commentaires.push(corpsDuParking({ what: "the API key", who: "the client", followUp: "2026-12-02T10:00:00.000Z", fact: "the client sends the key" }));
      assert.equal(t.etat(), "parked");
      assert.ok("fait" in (await t.geste("attente-arrivee")));
      assert.deepEqual(t.tenus, labels);
      assert.equal(estParque(t.tenus), false);
      assert.equal(etatDuTicket({ state: "open", labels: labels, pr: PR_OPEN }), t.etat());
    });
  });
}
