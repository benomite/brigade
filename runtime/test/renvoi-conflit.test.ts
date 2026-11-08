// Le renvoi pour conflit, de bout en bout (#2953, épique #2949) : la station
// (`stationDuDepot`) reprend la branche d'une PR en conflit avec un faux git,
// un faux `claude` et un faux dépôt. Le faux git tient l'état d'un worktree :
// la fusion tentée, commitée ou non.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { A_LA_MAIN, priseDeLaStation, stationDuDepot, type Lancer } from "../src/brigade-github.ts";
import { CHEF_TODO } from "../src/github-seul/carte-todo/carte-todo.ts";
import { MARQUE_DE_RENVOI } from "../src/qualite-github.ts";
import { FauxGitHub, fauxClient } from "./faux-github.ts";

const REFUS = "I stopped: `git merge origin/main` was refused, permission denied by the sandbox.";

type Sortie = { code: number; stdout: string; stderr: string };

// Un faux git : `conflits` dit si la fusion bute ; `fusionOk` si une seconde
// fusion (`--no-edit`, celle de la reprise) passe.
function fauxGit(conflits: boolean, fusionOk: boolean) {
  const appels: string[] = [];
  const etat = { fusionTentee: false, fusionCommitee: false };
  const lancerGit = async (args: string[]): Promise<Sortie> => {
    appels.push(args.join(" "));
    const ok = { code: 0, stdout: "", stderr: "" };
    if (args[0] === "fetch") return ok;
    if (args[0] === "merge" && args.includes("--no-commit")) {
      etat.fusionTentee = true;
      return conflits ? { code: 1, stdout: "CONFLICT (content): Merge conflict in src/a.ts", stderr: "" } : ok;
    }
    if (args[0] === "merge") {
      if (!fusionOk) return { code: 128, stdout: "", stderr: "fatal: permission denied" };
      etat.fusionCommitee = true;
      return ok;
    }
    if (args[0] === "diff") return { ...ok, stdout: conflits ? "src/a.ts\n" : "" };
    return { code: 1, stdout: "", stderr: `unexpected git ${args[0]}` };
  };
  return { appels, etat, lancerGit };
}

