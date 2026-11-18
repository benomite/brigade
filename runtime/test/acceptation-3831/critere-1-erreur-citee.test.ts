// Critère d'acceptation du ticket #3831, lu sur GitHub avec `gh`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const REPO = "benomite/brigade";
const PR = 3783;
const ISSUE = 3778;
const COMMIT_ROUGE = "1500804";

function api<T>(chemin: string): T[] {
  const sortie = execFileSync("gh", ["api", "--paginate", "--slurp", chemin], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return (JSON.parse(sortie) as T[][]).flat();
}
type Commentaire = { body: string };
function constat(): string {
  const tous = [
    ...api<Commentaire>(`repos/${REPO}/issues/${ISSUE}/comments`),
    ...api<Commentaire>(`repos/${REPO}/issues/${PR}/comments`),
  ];
  const c = tous.filter((x) => /types \(app\)/i.test(x.body) && x.body.includes(COMMIT_ROUGE));
  assert.ok(c.length > 0, `no comment on #${ISSUE} or PR #${PR} about types (app) at ${COMMIT_ROUGE}`);
  return c.map((x) => x.body).join("\n");
}

test("a comment quotes the types (app) error output and names the failing file and line", () => {
  const corps = constat();
  assert.match(corps, /error TS\d+/, "the compiler output (error TSxxxx) is quoted");
  assert.match(corps, /[\w./-]+\.(ts|tsx|js|mts)[:(]\d+/, "a failing file and line are named");
});
