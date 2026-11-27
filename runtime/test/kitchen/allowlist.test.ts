// The new kitchen publishes its project's network allowlist to the project's
// gate: a real git origin, an empty fake `gh`, and the station's gates.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { openKitchen, gitCli, type Git } from "../../src/kitchen/kitchen.ts";
import type { Gh } from "../../src/kitchen/github.ts";
import type { OptionsPorte, Porte } from "../../src/porte.ts";
import { autorise } from "../../src/reseau.ts";
import { tenirPortes } from "../../src/station/portes.ts";
import { repertoireTemporaire } from "../outils.ts";

const sh = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, "-c", "user.email=s@s", "-c", "user.name=s", ...args], { stdio: "pipe" }).toString();

// No issue, no pull request: the turn has nothing to cook.
const emptyGh: Gh = async (args) => {
  if (args[0] === "api" && args.includes("graphql"))
    return JSON.stringify({ data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] }, pullRequests: { nodes: [] } } } });
  return "";
};

test("a host added to .claude/brigade/reseau on the base is allowed by the project's gate after one kitchen turn; an unreadable declaration keeps the last list", async (t) => {
  const racine = repertoireTemporaire(t);
  const origin = join(racine, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  const seed = join(racine, "seed");
  execFileSync("git", ["clone", "-q", origin, seed], { stdio: "pipe" });
  writeFileSync(join(seed, "README"), "hi");
  sh(seed, "add", "README");
  sh(seed, "commit", "-qm", "seed");
  sh(seed, "push", "-q", "origin", "HEAD:main");
  const clone = join(racine, "calcul", "depot");
  execFileSync("git", ["clone", "-q", origin, clone], { stdio: "pipe" });

  mkdirSync(join(racine, "kitchen"), { recursive: true });
  writeFileSync(join(racine, "kitchen", "projects"), "calcul o/calcul main\n");
  const lists = new Map<string, OptionsPorte["regles"]>();
  const gates = await tenirPortes({
    racine,
    fichier: join(racine, "portes.json"),
    dire: () => {},
    relectureMs: 3_600_000,
    ouvrir: async (options) => {
      lists.set(options.projet, options.regles);
      return { port: 1 + lists.size, fermer: async () => {} } as unknown as Porte;
    },
  });
  t.after(() => gates.arreter());
  const allowed = (host: string) => autorise((lists.get("calcul") as OptionsPorte["regles"])(true), host, 443);

  let broken = false;
  const git = gitCli(process.env);
  const brokenGit: Git = (cwd, args) => (broken && args[0] === "ls-tree" ? Promise.reject(new Error("git ls-tree: bad object")) : git(cwd, args));
  const lines: string[] = [];
  const kitchen = openKitchen({
    repo: "o/calcul",
    base: "main",
    clone,
    worktrees: join(racine, "kitchen", "calcul", "worktrees"),
    state: join(racine, "kitchen", "calcul"),
    gh: emptyGh,
    git: brokenGit,
    launch: () => {
      throw new Error("no agent in this test");
    },
    places: () => 2,
    riskPaths: () => [],
    supervisorEveryMs: Number.MAX_SAFE_INTEGER,
    log: (line) => lines.push(line),
  });

  await kitchen.turn();
  assert.equal(allowed("registry.npmjs.org"), false);
  assert.equal(allowed("api.github.com"), true);

  mkdirSync(join(seed, ".claude", "brigade"), { recursive: true });
  writeFileSync(join(seed, ".claude", "brigade", "reseau"), "registry.npmjs.org\n");
  sh(seed, "add", ".claude/brigade/reseau");
  sh(seed, "commit", "-qm", "open npm");
  sh(seed, "push", "-q", "origin", "HEAD:main");
  await kitchen.turn();
  // The gate rereads its list before a refusal, once a second at most.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal(allowed("registry.npmjs.org"), true, lines.join("\n"));

  // Published only when it changed.
  const published = join(racine, "kitchen", "calcul", "network.json");
  const before = readFileSync(published, "utf8");
  await kitchen.turn();
  assert.equal(lines.filter((line) => line.startsWith("network allowlist published")).length, 2, lines.join("\n"));

  broken = true;
  await kitchen.turn();
  await kitchen.turn();
  // The file the gate reads is untouched: the gate keeps the same list, with
  // no second wait past its reread floor (the suite's 2 s guard, #2129).
  assert.equal(readFileSync(published, "utf8"), before);
  assert.equal(allowed("registry.npmjs.org"), true);
  assert.deepEqual(lines.filter((line) => line.startsWith("network declaration unreadable")), ["network declaration unreadable on main, the last allowlist holds — git ls-tree: bad object"]);
});
