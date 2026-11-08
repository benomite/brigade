// L'écriture sous `.claude/brigade/` (#2855) : un cook dont le ticket ne livre
// que ce dossier — le setup du dépôt — y écrit et commite dans son worktree ;
// celui d'un ticket ordinaire est refusé, et ne commite rien. Le faux cook
// applique, aux `--settings` que la station lui passe, la règle `Write(...)` de
// `claude` en mode `dontAsk`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { dansLeBacASableLocal, type BacASableLocal } from "../../src/bac-a-sable/local.ts";
import { argumentsClaude } from "../../src/claude.ts";
import { livreSousBrigade } from "../../src/brigade-github.ts";
import { posixOnly } from "../support/plateforme.ts";

const FAUX_COOK = join(import.meta.dirname, "../aides/faux-cook.ts");
const BAC: BacASableLocal = { version: "2.1.300", home: "/Users/chef", caches: [], hotes: () => [] };
const git = (cwd: string, ...args: string[]) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });

// Un worktree, un cook lancé pour un ticket qui livre `corps`, et ce que git y
// retient après lui.
function cuire(corps: string) {
  const worktree = realpathSync(mkdtempSync(join(tmpdir(), "ecriture-brigade-")));
  git(worktree, "init", "-q");
  git(worktree, "commit", "-q", "--allow-empty", "-m", "base");
  const args = dansLeBacASableLocal(BAC, argumentsClaude("go", { model: "sonnet", effort: "low" }), worktree, [], livreSousBrigade(corps));
  const identite = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  const cook = spawnSync(process.execPath, [FAUX_COOK, ...args], { cwd: worktree, encoding: "utf8", env: { ...process.env, ...identite, FAUX_COOK: "ecrit-brigade" } });
  return { cook, worktree, commits: git(worktree, "log", "--format=%s").stdout.trim().split("\n"), suivis: git(worktree, "ls-files").stdout.trim() };
}

test("un ticket de setup qui ne livre que `.claude/brigade/` : son cook y écrit `reseau`, et c'est commité (#2855)", { skip: posixOnly("the fake cook is a POSIX script and the sandbox is a Mac's") }, () => {
  const { cook, worktree, commits, suivis } = cuire("Write `.claude/brigade/reseau` and `.claude/brigade/gates.sh`.");
  assert.equal(cook.status, 0, cook.stderr);
  assert.ok(existsSync(join(worktree, ".claude/brigade/reseau")));
  assert.equal(suivis, ".claude/brigade/reseau");
  assert.equal(commits[0], "la liste réseau");
});

test("un ticket ordinaire : la même écriture est refusée, rien n'est commité (#2855)", { skip: posixOnly("the fake cook is a POSIX script and the sandbox is a Mac's") }, () => {
  for (const corps of ["Edit `runtime/src/x.ts`.", "Edit `.claude/brigade/gates.sh` and `runtime/src/x.ts`.", "No file named."]) {
    const { cook, worktree, commits, suivis } = cuire(corps);
    assert.match(cook.stdout, /Permission to use Write has been denied because Claude Code is running in don't ask mode/);
    assert.equal(existsSync(join(worktree, ".claude/brigade/reseau")), false);
    assert.equal(suivis, "");
    assert.deepEqual(commits, ["base"]);
  }
});

test("seul un ticket dont tous les fichiers sont sous `.claude/brigade/` est un ticket de setup", () => {
  assert.equal(livreSousBrigade("Edit `.claude/brigade/gates.sh` and `.claude/brigade/tests-touches.mjs`."), true);
  assert.equal(livreSousBrigade("Edit `.claude/brigade/gates.sh` and `runtime/src/x.ts`."), false);
  assert.equal(livreSousBrigade("Edit `.claude/settings.json`."), false);
  assert.equal(livreSousBrigade(""), false);
});
