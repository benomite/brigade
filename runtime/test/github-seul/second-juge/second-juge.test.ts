import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDApprobation, verifierLeSecondJuge, type CommentaireDePR, type GitHubDuSecondJuge } from "../../../src/github-seul/second-juge/second-juge.ts";

// Une PR qui change `fichiers`, avec les commentaires qu'on lui donne.
function pr(fichiers: string[], commentaires: CommentaireDePR[] = []) {
  const posts: string[] = [];
  const github: GitHubDuSecondJuge = {
    fichiers: async () => fichiers,
    commentaires: async () => [...commentaires],
    commenter: async (_, corps) => {
      posts.push(corps);
      commentaires.push({ body: corps, association: "OWNER", createdAt: "2026-11-04T00:00:00Z" });
    },
  };
  return { github, posts, commentaires };
}
const approbation = (verdict: "not-weakened" | "weakened" | "cannot-establish", association = "OWNER"): CommentaireDePR => ({ body: corpsDApprobation(verdict), association, createdAt: "2026-11-04T00:00:00Z" });

for (const fichier of [".github/workflows/ci.yml", ".claude/brigade/gates.sh"]) {
  test(`${fichier} : le merge est refusé tant que le second juge n'a pas approuvé, et la PR le dit`, async () => {
    const { github, posts } = pr(["README.md", fichier]);
    const decision = await verifierLeSecondJuge(7, github);
    assert.equal(decision.bloque, true);
    assert.equal(posts.length, 1);
    assert.match(posts[0] ?? "", /second judge is required/);
    assert.match(posts[0] ?? "", new RegExp(fichier.replace(/\./g, "\\.")));
  });

  test(`${fichier} : une fois le second juge d'accord, le merge passe sans nouveau commentaire`, async () => {
    const { github, posts } = pr([fichier], [approbation("not-weakened")]);
    assert.deepEqual(await verifierLeSecondJuge(7, github), { bloque: false });
    assert.equal(posts.length, 0);
  });
}

test("une PR qui ne touche à aucun juge n'est pas bloquée, et ne reçoit aucun commentaire", async () => {
  const { github, posts } = pr(["runtime/src/x.ts", "docs/github-workflows/a.md", "notes/.claude/brigade/x"]);
  assert.deepEqual(await verifierLeSecondJuge(7, github), { bloque: false });
  assert.equal(posts.length, 0);
});

test("un verdict `weakened`, ou `cannot establish`, ne débloque pas le merge", async () => {
  for (const verdict of ["weakened", "cannot-establish"] as const) {
    const { github } = pr([".github/workflows/ci.yml"], [approbation(verdict)]);
    assert.equal((await verifierLeSecondJuge(7, github)).bloque, true);
  }
});

test("une approbation qui ne vient pas du propriétaire ne compte pas", async () => {
  const { github } = pr([".github/workflows/ci.yml"], [approbation("not-weakened", "NONE")]);
  assert.equal((await verifierLeSecondJuge(7, github)).bloque, true);
});

test("le refus n'est pas répété tant qu'il est le dernier mot du fil", async () => {
  const { github, posts } = pr([".github/workflows/ci.yml"]);
  await verifierLeSecondJuge(7, github);
  await verifierLeSecondJuge(7, github);
  assert.equal(posts.length, 1);
});
