// L'issue d'une carte depuis la fiche : la lire, corps et discussion, et y
// poster un commentaire — les cas acceptés, les refus, et que rien ne part sans
// l'appel d'écriture.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Commentaire, GitHub, Issue } from "../src/github.ts";
import { ouvrirGitHub } from "../src/github.ts";
import { commenterIssue, demanderAuSecond, lireIssue } from "../src/issue-ticket.ts";
import { principal as pass } from "../src/montrer-pass.ts";
import { appeler, DEPOT, fauxGh, issueGitHub } from "./outils.ts";

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

// Le point d'entrée de l'app : `pass -- <ticket> issue | comment <texte>`, par le
// `gh` du compte du service, sans journal.
test("`pass -- <ticket> issue` rend l'issue en JSON sur une ligne, et `comment <texte>` y poste le texte — la seule écriture", async (t) => {
  const gh = fauxGh(t);
  const env = { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin };
  const chemin = `repos/${DEPOT}/issues/7`;
  gh.repondre(chemin, { corps: { ...issueGitHub(7), body: "Le corps", user: { login: "chef" } } });
  gh.repondre(`${chemin}/comments?per_page=100`, {
    corps: [{ body: "Premier", user: { login: "brigade-manager[bot]" }, author_association: "NONE", created_at: "2026-10-02T08:00:00Z" }],
  });
  gh.repondre(`${chemin}/comments`, { statut: 201, corps: { id: 1 } });

  const lue = appeler(pass, ["7", "issue"], env);
  assert.equal(await lue.fin, 0);
  assert.equal(lue.sortie().trimEnd().split("\n").length, 1);
  assert.deepEqual(JSON.parse(lue.sortie()), {
    found: true,
    issue: {
      ticket: 7,
      title: "Ticket 7",
      url: `https://github.com/${DEPOT}/issues/7`,
      state: "open",
      body: { author: "chef", at: "2026-10-01T00:00:07Z", body: "Le corps" },
      comments: [{ author: "brigade-manager[bot]", at: "2026-10-02T08:00:00Z", body: "Premier" }],
    },
  });
  assert.deepEqual(gh.appels().filter((appel) => appel.includes("POST")), []);

  const postee = appeler(pass, ["7", "comment", "  Le fournisseur répond lundi.\n"], env);
  assert.equal(await postee.fin, 0);
  const resultat = JSON.parse(postee.sortie());
  assert.equal(resultat.done, true);
  assert.match(resultat.price, /comment is posted on issue #7, under the box's own gh account/);
  assert.deepEqual(gh.appels().filter((appel) => appel.includes("POST")), [["api", "-i", "-X", "POST", "-f", "body=Le fournisseur répond lundi.", `${chemin}/comments`]]);
});

test("`pass -- <ticket> comment` refuse un texte vide et une carte sans issue en sortant en 1, sa raison en JSON, et ne poste rien", async (t) => {
  const gh = fauxGh(t);
  const env = { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin };
  gh.repondre(`repos/${DEPOT}/issues/7`, { corps: { ...issueGitHub(7), body: "Le corps", user: { login: "chef" } } });
  gh.repondre(`repos/${DEPOT}/issues/9`, { statut: 404, corps: { message: "Not Found" } });

  const vide = appeler(pass, ["7", "comment", "  \n "], env);
  assert.equal(await vide.fin, 1);
  assert.deepEqual(JSON.parse(vide.sortie()), { done: false, reason: "the comment is empty: write something to post", price: "none: nothing was posted" });

  const sansIssue = appeler(pass, ["9", "comment", "Du contexte"], env);
  assert.equal(await sansIssue.fin, 1);
  assert.equal(JSON.parse(sansIssue.sortie()).reason, "#9 has no GitHub issue: it does not exist, or is gone");

  const lue = appeler(pass, ["9", "issue"], env);
  assert.equal(await lue.fin, 1);
  assert.deepEqual(JSON.parse(lue.sortie()), { found: false, reason: "#9 has no GitHub issue: it does not exist, or is gone" });

  assert.deepEqual(gh.appels().filter((appel) => appel.includes("POST")), []);
});

test("`pass -- <ticket> issue` : une panne de GitHub sort en 1 en le disant, une commande mal formée ou sans dépôt en 2, sans rien demander à GitHub", async (t) => {
  const gh = fauxGh(t);
  const env = { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin };
  gh.repondre(`repos/${DEPOT}/issues/7`, { statut: 502, corps: { message: "Bad Gateway" } });

  const panne = appeler(pass, ["7", "issue"], env);
  assert.equal(await panne.fin, 1);
  assert.match(panne.sortie(), /^brigade : l'issue de #7 n'a pas été lue : .*HTTP 502/);

  const avant = gh.appels().length;
  for (const args of [["7", "comment"], ["7", "issue", "en trop"], ["7", "comment", "a", "b"], ["0", "issue"], ["x", "comment", "Du contexte"]]) {
    const mal = appeler(pass, args, env);
    assert.equal(await mal.fin, 2, args.join(" "));
    assert.match(mal.sortie(), /usage/);
  }
  const sansDepot = appeler(pass, ["7", "issue"], { BRIGADE_GH_BIN: gh.bin });
  assert.equal(await sansDepot.fin, 2);
  assert.match(sansDepot.sortie(), /BRIGADE_GITHUB_REPO n'est pas défini/);
  assert.equal(gh.appels().length, avant);
});

// La demande au second : composée d'après l'issue lue, jamais écrite nulle part par le runtime.
test("la demande au second nomme l'issue — numéro et titre — et le contexte saisi, sur une seule ligne, sans rien poster", async () => {
  const { github, postes } = depot(issue(7, { title: "Livrer la facture" }));
  const r = await demanderAuSecond(github, 7, "  Le fournisseur répond lundi.\nIl veut un devis.\n");
  assert.ok(r.done);
  assert.match(r.request, /#7/);
  assert.match(r.request, /Livrer la facture/);
  assert.match(r.request, /Le fournisseur répond lundi\. Il veut un devis\./);
  assert.doesNotMatch(r.request, /[\n\r]/);
  assert.deepEqual(postes, []);
});

test("sans contexte, la demande reste possible et nomme l'issue seule", async () => {
  const { github } = depot(issue(7));
  for (const vide of ["", "   \n", undefined, null]) {
    const r = await demanderAuSecond(github, 7, vide);
    assert.ok(r.done);
    assert.match(r.request, /#7 \(« Ticket 7 »\)/);
    assert.match(r.request, /pas de contexte/);
  }
});

test("la demande est refusée, et le dit, pour une carte sans issue ; un GitHub en panne lève", async () => {
  const { github } = depot(issue(30, { pr: true }));
  const r = await demanderAuSecond(github, 30, "x");
  assert.deepEqual(r.done, false);
  assert.equal(r.done ? "" : r.reason, "#30 is a pull request, not an issue");
  assert.equal((await demanderAuSecond(github, 9, "x")).done, false);
  const panne = { issue: async () => { throw new Error("HTTP 502"); } } as unknown as GitHub;
  await assert.rejects(demanderAuSecond(panne, 7, "x"), /HTTP 502/);
});

test("`pass -- <ticket> ask [<texte>]` rend la demande en JSON et ne poste rien ; sans issue, elle sort en 1", async (t) => {
  const gh = fauxGh(t);
  const env = { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin };
  gh.repondre(`repos/${DEPOT}/issues/7`, { corps: { ...issueGitHub(7), body: "Le corps", user: { login: "chef" } } });
  const demande = appeler(pass, ["7", "ask", "Du contexte"], env);
  assert.equal(await demande.fin, 0);
  const rendu = JSON.parse(demande.sortie());
  assert.equal(rendu.done, true);
  assert.match(rendu.request, /#7/);
  assert.match(rendu.request, /Du contexte/);
  const seule = appeler(pass, ["7", "ask"], env);
  assert.equal(await seule.fin, 0);
  assert.equal(JSON.parse(seule.sortie()).done, true);
  assert.deepEqual(gh.appels().filter((appel) => appel.includes("POST")), []);
  assert.equal(await appeler(pass, ["7", "ask", "a", "b"], env).fin, 2);
});
