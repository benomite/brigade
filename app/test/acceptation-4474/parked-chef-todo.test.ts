// Le TODO du chef, ce sont les issues `parked:chef` (#4474) : la nouvelle cuisine parque un ticket pour le chef par ce label
// et un commentaire qui dit pourquoi (runtime/src/kitchen/). L'app le lit de GitHub, comme main.ts le branche — le jeton est
// celui que le `gh` du poste dit (`gh auth token`), ici un faux `gh` ; GitHub, un faux qui tient ses issues, leurs labels et
// leurs commentaires, et refuse toute demande sans ce jeton. Le TODO lu, la carte posée, Answer cliqué, joué, puis relu.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Answer } from "../../src/card-todo.ts";
import { understand, board as boardOf, type Facts } from "../../src/facts.ts";
import { clientOfThePriority, type SendGitHub } from "../../src/priority.ts";
import { withWhatAwaitingTheChef, readWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import { clientGitHub, type Send, type AnswerGitHub } from "../../src/board/client.ts";
import { tokenOfGh } from "../../src/board/token-gh.ts";
import { readTheBoardOfRepository } from "../../src/board/read.ts";
import { statusOfBoard } from "../../src/board/rail.ts";
import { answerOnGithub, type ClientOfTheAnswer } from "../../src/board-actions/answer-github.ts";
import { setCardOfTodo, REPOS } from "../../src/vue/card-todo.js";
import { whatAwaitingYou, planOfTheKitchen } from "../../src/vue/kitchen/kitchen.js";
import { tidyTheRail } from "../../src/vue/todo/todo.js";
import { Fake } from "../helpers/false-vue.ts";

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
    if (/\/issues\/\d+\/events/.test(path) || path.includes("/pulls?")) return ok([]);
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main", permissions: { push: true } });
    if (path.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    return ok({ message: "Not Found" }, 404);
  };
  // Les écritures de l'app sur une issue : son commentaire, le retrait d'un label.
  const write: SendGitHub = async (methode, address, headers, body) => {
    if (withoutToken(headers)) return ok({ message: "Requires authentication" }, 401);
    const path = address.replace("https://api.github.com", "");
    writtenOnes.push({ methode, chemin: path, ...(body === undefined ? {} : { corps: body }) });
    const [, number, remains] = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)(.*)$/.exec(path) ?? [];
    const issue = issues.get(Number(number));
    if (issue === undefined) return ok({ message: "Not Found" }, 404);
    if (methode === "POST" && remains === "/comments") {
      const pose = comment((body as { body: string }).body, "OWNER", READ);
      issue.commentaires.push(pose);
      return ok({ id: pose.id }, 201);
    }
    const label = /^\/labels\/(.+)$/.exec(remains ?? "")?.[1];
    if (methode === "DELETE" && label !== undefined) return issue.labels.delete(decodeURIComponent(label)) ? ok([]) : ok({ message: "Label does not exist" }, 404);
    return ok({ message: "Not Found" }, 404);
  };
  // Branché comme main.ts : le jeton du `gh` du poste, le `GET` du rail, les écritures des labels.
  const token = tokenOfGh({ gh: fake(t), delaiMs: 60_000 });
  const call = clientGitHub({ jeton: token, envoyer: read });
  const client: ClientOfTheAnswer = clientOfThePriority({ jeton: token, appeler: call, envoyer: write });
  return { issues, lectures: readings, ecrits: writtenOnes, client };
}

// Le TODO que la vue dessine de la lecture de ce monde, comme l'app la fait (main.ts, `lireLeTableau`).
async function theTodo(client: ClientOfTheAnswer) {
  const readOne = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: client.lire, maintenant: () => new Date(READ) }), client.lire);
  assert.ok(readOne.lu, JSON.stringify(readOne));
  const facts = understand(JSON.stringify(readOne.faits));
  assert.ok(!("informe" in facts));
  return whatAwaitingYou(planOfTheKitchen(tidyTheRail(boardOf(facts as Facts, undefined, { texte: statusOfBoard(readOne), a: readOne.luLe }).rail.colonnes).colonnes));
}

describe("#4474 : une issue `parked:chef` est une carte du TODO, et Answer la rend au rail", { skip: WITHOUT_SH }, () => {
  test("la carte : la raison de la cuisine, Answer et « Open on GitHub » — Answer poste le texte du chef et retire `parked:chef`", async (t) => {
    const theWorld = world(t);
    const todo = await theTodo(theWorld.client);
    assert.deepEqual(todo.map(({ ticket }) => ticket), [41]);
    const [card] = todo;
    assert.ok(card?.todo !== undefined && card.chef !== undefined, "#41 carries its TODO card");
    // Le dernier commentaire de la cuisine qui dit pourquoi — pas celui d'un inconnu écrit après, avec les mêmes mots.
    assert.equal(card.todo.question, WHY);
    assert.equal(card.todo.repondre, "Answer");
    assert.deepEqual(card.todo.choix, []);
    // Rien n'est lu du runtime d'avant, ni la liste du label : la lecture du rail a déjà toutes les issues ouvertes.
    assert.ok(!theWorld.lectures.some((path) => /labels=parked(:|%3A)chef/.test(path)), theWorld.lectures.join("\n"));

    // La carte posée comme la vue la pose : la réponse tapée, Answer cliqué ; « Open on GitHub » ouvre son issue.
    const answeredEntries: Answer[] = [];
    let openOne = 0;
    const setOne = setCardOfTodo({ createElement: (balise: string) => new Fake(balise) }, 41, card.todo, REPOS, { captures: [], brouillon: ANSWER, cle: "parade#41" }, { repondre: (answer) => void answeredEntries.push(answer), ecrire: () => {}, demander: () => {}, ouvrir: () => void (openOne += 1) });
    const root = setOne[0] as unknown as Fake;
    const button = (wording: string) => root.dessous("button").find(({ textContent }) => textContent === wording) ?? assert.fail(`a button “${wording}”`);
    button("Open on GitHub").click();
    assert.equal(openOne, 1);
    button("Answer").click();
    assert.deepEqual(answeredEntries, [{ question: WHY, texte: ANSWER }]);

    // Answer, joué sur GitHub par le jeton du chef : le commentaire, puis `parked:chef` retiré — et rien d'autre.
    const rendered = await answerOnGithub({ depot: REPOSITORY, ticket: 41, chef: card.chef, reponse: answeredEntries[0], client: theWorld.client });
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.deepEqual(
      theWorld.ecrits.map(({ methode, chemin: path }) => `${methode} ${path}`),
      [`POST /repos/${REPOSITORY}/issues/41/comments`, `DELETE /repos/${REPOSITORY}/issues/41/labels/parked%3Achef`],
    );
    assert.equal(theWorld.issues.get(41)?.commentaires.at(-1)?.body, `<!-- brigade:reponse gesture=resume -->\n${ANSWER}`);
    assert.deepEqual([...(theWorld.issues.get(41)?.labels ?? [])], ["fire", "model:sonnet", "effort:medium"]);

    // Relu : #41 n'attend plus le chef — il est de retour sur le rail.
    assert.deepEqual(await theTodo(theWorld.client), []);
  });

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

  test("le label posé à la main, sans commentaire de la cuisine : la carte est là quand même, et le dit", async (t) => {
    const theWorld = world(t, { commentaires41: [] });
    const [card] = await theTodo(theWorld.client);
    assert.equal(card?.ticket, 41);
    assert.equal(card?.todo?.question, "Parked for the chef, with no kitchen comment that says why: read the issue, then answer.");
  });
});
