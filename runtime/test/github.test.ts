// Le sondage de GitHub, contre un faux `gh` : aucun test ne touche le réseau.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirGitHub } from "../src/github.ts";
import { CHEMIN_TICKETS, DEPOT, fauxGh, issueGitHub } from "./outils.ts";

function sonde(t: TestContext) {
  const gh = fauxGh(t);
  return { gh, github: ouvrirGitHub({ depot: DEPOT, bin: gh.bin }) };
}

async function tickets(github: ReturnType<typeof ouvrirGitHub>) {
  const sondage = await github.tickets();
  assert.equal(sondage.inchange, false);
  return sondage as Extract<typeof sondage, { inchange: false }>;
}

test("le sondage rend les issues ouvertes qui portent le label, telles que le rail les lit", async (t) => {
  const { gh, github } = sonde(t);
  gh.issues([issueGitHub(14, { title: "Le rail", labels: ["fire", "prio:1", "feature"], updated_at: "2026-10-08T09:30:00Z" })]);

  assert.deepEqual((await tickets(github)).issues, [
    {
      number: 14,
      title: "Le rail",
      labels: ["fire", "prio:1", "feature"],
      state: "open",
      createdAt: "2026-10-01T00:00:14Z",
      updatedAt: "2026-10-08T09:30:00Z",
      url: "https://github.com/benomite/brigade/issues/14",
    },
  ]);
  assert.deepEqual(gh.appels(), [["api", "-i", CHEMIN_TICKETS]]);
});

test("une PR qui porte le label n'est pas un ticket", async (t) => {
  const { gh, github } = sonde(t);
  gh.issues([issueGitHub(14), issueGitHub(30, { pull_request: { url: "…" } })]);

  assert.deepEqual((await tickets(github)).issues.map((issue) => issue.number), [14]);
});

test("un sondage confirmé devient conditionnel : tant que rien ne change, GitHub répond « inchangé »", async (t) => {
  const { gh, github } = sonde(t);
  gh.issues([issueGitHub(14)], '"v1"');
  (await tickets(github)).confirmer();

  assert.deepEqual(await github.tickets(), { inchange: true });
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "-H", 'If-None-Match: "v1"', CHEMIN_TICKETS]);

  gh.issues([issueGitHub(14), issueGitHub(15)], '"v2"');
  assert.deepEqual((await tickets(github)).issues.map((issue) => issue.number), [14, 15]);
});

test("un sondage non confirmé se redemande en entier", async (t) => {
  const { gh, github } = sonde(t);
  gh.issues([issueGitHub(14)], '"v1"');
  (await tickets(github)).confirmer();
  gh.issues([issueGitHub(15)], '"v2"');
  await tickets(github);
  gh.issues([issueGitHub(14)], '"v1"');

  assert.deepEqual((await tickets(github)).issues.map((issue) => issue.number), [14]);
});

test("au-delà d'une page, toutes les pages sont lues et le sondage reste inconditionnel", async (t) => {
  const { gh, github } = sonde(t);
  const suite = `https://api.github.com/repositories/1/issues?labels=fire&page=2`;
  gh.repondre(suite, { corps: [issueGitHub(15)] });
  gh.repondre(CHEMIN_TICKETS, { etag: '"v1"', suivant: suite, corps: [issueGitHub(14)] });

  const sondage = await tickets(github);
  sondage.confirmer();

  assert.deepEqual(sondage.issues.map((issue) => issue.number), [14, 15]);
  assert.equal((await github.tickets()).inchange, false);
});

test("une issue se lit seule : fermée, sans label, ou disparue", async (t) => {
  const { gh, github } = sonde(t);
  gh.issues([]);
  gh.repondre(`repos/${DEPOT}/issues/7`, { corps: issueGitHub(7, { state: "closed" }) });
  gh.repondre(`repos/${DEPOT}/issues/8`, { corps: issueGitHub(8, { labels: ["feature"] }) });

  assert.equal((await github.issue(7))?.state, "closed");
  assert.deepEqual((await github.issue(8))?.labels, ["feature"]);
  assert.equal(await github.issue(9), null);
});

