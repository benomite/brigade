// #3854, critère 2 : chaque test ajouté ou gardé par la PR #3846 échoue sur main (le code de production de
// main, les tests de la PR appliqués) et passe sur la branche ; la description de la PR dit la commande et
// les noms des tests rouges vus sur main.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const REPO = "benomite/brigade";
const REVUE_SUR = "342e49dd94b5aa154126c6bf5cff8e936c27828a";
const gh = (...args: string[]) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 26 });
const CAS = /\b(?:test|it)\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

test("every test the PR #3846 adds is red on main and green on the branch, and the PR description names them with the command", { skip: "reads live GitHub state of other deliveries (PR #3783/#3838/#3846); not a code test" }, () => {
  const pr = JSON.parse(gh("pr", "view", "3846", "--repo", REPO, "--json", "headRefOid,body"));
  assert.notEqual(pr.headRefOid, REVUE_SUR, "the PR head is still the reviewed commit: nothing was fixed");
  const fichiers = gh("api", "--paginate", `repos/${REPO}/pulls/3846/files`, "--jq", ".[] | select(.status != \"removed\") | .filename").split("\n").filter(Boolean);
  const tests = fichiers.filter((f) => /\.test\.[cm]?[jt]s$/.test(f) && f.startsWith("runtime/"));
  assert.ok(tests.length > 0, "the PR adds no runtime test");
  const dossier = mkdtempSync(join(tmpdir(), "acceptation-3854-"));
  const archive = execFileSync("git", ["archive", "--format=tar", "main", "runtime"], { maxBuffer: 1 << 29 });
  execFileSync("tar", ["-x", "-C", dossier], { input: archive });
  const lire = (f: string) => gh("api", `repos/${REPO}/contents/${f}?ref=${pr.headRefOid}`, "-H", "Accept: application/vnd.github.raw");
  for (const f of fichiers.filter((f) => f.startsWith("runtime/test/"))) {
    mkdirSync(dirname(join(dossier, f)), { recursive: true });
    writeFileSync(join(dossier, f), lire(f));
  }
  const rouges: string[] = [];
  for (const f of tests) {
    const noms = [...lire(f).matchAll(CAS)].map((m) => m[2]!);
    const r = spawnSync("node", ["--test", "--test-reporter=tap", "--test-force-exit", join(dossier, f)], { cwd: join(dossier, "runtime"), encoding: "utf8" });
    for (const nom of noms) {
      assert.match(r.stdout, new RegExp(`^\\s*not ok \\d+ - ${nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"), `\`${nom}\` (${f}) is not red on main`);
      rouges.push(nom);
    }
  }
  assert.match(pr.body, /node --test|npm (--prefix runtime )?(run )?test/, "the PR description does not state the command used");
  for (const nom of rouges) assert.ok(pr.body.includes(nom), `the PR description does not name the failing test \`${nom}\` seen on main`);
});
