// La carte du disque plein (#4091) sur GitHub : une issue à elle, une seule
// carte tant qu'elle attend le chef, levée quand le disque respire.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CHEF_TODO } from "../../../src/github-seul/carte-todo/carte-todo.ts";
import { carteDuDisque, disqueDuProjet, peutEncoreLiberer } from "../../../src/github-seul/garde-fous/disque-plein.ts";

function githubFaux() {
  const issues = new Map<number, { labels: Set<string>; body: string; comments: string[] }>();
  const github = {
    ouvertes: async () => ({ inchange: false, issues: [...issues].map(([number, i]) => ({ number, body: i.body, association: "OWNER" })) }),
    creerIssue: async ({ corps }: { corps: string }) => {
      issues.set(7, { labels: new Set(), body: corps, comments: [] });
      return 7;
    },
    issue: async (n: number) => (issues.has(n) ? { number: n, labels: [...(issues.get(n)?.labels ?? [])], body: "" } : null),
    commentaires: async (n: number) => (issues.get(n)?.comments ?? []).map((body) => ({ body, association: "OWNER" })),
    commenter: async (n: number, corps: string) => void issues.get(n)?.comments.push(corps),
    labelliser: async (n: number, labels: string[]) => labels.forEach((l) => issues.get(n)?.labels.add(l)),
    delabelliser: async (n: number, label: string) => void issues.get(n)?.labels.delete(label),
  } as unknown as Parameters<typeof disqueDuProjet>[1];
  return { github, issues };
}

const carte = carteDuDisque({ libreMo: 2048, minMo: 5120, propre: 1024, consommateurs: [], station: "box/claude" });

test("the disk card is written once on its own issue, found again by its marker, and lifted when the disk recovers (#4091)", async () => {
  const { github, issues } = githubFaux();
  const disque = disqueDuProjet("/nonexistent", github);
  await disque.poser(carte);
  await disque.poser(carte);
  assert.equal(issues.size, 1);
  assert.equal(issues.get(7)?.body.startsWith("<!-- brigade:disk-full -->"), true);
  assert.equal(issues.get(7)?.comments.length, 1);
  assert.equal(issues.get(7)?.labels.has(CHEF_TODO), true);

  await disque.lever();
  assert.equal(issues.get(7)?.labels.has(CHEF_TODO), false);
});

test("what the kitchen holds counts only if it could bring the disk back to the floor (#4091)", () => {
  const MO = 1024 * 1024;
  assert.equal(peutEncoreLiberer(2048 * MO, 3072 * MO, 5120), true);
  assert.equal(peutEncoreLiberer(2048 * MO, 3071 * MO, 5120), false);
});

test("the probe sizes the kitchen's own state with du (#4091)", async () => {
  const dossier = mkdtempSync(join(tmpdir(), "disque-"));
  mkdirSync(join(dossier, "a"));
  writeFileSync(join(dossier, "a", "gros"), Buffer.alloc(256 * 1024));
  const { github } = githubFaux();
  const { propre, consommateurs } = await disqueDuProjet(dossier, github, dossier).sonder();
  assert.equal(propre >= 256 * 1024, true);
  assert.equal(consommateurs[0]?.chemin, join(dossier, "a"));
});