async function renvoiPourConflit(t: TestContext, git: ReturnType<typeof fauxGit>, cook: (consigne: string, etat: typeof git.etat) => string) {
  const repertoire = mkdtempSync(join(tmpdir(), "renvoi-conflit-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(14);
  faux.prs.push({ number: 99, issue: 14, branche: "cook/14-github", sha: "c".repeat(40), state: "open", merged: false, enRetard: false, enConflit: true, mergeePar: null, fichiers: [] });
  const consignes: string[] = [];
  const vuAuDepart: Array<{ fusionTentee: boolean; fusionCommitee: boolean }> = [];
  const gestes: string[] = [];
  const lancer: Lancer = ({ args, flux }) => {
    consignes.push(args.join("\n"));
    vuAuDepart.push({ ...git.etat });
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: cook(args.join("\n"), git.etat) })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/depot",
    github: fauxClient(faux),
    depot: {
      connait: (branche) => branche === "cook/14-github",
      preparer: async (run) => {
        gestes.push(`preparer ${run}`);
        return { worktree: join(repertoire, `neuf-${run}`), branche: `cook/${run}` };
      },
      reprendre: async (run) => join(repertoire, run),
      retirer: (worktree) => void gestes.push(`retirer ${worktree.slice(repertoire.length + 1)}`),
      ranger: async () => null,
      pousser: (branche) => void gestes.push(`pousser ${branche}`),
      commits: () => 1,
      changes: () => [],
      diff: () => "",
      tete: () => (git.etat.fusionCommitee ? "b" : "a").repeat(40),
      lancerGit: git.lancerGit,
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) throw new Error("inaccessible");
  await station.tour();
  await station.calme();
  return { faux, consignes, vuAuDepart, gestes };
}

const commentairesDe = (faux: FauxGitHub) => (faux.commentaires.get(14) ?? []).map((c) => c.body);

test("a conflict send-back hands the cook a branch that already holds the merge attempt, with the conflicts left uncommitted", async (t) => {
  const git = fauxGit(true, false);
  const { consignes, vuAuDepart } = await renvoiPourConflit(t, git, () => "done");
  assert.equal(vuAuDepart.length, 1);
  assert.deepEqual(vuAuDepart[0], { fusionTentee: true, fusionCommitee: false });
  assert.deepEqual(git.appels.slice(0, 2), ["fetch origin main", "merge --no-commit --no-ff FETCH_HEAD"]);
  assert.ok(git.appels.every((appel) => !appel.startsWith("commit")), "the station commits nothing: the cook does");
  assert.match(consignes[0] ?? "", /already fetched `origin\/main` and merged it[\s\S]*left in the worktree with their markers[\s\S]*`src\/a\.ts`/);
});

test("a base that merges cleanly is also handed over merged, and the cook is told no conflict is left", async (t) => {
  const git = fauxGit(false, false);
  const { consignes, vuAuDepart } = await renvoiPourConflit(t, git, () => "done");
  assert.deepEqual(vuAuDepart[0], { fusionTentee: true, fusionCommitee: false });
  assert.match(consignes[0] ?? "", /merged without conflict and is staged/);
});

test("when the station cannot fetch, the cook gets the old instruction and does the merge itself", async (t) => {
  const git = fauxGit(true, false);
  const refuse = git.lancerGit;
  git.lancerGit = async (args) => (args[0] === "fetch" ? { code: 128, stdout: "", stderr: "fatal: could not read from remote" } : refuse(args));
  const { consignes } = await renvoiPourConflit(t, git, () => "done");
  assert.match(consignes[0] ?? "", /Bring the branch up to date with `origin\/main`/);
  assert.doesNotMatch(consignes[0] ?? "", /already fetched/);
});

test("a cook refused a git command on a conflict send-back, when the station's merge also fails: one send-back only, no chef card, no blocked-on-human; the branch restarts from main", async (t) => {
  const git = fauxGit(true, false);
  const { faux, gestes } = await renvoiPourConflit(t, git, () => `<livrable>\n<bloque>${REFUS}</bloque>\n</livrable>`);
  assert.ok(git.appels.includes("merge --no-edit origin/main"), "the station tried the merge itself first");
  assert.deepEqual(gestes.filter((g) => g.startsWith("preparer")), ["preparer 14-github"]);
  assert.equal(commentairesDe(faux).filter((c) => c.startsWith(MARQUE_DE_RENVOI)).length, 0, "no second conflict send-back");
  assert.equal(commentairesDe(faux).filter((c) => /brigade:todo|brigade:consultation|chef/i.test(c)).length, 0, "no card for the chef");
  assert.equal(faux.ticket(14).labels.has(CHEF_TODO), false);
  assert.equal(faux.ticket(14).labels.has(A_LA_MAIN), false);
});

test("a cook refused a git command on a conflict send-back, when the station's merge goes through: the delivery follows, nothing is restarted, blocked-on-human is not set", async (t) => {
  const git = fauxGit(true, true);
  const { faux, gestes } = await renvoiPourConflit(t, git, () => `<livrable>\n<bloque>${REFUS}</bloque>\n</livrable>`);
  assert.equal(git.etat.fusionCommitee, true);
  assert.deepEqual(gestes.filter((g) => g.startsWith("preparer")), []);
  assert.ok(gestes.includes("pousser cook/14-github"), "the merged branch is pushed");
  assert.equal(commentairesDe(faux).filter((c) => c.startsWith(MARQUE_DE_RENVOI)).length, 0);
  assert.equal(faux.ticket(14).labels.has(CHEF_TODO), false);
  assert.equal(faux.ticket(14).labels.has(A_LA_MAIN), false);
});
