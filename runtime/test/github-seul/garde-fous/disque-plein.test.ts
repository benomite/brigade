// La carte du disque plein (#4091) sur GitHub : une issue à elle, une seule
// carte tant qu'elle attend le chef, levée quand le disque respire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHEF_TODO } from "../../../src/github-seul/carte-todo/carte-todo.ts";
import { carteDuDisque, leverLaCarteDuDisque, lireDu, MARQUEUR_DISQUE, peutEncoreLiberer, poserLaCarteDuDisque, type GitHubDuDisque } from "../../../src/github-seul/garde-fous/disque-plein.ts";

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
  } as unknown as GitHubDuDisque;
  return { github, issues };
}

const carte = carteDuDisque({ libreMo: 2048, minMo: 5120, propre: 1024, consommateurs: [], station: "box/claude" });

test("the disk card is written once on its own issue, found again by its marker, and lifted when the disk recovers (#4091)", async () => {
  const { github, issues } = githubFaux();
  await poserLaCarteDuDisque(github, carte);
  await poserLaCarteDuDisque(github, carte);
  assert.equal(issues.size, 1);
  assert.equal(issues.get(7)?.body.startsWith(MARQUEUR_DISQUE), true);
  assert.equal(issues.get(7)?.comments.length, 1);
  assert.equal(issues.get(7)?.labels.has(CHEF_TODO), true);

  await leverLaCarteDuDisque(github);
  assert.equal(issues.get(7)?.labels.has(CHEF_TODO), false);
});

test("what the kitchen holds counts only if it could bring the disk back to the floor (#4091)", () => {
  const MO = 1024 * 1024;
  assert.equal(peutEncoreLiberer(2048 * MO, 3072 * MO, 5120), true);
  assert.equal(peutEncoreLiberer(2048 * MO, 3071 * MO, 5120), false);
});

test("du's lines read as sizes in bytes, and anything else is left out (#4091)", () => {
  assert.deepEqual(lireDu("48\t/var/lib/docker\nnot a line\n1\t/tmp\n"), [
    { chemin: "/var/lib/docker", octets: 48 * 1024 },
    { chemin: "/tmp", octets: 1024 },
  ]);
});
