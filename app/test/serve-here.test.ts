// « This computer » on a project (#4568): one line in <station dir>/kitchen/projects, none on a second click, and a sentence
// naming the cause when this computer cannot cook it. Run against a temporary station dir, with the machine's probes faked.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { auMoins, VERSION_MINIMALE } from "../../runtime/src/bac-a-sable/detection.ts";
import { readProjects } from "../../runtime/src/kitchen/projects.ts";
import type { LocalCopy } from "../src/first-launch.ts";
import { serveHere, type Options, type Probes } from "../src/serve-here.ts";

const MAC: Probes = { platform: "darwin", seatbelt: true, claude: `${VERSION_MINIMALE} (Claude Code)`, minimum: VERSION_MINIMALE, atLeast: auMoins };
const made: string[] = [];
const station = () => {
  const dir = mkdtempSync(join(tmpdir(), "serve-here-"));
  made.push(dir);
  return dir;
};
after(() => made.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const projectsOf = (dir: string) => readFileSync(join(dir, "kitchen", "projects"), "utf8");

// A copy the app already holds, or a clone made at <root>/depot.
const copy = (folder: string | null, failure?: string): Options["openCopy"] => async ({ repository, project, root }): Promise<LocalCopy> =>
  failure !== undefined
    ? { state: "failed", project, repository, cause: "network", reason: failure }
    : { state: "open", project, repository, folder: folder ?? join(root, project), cloned: folder === null };
const options = (dir: string, over: Partial<Options> = {}): Options => ({
  stationDir: dir,
  repository: "benomite/parade",
  project: { nom: "parade", dossier: "/Users/chef/Brigade/parade", base: "develop" },
  probes: () => MAC,
  openCopy: copy(null),
  readBase: async () => "main",
  ...over,
});

describe("« this computer » serves a project in its new kitchen", () => {
  test("adds exactly one line with CLONE= for the clone the app holds, and a second click adds none", async () => {
    const dir = station();
    const first = await serveHere(options(dir, { openCopy: copy("/Users/chef/Brigade/parade") }));
    assert.deepEqual(first, { depots: ["benomite/parade"] });
    assert.equal(projectsOf(dir), "parade benomite/parade develop CLONE=/Users/chef/Brigade/parade\n");
    assert.deepEqual(await serveHere(options(dir)), { depots: ["benomite/parade"] });
    assert.equal(projectsOf(dir), "parade benomite/parade develop CLONE=/Users/chef/Brigade/parade\n");
    assert.deepEqual(readProjects(projectsOf(dir), dir).map(({ name, repo, base, clone }) => [name, repo, base, clone]), [["parade", "benomite/parade", "develop", "/Users/chef/Brigade/parade"]]);
  });

  test("without a clone of the app, it clones into <station dir>/<name>/depot and writes no CLONE=", async () => {
    const dir = station();
    await serveHere(options(dir, { project: { nom: "parade", dossier: "/nowhere" } }));
    assert.equal(projectsOf(dir), "parade benomite/parade main\n");
    assert.equal(readProjects(projectsOf(dir), dir)[0]?.clone, join(dir, "parade", "depot"));
  });

  test("keeps the lines already there, and the project's repository is compared without regard to case", async () => {
    const dir = station();
    mkdirSync(join(dir, "kitchen"));
    writeFileSync(join(dir, "kitchen", "projects"), "cantine chef/cantine main");
    await serveHere(options(dir));
    assert.equal(projectsOf(dir), "cantine chef/cantine main\nparade benomite/parade develop\n");
    await serveHere(options(dir, { repository: "BenOmite/Parade" }));
    assert.equal(projectsOf(dir).split("\n").length, 3);
  });
});

describe("a refusal names its cause and never asks for a file to be edited", () => {
  const refusals: Array<[string, Partial<Options>, RegExp]> = [
    ["not a Mac", { probes: () => ({ ...MAC, platform: "linux" }) }, /not a Mac/],
    ["no sandbox-exec", { probes: () => ({ ...MAC, seatbelt: false }) }, /no sandbox/],
    ["no claude answer", { probes: () => ({ ...MAC, claude: null }) }, /did not answer/],
    ["claude too old", { probes: () => ({ ...MAC, claude: "2.0.1 (Claude Code)" }) }, /2\.0\.1 on this Mac is too old/],
    ["no clone possible", { openCopy: copy(null, "GitHub cannot be reached from this computer.") }, /none could be made: GitHub cannot be reached/],
    ["a name taken by another repository", { repository: "other/parade" }, /already serves another project called parade/],
    ["a clone in a folder with a space", { openCopy: copy("/Users/chef/My Projects/parade") }, /name has a space/],
  ];
  for (const [title, over, said] of refusals) {
    test(title, async () => {
      const dir = station();
      mkdirSync(join(dir, "kitchen"));
      writeFileSync(join(dir, "kitchen", "projects"), title.startsWith("a name") ? "parade chef/parade main\n" : "");
      const before = readFileSync(join(dir, "kitchen", "projects"), "utf8");
      const rendered = await serveHere(options(dir, over));
      assert.ok("refus" in rendered && said.test(rendered.refus), JSON.stringify(rendered));
      assert.doesNotMatch(rendered.refus, /nothing was written|kitchen\/projects|edit|\/projects/);
      assert.equal(readFileSync(join(dir, "kitchen", "projects"), "utf8"), before);
    });
  }
});
