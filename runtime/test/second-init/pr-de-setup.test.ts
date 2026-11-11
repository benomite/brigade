// La fin de la mise en place par le second (#3169) : la PR de setup ouverte par
// le script de `/brigade:init` de l'app — le vrai, contre une origine nue et un
// `gh` doublure —, sa carte posée dans le TODO du chef sur un GitHub doublé, et
// le message qui dit pourquoi c'est au chef de la merger.
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Commentaire, IssueOuverte, PR } from "../../src/github.ts";
import { carteEnCours, CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { BRANCHE, MARQUEUR, MESSAGE_INCHANGE, ouvrirLaPrDeSetup, principal, type GitHubDuSetup, type Script } from "../../src/second-init/pr-de-setup.ts";
import { BASE, depotGit, ENV_GIT, git, repertoireTemporaire } from "../outils.ts";

const PLUGIN_DE_L_APP = join(import.meta.dirname, "..", "..", "..", "app", "src", "plugin");
const URL = "https://github.com/acme/shop/pull/7";
const SANS_BASH = process.platform === "win32" && "le script de /brigade:init et son `gh` doublure sont joués par bash";

// Le GitHub du dépôt, doublé : les issues qu'il porte, leurs commentaires, la PR de `brigade/init`.
function unGitHub(options: { pr?: Partial<PR> | null; enPanne?: "creerIssue" } = {}) {
  const issues = new Map<number, { titre: string; body: string; labels: string[]; association: string; pr?: true }>();
  const commentaires = new Map<number, Commentaire[]>();
  const ecrits: string[] = [];
  issues.set(7, { titre: "Set the repository up for Brigade", body: "Written by `/brigade:init`.", labels: [], association: "OWNER", pr: true });
  const pr: PR | null = options.pr === null ? null : { number: 7, url: URL, base: BASE, sha: "abc", state: "open", merged: false, enRetard: false, mergeePar: null, ...options.pr };
  let suivant = 41;
  const github: GitHubDuSetup = {
    async prDeBranche(branche) {
      ecrits.push(`lu ${branche}`);
      return branche === BRANCHE ? pr : null;
    },
    async ouvertes() {
      const ouvertes: IssueOuverte[] = [...issues].filter(([, issue]) => issue.pr === undefined).map(([number, issue]) => ({ number, title: issue.titre, labels: issue.labels, state: "open", createdAt: "", updatedAt: "", url: "", body: issue.body, association: issue.association }));
      return { inchange: false, issues: ouvertes, confirmer: () => {} };
    },
    async creerIssue({ titre, corps, labels }) {
      if (options.enPanne === "creerIssue") throw new Error("HTTP 403: Resource not accessible");
      const numero = ++suivant;
      issues.set(numero, { titre, body: corps, labels: [...labels], association: "OWNER" });
      ecrits.push(`issue ${numero}`);
      return numero;
    },
    async issue(numero) {
      const issue = issues.get(numero);
      return issue === undefined ? null : { number: numero, title: issue.titre, labels: issue.labels, state: "open", createdAt: "", updatedAt: "", url: "", body: issue.body };
    },
    async commentaires(numero) {
      return commentaires.get(numero) ?? [];
    },
    async commenter(numero, corps) {
      commentaires.set(numero, [...(commentaires.get(numero) ?? []), { body: corps, author: "chef", association: "OWNER", createdAt: "" }]);
      ecrits.push(`commentaire ${numero}`);
    },
    async labelliser(numero, labels) {
      issues.get(numero)?.labels.push(...labels);
      ecrits.push(`labels ${numero} ${labels.join(",")}`);
    },
    async delabelliser(numero, label) {
      const issue = issues.get(numero);
      if (issue !== undefined) issue.labels = issue.labels.filter((porte) => porte !== label);
      ecrits.push(`retrait ${numero} ${label}`);
    },
    async ecrireCorps(numero, corps) {
      const issue = issues.get(numero);
      if (issue !== undefined) issue.body = corps;
      ecrits.push(`corps ${numero}`);
    },
  };
  return { github, issues, commentaires, ecrits };
}

// Un dossier de projet sans Brigade, son origine nue, et le `gh` doublure que le script appelle : connecté, il
// note chaque appel ; aucune PR ouverte, il en crée une.
function unProjet(t: TestContext) {
  const { origine, clone } = depotGit(t);
  const racine = repertoireTemporaire(t);
  mkdirSync(join(racine, "bin"));
  const journal = join(racine, "gh.log");
  writeFileSync(join(racine, "bin", "gh"), `#!/usr/bin/env bash\necho "$*" >>"${journal}"\ncase "$1 $2" in\n  "pr create") echo "${URL}" ;;\nesac\nexit 0\n`, { mode: 0o755 });
  // Le script, posé exécutable avec son catalogue de labels, comme l'app le pose dans son marketplace.
  const script = join(racine, "scripts", "init.sh");
  mkdirSync(join(racine, "scripts"));
  copyFileSync(join(PLUGIN_DE_L_APP, "init.sh"), script);
  copyFileSync(join(PLUGIN_DE_L_APP, "labels.tsv"), join(racine, "scripts", "labels.tsv"));
  chmodSync(script, 0o755);
  const env = { ...ENV_GIT, PATH: `${join(racine, "bin")}:${process.env.PATH}`, TMPDIR: racine };
  return { origine, clone, script, env, appelsDeGh: () => readFileSync(journal, "utf8").trim().split("\n") };
}

const VALEURS = ["--test", "npm test", "--base", BASE, "--zones", "`src/`"];

test("la mise en place finit par la PR de setup, ouverte avec ses fichiers par le script de /brigade:init, sa carte dans le TODO, et le message qui dit pourquoi le chef la merge", { skip: SANS_BASH }, async (t) => {
  const { origine, clone, script, env, appelsDeGh } = unProjet(t);
  const { github, issues, commentaires } = unGitHub();
  const dits: string[] = [];
  const redits: string[] = [];

  // Par la commande que `/brigade:init` lance (init.md).
  await principal({ args: [script, ...VALEURS], env, dire: (ligne) => dits.push(ligne), redire: (ligne) => redits.push(ligne) }, { dossier: clone, github: () => github });

  assert.deepEqual(redits, []);
  // La PR est ouverte, de `brigade/init` vers la branche d'intégration, et porte les fichiers de setup avec les valeurs arrêtées.
  assert.match(appelsDeGh().find((appel) => appel.startsWith("pr create")) ?? "", new RegExp(`^pr create --base ${BASE} --head brigade/init `));
  const claudeMd = git(clone, "--git-dir", origine, "show", "brigade/init:CLAUDE.md");
  assert.match(claudeMd, new RegExp(`^- \\*\\*Branche d'intégration\\*\\* : \`${BASE}\`$`, "m"));
  assert.match(claudeMd, /^- \*\*Zones de fichiers\*\* : `src\/`$/m);
  assert.match(git(clone, "--git-dir", origine, "show", "brigade/init:.claude/brigade/gates.sh"), /\nnpm test$/);

  // La carte est dans le TODO : une issue au label `chef-todo`, avec son commentaire de carte, dont le choix merge la PR.
  const [carte, issue] = [...issues].find(([, lue]) => lue.body.includes(MARQUEUR)) ?? [];
  assert.equal(carte, 42);
  assert.ok(issue?.labels.includes(CHEF_TODO));
  const tenue = carteEnCours(issue?.labels ?? [], commentaires.get(42) ?? []);
  assert.equal(tenue?.sorte, "merge-by-hand");
  assert.match(tenue?.texte ?? "", /^Merge the setup pull request #7\?\n- \[merge\] Merge #7\n/);
  // La PR nomme l'issue de sa carte : la merger la ferme, et la carte quitte le TODO.
  assert.match(issues.get(7)?.body ?? "", /\n\nCloses #42$/);

  // Le message de fin : la PR, pourquoi c'est au chef de la merger, sa carte, et ce qui suit.
  assert.equal(dits.length, 1);
  const [message] = dits;
  assert.ok(message?.includes(URL));
  assert.match(message ?? "", /You are the one to merge it, not me, because it sets what will judge every future delivery/);
  assert.match(message ?? "", /a card in the TODO \(#42\)/);
  assert.match(message ?? "", new RegExp(`Once it is merged on \`${BASE}\`, the project shows as ready\\.`));
});

// Le script, doublé : sa sortie telle qu'il la rendrait, ou son erreur.
const jouer =
  (sortie: string | Error): Script =>
  async () => {
    if (sortie instanceof Error) throw sortie;
    return sortie;
  };

test("rejouée sur la même PR, la mise en place ne double ni l'issue, ni la carte, ni le lien", async () => {
  const { github, issues, ecrits } = unGitHub();
  const options = { dossier: ".", script: "init.sh", args: [], github: () => github, jouer: jouer(`label fire\npr ${URL}\n`) };

  const premiere = await ouvrirLaPrDeSetup(options);
  const avant = ecrits.length;
  const seconde = await ouvrirLaPrDeSetup(options);

  assert.equal(premiere.etat === "ouverte" && premiere.carte, 42);
  assert.deepEqual(seconde, premiere);
  assert.deepEqual(ecrits.slice(avant), [`lu ${BRANCHE}`]);
  assert.equal([...issues.values()].filter((issue) => issue.body.includes(MARQUEUR)).length, 1);
});

test("une nouvelle PR de setup, la précédente fermée sans merge : la carte qui attend est reposée pour elle", async () => {
  const avant = unGitHub();
  await ouvrirLaPrDeSetup({ dossier: ".", script: "init.sh", args: [], github: () => avant.github, jouer: jouer(`pr ${URL}`) });
  const { github, issues, commentaires } = unGitHub({ pr: { number: 9, url: "https://github.com/acme/shop/pull/9" } });
  for (const [numero, issue] of avant.issues) issues.set(numero, issue);
  for (const [numero, lus] of avant.commentaires) commentaires.set(numero, lus);
  issues.set(9, { titre: "Set the repository up for Brigade", body: "", labels: [], association: "OWNER", pr: true });

  const rendu = await ouvrirLaPrDeSetup({ dossier: ".", script: "init.sh", args: [], github: () => github, jouer: jouer("pr https://github.com/acme/shop/pull/9") });

  assert.equal(rendu.etat === "ouverte" && rendu.carte, 42);
  assert.match(carteEnCours(issues.get(42)?.labels ?? [], commentaires.get(42) ?? [])?.texte ?? "", /^Merge the setup pull request #9\?\n- \[merge\] Merge #9\n/);
  assert.match(issues.get(9)?.body ?? "", /Closes #42$/);
});

test("la branche d'intégration porte déjà la mise en place : aucune PR, aucune carte, et le second le dit", async () => {
  const { github, ecrits } = unGitHub();
  const rendu = await ouvrirLaPrDeSetup({ dossier: ".", script: "init.sh", args: [], github: () => github, jouer: jouer("unchanged\n") });
  assert.deepEqual(rendu, { etat: "inchange", message: MESSAGE_INCHANGE });
  assert.deepEqual(ecrits, []);
});

test("le script échoue, ou finit sans dire sa PR : la commande le dit, code 1, et rien n'est posé dans le TODO", async () => {
  for (const [sortie, dit] of [
    [new Error("gh is not logged in (gh auth login)"), "brigade setup: gh is not logged in (gh auth login)"],
    ["label fire\n", 'brigade setup: the setup script ended without saying which pull request it opened (last line: "label fire")'],
    ["pr https://example.com/pull/7", "brigade setup: the setup script gave https://example.com/pull/7, which is not a GitHub pull request address"],
  ] as const) {
    const { github, ecrits } = unGitHub();
    const redits: string[] = [];
    const dits: string[] = [];
    await assert.rejects(principal({ args: ["init.sh"], env: {}, dire: (ligne) => dits.push(ligne), redire: (ligne) => redits.push(ligne) }, { dossier: ".", github: () => github, jouer: jouer(sortie) }), { code: 1 });
    assert.deepEqual(redits, [dit]);
    assert.deepEqual(dits, []);
    assert.deepEqual(ecrits, []);
  }
});

test("la PR que le script dit n'est pas ouverte sur GitHub : rien n'est dit ouvert, aucune carte", async () => {
  for (const pr of [null, { state: "closed" as const }, { number: 8 }]) {
    const { github, ecrits } = unGitHub({ pr });
    await assert.rejects(ouvrirLaPrDeSetup({ dossier: ".", script: "init.sh", args: [], github: () => github, jouer: jouer(`pr ${URL}`) }), { message: `the setup pull request ${URL} is not open on GitHub` });
    assert.deepEqual(ecrits, [`lu ${BRANCHE}`]);
  }
});

test("GitHub ne se lit pas pour vérifier la PR : la commande le dit, sans carte", async () => {
  const { github, ecrits } = unGitHub();
  github.prDeBranche = async () => {
    throw new Error("gh api: HTTP 502");
  };
  await assert.rejects(ouvrirLaPrDeSetup({ dossier: ".", script: "init.sh", args: [], github: () => github, jouer: jouer(`pr ${URL}`) }), {
    message: `the setup script gave ${URL}, but GitHub could not be read to check it is open (gh api: HTTP 502): it may await you on GitHub`,
  });
  assert.deepEqual(ecrits, []);
});

test("la carte ne se pose pas : la PR est dite ouverte, sans carte, avec le geste qui reste", async () => {
  const { github } = unGitHub({ enPanne: "creerIssue" });
  const redits: string[] = [];
  await assert.rejects(principal({ args: ["init.sh"], env: {}, dire: () => {}, redire: (ligne) => redits.push(ligne) }, { dossier: ".", github: () => github, jouer: jouer(`pr ${URL}`) }), { code: 1 });
  assert.deepEqual(redits, [`brigade setup: the setup pull request ${URL} is open, but its card could not be put in the TODO (HTTP 403: Resource not accessible): merge it on GitHub`]);
});

test("sans script, la commande dit son usage, code 2", async () => {
  const redits: string[] = [];
  await assert.rejects(principal({ args: [], env: {}, dire: () => {}, redire: (ligne) => redits.push(ligne) }), { code: 2 });
  assert.deepEqual(redits, ["usage: node runtime/src/second-init/pr-de-setup.ts <setup script> [<its arguments>…]"]);
});
