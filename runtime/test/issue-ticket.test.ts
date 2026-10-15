// L'issue d'une carte depuis la fiche : la lire, corps et discussion, et y
// poster un commentaire — les cas acceptés, les refus, et que rien ne part sans
// l'appel d'écriture.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Commentaire, GitHub, Issue } from "../src/github.ts";
import { ouvrirGitHub } from "../src/github.ts";
import { commenterIssue, lireIssue } from "../src/issue-ticket.ts";
import { DEPOT, fauxGh, issueGitHub } from "./outils.ts";

const issue = (number: number, autres: Partial<Issue> = {}): Issue & { body: string; author: string } => ({
  number,
  title: `Ticket ${number}`,
  labels: ["fire"],
  state: "open",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-08T09:00:00Z",
  url: `https://github.com/${DEPOT}/issues/${number}`,
  body: `Le corps de #${number}`,
  author: "chef",
  ...autres,
});

// Un GitHub en mémoire : ses issues, leurs commentaires, et chaque appel qui écrit.
function depot(...issues: Array<Issue & { body: string; author: string }>) {
  const etat = new Map(issues.map((i) => [i.number, i]));
  const discussions = new Map<number, Commentaire[]>();
  const postes: Array<[number, string]> = [];
  let horloge = 0;
  const github = {
    issue: async (numero: number) => etat.get(numero) ?? null,
    commentaires: async (numero: number) => discussions.get(numero) ?? [],
    async commenter(numero: number, corps: string) {
      postes.push([numero, corps]);
      const createdAt = `2026-10-15T10:00:${String(++horloge).padStart(2, "0")}Z`;
      discussions.set(numero, [...(discussions.get(numero) ?? []), { body: corps, author: "brigade", association: "OWNER", createdAt }]);
    },
  } as unknown as GitHub;
  const discuter = (numero: number, ...commentaires: Commentaire[]) => void discussions.set(numero, commentaires);
  return { github, postes, discuter };
}

test("lire l'issue d'une carte rend son corps, puis ses commentaires du plus ancien au plus récent, chacun avec son auteur et sa date", async () => {
  const { github, discuter, postes } = depot(issue(7));
  discuter(
    7,
    { body: "<!-- brigade:fiche -->\n- attend : rien", author: "chef", association: "OWNER", createdAt: "2026-10-02T08:00:00Z" },
    { body: "Livré.", author: "brigade-cook[bot]", association: "NONE", createdAt: "2026-10-03T09:30:00Z" },
  );

  assert.deepEqual(await lireIssue(github, 7), {
    found: true,
    issue: {
      ticket: 7,
      title: "Ticket 7",
      url: `https://github.com/${DEPOT}/issues/7`,
      state: "open",
      body: { author: "chef", at: "2026-10-01T00:00:00Z", body: "Le corps de #7" },
      comments: [
        { author: "chef", at: "2026-10-02T08:00:00Z", body: "<!-- brigade:fiche -->\n- attend : rien" },
        { author: "brigade-cook[bot]", at: "2026-10-03T09:30:00Z", body: "Livré." },
      ],
    },
  });
  // Lire ne poste rien.
  assert.deepEqual(postes, []);
});

test("une issue fermée se lit aussi : une carte servie garde son issue", async () => {
  const { github } = depot(issue(7, { state: "closed" }));

  const lue = await lireIssue(github, 7);
  assert.equal(lue.found && lue.issue.state, "closed");
  assert.deepEqual(lue.found && lue.issue.comments, []);
});

