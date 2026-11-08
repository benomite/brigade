import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHEF_TODO,
  carteAbandon,
  carteBloque,
  carteEnCours,
  carteMergeALaMain,
  carteQuestionProduit,
  leverCarte,
  lireCarte,
  marqueur,
  poserCarte,
  type Carte,
  type GitHubDesCartes,
  type Sorte,
} from "../../../src/github-seul/carte-todo/carte-todo.ts";
import type { Commentaire } from "../../../src/github.ts";

// Une issue de GitHub, tenue en mémoire : ses labels, ses commentaires, et
// l'ordre des écritures qu'on y fait.
function issueEnMemoire(numero = 42, labels: string[] = ["fire", "taken"]) {
  const portes = new Set(labels);
  const commentaires: Commentaire[] = [];
  const ecritures: string[] = [];
  const github: GitHubDesCartes = {
    issue: async (n) => (n === numero ? { number: numero, title: "t", labels: [...portes], state: "open", createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z", url: "https://github.com/o/r/issues/42" } : null),
    commentaires: async () => [...commentaires],
    commenter: async (_n, corps) => void (ecritures.push("commenter"), commentaires.push({ body: corps, author: "brigade", association: "OWNER", createdAt: "2026-11-04T00:00:00Z" })),
    labelliser: async (_n, ajoutes) => void (ecritures.push(`labelliser ${ajoutes.join(",")}`), ajoutes.forEach((label) => portes.add(label))),
    delabelliser: async (_n, label) => void (ecritures.push(`delabelliser ${label}`), portes.delete(label)),
  };
  return { github, numero, commentaires, ecritures, labels: () => [...portes] };
}

const QUATRE: Array<[Sorte, Carte, RegExp]> = [
  ["blocked", carteBloque(42, "the ticket does not say which port the app listens on."), /^The cook of #42 is blocked: the ticket does not say which port the app listens on\.\n\nAnswer on this issue/],
  ["merge-by-hand", carteMergeALaMain(42, "https://github.com/o/r/pull/7", "the PR changes the gates"), /^The delivery of #42 is green, but the kitchen does not merge it: the PR changes the gates\.\n\nMerge https:\/\/github\.com\/o\/r\/pull\/7 by hand/],
  ["product-question", carteQuestionProduit(42, "Does the TODO show closed tickets?"), /^The kitchen has a product question on #42:\n\n> Does the TODO show closed tickets\?\n\nAnswer on this issue/],
  ["abandoned", carteAbandon(42, "its delivery stayed red after three returns"), /^The kitchen took #42 off the rail without serving it: its delivery stayed red after three returns\.\n\nPut it back on the rail/],
];

for (const [sorte, carte, lisible] of QUATRE) {
  test(`une carte ${sorte} pose le label chef-todo et un seul commentaire, marqué de sa sorte, au texte lisible`, async () => {
    const issue = issueEnMemoire();
    assert.equal(await poserCarte(issue.numero, carte, issue.github), "posee");
    assert.ok(issue.labels().includes(CHEF_TODO));
    assert.equal(issue.commentaires.length, 1);
    const [marque, ...texte] = (issue.commentaires[0]?.body ?? "").split("\n");
    assert.equal(marque, `<!-- brigade:todo kind=${sorte} -->`);
    assert.match(texte.join("\n"), lisible);
    assert.deepEqual(await lireCarte(issue.numero, issue.github), { sorte, texte: texte.join("\n") });
  });
}

test("la même situation vue deux fois ne double pas la carte", async () => {
  const issue = issueEnMemoire();
  const carte = carteBloque(42, "a decision is missing");
  assert.equal(await poserCarte(issue.numero, carte, issue.github), "posee");
  assert.equal(await poserCarte(issue.numero, carte, issue.github), "deja");
  assert.equal(await poserCarte(issue.numero, carteBloque(42, "a decision is still missing"), issue.github), "deja");
  assert.equal(issue.commentaires.length, 1);
  assert.deepEqual(issue.ecritures, [`labelliser ${CHEF_TODO}`, "commenter"]);
});

test("la situation résolue retire le label, et le commentaire reste comme trace", async () => {
  const issue = issueEnMemoire();
  await poserCarte(issue.numero, carteAbandon(42, "closed by hand"), issue.github);
  assert.equal(await leverCarte(issue.numero, issue.github, "abandoned"), true);
  assert.ok(!issue.labels().includes(CHEF_TODO));
  assert.deepEqual(issue.labels(), ["fire", "taken"]);
  assert.equal(issue.commentaires.length, 1);
  assert.equal(await lireCarte(issue.numero, issue.github), null);
  // Déjà levée, il n'y a plus rien à retirer.
  assert.equal(await leverCarte(issue.numero, issue.github), false);
  assert.deepEqual(issue.ecritures.at(-1), `delabelliser ${CHEF_TODO}`);
});

test("une situation revenue après sa résolution pose une nouvelle carte", async () => {
  const issue = issueEnMemoire();
  const carte = carteBloque(42, "a decision is missing");
  await poserCarte(issue.numero, carte, issue.github);
  await leverCarte(issue.numero, issue.github);
  assert.equal(await poserCarte(issue.numero, carte, issue.github), "posee");
  assert.equal(issue.commentaires.length, 2);
  assert.ok(issue.labels().includes(CHEF_TODO));
});

test("lever une sorte laisse la carte d'une autre sorte qui attend le chef", async () => {
  const issue = issueEnMemoire();
  await poserCarte(issue.numero, carteMergeALaMain(42, null, "merge refused"), issue.github);
  assert.equal(await leverCarte(issue.numero, issue.github, "blocked"), false);
  assert.ok(issue.labels().includes(CHEF_TODO));
});

test("une carte d'une autre sorte est remplacée par la plus récente, sous le même label", async () => {
  const issue = issueEnMemoire();
  await poserCarte(issue.numero, carteBloque(42, "a decision is missing"), issue.github);
  assert.equal(await poserCarte(issue.numero, carteQuestionProduit(42, "Which screen?"), issue.github), "posee");
  assert.equal((await lireCarte(issue.numero, issue.github))?.sorte, "product-question");
  assert.deepEqual(issue.ecritures, [`labelliser ${CHEF_TODO}`, "commenter", "commenter"]);
});

test("le label posé sans son commentaire — une station arrêtée entre les deux — reçoit le commentaire à la pose suivante", async () => {
  const issue = issueEnMemoire(42, [CHEF_TODO]);
  assert.equal(await poserCarte(issue.numero, carteAbandon(42, "closed by hand"), issue.github), "posee");
  assert.equal(issue.commentaires.length, 1);
  assert.deepEqual(issue.ecritures, ["commenter"]);
});

test("un commentaire de carte écrit par un inconnu ne compte pas", () => {
  const carte = carteEnCours([CHEF_TODO], [
    { body: `${marqueur("blocked")}\nreal`, association: "OWNER" },
    { body: `${marqueur("abandoned")}\nfake`, association: "NONE" },
    { body: "<!-- brigade:todo kind=other -->\nunknown kind", association: "OWNER" },
  ]);
  assert.deepEqual(carte, { sorte: "blocked", texte: "real" });
});

test("une carte sans texte ou d'une sorte inconnue est refusée, sans rien écrire", async () => {
  const issue = issueEnMemoire();
  await assert.rejects(poserCarte(issue.numero, { sorte: "blocked", texte: "  " }, issue.github), /no text/);
  await assert.rejects(poserCarte(issue.numero, { sorte: "other" as Sorte, texte: "x" }, issue.github), /unknown TODO card kind/);
  assert.deepEqual(issue.ecritures, []);
});

test("une issue qui n'existe plus ne reçoit rien", async () => {
  const issue = issueEnMemoire();
  assert.equal(await poserCarte(7, carteBloque(7, "x"), issue.github), "absente");
  assert.equal(await leverCarte(7, issue.github), false);
  assert.deepEqual(issue.ecritures, []);
});