test("un `gh` en panne, ou une réponse d'erreur, fait échouer le sondage en disant pourquoi", async (t) => {
  const { gh, github } = sonde(t);

  await assert.rejects(github.tickets(), /gh api .*connexion impossible/);

  gh.repondre(CHEMIN_TICKETS, { statut: 401, corps: { message: "Bad credentials" } });
  await assert.rejects(github.tickets(), /HTTP 401/);
  await assert.rejects(ouvrirGitHub({ depot: DEPOT, bin: "/chemin/sans/gh" }).tickets(), /ENOENT/);
});

test("commenter une issue poste le texte tel quel", async (t) => {
  const { gh, github } = sonde(t);
  const chemin = `repos/${DEPOT}/issues/15/comments`;
  gh.repondre(chemin, { statut: 201, corps: { id: 1 } });

  await github.commenter(15, "**fini**\n@fichier, `code` et « guillemets »");

  assert.deepEqual(gh.appels(), [["api", "-i", "-X", "POST", "-f", "body=**fini**\n@fichier, `code` et « guillemets »", chemin]]);
});

test("un commentaire refusé par GitHub lève", async (t) => {
  const { gh, github } = sonde(t);
  gh.repondre(`repos/${DEPOT}/issues/15/comments`, { statut: 403, corps: { message: "Forbidden" } });

  await assert.rejects(github.commenter(15, "texte"), /HTTP 403/);
});

test("ouvrir une PR nomme la branche, sa base, et rend l'adresse de la PR", async (t) => {
  const { gh, github } = sonde(t);
  const chemin = `repos/${DEPOT}/pulls`;
  gh.repondre(chemin, { statut: 201, corps: { html_url: `https://github.com/${DEPOT}/pull/40` } });

  const url = await github.ouvrirPR({ branche: "cook/15-abc", base: "v2", titre: "#15 — Une station", corps: "le compte-rendu" });

  assert.equal(url, `https://github.com/${DEPOT}/pull/40`);
  assert.deepEqual(gh.appels(), [
    ["api", "-i", "-X", "POST", "-f", "title=#15 — Une station", "-f", "head=cook/15-abc", "-f", "base=v2", "-f", "body=le compte-rendu", chemin],
  ]);
});

test("une PR que GitHub refuse lève, avec son statut", async (t) => {
  const { gh, github } = sonde(t);
  gh.repondre(`repos/${DEPOT}/pulls`, { statut: 422, corps: { message: "Validation Failed" } });

  await assert.rejects(github.ouvrirPR({ branche: "cook/15-abc", base: "v2", titre: "t", corps: "c" }), /HTTP 422/);
});

const pr = (autres: object = {}) => ({
  number: 40,
  html_url: `https://github.com/${DEPOT}/pull/40`,
  state: "open",
  merged: false,
  mergeable: true,
  base: { ref: "v2" },
  head: { sha: "abc123" },
  ...autres,
});

test("la PR d'une branche se lit par sa tête : base, commit, état, mergeable", async (t) => {
  const { gh, github } = sonde(t);
  const liste = `repos/${DEPOT}/pulls?head=benomite:cook/15-abc&state=all&per_page=1`;
  gh.repondre(liste, { corps: [{ ...pr(), mergeable: undefined }] });
  gh.repondre(`repos/${DEPOT}/pulls/40`, { corps: pr() });

  assert.deepEqual(await github.prDeBranche("cook/15-abc"), {
    number: 40,
    url: `https://github.com/${DEPOT}/pull/40`,
    base: "v2",
    sha: "abc123",
    state: "open",
    merged: false,
    mergeable: true,
  });
  assert.deepEqual(gh.appels(), [["api", "-i", liste], ["api", "-i", `repos/${DEPOT}/pulls/40`]]);
});

test("une branche sans PR n'en rend aucune ; une PR mergée se dit mergée", async (t) => {
  const { gh, github } = sonde(t);
  gh.repondre(`repos/${DEPOT}/pulls?head=benomite:cook/sans&state=all&per_page=1`, { corps: [] });
  gh.repondre(`repos/${DEPOT}/pulls?head=benomite:cook/15-abc&state=all&per_page=1`, { corps: [pr()] });
  gh.repondre(`repos/${DEPOT}/pulls/40`, { corps: pr({ state: "closed", merged: true, mergeable: null }) });

  assert.equal(await github.prDeBranche("cook/sans"), null);
  const mergee = await github.prDeBranche("cook/15-abc");
  assert.deepEqual([mergee?.state, mergee?.merged, mergee?.mergeable], ["closed", true, null]);
});

