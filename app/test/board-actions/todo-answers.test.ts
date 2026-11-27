// Répondre depuis le TODO du chef envoie le ticket plus loin (#4261) : un bouton d'une entrée du TODO poste la réponse sur
// l'issue, lève ce qui le gardait parked pour le chef, et le ticket reprend à l'étape où il était — sans rien recopier. Joué
// sur un faux GitHub qui tient ses issues, leurs labels, leurs commentaires et ses PR : le TODO lu, posé, cliqué, et relu.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Answer } from "../../src/card-todo.ts";
import { understand, board as boardOf, type Card, type Facts } from "../../src/facts.ts";
import { withWhatAwaitingTheChef } from "../../src/board/wait-of-chef.ts";
import type { AnswerGitHub } from "../../src/board/client.ts";
import { readTheBoardOfRepository } from "../../src/board/read.ts";
import { statusOfBoard } from "../../src/board/rail.ts";
import { answerOnGithub, type ClientOfTheAnswer } from "../../src/board-actions/answer-github.ts";
import { REPOS } from "../../src/vue/card-todo.js";
import { whatAwaitingYou, planOfTheKitchen, setTheTodo } from "../../src/vue/kitchen/kitchen.js";
import { tidyTheRail } from "../../src/vue/todo/todo.js";
import { Fake } from "../helpers/false-vue.ts";

const REPOSITORY = "acme/parade";
const READ = "2026-11-25T09:00:00.000Z";
// #5 est en pass — sa PR #6 est ouverte — et sa carte pose une question au chef ; #7, sur le rail, est mis de côté par la
// station sans PR.
const QUESTION_5 = "<!-- brigade:todo kind=product-question -->\nDoes the export keep the old column order?\n- [resume] Yes, keep the old order\n- [close] No, drop the export";

type Issue = { labels: Set<string>; state: "open" | "closed"; commentaires: { id: number; body: string; author_association: string; created_at: string }[] };

function world() {
  let next = 100;
  const comment = (body: string) => ({ id: next++, body, author_association: "OWNER", created_at: "2026-11-24T02:00:00Z" });
  const issues = new Map<number, Issue>([
    [5, { labels: new Set(["fire", "in-pass", "chef-todo"]), state: "open", commentaires: [comment(QUESTION_5)] }],
    [7, { labels: new Set(["fire", "blocked-on-human"]), state: "open", commentaires: [] }],
  ]);
  const ok = (data: unknown, status = 200): AnswerGitHub => ({ status, data });
  const issueJson = (number: number, issue: Issue) => ({ number: number, title: `Ticket ${number}`, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-20T00:00:00Z", labels: [...issue.labels].map((name) => ({ name })) });
  const pr6 = { number: 6, state: "open", merged: false, html_url: `https://github.com/${REPOSITORY}/pull/6`, created_at: "2026-11-24T00:00:00Z", head: { ref: "cook/5-export" }, body: "Closes #5" };
  const read = async (path: string): Promise<AnswerGitHub> => {
    const label = /[?&]labels=([^&]+)/.exec(path)?.[1];
    if (path.includes("/issues?") && label !== undefined) return ok([...issues].filter(([, issue]) => issue.state === "open" && issue.labels.has(label)).map(([number, issue]) => issueJson(number, issue)));
    if (path.includes("/pulls?")) return ok([pr6]);
    if (/\/pulls\/6$/.test(path)) return ok(pr6);
    const commented = /\/issues\/(\d+)\/comments/.exec(path)?.[1];
    if (commented !== undefined) return ok(issues.get(Number(commented))?.commentaires ?? []);
    if (/\/issues\/\d+\/events/.test(path)) return ok([]);
    // La base, verte : #5 en pass n'est pas « base rouge ».
    if (path === `/repos/${REPOSITORY}`) return ok({ default_branch: "main" });
    if (path.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    return ok({ message: "Not Found" }, 404);
  };
  const write: ClientOfTheAnswer["ecrire"] = async (methode, path, body) => {
    const [, number, remains] = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)(.*)$/.exec(path) ?? [];
    const issue = issues.get(Number(number));
    if (issue === undefined) return ok({ message: "Not Found" }, 404);
    if (methode === "POST" && remains === "/comments") {
      const pose = comment((body as { body: string }).body);
      issue.commentaires.push(pose);
      return ok({ id: pose.id }, 201);
    }
    const label = /^\/labels\/(.+)$/.exec(remains ?? "")?.[1];
    if (methode === "DELETE" && label !== undefined) return issue.labels.delete(decodeURIComponent(label)) ? ok([]) : ok({ message: "Label does not exist" }, 404);
    if (methode === "PATCH" && remains === "") {
      issue.state = (body as { state: "open" | "closed" }).state;
      return ok({});
    }
    return ok({ message: "Not Found" }, 404);
  };
  return { issues, client: { lire: read, ecrire: write } satisfies ClientOfTheAnswer };
}

// Le plan que la vue dessine de la lecture de ce monde : ses colonnes, et le TODO.
async function plan(client: ClientOfTheAnswer) {
  const readOne = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: client.lire, maintenant: () => new Date(READ) }), client.lire);
  assert.ok(readOne.lu, "the board is read");
  const facts = understand(JSON.stringify(readOne.faits));
  assert.ok(!("informe" in facts));
  return planOfTheKitchen(tidyTheRail(boardOf(facts as Facts, undefined, { texte: statusOfBoard(readOne), a: readOne.luLe }).rail.colonnes).colonnes);
}
const columnOf = (thePlan: Awaited<ReturnType<typeof plan>>, ticket: number) => thePlan.find(({ cartes: cards }) => cards.some((card) => card.ticket === ticket))?.nom;

