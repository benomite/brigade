import assert from "node:assert/strict";
import { test } from "node:test";
import { brancheDuTicket } from "../../src/brigade-github.ts";
import { corpsDeVerdict, type CommentaireDeVerdict } from "../../src/github-etat/fusion.ts";
import { poserInPassSurLesPrsPretes, type GitHubDeLaPrPrete } from "../../src/guerison/pr-prete.ts";
import type { Check } from "../../src/events/pass.ts";

type Cas = { labels?: string[]; verdict?: "approve" | "request-changes" | null; checks?: Check["outcome"][]; enRetard?: boolean; enConflit?: boolean; etat?: "open" | "closed" };

// Un faux GitHub à un ticket par cas ; `etiquetages` note chaque écriture.
function fauxGitHub(cas: Record<number, Cas>) {
  const etiquetages: number[] = [];
  const github: GitHubDeLaPrPrete = {
    tickets: async () => ({
      inchange: false,
      issues: Object.entries(cas).map(([n, c]) => ({ number: Number(n), title: "", labels: ["fire", ...(c.labels ?? [])], state: "open" as const, createdAt: "", updatedAt: "", url: "" })),
      confirmer: () => {},
    }),
    prDeBranche: async (branche) => {
      const numero = Number(Object.keys(cas).find((n) => brancheDuTicket(Number(n)) === branche));
      const c = cas[numero];
      if (c === undefined) return null;
      return { number: 1000 + numero, url: "", base: "main", sha: `sha${numero}`, state: c.etat ?? "open", merged: false, enRetard: c.enRetard ?? false, mergeePar: null, ...(c.enConflit ? { enConflit: true } : {}) };
    },
    commentaires: async (pr): Promise<CommentaireDeVerdict[]> => {
      const verdict = cas[pr - 1000]?.verdict === undefined ? "approve" : cas[pr - 1000]?.verdict;
      return verdict === null || verdict === undefined ? [] : [{ id: 1, body: corpsDeVerdict("box", "abc123", { verdict, motif: "" }), association: "OWNER", createdAt: "2026-11-07T10:00:00Z" }];
    },
    ci: async (sha) => (cas[Number(sha.slice(3))]?.checks ?? ["green"]).map((outcome, i) => ({ name: `check${i}`, outcome, conclusion: "", url: null })),
    labelliser: async (numero, labels) => {
      assert.deepEqual(labels, ["in-pass"]);
      etiquetages.push(numero);
    },
  };
  return { github, etiquetages };
}

test("an approved, green, mergeable PR gets in-pass on its ticket", async () => {
  const { github, etiquetages } = fauxGitHub({ 1: {} });
  assert.deepEqual(await poserInPassSurLesPrsPretes(github), [1]);
  assert.deepEqual(etiquetages, [1]);
});

test("a PR not approved, red, pending, behind, in conflict or closed gets nothing", async () => {
  const { github, etiquetages } = fauxGitHub({
    1: { verdict: null },
    2: { verdict: "request-changes" },
    3: { checks: ["green", "red"] },
    4: { checks: ["pending"] },
    5: { enRetard: true },
    6: { enConflit: true },
    7: { etat: "closed" },
    8: { checks: [] },
  });
  assert.deepEqual(await poserInPassSurLesPrsPretes(github), []);
  assert.deepEqual(etiquetages, []);
});

test("a ticket that already has in-pass is not modified again", async () => {
  const { github, etiquetages } = fauxGitHub({ 1: { labels: ["in-pass"] }, 2: {} });
  assert.deepEqual(await poserInPassSurLesPrsPretes(github), [2]);
  assert.deepEqual(etiquetages, [2]);
  assert.deepEqual(await poserInPassSurLesPrsPretes(fauxGitHub({ 1: { labels: ["in-pass"] } }).github), []);
});

test("an unchanged poll does nothing", async () => {
  const { github, etiquetages } = fauxGitHub({ 1: {} });
  assert.deepEqual(await poserInPassSurLesPrsPretes({ ...github, tickets: async () => ({ inchange: true }) }), []);
  assert.deepEqual(etiquetages, []);
});