test("la CI d'un commit : ses jobs et ses statuts, chacun vert, rouge ou en cours", async (t) => {
  const { gh, github } = sonde(t);
  gh.repondre(`repos/${DEPOT}/commits/abc123/check-runs?per_page=100`, {
    corps: {
      check_runs: [
        { name: "tests", status: "completed", conclusion: "success", html_url: "https://ci/1" },
        { name: "lint", status: "completed", conclusion: "failure", html_url: "https://ci/2" },
        { name: "docs", status: "completed", conclusion: "skipped", html_url: null },
        { name: "e2e", status: "in_progress", conclusion: null, html_url: "https://ci/4" },
      ],
    },
  });
  gh.repondre(`repos/${DEPOT}/commits/abc123/status?per_page=100`, {
    corps: { state: "pending", statuses: [{ context: "deploy", state: "pending", target_url: null }, { context: "audit", state: "error", target_url: "https://ci/6" }] },
  });

  assert.deepEqual(await github.ci("abc123"), [
    { name: "tests", outcome: "green", conclusion: "success", url: "https://ci/1" },
    { name: "lint", outcome: "red", conclusion: "failure", url: "https://ci/2" },
    { name: "docs", outcome: "green", conclusion: "skipped", url: null },
    { name: "e2e", outcome: "pending", conclusion: "in_progress", url: "https://ci/4" },
    { name: "deploy", outcome: "pending", conclusion: "pending", url: null },
    { name: "audit", outcome: "red", conclusion: "error", url: "https://ci/6" },
  ]);
});

test("un commit sans aucun check rend une CI vide, et une CI illisible lève", async (t) => {
  const { gh, github } = sonde(t);
  gh.repondre(`repos/${DEPOT}/commits/abc123/check-runs?per_page=100`, { corps: { total_count: 0, check_runs: [] } });
  gh.repondre(`repos/${DEPOT}/commits/abc123/status?per_page=100`, { corps: { state: "pending", statuses: [] } });

  assert.deepEqual(await github.ci("abc123"), []);
  await assert.rejects(github.ci("inconnu"), /HTTP 404/);
});

test("merger une PR exige le commit jugé", async (t) => {
  const { gh, github } = sonde(t);
  const chemin = `repos/${DEPOT}/pulls/40/merge`;
  gh.repondre(chemin, { corps: { merged: true, sha: "def456" } });

  assert.deepEqual(await github.merger(40, "abc123"), { fait: true });
  assert.deepEqual(gh.appels(), [["api", "-i", "-X", "PUT", "-f", "sha=abc123", "-f", "merge_method=merge", chemin]]);
});

test("un merge refusé par GitHub rend son motif ; une panne lève, car rien ne dit s'il a eu lieu", async (t) => {
  const { gh, github } = sonde(t);
  const chemin = `repos/${DEPOT}/pulls/40/merge`;
  gh.repondre(chemin, { statut: 409, corps: { message: "Head branch was modified" } });
  assert.deepEqual(await github.merger(40, "abc123"), { fait: false, motif: "HTTP 409 — Head branch was modified" });

  gh.repondre(chemin, { statut: 405, corps: { message: "Pull Request is not mergeable" } });
  assert.deepEqual(await github.merger(40, "abc123"), { fait: false, motif: "HTTP 405 — Pull Request is not mergeable" });

  gh.repondre(chemin, { statut: 403, corps: { message: "Resource not accessible" } });
  assert.deepEqual(await github.merger(40, "abc123"), { fait: false, motif: "HTTP 403 — Resource not accessible" });

  gh.repondre(chemin, { statut: 502, corps: {} });
  await assert.rejects(github.merger(40, "abc123"), /HTTP 502/);
});

test("fermer une issue la dit terminée", async (t) => {
  const { gh, github } = sonde(t);
  const chemin = `repos/${DEPOT}/issues/15`;
  gh.repondre(chemin, { corps: issueGitHub(15, { state: "closed" }) });

  await github.fermerIssue(15);

  assert.deepEqual(gh.appels(), [["api", "-i", "-X", "PATCH", "-f", "state=closed", "-f", "state_reason=completed", chemin]]);
});
