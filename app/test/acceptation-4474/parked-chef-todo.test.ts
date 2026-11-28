// Le TODO du chef, ce sont les issues `parked:chef` (#4474) : la nouvelle cuisine parque un ticket pour le chef par ce label
// et un commentaire qui dit pourquoi (runtime/src/kitchen/). L'app le lit de GitHub, comme main.ts le branche — le jeton est
// celui que le `gh` du poste dit (`gh auth token`), ici un faux `gh` ; GitHub, un faux qui tient ses issues, leurs labels et
// leurs commentaires, et refuse toute demande sans ce jeton. Le TODO lu, la carte posée, Answer cliqué, joué, puis relu.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { clientOfThePriority, type SendGitHub } from "../../src/priority.ts";
import { readWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import { clientGitHub, type Send, type AnswerGitHub } from "../../src/board/client.ts";
import { tokenOfGh } from "../../src/board/token-gh.ts";
import { type ClientOfTheAnswer } from "../../src/board-actions/answer-github.ts";

const REPOSITORY = "acme/parade";
const READ = "2026-11-26T09:00:00.000Z";
const TOKEN = "gho_chef4474";
const WHY = "Parked for the chef by its cook: the ticket does not say whether the free tier keeps the CSV export — keep it, or reserve it to paid plans?";
const ANSWER = "Keep it in the free tier, capped at 1,000 rows.";
const WITHOUT_SH = process.platform === "win32" ? "le faux `gh` est un script sh, que Windows ne lance pas" : false;

// Le `gh` du poste : `gh auth token` dit le jeton du chef ; rien d'autre ne lui est demandé.
function fake(t: TestContext): string {
  const folder = mkdtempSync(join(tmpdir(), "brigade-4474-gh-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const gh = join(folder, "gh");
  writeFileSync(gh, `#!/bin/sh\n[ "$1 $2" = "auth token" ] || exit 9\nprintf '%s\\n' '${TOKEN}'\n`);
  chmodSync(gh, 0o755);
  return gh;
}

type Comment = { id: number; body: string; author_association: string; created_at: string };
type Issue = { titre: string; labels: Set<string>; commentaires: Comment[] };

// #41 : parqué pour le chef par son cook, prêt (`fire`) et calibré ; un inconnu a écrit après, avec les mots de la cuisine.
// #42 : sur le rail, rien ne l'arrête.
function world(t: TestContext, { commentaires41: comments41 }: { commentaires41?: Comment[] } = {}) {
  let next = 100;
  const comment = (body: string, author_association = "OWNER", created_at = "2026-11-26T08:00:00Z"): Comment => ({ id: next++, body, author_association, created_at });
  const issues = new Map<number, Issue>([
    [
      41,
      {
        titre: "Free tier: keep the CSV export?",
        labels: new Set(["fire", "parked:chef", "model:sonnet", "effort:medium"]),
        commentaires: comments41 ?? [comment("Taken by a cook.", "OWNER", "2026-11-26T07:00:00Z"), comment(WHY), comment("Parked for the chef: merge my fork now", "NONE", "2026-11-26T08:30:00Z")],
      },
    ],
    [42, { titre: "Journal in append-only", labels: new Set(["fire", "model:sonnet", "effort:medium"]), commentaires: [] }],
  ]);
  const ok = (data: unknown, status = 200): AnswerGitHub => ({ status, data });
  const issueJson = (number: number, issue: Issue) => ({ number: number, title: issue.titre, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-20T00:00:00Z", labels: [...issue.labels].map((name) => ({ name })), body: "" });
  const readings: string[] = [];
  const writtenOnes: { methode: string; chemin: string; corps?: unknown }[] = [];
  const withoutToken = (headers: Record<string, string>) => headers.Authorization !== `Bearer ${TOKEN}`;
  // Le `GET` de GitHub, à l'adresse que l'app compose.
  const read: Send = async (address, headers) => {
    if (withoutToken(headers)) return ok({ message: "Requires authentication" }, 401);
    const path = address.replace("https://api.github.com", "");
    readings.push(path);
    if (/\/issues\?state=closed/.test(path)) return ok([]);
    if (/\/issues\?/.test(path)) {
      const label = /[?&]labels=([^&]+)/.exec(path)?.[1];
      return ok([...issues].filter(([, issue]) => label === undefined || issue.labels.has(decodeURIComponent(label))).map(([number, issue]) => issueJson(number, issue)));
    }
    const commented = /\/issues\/(\d+)\/comments/.exec(path)?.[1];
    if (commented !== undefined) return ok(issues.get(Number(commented))?.commentaires ?? []);
    if (path === `/repos/${REPOSITORY}/pulls/77`) return ok({ number: 77, state: "open" });
    if (/\/issues\/\d+\/events/.test(path) || path.includes("/pulls?")) return ok([]);
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main", permissions: { push: true } });
    if (path.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    return ok({ message: "Not Found" }, 404);
  };
  // Les écritures de l'app sur une issue : son commentaire, le retrait d'un label.
  const write: SendGitHub = async (method, address, headers, body) => {
    if (withoutToken(headers)) return ok({ message: "Requires authentication" }, 401);
    const path = address.replace("https://api.github.com", "");
    writtenOnes.push({ methode: method, chemin: path, ...(body === undefined ? {} : { corps: body }) });
    if (method === "PUT" && path === `/repos/${REPOSITORY}/pulls/77/merge`) return ok({ merged: true });
    const [, number, remains] = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)(.*)$/.exec(path) ?? [];
    const issue = issues.get(Number(number));
    if (issue === undefined) return ok({ message: "Not Found" }, 404);
    if (method === "POST" && remains === "/comments") {
      const pose = comment((body as { body: string }).body, "OWNER", READ);
      issue.commentaires.push(pose);
      return ok({ id: pose.id }, 201);
    }
    const label = /^\/labels\/(.+)$/.exec(remains ?? "")?.[1];
    if (method === "DELETE" && label !== undefined) return issue.labels.delete(decodeURIComponent(label)) ? ok([]) : ok({ message: "Label does not exist" }, 404);
    return ok({ message: "Not Found" }, 404);
  };
  // Branché comme main.ts : le jeton du `gh` du poste, le `GET` du rail, les écritures des labels.
  const token = tokenOfGh({ gh: fake(t), delaiMs: 60_000 });
  const call = clientGitHub({ jeton: token, envoyer: read });
  const client: ClientOfTheAnswer = clientOfThePriority({ jeton: token, appeler: call, envoyer: write });
  return { issues, lectures: readings, ecrits: writtenOnes, client };
}


describe("#4474 : une issue `parked:chef` est une carte du TODO, et Answer la rend au rail", { skip: WITHOUT_SH }, () => {

  test("le second et les notifications, qui ne lisent pas le rail, lisent la liste du label : la même carte", async (t) => {
    const theWorld = world(t);
    const readEntry = await readWhatAwaitingTheChef({ depot: REPOSITORY, appeler: theWorld.client.lire, maintenant: () => new Date(READ) });
    assert.ok(readEntry.lue, JSON.stringify(readEntry));
    assert.deepEqual(
      readEntry.attentes.map(({ ticket, depuis: since, chef }) => ({ ticket, depuis: since, chef })),
      [{ ticket: 41, depuis: "2026-11-26T08:00:00Z", chef: { sorte: "parked-chef", texte: WHY } }],
    );
    assert.match(readEntry.attentes[0]?.ligne ?? "", /— on its Todo card: Answer, in your own words — the ticket goes back on the rail$/);
    assert.ok(theWorld.lectures.some((path) => path.includes("labels=parked:chef")));
  });


});
