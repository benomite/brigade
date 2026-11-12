// Les PR externes (#2933) : une PR ouverte depuis un fork est relue et jugée
// sur les gates du projet sans ses secrets, son verdict et ses gates postés en
// un seul commentaire, puis une carte « merge #N? » va à l'humain `review` —
// et la cuisine ne la merge jamais.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { clientDuTour, priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import { ecrireSecret } from "../../src/droits.ts";
import { lireInstantane } from "../../src/github-etat/instantane.ts";
import { CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import type { GitHub } from "../../src/github.ts";
import { carteDeLaPRExterne, recommande, servirLaPRExterne, type ContexteDesPRExternes, type GatesExternes, type GitHubDesPRExternes, type PRExterne } from "../../src/pr-externe/pr-externe.ts";
import { DECLARATION } from "../../src/secrets.ts";
import { FauxGitHub, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const SECRET = "valeur-du-secret-du-projet";
const SHA = "a".repeat(40);
const LE_2_NOVEMBRE = Date.UTC(2026, 10, 2);
const fluxQuiConclut = (texte: string) => `${JSON.stringify({ type: "result", is_error: false, result: texte })}\n`;
const relecture = (verdict: "vert" | "rouge", resume: string) => JSON.stringify({ verdict, resume, constats: verdict === "rouge" ? [{ gravite: "bloquant", fichier: "src/app.ts", constat: "breaks the build" }] : [] });

// Le worktree d'un run, qui déclare le secret du projet et dont les gates
// écrivent leur environnement à côté, sous le nom du run.
function worktreeDe(racine: string, run: string, gates = "echo \"PASS  all\"") {
  const worktree = join(racine, run);
  mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
  writeFileSync(join(worktree, DECLARATION), "CLE_API\n");
  const script = join(worktree, ".claude/brigade/gates.sh");
  writeFileSync(script, `#!/bin/sh\nenv > "${join(racine, `env-${run}`)}"\n${gates}\n`);
  chmodSync(script, 0o755);
  return worktree;
}

test("the station serves a fork PR: review and gates without the project's secrets, one comment, a card for the review human, never a merge — while a same-repository PR's gates still get the secrets", async (t) => {
  const racine = repertoireTemporaire(t);
  const secrets = join(racine, "secrets.env");
  ecrireSecret(secrets, `CLE_API=${SECRET}\n`);
  const faux = new FauxGitHub();
  // Le ticket d'un cook, dont la PR vient du dépôt même.
  faux.feu(757, ["fire", "model:opus", "effort:high"]);
  // La PR du fork : une issue pour GitHub, sans `fire`. Sa branche porte le nom d'un ticket : ce n'en est pas un.
  faux.feu(77, [], "Fixes a typo in the README.");
  const interdits: string[] = [];
  const reviews: Array<{ cwd: string; env: NodeJS.ProcessEnv }> = [];
  const lancer: Lancer = ({ args, cwd, env, flux }) => {
    if (args.includes("--tools")) reviews.push({ cwd, env });
    writeFileSync(flux, fluxQuiConclut(args.includes("--tools") ? relecture("vert", "Looks right.") : "done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const bas = faux.pour("box");
  const fork = { number: 77, branche: "cook/757-github", fichiers: ["README.md"], sha: SHA, externe: true };
  const github = {
    ...fauxClient(faux),
    ci: async (sha: string) => (await bas.ci(sha)).map((check) => ({ ...check, conclusion: "", url: null })),
    statuts: bas.statuts,
    poserStatut: bas.poserStatut,
    prsOuvertes: async () => [...faux.prs.filter((p) => p.state === "open").map((p) => ({ number: p.number, branche: p.branche, fichiers: p.fichiers, sha: p.sha, externe: false })), fork],
    remplacerCommentaire: async (numero: number, ancien: string, nouveau: string) => {
      const lu = (faux.commentaires.get(numero) ?? []).find((c) => c.body === ancien);
      if (lu === undefined) return false;
      lu.body = nouveau;
      return true;
    },
    assigner: async (numero: number, logins: string[]) => void interdits.push(`assigner ${numero} ${logins.join(",")}`),
    // La PR d'un ticket se merge ; celle du fork, jamais.
    merger: async (numero: number, sha: string) => {
      if (numero === 77) interdits.push(`merger ${numero}`);
      return bas.merger(numero, sha);
    },
    mettreAJour: async (numero: number, sha: string) => {
      if (numero === 77) interdits.push(`mettreAJour ${numero}`);
      return bas.mettreAJour(numero, sha);
    },
  } as unknown as GitHub;
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "BOBL-tech/espace",
    github,
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: worktreeDe(racine, run), branche: `cook/${run}` }),
      reprendre: async (run) => worktreeDe(racine, run),
      recevoirPR: async (run, numero) => ({ worktree: worktreeDe(racine, run), reference: `refs/brigade/pr/${numero}` }),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["src/app.ts"],
      diff: () => "diff --git a/src/app.ts b/src/app.ts\n+x\n",
      tete: (reference) => (reference === "refs/brigade/pr/77" ? SHA : (faux.prs.findLast((p) => p.branche === reference)?.sha ?? "")),
      vue: () => "e5ba5e",
      fichiers: () => [".github/workflows/ci.yml", "src/app.ts"],
      lire: () => "name: CI\non:\n  workflow_dispatch:\njobs:\n  test:\n    runs-on: ubuntu-latest\n",
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: { PATH: process.env.PATH, GH_TOKEN: "jeton-github-de-la-station" },
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: racine,
    lancer,
    gates: { delaiMs: 2_000, secrets },
    projet: () => ({ humans: [{ login: "lea", roles: ["product"] }, { login: "@sam", roles: ["review"] }] }),
    maintenant: () => new Date(LE_2_NOVEMBRE + 10 * 60_000),
    avertir: (texte) => assert.fail(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  const pr = faux.prs.find((p) => p.issue === 757);
  assert.ok(pr);
  faux.sansCI.add(pr.number);
  for (let tour = 0; tour < 4 && faux.mergee(757) === undefined; tour += 1) {
    await station.tour();
    await station.calme();
  }
  assert.equal(faux.mergee(757)?.mergeePar, "box", "the same-repository PR is served as before");

  // Les gates du ticket reçoivent le secret ; celles du fork, ni lui, ni aucun jeton.
  assert.match(readFileSync(join(racine, "env-gates-757-github"), "utf8"), new RegExp(`^CLE_API=${SECRET}$`, "m"));
  const envDesGatesDuFork = readFileSync(join(racine, "env-gates-pr-77-github"), "utf8");
  assert.doesNotMatch(envDesGatesDuFork, /CLE_API|valeur-du-secret|jeton-github-de-la-station/);
  // La relecture du fork non plus.
  const revueDuFork = reviews.find(({ cwd }) => cwd === join(racine, "review-pr-77-github"));
  assert.ok(revueDuFork, "the fork's head is reviewed in its own worktree");
  assert.ok(Object.entries(revueDuFork.env).every(([nom, valeur]) => nom !== "CLE_API" && !String(valeur).includes(SECRET)));

  // Un seul commentaire de la cuisine porte le verdict et les gates.
  const verdicts = (faux.commentaires.get(77) ?? []).filter((c) => c.body.startsWith("<!-- brigade:pr-externe "));
  assert.equal(verdicts.length, 1);
  assert.match(verdicts[0]?.body ?? "", /verdict=approve gates=green -->[\s\S]*\*\*Review:\*\* Approved\.\n\nLooks right\.[\s\S]*\*\*Gates:\*\* green\./);
  // La carte : « merge #77? », oui recommandé, assignée à l'humain `review`.
  assert.ok(faux.ticket(77).labels.has(CHEF_TODO));
  const carte = (faux.commentaires.get(77) ?? []).filter((c) => c.body.startsWith("<!-- brigade:todo kind=merge-by-hand -->"));
  assert.equal(carte.length, 1);
  assert.match(carte[0]?.body ?? "", /^<!-- brigade:todo kind=merge-by-hand -->\nmerge #77\?\n- \[merge\] Merge #77\n\nRecommended answer: \*\*yes\*\*/);
  // Jamais de merge, ni de mise à jour de sa branche : seulement l'assignation.
  assert.deepEqual(interdits, ["assigner 77 sam"]);
  // Son verdict ne passe pas par le statut des gates d'une tête de ticket.
  assert.equal(faux.statutsDeCommit.get(SHA), undefined);
});

// Un GitHub en mémoire, réduit à ce que le service d'une PR externe demande.
function fauxDesPRExternes(labels: string[] = []) {
  const commentaires: Array<{ body: string; association: string; createdAt: string }> = [];
  const appels: string[] = [];
  let horloge = 0;
  const github: GitHubDesPRExternes = {
    commentaires: async () => commentaires.map((c) => ({ ...c })),
    commenter: async (_numero, body) => {
      horloge += 1;
      commentaires.push({ body, association: "OWNER", createdAt: new Date(LE_2_NOVEMBRE + horloge * 1000).toISOString() });
    },
    remplacerCommentaire: async (_numero, ancien, nouveau) => {
      const lu = commentaires.find((c) => c.body === ancien);
      if (lu !== undefined) lu.body = nouveau;
      return lu !== undefined;
    },
    issue: async () => ({ labels: [...labels] }),
    labelliser: async (_numero, poses) => void labels.push(...poses),
    delabelliser: async (_numero, label) => void labels.splice(labels.indexOf(label), 1),
    assigner: async (numero, logins) => void appels.push(`assigner ${numero} ${logins.join(",")}`),
  };
  return { github, commentaires, labels, appels };
}

const contexte = (github: GitHubDesPRExternes, jugement: "approve" | "request-changes", gates: GatesExternes, juges: string[] = []): ContexteDesPRExternes => ({
  github,
  station: "box",
  maintenant: () => new Date(LE_2_NOVEMBRE + 60_000),
  juger: async (pr) => (juges.push(`juger ${pr.sha.slice(0, 1)}`), { verdict: jugement, motif: jugement === "approve" ? "Fine." : "Breaks the build." }),
  gates: async (pr) => (juges.push(`gates ${pr.sha.slice(0, 1)}`), gates),
  humains: () => [{ login: "sam", roles: ["review"] }],
});

const carteDe = (commentaires: Array<{ body: string }>) => commentaires.filter((c) => c.body.startsWith("<!-- brigade:todo")).at(-1)?.body ?? "";

test("the recommended answer follows the verdict: yes on an approval with green gates, no on changes requested or red gates", async () => {
  const pr: PRExterne = { number: 12, sha: SHA };
  for (const [verdict, gates, attendu] of [
    ["approve", { vert: true, resume: "", detail: "" }, "yes"],
    ["approve", { nonJouees: "the PR's tree has no `.claude/brigade/gates.sh`" }, "yes"],
    ["request-changes", { vert: true, resume: "", detail: "" }, "no"],
    ["approve", { vert: false, resume: "FAIL  test/a.test.ts", detail: "They exited with code 1." }, "no"],
  ] as const) {
    const { github, commentaires, labels } = fauxDesPRExternes();
    const fait = await servirLaPRExterne(pr, contexte(github, verdict, gates));
    assert.equal(fait.issue, "servie");
    assert.match(carteDe(commentaires), new RegExp(`\\nmerge #12\\?\\n- \\[merge\\] Merge #12\\n\\nRecommended answer: \\*\\*${attendu}\\*\\*`));
    assert.ok(labels.includes(CHEF_TODO));
    // Un seul commentaire de verdict, qui dit aussi les gates.
    const corps = commentaires.filter((c) => c.body.startsWith("<!-- brigade:pr-externe "));
    assert.equal(corps.length, 1);
    assert.match(corps[0]?.body ?? "", "nonJouees" in gates ? /\*\*Gates:\*\* not run — the PR's tree has no/ : gates.vert ? /\*\*Gates:\*\* green\./ : /\*\*Gates:\*\* red — FAIL {2}test\/a\.test\.ts\.\n\nThey exited with code 1\./);
  }
  assert.equal(recommande({ verdict: "request-changes", gates: "red" }), "no");
  assert.equal(carteDeLaPRExterne(pr, { verdict: "approve", gates: "green" }).sorte, "merge-by-hand");
});

test("a head is served once: the next turn and another station write nothing; a new head is judged again and its card replaces the old one", async () => {
  const { github, commentaires, labels, appels } = fauxDesPRExternes();
  const juges: string[] = [];
  assert.equal((await servirLaPRExterne({ number: 12, sha: SHA }, contexte(github, "approve", { vert: true, resume: "", detail: "" }, juges))).issue, "servie");
  const ecrits = commentaires.length;
  assert.equal((await servirLaPRExterne({ number: 12, sha: SHA }, contexte(github, "approve", { vert: true, resume: "", detail: "" }, juges))).issue, "deja");
  assert.equal((await servirLaPRExterne({ number: 12, sha: SHA }, { ...contexte(github, "approve", { vert: true, resume: "", detail: "" }, juges), station: "other" })).issue, "deja");
  assert.equal(commentaires.length, ecrits);
  assert.deepEqual(juges, ["gates a", "juger a"]);
  // Le fork pousse : la nouvelle tête est rejugée, et la carte dit son verdict.
  const neuve = "b".repeat(40);
  assert.equal((await servirLaPRExterne({ number: 12, sha: neuve }, contexte(github, "request-changes", { vert: true, resume: "", detail: "" }, juges))).issue, "servie");
  assert.deepEqual(juges, ["gates a", "juger a", "gates b", "juger b"]);
  assert.match(carteDe(commentaires), /Recommended answer: \*\*no\*\* — on `bbbbbbb`/);
  assert.ok(labels.includes(CHEF_TODO));
  assert.deepEqual(appels, ["assigner 12 sam", "assigner 12 sam"]);
});

test("a review that fails posts nothing and leaves the head to be served again; the comment already posted is not judged twice", async () => {
  const { github, commentaires, labels } = fauxDesPRExternes();
  const juges: string[] = [];
  const echoue = { ...contexte(github, "approve", { vert: true, resume: "", detail: "" }, juges), juger: async () => Promise.reject(new Error("the review of PR #12 is unreadable")) };
  await assert.rejects(servirLaPRExterne({ number: 12, sha: SHA }, echoue), /unreadable/);
  assert.equal(commentaires.filter((c) => !c.body.startsWith("<!-- brigade:manager-prise")).length, 0);
  assert.deepEqual(labels, []);
  // Le verdict posté, puis la station tombe avant la carte : la reprise ne rejuge pas.
  const juge = contexte(github, "approve", { vert: true, resume: "", detail: "" }, juges);
  await github.commenter(12, `<!-- brigade:pr-externe station=box sha=${SHA} verdict=approve gates=green -->\nOutside PR.`);
  assert.equal((await servirLaPRExterne({ number: 12, sha: SHA }, juge)).issue, "servie");
  assert.deepEqual(juges, ["gates a"]);
  assert.match(carteDe(commentaires), /Recommended answer: \*\*yes\*\*/);
});

test("the kitchen has no merge on the outside PR path: no merge or branch update call in pr-externe/", () => {
  const dossier = join(import.meta.dirname, "../../src/pr-externe");
  for (const fichier of readdirSync(dossier)) {
    const source = readFileSync(join(dossier, fichier), "utf8").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(source, /\bmerger\b|\bmettreAJour\b|fusionner|\/merge\b/, `${fichier} calls no merge`);
  }
});

// GraphQL dit qu'une PR vient d'un fork : elle n'est la PR d'aucun ticket, même
// sous le nom de sa branche, et elle est listée comme PR externe.
test("a fork PR read in the snapshot is outside: never a ticket's PR, even under a cook branch name, and listed as an outside PR", async () => {
  const pr = (number: number, externe: boolean) => ({ number, headRefName: "cook/12-github", headRefOid: String(number).repeat(40).slice(0, 40), isCrossRepository: externe, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", files: { nodes: [] }, commits: { nodes: [] } });
  const data = { repository: { issues: { nodes: [] }, pullRequests: { nodes: [pr(90, true)] }, ref: null } };
  assert.deepEqual(lireInstantane(data).prs.map((p) => [p.number, p.externe]), [[90, true]]);
  const lues: string[] = [];
  const github = {
    lireGraphql: async () => data,
    prDeBranche: async (branche: string) => (lues.push(branche), null),
    ci: async () => [],
    mettreAJour: async () => {},
    retraitsDeLabels: async () => [],
    prsOuvertes: async () => assert.fail("the snapshot is complete"),
  } as unknown as GitHub;
  const tour = clientDuTour(github, "main", "acme/brigade");
  await tour.checksDeLaBase();
  // Le ticket #12 n'a pas de PR dans l'instantané : elle se cherche en REST, sur le dépôt même.
  assert.equal(await tour.prDuTicket(12), null);
  assert.deepEqual(lues, ["cook/12-github"]);
  assert.deepEqual(await tour.prsExternes?.(), [{ number: 90, sha: pr(90, true).headRefOid }]);
});

// Le clone de la station rapatrie la tête d'un fork de `refs/pull/<n>/head`,
// que l'origine porte sous aucune branche, dans un worktree détaché.
test("the station's clone fetches a fork PR's head from refs/pull/<n>/head into a detached worktree, with no branch of its own", async (t) => {
  const { origine, clone } = depotGit(t);
  const donnees = (texte: string) => `data ${Buffer.byteLength(texte)}\n${texte}\n`;
  const flux = ["commit refs/pull/5/head\n", "mark :1\n", "committer fork <fork@example.test> now\n", donnees("from a fork"), `from refs/heads/${BASE}^0\n`, `M 100644 inline fork.md\n${donnees("forked\n")}`, "get-mark :1\n"];
  const tete = execFileSync("git", ["fast-import", "--quiet", "--force", "--date-format=now"], { cwd: origine, env: ENV_GIT, input: flux.join(""), encoding: "utf8" }).trim();
  const depot = ouvrirDepot({ clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  const { worktree, reference } = await depot.recevoirPR("gates-pr-5-github", 5);
  assert.equal(depot.tete(reference), tete);
  assert.deepEqual(depot.changes(reference), ["fork.md"]);
  assert.equal(readFileSync(join(worktree, "fork.md"), "utf8"), "forked\n");
  assert.equal(git(clone, "branch", "--list", "--format=%(refname:short)"), BASE);
  depot.retirer(worktree);
  assert.equal(existsSync(worktree), false);
});