test("commenter poste le texte sur l'issue, dit son prix, et le commentaire se relit à la suite de la discussion", async () => {
  const { github, postes, discuter } = depot(issue(7));
  discuter(7, { body: "Une question ?", author: "brigade-manager[bot]", association: "NONE", createdAt: "2026-10-02T08:00:00Z" });

  const r = await commenterIssue(github, 7, "  Le fournisseur répond **lundi**.\n");

  assert.equal(r.done, true);
  assert.match(r.price, /comment is posted on issue #7/);
  assert.match(r.price, /No model is called/);
  // Tel quel, sans les blancs qui l'entourent.
  assert.deepEqual(postes, [[7, "Le fournisseur répond **lundi**."]]);
  const lue = await lireIssue(github, 7);
  assert.deepEqual(lue.found && lue.issue.comments.map(({ author, body }) => [author, body]), [
    ["brigade-manager[bot]", "Une question ?"],
    ["brigade", "Le fournisseur répond **lundi**."],
  ]);
});

test("un texte vide, ou fait de blancs, est refusé en le disant, et rien n'est posté", async () => {
  const { github, postes } = depot(issue(7));

  for (const vide of ["", "   \n\t ", null, undefined, 42]) {
    const r = await commenterIssue(github, 7, vide);
    assert.equal(r.done, false, JSON.stringify(vide));
    assert.match(r.done ? "" : r.reason, /the comment is empty/);
    assert.equal(r.price, "none: nothing was posted");
  }
  assert.deepEqual(postes, []);
});

test("une carte sans issue — disparue de GitHub, une PR, un numéro qui n'en est pas un — est refusée en le disant, à la lecture comme à l'écriture, et rien n'est posté", async () => {
  const { github, postes } = depot(issue(30, { pr: true }));

  const absente = await lireIssue(github, 9);
  assert.deepEqual(absente, { found: false, reason: "#9 has no GitHub issue: it does not exist, or is gone" });
  assert.deepEqual(await lireIssue(github, 30), { found: false, reason: "#30 is a pull request, not an issue" });
  assert.equal((await lireIssue(github, 0)).found, false);
  assert.equal((await lireIssue(github, 1.5)).found, false);

  for (const ticket of [9, 30, 0, -3]) {
    const r = await commenterIssue(github, ticket, "Du contexte");
    assert.equal(r.done, false, String(ticket));
    assert.equal(r.price, "none: nothing was posted");
  }
  assert.deepEqual(await commenterIssue(github, 30, "Du contexte"), { done: false, reason: "#30 is a pull request, not an issue", price: "none: nothing was posted" });
  assert.deepEqual(postes, []);
});

test("un GitHub en panne lève : une issue illisible n'est pas une carte sans issue", async () => {
  const github = {
    issue: async () => {
      throw new Error("gh api repos/x/issues/7 : HTTP 502");
    },
    commenter: async () => assert.fail("rien ne doit être posté"),
  } as unknown as GitHub;

  await assert.rejects(lireIssue(github, 7), /HTTP 502/);
  await assert.rejects(commenterIssue(github, 7, "Du contexte"), /HTTP 502/);
});

// Le même chemin que le reste du runtime : `gh api`, contre un faux `gh`.
function sonde(t: TestContext) {
  const gh = fauxGh(t);
  return { gh, github: ouvrirGitHub({ depot: DEPOT, bin: gh.bin }) };
}

test("par `gh` : la lecture demande l'issue puis sa discussion, l'écriture poste un seul commentaire, et seulement elle", async (t) => {
  const { gh, github } = sonde(t);
  const chemin = `repos/${DEPOT}/issues/7`;
  gh.repondre(chemin, { corps: { ...issueGitHub(7), body: "Le corps", user: { login: "chef" } } });
  gh.repondre(`${chemin}/comments?per_page=100`, {
    corps: [{ body: "Premier", user: { login: "chef" }, author_association: "OWNER", created_at: "2026-10-02T08:00:00Z" }],
  });
  gh.repondre(`${chemin}/comments`, { statut: 201, corps: { id: 1 } });

  const lue = await lireIssue(github, 7);
  assert.deepEqual(lue.found && [lue.issue.body, lue.issue.comments], [
    { author: "chef", at: "2026-10-01T00:00:07Z", body: "Le corps" },
    [{ author: "chef", at: "2026-10-02T08:00:00Z", body: "Premier" }],
  ]);
  assert.deepEqual(gh.appels(), [["api", "-i", chemin], ["api", "-i", `${chemin}/comments?per_page=100`]]);

  assert.equal((await commenterIssue(github, 7, "Du contexte")).done, true);
  const ecritures = gh.appels().filter((appel) => appel.includes("POST"));
  assert.deepEqual(ecritures, [["api", "-i", "-X", "POST", "-f", "body=Du contexte", `${chemin}/comments`]]);
});
