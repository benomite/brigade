// Les appels à GitHub qu'une minuterie faisait sans que rien ait changé, rendus
// aux événements (#2198) : le sondage d'une liste de plus d'une page, la
// relecture des issues modifiées depuis un même instant.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirGitHub } from "../../src/github.ts";
import { CHEMIN_TICKETS, DEPOT, fauxGh, issueGitHub } from "../outils.ts";

const SUITE = "https://api.github.com/repositories/1/issues?labels=fire&page=2";
const conditionnel = (appel: string[]) => appel.includes("-H") && (appel[appel.indexOf("-H") + 1] ?? "").startsWith("If-None-Match: ");

test("a poll over two pages, each with its ETag, is asked again page by page under condition: unchanged, it says so; a change on page 2 is seen", async (t: TestContext) => {
  const gh = fauxGh(t);
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin });
  gh.repondre(SUITE, { etag: '"p2-v1"', corps: [issueGitHub(15)] });
  gh.repondre(CHEMIN_TICKETS, { etag: '"p1-v1"', suivant: SUITE, corps: [issueGitHub(14)] });
  const premier = await github.tickets();
  assert.equal(premier.inchange, false);
  if (premier.inchange) return;
  assert.deepEqual(premier.issues.map((issue) => issue.number), [14, 15]);
  premier.confirmer();

  const avant = gh.appels().length;
  assert.deepEqual(await github.tickets(), { inchange: true });
  const relus = gh.appels().slice(avant);
  assert.equal(relus.length, 2);
  assert.ok(relus.every(conditionnel), JSON.stringify(relus));

  gh.repondre(SUITE, { etag: '"p2-v2"', corps: [issueGitHub(15), issueGitHub(16)] });
  const change = await github.tickets();
  assert.equal(change.inchange, false);
  if (change.inchange) return;
  assert.deepEqual(change.issues.map((issue) => issue.number), [14, 15, 16]);
});

test("the issues changed since the same instant, asked again, go out under condition: the breaker's tick costs nothing while nothing moved", async (t: TestContext) => {
  const gh = fauxGh(t);
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin });
  const instant = "2026-11-03T08:00:00.000Z";
  const chemin = `repos/${DEPOT}/issues?state=all&since=${instant}&per_page=100`;
  gh.repondre(chemin, { etag: '"depuis-v1"', corps: [issueGitHub(21, { labels: ["breaker"] })] });
  assert.deepEqual((await github.issuesDepuis(instant)).map((issue) => issue.number), [21]);
  assert.deepEqual((await github.issuesDepuis(instant)).map((issue) => issue.number), [21]);
  assert.deepEqual(gh.appels().at(-1), ["api", "-i", "-H", 'If-None-Match: "depuis-v1"', chemin]);
});
