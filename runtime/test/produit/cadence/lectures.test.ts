// What the cadence reads on GitHub (#1955): the issues filed today, and the
// outside issues overdue for an answer.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Commentaire, IssueOuverte } from "../../../src/github.ts";
import { deposesLe, lecteurDesOuvertes } from "../../../src/produit/cadence/lectures.ts";

const issue = (number: number, autres: Partial<IssueOuverte> = {}): IssueOuverte => ({
  number,
  title: `Issue ${number}`,
  labels: [],
  state: "open",
  createdAt: "2026-10-30T09:00:00Z",
  updatedAt: "2026-10-30T09:00:00Z",
  url: `https://exemple.test/${number}`,
  body: "",
  association: "NONE",
  ...autres,
});

test("le compte du jour : les issues `filed-by:product` créées ce jour UTC, ni la veille ni sans le label", async () => {
  const demandes: string[] = [];
  const compte = await deposesLe(
    {
      issuesDepuis: async (instant) => {
        demandes.push(instant);
        return [
          issue(1, { labels: ["filed-by:product", "prio:1"], createdAt: "2026-11-01T00:10:00Z" }),
          issue(2, { labels: ["filed-by:product"], createdAt: "2026-11-01T23:59:00Z" }),
          // Modifiée aujourd'hui, créée la veille.
          issue(3, { labels: ["filed-by:product"], createdAt: "2026-10-31T23:00:00Z", updatedAt: "2026-11-01T08:00:00Z" }),
          issue(4, { labels: ["prio:1"], createdAt: "2026-11-01T08:00:00Z" }),
        ];
      },
    },
    "2026-11-01",
  );
  assert.equal(compte, 2);
  assert.deepEqual(demandes, ["2026-11-01T00:00:00Z"]);
});

test("une issue du dehors est en retard après un jour sans réponse : ni celle du chef, ni une récente, ni une labellisée, ni une à qui un membre ou un rôle a répondu", async () => {
  const commentaires = new Map<number, Commentaire[]>([
    [12, [{ body: "Thanks", author: "chef", association: "OWNER", createdAt: "2026-10-30T10:00:00Z" }]],
    [13, [{ body: "Duplicate of #3", author: "brigade-manager[bot]", association: "NONE", createdAt: "2026-10-30T10:00:00Z" }]],
    [14, [{ body: "+1", author: "someone", association: "NONE", createdAt: "2026-10-30T10:00:00Z" }]],
  ]);
  const lus: number[] = [];
  let sondages = 0;
  const lecteur = lecteurDesOuvertes({
    ouvertes: async () => {
      sondages += 1;
      if (sondages > 1) return { inchange: true };
      return {
        inchange: false,
        confirmer: () => {},
        issues: [
          issue(10, { association: "OWNER" }),
          issue(11, { createdAt: "2026-11-01T08:00:00Z", updatedAt: "2026-11-01T08:00:00Z" }),
          issue(12),
          issue(13),
          issue(14),
          issue(15),
          issue(16, { labels: ["question"] }),
        ],
      };
    },
    commentaires: async (numero) => {
      lus.push(numero);
      return commentaires.get(numero) ?? [];
    },
  });
  const maintenant = new Date("2026-11-01T10:00:00Z");
  assert.deepEqual(await lecteur.enRetard(maintenant), [14, 15]);
  // Inchangée, la liste se relit de la dernière réponse ; les commentaires ne se relisent pas.
  assert.deepEqual(await lecteur.enRetard(maintenant), [14, 15]);
  assert.deepEqual(lus, [12, 13, 14, 15]);
  assert.deepEqual((await lecteur.ouvertes()).map(({ number }) => number), [10, 11, 12, 13, 14, 15, 16]);
});