// Un clic sur le bouton `libelle` de l'entrée du TODO de `ticket`, joué sur GitHub comme la vue le joue (repondreSurGithub).
async function click(theWorld: ReturnType<typeof world>, ticket: number, wording: string) {
  const todo = whatAwaitingYou(await plan(theWorld.client));
  const played: { carte: Card; reponse: Answer }[] = [];
  const pose = setTheTodo({ createElement: (balise: string) => new Fake(balise) }, { deplie: { ouvert: true }, cartes: todo, ouvrir: () => {}, gestes: { etat: () => REPOS, attente: [], jouer: (number, _kind, answer) => void played.push({ carte: todo.find((one) => one.ticket === number) as Card, reponse: answer as Answer }) } }) as unknown as Fake;
  const entry = pose.dessous("li").find(({ dataset }) => dataset.ticket === String(ticket)) ?? assert.fail(`#${ticket} is in the TODO`);
  (entry.dessous("button").find(({ textContent }) => textContent === wording) ?? assert.fail(`a button “${wording}”`)).click();
  const [plays] = played;
  assert.ok(plays !== undefined && played.length === 1);
  return answerOnGithub({ depot: REPOSITORY, ticket, chef: plays.carte.chef, reponse: plays.reponse, client: theWorld.client });
}

describe("un bouton du TODO répond, lève ce qui gardait le ticket, et le ticket reprend où il était", () => {
  test("#5, en pass : « Yes, keep the old order » — la réponse sur l'issue, `chef-todo` levé, #5 quitte le TODO et reste dans Pass", async () => {
    const theWorld = world();
    const before = await plan(theWorld.client);
    assert.deepEqual(whatAwaitingYou(before).map(({ ticket }) => ticket).sort(), [5, 7]);
    assert.equal(columnOf(before, 5), "Pass");
    const rendered = await click(theWorld, 5, "Yes, keep the old order");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(theWorld.issues.get(5)?.commentaires.at(-1)?.body, "<!-- brigade:reponse gesture=resume -->\nYes, keep the old order");
    assert.deepEqual([...(theWorld.issues.get(5)?.labels ?? [])], ["fire", "in-pass"]);
    const after = await plan(theWorld.client);
    assert.deepEqual(whatAwaitingYou(after).map(({ ticket }) => ticket), [7]);
    assert.equal(columnOf(after, 5), "Pass");
    assert.equal(after.flatMap(({ cartes: cards }) => cards).find(({ ticket }) => ticket === 5)?.parque, undefined);
  });

  test("#7, mis de côté sur le rail : « Back to the kitchen » — `blocked-on-human` levé, #7 revient prêt sur le rail", async () => {
    const theWorld = world();
    assert.equal(columnOf(await plan(theWorld.client), 7), "Backlog");
    const rendered = await click(theWorld, 7, "Back to the kitchen");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.deepEqual([...(theWorld.issues.get(7)?.labels ?? [])], ["fire"]);
    const after = await plan(theWorld.client);
    assert.deepEqual(whatAwaitingYou(after).map(({ ticket }) => ticket), [5]);
    assert.deepEqual(after.find(({ nom: name }) => name === "Backlog")?.pretes?.map(({ ticket }) => ticket), [7]);
  });

  test("#7 : « Close it » — l'issue fermée, elle quitte le TODO", async () => {
    const theWorld = world();
    const rendered = await click(theWorld, 7, "Close it");
    assert.ok("repondue" in rendered, JSON.stringify(rendered));
    assert.equal(theWorld.issues.get(7)?.state, "closed");
    assert.deepEqual(whatAwaitingYou(await plan(theWorld.client)).map(({ ticket }) => ticket), [5]);
  });
});
